import { describe, expect, it } from "vitest";
import { parse } from "@babel/parser";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

describe("preview instrumentation", () => {
  it("adds source coordinates only to intrinsic JSX elements", () => {
    const plugin = framecraftPlugin();
    const result = plugin.transform("export const App = () => <main><Card /><button>Go</button></main>", "C:/project/src/App.tsx");
    expect(result.code).toContain("data-fc-source");
    expect(result.code.match(/data-fc-source/g)).toHaveLength(2);
    expect(result.map).toBeTruthy();
    expect(() => parse(result.code, { sourceType: "module", plugins: ["jsx", "typescript"] })).not.toThrow();
    expect(result.code).toContain("data-fc-source={");
  });

  it("injects a bridge that is valid JavaScript", () => {
    // The bridge lives inside a template literal, so a stray backtick or ${ in it silently
    // terminates the string and ships a broken script to every previewed project.
    const bridge = framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children;
    expect(() => new Function(bridge)).not.toThrow();
  });

  it("serves a file Babel cannot parse instead of breaking the previewed app", () => {
    const plugin = framecraftPlugin();
    const warnings: string[] = [];
    const context = { warn: (message: string) => warnings.push(message) };

    const result = plugin.transform.call(context, "export const Broken = () => <main>Unclosed", "C:/project/src/Broken.tsx");

    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Broken.tsx");

    // The same file must not be reported again on every rebuild.
    plugin.transform.call(context, "export const Broken = () => <main>Unclosed", "C:/project/src/Broken.tsx");
    expect(warnings).toHaveLength(1);
  });

  it("injects editing, navigation mode, drag and page synchronization", () => {
    const plugin = framecraftPlugin();
    const transformed = plugin.transformIndexHtml("<div id=\"root\"></div>");
    expect(transformed.tags[0].children).toContain("framecraft:select");
    expect(transformed.tags[0].children).toContain("framecraft:edit-text");
    expect(transformed.tags[0].children).toContain("framecraft:set-mode");
    expect(transformed.tags[0].children).toContain("framecraft:drop");
    expect(transformed.tags[0].children).toContain("framecraft:drop-at-point");
    expect(transformed.tags[0].children).toContain("framecraft:open-state-page");
    expect(transformed.tags[0].children).toContain("framecraft:state-page");
    expect(transformed.tags[0].children).toContain("elementFromPoint");
    expect(transformed.tags[0].children).toContain("dropPosition");
    expect(transformed.tags[0].children).toContain("positionContainer");
    expect(transformed.tags[0].children).toContain("framecraft:drag-move");
    expect(transformed.tags[0].children).toContain("framecraft:drag-end");
    expect(transformed.tags[0].children).toContain("framecraft:delete");
    expect(transformed.tags[0].children).toContain('event.key === "Delete"');
    expect(transformed.tags[0].children).toContain('event.key === "Backspace"');
    expect(transformed.tags[0].children).toContain("framecraft:ready");
    expect(transformed.tags[0].children).toContain("framecraft:resize");
    expect(transformed.tags[0].children).toContain("framecraft:preview-style");
    expect(transformed.tags[0].children).toContain("framecraft:request-selection");
    expect(transformed.tags[0].children).toContain("instanceId");
    expect(transformed.tags[0].children).toContain("instanceElements");
    expect(transformed.tags[0].children).toContain("backgroundColor");
    expect(transformed.tags[0].children).toContain("ResizeObserver");
  });

  it("exposes page state setters to the preview bridge", () => {
    const plugin = framecraftPlugin();
    const result = plugin.transform('import { useState } from "react"; export function App() { const [currentPage, setCurrentPage] = useState("home"); return <main />; }', "C:/project/src/App.jsx");
    expect(result.code).toContain("window.__framecraftSetPage = setCurrentPage");
    expect(result.code).toContain("window.__framecraftCurrentPage = currentPage");
  });
});
