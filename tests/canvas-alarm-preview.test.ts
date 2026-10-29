// @vitest-environment jsdom
import { createRequire } from "node:module";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/canvas/Canvas";
import { emptyAlarmCatalog, type AlarmPreviewConfiguration } from "../src/core/hmiAlarms";
import { hmiAlarmPreviewSession } from "../src/core/hmiAlarmPreview";
import { useEditorStore } from "../src/state/editorStore";
// @ts-expect-error The actual project plugin is shipped as plain ESM.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string; runScripts: string; pretendToBeVisual: boolean }) => { window: Window & typeof globalThis & { close(): void } } };
const initial = useEditorStore.getState();
const configuration: AlarmPreviewConfiguration = { catalog: { ...emptyAlarmCatalog(), classes: [{ name: "R", acknowledgment: "reset" }], alarms: [{ id: "alarm", name: "Motor", text: "Controlla motore", tag: "Signal", className: "R", priority: 10, enabled: true, trigger: { kind: "bit", bit: 0, activeWhen: "set" } }] }, variables: [{ name: "Signal", dataType: "Bool", access: "read" }] };
const parentOrigin = "http://localhost:1420", panelOrigin = "http://127.0.0.1:4173";
let root: Root, host: HTMLDivElement, browser: InstanceType<typeof JSDOM>, frame: Window & typeof globalThis;
let messages: { data: Record<string, any>; target: string }[], incoming: Record<string, any>[], blockCommands: boolean;
let original: ChildNode | null, network: ReturnType<typeof vi.fn>;

const button = (text: string, scope: ParentNode = frame.document) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;
const latest = () => messages.filter(message => message.data.type === "framecraft:alarm-preview").at(-1)!.data;
const command = (snapshot = latest().snapshot) => ({ alarmId: "alarm", occurrence: snapshot.rows[0].occurrence, revision: snapshot.rows[0].revision, action: "acknowledge" });
function deliver(data: Record<string, unknown>, origin = panelOrigin, source: Window = frame) { window.dispatchEvent(new MessageEvent("message", { data, origin, source })); }
async function flush(ms = 32) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function start(values: Record<string, string> = { Signal: "1" }) {
  await act(async () => useEditorStore.setState({ interactionMode: "navigate", simulation: { on: true, values, status: {}, elements: [], unresolved: [] } }));
  await flush();
}

