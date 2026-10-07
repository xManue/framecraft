// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { connectionDiagnostic, connectionMessages, ConnectionOperationError, createDiagnosticReporter, diagnosticText, transportDiagnosticCode } from "../runtime/connection-diagnostics.mjs";
import { createRuntimeLogger } from "../runtime/runtime-log.mjs";

async function fixture() {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "connection-log-"));
  return { root, async close() {
    const resolved = await realpath(root), parent = await realpath(base);
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith("connection-log-")) throw new Error("Cleanup non valido.");
    await rm(resolved, { recursive: true, force: true });
  } };
}

describe("diagnostica PLC sicura e comprensibile", () => {
  it("ogni messaggio spiega problema, conseguenza e rimedio", () => {
    for (const code of Object.keys(connectionMessages)) {
      const event = connectionDiagnostic(code);
      expect(event.code).toBe(code); expect(["info", "warning", "error"]).toContain(event.level);
      for (const value of [event.title, event.message, event.action, event.impact]) expect(value.length).toBeGreaterThan(10);
      expect(diagnosticText(event)).toContain("Come risolvere:");
    }
  });
  it("non propaga messaggi grezzi, credenziali, payload o codici tecnici arbitrari", () => {
    const event = connectionDiagnostic("SECRET_MISSING", { connectionId: "linea\r\nInjected", technicalCode: "VERY_SECRET", message: "password=VERY_SECRET", action: "mqtts://user:VERY_SECRET@host", timestamp: 1e100 });
    expect(JSON.stringify(event)).not.toContain("VERY_SECRET"); expect(event.connectionId).toBe("lineaInjected");
    expect(event.technicalCode).toBeUndefined(); expect(Number.isNaN(new Date(event.timestamp).valueOf())).toBe(false);
    expect(connectionDiagnostic("PRIVATE_UNEXPECTED_CODE").code).toBe("NETWORK_ERROR");
    expect(connectionDiagnostic("NETWORK_REFUSED", { technicalCode: "ECONNREFUSED" }).technicalCode).toBe("ECONNREFUSED");
    expect(connectionDiagnostic("WRITE_REJECTED", { technicalCode: "135" }).technicalCode).toBe("135");
    expect(new ConnectionOperationError(connectionDiagnostic("WRITE_UNCERTAIN"), "uncertain")).toMatchObject({ outcome: "uncertain", diagnostic: { code: "WRITE_UNCERTAIN" } });
  });
  it.each([["ECONNREFUSED", "NETWORK_REFUSED"], ["EAI_AGAIN", "NETWORK_DNS"], ["ENOTFOUND", "NETWORK_DNS"], ["ETIMEDOUT", "NETWORK_TIMEOUT"], ["CERT_HAS_EXPIRED", "TLS_EXPIRED"], ["CERT_NOT_YET_VALID", "TLS_EXPIRED"], ["ERR_TLS_CERT_ALTNAME_INVALID", "TLS_HOSTNAME"], ["SELF_SIGNED_CERT_IN_CHAIN", "TLS_UNTRUSTED"], ["ERR_OSSL_X509_KEY_VALUES_MISMATCH", "TLS_CONFIGURATION"], [4, "AUTH_DENIED"], [135, "AUTH_DENIED"], [132, "MQTT_VERSION"], [133, "CLIENT_ID_INVALID"], [142, "CLIENT_ID_CONFLICT"]])("classifica il codice %s senza leggere error.message", (code, expected) => {
    expect(transportDiagnosticCode({ code, message: "PRIVATE_DATA" })).toBe(expected);
  });
  it("raggruppa errori uguali e contiene callback difettosi senza perdere il primo evento", () => {
    const callback = vi.fn(), report = createDiagnosticReporter(callback, { protocol: "mqtt", connectionId: "linea" }, { intervalMs: 5000 });
    report("BAD_PAYLOAD", { tag: "A", timestamp: 1000 }); report("BAD_PAYLOAD", { tag: "A", timestamp: 2000 }); report("BAD_PAYLOAD", { tag: "A", timestamp: 3000 });
    report("BAD_PAYLOAD", { tag: "B", timestamp: 4000 }); report("BAD_PAYLOAD", { tag: "A", timestamp: 7000 });
    expect(callback).toHaveBeenCalledTimes(3); expect(callback.mock.calls[2][0]).toMatchObject({ code: "BAD_PAYLOAD", tag: "A", occurrences: 3 });
    const broken = createDiagnosticReporter(() => { throw new Error("observer"); }, {}, { maxEntries: 2 });
    expect(() => { for (let index = 0; index < 1000; index++) broken("STALE_SAMPLE", { tag: String(index) }); }).not.toThrow();
  });
});

