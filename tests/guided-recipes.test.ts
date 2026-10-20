// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interviewConfig, interviewContext, interviewPrompt, newAiInterview, newGuidedPage } from "../src/ai/aiInterview";
import { parseAiInterviewDraft, serializeAiInterviewDraft } from "../src/ai/aiInterviewDraft";
import { resolveInterviewDelegation } from "../src/ai/aiDelegation";
import { guidedProjectIssues, guidedProjectPending } from "../src/core/guidedProject";
import { parseRecipeCatalog, type RecipeCatalog } from "../src/core/recipeConfiguration";
import { standardProjectFiles } from "../src/core/standardProject";
import { GuidedRecipesInput, GuidedRecipesReview } from "../src/editor/GuidedRecipes";
import { AiProjectInterview } from "../src/editor/AiProjectInterview";
import { useEditorAi } from "../src/state/editorAi";
import { useEditorStore } from "../src/state/editorStore";

const catalog = (): RecipeCatalog => ({ version: 1, schemas: [{ id: "formats", name: "SYNTHETIC_SCHEMA", fields: [
  { id: "speed", name: "SYNTHETIC_SPEED", type: "number", minimum: -10, maximum: 10, unit: "test/s" },
  { id: "enabled", name: "SYNTHETIC_ENABLED", type: "boolean" }, { id: "label", name: "SYNTHETIC_LABEL", type: "string", maxLength: 100 },
], records: [{ id: "zero", name: "SYNTHETIC_ZERO", values: { speed: 0, enabled: false, label: "" } }, { id: "negative", name: "SYNTHETIC_NEGATIVE", values: { speed: -2.5, enabled: true, label: "SYNTHETIC_PRIVATE_VALUE" } }] }] });
function fixture() {
  const interview = newAiInterview(); interview.machineName = "Linea test"; interview.spec.purpose = "Configurazione ricette iniziali";
  interview.spec.pages = [{ ...newGuidedPage(0), title: "Formati", kind: "recipes", section: "formats", imageNeed: "none" }];
  interview.spec.recipes = catalog(); interview.spec.recipesFile = "SYNTHETIC_FILE.json"; return interview;
}
const initialAi = useEditorAi.getState(), initialEditor = useEditorStore.getState();
let host: HTMLDivElement, root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); useEditorAi.setState(initialAi, true); useEditorStore.setState({ ...initialEditor, loading: false }, true); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks(); useEditorAi.setState(initialAi, true); useEditorStore.setState(initialEditor, true); });
async function mount(component: Parameters<Root["render"]>[0]) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(StrictMode, null, component))); }
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === text)!;
async function choose(source: string | (() => Promise<string>), size = 100) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="Importa le ricette iniziali"] input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [{ name: "chosen.recipes.json", size, text: typeof source === "function" ? source : async () => source }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

describe("ricette iniziali nella pipeline guidata", () => {
  it("conserva esattamente tipi, limiti, zero, false e testo vuoto nel progetto, senza avviare o generare un archivio operativo", () => {
    const interview = fixture(), before = structuredClone(interview), config = interviewConfig(interview), files = standardProjectFiles(config);
    expect(parseRecipeCatalog(files.find(file => file.path === "framecraft.recipes.json")!.content)).toEqual(catalog()); expect(interview).toEqual(before);
    expect(files.filter(file => file.path.startsWith("src/pages/"))).toHaveLength(1); expect(files.some(file => file.path.startsWith(".framecraft-runtime/"))).toBe(false);
    expect(JSON.parse(files.find(file => file.path === "framecraft.runtime.json")!.content).gateway.enabled).toBe(false);
    expect(JSON.parse(files.find(file => file.path === "framecraft.connections.json")!.content).connections).toEqual([]);
    expect(guidedProjectPending(config.guided!).join(" ")).toContain("form operatore richiede servizio"); expect(guidedProjectPending(config.guided!).join(" ")).toContain("Nessun trasferimento");
  });
  it("non modifica il catalogo in base ai requisiti testuali o alle scelte delegate", () => {
    const interview = fixture(); interview.delegated = ["req.recipes.fields"]; interview.spec.requirements!.enabled.recipes = "yes";
    const resolved = resolveInterviewDelegation(interview, []); expect(resolved.spec.recipes).toEqual(catalog()); expect(interviewConfig(resolved).guided!.recipes).toEqual(catalog());
  });
  it("senza catalogo o dopo rimozione genera solo il catalogo vuoto, senza ricette campione", () => {
    const interview = fixture(); delete interview.spec.recipes; delete interview.spec.recipesFile;
    expect(JSON.parse(standardProjectFiles(interviewConfig(interview)).find(file => file.path === "framecraft.recipes.json")!.content)).toEqual({ version: 1, schemas: [] });
  });
  it.each(["missing-value", "wrong-type", "range", "duplicate", "extra", "operational", "version", "null"])("blocca configurazione, creazione e recupero non validi: %s", kind => {
    const interview = fixture(), value = interview.spec.recipes!;
    if (kind === "missing-value") delete value.schemas[0].records[0].values.enabled;
    if (kind === "wrong-type") value.schemas[0].records[0].values.speed = "0";
    if (kind === "range") value.schemas[0].records[0].values.speed = 11;
    if (kind === "duplicate") value.schemas[0].records[1].name = value.schemas[0].records[0].name;
    if (kind === "extra") Object.assign(value.schemas[0], { target: "PLC" });
    if (kind === "operational") Object.assign(value, { sequence: 1, receipts: [] });
    if (kind === "version") Object.assign(value, { version: 2 });
    if (kind === "null") interview.spec.recipes = null as never;
    expect(guidedProjectIssues(interview.spec).join(" ")).toContain("Ricette iniziali"); expect(() => interviewConfig(interview)).toThrow();
    expect(() => standardProjectFiles({ machineName: "Test", layout: "desktop", sections: ["formats"], guided: interview.spec })).toThrow();
    expect(() => parseAiInterviewDraft(JSON.stringify({ version: 1, savedAt: Date.now(), interview }))).toThrow("non supportati");
  });
  it("recupera il catalogo locale e continua ad accettare le bozze precedenti senza ricette", () => {
    const interview = fixture(); expect(parseAiInterviewDraft(serializeAiInterviewDraft(interview)).interview.spec.recipes).toEqual(catalog());
    delete interview.spec.recipes; delete interview.spec.recipesFile; expect(parseAiInterviewDraft(serializeAiInterviewDraft(interview)).interview.spec.recipes).toBeUndefined();
  });
  it("l’AI riceve solo conteggi e limiti, non schema, valori, nome file o identificativi", () => {
    const interview = fixture(), prompt = interviewPrompt(interview); expect(prompt).not.toContain("SYNTHETIC_"); expect(prompt).not.toContain("test/s");
    expect(interviewContext(interview).recipes).toEqual({ scope: "initial-configuration-only", schemaCount: 1, fieldCount: 3, recordCount: 2, valuesShared: false, runtimeForm: "server-authorized-storage-only", plcTransfer: false });
  });
  it("un cambio di valori locali aggiorna il piano senza pagare un’altra richiesta AI, ma un catalogo non valido revoca la proposta", () => {
    const interview = fixture(), send = vi.fn(); useEditorAi.setState({ interview, mode: "create", proposal: { version: 1, mode: "create", summary: "Piano", project: interviewConfig(interview), questions: [], warnings: [], provenance: [], operations: [], decisions: [] }, resolvedInterview: interview, propose: send });
    const next = structuredClone(interview); next.spec.recipes!.schemas[0].records[0].values.speed = 3; useEditorAi.getState().updateInterview(next);
    expect(useEditorAi.getState().proposalUpdatedLocally).toBe(true); expect(useEditorAi.getState().proposal!.project!.guided!.recipes).toEqual(next.spec.recipes); expect(send).not.toHaveBeenCalled();
    next.spec.recipes!.schemas[0].records[0].values.speed = 11; useEditorAi.getState().updateInterview(structuredClone(next)); expect(useEditorAi.getState().proposal).toBeUndefined();
  });
  it("un cambio dei conteggi rende necessaria una nuova proposta, senza inviarla automaticamente", () => {
    const interview = fixture(), send = vi.fn(); useEditorAi.setState({ interview, mode: "create", proposal: { version: 1, mode: "create", summary: "Piano", project: interviewConfig(interview), questions: [], warnings: [], provenance: [], operations: [], decisions: [] }, resolvedInterview: interview, propose: send });
    const next = structuredClone(interview); next.spec.recipes!.schemas[0].records.pop(); useEditorAi.getState().updateInterview(next);
    expect(useEditorAi.getState().proposal).toBeUndefined(); expect(send).not.toHaveBeenCalled();
  });
});

describe("importazione e revisione leggibili, nessun salvataggio implicito", () => {
  it("blocca il ritorno alla modifica dal riepilogo mentre una creazione è in corso", async () => { const edit = vi.fn(); await mount(createElement(GuidedRecipesReview, { catalog: catalog(), onEdit: edit, disabled: true })); expect(button("Rivedi le ricette iniziali").disabled).toBe(true); await act(async () => button("Rivedi le ricette iniziali").click()); expect(edit).not.toHaveBeenCalled(); });
  it("mostra tutti i campi e permette di controllare ogni ricetta senza convertire false, zero o testo vuoto", async () => {
    await mount(createElement(GuidedRecipesReview, { catalog: catalog() })); expect(host.textContent).toContain("0"); expect(host.textContent).toContain("Disattivato · false"); expect(host.textContent).toContain("Testo vuoto"); expect(host.textContent).toContain("minimo -10");
    const select = host.querySelector("select")!; await act(async () => { select.value = "negative"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("-2.5"); expect(host.textContent).toContain("SYNTHETIC_PRIVATE_VALUE");
  });
  it("separa selezione file, controllo e inclusione esplicita nel progetto", async () => {
    const onChange = vi.fn(), onBusyChange = vi.fn(); await mount(createElement(GuidedRecipesInput, { onChange, onBusyChange })); await choose(JSON.stringify(catalog()));
    expect(onChange).not.toHaveBeenCalled(); expect(host.textContent).toContain("non è ancora incluso"); await act(async () => button("Usa questo catalogo").click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith(catalog(), "chosen.recipes.json"); expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it.each(["{broken", JSON.stringify({ version: 1, schemas: [], receipts: ["PRIVATE"] }), "x".repeat(2_000_001)])("un import invalido non sostituisce il catalogo scelto né mostra il contenuto grezzo", async source => {
    const onChange = vi.fn(); await mount(createElement(GuidedRecipesInput, { catalog: catalog(), onChange, onBusyChange: vi.fn() })); await choose(source);
    expect(onChange).not.toHaveBeenCalled(); expect(host.textContent).toContain("catalogo precedente resta invariato"); expect(host.textContent).not.toContain("PRIVATE]"); expect(button("Usa questo catalogo")).toBeUndefined();
  });
  it("non legge file che dichiarano dimensioni oltre il limite", async () => { const read = vi.fn(async () => JSON.stringify(catalog())); await mount(createElement(GuidedRecipesInput, { onChange: vi.fn(), onBusyChange: vi.fn() })); await choose(read, 2_000_001); expect(read).not.toHaveBeenCalled(); });
  it("annullare l’importazione mantiene le scelte precedenti", async () => { const onChange = vi.fn(); await mount(createElement(GuidedRecipesInput, { catalog: catalog(), onChange, onBusyChange: vi.fn() })); await choose(JSON.stringify(catalog())); await act(async () => button("Annulla importazione ricette").click()); expect(onChange).not.toHaveBeenCalled(); expect(host.textContent).toContain("SYNTHETIC_SCHEMA"); });
  it("rimuovere richiede conferma e non cancella file esistenti", async () => { const onChange = vi.fn(), confirm = vi.spyOn(window, "confirm").mockReturnValue(false); await mount(createElement(GuidedRecipesInput, { catalog: catalog(), onChange, onBusyChange: vi.fn() })); await act(async () => button("Rimuovi ricette dal nuovo progetto").click()); expect(onChange).not.toHaveBeenCalled(); confirm.mockReturnValue(true); await act(async () => button("Rimuovi ricette dal nuovo progetto").click()); expect(onChange).toHaveBeenCalledExactlyOnceWith(); });
  it("ignora letture terminate dopo la chiusura e libera lo stato occupato", async () => { let finish!: (source: string) => void; const onChange = vi.fn(), busy = vi.fn(); await mount(createElement(GuidedRecipesInput, { onChange, onBusyChange: busy })); await choose(() => new Promise(resolve => { finish = resolve; })); await act(async () => root!.unmount()); root = undefined; await act(async () => finish(JSON.stringify(catalog()))); expect(onChange).not.toHaveBeenCalled(); expect(busy).toHaveBeenLastCalledWith(false); });
  it("ignora una lettura che appartiene a un catalogo ormai sostituito", async () => {
    let finish!: (source: string) => void; const onChange = vi.fn(), busy = vi.fn(); await mount(createElement(GuidedRecipesInput, { catalog: catalog(), onChange, onBusyChange: busy })); await choose(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => root!.render(createElement(StrictMode, null, createElement(GuidedRecipesInput, { catalog: { version: 1, schemas: [] }, onChange, onBusyChange: busy }))));
    await act(async () => finish(JSON.stringify(catalog()))); expect(onChange).not.toHaveBeenCalled(); expect(button("Usa questo catalogo")).toBeUndefined(); expect(busy).toHaveBeenLastCalledWith(false);
  });
  it("include il file nel questionario reale solo dopo Usa, senza inviare una richiesta AI", async () => {
    const interview = fixture(); interview.step = "data"; delete interview.spec.recipes; delete interview.spec.recipesFile; const send = vi.fn(); useEditorAi.setState({ interview, mode: "create", propose: send });
    await mount(createElement(AiProjectInterview)); await choose(JSON.stringify(catalog())); expect(useEditorAi.getState().interview.spec.recipes).toBeUndefined();
    await act(async () => button("Usa questo catalogo").click()); expect(useEditorAi.getState().interview.spec.recipes).toEqual(catalog()); expect(send).not.toHaveBeenCalled();
  });
  it("la creazione approvata riceve il catalogo esatto già mostrato nel riepilogo", async () => {
    const interview = fixture(); interview.step = "review"; const config = interviewConfig(interview), create = vi.fn(async () => {});
    useEditorAi.setState({ interview, mode: "create", resolvedInterview: interview, proposal: { version: 1, mode: "create", summary: "Piano", project: config, questions: [], warnings: [], provenance: [], operations: [], decisions: [] } }); useEditorStore.setState({ createStandardProject: create });
    await mount(createElement(AiProjectInterview)); expect(host.querySelector('[aria-label="Catalogo ricette iniziali"]')).not.toBeNull(); await act(async () => button("Approva, scegli cartella e crea 1 pagine").click()); expect(create).toHaveBeenCalledExactlyOnceWith(config);
  });
});
