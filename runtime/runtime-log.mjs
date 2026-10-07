import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { connectionDiagnostic, diagnosticText, safeNotify } from "./connection-diagnostics.mjs";

export function createRuntimeLogger(options = {}) {
  const maxBytes = options.maxBytes ?? 1048576, maxFiles = options.maxFiles ?? 3, queueLimit = options.queueLimit ?? 256;
  if (typeof options.directory !== "string" || !options.directory || !Number.isInteger(maxBytes) || maxBytes < 4096 || maxBytes > 16777216 || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 10 || !Number.isInteger(queueLimit) || queueLimit < 1 || queueLimit > 1000) throw new Error("Configurazione registro Runtime non valida.");
  const output = options.output ?? ((text, error, event) => (error ? process.stderr : process.stdout).write((options.json ? JSON.stringify({ type: "diagnostic", ...event }) : text) + "\n"));
  let queue = Promise.resolve(), pending = 0, closed = false, lastFailure = 0, overflow = false;
  const file = (index) => join(options.directory, "connections-" + index + ".jsonl");
  const warn = (code) => {
    const event = connectionDiagnostic(code, { protocol: "gateway" });
    safeNotify((value) => output(diagnosticText(value), true, value), event); safeNotify(options.onFailure, { ...event });
  };
  return {
    write(input) {
      if (closed) return;
      const event = connectionDiagnostic(input.code, input);
      if (Number.isInteger(input.occurrences) && input.occurrences > 0) event.occurrences = Math.min(input.occurrences, 1000000000);
      const line = JSON.stringify(event) + "\n";
      const label = [new Date(event.timestamp).toISOString(), event.level.toUpperCase(), event.connectionId, event.tag, event.code].filter(Boolean).join(" | ");
      safeNotify((text) => output(text, event.level !== "info", { ...event }), label + "\n" + diagnosticText(event) + (event.occurrences > 1 ? " Eventi uguali: " + event.occurrences + "." : ""));
      if (pending >= queueLimit) { if (!overflow) { overflow = true; warn("LOG_OVERFLOW"); } return; }
      pending++;
      queue = queue.then(async () => {
        await mkdir(options.directory, { recursive: true, mode: 0o700 });
        let size = 0;
        try { size = (await stat(file(0))).size; } catch (error) { if (error.code !== "ENOENT") throw error; }
        if (size && size + Buffer.byteLength(line) > maxBytes) {
          await rm(file(maxFiles - 1), { force: true });
          for (let index = maxFiles - 2; index >= 0; index--) try { await rename(file(index), file(index + 1)); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        await appendFile(file(0), line, { encoding: "utf8", mode: 0o600 });
        lastFailure = 0;
      }).catch(() => {
        if (!lastFailure || Date.now() - lastFailure >= 5000) { lastFailure = Date.now(); warn("LOG_UNAVAILABLE"); }
      }).finally(() => { pending--; if (pending < queueLimit / 2) overflow = false; });
    },
    async flush() { await queue; },
    async close() { closed = true; await queue; },
  };
}
