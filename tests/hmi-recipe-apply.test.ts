// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/core/hmiOperatorSession", () => ({ operatorSessionProfile: vi.fn(), operatorSessionHeaders: () => ({}) }));
import { operatorSessionProfile } from "../src/core/hmiOperatorSession";
import { createHmiRecipeClient } from "../src/core/hmiRecipeClient";
import { createHmiRecipeControl } from "../src/core/hmiRecipeControl";
const snapshot = { version: 1, revision: "b".repeat(64), sequence: 0, persistence: "server-file", schemas: [{ id: "s", name: "Formato", fields: [{ id: "n", name: "Numero", type: "number" }, { id: "b", name: "Abilitato", type: "boolean" }, { id: "t", name: "Nota", type: "string" }], records: [{ id: "r", name: "Formato A", values: { n: 0, b: false, t: "" } }] }] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function receipt(command: Record<string, unknown>, overrides = {}) { return { type: "recipe-apply", version: 1, ledgerId: "00000000-0000-4000-8000-000000000001", id: command.id, schemaId: "s", recordId: "r", recipeRevision: snapshot.revision, mappingRevision: "c".repeat(64), channelId: "line1", sequence: 1, phase: "finished", writePhase: "apply", outcome: "applied", code: "RECIPE_APPLY_CONFIRMED", plcCode: 0, createdAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z", duplicate: false, effect: "plc-recipe", plcConfirmed: true, ...overrides }; }
let host: HTMLElement, control: ReturnType<typeof createHmiRecipeControl>, client: ReturnType<typeof createHmiRecipeClient>;
const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
async function fixture() {
  let lost = false, missing = false, actual: Record<string, unknown> | undefined; const commands: { route: string; body: Record<string, unknown> }[] = [], values = new Map<string, string>();
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const route = String(url).replace("/_framecraft/plc/v1/", ""), body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) commands.push({ route, body });
    if (route === "recipes") return response(snapshot);
    if (route.startsWith("recipe-apply/current?")) return response({ type: "recipe-apply-current", version: 1, ledgerId: "00000000-0000-4000-8000-000000000001", current: null });
    if (route === "recipe-apply") { if (!missing) actual = receipt(body); if (lost) throw Error("SYNTHETIC_PRIVATE_NETWORK_FAILURE"); return response(actual); }
    if (route.startsWith("recipe-apply?")) return actual ? response(actual) : response({ type: "recipe-apply", code: "RECIPE_APPLY_MISSING", outcome: "rejected", effect: "plc-recipe", plcConfirmed: false }, 404);
    if (route === "recipe-apply/fence") { actual = receipt(body, { outcome: "rejected", writePhase: "none", code: "RECIPE_APPLY_NOT_SENT", plcCode: null, plcConfirmed: false }); return response(actual, 422); }
    throw Error("Unexpected route " + route);
  });
  client = createHmiRecipeClient({ scope: "ui-apply", request, journal: { getItem: key => values.get(key) ?? null, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } } });
  host = document.createElement("div"); document.body.append(host); const confirm = vi.fn(() => true); control = createHmiRecipeControl(host, { client, confirm }); button("Rileggi archivio").click(); await settle();
  return { request, commands, values, confirm, set lost(value: boolean) { lost = value; }, set missing(value: boolean) { missing = value; } };
}
beforeEach(() => { vi.mocked(operatorSessionProfile).mockReturnValue({ id: "user", name: "Operatore", role: "Admin", permissions: [], capabilities: ["recipes.apply", "recipes.read"] }); });
afterEach(() => { control?.dispose(); client?.dispose(); host?.remove(); });
describe("operator recipe application workflow", () => {
  it("reads the channel and reviews 0, false and empty text before the only explicit apply", async () => {
    const test = await fixture(); expect(test.commands).toHaveLength(0); button("Rivedi applicazione al PLC").click(); await settle(); expect(button("Conferma applicazione al PLC").disabled).toBe(true); expect(host.textContent).toContain("Falso"); expect(host.textContent).toContain("(testo vuoto)"); expect(test.commands).toHaveLength(0); expect(button("Modifica ricetta").disabled).toBe(true);
    host.querySelector<HTMLInputElement>('[data-recipe-apply-ack]')!.click(); expect(button("Conferma applicazione al PLC").disabled).toBe(false); button("Conferma applicazione al PLC").click(); await settle();
    expect(test.commands.map(command => command.route)).toEqual(["recipe-apply"]); expect(test.commands[0].body).not.toHaveProperty("values"); expect(host.textContent).toContain("Applicazione confermata dal programma PLC"); expect(host.textContent).toContain("conferma storica"); expect(host.textContent).toContain("Formato A"); expect(test.values.size).toBe(0);
  });
  it("keeps an unknown outcome locked and verifies a received command without reapplying", async () => {
    const test = await fixture(); test.lost = true; button("Rivedi applicazione al PLC").click(); await settle(); host.querySelector<HTMLInputElement>('[data-recipe-apply-ack]')!.click(); button("Conferma applicazione al PLC").click(); await settle(); expect(client.apply.pending).toBeDefined(); expect(button("Rivedi applicazione al PLC").disabled).toBe(true); expect(host.textContent).not.toContain("SYNTHETIC_PRIVATE");
    button("Verifica esito applicazione").click(); await settle(); expect(client.apply.pending).toBeUndefined(); expect(test.commands.map(command => command.route)).toEqual(["recipe-apply"]); expect(host.textContent).toContain("Applicazione confermata dal programma PLC");
  });
  it("does not clear missing requests until an explicit durable fence, and never calls apply twice", async () => {
    const test = await fixture(); test.lost = true; test.missing = true; button("Rivedi applicazione al PLC").click(); await settle(); host.querySelector<HTMLInputElement>('[data-recipe-apply-ack]')!.click(); button("Conferma applicazione al PLC").click(); await settle(); button("Verifica esito applicazione").click(); await settle(); expect(client.apply.pending).toBeDefined(); expect(button("Chiudi richiesta non avviata")).toBeDefined(); button("Chiudi richiesta non avviata").click(); await settle();
    expect(test.confirm).toHaveBeenCalledTimes(1); expect(test.commands.map(command => command.route)).toEqual(["recipe-apply", "recipe-apply/fence"]); expect(client.apply.pending).toBeUndefined(); expect(host.textContent).toContain("Richiesta non inviata al PLC");
  });
  it("removes the review after a user change and never trusts a browser role as a capability", async () => {
    const test = await fixture(); button("Rivedi applicazione al PLC").click(); await settle(); expect(host.querySelector('[data-recipe-apply-ack]')).not.toBeNull(); vi.mocked(operatorSessionProfile).mockReturnValue({ id: "other", name: "Altro", role: "Admin", permissions: [], capabilities: ["recipes.read"] }); window.dispatchEvent(new Event("framecraft:user-changed")); expect(host.querySelector('[data-recipe-apply-ack]')).toBeNull(); button("Rileggi archivio").click(); await settle(); expect(button("Rivedi applicazione al PLC")).toBeUndefined(); expect(test.commands).toHaveLength(0);
  });
});
