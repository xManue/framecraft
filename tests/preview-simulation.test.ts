// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
import { parseHmiDynamizations } from "../src/core/hmiDynamizations";
import { simulationCommands } from "../src/core/plcSimulation";

/** Il giro completo della simulazione: l'anteprima dice quali oggetti hanno una dinamizzazione,
 * l'editor calcola cosa diventano, l'anteprima glielo mette addosso — e quando si spegne, tutto
 * torna esattamente com'era. Quest'ultima e' la parte che conta: sul canvas c'e' il progetto vero,
 * e una simulazione che lascia tracce lo falsifica. */
function bridge() {
  class ResizeObserverStub { observe() {} disconnect() {} }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const messages: { type: string; items?: { instanceId: string; raw: string }[]; instanceId?: string; eventType?: string; eventName?: string; raw?: string; gesture?: string; parameters?: Record<string, unknown>; popupId?: string }[] = [];
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: (message: never) => messages.push(message) },
  });
  const plugin = framecraftPlugin();
  window.eval(plugin.transformIndexHtml("<div id=\"root\"></div>").tags[0].children);
  return messages;
}

const send = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data }));
const touchPointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: "touch" }, pointerId: { value: 7 }, isPrimary: { value: true } });
  return event;
};

describe("la simulazione degli stati PLC nell'anteprima", () => {
  it("raccoglie gli oggetti dinamizzati, li anima e li rimette com'erano", () => {
    document.body.innerHTML = "";
    const pack = document.createElement("div");
    pack.setAttribute("data-hmi-dynamizations", JSON.stringify([
      { property: "Left", kind: "Tag", tag: "Pack1.Pos_X", conditionType: "None" },
      { property: "Width", kind: "Tag", tag: "Pack1.Size_X", conditionType: "None" },
    ]));
    pack.style.cssText = "position: absolute; left: 10px; width: 20px;";
    const fermo = document.createElement("div");
    fermo.style.cssText = "left: 4px;";
    document.body.append(pack, fermo);

    const messages = bridge();
    send({ type: "framecraft:collect-dynamizations" });

    const collected = messages.find((message) => message.type === "framecraft:dynamizations");
    expect(collected?.items).toHaveLength(1);
    const [item] = collected!.items!;

    // Il conto lo fa l'editor, con le regole dello standard: qui si controlla il giro intero.
    const { commands } = simulationCommands(
      [{ instanceId: item.instanceId, dynamizations: parseHmiDynamizations(item.raw) }],
      { "Pack1.Pos_X": "240", "Pack1.Size_X": "48" },
    );
    send({ type: "framecraft:simulate", on: true, commands });

    expect(pack.style.left).toBe("240px");
    expect(pack.style.width).toBe("48px");
    // Un elemento senza dinamizzazioni non viene toccato nemmeno di striscio.
    expect(fermo.style.left).toBe("4px");

    send({ type: "framecraft:simulate", on: false });
    expect(pack.style.left).toBe("10px");
    expect(pack.style.width).toBe("20px");
  });

  it("scrive il testo solo dove dentro non c'e' altro, e lo rimette", () => {
    document.body.innerHTML = "";
    const campo = document.createElement("span");
    campo.setAttribute("data-hmi-dynamizations", JSON.stringify([
      { property: "ProcessValue", kind: "Tag", tag: "Speed", conditionType: "None" },
    ]));
    campo.textContent = "0";
    const composto = document.createElement("div");
    composto.setAttribute("data-hmi-dynamizations", JSON.stringify([
      { property: "Text", kind: "Tag", tag: "Speed", conditionType: "None" },
    ]));
    composto.innerHTML = "<strong>Velocita</strong><span>0</span>";
    document.body.append(campo, composto);

    const messages = bridge();
    send({ type: "framecraft:collect-dynamizations" });
    const items = messages.find((message) => message.type === "framecraft:dynamizations")!.items!;
    const { commands } = simulationCommands(
      items.map((entry) => ({ instanceId: entry.instanceId, dynamizations: parseHmiDynamizations(entry.raw) })),
      { Speed: "1450" },
    );
    send({ type: "framecraft:simulate", on: true, commands });

    expect(campo.textContent).toBe("1450");
    // Il secondo ha dei figli: cambiargli il testo vorrebbe dire cancellarli, quindi resta com'e'.
    expect(composto.querySelector("strong")).not.toBeNull();
    expect(composto.textContent).toBe("Velocita0");

    send({ type: "framecraft:simulate", on: false });
    expect(campo.textContent).toBe("0");
  });

  it("applica e ripristina le grafiche scelte da una lista risorse", () => {
    document.body.innerHTML = "";
    const image = document.createElement("img");
    image.src = "/motor-off.svg";
    image.setAttribute("data-hmi-dynamizations", JSON.stringify([{ property: "Graphic", kind: "ResourceList", source: "MotorIcon", tag: "Motor.Running" }]));
    document.body.append(image);
    const messages = bridge();
    send({ type: "framecraft:collect-dynamizations" });
    const [item] = messages.find((message) => message.type === "framecraft:dynamizations")!.items!;
    send({ type: "framecraft:simulate", on: true, commands: [{ instanceId: item.instanceId, style: {}, graphic: "/motor-on.svg" }] });
    expect(image.getAttribute("src")).toBe("/motor-on.svg");
    send({ type: "framecraft:simulate", on: false });
    expect(image.getAttribute("src")).toBe("/motor-off.svg");
  });

  it("applica il lampeggio calcolato dall'editor e ripristina anche le variabili CSS", () => {
    document.body.innerHTML = "";
    const lamp = document.createElement("div");
    lamp.style.animation = "pulse 3s infinite";
    lamp.style.setProperty("--framecraft-hmi-flash-background-color", "#123456");
    lamp.setAttribute("data-hmi-dynamizations", JSON.stringify([{
      property: "BackColor", kind: "Flashing", color: "#FFFF0000", alternateColor: "#FF000000", flashingCondition: "Always", flashingRate: "Fast",
    }]));
    document.body.append(lamp);
    const messages = bridge();
    send({ type: "framecraft:collect-dynamizations" });
    const [item] = messages.find((message) => message.type === "framecraft:dynamizations")!.items!;
    const { commands } = simulationCommands([{ instanceId: item.instanceId, dynamizations: parseHmiDynamizations(item.raw) }], {});
    send({ type: "framecraft:simulate", on: true, commands });
    expect(lamp.style.animation).toContain("framecraft-hmi-flash-background 500ms");
    expect(lamp.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("#FF0000");
    expect(document.head.querySelector("style[data-framecraft-hmi-flashing]")?.textContent).toContain("prefers-reduced-motion");

    send({ type: "framecraft:simulate", on: false });
    expect(lamp.style.animation).toBe("pulse 3s infinite");
    expect(lamp.style.getPropertyValue("--framecraft-hmi-flash-background-color")).toBe("#123456");
  });

  it("cambia i testi statici quando cambia la lingua Runtime e conserva il fallback JSX", () => {
    document.body.innerHTML = "";
    const title = document.createElement("h1");
    title.setAttribute("data-hmi-text", "Page.Title");
    title.textContent = "Titolo sorgente";
    const missing = document.createElement("span");
    missing.setAttribute("data-hmi-text", "Missing");
    missing.textContent = "Fallback";
    document.body.append(title, missing);
    bridge();

    send({ type: "framecraft:set-language", language: "en-US", translations: { "Page.Title": "Settings" } });
    expect(title.textContent).toBe("Settings");
    expect(missing.textContent).toBe("Fallback");
    send({ type: "framecraft:set-language", language: "it-IT", translations: { "Page.Title": "Impostazioni" } });
    expect(title.textContent).toBe("Impostazioni");
  });

  it("manda gli eventi configurati all'editor e applica il cambio pagina restituito", () => {
    document.body.innerHTML = "";
    const button = document.createElement("button");
    button.setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'HMIRuntime.UI.SysFct.ChangeScreen("/settings")' }]));
    document.body.append(button);
    const messages = bridge();
    send({ type: "framecraft:set-mode", mode: "navigate" });
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(messages.find((message) => message.type === "framecraft:hmi-event")).toMatchObject({ eventType: "Tapped" });

    let target = "";
    window.addEventListener("framecraft:navigate", (event) => { target = (event as CustomEvent<string>).detail; }, { once: true });
    send({ type: "framecraft:hmi-event-result", navigation: ["/settings"] });
    expect(target).toBe("/settings");
    expect((window as Window & { __framecraftEditorPreview?: boolean }).__framecraftEditorPreview).toBe(true);
  });

  it("inoltra un evento emesso dentro il faceplate al binding dell'istanza", () => {
    document.body.innerHTML = "";
    const faceplate = document.createElement("div");
    faceplate.setAttribute("data-hmi-faceplate", JSON.stringify({ typeId: "motor", version: "1.0.0", eventBindings: { MotorSelected: { script: "HMIRuntime.Trace(index);" } } }));
    const internalButton = document.createElement("button");
    internalButton.setAttribute("data-hmi-events", JSON.stringify([{ event: "Tapped", script: 'Faceplate.RaiseEvent("MotorSelected", { index: 3 });' }]));
    faceplate.append(internalButton);
    document.body.append(faceplate);
    const messages = bridge();
    send({ type: "framecraft:set-mode", mode: "navigate" });
    internalButton.click();
    const source = messages.find((message) => message.type === "framecraft:hmi-event")!;
    send({ type: "framecraft:hmi-event-result", instanceId: source.instanceId, navigation: [], faceplateEvents: [{ name: "MotorSelected", parameters: { index: 3 } }] });
    expect(messages.find((message) => message.type === "framecraft:faceplate-event")).toMatchObject({ eventName: "MotorSelected", parameters: { index: 3 } });
  });

  it("mostra, aggiorna e chiude una finestra faceplate WinCC", () => {
    document.body.innerHTML = "";
    const messages = bridge();
    const state = {
      popupId: "faceplate-popup-1", scope: "screen", faceplateType: "Motor_V_1_0_0", title: "Motore M2400",
      interfaceValues: { Speed: { Tag: "Motor.Speed" }, Enabled: true }, parentBound: true, invisible: false,
      popupWindowName: "MotorPopup", adaptWindow: false, left: 20, top: 30, width: 400, height: 260,
      visible: true, windowFlags: 83,
    };
    send({ type: "framecraft:popup-open", state });
    const popup = document.querySelector<HTMLElement>('[data-framecraft-popup-id="faceplate-popup-1"]')!;
    expect(popup).not.toBeNull();
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.getAttribute("data-hmi-type")).toBe("HmiFaceplatePopup");
    expect(popup.style.left).toBe("20px");
    expect(popup.style.width).toBe("400px");
    expect(popup.textContent).toContain("Motore M2400");
    expect(popup.textContent).toContain("Tag: Motor.Speed");
    const faceplate = popup.querySelector<HTMLElement>('[data-hmi-popup-faceplate-type="Motor_V_1_0_0"]')!;
    expect(faceplate).not.toBeNull();
    expect(JSON.parse(faceplate.dataset.hmiPopupInterface ?? "{}")).toEqual(state.interfaceValues);

    send({ type: "framecraft:popup-update", state: { ...state, left: 100, visible: false } });
    expect(popup.style.left).toBe("100px");
    expect(popup.style.display).toBe("none");
    send({ type: "framecraft:popup-update", state: { ...state, left: 100, visible: true } });
    popup.querySelector<HTMLButtonElement>('button[aria-label="Chiudi popup"]')!.click();
    expect(messages.find((message) => message.type === "framecraft:popup-user-close")).toMatchObject({ popupId: "faceplate-popup-1" });
    send({ type: "framecraft:popup-close", state });
    expect(document.querySelector('[data-framecraft-popup-id="faceplate-popup-1"]')).toBeNull();
  });

  it("riconosce uno swipe touch, emette GestureDetected e usa la destinazione WinCC", () => {
    document.body.innerHTML = "";
    const area = document.createElement("div");
    area.setAttribute("data-hmi-swipe-left", "1041_Counters");
    area.setAttribute("data-hmi-events", JSON.stringify([{ event: "GestureDetected", script: "" }]));
    document.body.append(area);
    const open = vi.fn();
    (window as Window & { __framecraftSetPage?: (target: string) => void }).__framecraftSetPage = open;
    const messages = bridge();
    send({ type: "framecraft:set-mode", mode: "navigate" });
    area.dispatchEvent(touchPointer("pointerdown", 160, 50));
    area.dispatchEvent(touchPointer("pointerup", 60, 55));
    expect(messages.find((message) => message.type === "framecraft:hmi-event" && message.eventType === "GestureDetected")).toMatchObject({ gesture: "SwipeLeft" });
    expect(open).toHaveBeenCalledWith("1041_Counters");
    delete (window as Window & { __framecraftSetPage?: unknown }).__framecraftSetPage;
  });

  it("rimette a posto quello che esce dalla simulazione quando cambia un valore", () => {
    document.body.innerHTML = "";
    const lampada = document.createElement("div");
    lampada.setAttribute("data-hmi-dynamizations", JSON.stringify([
      { property: "Visible", kind: "Tag", tag: "Allarme", conditionType: "None" },
    ]));
    lampada.style.cssText = "visibility: visible;";
    document.body.append(lampada);

    const messages = bridge();
    send({ type: "framecraft:collect-dynamizations" });
    const [item] = messages.find((message) => message.type === "framecraft:dynamizations")!.items!;
    const elements = [{ instanceId: item.instanceId, dynamizations: parseHmiDynamizations(item.raw) }];

    send({ type: "framecraft:simulate", on: true, commands: simulationCommands(elements, { Allarme: "0" }).commands });
    expect(lampada.style.visibility).toBe("hidden");

    // Cancellato il valore di prova non c'e' piu' niente da dire su quell'oggetto: torna com'era,
    // senza bisogno di spegnere la simulazione.
    send({ type: "framecraft:simulate", on: true, commands: simulationCommands(elements, {}).commands });
    expect(lampada.style.visibility).toBe("visible");
  });
  it("si riaccorge della pagina cambiata, ma non a ogni stile che mette lei", async () => {
    document.body.innerHTML = "";
    const lampada = document.createElement("div");
    const dinamica = (tag: string) => JSON.stringify([{ property: "Visible", kind: "Tag", tag, conditionType: "None" }]);
    lampada.setAttribute("data-hmi-dynamizations", dinamica("Allarme"));
    document.body.append(lampada);

    const messages = bridge();
    send({ type: "framecraft:collect-dynamizations" });
    const [item] = messages.find((message) => message.type === "framecraft:dynamizations")!.items!;
    const elements = [{ instanceId: item.instanceId, dynamizations: parseHmiDynamizations(item.raw) }];
    send({ type: "framecraft:simulate", on: true, commands: simulationCommands(elements, { Allarme: "0" }).commands });

    const dopoLaSimulazione = messages.filter((message) => message.type === "framecraft:dynamizations").length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Lo stile l'ha messo lei: la lista degli oggetti dinamizzati non e' cambiata, e non si rimbalza.
    expect(messages.filter((message) => message.type === "framecraft:dynamizations")).toHaveLength(dopoLaSimulazione);

    // Qui invece la pagina e' un'altra: l'ispettore ha cambiato il tag e l'HMR l'ha rimessa in piedi
    // senza ricaricare, quindi nessuno ha detto "pronto".
    lampada.setAttribute("data-hmi-dynamizations", dinamica("Allarme_2"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dopoIlCambio = messages.filter((message) => message.type === "framecraft:dynamizations");
    expect(dopoIlCambio.length).toBeGreaterThan(dopoLaSimulazione);
    expect(dopoIlCambio.at(-1)?.items?.[0].raw).toContain("Allarme_2");
  });
});
