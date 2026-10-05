import { describe, expect, it } from "vitest";
import { parse } from "@babel/parser";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";
// @ts-expect-error no declaration is required for the runtime helper.
import { overlayCandidate } from "../scripts/framecraft-picking.mjs";

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
    expect(transformed.tags[0].children).toContain('key: "delete"');
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
    expect(transformed.tags[0].children).toContain('"ContextTapped"');
    expect(transformed.tags[0].children).toContain('"KeyDown"');
    expect(transformed.tags[0].children).toContain('"InterfaceEvent"');
    expect(transformed.tags[0].children).toContain('"Unloaded"');
    expect(transformed.tags[0].children).toContain("framecraft:command-fired");
    expect(transformed.tags[0].children).toContain("framecraft-hmi-flash-background");
    expect(transformed.tags[0].children).toContain("prefers-reduced-motion:reduce");
    expect(transformed.tags[0].children).toContain("style.setProperty(property, value)");
  });

  it("carries the alignment maths into the page instead of a second copy of it", () => {
    const bridge = framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children;
    // The functions are stringified from the module the tests exercise, so the page cannot drift
    // away from the behaviour that was checked.
    expect(bridge).toContain("function snapOffset(");
    expect(bridge).toContain("function gridOffset(");
    expect(bridge).toContain("function equalGapOffset(");
    expect(bridge).toContain("snapCandidates");
    expect(bridge).toContain("framecraft:set-snap");
    expect(bridge).toContain("event.shiftKey");
    expect(bridge).toContain("event.altKey");
    expect(bridge).toContain('lockedAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y"');
    expect(bridge).toContain('gap.label.textContent = value + " px = " + value + " px"');
    // Picking several elements, and moving one by hand a pixel at a time.
    expect(bridge).toContain("framecraft:select-many");
    expect(bridge).toContain("framecraft:group-drag-move");
    expect(bridge).toContain("framecraft:group-drag-end");
    expect(bridge).toContain("framecraft:set-multi-selection");
    expect(bridge).toContain("extraSelected");
    expect(bridge).toContain("ArrowLeft");
    expect(bridge).toContain("ArrowDown");
  });

  it("hands the click to a layer drawn over what was clicked, never to the backdrop under it", () => {
    const bridge = framecraftPlugin().transformIndexHtml("<div></div>").tags[0].children;
    expect(bridge).toContain("function overlayCandidate(");

    const button = { area: 120 * 40 };
    const caption = { name: "caption", area: 90 * 20, inside: true };
    const badge = { name: "badge", area: 30 * 18, inside: false };
    // A component dragged on top of a big click-through photo: the photo covers the pointer, but
    // it is what the component sits on, so it must not take the click away from it.
    const photo = { name: "photo", area: 900 * 600, inside: false };

    expect(overlayCandidate(button, [photo])).toBeNull();
    expect(overlayCandidate(button, [photo, caption]).name).toBe("caption");
    // Among the layers actually drawn on it, the smallest is the one being pointed at.
    expect(overlayCandidate(button, [caption, badge]).name).toBe("badge");
    // A label the size of the button it covers still counts as drawn on it.
    expect(overlayCandidate(button, [{ name: "label", area: button.area, inside: false }]).name).toBe("label");
    expect(overlayCandidate(button, [])).toBeNull();
  });

  it("exposes page state setters to the preview bridge", () => {
    const plugin = framecraftPlugin();
    const result = plugin.transform('import { useState } from "react"; export function App() { const [currentPage, setCurrentPage] = useState("home"); return <main />; }', "C:/project/src/App.jsx");
    expect(result.code).toContain("window.__framecraftSetPage = setCurrentPage");
    expect(result.code).toContain("window.__framecraftCurrentPage = currentPage");
  });
});
