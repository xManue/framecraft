// @vitest-environment jsdom
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmiRecipeClient } from "../src/core/hmiRecipeClient";
import { allowHmiRecipeNavigation, createHmiRecipeControl } from "../src/core/hmiRecipeControl";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { RecipeStoreError, type RecipeCatalog, type RecipeCommand } from "../runtime/recipe-catalog.mjs";
const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 10000 });
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Schema <img src=x>", fields: [{ id: "n", name: "Numero", type: "number", minimum: 0, maximum: 10 }, { id: "b", name: "Booleano", type: "boolean" }, { id: "t", name: "Testo", type: "string", maxLength: 20 }], records: [{ id: "r", name: "Ricetta A", values: { n: 1, b: true, t: "iniziale" } }] }] };
const cleanup: (() => void)[] = [];
afterEach(() => { for (const stop of cleanup.splice(0).reverse()) stop(); document.body.replaceChildren(); sessionStorage.clear(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
const input = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")].find(node => node.getAttribute("aria-label") === label)!;
function fill(host: HTMLElement, label: string, value: string) { const node = input(host, label); node.value = value; node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }
async function fixture() {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-control-")), store = await openRecipeStore({ directory, catalog });
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    try { return new Response(JSON.stringify(init?.method === "POST" ? await store.mutate(JSON.parse(init.body as string), "synthetic:operator") : await store.snapshot())); }
    catch (reason) { const error = reason as RecipeStoreError; return new Response(JSON.stringify({ type: "recipe", code: error.code, outcome: error.code === "RECIPE_UNCERTAIN" ? "uncertain" : "rejected", effect: "recipe-storage-only", plcConfirmed: false, fieldId: error.fieldId }), { status: error.status }); }
  });
  const client = createHmiRecipeClient({ scope: "control", request }), host = document.createElement("div"); host.textContent = "Segnaposto"; document.body.append(host);
  const confirm = vi.fn(() => true), control = createHmiRecipeControl(host, { client, confirm }); cleanup.push(() => client.dispose(), () => control.dispose());
  const load = async () => { button(host, "Rileggi archivio").click(); await waitFor(() => expect(input(host, "Schema ricetta")).toBeDefined()); };
  const save = async (sequence: number) => { button(host, "Verifica operazione").click(); expect(host.textContent).toContain("Conferma nell’archivio"); button(host, "Conferma salvataggio").click(); await waitFor(() => expect(host.textContent).toContain(`sequenza ${sequence}.`)); };
  return { host, client, request, store, confirm, control, load, save };
}
describe("operator recipe form", () => {
  it("does not read or mutate on mount; disabled service explains the missing server configuration", async () => {
    const test = await fixture(); expect(test.request).not.toHaveBeenCalled(); expect(test.host.textContent).toContain("non scrive al PLC");
    const disabled = document.createElement("div"); document.body.append(disabled); const control = createHmiRecipeControl(disabled, {}); cleanup.push(() => control.dispose());
    expect(button(disabled, "Rileggi archivio").disabled).toBe(true); expect(disabled.textContent).toContain("PIN browser non abilita");
  });
  it("requires explicit zero, false and empty text, validates fields and asks for a second confirmation", async () => {
    const test = await fixture(); await test.load(); expect(test.host.querySelector("img")).toBeNull();
    button(test.host, "Nuova ricetta").click(); fill(test.host, "Nome ricetta", "Nuova"); fill(test.host, "Numero", "0"); fill(test.host, "Booleano", "false");
    button(test.host, "Verifica operazione").click(); expect(test.host.querySelector('[role="alert"]')?.textContent).toContain("Valori ricetta non validi"); expect(document.activeElement).toBe(input(test.host, "Testo")); expect((await test.store.snapshot()).sequence).toBe(0);
    button(test.host, "Usa testo vuoto").click(); button(test.host, "Verifica operazione").click(); expect(input(test.host, "Numero").disabled).toBe(true); expect((await test.store.snapshot()).sequence).toBe(0);
    button(test.host, "Conferma salvataggio").click(); await waitFor(() => expect(test.host.textContent).toContain("sequenza 1."));
    expect((await test.store.snapshot()).schemas[0].records[1].values).toEqual({ n: 0, b: false, t: "" }); expect(test.host.textContent).toContain("Nessun trasferimento al PLC");
  });
  it("updates, copies, renames and deletes in the real store, preserving exact data and schema", async () => {
    const test = await fixture(); await test.load();
    button(test.host, "Modifica ricetta").click(); fill(test.host, "Numero", "11"); button(test.host, "Verifica operazione").click(); expect(input(test.host, "Numero").value).toBe("11"); expect((await test.store.snapshot()).sequence).toBe(0);
    fill(test.host, "Numero", "2"); await test.save(1);
    button(test.host, "Copia ricetta").click(); fill(test.host, "Nome ricetta", "Copia"); await test.save(2); expect((await test.store.snapshot()).schemas[0].records[1].values.n).toBe(2);
    button(test.host, "Rinomina ricetta").click(); fill(test.host, "Nome ricetta", "Copia rinominata"); await test.save(3); expect((await test.store.snapshot()).schemas[0].records[1].name).toBe("Copia rinominata");
    button(test.host, "Elimina ricetta").click(); await test.save(4); expect((await test.store.snapshot()).schemas[0].records).toHaveLength(1); expect((await test.store.snapshot()).schemas[0].fields).toEqual(catalog.schemas[0].fields);
  });
  it("explains a missing name and accepts an explicitly entered decimal comma", async () => {
    const test = await fixture(); await test.load(); button(test.host, "Nuova ricetta").click(); button(test.host, "Verifica operazione").click(); expect(test.host.querySelector('[role="alert"]')?.textContent).toContain("Inserisci un nome valido"); expect(document.activeElement).toBe(input(test.host, "Nome ricetta"));
    fill(test.host, "Nome ricetta", "Decimale"); fill(test.host, "Numero", "2,5"); fill(test.host, "Booleano", "false"); button(test.host, "Usa testo vuoto").click(); await test.save(1); expect((await test.store.snapshot()).schemas[0].records[1].values.n).toBe(2.5);
  });
  it("retains the draft after a concurrent change and requires explicit rebase after rereading", async () => {
    const test = await fixture(); await test.load(); button(test.host, "Modifica ricetta").click(); fill(test.host, "Numero", "3");
    const snapshot = await test.store.snapshot(); const command: RecipeCommand = { id: crypto.randomUUID().replaceAll("-", ""), action: "update", expectedRevision: snapshot.revision, schemaId: "s", recordId: "r", name: "Ricetta A", values: { n: 4, b: true, t: "altro" } }; await test.store.mutate(command, "synthetic:second-operator");
    button(test.host, "Verifica operazione").click(); button(test.host, "Conferma salvataggio").click(); await waitFor(() => expect(test.host.querySelector('[role="alert"]')?.textContent).toContain("Le ricette sono cambiate")); expect(input(test.host, "Numero").value).toBe("3");
    button(test.host, "Rileggi archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("revisione diversa")); expect(input(test.host, "Numero").value).toBe("3"); expect(button(test.host, "Verifica operazione").disabled).toBe(true);
    button(test.host, "Confrontato: usa la revisione riletta").click(); await test.save(2); expect((await test.store.snapshot()).schemas[0].records[0].values).toEqual({ n: 3, b: true, t: "iniziale" });
  });
  it("guards navigation, restores the placeholder and removes listeners on dispose", async () => {
    const test = await fixture(); await test.load(); button(test.host, "Modifica ricetta").click(); test.confirm.mockReturnValue(false);
    expect(allowHmiRecipeNavigation()).toBe(false); const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    test.control.dispose(); expect(test.host.textContent).toBe("Segnaposto"); expect(test.host.hasAttribute("data-hmi-recipe-root")).toBe(false); expect(allowHmiRecipeNavigation()).toBe(true);
    const after = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });
  it("compares and copies the actual source values after an explicit rebase", async () => {
    const test = await fixture(); await test.load(); button(test.host, "Copia ricetta").click(); fill(test.host, "Nome ricetta", "Copia aggiornata");
    await test.store.mutate({ id: crypto.randomUUID().replaceAll("-", ""), expectedRevision: (await test.store.snapshot()).revision, action: "update", schemaId: "s", recordId: "r", name: "Ricetta aggiornata", values: { n: 4, b: false, t: "nuovo" } }, "synthetic:second-operator");
    button(test.host, "Rileggi archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("revisione diversa")); button(test.host, "Confrontato: usa la revisione riletta").click(); button(test.host, "Verifica operazione").click();
    const review = [...test.host.querySelectorAll("section")].find(node => node.textContent?.includes("Conferma nell’archivio"))!; expect(review.textContent).toContain("4 → 4"); expect(review.textContent).toContain("Falso → Falso"); expect(review.textContent).toContain("nuovo → nuovo");
    button(test.host, "Conferma salvataggio").click(); await waitFor(() => expect(test.host.textContent).toContain("sequenza 2.")); expect((await test.store.snapshot()).schemas[0].records[1].values).toEqual({ n: 4, b: false, t: "nuovo" });
  });
  it("keeps the draft on a lost response and retries the same new recipe without a duplicate", async () => {
    const test = await fixture(); await test.load(); button(test.host, "Nuova ricetta").click(); fill(test.host, "Nome ricetta", "Nuova incerta"); fill(test.host, "Numero", "0"); fill(test.host, "Booleano", "false"); button(test.host, "Usa testo vuoto").click();
    test.request.mockImplementationOnce(async (_url, init) => { await test.store.mutate(JSON.parse(init!.body as string), "synthetic:operator"); throw new Error("lost response"); });
    button(test.host, "Verifica operazione").click(); button(test.host, "Conferma salvataggio").click(); await waitFor(() => expect(test.host.textContent).toContain("Salvataggio da verificare"));
    expect(input(test.host, "Numero").value).toBe("0"); expect(button(test.host, "Verifica operazione").disabled).toBe(true); expect(button(test.host, "Ho confrontato l’archivio: continua").disabled).toBe(true);
    button(test.host, "Verifica ripetendo la stessa richiesta").click(); await waitFor(() => expect(test.host.textContent).toContain("Richiesta già registrata"));
    const snapshot = await test.store.snapshot(); expect(snapshot.sequence).toBe(1); expect(snapshot.schemas[0].records).toHaveLength(2); expect(input(test.host, "Ricetta archiviata").value).toBe(snapshot.schemas[0].records[1].id);
  });
  it("keeps input when the server revokes write permission after an authorized read", async () => {
    const test = await fixture(); await test.load(); button(test.host, "Modifica ricetta").click(); fill(test.host, "Numero", "2");
    test.request.mockResolvedValueOnce(new Response(JSON.stringify({ type: "recipe", code: "RECIPE_AUTH", outcome: "rejected", effect: "recipe-storage-only", plcConfirmed: false }), { status: 403 }));
    button(test.host, "Verifica operazione").click(); button(test.host, "Conferma salvataggio").click(); await waitFor(() => expect(test.host.querySelector('[role="alert"]')?.textContent).toContain("Operatore non autorizzato"));
    expect(input(test.host, "Numero").value).toBe("2"); expect((await test.store.snapshot()).sequence).toBe(0);
  });
  it("checks inherited runtime interaction gates before requests, even if a previously enabled button is clicked", async () => {
    const test = await fixture(), load = button(test.host, "Rileggi archivio"); test.host.dataset.fcUserRequires = "maintenance"; load.click(); expect(test.request).not.toHaveBeenCalled();
    test.control.refresh(); expect(button(test.host, "Rileggi archivio").disabled).toBe(true); test.host.dataset.fcUserGranted = "true"; test.control.refresh(); await test.load();
    test.host.dataset.fcReacts = "false"; button(test.host, "Modifica ricetta").click(); expect(test.host.querySelector("form")).toBeNull();
  });
});
