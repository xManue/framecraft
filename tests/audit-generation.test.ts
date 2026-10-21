import { describe, expect, it } from "vitest";
import { transpileModule, ModuleKind, ScriptTarget, flattenDiagnosticMessageText } from "typescript";
import { standardProjectFiles } from "../src/core/standardProject";
import { componentRegistry } from "../src/components/registry";
import { parseSource } from "../src/source-parser/parseSource";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { openRuntimeAudit } from "../runtime/audit-store.mjs";
describe("registro attività nei nuovi pannelli standard manuali", () => {
  it("distribuisce controller, query e permesso esplicito senza attivare account o collegamenti", () => {
    const files = standardProjectFiles({ machineName: "Audit sintetico", layout: "desktop-mobile", sections: ["main"] }), source = (name: string) => files.find(file => file.path === name)!.content;
    for (const file of ["runtime/audit-query.mjs", "runtime/audit-query.d.mts", "src/framecraftHmiAuditControl.ts"]) expect(source(file)).toBeTruthy();
    expect(source("runtime/gateway.mjs")).toContain('"audit.read", false'); expect(source("runtime/audit-store.mjs")).toContain('"./audit-query.mjs"');
    expect(source("src/framecraftHmiAuditControl.ts")).toContain('"../runtime/audit-query.mjs"'); expect(source("src/framecraftHmiAuditControl.ts")).toContain('"./framecraftOperatorSession"');
    expect(source("src/framecraftHmiRuntime.ts")).toContain('createHmiAuditControl(host,'); expect(source("src/framecraftHmiRuntime.ts")).toContain("auditControls.clear()");
    expect(source("src/framecraftHmiRuntime.ts").indexOf("__framecraftEditorPreview")).toBeLessThan(source("src/framecraftHmiRuntime.ts").indexOf("const auditControls"));
    expect(JSON.parse(source("framecraft.auth.json")).enabled).toBe(false); expect(JSON.parse(source("framecraft.runtime.json")).gateway.enabled).toBe(false);
    expect(files.some(file => /operators.json|audit.sqlite/.test(file.path))).toBe(false);
    for (const file of ["src/framecraftHmiRuntime.ts", "src/framecraftHmiAuditControl.ts"]) {
      const result = transpileModule(source(file), { fileName: file, reportDiagnostics: true, compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } });
      expect(result.diagnostics?.map(item => flattenDiagnosticMessageText(item.messageText, "\n"))).toEqual([]);
    }
  });
  it("aggiunge un componente reale alla palette, non una copia dei template pagina", () => {
    const item = componentRegistry.get("hmi-audit-control")!, jsx = item.createJsx(); expect(item.name).toBe("Registro attività"); expect(item.category).toBe("HMI e PLC");
    expect(jsx).toContain('data-hmi-type="HmiAuditControl"'); expect(jsx).toContain("audit.read"); expect(jsx).toContain("segnaposto"); expect(() => parseSource("Panel.tsx", `export const Panel=()=>(${jsx});`)).not.toThrow();
  });
  it("la CLI distribuita risolve le query senza checkout o dipendenze private", async () => {
    const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "audit-generated-"));
    const files = standardProjectFiles({ machineName: "Audit CLI sintetico", layout: "desktop", sections: ["main"] });
    for (const file of files.filter(file => file.path === "framecraft.auth.json" || /^runtime\/(?:audit-(?:store|query)|operator-policy|read-audit)\.(?:mjs|d.mts)$/.test(file.path))) {
      const target = path.resolve(root, file.path); if (!target.startsWith(root + path.sep)) throw new Error("Fixture esterna");
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
    }
    const config = JSON.parse(files.find(file => file.path === "framecraft.auth.json")!.content), audit = openRuntimeAudit({ root, namespace: config.namespace });
    try { const result = JSON.parse(execFileSync(process.execPath, [path.join(root, "runtime/read-audit.mjs"), "--json"], { cwd: root, encoding: "utf8", windowsHide: true })); expect(result).toMatchObject({ verified: true, sequence: 0, events: [] }); }
    finally { audit.close(); }
  });
});
