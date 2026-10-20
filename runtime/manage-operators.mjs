import { mkdir, lstat, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { hashOperatorPassword, readOperatorStore, writeOperatorStore } from "./operator-store.mjs";
import { operatorCapabilities, operatorUsername, OperatorAuthError } from "./operator-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)), file = path.join(root, ".framecraft-runtime", "security", "operators.json");
const usage = "Account locali HMI (non ChatGPT).\nUso: npm run operators -- list|add|password|permissions|disable|enable\nPassword richieste nel terminale, mai come argomenti. Nessun utente o permesso predefinito.\n";
const ask = question => new Promise(resolve => { const prompt = readline.createInterface({ input: process.stdin, output: process.stdout }); prompt.question(question, answer => { prompt.close(); resolve(answer.trim()); }); });
function password(question) {
  return new Promise((resolve, reject) => {
    let value = ""; const wasRaw = process.stdin.isRaw;
    process.stdout.write(question + " (caratteri nascosti): "); readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
    const finish = error => { process.stdin.off("keypress", onKey); process.stdin.setRawMode(wasRaw); process.stdin.pause(); process.stdout.write("\n"); error ? reject(error) : resolve(value); value = ""; };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === "c") return finish(new OperatorAuthError("AUTH_INPUT"));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace") { value = [...value].slice(0, -1).join(""); return; }
      if (text && !key.ctrl && !key.meta && !/[\u0000-\u001f\u007f]/.test(text) && value.length + text.length <= 256) value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}
async function directories() {
  const comparable = value => process.platform === "win32" ? value.toLowerCase() : value;
  for (const directory of [root, path.join(root, ".framecraft-runtime"), path.dirname(file)]) {
    if (directory !== root) { try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; } }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || comparable(await realpath(directory)) !== comparable(path.resolve(directory))) throw new OperatorAuthError("AUTH_STORE");
  }
}
async function grants() {
  process.stdout.write("Capacità server disponibili:\n" + operatorCapabilities.join(", ") + "\n");
  const parse = value => value === "nessuno" ? [] : value.split(",").map(item => item.trim());
  const capabilities = parse(await ask("Capacità esatte, separate da virgola (oppure nessuno): "));
  if (new Set(capabilities).size !== capabilities.length || capabilities.some(id => !operatorCapabilities.includes(id))) throw new OperatorAuthError("AUTH_INPUT");
  process.stdout.write("Permessi grafici separati, ad esempio comandi, parametri, manutenzione. Non concedono capacità server.\n");
  const permissions = parse(await ask("ID permessi grafici, separati da virgola (oppure nessuno): "));
  if (permissions.some(id => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id)) || new Set(permissions).size !== permissions.length || permissions.length > 64) throw new OperatorAuthError("AUTH_INPUT");
  return { capabilities, permissions };
}
async function newPassword() {
  let first = await password("Nuova password, almeno 12 caratteri"), second = await password("Ripeti password");
  try { if (first !== second) throw new OperatorAuthError("AUTH_INPUT"); return await hashOperatorPassword(first); }
  finally { first = ""; second = ""; }
}
async function main() {
  const args = process.argv.slice(2), command = args[0];
  if (!command || args.length !== 1 || ["--help", "-h"].includes(command)) { process.stdout.write(usage); if (args.length > 1) process.exitCode = 1; return; }
  if (!["list", "add", "password", "permissions", "disable", "enable"].includes(command) || !process.stdin.isTTY || !process.stdout.isTTY) throw new OperatorAuthError("AUTH_INPUT");
  await directories(); const current = await readOperatorStore(file);
  const store = current?.store ?? { version: 1, id: randomUUID(), accounts: [] };
  if (command === "list") { for (const account of store.accounts) process.stdout.write(JSON.stringify({ username: account.username, name: account.name, role: account.role, disabled: account.disabled, capabilities: account.capabilities, permissions: account.permissions }) + "\n"); if (!store.accounts.length) process.stdout.write("Nessun account configurato. Usa add per crearne uno esplicitamente.\n"); return; }
  const username = await ask("Nome utente (minuscole, numeri, punto, trattino o underscore): "); if (!operatorUsername(username)) throw new OperatorAuthError("AUTH_INPUT");
  let account = store.accounts.find(item => item.username === username);
  if (command === "add") {
    if (account) throw new OperatorAuthError("AUTH_INPUT");
    account = { id: randomUUID(), username, name: await ask("Nome visualizzato: "), role: await ask("Etichetta ruolo (non assegna permessi): "), disabled: false, ...await grants(), password: await newPassword() }; store.accounts.push(account);
  } else {
    if (!account) throw new OperatorAuthError("AUTH_INPUT");
    if (command === "password") account.password = await newPassword();
    else if (command === "permissions") Object.assign(account, await grants());
    else account.disabled = command === "disable";
  }
  process.stdout.write(JSON.stringify({ operation: command, username, disabled: account.disabled, capabilities: account.capabilities, permissions: account.permissions }) + "\nTutte le sessioni attive verranno revocate. Conserva il file privato e i suoi backup fuori dalla cartella pubblica.\n");
  if (await ask("Scrivi SALVA per confermare: ") !== "SALVA") { process.stdout.write("Operazione annullata; account invariati.\n"); return; }
  await writeOperatorStore(file, store, current?.revision); process.stdout.write("Account aggiornati. Nessuna connessione o comando PLC avviato.\n");
}
main().catch(error => { const safe = error instanceof OperatorAuthError ? error : new OperatorAuthError("AUTH_STORE"); process.stderr.write(`${safe.code}: ${safe.message}. ${safe.remedy}\n`); process.exitCode = 1; });
