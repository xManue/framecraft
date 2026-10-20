import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseOperatorAuthConfig, OperatorAuthError } from "./operator-policy.mjs";
import { openRuntimeAudit } from "./audit-store.mjs";

const root = new URL("../", import.meta.url), args = process.argv.slice(2);
let audit;
try {
  if (args.includes("--help")) process.stdout.write("Registro privato delle operazioni HMI.\nUso: npm run audit -- [--limit=100] [--before=NUMERO] [--json]\nSola lettura e verifica della catena; non crea, cancella, ripara o ripete operazioni.\n");
  else {
    if (args.some(arg => !/^--(?:json|limit=\d{1,3}|before=\d{1,16})$/.test(arg)) || new Set(args.map(arg => arg.split("=")[0])).size !== args.length) throw new OperatorAuthError("AUTH_INPUT");
    const limit = Number(args.find(arg => arg.startsWith("--limit="))?.slice(8) ?? 100), rawBefore = args.find(arg => arg.startsWith("--before="));
    const config = parseOperatorAuthConfig(JSON.parse(await readFile(new URL("framecraft.auth.json", root), "utf8")));
    audit = openRuntimeAudit({ root: fileURLToPath(root), namespace: config.namespace, readOnly: true });
    const snapshot = audit.read({ limit, ...(rawBefore ? { before: Number(rawBefore.slice(9)) } : {}) });
    if (args.includes("--json")) process.stdout.write(JSON.stringify(snapshot) + "\n");
    else {
      process.stdout.write("Registro " + snapshot.id + ": catena verificata, non firma digitale.\nRichieste senza esito terminale: " + snapshot.unresolvedCount + ". Eventi con esito incerto: " + snapshot.uncertainCount + ". Da verificare, non da ripetere automaticamente.\n");
      for (const item of snapshot.events) process.stdout.write(["#" + item.seq, item.timestamp, item.actor ?? "identità non verificata", item.operation, item.resource ? item.resource.id + (item.resource.kind === "recipe-schema" ? "/" + item.resource.recordId + (item.resource.targetId ? " → " + item.resource.targetId : "") : "") : "sessione", item.outcome, item.code, "traccia=" + item.traceId].join(" | ") + "\n");
      if (snapshot.nextBefore !== null) process.stdout.write("Per le precedenti: --before=" + snapshot.nextBefore + "\n");
    }
  }
} catch (error) { const safe = error instanceof OperatorAuthError ? error : new OperatorAuthError("AUTH_AUDIT"); process.stderr.write(safe.code + ": " + safe.message + ". " + safe.remedy + "\n"); process.exitCode = 1; }
finally { audit?.close(); }
