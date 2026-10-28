// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readConnectionConfiguration: vi.fn(), saveConnectionConfiguration: vi.fn(), browseOpcUa: vi.fn(), cancelOpcUaBrowse: vi.fn(), readFile: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { PlcConnectionsDialog } from "../src/editor/PlcConnectionsDialog";
import { useEditorStore } from "../src/state/editorStore";
import { defaultConnectionCatalog, newOpcUaConnection, type ConnectionConfigurationSnapshot } from "../src/core/plcConnections";
import { opcUaStandardNamespace, type OpcUaBrowsePage } from "../runtime/opcua-browse-policy.mjs";
const project = { root: "C:/synthetic-panel", name: "Browse QA", framework: "vite" as const, language: "typescript" as const, packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] };
const profile = { ...newOpcUaConnection([]), enabled: true, url: "opc.tcp://synthetic.invalid:4840", securityMode: "None", securityPolicy: "None", allowInsecure: true };
const page = (): OpcUaBrowsePage => ({ version: 1, target: { namespaceUri: opcUaStandardNamespace, nodeId: "i=85" }, revision: "a".repeat(64), offset: 0, limit: 100, total: 1, nextOffset: null, nodes: [{ target: { namespaceUri: "urn:synthetic", nodeId: "s=Speed" }, browseName: "Speed", displayName: "Velocità", nodeClass: "Variable", dataType: { namespaceUri: opcUaStandardNamespace, nodeId: "i=10" }, valueRank: -1, arrayDimensions: [], readable: true, writable: true, supportedDataType: "Real", issues: [] }] });
const snapshot = (): ConnectionConfigurationSnapshot => ({ generation: 4, files: { connections: JSON.stringify({ ...defaultConnectionCatalog(), connections: [profile] }), runtime: null, plc: '{"version":1,"custom":{"keep":true},"variables":[]}' } });
let root: Root, host: HTMLElement; const close = vi.fn();
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text)!;
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => element.click()); }
async function change(label: string, value: string) {
  const name = [...document.querySelectorAll("label")].find(l => l.textContent === label), input = document.getElementById(name!.getAttribute("for")!) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(PlcConnectionsDialog, { onClose: close }))); }
