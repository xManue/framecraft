import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { beforeAll, expect, it } from "vitest";
import { createPlcGateway } from "../runtime/gateway.mjs";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { hashOperatorPassword, writeOperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
const origin = "http://127.0.0.1:4173", token = "synthetic_audit_token_01234567890123456789", password = "SYNTHETIC-audit-password-012345";
let hash: OperatorPassword;
beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
async function fixture(readAllowed = true) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "audit-gateway-")), file = path.join(root, "operators.json");
  await writeOperatorStore(file, { version: 1, id: randomUUID(), accounts: [{ id: randomUUID(), username: "auditor", name: "Audit sintetico", role: "Supervisore", disabled: false, capabilities: readAllowed ? ["audit.read"] : [], permissions: [], password: hash }] }, undefined);
  const namespace = randomUUID(), audit = openRuntimeAudit({ root, namespace }); let now = 0;
  const auth = createLocalOperatorAuth({ file, config: { version: 1, enabled: true, namespace, allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2 }, allowedOrigins: [origin], audit, now: () => now });
  const gateway = createPlcGateway({ version: 1, gateway: { enabled: true, port: 0, tokenEnv: "SYNTHETIC_AUDIT_TOKEN", allowedOrigins: [origin] }, connections: [] }, [], { resolveSecret: () => token, operatorAuth: auth, audit });
  await gateway.start();
  const request = (route: string, input?: unknown, headers: Record<string, string> = {}) => fetch(gateway.address + "/_framecraft/plc/v1/" + route, { method: input === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const login = async () => { const response = await request("session/login", { username: "auditor", password }); expect(response.status).toBe(200); return { Cookie: response.headers.get("set-cookie")!.split(";")[0] }; };
  return { audit, request, login, advance: (time: number) => { now = time; }, close: async () => { await gateway.stop(); audit.close(); } };
}
it("il solo token di trasporto non permette di leggere il registro", async () => {
  const test = await fixture(); try { const result = await test.request("audit"); expect(result.status).toBe(401); expect(await result.json()).toMatchObject({ code: "AUTH_REQUIRED" }); } finally { await test.close(); }
});
it("un ruolo chiamato Supervisore non concede audit.read", async () => {
  const test = await fixture(false); try { const result = await test.request("audit", undefined, await test.login()); expect(result.status).toBe(403); expect(await result.json()).toMatchObject({ code: "AUTH_PERMISSION" }); } finally { await test.close(); }
});
it("legge soltanto con capacità dedicata, senza scritture, rinnovo idle o credenziali nel risultato", async () => {
  const test = await fixture(); try {
    const headers = await test.login(), sequence = test.audit.read().sequence; test.advance(30000);
    const result = await test.request("audit?operation=session.login&limit=1", undefined, headers); expect(result.status).toBe(200);
    const text = await result.text(), snapshot = JSON.parse(text); expect(snapshot).toMatchObject({ verified: true, sequence }); expect(snapshot.events).toHaveLength(1);
    for (const secret of [token, password, "scrypt", "csrfToken"]) expect(text).not.toContain(secret);
    expect(test.audit.read().sequence).toBe(sequence);
    test.advance(60001); expect((await test.request("audit", undefined, headers)).status).toBe(401);
  } finally { await test.close(); }
});
it("rifiuta parametri duplicati, query non valide e metodi di scrittura", async () => {
  const test = await fixture(); try {
    const headers = await test.login();
    for (const route of ["audit?limit=1&limit=2", "audit?password=x", "audit?from=bad"]) expect((await test.request(route, undefined, headers)).status).toBe(400);
    expect((await test.request("audit", {}, headers)).status).toBe(400);
  } finally { await test.close(); }
});
