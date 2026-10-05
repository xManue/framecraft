// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";
import { deleteElement, deleteElementInstance, updateStaticText, updateStaticTextForInstance } from "../src/source-parser/transformSource";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile },
}));

import { useEditorStore } from "../src/state/editorStore";

const list = `export const List = ({ items }) => (
  <ul>
    {items.map((item) => (
      <li className="row">{item.label}</li>
    ))}
  </ul>
);
`;

function liOf(source: string) {
  const document = parseSource("List.jsx", source);
  const node = Object.values(document.nodes).find((item) => item.type === "li")!;
  return { document, node };
}

describe("elements a list repeats", () => {
  it("removes the selected copy instead of blanking the whole list", () => {
    const { node } = liOf(list);
    // Cutting the element out leaves an empty callback, so the old fallback turned the body into
    // null and every row of the list disappeared at once.
    expect(deleteElement(list, node.source.start, node.source.end).emptied).toBe(true);

    const removed = deleteElementInstance(list, node.source.start, node.source.end, 1);
    expect(removed).toContain("__framecraftIndex === 1 ? null :");
    expect(removed).toContain("<li className=\"row\">");
    expect(removed).toContain("items.map((item, __framecraftIndex)");
  });

  it("rewrites the text of one copy and leaves the others on their own value", () => {
    const { node } = liOf(list);
    const edited = updateStaticTextForInstance(list, node.source.start, node.source.end, "Riga scelta", 2);
    expect(edited).toContain('__framecraftIndex === 2 ? "Riga scelta" : item.label');

    // Editing the same copy again must replace the value, not bury one guard inside another.
    const again = liOf(edited);
    const twice = updateStaticTextForInstance(edited, again.node.source.start, again.node.source.end, "Terza riga", 2);
    expect(twice).toContain('__framecraftIndex === 2 ? "Terza riga" : item.label');
    expect(twice).not.toContain("Riga scelta");
  });

  it("edits the written run of an element that also holds other elements", () => {
    const mixed = "export const Row = () => <button><svg /> Avvia</button>;";
    const node = Object.values(parseSource("Row.jsx", mixed).nodes).find((item) => item.type === "button")!;
    expect(node.capabilities.text).toBe(true);
    expect(node.text).toBe("Avvia");
    expect(updateStaticText(mixed, node.source.start, node.source.end, "Ferma")).toContain("<svg /> Ferma</button>");
  });

  it("refuses to replace content that is made of other elements", () => {
    const nested = "export const Row = () => <button><small>01</small><span>Nome</span></button>;";
    const node = Object.values(parseSource("Row.jsx", nested).nodes).find((item) => item.type === "button")!;
    expect(node.capabilities.text).toBe(false);
    expect(() => updateStaticText(nested, node.source.start, node.source.end, "Ferma")).toThrow(/elementi figli/i);
  });
});

describe("the editor applies an edit to the copy the preview reports", () => {
  beforeEach(() => {
    bridge.readFile.mockReset().mockResolvedValue(list);
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    const { document, node } = liOf(list);
    useEditorStore.setState({
      document, selectedId: node.id, history: [], future: [], consoleEntries: [], lastError: undefined,
      editScope: "instance",
      selectionInfo: { instanceIndex: 2, instanceCount: 4, listIndex: 2 },
    });
  });

  function written() {
    return bridge.writeFile.mock.calls.at(-1)?.[1] as string;
  }

  it("deletes only the selected row and says so", async () => {
    await useEditorStore.getState().deleteSelection();

    expect(useEditorStore.getState().lastError).toBeUndefined();
    expect(written()).toContain("__framecraftIndex === 2 ? null :");
    expect(written()).toContain("<li className=\"row\">");
    expect(useEditorStore.getState().consoleEntries.at(-1)?.message).toContain("copia #3");
  });

  it("changes the text of that row alone", async () => {
    await useEditorStore.getState().updateText("Riga scelta");

    expect(written()).toContain('__framecraftIndex === 2 ? "Riga scelta" : item.label');
  });

  it("still edits every copy when the user asks for all of them", async () => {
    useEditorStore.setState({ editScope: "all" });

    await useEditorStore.getState().updateText("Tutte");

    expect(written()).toContain('{"Tutte"}');
    expect(written()).not.toContain("__framecraftIndex");
  });

  it("starts each new selection from the single copy again", async () => {
    useEditorStore.setState({ editScope: "all" });
    const other = Object.values(useEditorStore.getState().document!.nodes).find((node) => node.type === "ul")!;

    await useEditorStore.getState().selectSource(other.source);

    expect(useEditorStore.getState().editScope).toBe("instance");
  });
});
