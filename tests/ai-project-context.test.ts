import { expect, it, vi } from "vitest";
import { runAiProject, type AiProjectContextOptions } from "../src/ai/aiProjectContext";
import type { AiProjectPlan } from "../src/ai/aiProjectEdits";

const root = "C:/synthetic-machine", app = 'import {HeaderValue,HeaderGauge} from "./HeaderUi"; const headerConfig={version:1,tags:{}};export const Page=()=> <section><HeaderValue field="speed" config={headerConfig}/><HeaderGauge config={headerConfig}/></section>';
const header = 'export const HeaderValue=({field,config})=> <span>{config.tags[field]??"—"}</span>; export const HeaderGauge=({config})=> <div data-tag={config.tags.speed}/>';
const plan = (values: Partial<AiProjectPlan> = {}): AiProjectPlan => ({ summary: "Collegamenti pronti", questions: [], warnings: [], reads: [], edits: [], variables: [], ...values });
function fixture(files: Record<string, string | null> = {}) {
  const sources = new Map<string, string | null>([["framecraft.plc.json", null], ["src/App.tsx", app], ["src/HeaderUi.tsx", header], ...Object.entries(files)]);
  const read = vi.fn(async (path: string) => sources.get(path) ?? null), propose = vi.fn(async (_prompt: string, _schema: unknown) => JSON.stringify(plan()));
  const options: AiProjectContextOptions = { root, request: "Collega questi elementi alle variabili e crea quelle mancanti", notes: "Mantieni gli allarmi", history: [],
    files: [...sources.keys()].map(path => `${root}/${path}`), selections: [{ path: `${root}/src/App.tsx`, start: app.indexOf("<section"), label: "Barra velocità" }], read, propose, current: () => true, progress: vi.fn() };
  return { sources, read, propose, options };
}
it("legge i componenti importati e propone il collegamento HeaderValue/HeaderGauge con nuova variabile", async () => {
  const { options, propose, read } = fixture();
  propose.mockResolvedValue(JSON.stringify(plan({ edits: [{ path: "src/App.tsx", before: 'const headerConfig={version:1,tags:{}}', after: 'const headerConfig={version:1,tags:{speed:"PanelSpeed"}}' }], variables: [{ name: "PanelSpeed", dataType: "REAL", description: "Velocità da collegare" }] })));
  const review = await runAiProject(options);
  expect(review.changes).toHaveLength(2); expect(review.rounds).toBe(1); expect(propose).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith("src/HeaderUi.tsx"); const payload = JSON.parse(propose.mock.calls[0][0]);
  expect(payload.files.find((item: { path: string }) => item.path === "src/HeaderUi.tsx").parts[0]).toContain("export const HeaderGauge");
  expect(JSON.parse(review.changes[1].after).variables[0]).toMatchObject({ name: "PanelSpeed", access: "read", address: "" });
});
it("invia metadati del catalogo ma non indirizzi, connessioni, valori o campi extra", async () => {
  const catalog = JSON.stringify({ version: 1, secretExtra: "PRIVATE_ROOT", variables: [{ name: "LineSpeed", dataType: "REAL", access: "read", address: "PRIVATE_ADDRESS", connection: "PRIVATE_CONNECTION", value: "PRIVATE_VALUE", description: "Velocità linea" }] });
  const { options, propose } = fixture({ "framecraft.plc.json": catalog }); await runAiProject(options);
  const prompt = propose.mock.calls[0][0], payload = JSON.parse(prompt);
  expect(payload.variables).toEqual([{ name: "LineSpeed", dataType: "REAL", access: "read", description: "Velocità linea" }]);
  expect(prompt).not.toMatch(/PRIVATE_|C:\/synthetic-machine/); expect(payload.filesIndex).toContain("src/HeaderUi.tsx");
});
it("cerca una configurazione esterna in un secondo passaggio senza altri allegati", async () => {
  const { options, propose } = fixture({ "src/Config.ts": 'export const config={tags:{}}' });
  propose.mockResolvedValueOnce(JSON.stringify(plan({ reads: [{ path: "src/Config.ts", find: "config" }] }))).mockResolvedValueOnce(JSON.stringify(plan({ edits: [{ path: "src/Config.ts", before: "tags:{}", after: 'tags:{speed:"Existing"}' }] })));
  const result = await runAiProject(options); expect(result.rounds).toBe(2); expect(result.changes[0].path).toBe("src/Config.ts");
  expect(JSON.parse(propose.mock.calls[1][0]).files.some((file: { path: string }) => file.path === "src/Config.ts")).toBe(true);
});
it("verifica l’assenza di un file prima di proporne la creazione", async () => {
  const { options, propose } = fixture();
  propose.mockResolvedValueOnce(JSON.stringify(plan({ reads: [{ path: "src/Widget.tsx", find: "" }] }))).mockResolvedValueOnce(JSON.stringify(plan({ edits: [{ path: "src/Widget.tsx", before: "", after: "export const Widget=()=> <span/>" }] })));
  const result = await runAiProject(options); expect(result.changes[0].before).toBeNull(); expect(result.knownFiles).toContain("src/Widget.tsx");
});
it("blocca un file protetto richiesto dal modello prima di leggerlo", async () => {
  const { options, propose, read } = fixture(); propose.mockResolvedValue(JSON.stringify(plan({ reads: [{ path: "../.env", find: "" }] })));
  await expect(runAiProject(options)).rejects.toThrow("protetto"); expect(read).not.toHaveBeenCalledWith("../.env");
});
it("blocca credenziali riconoscibili prima del primo invio", async () => {
  const { options, propose } = fixture({ "src/App.tsx": 'const password="synthetic-secret";export const Page=()=>null' });
  await expect(runAiProject(options)).rejects.toThrow("credenziali"); expect(propose).not.toHaveBeenCalled();
});
it("non continua a leggere o inviare dopo annullamento o cambio progetto", async () => {
  const { options, read, propose } = fixture(); let valid = true; options.current = () => valid;
  read.mockImplementation(async () => { valid = false; return null; });
  await expect(runAiProject(options)).rejects.toThrow("annullata"); expect(propose).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledTimes(1);
});
it("si ferma a tre richieste modello e segnala le letture ancora mancanti", async () => {
  const { options, propose } = fixture(); let index = 0;
  propose.mockImplementation(async () => JSON.stringify(plan({ reads: [{ path: `src/Unknown${index++}.tsx`, find: "" }] })));
  await expect(runAiProject(options)).rejects.toThrow("tre passaggi"); expect(propose).toHaveBeenCalledTimes(3);
});
it("non ripete ciclicamente la stessa lettura", async () => {
  const { options, propose } = fixture(); propose.mockResolvedValue(JSON.stringify(plan({ reads: [{ path: "src/Config.ts", find: "config" }] })));
  await expect(runAiProject(options)).rejects.toThrow("due volte"); expect(propose).toHaveBeenCalledTimes(2);
});
it("non taglia la richiesta per farla entrare nel budget", async () => {
  const { options, propose } = fixture(); options.request = "界".repeat(30_000);
  await expect(runAiProject(options)).rejects.toThrow("limite locale"); expect(propose).not.toHaveBeenCalled();
});
it("non invia contenuti di cartelle esterne al progetto", async () => {
  const { options, propose } = fixture(); options.files.push("C:/other-project/Private.tsx"); await runAiProject(options);
  expect(propose.mock.calls[0][0]).not.toContain("other-project");
});
