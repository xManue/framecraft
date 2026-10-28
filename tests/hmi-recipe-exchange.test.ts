// @vitest-environment jsdom
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHmiRecipeClient } from "../src/core/hmiRecipeClient";
import { createHmiRecipeControl } from "../src/core/hmiRecipeControl";
import { exportRecipeFile } from "../runtime/recipe-exchange.mjs";
import { exportRecipeTable } from "../runtime/recipe-table.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { RecipeStoreError, type RecipeCatalog } from "../runtime/recipe-catalog.mjs";
const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 10000 });
const profile = vi.hoisted(() => ({ id: "synthetic", allowed: true }));
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionHeaders: () => ({}), operatorSessionProfile: () => ({ id: profile.id, capabilities: profile.allowed ? ["recipes.import"] : [] }) }));
const catalog: RecipeCatalog = { version: 1, schemas: [{ id: "s", name: "Schema", fields: [{ id: "v", name: "Valore", type: "string" }], records: [{ id: "r", name: "Originale", values: { v: "prima" } }] }] };
const cleanup: (() => void)[] = [];
afterEach(() => { for (const stop of cleanup.splice(0).reverse()) stop(); document.body.replaceChildren(); sessionStorage.clear(); profile.id = "synthetic"; profile.allowed = true; vi.restoreAllMocks(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
async function fixture() {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "recipe-exchange-ui-")), store = await openRecipeStore({ directory, catalog }); let loseResponse = false;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    try {
      const result = init?.method === "POST" ? await store.mutate(JSON.parse(init.body as string), "synthetic") : await store.snapshot();
      if (init?.method === "POST" && loseResponse) { loseResponse = false; throw new TypeError("Lost response"); }
      return new Response(JSON.stringify(result));
    } catch (error) { if (!(error instanceof RecipeStoreError)) throw error; return new Response(JSON.stringify({ type: "recipe", code: error.code, outcome: "rejected", effect: "recipe-storage-only", plcConfirmed: false }), { status: error.status }); }
  });
  const client = createHmiRecipeClient({ scope: "exchange", request }), host = document.createElement("div"); document.body.append(host);
  const control = createHmiRecipeControl(host, { client, confirm: () => true }); cleanup.push(() => client.dispose(), () => control.dispose());
  button(host, "Rileggi archivio").click(); await waitFor(() => expect(host.querySelector('[data-recipe-exchange]')).not.toBeNull());
  const source = async (text = "<img src=x onerror=alert(1)>\t\n=SUM(1)") => { const snapshot = await store.snapshot(); return exportRecipeFile({ ...catalog.schemas[0], records: [{ id: "r", name: "Originale", values: { v: text } }, { id: "new", name: "Nuova", values: { v: "" } }] }, { revision: snapshot.revision, sequence: snapshot.sequence, exportedAt: new Date().toISOString() }); };
  const select = async (text?: string, name = "ricette.json") => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!, bytes = new TextEncoder().encode(text ?? await source());
    const file = new File([], name, { type: name.endsWith(".tsv") ? "text/tab-separated-values" : "application/json" }); Object.defineProperty(file, "size", { value: bytes.length }); Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(host.textContent).not.toContain("Lettura locale del file…"));
  };
  return { host, store, client, request, control, source, select, lose: () => { loseResponse = true; } };
}
it("previews safe text, locks other edits/navigation and sends no mutation until confirmation", async () => {
  const test = await fixture(); await test.select();
  expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  expect(test.host.textContent).toContain("1 nuove · 1 da sostituire"); expect(test.host.querySelector("img")).toBeNull();
  expect(button(test.host, "Nuova ricetta").disabled).toBe(true);
  const details = test.host.querySelector<HTMLDetailsElement>('[aria-label="Confronto importazione ricette"] details')!; details.open = true; details.dispatchEvent(new Event("toggle"));
  expect(details.textContent).toContain("<img src=x"); expect(test.host.querySelector("img")).toBeNull();
  button(test.host, "Conferma importazione nell’archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Importazione salvata"));
  expect((await test.store.snapshot()).sequence).toBe(1); expect((await test.store.snapshot()).schemas[0].records).toHaveLength(2);
});
it("rejects bad files without requests and requires the dedicated permission", async () => {
  const test = await fixture(); await test.select("bad JSON"); expect(test.host.textContent).toContain("File ricette non valido");
  profile.allowed = false; await test.select(); expect(button(test.host, "Conferma importazione nell’archivio").disabled).toBe(true);
  expect((await test.store.snapshot()).sequence).toBe(0); expect(test.request.mock.calls).toHaveLength(1);
});
it("retains the file after a conflict and requires a new comparison against the reread copy", async () => {
  const test = await fixture(); await test.select(); const current = await test.store.snapshot();
  await test.store.mutate({ id: "concurrent_recipe_command_01", expectedRevision: current.revision, action: "update", schemaId: "s", recordId: "r", name: "Originale", values: { v: "concorrente" } }, "other");
  button(test.host, "Conferma importazione nell’archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Le ricette sono cambiate"));
  button(test.host, "Rileggi archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Rigenera confronto"));
  expect(button(test.host, "Conferma importazione nell’archivio").disabled).toBe(true);
  button(test.host, "Rigenera confronto sulla copia riletta").click();
  const details = test.host.querySelector<HTMLDetailsElement>('[aria-label="Confronto importazione ricette"] details')!; details.open = true; details.dispatchEvent(new Event("toggle")); expect(details.textContent).toContain("concorrente");
  button(test.host, "Conferma importazione nell’archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Importazione salvata")); expect((await test.store.snapshot()).sequence).toBe(2);
});
it("uses the original request ID to recover a lost batch response without applying twice", async () => {
  const test = await fixture(); await test.select(); test.lose(); button(test.host, "Conferma importazione nell’archivio").click();
  await waitFor(() => expect(test.host.textContent).toContain("Salvataggio da verificare")); expect((await test.store.snapshot()).sequence).toBe(1);
  button(test.host, "Verifica ripetendo la stessa richiesta").click(); await waitFor(() => expect(test.host.textContent).toContain("Richiesta già registrata"));
  const sent = test.request.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init!.body as string)); expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]); expect((await test.store.snapshot()).sequence).toBe(1);
  expect(test.host.querySelector('[aria-label="Confronto importazione ricette"]')).toBeNull();
});
it("clears the read archive and file review when the operator changes", async () => {
  const test = await fixture(); await test.select(); profile.id = "new-operator"; window.dispatchEvent(new CustomEvent("framecraft:user-changed"));
  expect(test.host.textContent).toContain("Accesso cambiato"); expect(test.host.querySelector('[data-recipe-exchange]')).toBeNull(); expect(test.request.mock.calls).toHaveLength(1);
});
it("keeps only the pending ID when changing operator, never a replayable previous-user payload", async () => {
  const test = await fixture(); await test.select(); test.lose(); button(test.host, "Conferma importazione nell’archivio").click();
  await waitFor(() => expect(test.host.textContent).toContain("Salvataggio da verificare")); expect(test.client.pending?.canRetry).toBe(true); const id = test.client.pending!.id;
  profile.id = "other-user"; window.dispatchEvent(new CustomEvent("framecraft:user-changed"));
  expect(test.client.pending).toEqual({ id, canRetry: false, reviewed: false });
  expect(button(test.host, "Verifica ripetendo la stessa richiesta")).toBeUndefined();
  await expect(test.client.retry()).rejects.toMatchObject({ code: "RECIPE_CLIENT_PENDING" }); expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("ignores a file read completed after logout and rejects invalid UTF-8 locally", async () => {
  const test = await fixture(); let finish!: (bytes: ArrayBuffer) => void;
  const input = test.host.querySelector<HTMLInputElement>('input[type="file"]')!, text = await test.source();
  const file = new File([], "late.json"); Object.defineProperty(file, "size", { value: 100 }); Object.defineProperty(file, "arrayBuffer", { value: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) });
  Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change"));
  profile.id = "new-user"; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); finish(new TextEncoder().encode(text).buffer); await Promise.resolve(); await Promise.resolve();
  expect(test.host.querySelector('[aria-label="Confronto importazione ricette"]')).toBeNull();
  button(test.host, "Rileggi archivio").click(); await waitFor(() => expect(test.host.querySelector('input[type="file"]')).not.toBeNull());
  const next = test.host.querySelector<HTMLInputElement>('input[type="file"]')!, bad = new File([], "bad-utf8.json"); Object.defineProperty(bad, "size", { value: 1 }); Object.defineProperty(bad, "arrayBuffer", { value: async () => new Uint8Array([255]).buffer });
  Object.defineProperty(next, "files", { configurable: true, value: [bad] }); next.dispatchEvent(new Event("change")); await waitFor(() => expect(test.host.textContent).toContain("File ricette non valido"));
  expect(test.request.mock.calls).toHaveLength(2);
});
it("downloads only portable schema data from the read snapshot, then releases object URLs", async () => {
  const test = await fixture(), create = vi.fn<(value: Blob) => string>(), revoke = vi.fn(); let blob: Blob | undefined;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create.mockImplementation(value => { blob = value as Blob; return "blob:recipe-test"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  const link = test.host.querySelector<HTMLAnchorElement>('a[download]')!; link.addEventListener("click", event => event.preventDefault()); link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(link.download).toBe("ricette-s-s0.framecraft.json"); expect(blob?.type).toContain("application/json"); expect(test.request.mock.calls).toHaveLength(1); expect(test.host.textContent).toContain("non una nuova lettura");
  test.control.dispose(); expect(revoke).toHaveBeenCalledWith("blob:recipe-test");
});

it("stages TSV mappings, focuses review and saves only after the second explicit command", async () => {
  const test = await fixture(), schema = structuredClone(catalog.schemas[0]); schema.records[0].values.v = '=SUM(1)\t\n<img src=x>';
  await test.select(exportRecipeTable(schema), "ricette.framecraft.tsv");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Abbinamento colonne ricette");
  expect(test.host.querySelector('[aria-label="Abbinamento colonne ricette"]')).not.toBeNull();
  expect(button(test.host, "Nuova ricetta").disabled).toBe(true); expect(test.host.querySelector('[aria-label="Confronto importazione ricette"]')).toBeNull();
  expect(test.request.mock.calls).toHaveLength(1); button(test.host, "Genera confronto").click();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Confronto importazione ricette"); expect(test.request.mock.calls).toHaveLength(1);
  button(test.host, "Rivedi colonne").click(); expect(test.host.querySelector('[aria-label="Confronto importazione ricette"]')).toBeNull();
  button(test.host, "Genera confronto").click(); button(test.host, "Conferma importazione nell’archivio").click();
  await waitFor(() => expect(test.host.textContent).toContain("Importazione salvata"));
  expect((await test.store.snapshot()).schemas[0].records[0].values.v).toBe(schema.records[0].values.v); expect(test.host.querySelector("img")).toBeNull();
  expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("requires complete custom mappings and consent for extra columns, then imports strings without evaluating them", async () => {
  const test = await fixture(); await test.select("Codice\tTitolo\tTesto\tIgnorato\nnew\tNuova\t=CMD()\tPRIVATE_UNUSED", "custom.tsv");
  button(test.host, "Genera confronto").click(); expect(test.host.textContent).toContain("Abbinamento colonne incompleto");
  for (const [label, column] of [["ID ricetta", "0"], ["Nome ricetta", "1"], ["Valore · string", "2"]]) {
    const select = test.host.querySelector<HTMLSelectElement>(`select[aria-label="Colonna per ${label}"]`)!; select.value = column; select.dispatchEvent(new Event("change"));
  }
  button(test.host, "Genera confronto").click(); expect(test.host.textContent).toContain("Abbinamento colonne incompleto");
  const checkbox = test.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; checkbox.click(); button(test.host, "Genera confronto").click();
  expect(test.host.textContent).toContain("1 nuove"); expect(test.request.mock.calls).toHaveLength(1);
  button(test.host, "Conferma importazione nell’archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Importazione salvata"));
  expect((await test.store.snapshot()).schemas[0].records.find(record => record.id === "new")?.values).toEqual({ v: "=CMD()" });
  expect(test.request.mock.calls.filter(([, init]) => init?.method === "POST")[0]?.[1]?.body).not.toContain("PRIVATE_UNUSED");
});
it("reports the invalid row/column without sending any partial batch", async () => {
  const test = await fixture(); await test.select("id\tname\tv\nnew\tNuova\tvalid\nnew\tSeconda\tother", "bad.tsv");
  button(test.host, "Genera confronto").click(); expect(test.host.textContent).toContain("Riga dati 2 · colonna “id”");
  expect(document.activeElement?.getAttribute("role")).toBe("alert");
  expect(test.host.querySelector('[aria-label="Confronto importazione ricette"]')).toBeNull(); expect((await test.store.snapshot()).sequence).toBe(0); expect(test.request.mock.calls).toHaveLength(1);
  button(test.host, "Scarta importazione").click(); expect(button(test.host, "Nuova ricetta").disabled).toBe(false);
});
it("clears TSV mappings at logout and prevents an unauthorized batch confirmation", async () => {
  const test = await fixture(); await test.select("id\tname\tv\nnew\tNuova\tvalue", "local.tsv");
  profile.allowed = false; button(test.host, "Genera confronto").click(); expect(button(test.host, "Conferma importazione nell’archivio").disabled).toBe(true);
  profile.id = "another"; window.dispatchEvent(new CustomEvent("framecraft:user-changed")); expect(test.host.querySelector('[data-recipe-exchange]')).toBeNull(); expect(test.request.mock.calls).toHaveLength(1);
});
it("keeps a TSV review across a server conflict and regenerates differences after an explicit reread", async () => {
  const test = await fixture(); await test.select("id\tname\tv\nr\tOriginale\tfrom TSV", "conflict.tsv"); button(test.host, "Genera confronto").click();
  const snapshot = await test.store.snapshot(); await test.store.mutate({ id: "tsv_concurrent_command_01", expectedRevision: snapshot.revision, action: "update", schemaId: "s", recordId: "r", name: "Originale", values: { v: "concorrente TSV" } }, "other");
  button(test.host, "Conferma importazione nell’archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Le ricette sono cambiate"));
  button(test.host, "Rileggi archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Rigenera confronto sulla copia riletta"));
  expect(button(test.host, "Conferma importazione nell’archivio").disabled).toBe(true); button(test.host, "Rigenera confronto sulla copia riletta").click();
  const details = test.host.querySelector<HTMLDetailsElement>('[aria-label="Confronto importazione ricette"] details')!; details.open = true; details.dispatchEvent(new Event("toggle")); expect(details.textContent).toContain("concorrente TSV → from TSV");
  button(test.host, "Conferma importazione nell’archivio").click(); await waitFor(() => expect(test.host.textContent).toContain("Importazione salvata")); expect((await test.store.snapshot()).sequence).toBe(2);
});
it("exports the read schema as TSV locally and releases the download URL", async () => {
  const test = await fixture(), revoke = vi.fn(); let blob: Blob | undefined;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (value: Blob) => { blob = value; return "blob:recipe-tsv"; } }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  const link = [...test.host.querySelectorAll<HTMLAnchorElement>("a[download]")].find(node => node.textContent === "Esporta schema TSV")!; link.addEventListener("click", event => event.preventDefault()); link.click();
  expect(link.download).toBe("ricette-s-s0.framecraft.tsv"); expect(blob?.type).toContain("text/tab-separated-values"); expect(test.request.mock.calls).toHaveLength(1); test.control.dispose(); expect(revoke).toHaveBeenCalledWith("blob:recipe-tsv");
});
it("explains invalid UTF-8 TSV as a table error without discarding or transmitting the archive", async () => {
  const test = await fixture(), file = new File([], "bad.tsv"); Object.defineProperty(file, "size", { value: 1 }); Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([255]).buffer });
  const input = test.host.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change"));
  await waitFor(() => expect(test.host.textContent).toContain("Tabella ricette non valida")); expect(test.host.textContent).toContain("Usa un TSV UTF-8"); expect(test.request.mock.calls).toHaveLength(1); expect((await test.store.snapshot()).sequence).toBe(0);
});
