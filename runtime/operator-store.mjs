import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { open, lstat, realpath, rename, link, unlink } from "node:fs/promises";
import path from "node:path";

import { operatorCapabilities, OperatorAuthError, operatorKeys, operatorText, operatorUsername } from "./operator-policy.mjs";
export { operatorCapabilities, OperatorAuthError, operatorObject, operatorKeys, operatorText, operatorUsername } from "./operator-policy.mjs";
const fail = code => { throw new OperatorAuthError(code); };
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const base64 = (value, bytes) => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").length === bytes && Buffer.from(value, "base64url").toString("base64url") === value;
const passwordValid = value => typeof value === "string" && [...value].length >= 12 && value.length <= 256 && Buffer.byteLength(value, "utf8") <= 1024 && !value.includes("\0");
function passwordHash(value) { if (!operatorKeys(value, ["algorithm", "N", "r", "p", "salt", "key"]) || value.algorithm !== "scrypt" || value.N !== 131072 || value.r !== 8 || value.p !== 1 || !base64(value.salt, 32) || !base64(value.key, 64)) fail("AUTH_STORE"); return { ...value }; }
const derive = (password, salt) => new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
export async function hashOperatorPassword(password) {
  if (!passwordValid(password)) fail("AUTH_INPUT");
  const salt = randomBytes(32), key = await derive(password, salt);
  try { return { algorithm: "scrypt", N: 131072, r: 8, p: 1, salt: salt.toString("base64url"), key: key.toString("base64url") }; } finally { key.fill(0); }
}
export async function verifyOperatorPassword(password, raw) {
  const hash = passwordHash(raw); if (!passwordValid(password)) return false;
  const actual = await derive(password, Buffer.from(hash.salt, "base64url")), expected = Buffer.from(hash.key, "base64url");
  try { return timingSafeEqual(actual, expected); } finally { actual.fill(0); expected.fill(0); }
}
export function parseOperatorStore(input) {
  let value; try { const source = typeof input === "string" ? input : JSON.stringify(input); if (Buffer.byteLength(source, "utf8") > 131072) fail("AUTH_STORE"); value = JSON.parse(source); } catch { fail("AUTH_STORE"); }
  if (!operatorKeys(value, ["version", "id", "accounts"]) || value.version !== 1 || !uuid(value.id) || !Array.isArray(value.accounts) || value.accounts.length > 64) fail("AUTH_STORE");
  const ids = new Set(), usernames = new Set();
  const accounts = value.accounts.map(account => {
    if (!operatorKeys(account, ["id", "username", "name", "role", "disabled", "capabilities", "permissions", "password"]) || !uuid(account.id) || ids.has(account.id) || !operatorUsername(account.username) || usernames.has(account.username) || !operatorText(account.name) || !operatorText(account.role, 80) || typeof account.disabled !== "boolean") fail("AUTH_STORE");
    if (!Array.isArray(account.capabilities) || account.capabilities.length > operatorCapabilities.length || new Set(account.capabilities).size !== account.capabilities.length || account.capabilities.some(id => !operatorCapabilities.includes(id))) fail("AUTH_STORE");
    if (!Array.isArray(account.permissions) || account.permissions.length > 64 || new Set(account.permissions).size !== account.permissions.length || account.permissions.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id))) fail("AUTH_STORE");
    ids.add(account.id); usernames.add(account.username); return { id: account.id, username: account.username, name: account.name, role: account.role, disabled: account.disabled, capabilities: [...account.capabilities], permissions: [...account.permissions], password: passwordHash(account.password) };
  });
  return { version: 1, id: value.id, accounts };
}
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.isFile() && b.isFile() && a.nlink === 1 && b.nlink === 1;
const comparable = value => process.platform === "win32" ? value.toLowerCase() : value;
async function directoryFor(file) {
  if (typeof file !== "string" || !path.isAbsolute(file) || path.basename(file) !== "operators.json") fail("AUTH_STORE");
  const directory = path.dirname(file), stat = await lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink() || comparable(await realpath(directory)) !== comparable(path.resolve(directory))) fail("AUTH_STORE"); return directory;
}
export async function readOperatorStore(file) {
  let handle;
  try {
    await directoryFor(file); let before; try { before = await lstat(file); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 131072) fail("AUTH_STORE");
    handle = await open(file, "r"); if (!same(before, await handle.stat())) fail("AUTH_STORE");
    const bytes = Buffer.alloc(131073); let bytesRead = 0;
    while (bytesRead < bytes.length) { const read = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead); if (!read.bytesRead) break; bytesRead += read.bytesRead; }
    if (bytesRead > 131072 || bytesRead !== before.size) fail("AUTH_STORE");
    const after = await lstat(file); if (!same(before, after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail("AUTH_CONFLICT");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)); return { store: parseOperatorStore(source), revision: digest(source) };
  } catch (error) { if (error instanceof OperatorAuthError) throw error; fail("AUTH_STORE"); } finally { await handle?.close().catch(() => {}); }
}
/** Administration only. HTTP sessions never create, reset or repair credential files. */
export async function writeOperatorStore(file, input, expectedRevision) {
  const store = parseOperatorStore(input), source = JSON.stringify(store, null, 2) + "\n"; if (Buffer.byteLength(source) > 131072) fail("AUTH_STORE");
  let directory, lock, lockStat, output, temporary, created = false, publishing = false;
  try {
    directory = await directoryFor(file); const lockFile = path.join(directory, "operators.lock");
    try { lock = await open(lockFile, "wx", 0o600); } catch (error) { if (error.code === "EEXIST") fail("AUTH_BUSY"); throw error; }
    lockStat = await lock.stat(); await lock.writeFile(JSON.stringify({ pid: process.pid, id: randomUUID(), at: new Date().toISOString() })); await lock.sync();
    const current = await readOperatorStore(file); if (current?.revision !== expectedRevision) fail("AUTH_CONFLICT");
    temporary = path.join(directory, ".operators-" + randomUUID() + ".tmp"); output = await open(temporary, "wx", 0o600); created = true; await output.writeFile(source, "utf8"); await output.sync(); await output.close(); output = undefined;
    await directoryFor(file); if ((await readOperatorStore(file))?.revision !== expectedRevision) fail("AUTH_CONFLICT");
    publishing = true; if (expectedRevision === undefined) { await link(temporary, file); await unlink(temporary); } else await rename(temporary, file); created = false;
    if (process.platform !== "win32") { const folder = await open(directory, "r"); try { await folder.sync(); } finally { await folder.close(); } }
    return { store, revision: digest(source) };
  } catch (error) { if (publishing) fail("AUTH_UNCERTAIN"); if (error instanceof OperatorAuthError) throw error; fail("AUTH_STORE"); }
  finally {
    await output?.close().catch(() => {}); if (created) await unlink(temporary).catch(() => {});
    if (lock) { const lockFile = path.join(directory, "operators.lock"); try { if (same(lockStat, await lstat(lockFile))) await unlink(lockFile); } catch { /* Never remove a lock no longer owned by this operation. */ } await lock.close().catch(() => {}); }
  }
}
