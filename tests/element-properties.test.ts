// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { updateStaticAttributes } from "../src/source-parser/transformSource";
// The preview plugin is shipped as plain ESM so imported projects do not need TypeScript.
// @ts-expect-error no declaration is required for the runtime plugin.
import framecraftPlugin from "../scripts/framecraft-vite-plugin.mjs";

const page = `export function Page({ extra, target }) {
  return (
    <main className="page">
      <a href="/home" id="back" target={target} {...extra}>Torna</a>
      <input type="checkbox" name="ready" disabled />
    </main>
  );
}`;

function nodeOfType(source: string, type: string) {
  const document = parseSource("Page.tsx", source);
  const node = Object.values(document.nodes).find((item) => item.type === type);
  if (!node) throw new Error(`nessun <${type}> nel documento`);
  return node;
}

describe("element property sheet", () => {
  it("lists every attribute of an element, separating the editable ones from the dynamic ones", () => {
    const link = nodeOfType(page, "a");
    expect(link.props).toEqual({ href: "/home", id: "back" });
    expect(link.dynamicProps).toEqual(["target", "...spread"]);

    const checkbox = nodeOfType(page, "input");
    expect(checkbox.props).toEqual({ type: "checkbox", name: "ready", disabled: true });
    expect(checkbox.dynamicProps).toEqual([]);
  });

  it("rewrites an existing attribute and adds a missing one", () => {
    const link = nodeOfType(page, "a");
    const renamed = updateStaticAttributes(page, link.source.start, link.source.end, { href: "/contatti" });
    expect(renamed).toContain('href="/contatti"');
    expect(renamed).toContain('id="back"');

    const labelled = updateStaticAttributes(page, link.source.start, link.source.end, { title: "Vai indietro" });
    expect(labelled).toContain('title="Vai indietro"');
    expect(nodeOfType(labelled, "a").props.title).toBe("Vai indietro");
  });

  it("refuses to overwrite an attribute that holds an expression", () => {
    const link = nodeOfType(page, "a");
    expect(() => updateStaticAttributes(page, link.source.start, link.source.end, { target: "_blank" }))
      .toThrow(/dinamico/);
    expect(() => updateStaticAttributes(page, link.source.start, link.source.end, { style: "color: red" }))
      .toThrow(/stile/i);
  });

  it("escapes a value instead of breaking the JSX around it", () => {
    const link = nodeOfType(page, "a");
    const quoted = updateStaticAttributes(page, link.source.start, link.source.end, { id: 'a "quoted" value' });
    expect(nodeOfType(quoted, "a").props.id).toBe('a "quoted" value');
  });

  it("asks the editor to open the property sheet on a double click", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const messages: { type: string }[] = [];
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: (message: { type: string }) => messages.push(message) } });

    const source = { file: "C:/project/src/Page.tsx", start: 10, end: 40, line: 3, column: 5 };
    const container = document.createElement("main");
    container.setAttribute("data-fc-source", JSON.stringify(source));
    // A container with children never qualified for inline editing, so it used to ignore a double click.
    container.append(document.createElement("span"));
    document.body.append(container);

    const plugin = framecraftPlugin();
    window.eval(plugin.transformIndexHtml("<div id=\"root\"></div>").tags[0].children);
    container.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));

    expect(messages.filter((message) => message.type === "framecraft:inspect")).toHaveLength(1);
  });
});