describe("registro Runtime locale", () => {
  it("ruota file reali entro i limiti e non conserva input o valori extra", async () => {
    const test = await fixture(), output = vi.fn();
    const logger = createRuntimeLogger({ directory: test.root, output, maxBytes: 4096, maxFiles: 3 });
    try {
      for (let index = 0; index < 80; index++) logger.write({ ...connectionDiagnostic("WRITE_UNCERTAIN", { tag: "Motor.Speed", connectionId: "linea", timestamp: 1000 + index }), message: "PRIVATE_PAYLOAD", action: "secret=PRIVATE_PAYLOAD" });
      await logger.close(); const files = await readdir(test.root); expect(files).toHaveLength(3);
      for (const name of files) {
        expect(name).toMatch(/^connections-[012]\.jsonl$/); expect((await stat(path.join(test.root, name))).size).toBeLessThanOrEqual(4096);
        const source = await readFile(path.join(test.root, name), "utf8"); expect(source).not.toContain("PRIVATE_PAYLOAD");
        for (const line of source.trim().split("\n")) expect(JSON.parse(line)).toMatchObject({ code: "WRITE_UNCERTAIN", tag: "Motor.Speed", action: expect.stringContaining("Verifica lo stato reale") });
      }
      expect(output.mock.calls.some(([text]) => text.includes("Come risolvere:"))).toBe(true);
    } finally { await logger.close(); await test.close(); }
  });
  it("un problema su disco è visibile senza eccezioni o cicli di logging", async () => {
    const test = await fixture(), output = vi.fn(), failure = vi.fn();
    const blocked = path.join(test.root, "not-a-directory"); await writeFile(blocked, "synthetic fixture");
    const logger = createRuntimeLogger({ directory: blocked, output, onFailure: failure });
    try {
      for (let index = 0; index < 5; index++) logger.write(connectionDiagnostic("NETWORK_REFUSED"));
      await expect(logger.flush()).resolves.toBeUndefined(); expect(failure).toHaveBeenCalledOnce();
      expect(failure.mock.calls[0][0]).toMatchObject({ code: "LOG_UNAVAILABLE", action: expect.stringContaining("permessi") });
      expect(output.mock.calls.some(([text]) => text.includes("Log su disco non disponibile"))).toBe(true);
    } finally { await logger.close(); await test.close(); }
  });
  it("la coda è limitata, il sovraccarico è esplicito e close impedisce ulteriori scritture", async () => {
    const test = await fixture(), output = vi.fn(), failure = vi.fn();
    const logger = createRuntimeLogger({ directory: test.root, output, onFailure: failure, queueLimit: 2 });
    try {
      for (let index = 0; index < 20; index++) logger.write(connectionDiagnostic("CONNECTED"));
      await logger.close(); expect(failure).toHaveBeenCalledOnce(); expect(failure.mock.calls[0][0].code).toBe("LOG_OVERFLOW");
      const before = await readFile(path.join(test.root, "connections-0.jsonl"), "utf8"); expect(before.trim().split("\n")).toHaveLength(2);
      logger.write(connectionDiagnostic("STOPPED")); await logger.flush(); expect(await readFile(path.join(test.root, "connections-0.jsonl"), "utf8")).toBe(before);
    } finally { await logger.close(); await test.close(); }
  });
});
