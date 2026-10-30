// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { expect, it } from "vitest";
import type { HmiDataLogRuntime } from "../src/core/hmiDataLogs";

it("genera Data Log eseguibili anche dall’editor compilato e minificato", async () => {
  const bundle = await build({ configFile: false, logLevel: "silent", build: { ssr: path.resolve("src/core/hmiDataLogs.ts"), write: false, minify: "esbuild", rollupOptions: { output: { inlineDynamicImports: true } } } });
  const output = (Array.isArray(bundle) ? bundle[0] : bundle) as { output: { type: string; code?: string }[] };
  const code = output.output.find(chunk => chunk.type === "chunk")!.code!;
  const compiled = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  const source = compiled.hmiDataLogRuntimeModuleSource() as string;
  expect(source).not.toMatch(/__vite_ssr_import|\beval\s*\(/);
  await mkdir(path.resolve(".hmi-preview"), { recursive: true }); const root = await mkdtemp(path.resolve(".hmi-preview/deadband-generated-"));
  await mkdir(path.join(root, "src")); await mkdir(path.join(root, "runtime"));
  await writeFile(path.join(root, "runtime/data-log-deadband.mjs"), await readFile(path.resolve("runtime/data-log-deadband.mjs")));
  const entry = path.join(root, "src/framecraftHmiDataLogs.mjs"); await writeFile(entry, source);
  const generated = await import(pathToFileURL(entry).href), log = generated.defaultHmiDataLog();
  log.storage = "memory"; log.deadband = { mode: "absolute", value: 5 }; log.tags = [{ ...generated.defaultHmiLoggingTag(), tag: "Value" }];
  const runtime = generated.createHmiDataLogRuntime({ version: 1, projectKey: "synthetic", logs: [log] }) as HmiDataLogRuntime;
  try { for (const value of ["10", "12", "15"]) runtime.updateTag("Value", value, { qualityCode: 192 }); expect(runtime.query(log.id, log.tags[0].id).map(row => row.value)).toEqual(["10", "15"]); }
  finally { runtime.stop(); }
}, 15000);
