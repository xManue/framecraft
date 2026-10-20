import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readOperatorStore, verifyOperatorPassword } from "./operator-store.mjs";
import { OperatorAuthError, operatorKeys, operatorUsername, operatorCapabilities, parseOperatorAuthConfig, operatorResourceAllowed } from "./operator-policy.mjs";
import { auditContext, appendAudit } from "./audit-operation.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const equal = (a, b) => { if (typeof a !== "string" || typeof b !== "string") return false; const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
const fail = (code, actor) => { const error = new OperatorAuthError(code); if (actor) error.actor = actor; throw error; };
const token = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const dummy = { algorithm: "scrypt", N: 131072, r: 8, p: 1, salt: secret(), key: randomBytes(64).toString("base64url") };

/** Single process authority. Restart and any credential-file change revoke all sessions. */
export function createLocalOperatorAuth(options) {
  const config = parseOperatorAuthConfig(options.config);
  if (!config.enabled || !Array.isArray(options.allowedOrigins) || !options.allowedOrigins.length) fail("AUTH_CONFIG");
  const origins = options.allowedOrigins.map(value => {
    let url; try { url = new URL(value); } catch { fail("AUTH_CONFIG"); }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== value || url.username || url.password || url.protocol !== "https:" && !(config.allowHttpLoopback && url.protocol === "http:" && local)) fail("AUTH_CONFIG");
    return value;
  });
  const secure = !config.allowHttpLoopback;
  if (!secure && origins.some(value => !value.startsWith("http://"))) fail("AUTH_CONFIG");
  const cookieName = (secure ? "__Secure-fc_" : "fc_dev_") + config.namespace.replaceAll("-", "");
  const cookie = (id, age) => `${cookieName}=${id}; Path=/_framecraft/plc/v1; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  const now = options.now ?? (() => performance.now()), sessions = new Map(), attempts = new Map();
  let revision, stopped = false, hashing = 0, globalAttempts = [];
  const event = (code, actor) => { try { options.onEvent?.({ type: "operator", code, ...(actor ? { actor } : {}), timestamp: new Date().toISOString() }); } catch { /* Logging cannot grant access. */ } };
  const origin = (request, mutation) => {
    if (stopped) fail("AUTH_CONFIG");
    const value = request.headers.origin;
    if (request.headers["sec-fetch-site"] === "cross-site" || value !== undefined && !origins.includes(value) || mutation && !origins.includes(value)) fail("AUTH_ORIGIN");
  };
  const sessionKey = request => {
    const raw = request.headers.cookie; if (raw === undefined) return undefined;
    if (typeof raw !== "string" || raw.length > 8192) fail("AUTH_REQUIRED");
    const found = raw.split(";").map(item => item.trim()).filter(item => item.startsWith(cookieName + "="));
    if (found.length > 1) fail("AUTH_REQUIRED");
    if (!found.length) return undefined;
    const value = found[0].slice(cookieName.length + 1); if (!token(value)) fail("AUTH_REQUIRED"); return digest(value);
  };
  const load = async () => {
    let current;
    try { current = await readOperatorStore(options.file); } catch (error) { sessions.clear(); throw error; }
    if (stopped) fail("AUTH_CONFIG");
    if (!current) { sessions.clear(); fail("AUTH_STORE"); }
    if (current.revision !== revision) { sessions.clear(); revision = current.revision; }
    return current;
  };
  const purge = () => { const time = now(); for (const [id, session] of sessions) if (session.absolute <= time || session.idle <= time) sessions.delete(id); };
  const active = async (request, mutation) => {
    origin(request, mutation); const current = await load(); purge();
    const key = sessionKey(request), session = key && sessions.get(key);
    if (!session) fail("AUTH_REQUIRED");
    const account = current.store.accounts.find(item => item.id === session.accountId && !item.disabled);
    if (!account) { sessions.delete(key); fail("AUTH_REQUIRED"); }
    if (mutation && !equal(session.csrf, request.headers["x-framecraft-csrf"])) fail("AUTH_CSRF", session.actor);
    return { key, session, account, store: current.store };
  };
  const profile = (session, account) => ({ user: { id: account.id, name: account.name, role: account.role, permissions: [...account.permissions], capabilities: [...account.capabilities] }, csrfToken: session.csrf, expiresInMs: Math.max(0, Math.min(session.idle, session.absolute) - now()) });
  return {
    async status(request) {
      try { const { session, account } = await active(request, false); return profile(session, account); }
      catch (error) { if (error instanceof OperatorAuthError && error.code === "AUTH_REQUIRED") return { user: null, csrfToken: null, expiresInMs: 0 }; throw error; }
    },
    async login(request, input) {
      origin(request, true);
      if (!operatorKeys(input, ["username", "password"]) || !operatorUsername(input.username) || typeof input.password !== "string" || input.password.length > 256 || input.password.includes("\0")) fail("AUTH_INPUT");
      const time = now(), key = digest(input.username);
      globalAttempts = globalAttempts.filter(at => at > time - 60000);
      for (const [id, times] of attempts) if (!times.some(at => at > time - 60000)) attempts.delete(id);
      const recent = (attempts.get(key) ?? []).filter(at => at > time - 60000);
      if (globalAttempts.length >= 30 || recent.length >= 5 || !attempts.has(key) && attempts.size >= 1024) { event("AUTH_THROTTLED"); fail("AUTH_THROTTLED"); }
      if (hashing >= 2) fail("AUTH_BUSY");
      globalAttempts.push(time); recent.push(time); attempts.set(key, recent);
      const current = await load(), account = current.store.accounts.find(item => item.username === input.username);
      if (hashing >= 2) fail("AUTH_BUSY");
      let verified; hashing++;
      try { verified = await verifyOperatorPassword(input.password, account?.password ?? dummy); }
      catch { fail("AUTH_STORE"); } finally { hashing--; }
      if (stopped) fail("AUTH_CONFIG");
      if ((await load()).revision !== current.revision) fail("AUTH_CONFLICT");
      if (!verified || !account || account.disabled) { event("AUTH_CREDENTIALS"); fail("AUTH_CREDENTIALS"); }
      purge(); const previous = sessionKey(request); if (previous) sessions.delete(previous);
      const sameAccount = [...sessions].filter(([, session]) => session.accountId === account.id);
      if (sameAccount.length >= 8) sessions.delete(sameAccount[0][0]);
      if (sessions.size >= 128) fail("AUTH_BUSY");
      const id = secret(), created = now(), session = { accountId: account.id, actor: `local:${current.store.id}:${account.id}`, csrf: secret(), absolute: created + config.absoluteMinutes * 60000, idle: created + config.idleMinutes * 60000 };
      const context = auditContext("session.login", null, null, session.actor);
      await appendAudit(options.audit, context, "requested", "LOGIN_VERIFIED");
      if (stopped || (await load()).revision !== current.revision) fail("AUTH_CONFLICT");
      sessions.set(digest(id), session);
      try { await appendAudit(options.audit, context, "authenticated", "AUTH_LOGIN"); } catch (error) { sessions.delete(digest(id)); throw error; }
      if (stopped || session.idle <= now() || session.absolute <= now()) { sessions.delete(digest(id)); fail("AUTH_CONFIG"); }
      event("AUTH_LOGIN", session.actor);
      return { body: profile(session, account), cookie: cookie(id, config.absoluteMinutes * 60) };
    },
    async logout(request) {
      const { key, session } = await active(request, true); sessions.delete(key); event("AUTH_LOGOUT", session.actor);
      try { await appendAudit(options.audit, auditContext("session.logout", null, null, session.actor), "logged-out", "AUTH_LOGOUT"); } catch { fail("AUTH_AUDIT_UNCERTAIN"); }
      return { body: { user: null, csrfToken: null, expiresInMs: 0 }, cookie: cookie("", 0) };
    },
    async authorize(request, capability, mutation = true, context) {
      if (!operatorCapabilities.includes(capability)) fail("AUTH_PERMISSION");
      const { session, account, store } = await active(request, mutation);
      if (!account.capabilities.includes(capability)) { event("AUTH_PERMISSION", session.actor); fail("AUTH_PERMISSION", session.actor); }
      if (!operatorResourceAllowed(store, account.id, capability, context)) { event("AUTH_RESOURCE", session.actor); fail("AUTH_RESOURCE", session.actor); }
      if (mutation) session.idle = Math.min(session.absolute, now() + config.idleMinutes * 60000);
      return session.actor;
    },
    close() { stopped = true; sessions.clear(); attempts.clear(); globalAttempts = []; },
  };
}
