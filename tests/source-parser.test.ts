import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { addHighlightInteraction, deleteElement, duplicateElement, insertElement, insertElementAtPosition, removeHighlightTrigger, reorderElement, updateHighlightTrigger, updateInlineStyle, updateInlineStyles, updateStaticText } from "../src/source-parser/transformSource";

const basicPath = resolve("tests/fixtures/basic/App.tsx");
const basic = readFileSync(basicPath, "utf8");

describe("React source model", () => {
  it("builds a source-backed tree from nested JSX", () => {
    const document = parseSource(basicPath, basic);
    expect(document.roots).toHaveLength(1);
    const root = document.nodes[document.roots[0]];
    expect(root.type).toBe("div");
    expect(root.children.map((id) => document.nodes[id].type)).toEqual(["h1", "button"]);
    expect(document.nodes[root.children[1]].styles.color).toBe("red");
  });

  it("still models a file Babel can only parse with error recovery", () => {
    const broken = "export const Page = () => <main><h1>Title</h1><button>Go</button></main>; render() = 1;";
    const document = parseSource("Broken.tsx", broken);
    expect(Object.values(document.nodes).map((node) => node.type)).toContain("button");
  });

  it("marks expression-backed elements conservatively", () => {
    const path = resolve("tests/fixtures/dynamic/Dashboard.tsx");
    const document = parseSource(path, readFileSync(path, "utf8"));
    const section = Object.values(document.nodes).find((node) => node.type === "section");
    const article = Object.values(document.nodes).find((node) => node.type === "article");
    expect(section?.dynamic).toBe(true);
    expect(article?.capabilities.text).toBe(false);
  });
});