async function open() { await mount(); await click(button("Esplora nodi OPC UA")); }
async function read() { await click(document.querySelector<HTMLInputElement>('.opcua-browser input[type="checkbox"]')!); await click(button("Leggi nodi")); }
async function pick() { await read(); await click(document.querySelector(".opcua-node-pick")!); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  useEditorStore.setState({ project, loading: false, dirty: false, document: undefined, consoleEntries: [] });
  vi.mocked(desktopBridge.readConnectionConfiguration).mockResolvedValue(snapshot());
  vi.mocked(desktopBridge.saveConnectionConfiguration).mockImplementation(async (_root, expected, next) => ({ generation: expected.generation, files: { ...expected.files, ...next } }));
  vi.mocked(desktopBridge.browseOpcUa).mockImplementation(async request => ({ version: 1, connectionId: request.connectionId, configurationRevision: "b".repeat(64), page: page() }));
  vi.mocked(desktopBridge.cancelOpcUaBrowse).mockResolvedValue(true);
});
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.restoreAllMocks(); });
it("opens offline with explicit network consent, stable scope and an inert parent", async () => {
  await open(); expect(button("Leggi nodi").disabled).toBe(true); expect(desktopBridge.browseOpcUa).not.toHaveBeenCalled();
  expect(document.querySelector('.connections-dialog:not(.opcua-browser)')?.hasAttribute("inert")).toBe(true);
  expect(document.querySelector('.connections-dialog:not(.opcua-browser)')?.getAttribute("aria-hidden")).toBe("true");
  await read(); expect(desktopBridge.browseOpcUa).toHaveBeenCalledOnce(); expect(vi.mocked(desktopBridge.browseOpcUa).mock.calls[0][0]).toMatchObject({ root: project.root, expected: snapshot(), connectionId: "opcua-1", consent: true });
  expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
});
it("reviews a new variable, accumulates it only in the parent draft, then saves all three catalogs explicitly", async () => {
  const refresh = vi.spyOn(useEditorStore.getState(), "refreshPlcVariables").mockResolvedValue(undefined);
  await open(); await pick(); await change("Nome locale della variabile", "Motor.Speed"); await click(button("Rivedi associazione"));
  expect(document.querySelector('[aria-label="Revisione associazione"]')?.textContent).toContain("Comandi: disabilitati"); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(document.querySelector('[aria-label="Revisione associazione"]'));
  await click(button("Aggiungi alla bozza")); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled(); await click(button("Torna alle connessioni"));
  expect(document.querySelector(".opcua-browser")).toBeNull(); expect(button("Salva configurazione").disabled).toBe(false); await click(button("Salva configurazione"));
  const saved = vi.mocked(desktopBridge.saveConnectionConfiguration).mock.calls[0][2];
  expect(JSON.parse(saved.plc!)).toMatchObject({ custom: { keep: true }, variables: [{ name: "Motor.Speed", access: "read", address: "", description: "" }] });
  expect(JSON.parse(saved.connections).connections[0].bindings[0]).toMatchObject({ tag: "Motor.Speed", nodeId: "s=Speed", writeEnabled: false }); expect(refresh).toHaveBeenCalledOnce();
});
it("keeps invalid names and unsupported nodes out of the review", async () => {
  await open(); await pick(); await change("Nome locale della variabile", "1bad"); await click(button("Rivedi associazione"));
  expect(document.querySelector('[aria-label="Revisione associazione"]')).toBeNull(); expect(document.querySelector('.opcua-browser [role="alert"]')?.textContent).toContain("nome locale valido");
});
it("disables browse until a modified security profile has been saved", async () => {
  await mount(); const input = document.querySelector<HTMLInputElement>('[data-field="connections.0.url"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "opc.tcp://changed.invalid:4840"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(button("Esplora nodi OPC UA").disabled).toBe(true); expect(desktopBridge.browseOpcUa).not.toHaveBeenCalled();
});
it("cancels the exact request on close and discards a late successful response", async () => {
  let complete!: (value: Awaited<ReturnType<typeof desktopBridge.browseOpcUa>>) => void;
  vi.mocked(desktopBridge.browseOpcUa).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  await open(); await read(); const request = vi.mocked(desktopBridge.browseOpcUa).mock.calls[0][0];
  await click(button("Annulla e chiudi")); expect(desktopBridge.cancelOpcUaBrowse).toHaveBeenCalledWith(request.id); expect(document.querySelector(".opcua-browser")).not.toBeNull();
  await act(async () => complete({ version: 1, connectionId: request.connectionId, configurationRevision: "b".repeat(64), page: page() }));
  expect(document.querySelector(".opcua-browser")).toBeNull(); expect(button("Salva configurazione").disabled).toBe(true);
});
it("Escape closes only the browser and prevents parent save shortcuts", async () => {
  await open(); await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })));
  expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector(".opcua-browser")).toBeNull(); expect(close).not.toHaveBeenCalled(); expect(document.querySelector('[aria-label="Modifiche alla connessione non salvate"]')).toBeNull();
});
it("does not echo a transport error containing secrets or stack traces", async () => {
  vi.mocked(desktopBridge.browseOpcUa).mockRejectedValue("PRIVATE_PASSWORD stack at C:/private/path"); await open(); await read();
  expect(document.body.textContent).not.toContain("PRIVATE_PASSWORD"); expect(document.body.textContent).not.toContain("C:/private/path"); expect(document.body.textContent).toContain("Codice assistenza: OPC_UA_DESKTOP_FAILED");
});
it("cancels pending work on project change and never applies the old response", async () => {
  vi.mocked(desktopBridge.browseOpcUa).mockImplementation(() => new Promise(() => {})); await open(); await read(); const id = vi.mocked(desktopBridge.browseOpcUa).mock.calls[0][0].id;
  await act(async () => { useEditorStore.setState({ project: { ...project, root: "C:/other" } }); root.unmount(); });
  expect(desktopBridge.cancelOpcUaBrowse).toHaveBeenCalledWith(id); expect(desktopBridge.saveConnectionConfiguration).not.toHaveBeenCalled();
});
it("navigates a folder using its portable identity and keeps the saved profile", async () => {
  const folder = { ...page().nodes[0], nodeClass: "Object" as const, browseName: "Plant", displayName: "Plant", target: { namespaceUri: "urn:synthetic", nodeId: "s=Plant" }, supportedDataType: null, dataType: null, valueRank: null, readable: null, writable: null };
  vi.mocked(desktopBridge.browseOpcUa).mockImplementation(async request => ({ version: 1, connectionId: request.connectionId, configurationRevision: "b".repeat(64), page: request.query.nodeId === "s=Plant" ? { ...page(), target: folder.target } : { ...page(), nodes: [folder] } }));
  await open(); await read(); await click(document.querySelector('[aria-label="Esplora Plant"]')!);
  expect(vi.mocked(desktopBridge.browseOpcUa).mock.calls[1][0]).toMatchObject({ connectionId: "opcua-1", query: folder.target });
  expect(document.querySelector('nav[aria-label="Cartella OPC UA"]')?.textContent).toContain("Plant"); expect(document.querySelector(".opcua-node-pick")?.textContent).toContain("Velocità");
});
it("keeps pagination tied to the same directory revision instead of silently mixing results", async () => {
  const first = { ...page(), total: 101, nextOffset: 100, nodes: Array.from({ length: 100 }, (_, index) => ({ ...page().nodes[0], browseName: "Speed" + index, displayName: "Speed" + index })) };
  vi.mocked(desktopBridge.browseOpcUa).mockImplementation(async request => ({ version: 1, connectionId: request.connectionId, configurationRevision: "b".repeat(64), page: request.query.offset ? { ...page(), offset: 100, total: 101 } : first }));
  await open(); await read(); await click(document.querySelector('[aria-label="Pagina nodi successiva"]')!);
  expect(vi.mocked(desktopBridge.browseOpcUa).mock.calls[1][0].query).toMatchObject({ offset: 100, limit: 100, revision: "a".repeat(64), namespaceUri: opcUaStandardNamespace, nodeId: "i=85" });
  expect(document.querySelector(".opcua-node-pagination")?.textContent).toContain("101–101 di 101");
});
it("shows unsupported arrays explicitly without allowing variable creation", async () => {
  const result = page(); Object.assign(result.nodes[0], { valueRank: 1, arrayDimensions: [2], supportedDataType: null, issues: ["array"] });
  vi.mocked(desktopBridge.browseOpcUa).mockResolvedValue({ version: 1, connectionId: "opcua-1", configurationRevision: "b".repeat(64), page: result });
  await open(); await pick(); expect(document.querySelector(".opcua-node-detail")?.textContent).toContain("Array o struttura non supportati"); expect(document.querySelector(".opcua-mapping-form")).toBeNull();
});
it("discards a reply from a different connection without displaying its nodes", async () => {
  vi.mocked(desktopBridge.browseOpcUa).mockResolvedValue({ version: 1, connectionId: "other", configurationRevision: "b".repeat(64), page: page() });
  await open(); await read(); expect(document.querySelector(".opcua-node-pick")).toBeNull(); expect(document.body.textContent).toContain("OPC_UA_BROWSE_RESPONSE");
});
