import { mkdir, mkdtemp, readFile, writeFile, symlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalOperatorAuth } from "../runtime/operator-auth.mjs";
import { hashOperatorPassword, parseOperatorStore, readOperatorStore, verifyOperatorPassword, writeOperatorStore, type OperatorStore, type OperatorPassword } from "../runtime/operator-store.mjs";
import { parseOperatorAuthConfig, defaultOperatorResources, type OperatorAuthConfig } from "../runtime/operator-policy.mjs";

const origin = "http://127.0.0.1:4173", password = "SYNTHETIC-password-012345";
let hash: OperatorPassword;
beforeAll(async () => { hash = await hashOperatorPassword(password); }, 15000);
const request = (headers: Record<string, string> = {}) => ({ headers: { origin, ...headers } }) as IncomingMessage;
async function fixture(options: Partial<OperatorAuthConfig> = {}) {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, "operator-auth-")), file = path.join(directory, "operators.json");
  const store: OperatorStore = { version: 1, id: randomUUID(), accounts: [{ id: randomUUID(), username: "operator", name: "Operatore sintetico", role: "Etichetta non privilegiata", disabled: false, capabilities: ["recipes.read", "recipes.create"], permissions: ["parametri"], password: hash }] };
  await writeOperatorStore(file, store, undefined); let time = 0;
  const config: OperatorAuthConfig = { version: 1, namespace: randomUUID(), enabled: true, allowHttpLoopback: true, idleMinutes: 1, absoluteMinutes: 2, ...options };
  const events: unknown[] = [], auth = createLocalOperatorAuth({ file, config, allowedOrigins: [origin], audit: { append: () => {} }, now: () => time, onEvent: event => events.push(event) });
  return { auth, file, store, config, events, tick: (ms: number) => { time += ms; } };
}
async function login(test: Awaited<ReturnType<typeof fixture>>) {
  const result = await test.auth.login(request(), { username: "operator", password });
  const cookie = result.cookie.split(";")[0]; return { result, headers: { cookie, "x-framecraft-csrf": result.body.csrfToken! } };
}
describe("account locali server", () => {
  it("nessuna sessione utilizzabile senza audit; il logout revoca anche se il registro fallisce", async () => {
    const test = await fixture(); try {
      const audit = { append: () => { throw new Error("SYNTHETIC_PRIVATE_SQL_ERROR"); } }, blocked = createLocalOperatorAuth({ file: test.file, config: test.config, allowedOrigins: [origin], audit });
      try { await expect(blocked.login(request(), { username: "operator", password })).rejects.toMatchObject({ code: "AUTH_AUDIT" }); expect((await blocked.status(request())).user).toBeNull(); } finally { blocked.close(); }
      const toggle = { append: (_event: unknown) => {} }, auth = createLocalOperatorAuth({ file: test.file, config: test.config, allowedOrigins: [origin], audit: toggle });
      try { const signed = await auth.login(request(), { username: "operator", password }), headers = { cookie: signed.cookie.split(";")[0], "x-framecraft-csrf": signed.body.csrfToken! }; toggle.append = () => { throw new Error(); }; await expect(auth.logout(request(headers))).rejects.toMatchObject({ code: "AUTH_AUDIT_UNCERTAIN" }); expect((await auth.status(request(headers))).user).toBeNull(); } finally { auth.close(); }
    } finally { test.auth.close(); }
  }, 15000);
  it("limiti risorse effettivi per tag, allarmi e schemi; capacità e contesto sempre necessari", async () => {
    const test = await fixture(); try {
      const limits = { tagWrites: { mode: "selected" as const, ids: ["Speed"] }, alarmActions: { mode: "selected" as const, ids: ["a1"] }, recipeChanges: { mode: "selected" as const, ids: ["s1"] } };
      const current = (await readOperatorStore(test.file))!;
      const store: OperatorStore = { ...test.store, version: 2, accounts: [{ ...test.store.accounts[0], capabilities: ["tags.write", "alarms.acknowledge", "alarms.confirm", "recipes.create", "recipes.update", "recipes.copy", "recipes.rename", "recipes.delete", "recipes.read"] }], resourceRules: [{ accountId: test.store.accounts[0].id, limits }] };
      await writeOperatorStore(test.file, store, current.revision); const signed = await login(test), req = request(signed.headers);
      for (const [capability, allowed, denied] of [["tags.write", { tag: "Speed" }, { tag: "speed" }], ["alarms.acknowledge", { alarmId: "a1" }, { alarmId: "a2" }], ["alarms.confirm", { alarmId: "a1" }, { alarmId: "a2" }], ...["create", "update", "copy", "rename", "delete"].map(action => ["recipes." + action, { schemaId: "s1" }, { schemaId: "s2" }])] as const) {
        await expect(test.auth.authorize(req, capability as never, true, allowed as never)).resolves.toMatch(/^local:/);
        await expect(test.auth.authorize(req, capability as never, true, denied as never)).rejects.toMatchObject({ code: "AUTH_RESOURCE" });
        await expect(test.auth.authorize(req, capability as never)).rejects.toMatchObject({ code: "AUTH_RESOURCE" });
      }
      await expect(test.auth.authorize(req, "recipes.read", false)).resolves.toMatch(/^local:/);
      const next = (await readOperatorStore(test.file))!; store.accounts[0].capabilities = ["recipes.read"]; store.resourceRules[0].limits = defaultOperatorResources(true); await writeOperatorStore(test.file, store, next.revision);
      await expect(test.auth.authorize(req, "tags.write", true, { tag: "Speed" })).rejects.toMatchObject({ code: "AUTH_REQUIRED" }); const fresh = await login(test);
      await expect(test.auth.authorize(request(fresh.headers), "tags.write", true, { tag: "Speed" })).rejects.toMatchObject({ code: "AUTH_PERMISSION" });
      expect(JSON.stringify(test.events)).toContain("AUTH_RESOURCE"); expect(JSON.stringify(test.events)).not.toContain("Speed"); expect(JSON.stringify(test.events)).not.toContain(password);
    } finally { test.auth.close(); }
  }, 15000);
  it("usa salt casuale, scrypt e password lunghe, senza PIN o privilegi impliciti", async () => {
    const second = await hashOperatorPassword(password); expect(hash.salt).not.toBe(second.salt);
    expect(hash).toMatchObject({ N: 131072, r: 8, p: 1, algorithm: "scrypt" });
    expect(await verifyOperatorPassword(password, hash)).toBe(true); expect(await verifyOperatorPassword("wrong-password-012345", hash)).toBe(false);
    await expect(hashOperatorPassword("1234")).rejects.toMatchObject({ code: "AUTH_INPUT" });
    const test = await fixture(); try { expect(test.store.accounts[0].capabilities).not.toContain("tags.write"); expect(JSON.stringify(await readOperatorStore(test.file))).not.toContain(password); }
    finally { test.auth.close(); }
  }, 15000);
  it("convalida schema, costi hash, duplicati e configurazione senza riparazioni", async () => {
    const test = await fixture(); try {
      for (const change of [{ ...test.store, version: 2 }, { ...test.store, accounts: [...test.store.accounts, test.store.accounts[0]] }, { ...test.store, accounts: [{ ...test.store.accounts[0], capabilities: ["admin"] }] }, { ...test.store, accounts: [{ ...test.store.accounts[0], password: { ...hash, N: 2 ** 25 } }] }]) expect(() => parseOperatorStore(change)).toThrow();
      expect(() => parseOperatorAuthConfig({ ...test.config, unexpected: true })).toThrow();
      expect(() => createLocalOperatorAuth({ file: test.file, config: { ...test.config, allowHttpLoopback: false }, allowedOrigins: [origin] })).toThrow();
      expect(() => createLocalOperatorAuth({ file: test.file, config: test.config, allowedOrigins: ["http://machine.local"] })).toThrow();
      await writeFile(test.file, "SYNTHETIC_CORRUPT_STORE"); await expect(test.auth.status(request())).rejects.toMatchObject({ code: "AUTH_STORE" }); expect(await readFile(test.file, "utf8")).toBe("SYNTHETIC_CORRUPT_STORE");
    } finally { test.auth.close(); }
  });
  it("sessione opaca, cookie protetto e permessi verificati a ogni azione", async () => {
    const test = await fixture(); try {
      expect(await test.auth.status(request())).toEqual({ user: null, csrfToken: null, expiresInMs: 0 });
      const { result, headers } = await login(test); expect(result.cookie).toContain("HttpOnly; SameSite=Strict"); expect(result.cookie).toContain("Path=/_framecraft/plc/v1"); expect(result.cookie).not.toContain(password);
      const actor = await test.auth.authorize(request(headers), "recipes.create"); expect(actor).toBe(`local:${test.store.id}:${test.store.accounts[0].id}`);
      await expect(test.auth.authorize(request(headers), "tags.write")).rejects.toMatchObject({ code: "AUTH_PERMISSION" });
      await expect(test.auth.authorize(request({ cookie: headers.cookie }), "recipes.create")).rejects.toMatchObject({ code: "AUTH_CSRF" });
      await expect(test.auth.authorize(request({ ...headers, origin: "http://evil.invalid" }), "recipes.create")).rejects.toMatchObject({ code: "AUTH_ORIGIN" });
      await expect(test.auth.authorize(request({ ...headers, "sec-fetch-site": "cross-site" }), "recipes.create")).rejects.toMatchObject({ code: "AUTH_ORIGIN" });
      await expect(test.auth.authorize(request({ "x-operator": "admin", "x-framecraft-csrf": headers["x-framecraft-csrf"] }), "recipes.create")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      await test.auth.logout(request(headers)); await expect(test.auth.authorize(request(headers), "recipes.read", false)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      const logs = JSON.stringify(test.events); expect(logs).not.toContain(password); expect(logs).not.toContain(result.body.csrfToken!); expect(logs).not.toContain(headers.cookie);
    } finally { test.auth.close(); }
  });
  it("rotazione, cookie duplicati e Secure obbligatorio fuori dallo sviluppo", async () => {
    const test = await fixture(); try {
      const first = await login(test), second = await test.auth.login(request(first.headers), { username: "operator", password });
      await expect(test.auth.authorize(request(first.headers), "recipes.read", false)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      const cookie = second.cookie.split(";")[0]; expect((await test.auth.status(request({ cookie }))).user?.name).toBe("Operatore sintetico"); expect((await test.auth.status(request({ cookie: cookie + "; " + cookie }))).user).toBeNull();
      const secure = createLocalOperatorAuth({ file: test.file, config: { ...test.config, allowHttpLoopback: false }, allowedOrigins: ["https://panel.example"], audit: { append: () => {} } });
      try { const result = await secure.login(request({ origin: "https://panel.example" }), { username: "operator", password }); expect(result.cookie).toMatch(/^__Secure-/); expect(result.cookie).toContain("; Secure"); }
      finally { secure.close(); }
    } finally { test.auth.close(); }
  }, 15000);
  it("polling e letture non rinnovano la sessione; rinnovo comandi non supera durata massima", async () => {
    const test = await fixture(); try {
      const { headers } = await login(test); test.tick(40000); expect((await test.auth.status(request(headers))).expiresInMs).toBe(20000); await test.auth.authorize(request(headers), "recipes.read", false);
      test.tick(20001); expect((await test.auth.status(request(headers))).user).toBeNull();
      const next = await login(test); test.tick(50000); await test.auth.authorize(request(next.headers), "recipes.create"); test.tick(50000); await test.auth.authorize(request(next.headers), "recipes.create"); test.tick(20001);
      await expect(test.auth.authorize(request(next.headers), "recipes.create")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    } finally { test.auth.close(); }
  });
  it("revoca accessi dopo ogni modifica account, disabilitazione o riavvio", async () => {
    const test = await fixture(); try {
      const { headers } = await login(test), current = await readOperatorStore(test.file); test.store.accounts[0].disabled = true;
      await writeOperatorStore(test.file, test.store, current!.revision);
      await expect(test.auth.authorize(request(headers), "recipes.create")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      await expect(test.auth.login(request(), { username: "operator", password })).rejects.toMatchObject({ code: "AUTH_CREDENTIALS" });
      test.auth.close(); await expect(test.auth.status(request(headers))).rejects.toMatchObject({ code: "AUTH_CONFIG" });
    } finally { test.auth.close(); }
  });
  it("account ignoto, password errata e account disabilitato non rivelano l’account; limita tentativi", async () => {
    const test = await fixture(); try {
      for (const username of ["operator", "unknown"]) await expect(test.auth.login(request(), { username, password: "wrong-password-012345" })).rejects.toMatchObject({ code: "AUTH_CREDENTIALS", status: 401 });
      for (let i = 0; i < 4; i++) await expect(test.auth.login(request(), { username: "operator", password: "wrong-password-012345" })).rejects.toMatchObject({ code: "AUTH_CREDENTIALS" });
      await expect(test.auth.login(request(), { username: "operator", password })).rejects.toMatchObject({ code: "AUTH_THROTTLED" });
      test.tick(60001); expect((await login(test)).result.body.user?.name).toBe("Operatore sintetico");
    } finally { test.auth.close(); }
  }, 20000);
  it("limita derivazioni simultanee e non crea sessioni dopo l’arresto", async () => {
    const test = await fixture(); try {
      const results = await Promise.allSettled(Array.from({ length: 3 }, () => test.auth.login(request(), { username: "operator", password })));
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2);
      expect(results.filter(result => result.status === "rejected").map(result => result.reason)).toMatchObject([{ code: "AUTH_BUSY" }]);
    } finally { test.auth.close(); }
    const stopped = await fixture(); const pending = expect(stopped.auth.login(request(), { username: "operator", password })).rejects.toMatchObject({ code: "AUTH_CONFIG" });
    setTimeout(() => stopped.auth.close(), 20); await pending; expect(stopped.events).not.toContainEqual(expect.objectContaining({ code: "AUTH_LOGIN" }));
  }, 15000);
  it("scrittura account CAS, nessuna sovrascrittura su conflitto o lock e niente symlink", async () => {
    const test = await fixture(); try {
      const before = await readFile(test.file, "utf8"); await expect(writeOperatorStore(test.file, test.store, undefined)).rejects.toMatchObject({ code: "AUTH_CONFLICT" }); expect(await readFile(test.file, "utf8")).toBe(before);
      await writeFile(path.join(path.dirname(test.file), "operators.lock"), "SYNTHETIC_OTHER_OWNER"); await expect(writeOperatorStore(test.file, test.store, (await readOperatorStore(test.file))!.revision)).rejects.toMatchObject({ code: "AUTH_BUSY" }); expect(await readFile(test.file, "utf8")).toBe(before);
      const linked = path.join(path.dirname(test.file), "linked"); await symlink(path.dirname(test.file), linked, process.platform === "win32" ? "junction" : "dir"); await expect(readOperatorStore(path.join(linked, "operators.json"))).rejects.toMatchObject({ code: "AUTH_STORE" });
    } finally { test.auth.close(); }
  });
});
