// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSource } from "../src/source-parser/parseSource";

const bridge = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: {
    readFile: bridge.readFile,
    writeFile: bridge.writeFile,
  },
}));

import { useEditorStore } from "../src/state/editorStore";

describe("editor action history", () => {
  beforeEach(() => {
    bridge.readFile.mockReset();
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    useEditorStore.setState({ history: [], future: [], pages: [], previewPath: "/", selectionStyles: {}, selectionInfo: undefined, selectedId: undefined });
  });

  it("undoes and redoes actions across different component files", async () => {
    const before = "export const Button = () => <button>Before</button>;";
    const after = "export const Button = () => <button>After</button>;";
    const other = "export const Page = () => <main>Page</main>;";
    useEditorStore.setState({
      document: parseSource("Page.jsx", other),
      history: [{ file: "Button.jsx", source: before }],
    });

    await useEditorStore.getState().undo();
    expect(useEditorStore.getState().document?.file).toBe("Button.jsx");
    expect(useEditorStore.getState().document?.source).toBe(before);
    expect(useEditorStore.getState().future).toEqual([{ file: "Page.jsx", source: other }]);

    useEditorStore.setState({ document: parseSource("Button.jsx", after) });
    await useEditorStore.getState().redo();
    expect(useEditorStore.getState().document?.file).toBe("Page.jsx");
    expect(useEditorStore.getState().document?.source).toBe(other);
  });

  it("does not reopen the page file during an HMR refresh on the same route", async () => {
    const component = "export const Button = () => <button>Changed</button>;";
    useEditorStore.setState({
      document: parseSource("Button.jsx", component),
      pages: [{ id: "home", name: "Home", route: "/", file: "App.jsx" }],
      previewPath: "/",
      history: [{ file: "Button.jsx", source: "export const Button = () => <button>Before</button>;" }],
    });

    await useEditorStore.getState().syncPreviewPath("/");
    expect(bridge.readFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().document?.file).toBe("Button.jsx");
  });

  it("records a real visual style edit and restores it with undo and redo", async () => {
    const file = "Button.jsx";
    const before = "export const Button = () => <button>Move</button>;";
    const parsed = parseSource(file, before);
    const button = Object.values(parsed.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ document: parsed, selectedId: button.id, history: [], future: [] });

    await useEditorStore.getState().updateStyle("translate", "24px 10px");
    expect(useEditorStore.getState().document?.source).toContain('translate: "24px 10px"');
    expect(useEditorStore.getState().history).toEqual([{ file, source: before }]);

    await useEditorStore.getState().undo();
    expect(useEditorStore.getState().document?.source).toBe(before);
    expect(useEditorStore.getState().future).toHaveLength(1);

    await useEditorStore.getState().redo();
    expect(useEditorStore.getState().document?.source).toContain('translate: "24px 10px"');
  });

  it("routes a property edit to only the repeated instance clicked in the preview", async () => {
    const file = "List.jsx";
    const before = `export const List = ({ items }) => <div>{items.map((item) => <button>{item.label}</button>)}</div>;`;
    const parsed = parseSource(file, before);
    const button = Object.values(parsed.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({
      document: parsed,
      selectedId: button.id,
      selectionInfo: { instanceIndex: 2, instanceCount: 4 },
      history: [],
      future: [],
    });

    await useEditorStore.getState().updateStyle("width", "210px");

    const source = useEditorStore.getState().document?.source ?? "";
    expect(source).toContain("__framecraftIndex === 2");
    expect(source).toContain('width: "210px"');
    expect(source).not.toContain('<button style={{ width: "210px" }}');
  });

  it("deletes the selected element and restores it with undo", async () => {
    const file = "Page.jsx";
    const before = "export const Page = () => <main><button>Remove me</button><span>Keep me</span></main>;";
    const parsed = parseSource(file, before);
    const button = Object.values(parsed.nodes).find((node) => node.type === "button")!;
    useEditorStore.setState({ document: parsed, selectedId: button.id, history: [], future: [] });

    await useEditorStore.getState().deleteSelection();
    expect(useEditorStore.getState().document?.source).not.toContain("Remove me");
    expect(useEditorStore.getState().history).toEqual([{ file, source: before }]);

    await useEditorStore.getState().undo();
    expect(useEditorStore.getState().document?.source).toBe(before);
  });
});
