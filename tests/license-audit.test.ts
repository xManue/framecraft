import { describe, expect, it } from "vitest";
import { licenseChoice, npmLicenseInventory } from "../scripts/license-audit.mjs";

describe("controllo licenze senza approvazioni implicite", () => {
  it("riconosce alternative permissive ma non elimina obblighi AND o eccezioni sconosciute", () => {
    expect(licenseChoice("MIT")).toEqual(["MIT"]); expect(licenseChoice("(Apache-2.0 OR MIT) AND BSD-3-Clause")).toEqual(["Apache-2.0", "BSD-3-Clause"]);
    expect(licenseChoice("GPL-3.0-only OR MIT")).toEqual(["MIT"]); expect(licenseChoice("MIT AND GPL-3.0-only")).toBeUndefined();
    expect(licenseChoice("MIT WITH unknown-exception")).toBeUndefined(); expect(licenseChoice("CC-BY-4.0")).toBeUndefined(); expect(licenseChoice("MIT OR")).toBeUndefined();
  });
  it("percorre dipendenze transitive e peer distinguendo editor, Runtime e tooling", () => {
    const lock = { packages: { "": {}, "node_modules/mqtt": { version: "1", license: "MIT", dependencies: { nested: "1" } },
      "node_modules/mqtt/node_modules/nested": { version: "2", license: "UNKNOWN", peerDependencies: { shared: "1" } },
      "node_modules/shared": { version: "3", license: "ISC" }, "node_modules/test-broker": { version: "1", license: "MIT", optionalDependencies: { absent: "1" } } } };
    const report = npmLicenseInventory(lock, { "mqtt-runtime": { mqtt: "1" }, editor: { shared: "1" }, tooling: { "test-broker": "1" } });
    expect(report.packages).toHaveLength(4); expect(report.packages.find((entry) => entry.name === "nested")?.decision).toBe("review-required");
    expect(report.packages.find((entry) => entry.name === "shared")?.scopes.sort()).toEqual(["editor", "mqtt-runtime"]); expect(report.missing).toEqual([]);
  });
  it("non considera un catalogo incompleto o una dipendenza mancante come verificati", () => {
    expect(() => npmLicenseInventory({}, {})).toThrow("package-lock");
    expect(npmLicenseInventory({ packages: {} }, { editor: { missing: "1" } }).missing).toMatchObject([{ name: "missing", scope: "editor" }]);
  });
});
