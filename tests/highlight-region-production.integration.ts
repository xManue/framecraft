// @vitest-environment node
import { createRequire } from "node:module";
import { build } from "vite";
import { expect, it } from "vitest";
import { parse } from "@babel/parser";
import { parseSource } from "../src/source-parser/parseSource";
import type { addHighlightInteraction } from "../src/source-parser/transformSource";
import editorConfig from "../vite.config";

it("il generatore compilato salva un handler zona autonomo ed eseguibile", async () => {
  const result = await build({ ...editorConfig, configFile: false, logLevel: "silent", build: {
    ...editorConfig.build, write: false, lib: { entry: "src/source-parser/transformSource.ts", formats: ["cjs"] },
    rollupOptions: { external: ["@babel/parser", "@babel/traverse", "magic-string"] },
  } });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Moduli compilati mancanti.");
  const entry = output.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
  if (!entry || entry.type !== "chunk") throw new Error("Generatore compilato mancante.");
  const require = createRequire(import.meta.url), exports: Record<string, unknown> = {};
  new Function("exports", "require", entry.code)(exports, require);
  const source = 'export function Page(){return <main><button onClick={() => window.originalCalls++}>Motore</button><img src="/macchina.png" /></main>}';
  const nodes = Object.values(parseSource("Page.tsx", source).nodes);
  const button = nodes.find((node) => node.type === "button")!, image = nodes.find((node) => node.type === "img")!;
  const generated = (exports.addHighlightInteraction as typeof addHighlightInteraction)(source,
    button.source.start, button.source.end, image.source.start, image.source.end,
    { targetId: "production-area", color: "#22c55e", width: 4, region: { space: "box", points: [{ x: .1, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .7 }, { x: .1, y: .7 }] } });
  const ast = parse(generated, { sourceType: "module", plugins: ["jsx"] });
  let click = "";
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const value = node as Record<string, any>;
    if (value.type === "JSXAttribute" && value.name?.name === "onClick") click = generated.slice(value.value.expression.start, value.value.expression.end);
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === "object") visit(child);
  };
  visit(ast);
  const { JSDOM } = require("jsdom");
  const browser = new JSDOM('<!doctype html><body><img data-fc-highlight-id="production-area"></body>', { runScripts: "outside-only", pretendToBeVisual: true });
  try {
    const target = browser.window.document.querySelector("img");
    target.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 200 });
    browser.window.originalCalls = 0;
    const handler = browser.window.eval("(" + click + ")");
    handler({});
    const path = browser.window.document.querySelector("[data-fc-highlight-region-layer] path");
    expect(path?.getAttribute("d")).toBe("M140 90 L340 90 L340 190 L140 190 Z");
    expect(path?.getAttribute("stroke")).toBe("#22c55e");
    expect(target.style.outline).toBe("");
    handler({});
    expect(browser.window.document.querySelector("[data-fc-highlight-region-layer]")).toBeNull();
    expect(browser.window.originalCalls).toBe(2);
  } finally { browser.window.close(); }
}, 60_000);
