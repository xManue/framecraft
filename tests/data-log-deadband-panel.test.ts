// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopBridge: { readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn() }, desktopAvailable: true }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { DataLogsPanel } from "../src/editor/DataLogsPanel";
import { useEditorStore } from "../src/state/editorStore";
import { defaultHmiDataLog, defaultHmiLoggingTag, parseHmiDataLogCatalog, serializeHmiDataLogCatalog, type HmiDataLogCatalog } from "../src/core/hmiDataLogs";

const initial = useEditorStore.getState(); let root: Root | undefined, host: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; useEditorStore.setState(initial, true); vi.resetAllMocks(); });
async function mount(type = "LREAL") {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const catalog: HmiDataLogCatalog = { version: 1, projectKey: "synthetic", logs: [{ ...defaultHmiDataLog(), storage: "runtime", tags: [{ ...defaultHmiLoggingTag(), tag: "Value" }] }] };
  vi.mocked(desktopBridge.readFile).mockResolvedValue(serializeHmiDataLogCatalog(catalog));
  useEditorStore.setState({ project: { root: "C:/Synthetic", files: [] } as unknown as NonNullable<typeof initial.project>, dataLogCatalog: catalog, plcVariables: [{ name: "Value", dataType: type, access: "read", address: "SYNTHETIC", description: "" }], refreshDataLogCatalog: vi.fn(async () => {}) });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(DataLogsPanel)));
}
function control<T extends Element>(label: string, selector: string): T {
  const owner = [...host.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent === label);
  const input = owner?.querySelector<T>(selector); if (!input) throw Error("Missing control: " + label); return input;
}
async function choose(label: string, value: string) { await act(async () => { const select = control<HTMLSelectElement>(label, "select"); select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function input(label: string, value: string) { await act(async () => { const node = control<HTMLInputElement>(label, "input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); }); }

it("salva e rilegge filtro predefinito e override, mostrando il filtro effettivo", async () => {
  await mount(); await choose("Filtro variazioni predefinito", "absolute"); await input("Variazione minima (unità del tag)", "5");
  expect(host.textContent).toContain("Filtro dell’archivio: almeno 5 unità del tag");
  await choose("Filtro variazioni della variabile", "none");
  const save = host.querySelector<HTMLButtonElement>(".resource-save")!; expect(save.disabled).toBe(false); await act(async () => save.click());
  const saved = vi.mocked(desktopBridge.writeFile).mock.calls[0][1]; const c = parseHmiDataLogCatalog(saved); expect(c.logs[0].deadband).toEqual({ mode: "absolute", value: 5 }); expect(c.logs[0].tags[0].deadband).toEqual({ mode: "none", value: 0 });
  expect(host.textContent).toContain("Riavvia manualmente il servizio");
  await act(async () => root!.unmount()); vi.mocked(desktopBridge.readFile).mockResolvedValue(String(saved)); root = createRoot(host); await act(async () => root!.render(createElement(DataLogsPanel)));
  expect(control<HTMLSelectElement>("Filtro variazioni predefinito", "select").value).toBe("absolute"); expect(control<HTMLInputElement>("Variazione minima (unità del tag)", "input").value).toBe("5"); expect(control<HTMLSelectElement>("Filtro variazioni della variabile", "select").value).toBe("none");
});

it("blocca soglie negative e tag non numerici, permettendo Nessuno per la singola variabile", async () => {
  await mount("BOOL"); await choose("Filtro variazioni predefinito", "percentage"); await input("Variazione minima (%)", "-1");
  expect(host.querySelector<HTMLButtonElement>(".resource-save")!.disabled).toBe(true); expect(host.textContent).toContain("soglia finita maggiore o uguale a zero");
  await input("Variazione minima (%)", "5"); expect(host.textContent).toContain("tag numerico scalare dichiarato"); await choose("Filtro variazioni della variabile", "none");
  expect(host.querySelector<HTMLButtonElement>(".resource-save")!.disabled).toBe(false);
  await choose("Modalità", "cyclic"); expect(host.textContent).not.toContain("Filtro variazioni della variabile"); expect(host.textContent).toContain("Ciclo logging (ms)");
});