beforeEach(async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  network = vi.fn(); vi.stubGlobal("fetch", network);
  useEditorStore.setState({ ...initial, project: { root: "C:/panel", files: [] } as never,
    document: undefined, selectedId: undefined, multiSelection: [], selectionRect: undefined,
    highlightPicker: undefined, zonePicking: undefined, interactionMode: "edit", pages: [],
    previewUrl: panelOrigin, previewPath: "/", previewStatus: "ready", previewProcessExited: false,
    alarmPreviewConfiguration: configuration, consoleEntries: [],
    simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Canvas))));
  browser = new JSDOM('<!doctype html><html><body><main data-hmi-events="[]"><div data-hmi-type="HmiAlarmIndicator"><span>Bozza</span></div><div data-hmi-type="HmiAlarmLine">Bozza riga</div><div data-hmi-type="HmiAlarmControl">Bozza lista</div><button data-hmi-action="clear-alarm-log">Pulisci</button></main></body></html>', { url: panelOrigin, runScripts: "outside-only", pretendToBeVisual: true });
  frame = browser.window; messages = []; incoming = []; blockCommands = false;
  original = frame.document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.firstChild;
  const iframe = host.querySelector("iframe")!;
  Object.defineProperty(iframe, "contentWindow", { configurable: true, value: frame });
  Object.defineProperty(iframe, "contentDocument", { configurable: true, get: () => { throw new DOMException("Cross origin", "SecurityError"); } });
  Object.defineProperty(frame, "parent", { configurable: true, value: window });
  Object.assign(frame, { fetch: network, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16), cancelAnimationFrame: (id: number) => window.clearTimeout(id) });
  vi.spyOn(window, "postMessage").mockImplementation((data: Record<string, any>, target: string | WindowPostMessageOptions = "*") => {
    incoming.push(data);
    if (data.type === "framecraft:alarm-command" && blockCommands) return;
    const targetOrigin = typeof target === "string" ? target : target.targetOrigin ?? "*";
    if (targetOrigin !== "*" && targetOrigin !== parentOrigin) throw Error("Origine editor inattesa");
    queueMicrotask(() => deliver(data));
  });
  frame.postMessage = ((data: Record<string, any>, target: string) => {
    messages.push({ data, target });
    if (target !== "*" && target !== new URL(frame.location.href).origin) return;
    queueMicrotask(() => frame.dispatchEvent(new frame.MessageEvent("message", { data, source: window, origin: parentOrigin })));
  }) as typeof frame.postMessage;
  await act(async () => frame.eval(framecraftPlugin().transformIndexHtml("<main></main>").tags[0].children));
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount()); browser?.window.close(); host.remove();
  useEditorStore.setState(initial, true); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("allarmi con Canvas e vero ponte su origini differenti", () => {
  it("fa scadere una sospensione nel ponte senza modificare i valori simulati o ripetere il comando", async () => {
    await act(async () => useEditorStore.setState({ alarmPreviewConfiguration: { ...configuration, catalog: { ...configuration.catalog, maxHistory: 100, shelving: { enabled: true, maxMinutes: 1 } } } })); await start();
    const scope = frame.document.querySelector<HTMLElement>('[data-hmi-type="HmiAlarmControl"]')!;
    await act(async () => button("Motor", scope).click());
    scope.querySelector<HTMLInputElement>('[aria-label="Durata massima (minuti)"]')!.value = "1"; scope.querySelector<HTMLInputElement>('[aria-label="Motivo della sospensione o del ripristino"]')!.value = "Prova locale";
    await act(async () => button("Rivedi sospensione", scope).click()); expect(latest().snapshot.rows[0].shelving).toBeUndefined();
    await act(async () => button("Conferma operazione allarme", scope).click()); await flush(); expect(latest().snapshot.rows[0].shelving).toMatchObject({ mode: "timed", reason: "Prova locale" });
    const commands = incoming.filter(data => data.type === "framecraft:alarm-command").length; await flush(61000); expect(latest().snapshot.rows[0].shelving).toBeUndefined(); expect(latest().snapshot.rows[0].active).toBe(true); expect(latest().snapshot.history.at(-1)).toMatchObject({ state: "Unshelved", shelving: { cause: "elapsed" } }); expect(incoming.filter(data => data.type === "framecraft:alarm-command")).toHaveLength(commands); expect(network).not.toHaveBeenCalled();
  });
  it("mostra tutti i controlli senza leggere il DOM cross-origin e gestisce la presa visione locale", async () => {
    await start({});
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.textContent).toContain("sconosciuti");
    await act(async () => useEditorStore.getState().setSimulationValue("Signal", "1")); await flush();
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.textContent).toContain("1 · pendenti");
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmLine"]')!.textContent).toContain("Controlla motore");
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmControl"]')!.textContent).toContain("Motor");
    expect(frame.document.querySelector('[data-hmi-alarm-preview-note]')!.textContent).toContain("nessun PLC");
    await act(async () => button("Mostra allarmi").click());
    const popup = frame.document.querySelector('[data-hmi-alarm-popup]')!;
    await act(async () => { button("Motor", popup).click(); button("Prendi in visione", popup).click(); }); await flush();
    expect(popup.textContent).toContain("Presa visione registrata");
    expect(latest().snapshot.rows[0].acknowledged).toBe(true);
    expect(latest().snapshot.history.at(-1).actor).toBe("Prova locale");
    expect(useEditorStore.getState().simulation.values.Signal).toBe("1");
    expect(messages.filter(message => message.data.type.startsWith("framecraft:alarm-")).every(message => message.target === panelOrigin)).toBe(true);
    expect(incoming.filter(message => message.type === "framecraft:hmi-event")).toHaveLength(0);
    expect(network).not.toHaveBeenCalled();
  });

  it("Modifica ripristina i nodi e chiude i dettagli; fermare la prova crea una nuova sessione senza replay", async () => {
    await start(); await act(async () => button("Mostra allarmi").click());
    const before = latest().snapshot.instanceId;
    await act(async () => useEditorStore.setState({ interactionMode: "edit" })); await flush();
    expect(frame.document.querySelector('[data-hmi-alarm-popup]')).toBeNull();
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.firstChild).toBe(original);
    await act(async () => useEditorStore.getState().setSimulationOn(false)); await flush();
    expect(latest().snapshot.instanceId).not.toBe(before);
    await start();
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
    expect(incoming.filter(message => message.type === "framecraft:alarm-command")).toHaveLength(0);
  });

  it("rifiuta origine, finestra, pagina e sessione vecchie prima di applicare l'azione", async () => {
    await start();
    const data = { type: "framecraft:alarm-command", pageId: latest().pageId, requestId: "request", instanceId: latest().snapshot.instanceId, command: command() };
    await act(async () => { deliver(data, "https://untrusted.invalid"); deliver(data, panelOrigin, window); deliver({ ...data, pageId: "old-page" }); });
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
    expect(messages.filter(message => message.data.type === "framecraft:alarm-command-result")).toHaveLength(0);
    await act(async () => deliver({ ...data, instanceId: "old-session" })); await flush();
    expect(messages.find(message => message.data.type === "framecraft:alarm-command-result")!.data.ok).toBe(false);
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
  });

  it("sostituisce il catalogo senza perdere il handshake e rifiuta il comando della vecchia istanza", async () => {
    await start();
    const before = latest(), ready = incoming.filter(message => message.type === "framecraft:ready").length;
    await act(async () => useEditorStore.setState({ alarmPreviewConfiguration: { ...configuration, catalog: { ...configuration.catalog, alarms: configuration.catalog.alarms.map(alarm => ({ ...alarm, text: "Nuovo messaggio" })) } } })); await flush();
    expect(latest().snapshot.instanceId).not.toBe(before.snapshot.instanceId);
    expect(latest().pageId).toBe(before.pageId);
    expect(incoming.filter(message => message.type === "framecraft:ready")).toHaveLength(ready);
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmLine"]')!.textContent).toContain("Nuovo messaggio");
    await act(async () => deliver({ type: "framecraft:alarm-command", pageId: before.pageId, requestId: "stale", instanceId: before.snapshot.instanceId, command: command(before.snapshot) })); await flush();
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
    expect(messages.find(message => message.data.requestId === "stale")!.data.error).toContain("è cambiata");
  });

  it("un'azione senza risposta scade con spiegazione e non viene ripetuta", async () => {
    await start(); blockCommands = true;
    await act(async () => button("Mostra allarmi").click());
    const popup = frame.document.querySelector('[data-hmi-alarm-popup]')!;
    await act(async () => { button("Motor", popup).click(); button("Prendi in visione", popup).click(); });
    await flush(3100);
    expect(popup.textContent).toContain("non ha risposto");
    expect(popup.textContent).toContain("non viene ripetuta automaticamente");
    expect(incoming.filter(message => message.type === "framecraft:alarm-command")).toHaveLength(1);
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
  });

  it("ignora snapshot e risposte non provenienti dall'editor della sessione", async () => {
    await start();
    const current = latest(), fake = { ...current, snapshot: { ...current.snapshot, rows: [], history: [] } };
    await act(async () => {
      frame.dispatchEvent(new frame.MessageEvent("message", { data: fake, source: frame, origin: parentOrigin }));
      frame.dispatchEvent(new frame.MessageEvent("message", { data: fake, source: window, origin: "https://untrusted.invalid" }));
      frame.dispatchEvent(new frame.MessageEvent("message", { data: { ...fake, pageId: "old-page" }, source: window, origin: parentOrigin }));
    });
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.textContent).toContain("1 · pendenti");
  });

  it("il cambio di pagina React rinnova il token ma conserva il motore e rifiuta i vecchi comandi", async () => {
    await start();
    const before = latest();
    await act(async () => Object.assign(frame, { __framecraftCurrentPage: "settings" })); await flush(120);
    expect(latest().pageId).not.toBe(before.pageId);
    expect(latest().snapshot.instanceId).toBe(before.snapshot.instanceId);
    expect(latest().snapshot.rows[0].active).toBe(true);
    await act(async () => deliver({ type: "framecraft:alarm-command", pageId: before.pageId, requestId: "old-screen", instanceId: before.snapshot.instanceId, command: command(before.snapshot) })); await flush();
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
    expect(messages.some(message => message.data.requestId === "old-screen")).toBe(false);
  });

  it("Modifica cancella l'attesa e un comando tardivo non prende in visione l'allarme", async () => {
    await start(); blockCommands = true;
    await act(async () => button("Mostra allarmi").click());
    const popup = frame.document.querySelector('[data-hmi-alarm-popup]')!;
    await act(async () => { button("Motor", popup).click(); button("Prendi in visione", popup).click(); });
    const pending = incoming.find(message => message.type === "framecraft:alarm-command")!;
    await act(async () => useEditorStore.getState().setInteractionMode("edit")); await flush();
    expect(frame.document.querySelector('[data-hmi-alarm-popup]')).toBeNull();
    await act(async () => deliver(pending)); await flush();
    expect(latest().snapshot.rows[0].acknowledged).toBe(false);
    expect(messages.find(message => message.data.requestId === pending.requestId)!.data.ok).toBe(false);
    await flush(3100);
    expect(incoming.filter(message => message.type === "framecraft:alarm-command")).toHaveLength(1);
    expect(network).not.toHaveBeenCalled();
  });

  it("rileggere i metadati del progetto non azzera la prova; invalidare il catalogo la blocca", async () => {
    await start(); const before = latest();
    await act(async () => deliver({ type: "framecraft:alarm-command", pageId: before.pageId, requestId: "valid", instanceId: before.snapshot.instanceId, command: command(before.snapshot) })); await flush();
    expect(latest().snapshot.rows[0].acknowledged).toBe(true);
    await act(async () => useEditorStore.setState({ project: { ...useEditorStore.getState().project, files: [] } as never }));
    await act(async () => useEditorStore.getState().setSimulationValue("Signal", "0")); await flush();
    expect(latest().snapshot.instanceId).toBe(before.snapshot.instanceId);
    expect(latest().snapshot.rows[0]).toMatchObject({ active: false, acknowledged: true });
    await act(async () => useEditorStore.setState({ alarmPreviewConfiguration: undefined })); await flush();
    expect(latest().snapshot).toBeUndefined();
    expect(frame.document.querySelector('[data-hmi-type="HmiAlarmIndicator"]')!.textContent).toContain("non disponibile");
  });

  it("lo smontaggio per la vista Codice conserva la prova, ma Stop funziona anche senza canvas", async () => {
    await start(); const model = hmiAlarmPreviewSession(useEditorStore)!;
    const before = latest();
    await act(async () => deliver({ type: "framecraft:alarm-command", pageId: before.pageId, requestId: "before-code", instanceId: before.snapshot.instanceId, command: command(before.snapshot) })); await flush();
    await act(async () => root.render(null));
    expect(hmiAlarmPreviewSession(useEditorStore)).toBe(model);
    expect(model.update()?.rows[0].acknowledged).toBe(true);
    await act(async () => useEditorStore.getState().setSimulationOn(false));
    await act(async () => useEditorStore.getState().setSimulationOn(true));
    const restarted = model.update()!;
    expect(restarted.instanceId).not.toBe(before.snapshot.instanceId);
    expect(restarted.rows[0].acknowledged).toBe(false);
    expect(() => model.action(command(before.snapshot) as never, before.snapshot.instanceId)).toThrow("è cambiata");
    await act(async () => useEditorStore.setState({ project: undefined, alarmPreviewConfiguration: undefined }));
    expect(model.update()).toBeUndefined();
    expect(hmiAlarmPreviewSession(useEditorStore)).toBeUndefined();
  });
  it("il ponte serializzato tiene temporanee le colonne con profilo abilitato senza namespace del progetto", async () => {
    await start(); const grid = frame.document.querySelector<HTMLElement>('[data-hmi-type="HmiAlarmControl"]')!;
    await act(async () => { grid.setAttribute("data-hmi-alarm-column-profile", JSON.stringify({ version: 1, id: "preview", save: "manual" })); }); await flush();
    expect(grid.textContent).toContain("Il profilo richiede"); expect(button("Salva le mie colonne", grid)).toBeUndefined(); expect(frame.localStorage.length).toBe(0); expect(network).not.toHaveBeenCalled();
  });
});
