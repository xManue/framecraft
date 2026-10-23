// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readRecipePlcConfiguration: vi.fn(), saveRecipePlcConfiguration: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { RecipePlcDialog } from "../src/editor/RecipePlcDialog";
import { useEditorStore } from "../src/state/editorStore";
const project = { root: "C:/synthetic-recipe-plc", name: "Test", framework: "vite" as const, language: "typescript" as const, packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] };
const recipes = JSON.stringify({ version: 1, schemas: [{ id: "s", name: "Schema", fields: [{ id: "p", name: "Parametro", type: "number" }], records: [] }] });
const plc = JSON.stringify({ version: 1, variables: [{ name: "Speed", dataType: "Real", access: "read" }, { name: "Wrong", dataType: "Bool", access: "read" }, { name: "WriteOnly", dataType: "Real", access: "write" }] });
const initial = { generation: 8, source: null, recipes, plc };
let root: Root, host: HTMLElement; const close = vi.fn();
const button = (text: string) => [...document.querySelectorAll("button")].find(node => node.textContent?.trim() === text)!;
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(StrictMode, null, createElement(RecipePlcDialog, { onClose: close })))); }
async function choose() { const input = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!; await act(async () => input.click()); const select = document.querySelector<HTMLSelectElement>('[aria-label="Tag PLC per Parametro"]')!; await act(async () => { select.value = "Speed"; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); useEditorStore.setState({ project }); vi.mocked(desktopBridge.readRecipePlcConfiguration).mockResolvedValue(initial); vi.mocked(desktopBridge.saveRecipePlcConfiguration).mockImplementation(async (_root, expected, source) => ({ ...expected, source })); });
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); });
describe("recipe PLC mapping editor", () => {
  it("starts disabled, filters tags and saves only mapping with three-file CAS", async () => {
    await mount(); expect(button("Salva collegamenti").disabled).toBe(true); expect(desktopBridge.saveRecipePlcConfiguration).not.toHaveBeenCalled(); await choose();
    const options = [...document.querySelectorAll('select[aria-label] option')].map(item => item.textContent); expect(options).toContain("Speed · Real"); expect(options.some(item => item?.includes("Wrong") || item?.includes("WriteOnly"))).toBe(false);
    await act(async () => button("Salva collegamenti").click()); const [savedRoot, expected, source] = vi.mocked(desktopBridge.saveRecipePlcConfiguration).mock.calls[0]; expect(savedRoot).toBe(project.root); expect(expected).toEqual(initial); expect(JSON.parse(source).schemas[0].fields).toEqual([{ fieldId: "p", tag: "Speed" }]); expect(document.body.textContent).toContain("Riavvia manualmente"); expect(button("Salva collegamenti").disabled).toBe(true);
  });
  it("retains the draft on conflict and requires explicit discard before reread or close", async () => {
    await mount(); await choose(); vi.mocked(desktopBridge.saveRecipePlcConfiguration).mockRejectedValue(new Error("Schemi cambiati sul disco")); await act(async () => button("Salva collegamenti").click());
    expect(document.body.textContent).toContain("Schemi cambiati"); await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); expect(close).not.toHaveBeenCalled(); expect(button("Mantieni bozza")).toBeDefined(); await act(async () => button("Mantieni bozza").click());
    await act(async () => button("Rileggi configurazione").click()); expect(button("Scarta e rileggi")).toBeDefined(); expect(document.querySelector<HTMLSelectElement>('[aria-label="Tag PLC per Parametro"]')?.value).toBe("Speed");
  });
  it("does not replace corrupt input with defaults or expose raw private source", async () => {
    vi.mocked(desktopBridge.readRecipePlcConfiguration).mockResolvedValue({ ...initial, source: "SYNTHETIC_PRIVATE_BROKEN" }); await mount(); expect(document.body.textContent).not.toContain("SYNTHETIC_PRIVATE"); expect(button("Salva collegamenti").disabled).toBe(true); expect(document.querySelector("fieldset")).toBeNull();
  });
  it("ignores prior-project responses and retains orphan mapping until explicit removal", async () => {
    const source = JSON.stringify({ version: 1, schemas: [{ schemaId: "old", maxAgeMs: 2000, maxSkewMs: 250, fields: [{ fieldId: "p", tag: "Speed" }] }] }); vi.mocked(desktopBridge.readRecipePlcConfiguration).mockResolvedValue({ ...initial, source }); await mount();
    expect([...document.querySelectorAll("option")].some(item => item.textContent?.includes("Schema mancante"))).toBe(true); expect(button("Salva collegamenti").disabled).toBe(true); await act(async () => useEditorStore.setState({ project: { ...project, root: "C:/synthetic-other" } })); expect(close).toHaveBeenCalled(); expect(desktopBridge.saveRecipePlcConfiguration).not.toHaveBeenCalled();
  });
});
