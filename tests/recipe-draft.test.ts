// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: false, desktopBridge: { readRecipeConfiguration: vi.fn(), saveRecipeConfiguration: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { RecipeCatalogDraftDialog } from "../src/editor/RecipeCatalogDraftDialog";
import { GuidedRecipesInput } from "../src/editor/GuidedRecipes";
import { AiAssistant } from "../src/editor/AiAssistant";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";
import { interviewConfig, interviewPrompt, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { parseAiInterviewDraft, serializeAiInterviewDraft } from "../src/ai/aiInterviewDraft";
import { standardProjectFiles } from "../src/core/standardProject";
import type { RecipeCatalog } from "../src/core/recipeConfiguration";

const seed = (): RecipeCatalog => ({ version: 1, schemas: [{ id: "s", name: "Schema reale", fields: [
  { id: "n", name: "Numero", type: "number", minimum: -10, maximum: 10 }, { id: "i", name: "Intero", type: "integer" },
  { id: "b", name: "Abilitato", type: "boolean" }, { id: "s", name: "Descrizione", type: "string", maxLength: 20 },
], records: [] }] });
const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
let root: Root, host: HTMLDivElement;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.trim() === text)!;
const field = (name: string) => [...document.querySelectorAll<HTMLLabelElement>("label")].find(node => node.childNodes[0]?.textContent === name)!.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
async function click(text: string) { await act(async () => button(text).click()); }
async function change(name: string, value: string) {
  const input = field(name); await act(async () => {
    Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function mount(component: Parameters<Root["render"]>[0]) { await act(async () => root.render(createElement(StrictMode, null, component))); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  useEditorAi.setState({ ...initialAi, open: true, mode: "create", busy: false, connecting: false, checking: false, account: undefined, model: "", propose: vi.fn() }, true);
  useEditorStore.setState({ ...initialEditor, project: undefined, document: undefined, loading: false }, true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); vi.restoreAllMocks(); });

describe("bozza ricette prima che il progetto esista", () => {
  it("non sceglie valori e applica esattamente negativi, zero, false e testo vuoto solo dopo conferma", async () => {
    const catalog = seed(), before = structuredClone(catalog), apply = vi.fn();
    await mount(createElement(RecipeCatalogDraftDialog, { catalog, onApply: apply, onClose: vi.fn() }));
    await click("Nuova ricetta"); expect(button("Usa queste ricette nel progetto").disabled).toBe(true);
    await change("Numero", "-2.5"); await change("Intero", "0"); await change("Abilitato", "false");
    expect(button("Usa queste ricette nel progetto").disabled).toBe(true);
    await click("Usa testo vuoto"); expect(button("Usa queste ricette nel progetto").disabled).toBe(false);
    expect(apply).not.toHaveBeenCalled(); await click("Usa queste ricette nel progetto");
    const [result, changed] = apply.mock.calls[0]; expect(changed).toBe(true);
    expect(result.schemas[0].records[0].values).toEqual({ n: -2.5, i: 0, b: false, s: "" });
    expect(result.schemas[0].fields).toEqual(catalog.schemas[0].fields); expect(catalog).toEqual(before);
    expect(desktopBridge.readRecipeConfiguration).not.toHaveBeenCalled(); expect(desktopBridge.saveRecipeConfiguration).not.toHaveBeenCalled(); expect(useEditorAi.getState().propose).not.toHaveBeenCalled();
  });

  it("blocca tipi e limiti non validi senza convertire o eliminare i valori scritti", async () => {
    const catalog = seed(); catalog.schemas[0].records = [{ id: "r", name: "Formato", values: { n: 2, i: 0, b: false, s: "" } }];
    const apply = vi.fn(); await mount(createElement(RecipeCatalogDraftDialog, { catalog, onApply: apply, onClose: vi.fn() }));
    for (const [name, invalid, valid] of [["Numero", "11", "2"], ["Intero", "2.5", "0"], ["Numero", "abc", "-0.5"], ["Descrizione", "x".repeat(21), ""]]) {
      await change(name, invalid); expect(button("Usa queste ricette nel progetto").disabled).toBe(true); expect(field(name).value).toBe(invalid);
      await click("Usa queste ricette nel progetto"); expect(apply).not.toHaveBeenCalled(); await change(name, valid);
    }
    expect(button("Usa queste ricette nel progetto").disabled).toBe(false);
  });

  it("annullare chiede conferma e non modifica il catalogo già approvato", async () => {
    const onChange = vi.fn(), busy = vi.fn(), catalog = seed(); await mount(createElement(GuidedRecipesInput, { catalog, file: "originale.json", onChange, onBusyChange: busy }));
    await click("Modifica schemi e ricette"); await change("Nome schema", "Bozza locale"); await click("Annulla");
    expect(document.body.textContent).toContain("non ancora incluse nel questionario"); expect(onChange).not.toHaveBeenCalled();
    await click("Continua modifica"); expect(field("Nome schema").value).toBe("Bozza locale"); await click("Annulla"); await click("Scarta bozza ricette");
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(onChange).not.toHaveBeenCalled(); expect(busy).toHaveBeenLastCalledWith(false); expect(document.body.textContent).toContain("originale.json");
  });

  it("blocca una bozza obsoleta e conserva il testo locale invece di sovrascrivere un nuovo catalogo", async () => {
    const onChange = vi.fn(), close = vi.fn(), catalog = seed(); await mount(createElement(RecipeCatalogDraftDialog, { catalog, onApply: onChange, onClose: close }));
    await change("Nome schema", "Testo locale"); const latest = seed(); latest.schemas[0].name = "Versione nuova";
    await mount(createElement(RecipeCatalogDraftDialog, { catalog: latest, onApply: onChange, onClose: close }));
    expect(field("Nome schema").value).toBe("Testo locale"); expect(button("Usa queste ricette nel progetto").disabled).toBe(true);
    expect(document.body.textContent).toContain("sono cambiate"); expect(onChange).not.toHaveBeenCalled();
  });

  it("modificare un catalogo importato non attribuisce il nuovo contenuto al vecchio file", async () => {
    const onChange = vi.fn(), catalog = seed(); await mount(createElement(GuidedRecipesInput, { catalog, file: "originale.json", onChange, onBusyChange: vi.fn() }));
    await click("Modifica schemi e ricette"); await change("Nome schema", "Schema modificato"); await click("Usa queste ricette nel progetto");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...catalog, schemas: [{ ...catalog.schemas[0], name: "Schema modificato" }] }, undefined);
    expect(catalog.schemas[0].name).toBe("Schema reale");
  });

  it("protegge la chiusura browser solo mentre la bozza è diversa dal catalogo approvato", async () => {
    await mount(createElement(RecipeCatalogDraftDialog, { catalog: seed(), onApply: vi.fn(), onClose: vi.fn() }));
    const clean = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
    await change("Nome schema", "Bozza"); const dirty = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(dirty); expect(dirty.defaultPrevented).toBe(true);
    await mount(null); const after = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });
});

