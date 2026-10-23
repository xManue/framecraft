// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readRecipeApplyConfiguration: vi.fn(), saveRecipeApplyConfiguration: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { RecipeApplyDialog } from "../src/editor/RecipeApplyDialog";
import { useEditorStore } from "../src/state/editorStore";
import { applySnapshot } from "./fixtures/recipeApplyConfiguration";
const project = { root: "C:/synthetic-recipe-apply", name: "Test", framework: "vite" as const, language: "typescript" as const, packageManager: "npm" as const, entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] };
let root: Root, host: HTMLElement; const close = vi.fn();
const button = (text: string) => [...document.querySelectorAll("button")].find(node => node.textContent?.trim() === text)!;
const field = (label: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
async function input(label: string, value: string) { const element = field(label); await act(async () => { Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); }
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(StrictMode, null, createElement(RecipeApplyDialog, { onClose: close })))); }
async function configure() { await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); await input("ID canale PLC", "line1"); await input("Tag richiesta al PLC", "Request"); await input("Tag risposta del PLC", "Response"); }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); useEditorStore.setState({ project }); vi.mocked(desktopBridge.readRecipeApplyConfiguration).mockResolvedValue(applySnapshot()); vi.mocked(desktopBridge.saveRecipeApplyConfiguration).mockImplementation(async (_root, expected, source) => ({ ...expected, source })); });
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); });
describe("recipe apply configuration dialog", () => {
  it("starts disabled, never invents tags, and writes only after explicit review and acknowledgement", async () => {
    await mount(); expect(button("Verifica configurazione").disabled).toBe(true); expect(desktopBridge.saveRecipeApplyConfiguration).not.toHaveBeenCalled(); await configure(); expect(button("Verifica configurazione").disabled).toBe(false);
    const options = [...field("Tag richiesta al PLC").querySelectorAll("option")].map(node => node.textContent); for (const wrong of ["WrongType", "ReadOnly", "Detected"]) expect(options.some(text => text?.includes(wrong))).toBe(false);
    await act(async () => button("Verifica configurazione").click()); expect(desktopBridge.saveRecipeApplyConfiguration).not.toHaveBeenCalled(); expect(button("Conferma salvataggio interfaccia").disabled).toBe(true);
    await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Conferma interfaccia ricette"] input[type="checkbox"]')!.click()); await act(async () => button("Conferma salvataggio interfaccia").click());
    const [savedRoot, expected, source] = vi.mocked(desktopBridge.saveRecipeApplyConfiguration).mock.calls[0]; expect(savedRoot).toBe(project.root); expect(expected).toEqual(applySnapshot()); expect(JSON.parse(source).schemas[0]).toMatchObject({ schemaId: "s", channelId: "line1", requestTag: "Request", responseTag: "Response" }); expect(JSON.parse(source)).not.toHaveProperty("connections"); expect(document.body.textContent).toContain("Nessuna connessione avviata");
  });
  it("keeps invalid values and the draft, then requires explicit discard before reread or close", async () => {
    await mount(); await configure(); await input("Capacità richiesta PLC (caratteri ASCII)", "254"); expect(button("Verifica configurazione").disabled).toBe(true); expect(document.body.textContent).toContain("512");
    await act(async () => button("Rileggi interfaccia").click()); expect(button("Scarta e rileggi")).toBeDefined(); await act(async () => button("Mantieni bozza").click()); expect(field("Capacità richiesta PLC (caratteri ASCII)").value).toBe("254");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); expect(close).not.toHaveBeenCalled(); expect(button("Scarta e chiudi")).toBeDefined();
  });
  it("preserves the configured tags on a five-file CAS conflict and requires new review", async () => {
    await mount(); await configure(); await act(async () => button("Verifica configurazione").click()); await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Conferma interfaccia ricette"] input[type="checkbox"]')!.click());
    vi.mocked(desktopBridge.saveRecipeApplyConfiguration).mockRejectedValue(new Error("Accessi cambiati sul disco: rileggi prima di salvare")); await act(async () => button("Conferma salvataggio interfaccia").click()); expect(document.body.textContent).toContain("Accessi cambiati"); expect(field("Tag richiesta al PLC").value).toBe("Request"); expect(button("Conferma salvataggio interfaccia")).toBeUndefined(); expect(button("Verifica configurazione").disabled).toBe(false);
  });
  it("does not replace a corrupt source with a blank interface or expose its contents", async () => {
    vi.mocked(desktopBridge.readRecipeApplyConfiguration).mockResolvedValue(applySnapshot({ source: "SYNTHETIC_PRIVATE_BROKEN" })); await mount(); expect(document.body.textContent).not.toContain("SYNTHETIC_PRIVATE"); expect(button("Verifica configurazione").disabled).toBe(true); expect(document.querySelector("fieldset")).toBeNull(); expect(desktopBridge.saveRecipeApplyConfiguration).not.toHaveBeenCalled();
  });
  it("keeps commissioned interfaces read-only without hiding their configuration", async () => {
    vi.mocked(desktopBridge.readRecipeApplyConfiguration).mockResolvedValue(applySnapshot({ commissioned: true, source: JSON.stringify({ version: 1, schemas: [{ schemaId: "s", channelId: "line1", requestTag: "Request", responseTag: "Response", maxPayloadBytes: 8192, maxAgeMs: 2000, prepareTimeoutMs: 5000, applyTimeoutMs: 5000, stageLifetimeMs: 30000 }] }) })); await mount(); expect(field("ID canale PLC").value).toBe("line1"); expect(field("ID canale PLC").matches(":disabled")).toBe(true); expect(document.body.textContent).toContain("non cancellare il registro"); expect(button("Verifica configurazione").disabled).toBe(true);
  });
  it("shares existing channels explicitly without silently changing other schemas", async () => {
    await mount(); await configure(); await input("Schema ricetta", "other"); await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); await input("Riprendi un canale già configurato", "line1"); expect(field("Tag richiesta al PLC").value).toBe("Request"); expect(field("ID canale PLC").matches(":disabled")).toBe(true); expect(button("Verifica configurazione").disabled).toBe(false);
    await act(async () => button("Separa in un nuovo canale").click()); expect(field("ID canale PLC").value).toBe(""); await input("Schema ricetta", "s"); expect(field("ID canale PLC").value).toBe("line1");
  });
  it("ignores delayed prior-project reads and closes when project identity changes", async () => {
    let resolve!: (snapshot: ReturnType<typeof applySnapshot>) => void; vi.mocked(desktopBridge.readRecipeApplyConfiguration).mockImplementation(() => new Promise(done => { resolve = done; })); await mount(); await act(async () => useEditorStore.setState({ project: { ...project, root: "C:/other" } })); await act(async () => resolve(applySnapshot())); expect(close).toHaveBeenCalled(); expect(document.querySelector("fieldset")).toBeNull(); expect(desktopBridge.saveRecipeApplyConfiguration).not.toHaveBeenCalled();
  });
});
