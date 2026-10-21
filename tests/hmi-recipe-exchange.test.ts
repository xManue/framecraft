// @vitest-environment jsdom
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHmiRecipeClient } from "../src/core/hmiRecipeClient";
import { createHmiRecipeControl } from "../src/core/hmiRecipeControl";
import { exportRecipeFile } from "../runtime/recipe-exchange.mjs";
import { openRecipeStore } from "../runtime/recipe-store.mjs";
import { RecipeStoreError, type RecipeCatalog } from "../runtime/recipe-catalog.mjs";
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
  button(host, "Rileggi archivio").click(); await vi.waitFor(() => expect(host.querySelector('[data-recipe-exchange]')).not.toBeNull());
  const source = async (text = "<img src=x onerror=alert(1)>\t\n=SUM(1)") => { const snapshot = await store.snapshot(); return exportRecipeFile({ ...catalog.schemas[0], records: [{ id: "r", name: "Originale", values: { v: text } }, { id: "new", name: "Nuova", values: { v: "" } }] }, { revision: snapshot.revision, sequence: snapshot.sequence, exportedAt: new Date().toISOString() }); };
  const select = async (text?: string) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!, bytes = new TextEncoder().encode(text ?? await source());
    const file = new File([], "ricette.json", { type: "application/json" }); Object.defineProperty(file, "size", { value: bytes.length }); Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(host.textContent).not.toContain("Lettura locale del file…"));
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
  button(test.host, "Conferma importazione nell’archivio").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Importazione salvata"));
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
  button(test.host, "Conferma importazione nell’archivio").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Le ricette sono cambiate"));
  button(test.host, "Rileggi archivio").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Rigenera confronto"));
  expect(button(test.host, "Conferma importazione nell’archivio").disabled).toBe(true);
  button(test.host, "Rigenera confronto sulla copia riletta").click();
  const details = test.host.querySelector<HTMLDetailsElement>('[aria-label="Confronto importazione ricette"] details')!; details.open = true; details.dispatchEvent(new Event("toggle")); expect(details.textContent).toContain("concorrente");
  button(test.host, "Conferma importazione nell’archivio").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Importazione salvata")); expect((await test.store.snapshot()).sequence).toBe(2);
});
it("uses the original request ID to recover a lost batch response without applying twice", async () => {
  const test = await fixture(); await test.select(); test.lose(); button(test.host, "Conferma importazione nell’archivio").click();
  await vi.waitFor(() => expect(test.host.textContent).toContain("Salvataggio da verificare")); expect((await test.store.snapshot()).sequence).toBe(1);
  button(test.host, "Verifica ripetendo la stessa richiesta").click(); await vi.waitFor(() => expect(test.host.textContent).toContain("Richiesta già registrata"));
  const sent = test.request.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init!.body as string)); expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]); expect((await test.store.snapshot()).sequence).toBe(1);
  expect(test.host.querySelector('[aria-label="Confronto importazione ricette"]')).toBeNull();
});
it("clears the read archive and file review when the operator changes", async () => {
  const test = await fixture(); await test.select(); profile.id = "new-operator"; window.dispatchEvent(new CustomEvent("framecraft:user-changed"));
  expect(test.host.textContent).toContain("Accesso cambiato"); expect(test.host.querySelector('[data-recipe-exchange]')).toBeNull(); expect(test.request.mock.calls).toHaveLength(1);
});
it("keeps only the pending ID when changing operator, never a replayable previous-user payload", async () => {
  const test = await fixture(); await test.select(); test.lose(); button(test.host, "Conferma importazione nell’archivio").click();
  await vi.waitFor(() => expect(test.host.textContent).toContain("Salvataggio da verificare")); expect(test.client.pending?.canRetry).toBe(true); const id = test.client.pending!.id;
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
  button(test.host, "Rileggi archivio").click(); await vi.waitFor(() => expect(test.host.querySelector('input[type="file"]')).not.toBeNull());
  const next = test.host.querySelector<HTMLInputElement>('input[type="file"]')!, bad = new File([], "bad-utf8.json"); Object.defineProperty(bad, "size", { value: 1 }); Object.defineProperty(bad, "arrayBuffer", { value: async () => new Uint8Array([255]).buffer });
  Object.defineProperty(next, "files", { configurable: true, value: [bad] }); next.dispatchEvent(new Event("change")); await vi.waitFor(() => expect(test.host.textContent).toContain("File ricette non valido"));
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
