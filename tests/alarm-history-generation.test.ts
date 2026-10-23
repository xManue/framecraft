import { mkdir, mkdtemp, writeFile, symlink, access } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { standardProjectFiles } from "../src/core/standardProject";
import { componentRegistry } from "../src/components/registry";
import { parseSource } from "../src/source-parser/parseSource";
it("includes the archive control and services without enabling logging, accounts or connections", () => {
  const files = standardProjectFiles({ machineName: "Allarmi QA", layout: "desktop", sections: ["main"] }), read = (file: string) => files.find(item => item.path === file)!.content;
  for (const file of ["runtime/alarm-history.mjs", "runtime/alarm-history.d.mts", "runtime/alarm-history-store.mjs", "runtime/alarm-history-store.d.mts", "src/framecraftHmiAlarmArchive.ts", "src/framecraftHmiAlarmHistoryExport.ts"]) expect(read(file).length).toBeGreaterThan(100);
  expect(read("src/framecraftHmiAlarmArchive.ts")).toContain('from "./framecraftHmiAlarmHistoryExport"'); expect(read("src/framecraftHmiAlarmHistoryExport.ts")).toContain('from "../runtime/alarm-history.mjs"');
  expect(JSON.parse(read("framecraft.alarms.json")).archive?.enabled).not.toBe(true); expect(JSON.parse(read("framecraft.auth.json")).enabled).toBe(false); expect(JSON.parse(read("framecraft.connections.json")).connections).toEqual([]);
  expect(read("src/framecraftHmiRuntime.ts")).toContain("createHmiAlarmArchive"); expect(read("runtime/start-gateway.mjs")).toContain("openAlarmHistory");
  const entry = componentRegistry.get("hmi-alarm-archive")!; expect(entry).toBeDefined(); const parsed = parseSource("Archive.tsx", `export function Archive(){return (${entry.createJsx()});}`); expect(Object.values(parsed.nodes).some(node => node.props["data-hmi-type"] === "HmiAlarmArchiveControl")).toBe(true);
});
it("runs the emitted disabled launcher without creating an alarm archive", async () => {
  const base = path.resolve(".hmi-preview"); await mkdir(base, { recursive: true }); const root = await mkdtemp(path.join(base, "alarm-history-generated-"));
  const files = standardProjectFiles({ machineName: "Allarmi QA", layout: "desktop", sections: ["main"] });
  for (const file of files.filter(item => item.path.startsWith("runtime/") || /^framecraft\.(auth|alarms|plc|connections|recipes)\.json$/.test(item.path))) { const target = path.resolve(root, file.path); if (!target.startsWith(root + path.sep)) throw new Error("Invalid fixture path"); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
  await symlink(path.resolve("node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir"); const output = execFileSync(process.execPath, ["runtime/start-gateway.mjs", "--json"], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 15000 });
  expect(output).toContain('"state":"disabled"'); await expect(access(path.join(root, ".framecraft-runtime/alarm-history"))).rejects.toMatchObject({ code: "ENOENT" });
}, 20000);
