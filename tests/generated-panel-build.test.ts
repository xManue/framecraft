import { describe, expect, it } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import source from "../templates/panel-vite.config.ts?raw";

describe("configurazione della build generata", () => {
  it("separa librerie e Runtime anche con percorsi Windows, senza alzare o disabilitare gli avvisi", () => {
    const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const output = { exports: {} as { default?: { build: { license: { fileName: string }; rollupOptions: { output: { manualChunks(id: string): string | undefined } } } } } };
    new Function("exports", "module", "require", javascript)(output.exports, output, (id: string) => id === "vite" ? { defineConfig: (config: unknown) => config } : id === "@vitejs/plugin-react" ? { default: () => ({ name: "react-test" }) } : { framecraftGatewayProxy: () => ({}) });
    const build = output.exports.default!.build, chunk = build.rollupOptions.output.manualChunks;
    expect(chunk("C:\\project\\node_modules\\react\\index.js")).toBe("vendor");
    expect(chunk("/project/src/framecraftHmiRuntime.ts")).toBe("hmi-runtime");
    expect(chunk("C:\\project\\runtime\\alarm-engine.mjs")).toBe("hmi-runtime");
    expect(chunk("/project/src/pages/GuidedPage1.tsx")).toBeUndefined();
    expect(build.license.fileName).toBe("THIRD_PARTY_NOTICES.md");
    expect(source).not.toContain("chunkSizeWarningLimit");
  });
});