describe("localized AST-validated transforms", () => {
  it("updates static text without changing surrounding source", () => {
    const document = parseSource(basicPath, basic);
    const heading = Object.values(document.nodes).find((node) => node.type === "h1")!;
    const result = updateStaticText(basic, heading.source.start, heading.source.end, "Production");
    expect(result).toContain("<h1>Production</h1>");
    expect(result).toContain("// This comment must survive editor transformations.");
  });

  it("updates and adds inline style properties", () => {
    const document = parseSource(basicPath, basic);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    const updated = updateInlineStyle(basic, button.source.start, button.source.end, "color", "blue");
    const reparsed = parseSource(basicPath, updated);
    const updatedButton = Object.values(reparsed.nodes).find((node) => node.type === "button")!;
    const withWidth = updateInlineStyle(updated, updatedButton.source.start, updatedButton.source.end, "width", "180px");
    expect(withWidth).toContain('style={{ color: "blue", width: "180px" }}');
  });

  it("updates several styles atomically and can extend dynamic styles", () => {
    const document = parseSource(basicPath, basic);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    const resized = updateInlineStyles(basic, button.source.start, button.source.end, { width: "240px", height: "64px", translate: "18px 12px" });
    expect(resized).toContain('width: "240px", height: "64px", translate: "18px 12px"');

    const dynamic = "export const App = ({ style }) => <button style={style}>Move</button>;";
    const dynamicDocument = parseSource("App.tsx", dynamic);
    const dynamicButton = Object.values(dynamicDocument.nodes).find((node) => node.type === "button")!;
    expect(dynamicButton.capabilities.style).toBe(true);
    expect(updateInlineStyles(dynamic, dynamicButton.source.start, dynamicButton.source.end, { width: "120px" }))
      .toContain('style={{ ...(style), width: "120px" }}');
  });

  it("inserts and deletes only the selected JSX range", () => {
    const document = parseSource(basicPath, basic);
    const root = document.nodes[document.roots[0]];
    const inserted = insertElement(basic, root.source.start, root.source.end, "      <p>New item</p>");
    expect(inserted).toContain("<p>New item</p>");
    const parsed = parseSource(basicPath, inserted);
    const paragraph = Object.values(parsed.nodes).find((node) => node.type === "p")!;
    const deleted = deleteElement(inserted, paragraph.source.start, paragraph.source.end);
    expect(deleted).not.toContain("<p>New item</p>");
    expect(deleted).toContain("<button");
  });

  it("inserts a dragged component at exact free canvas coordinates", () => {
    const document = parseSource(basicPath, basic);
    const root = document.nodes[document.roots[0]];
    const inserted = insertElementAtPosition(basic, root.source.start, root.source.end, '<button type="button">Alarm</button>', 318.4, 127.6, true);
    expect(inserted).toContain('className="dashboard" style={{ position: "relative" }}');
    expect(inserted).toContain('position: "absolute", left: "318px", top: "128px", margin: "0px", zIndex: 1');
    expect(() => parseSource(basicPath, inserted)).not.toThrow();
  });

  it("duplicates and reorders sibling JSX without rebuilding the file", () => {
    const document = parseSource(basicPath, basic);
    const heading = Object.values(document.nodes).find((node) => node.type === "h1")!;
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    const duplicated = duplicateElement(basic, button.source.start, button.source.end);
    expect(duplicated.match(/<button/g)).toHaveLength(2);
    const reordered = reorderElement(basic, button.source.start, button.source.end, -1);
    expect(reordered.indexOf("<button")).toBeLessThan(reordered.indexOf("<h1>"));
    expect(reordered).toContain("// This comment must survive editor transformations.");
    expect(() => reorderElement(basic, heading.source.start, heading.source.end, -1)).toThrow();
  });

  it("creates, edits and removes a source-backed highlight interaction", () => {
    const document = parseSource(basicPath, basic);
    const heading = Object.values(document.nodes).find((node) => node.type === "h1")!;
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    const created = addHighlightInteraction(basic, button.source.start, button.source.end, heading.source.start, heading.source.end, {
      targetId: "fc-highlight-test", color: "#f59e0b", width: 3,
    });
    const parsed = parseSource(basicPath, created);
    const createdButton = Object.values(parsed.nodes).find((node) => node.type === "button")!;
    const createdHeading = Object.values(parsed.nodes).find((node) => node.type === "h1")!;
    expect(createdButton.props["data-fc-highlight-target"]).toBe("fc-highlight-test");
    expect(createdHeading.props["data-fc-highlight-id"]).toBe("fc-highlight-test");
    expect(created).toContain('target.style.outline = "3px solid #f59e0b"');

    const updated = updateHighlightTrigger(created, createdButton.source.start, createdButton.source.end, {
      targetId: "fc-highlight-test", color: "#22c55e", width: 5,
    });
    const updatedDocument = parseSource(basicPath, updated);
    const updatedButton = Object.values(updatedDocument.nodes).find((node) => node.type === "button")!;
    expect(updatedButton.props["data-fc-highlight-color"]).toBe("#22c55e");
    expect(updated).toContain('target.style.outline = "5px solid #22c55e"');

    const removed = removeHighlightTrigger(updated, updatedButton.source.start, updatedButton.source.end);
    const removedDocument = parseSource(basicPath, removed);
    const cleanButton = Object.values(removedDocument.nodes).find((node) => node.type === "button")!;
    expect(cleanButton.props["data-fc-highlight-target"]).toBeUndefined();
    expect(removed).not.toContain("onClick=");
  });

  it("does not overwrite an existing custom click action", () => {
    const source = "export function App() { return <main><button onClick={() => alert('ok')}>Go</button><section>Target</section></main>; }";
    const document = parseSource("App.tsx", source);
    const button = Object.values(document.nodes).find((node) => node.type === "button")!;
    const target = Object.values(document.nodes).find((node) => node.type === "section")!;
    expect(() => addHighlightInteraction(source, button.source.start, button.source.end, target.source.start, target.source.end, {
      targetId: "fc-highlight-test", color: "#f59e0b", width: 3,
    })).toThrow(/azione al click personalizzata/);
  });
});