describe("integrazione nella procedura reale senza account AI", () => {
  function interview() { const value = newAiInterview(); value.machineName = "Linea test"; value.step = "data"; value.spec.purpose = "Ricette iniziali"; value.spec.pages = [{ ...newGuidedPage(0), title: "Formati", kind: "recipes", section: "formats", imageNeed: "none" }]; return value; }
  it("costruisce, approva, recupera e genera il catalogo, senza chiamare l’AI o inviarle nomi e valori", async () => {
    useEditorAi.setState({ interview: interview() }); await mount(createElement(AiAssistant));
    await click("Crea schemi e ricette qui"); await click("Nuovo schema"); await click("Aggiungi campo");
    await change("Nome campo", "SYNTHETIC_LOCAL_FIELD"); await click("Nuova ricetta"); await change("SYNTHETIC_LOCAL_FIELD", "0");
    expect(useEditorAi.getState().interview.spec.recipes).toBeUndefined(); expect(button("Avanti").disabled).toBe(true);
    await click("Usa queste ricette nel progetto"); const value = useEditorAi.getState().interview;
    expect(value.spec.recipes?.schemas[0].records[0].values).toEqual({ "field-1": 0 }); expect(button("Avanti").disabled).toBe(false);
    expect(parseAiInterviewDraft(serializeAiInterviewDraft(value)).interview.spec.recipes).toEqual(value.spec.recipes);
    const files = standardProjectFiles(interviewConfig(value)); expect(JSON.parse(files.find(file => file.path === "framecraft.recipes.json")!.content)).toEqual(value.spec.recipes);
    expect(interviewPrompt(value)).not.toContain("SYNTHETIC_LOCAL_FIELD"); expect(useEditorAi.getState().propose).not.toHaveBeenCalled();
    expect(desktopBridge.saveRecipeConfiguration).not.toHaveBeenCalled();
  });

  it("Escape e Tab agiscono sulla finestra ricette, senza chiudere l’assistente o uscire dal suo focus", async () => {
    useEditorAi.setState({ interview: interview() }); await mount(createElement(AiAssistant)); await click("Crea schemi e ricette qui");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector(".recipe-dialog")).toBeNull(); expect(useEditorAi.getState().open).toBe(true);
    await click("Crea schemi e ricette qui"); await click("Nuovo schema");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.body.textContent).toContain("Scarta bozza ricette"); expect(useEditorAi.getState().open).toBe(true);
    await act(async () => { button("Scarta bozza ricette").focus(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Chiudi bozza ricette");
    await click("Scarta bozza ricette"); expect(useEditorAi.getState().open).toBe(true); expect(document.activeElement).toBe(button("Crea schemi e ricette qui"));
  });
});
