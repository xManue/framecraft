import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { standardProjectFiles } from "../src/core/standardProject";
import { parseUserAccessRuntime } from "../src/core/userAccess";
describe("account locali nei nuovi pannelli", () => {
  it("distribuisce codice e configurazione disabilitata, senza utenti, password o PIN", () => {
    const files = standardProjectFiles({ machineName: "Account sintetici", layout: "desktop-mobile", sections: ["main"] }), source = (name: string) => files.find(file => file.path === name)!.content;
    const config = JSON.parse(source("framecraft.auth.json")); expect(config).toMatchObject({ enabled: false, allowHttpLoopback: false, idleMinutes: 15, absoluteMinutes: 480 }); expect(Object.keys(config)).toHaveLength(6);
    expect(JSON.parse(standardProjectFiles({ machineName: "Secondo", layout: "desktop", sections: ["main"] }).find(file => file.path === "framecraft.auth.json")!.content).namespace).not.toBe(config.namespace);
    expect(parseUserAccessRuntime(source("src/framecraftOperatorAccess.js"))?.accounts).toEqual([]); expect(files.some(file => file.path.endsWith("operators.json"))).toBe(false);
    expect(source("src/framecraftHmiRuntime.ts").indexOf("__framecraftEditorPreview")).toBeLessThan(source("src/framecraftHmiRuntime.ts").indexOf("operatorSession = installHmiOperatorSession"));
    expect(source("src/framecraftHmiRuntime.ts")).toContain("operatorSession.dispose()"); expect(source("src/App.tsx")).toContain('data-fc-user-access=""');
    for (const file of ["src/framecraftHmiRecipeClient.ts", "src/framecraftGateway.ts"]) expect(source(file)).toContain('"./framecraftOperatorSession"');
    expect(source("src/framecraftOperatorSession.ts")).not.toMatch(/node:crypto|operator-store/);
    expect(source("runtime/operator-admin.mjs")).toContain('resources: ["id", "limits"]'); expect(source("runtime/operator-policy.mjs")).toContain("AUTH_RESOURCE");
    expect(source("runtime/audit-store.mjs")).toContain('"node:sqlite"'); expect(source("runtime/audit-operation.mjs")).toContain("runAudited"); expect(source("runtime/read-audit.mjs")).toContain("readOnly: true"); expect(JSON.parse(source("runtime/package.json")).scripts.audit).toBe("node read-audit.mjs"); expect(files.some(file => file.path.startsWith(".framecraft-runtime/"))).toBe(false);
    expect(source("vite.config.ts")).toContain('"**/.framecraft-runtime/**"'); expect(JSON.parse(source("runtime/package.json")).scripts.operators).toBe("node manage-operators.mjs");
  });
  it("CLI distribuito mostra la guida senza provisioning o password in argomenti", async () => {
    const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "operator-cli-"));
    for (const file of standardProjectFiles({ machineName: "CLI", layout: "desktop", sections: ["main"] }).filter(file => /^runtime\/(manage-operators|operator-(policy|store|admin))\.(mjs|d.mts)$/.test(file.path))) {
      await mkdir(path.dirname(path.join(root, file.path)), { recursive: true }); await writeFile(path.join(root, file.path), file.content);
    }
    const output = execFileSync(process.execPath, [path.join(root, "runtime/manage-operators.mjs"), "--help"], { cwd: root, encoding: "utf8", windowsHide: true }); expect(output).toContain("mai come argomenti"); expect(output).toContain("Nessun utente o permesso predefinito");
    expect(() => execFileSync(process.execPath, [path.join(root, "runtime/manage-operators.mjs"), "add", "--password=SYNTHETIC"], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "pipe" })).toThrow();
  });
});
