// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRecipePlc } from "../runtime/recipe-plc.mjs";
import { createHmiRecipeClient } from "../src/core/hmiRecipeClient";
import { createHmiRecipeControl } from "../src/core/hmiRecipeControl";
const session = vi.hoisted(() => ({ capabilities: ["recipes.read", "recipes.capture", "recipes.create"] as string[], id: "operator" }));
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionHeaders: () => ({}), operatorSessionProfile: () => session.id ? session : null }));
const schema = { id: "s", name: "Schema", fields: [{ id: "n", name: "Numero", type: "number" as const }], records: [{ id: "r", name: "Ricetta", values: { n: 1 } }] };
const snapshot = { version: 1, schemas: [schema], revision: "a".repeat(64), sequence: 0, persistence: "server-file" };
const mapping = { schemaId: "s", fields: [{ fieldId: "n", tag: "N" }], maxAgeMs: 2000, maxSkewMs: 250 };
const captured = (bad = false) => { const now = Date.now(); return captureRecipePlc(mapping, schema, snapshot.revision, "b".repeat(64), [{ name: "N", dataType: "Real", access: "read" }], () => ({ connectionId: "c", protocol: "mqtt", state: "connected", sample: { value: 0, qualityCode: bad ? 0 : 192, receivedAt: now } }), now); };
const clean: (() => void)[] = [];
afterEach(() => { for (const stop of clean.splice(0).reverse()) stop(); document.body.replaceChildren(); sessionStorage.clear(); session.id = "operator"; session.capabilities = ["recipes.read", "recipes.capture", "recipes.create"]; });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
async function fixture(value = captured()) {
  const request = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).includes("/recipe-plc?") ? value : snapshot)));
  const client = createHmiRecipeClient({ scope: "capture", request }), host = document.createElement("main"); document.body.append(host);
  const control = createHmiRecipeControl(host, { client, confirm: () => true }); clean.push(() => client.dispose(), () => control.dispose());
  button(host, "Rileggi archivio").click(); await vi.waitFor(() => expect(button(host, "Leggi valori PLC")).toBeDefined());
  return { request, client, host, control };
}
describe("manual PLC recipe comparison", () => {
  it("does no automatic PLC read and creates only a draft, preserving zero", async () => {
    const test = await fixture(); expect(test.request).toHaveBeenCalledTimes(1);
    button(test.host, "Leggi valori PLC").click(); await vi.waitFor(() => expect(button(test.host, "Crea bozza dai valori letti")).toBeDefined());
    expect(test.host.textContent).toContain("Diverso dalla ricetta"); expect(test.host.textContent).toContain("non è una lettura simultanea");
    expect(String(test.request.mock.calls[1][0])).toContain("schemaId=s&expectedRevision="); expect(test.client.pending).toBeUndefined();
    button(test.host, "Crea bozza dai valori letti").click(); expect(test.host.querySelector<HTMLInputElement>('[aria-label="Numero"]')?.value).toBe("0"); expect(test.host.querySelector<HTMLInputElement>('[aria-label="Nome ricetta"]')?.value).toBe(""); expect(test.request).toHaveBeenCalledTimes(2); expect(test.host.textContent).toContain("Non sono valori live");
    expect(test.request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("shows field causes but cannot copy incomplete samples", async () => {
    const test = await fixture(captured(true)); button(test.host, "Leggi valori PLC").click(); await vi.waitFor(() => expect(button(test.host, "Crea bozza dai valori letti")).toBeDefined());
    expect(button(test.host, "Crea bozza dai valori letti").disabled).toBe(true); expect(test.host.textContent).toContain("Qualità del segnale"); expect(test.host.querySelector("form")).toBeNull();
  });
  it("requires separate capture and create capabilities, not browser role or read alone", async () => {
    session.capabilities = ["recipes.read"]; const test = await fixture(); expect(button(test.host, "Leggi valori PLC").disabled).toBe(true);
    session.capabilities.push("recipes.capture"); test.control.refresh(); button(test.host, "Leggi valori PLC").click(); await vi.waitFor(() => expect(button(test.host, "Crea bozza dai valori letti")).toBeDefined()); expect(button(test.host, "Crea bozza dai valori letti").disabled).toBe(true);
  });
  it("ignores late data after logout and aborts capture without recording a pending write", async () => {
    const test = await fixture(); let finish!: (response: Response) => void; test.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    button(test.host, "Leggi valori PLC").click(); session.id = ""; window.dispatchEvent(new Event("framecraft:user-changed")); finish(new Response(JSON.stringify(captured())));
    await vi.waitFor(() => expect(test.client.busy).toBe(false)); expect(test.host.textContent).toContain("Accesso cambiato"); expect(test.host.querySelector("article")).toBeNull(); expect(test.client.pending).toBeUndefined(); expect(sessionStorage.length).toBe(0);
  });
  it("rejects a forged PLC confirmation and emits only safe diagnostic codes", async () => {
    const report = vi.fn(), client = createHmiRecipeClient({ scope: "invalid", report, request: async () => new Response(JSON.stringify({ ...captured(), plcConfirmed: true })) }); clean.push(() => client.dispose());
    await expect(client.capture(schema, snapshot.revision)).rejects.toMatchObject({ code: "RECIPE_PLC_RESPONSE", uncertain: false }); expect(report).toHaveBeenCalledWith({ code: "RECIPE_PLC_RESPONSE", requestId: undefined, uncertain: false }); expect(client.pending).toBeUndefined();
  });
});
