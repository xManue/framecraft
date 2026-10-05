// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { parse } from "@babel/parser";
import { parseSource } from "../src/source-parser/parseSource";
import { addHighlightInteraction } from "../src/source-parser/transformSource";

const page = `export default function Page() {
  return (
    <main>
      <button type="button">Evidenzia</button>
      <svg viewBox="0 0 100 100"><path d="M10 10h80v80h-80z" /></svg>
      <div className="scheda">Scheda</div>
    </main>
  );
}`;

/** The click the panel will really run, taken out of the source exactly as it was written. */
function clickHandler(source: string) {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const stack: unknown[] = [ast.program];
  while (stack.length) {
    const node = stack.pop() as { type?: string; name?: { name?: string }; value?: { expression?: { start: number; end: number } } } & Record<string, unknown>;
    if (!node || typeof node !== "object") continue;
    if (node.type === "JSXAttribute" && node.name?.name === "onClick" && node.value?.expression) {
      return new Function(`return (${source.slice(node.value.expression.start, node.value.expression.end)});`)() as (event: unknown) => void;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === "object") stack.push(value);
    }
  }
  throw new Error("Nessun onClick generato.");
}

function highlighted(targetType: "path" | "div") {
  const nodes = Object.values(parseSource("Page.jsx", page).nodes);
  const trigger = nodes.find((node) => node.type === "button")!;
  const target = nodes.find((node) => node.type === targetType)!;
  return addHighlightInteraction(page, trigger.source.start, trigger.source.end, target.source.start, target.source.end,
    { targetId: "fc-highlight-test", color: "#22c55e", width: 5 });
}

describe("the highlight a panel really paints", () => {
  beforeEach(() => {
    // jsdom does no layout, and the handler scrolls the part it lights up into view.
    Element.prototype.scrollIntoView = () => {};
    document.body.innerHTML = "";
  });

  it("strokes a part of a drawing, where an outline would paint nothing", () => {
    document.body.innerHTML = `<svg viewBox="0 0 100 100"><path data-fc-highlight-id="fc-highlight-test" d="M10 10h80v80h-80z" style="stroke: #111111" /></svg>`;
    const part = document.querySelector<SVGElement>("path")!;
    const click = clickHandler(highlighted("path"));

    click({});
    expect(part.style.stroke).toBe("#22c55e");
    expect(part.style.strokeWidth).toBe("5");
    expect(part.style.filter).toContain("drop-shadow");
    expect(part.style.outline).toBe("");
    expect(part.dataset.fcHighlightActive).toBe("true");

    click({});
    // What the drawing had before must come back, not an empty stroke.
    expect(part.style.stroke).toBe("#111111");
    expect(part.style.filter).toBe("");
    expect(part.dataset.fcHighlightActive).toBe("false");
  });

  it("outlines an element of the page, and leaves it as it was", () => {
    document.body.innerHTML = `<div data-fc-highlight-id="fc-highlight-test" style="outline: 1px dotted #333333">Scheda</div>`;
    const card = document.querySelector<HTMLElement>("div")!;
    const click = clickHandler(highlighted("div"));

    click({});
    expect(card.style.outline).toBe("5px solid #22c55e");
    expect(card.style.boxShadow).toContain("#22c55e");
    expect(card.style.stroke).toBe("");

    click({});
    expect(card.style.outline).toBe("1px dotted #333333");
    expect(card.style.boxShadow).toBe("");
  });

  it("still runs the click the button already had", () => {
    const withClick = page.replace('<button type="button">', '<button type="button" onClick={() => window.__opened = true}>');
    const nodes = Object.values(parseSource("Page.jsx", withClick).nodes);
    const trigger = nodes.find((node) => node.type === "button")!;
    const target = nodes.find((node) => node.type === "div")!;
    const source = addHighlightInteraction(withClick, trigger.source.start, trigger.source.end, target.source.start, target.source.end,
      { targetId: "fc-highlight-test", color: "#22c55e", width: 5 });
    document.body.innerHTML = `<div data-fc-highlight-id="fc-highlight-test">Scheda</div>`;

    clickHandler(source)({});

    expect((window as unknown as { __opened?: boolean }).__opened).toBe(true);
    expect(document.querySelector<HTMLElement>("div")!.style.outline).toBe("5px solid #22c55e");
  });
});
