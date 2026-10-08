// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readConnectionConfiguration: vi.fn(), saveConnectionConfiguration: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() } }));
import { PlcConnectionsDialog } from "../src/editor/PlcConnectionsDialog";
import { TopBar } from "../src/editor/TopBar";
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { useEditorStore } from "../src/state/editorStore";
import { defaultConnectionCatalog, newMqttConnection, type ConnectionConfigurationSnapshot } from "../src/core/plcConnections";

const project = { root: "C:/panel", name: "PLC test", framework: "vite" as const, language: "typescript" as const, packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] };
const variables = [{ name: "Motor.Speed", dataType: "Real", access: "read-write", address: "DB.Speed", description: "" }, { name: "Motor.State", dataType: "UDT", access: "read", address: "", description: "" }];
function fixture(): ConnectionConfigurationSnapshot {
  return { generation: 3, files: { connections: JSON.stringify({ ...defaultConnectionCatalog(), custom: "keep", connections: [{ ...newMqttConnection([]), url: "mqtts://broker.invalid", bindings: [{ tag: "Motor.Speed", topic: "speed", valuePath: "/value" }] }] }), runtime: JSON.stringify({ version: 1, custom: "keep", gateway: { enabled: false, path: "/_framecraft/plc/v1", pollMs: 250 } }), plc: JSON.stringify({ version: 1, variables }) } };
}
let root: Root, host: HTMLElement; const close = vi.fn();
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text)!;
const input = (path: string) => [...document.querySelectorAll<HTMLInputElement>("[data-field]")].find((element) => element.dataset.field === path)!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function change(path: string, value: string) {
  const element = input(path); expect(element).toBeTruthy();
  await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function mount(component = createElement(PlcConnectionsDialog, { onClose: close })) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(component)); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  useEditorStore.setState({ project, loading: false, dirty: false, document: undefined, previewRestarting: false, previewUrl: "http://127.0.0.1:4173", consoleEntries: [], history: [], future: [], multiSelection: [] });
  vi.mocked(desktopBridge.readConnectionConfiguration).mockResolvedValue(fixture());
  vi.mocked(desktopBridge.saveConnectionConfiguration).mockImplementation(async (_root, expected, next) => ({ generation: expected.generation, files: { ...expected.files, ...next } }));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.restoreAllMocks(); });

