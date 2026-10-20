import { mkdir, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readOperatorStore, writeOperatorStore, hashOperatorPassword, parseOperatorStore } from "./operator-store.mjs";
import { operatorKeys, OperatorAuthError, defaultOperatorResources, parseOperatorResources } from "./operator-policy.mjs";

const fail = code => { throw new OperatorAuthError(code); };
const comparable = value => process.platform === "win32" ? value.toLowerCase() : value;
async function directory(value, create) {
  if (create) { try { await mkdir(value, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") fail("AUTH_STORE"); } }
  let stat; try { stat = await lstat(value); } catch (error) { if (!create && error.code === "ENOENT") return false; fail("AUTH_STORE"); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || comparable(await realpath(value)) !== comparable(path.resolve(value))) fail("AUTH_STORE"); return true;
}
async function privateFile(root, create) {
  if (typeof root !== "string" || !path.isAbsolute(root) || !await directory(root, false)) fail("AUTH_STORE");
  for (const part of [path.join(root, ".framecraft-runtime"), path.join(root, ".framecraft-runtime", "security")]) if (!await directory(part, create)) return undefined;
  return path.join(root, ".framecraft-runtime", "security", "operators.json");
}
const summary = current => ({ version: current?.store.version ?? null, resourceRules: current?.store.resourceRules ?? [], revision: current?.revision ?? null, storeId: current?.store.id ?? null, accounts: (current?.store.accounts ?? []).map(({ id, username, name, role, disabled, capabilities, permissions }) => ({ id, username, name, role, disabled, capabilities, permissions })) });
/** Local desktop administration only; never expose this function as an HTTP route. */
export async function manageLocalOperators(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("AUTH_INPUT");
  const read = input.action === "read";
  const fields = { read: [], add: ["username", "name", "role", "capabilities", "permissions", "password"], update: ["id", "name", "role", "capabilities", "permissions"], password: ["id", "password"], disable: ["id", "disabled"], resources: ["id", "limits"] };
  if (!Object.hasOwn(fields, input.action) || !operatorKeys(input, ["root", "action", ...(read ? [] : ["expectedRevision"]), ...fields[input.action]])) fail("AUTH_INPUT");
  const file = await privateFile(input.root, false), current = file ? await readOperatorStore(file) : undefined;
  if (read) return summary(current);
  if (input.expectedRevision !== null && (typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision))) fail("AUTH_INPUT");
  if ((current?.revision ?? null) !== input.expectedRevision) fail("AUTH_CONFLICT");
  let store = current?.store ?? { version: 1, id: randomUUID(), accounts: [] };
  if (input.action === "add") {
    // Validate the full proposed account before allocating an expensive password derivation.
    const placeholder = { algorithm: "scrypt", N: 131072, r: 8, p: 1, salt: "A".repeat(43), key: "A".repeat(86) };
    const account = { id: randomUUID(), username: input.username, name: input.name, role: input.role, capabilities: input.capabilities, permissions: input.permissions, disabled: false, password: placeholder };
    if (store.version === 2) store.resourceRules.push({ accountId: account.id, limits: defaultOperatorResources() });
    try { parseOperatorStore({ ...store, accounts: [...store.accounts, account] }); } catch { fail("AUTH_INPUT"); }
    account.password = await hashOperatorPassword(input.password); store.accounts.push(account);
  } else {
    const account = store.accounts.find(item => item.id === input.id); if (!account) fail("AUTH_INPUT");
    if (input.action === "resources") {
      const limits = parseOperatorResources(input.limits);
      if (store.version === 1) store = { ...store, version: 2, resourceRules: store.accounts.map(item => ({ accountId: item.id, limits: defaultOperatorResources(true) })) };
      store.resourceRules.find(rule => rule.accountId === account.id).limits = limits;
    }
    else if (input.action === "password") account.password = await hashOperatorPassword(input.password);
    else if (input.action === "disable") { if (typeof input.disabled !== "boolean") fail("AUTH_INPUT"); account.disabled = input.disabled; }
    else Object.assign(account, { name: input.name, role: input.role, capabilities: input.capabilities, permissions: input.permissions });
    try { parseOperatorStore(store); } catch { fail("AUTH_INPUT"); }
  }
  const target = await privateFile(input.root, true);
  return summary(await writeOperatorStore(target, store, input.expectedRevision ?? undefined));
}
