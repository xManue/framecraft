import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink, link, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { mergeRecipeRecords } from "./recipe-exchange.mjs";
import { RecipeStoreError, parseRecipeCatalog, parseRecipeCommand, parseRecipeRecords, parseRecipeValues, recipeActor, recipeByteSize, recipeId, recipeKeys, recipeNameKey, recipeText } from "./recipe-catalog.mjs";

const digest = source => createHash("sha256").update(source).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fail = code => { throw new RecipeStoreError(code); };
const limit = 4 * 1024 * 1024;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.isFile() && b.isFile() && a.nlink === 1 && b.nlink === 1;
export async function openRecipeStore({ directory, catalog: input, onChange } = {}) {
  const catalog = parseRecipeCatalog(input), schemaHash = digest(JSON.stringify(catalog));
  if (typeof directory !== "string" || !path.isAbsolute(directory) || path.resolve(directory) === path.parse(path.resolve(directory)).root) fail("RECIPE_STORAGE");
  directory = path.resolve(directory);
  const comparable = value => process.platform === "win32" ? value.toLowerCase() : value;
  try { const parent = path.dirname(directory), stat = await lstat(parent); if (!stat.isDirectory() || stat.isSymbolicLink() || comparable(await realpath(parent)) !== comparable(parent)) fail("RECIPE_STORAGE"); } catch { fail("RECIPE_STORAGE"); }
  try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") fail("RECIPE_STORAGE"); }
  async function checkDirectory() {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || comparable(await realpath(directory)) !== comparable(directory)) fail("RECIPE_STORAGE");
  }
  const file = path.join(directory, "recipes.json"), marker = path.join(directory, "store.id"), lock = path.join(directory, "recipes.lock");
  async function read(target, max = limit) {
    let before;
    try { before = await lstat(target); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > max) fail("RECIPE_STORAGE");
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat(); if (!sameFile(before, stat) || stat.size > max) fail("RECIPE_STORAGE");
      const data = await handle.readFile({ encoding: "utf8" }); if (recipeByteSize(data) > max) fail("RECIPE_LIMIT"); return data;
    } finally { await handle.close(); }
  }
  let busy = false;
  async function locked(operation) {
    if (busy) fail("RECIPE_BUSY"); busy = true; let handle, owned;
    try {
      await checkDirectory();
      try { handle = await open(lock, "wx", 0o600); owned = await handle.stat(); } catch (error) { if (error.code === "EEXIST") fail("RECIPE_BUSY"); throw error; }
      await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, instance: randomUUID(), startedAt: new Date().toISOString() }) + "\n", "utf8"); await handle.sync();
      return await operation();
    } catch (error) { if (error instanceof RecipeStoreError) throw error; fail("RECIPE_STORAGE"); }
    finally {
      try { if (handle) { await handle.close(); if (!sameFile(owned, await lstat(lock))) fail("RECIPE_UNCERTAIN"); await unlink(lock); } }
      catch { fail("RECIPE_UNCERTAIN"); }
      finally { busy = false; }
    }
  }
  async function loadMarker() {
    const raw = await read(marker, 4096); if (raw === undefined) return undefined;
    let value; try { value = JSON.parse(raw); } catch { fail("RECIPE_CORRUPT"); }
    if (!recipeKeys(value, ["version", "id", "schemaHash"]) || value.version !== 1 || typeof value.id !== "string" || !/^[a-f0-9-]{36}$/.test(value.id) || !hash(value.schemaHash)) fail("RECIPE_CORRUPT");
    if (value.schemaHash !== schemaHash) fail("RECIPE_SCHEMA"); return value;
  }
  function parseState(raw, identity) {
    try {
      const value = JSON.parse(raw);
      if (!recipeKeys(value, ["version", "storeId", "schemaHash", "sequence", "schemas", "receipts"]) || value.version !== 1 || value.storeId !== identity.id || !hash(value.schemaHash) || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !Array.isArray(value.schemas) || value.schemas.length !== catalog.schemas.length || new Set(value.schemas.map(item => item.id)).size !== value.schemas.length || !Array.isArray(value.receipts) || value.receipts.length > 256) fail("RECIPE_CORRUPT");
      if (value.schemaHash !== schemaHash) fail("RECIPE_SCHEMA");
      value.schemas = catalog.schemas.map(schema => { const stored = value.schemas.find(item => item.id === schema.id); if (!recipeKeys(stored, ["id", "records"])) fail("RECIPE_CORRUPT"); return { id: schema.id, records: parseRecipeRecords(stored.records, schema.fields) }; });
      let previous = 0; const ids = new Set();
      for (const receipt of value.receipts) {
        if (!recipeKeys(receipt, ["id", "fingerprint", "sequence", "action", "schemaId", "recordId", "actor", "at"]) || typeof receipt.id !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(receipt.id) || ids.has(receipt.id) || !hash(receipt.fingerprint) || !Number.isSafeInteger(receipt.sequence) || receipt.sequence <= previous || receipt.sequence > value.sequence || !["create", "update", "rename", "delete", "copy", "import"].includes(receipt.action) || !catalog.schemas.some(schema => schema.id === receipt.schemaId) || !recipeId(receipt.recordId) || !recipeActor(receipt.actor) || !recipeText(receipt.at, 32) || new Date(receipt.at).toISOString() !== receipt.at) fail("RECIPE_CORRUPT");
        ids.add(receipt.id); previous = receipt.sequence;
      }
      if (previous !== value.sequence) fail("RECIPE_CORRUPT");
      return value;
    } catch (error) { if (error instanceof RecipeStoreError && error.code === "RECIPE_SCHEMA") throw error; fail("RECIPE_CORRUPT"); }
  }
  async function load() {
    const identity = await loadMarker(), source = await read(file);
    if (!identity || source === undefined) fail("RECIPE_CORRUPT");
    return { state: parseState(source, identity), revision: digest(source), identity };
  }
  async function publish(state, expectedRevision, identity) {
    const source = JSON.stringify(state) + "\n"; if (recipeByteSize(source) > limit) fail("RECIPE_LIMIT");
    const temporary = path.join(directory, "recipes-" + randomUUID() + ".tmp"); let output, created = false, publishing = false, published = false;
    try {
      output = await open(temporary, "wx", 0o600); created = true; await output.writeFile(source, "utf8"); await output.sync(); await output.close(); output = undefined;
      await checkDirectory(); const currentIdentity = await loadMarker(); if (!currentIdentity || currentIdentity.id !== identity.id) fail("RECIPE_CONFLICT");
      const current = await read(file); if ((current === undefined ? undefined : digest(current)) !== expectedRevision) fail("RECIPE_CONFLICT");
      publishing = true;
      if (expectedRevision === undefined) { await link(temporary, file); published = true; await unlink(temporary); }
      else { await rename(temporary, file); published = true; }
      if (process.platform !== "win32") { const folder = await open(directory, "r"); try { await folder.sync(); } finally { await folder.close(); } }
      return digest(source);
    } catch (error) { if (publishing) fail("RECIPE_UNCERTAIN"); if (error instanceof RecipeStoreError) throw error; fail("RECIPE_STORAGE"); }
    finally { await output?.close().catch(() => {}); if (created && !published) await unlink(temporary).catch(() => {}); }
  }
  function snapshot(state, revision) { return clone({ version: 1, revision, sequence: state.sequence, persistence: "server-file", schemas: catalog.schemas.map(schema => ({ ...schema, records: state.schemas.find(item => item.id === schema.id).records })) }); }
  await locked(async () => {
    const identity = await loadMarker(), source = await read(file);
    if (identity || source !== undefined) { if (!identity || source === undefined) fail("RECIPE_CORRUPT"); parseState(source, identity); return; }
    if ((await readdir(directory)).some(name => name !== "recipes.lock")) fail("RECIPE_CORRUPT");
    const created = { version: 1, id: randomUUID(), schemaHash }, handle = await open(marker, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(created) + "\n", "utf8"); await handle.sync(); } finally { await handle.close(); }
    await publish({ version: 1, storeId: created.id, schemaHash, sequence: 0, schemas: catalog.schemas.map(schema => ({ id: schema.id, records: schema.records })), receipts: [] }, undefined, created);
  });
  return {
    snapshot: () => locked(async () => { const { state, revision } = await load(); return snapshot(state, revision); }),
    mutate(raw, actor) {
      if (!recipeActor(actor)) return Promise.reject(new RecipeStoreError("RECIPE_AUTH"));
      let command; try { command = parseRecipeCommand(raw); } catch (error) { return Promise.reject(error); }
      return locked(async () => {
        const { state, revision, identity } = await load(), fingerprint = digest(JSON.stringify({ actor, command }));
        const known = state.receipts.find(item => item.id === command.id);
        if (known) { if (known.fingerprint !== fingerprint) fail("RECIPE_CONFLICT"); return { id: command.id, duplicate: true, appliedSequence: known.sequence, effect: "recipe-storage-only", plcConfirmed: false, snapshot: snapshot(state, revision) }; }
        if (revision !== command.expectedRevision) fail("RECIPE_CONFLICT");
        const schema = catalog.schemas.find(schema => schema.id === command.schemaId), group = state.schemas.find(schema => schema.id === command.schemaId);
        if (!schema || !group) fail("RECIPE_MISSING");
        const original = group.records.find(record => record.id === command.recordId), targetId = command.action === "copy" ? command.targetId : command.recordId;
        if (!["create", "import"].includes(command.action) && !original) fail("RECIPE_MISSING");
        if (["create", "copy"].includes(command.action) && group.records.some(record => record.id === targetId) || command.name !== undefined && group.records.some(record => (command.action === "copy" || record.id !== targetId) && recipeNameKey(record.name) === recipeNameKey(command.name))) fail("RECIPE_EXISTS");
        if (command.action === "import") group.records = mergeRecipeRecords({ ...schema, records: group.records }, command.fields, command.records);
        else if (command.action === "delete") group.records = group.records.filter(record => record.id !== command.recordId);
        else {
          const record = { id: targetId, name: command.name, values: ["create", "update"].includes(command.action) ? parseRecipeValues(command.values, schema.fields) : clone(original.values) };
          if (["create", "copy"].includes(command.action)) group.records.push(record); else group.records[group.records.findIndex(record => record.id === targetId)] = record;
          if (group.records.length > 500) fail("RECIPE_LIMIT");
        }
        // A committed archive must remain readable by the catalog/client, including all schemas.
        parseRecipeCatalog({ version: 1, schemas: catalog.schemas.map(schema => ({ ...schema, records: state.schemas.find(item => item.id === schema.id).records })) });
        if (!Number.isSafeInteger(state.sequence + 1)) fail("RECIPE_LIMIT");
        state.sequence++; const receipt = { id: command.id, fingerprint, sequence: state.sequence, action: command.action, schemaId: schema.id, recordId: targetId, actor, at: new Date().toISOString() };
        state.receipts = [...state.receipts.slice(-255), receipt];
        const nextRevision = await publish(state, revision, identity);
        try { onChange?.({ id: receipt.id, sequence: receipt.sequence, action: receipt.action, at: receipt.at })?.catch?.(() => {}); } catch { /* Notification failures do not replay a committed change. */ }
        return { id: command.id, duplicate: false, appliedSequence: state.sequence, effect: "recipe-storage-only", plcConfirmed: false, snapshot: snapshot(state, nextRevision) };
      });
    },
  };
}