describe("Connessioni PLC: interfaccia e persistenza reali", () => {
  it("apre la mini guida senza salvare o avviare rete ed è accessibile anche se il catalogo è in errore", async () => {
    const data = fixture(); data.files.connections = '{"password":"NEVER_RENDER_SECRET';
    vi.mocked(desktopBridge.readConnectionConfiguration).mockResolvedValue(data); await mount();
    const help = button("Guida rapida"), guide = document.getElementById(help.getAttribute("aria-controls")!) as HTMLDetailsElement;
    expect(guide.open).toBe(false); await click(help); expect(guide.open).toBe(true); expect(document.activeElement).toBe(guide.querySelector("summary"));
    expect(guide.textContent).toContain("OPC UA scalare"); expect(guide.textContent).toContain("Non ripeterlo alla cieca");
    expect(guide.textContent).toContain(".framecraft-runtime/logs"); expect(document.body.textContent).not.toContain("NEVER_RENDER_SECRET");
    expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled(); expect(desktopBridge.writeFile).not.toHaveBeenCalled();
  });
  it("si apre solo dal menu Pannello mantenendo il canvas e non avviando la rete", async () => {
    const restart = vi.spyOn(useEditorStore.getState(), "restartPreview").mockResolvedValue(undefined);
    const preview = vi.spyOn(useEditorStore.getState(), "openStandalonePreview").mockResolvedValue(undefined);
    await mount(createElement(TopBar)); expect(document.querySelector('[role="dialog"]')).toBeNull();
    const menu = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Pannello")!;
    await click(menu); const entry = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.includes("Connessioni PLC"))!;
    await click(entry); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Broker, server OPC UA e tag"); expect(restart).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
    expect(desktopBridge.readConnectionConfiguration).toHaveBeenCalledExactlyOnceWith(project.root); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
  });
  it("ha controlli etichettati, default disabilitati e tag non supportati chiaramente esclusi", async () => {
    await mount(); expect(button("Salva configurazione").disabled).toBe(true);
    expect(input("gateway.enabled").checked).toBe(false); expect(input("runtime.gateway.enabled").checked).toBe(false); expect(input("connections.0.allowWrites").checked).toBe(false);
    const selector = input("connections.0.bindings.0.tag") as unknown as HTMLSelectElement;
    expect([...selector.options].find((o) => o.value === "Motor.State")?.disabled).toBe(true);
    for (const control of document.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"]), select')) { expect(document.querySelector(`label[for="${control.id}"]`)).not.toBeNull(); }
  });
  it("salva entrambi i JSON, tipo e accesso del tag restano nel catalogo originale", async () => {
    await mount(); await change("connections.0.id", "machine-main");
    await change("connections.0.bindings.0.qualityPath", "/quality"); await change("connections.0.bindings.0.timestampPath", "/time"); await change("connections.0.bindings.0.timestampUnit", "s");
    await change("connections.0.passwordEnv", "PLC_PASSWORD"); await change("connections.0.bindings.0.writeTopic", "command");
    await click(input("gateway.enabled")); await click(input("connections.0.enabled")); await click(input("runtime.gateway.enabled"));
    await click(input("gateway.allowWrites")); await click(input("connections.0.allowWrites"));
    expect(button("Salva configurazione").disabled).toBe(false); await click(button("Salva configurazione"));
    const [actualRoot, expected, next] = vi.mocked(desktopBridge.saveConnectionConfiguration).mock.calls[0];
    expect(actualRoot).toBe(project.root); expect(expected).toEqual(fixture());
    const catalog = JSON.parse(next.connections), runtime = JSON.parse(next.runtime);
    expect(catalog.custom).toBe("keep"); expect(runtime.custom).toBe("keep"); expect(catalog.connections[0]).toMatchObject({ id: "machine-main", passwordEnv: "PLC_PASSWORD", enabled: true, allowWrites: true });
    expect(catalog.connections[0].bindings[0]).toMatchObject({ tag: "Motor.Speed", qualityPath: "/quality", timestampPath: "/time", timestampUnit: "s", writeTopic: "command" });
    expect(runtime.gateway.enabled).toBe(true); expect(document.body.textContent).toContain("Nessun collegamento o comando è stato avviato"); expect(button("Salva configurazione").disabled).toBe(true);
    expect(desktopBridge.writeFile).not.toHaveBeenCalled();
  });
  it("aggiunge una connessione e un tag dal catalogo, senza broker o indirizzi inventati", async () => {
    await mount(); await click(button("Aggiungi MQTT")); expect(input("connections.1.url").value).toBe(""); expect(input("connections.1.enabled").checked).toBe(false);
    expect(button("Salva configurazione").disabled).toBe(true); await change("connections.1.url", "mqtts://other.invalid"); await click(button("Associa tag"));
    expect(input("connections.1.bindings.0.tag").value).toBe("Motor.Speed"); expect(input("connections.1.bindings.0.topic").value).toBe("");
    await change("connections.1.bindings.0.topic", "actual/topic"); expect(button("Salva configurazione").disabled).toBe(false);
  });
  it("aggiunge OPC UA offline con consensi separati e mantiene MQTT inalterato", async () => {
    await mount(); await click(button("Aggiungi OPC UA"));
    expect(input("connections.1.url").value).toBe(""); expect(input("connections.1.securityMode").value).toBe("SignAndEncrypt");
    expect(input("connections.1.enabled").checked).toBe(false); expect(input("connections.1.allowWrites").checked).toBe(false);
    await change("connections.1.url", "opc.tcp://server.invalid:4840"); await change("connections.1.securityMode", "None");
    expect(button("Salva configurazione").disabled).toBe(true); await click(input("connections.1.allowInsecure")); await click(button("Associa tag"));
    expect(input("connections.1.bindings.0.writeEnabled").checked).toBe(false);
    await change("connections.1.bindings.0.namespaceUri", "urn:synthetic"); await change("connections.1.bindings.0.nodeId", "s=Speed");
    await click(button("Salva configurazione"));
    const catalog = JSON.parse(vi.mocked(desktopBridge.saveConnectionConfiguration).mock.calls[0][2].connections);
    expect(catalog.connections[0].protocol).toBe("mqtt"); expect(catalog.connections[0].bindings[0].topic).toBe("speed");
    expect(catalog.connections[1]).toMatchObject({ protocol: "opcua", enabled: false, allowWrites: false, securityMode: "None", allowInsecure: true });
  });
  it("gli errori OPC UA aprono il mapping paginato e la ricerca catalogo non nasconde la riga", async () => {
    const data = fixture(), tags = Array.from({ length: 120 }, (_, i) => ({ ...variables[0], name: "Tag" + i }));
    const raw = JSON.parse(data.files.connections!); raw.connections = [{ id: "opcua", protocol: "opcua", enabled: false, url: "opc.tcp://server.invalid:4840", securityMode: "None", securityPolicy: "None", allowInsecure: true,
      bindings: tags.slice(0, 25).map((v) => ({ tag: v.name, namespaceUri: "urn:synthetic", nodeId: "s=" + v.name })) }];
    raw.connections[0].bindings[15].nodeId = "ns=2;s=wrong"; data.files.connections = JSON.stringify(raw); data.files.plc = JSON.stringify({ version: 1, variables: tags });
    vi.mocked(desktopBridge.readConnectionConfiguration).mockResolvedValue(data); await mount();
    expect(document.querySelectorAll(".connection-binding")).toHaveLength(10);
    await click(document.querySelector<HTMLButtonElement>(".connection-error-banner button")!);
    expect(document.activeElement).toBe(input("connections.0.bindings.15.nodeId"));
    await change("opcua-catalog-search", "Tag119");
    expect(document.querySelector('[data-field="connections.0.bindings.15.nodeId"]')).not.toBeNull();
    expect([...document.querySelectorAll<HTMLOptionElement>("option")].some((o) => o.value === "Tag119")).toBe(true);
  });
  it("scegliere testo scalare toglie i percorsi JSON dal solo draft e non inventa qualità", async () => {
    await mount(); await change("connections.0.bindings.0.qualityPath", "/quality"); await change("connections.0.bindings.0.timestampPath", "/time");
    await change("connections.0.bindings.0.encoding", "text"); expect(input("connections.0.bindings.0.valuePath").value).toBe(""); expect(input("connections.0.bindings.0.qualityPath").value).toBe("");
    expect(input("connections.0.bindings.0.timestampPath").value).toBe(""); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
    await click(button("Salva configurazione")); const binding = JSON.parse(vi.mocked(desktopBridge.saveConnectionConfiguration).mock.calls[0][2].connections).connections[0].bindings[0];
    expect(binding).toMatchObject({ encoding: "text" }); expect(binding.valuePath).toBeUndefined(); expect(binding.qualityPath).toBeUndefined(); expect(binding.timestampPath).toBeUndefined();
  });
  it("wildcard e variabili VITE impediscono la scrittura e gli errori portano al campo", async () => {
    await mount(); await change("connections.0.passwordEnv", "VITE_PASSWORD"); expect(button("Salva configurazione").disabled).toBe(true); expect(input("connections.0.passwordEnv").getAttribute("aria-invalid")).toBe("true");
    const errorButton = [...document.querySelectorAll<HTMLButtonElement>(".connection-error-banner button")].find((b) => b.textContent?.includes("VITE_*"))!; await click(errorButton);
    expect(input("connections.0.passwordEnv").closest("details")?.open).toBe(true); expect(document.activeElement).toBe(input("connections.0.passwordEnv"));
    await change("connections.0.passwordEnv", "PLC_PASSWORD"); await change("connections.0.bindings.0.topic", "wrong/+"); expect(button("Salva configurazione").disabled).toBe(true); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
  });
  it("Escape conferma lo scarto; durante la conferma Ctrl S non salva", async () => {
    await mount(); await change("connections.0.id", "changed");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull(); expect(close).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled(); await click(button("Scarta modifiche")); expect(close).toHaveBeenCalledOnce();
  });
  it("Ctrl S salva il draft locale e non il documento JSX aperto", async () => {
    const saveSource = vi.spyOn(useEditorStore.getState(), "save").mockResolvedValue(undefined);
    await mount(); await change("connections.0.id", "changed");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(desktopBridge.saveConnectionConfiguration).toHaveBeenCalledOnce(); expect(saveSource).not.toHaveBeenCalled();
  });
  it("i conflitti preservano il draft, ricaricare richiede lo scarto esplicito", async () => {
    vi.mocked(desktopBridge.saveConnectionConfiguration).mockRejectedValue(new Error("I cataloghi sono cambiati sul disco."));
    await mount(); await change("connections.0.id", "unsaved"); await click(button("Salva configurazione"));
    expect(document.body.textContent).toContain("cambiati sul disco"); expect(input("connections.0.id").value).toBe("unsaved");
    await click(button("Ricarica")); expect(document.querySelector('[role="alertdialog"]')).not.toBeNull(); expect(desktopBridge.readConnectionConfiguration).toHaveBeenCalledOnce();
    await click(button("Scarta modifiche")); expect(desktopBridge.readConnectionConfiguration).toHaveBeenCalledTimes(2); expect(input("connections.0.id").value).toBe("mqtt-1");
  });
  it.each(["syntax", "secret", "read-error"])("gli errori non diventano un catalogo vuoto né espongono segreti: %s", async (mode) => {
    const data = fixture();
    if (mode === "syntax") data.files.connections = '{"password":"NEVER_RENDER_SECRET';
    if (mode === "secret") { const raw = JSON.parse(data.files.connections!); raw.connections[0].password = "NEVER_RENDER_SECRET"; data.files.connections = JSON.stringify(raw); }
    if (mode === "read-error") vi.mocked(desktopBridge.readConnectionConfiguration).mockRejectedValue(new Error("Accesso negato.")); else vi.mocked(desktopBridge.readConnectionConfiguration).mockResolvedValue(data);
    await mount(); expect(document.querySelector('[role="alert"]')).not.toBeNull(); expect(document.body.textContent).not.toContain("NEVER_RENDER_SECRET"); expect(button("Salva configurazione").disabled).toBe(true); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
  });
  it("ignora una lettura tardiva se cambia progetto, anche nella stessa cartella", async () => {
    let resolve!: (value: ConnectionConfigurationSnapshot) => void;
    vi.mocked(desktopBridge.readConnectionConfiguration).mockReturnValue(new Promise((done) => { resolve = done; }));
    await mount(); await act(async () => useEditorStore.setState({ project: { ...project } })); expect(close).toHaveBeenCalledOnce();
    await act(async () => resolve(fixture())); expect(document.querySelector('[data-field="connections.0.id"]')).toBeNull(); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
  });
  it("una ricevuta tardiva non appare nel nuovo progetto e il draft non va in recovery", async () => {
    let resolve!: (value: ConnectionConfigurationSnapshot) => void;
    vi.mocked(desktopBridge.saveConnectionConfiguration).mockReturnValue(new Promise((done) => { resolve = done; }));
    await mount(); await change("connections.0.id", "unsaved"); await click(button("Salva configurazione"));
    expect(button("Salva configurazione").disabled).toBe(true); expect(document.querySelector<HTMLButtonElement>("[data-close-connections]")?.disabled).toBe(true);
    await act(async () => useEditorStore.setState({ project: { ...project, root: "C:/other" } })); await act(async () => resolve(fixture()));
    expect(close).toHaveBeenCalledOnce(); expect(document.body.textContent).not.toContain("Configurazione salvata");
    expect(JSON.stringify(useEditorStore.getState())).not.toContain("mqtts://broker.invalid");
  });
  it("i cataloghi grandi paginano i mapping, limitano i tag e gli errori aprono la pagina corretta", async () => {
    const data = fixture(); const tags = Array.from({ length: 120 }, (_, i) => ({ ...variables[0], name: "Tag" + i }));
    const raw = JSON.parse(data.files.connections!); raw.connections[0].bindings = tags.slice(0, 25).map((v) => ({ tag: v.name, topic: "actual/" + v.name }));
    raw.connections[0].bindings[15].topic = "invalid/+"; data.files.connections = JSON.stringify(raw); data.files.plc = JSON.stringify({ version: 1, variables: tags });
    vi.mocked(desktopBridge.readConnectionConfiguration).mockResolvedValue(data); await mount();
    expect(document.querySelectorAll(".connection-binding")).toHaveLength(10); expect((input("connections.0.bindings.0.tag") as unknown as HTMLSelectElement).options.length).toBeLessThanOrEqual(102);
    const error = document.querySelector<HTMLButtonElement>(".connection-error-banner button")!; await click(error);
    expect(document.querySelector('[data-field="connections.0.bindings.15.topic"]')).not.toBeNull(); expect(document.activeElement).toBe(input("connections.0.bindings.15.topic"));
    await change("tag-search", "Tag119"); expect([...document.querySelectorAll<HTMLOptionElement>("option")].some((o) => o.value === "Tag119")).toBe(true);
  });
});
