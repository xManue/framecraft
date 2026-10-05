import { beforeEach, describe, expect, it, vi } from "vitest";
import { editableSummary, isEditableFile, parseTemplateContract, relativeToTemplate, templateDirectories } from "../src/core/templateContract";
import { matchLineEndings } from "../src/source-parser/lineEndings";

const bridge = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn() }));
vi.mock("../src/filesystem/desktopBridge", () => ({
  desktopAvailable: true,
  desktopBridge: { readFile: bridge.readFile, writeFile: bridge.writeFile, createFile: bridge.createFile },
}));
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";

const shellContract = JSON.stringify({
  id: "operator-shell",
  name: "Operator Shell",
  entry: "src/OperatorShellTemplate.jsx",
  editableFiles: ["src/templateData.js", "src/styles.css", "src/App.jsx"],
});

describe("what a template lets a panel change inside it", () => {
  it("reads the contract the catalog already carries", () => {
    const contract = parseTemplateContract("C:/hmi/templates/operator-shell", shellContract)!;
    expect(contract.name).toBe("Operator Shell");
    expect(relativeToTemplate(contract, "C:\\hmi\\templates\\operator-shell\\src\\styles.css")).toBe("src/styles.css");
    expect(isEditableFile(contract, "C:/hmi/templates/operator-shell/src/styles.css")).toBe(true);
    // Il componente no: è quello che vale per tutte le macchine.
    expect(isEditableFile(contract, "C:/hmi/templates/operator-shell/src/OperatorShellTemplate.jsx")).toBe(false);
    // Un file che sta fuori dal template non lo riguarda.
    expect(isEditableFile(contract, "C:/hmi/panels/can-line/src/App.jsx")).toBe(true);
  });

  it("says what can be changed in a line, not in a wall of paths", () => {
    const shell = parseTemplateContract("C:/hmi/templates/operator-shell", JSON.stringify({
      id: "operator-shell", name: "Operator Shell",
      editableFiles: ["src/templateData.js", "src/styles.css", "src/App.jsx", "linked/main-menu-popup/src/templateData.js"],
    }))!;
    expect(editableSummary(shell)).toBe("src/templateData.js, src/styles.css e altri 2");
    expect(editableSummary(parseTemplateContract("C:/x", JSON.stringify({ id: "x", editableFiles: ["a.js"] }))!)).toBe("a.js");
  });

  it("leaves alone a template that never declared anything", () => {
    expect(parseTemplateContract("C:/hmi/templates/x", JSON.stringify({ id: "x" }))).toBeUndefined();
    expect(parseTemplateContract("C:/hmi/templates/x", "non json")).toBeUndefined();
  });

  it("looks for the owner starting from the nearest directory", () => {
    expect(templateDirectories("C:/hmi/templates/operator-shell/linked/main-menu-popup/src/Menu.jsx", 3)).toEqual([
      "C:/hmi/templates/operator-shell/linked/main-menu-popup/src",
      "C:/hmi/templates/operator-shell/linked/main-menu-popup",
      "C:/hmi/templates/operator-shell/linked",
    ]);
  });
});

describe("the line endings of the file being written", () => {
  it("writes what the file already used, so one edit is not a diff of everything", () => {
    expect(matchLineEndings("a\r\nb\r\nc")).toBe("a\r\nb\r\nc");
    // Un frammento inserito arriva con \n: dentro un file CRLF diventa CRLF.
    expect(matchLineEndings("a\r\nb\nc\r\n")).toBe("a\r\nb\r\nc\r\n");
    expect(matchLineEndings("a\nb\nc")).toBe("a\nb\nc");
    expect(matchLineEndings("")).toBe("");
  });
});

describe("editing a file the template owns", () => {
  const componentFile = "C:/hmi/templates/operator-shell/src/OperatorShellTemplate.jsx";
  const component = "export default function Shell(){ return <div className=\"operator-shell\"><h1>Linea</h1></div>; }";

  beforeEach(() => {
    bridge.readFile.mockReset().mockImplementation(async (file: string) => {
      if (file.endsWith("template.json")) {
        if (file === "C:/hmi/templates/operator-shell/template.json") return shellContract;
        throw new Error("nessun template qui");
      }
      return component;
    });
    bridge.writeFile.mockReset().mockResolvedValue(undefined);
    const document = parseSource(componentFile, component);
    useEditorStore.setState({
      project: { root: "C:/hmi/panels/can-line", name: "can-line", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
      panelManifest: undefined, pages: [], activePageId: undefined, unlockedPages: [], unlockedFiles: [],
      document, selectedId: Object.values(document.nodes).find((node) => node.type === "h1")!.id,
      history: [], future: [], consoleEntries: [], lastError: undefined,
    });
  });

  it("refuses to change the component every machine shares, and says what to change instead", async () => {
    await useEditorStore.getState().updateText("Altro");

    expect(bridge.writeFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().lastError).toContain("Operator Shell");
    expect(useEditorStore.getState().lastError).toContain("src/templateData.js");
    // Il messaggio dice dove si sblocca, e non elenca undici percorsi.
    expect(useEditorStore.getState().lastError).toContain("Modifica comunque questo file");
    expect(useEditorStore.getState().lastError!.length).toBeLessThan(320);
  });

  it("lets it through once the file is unlocked on purpose", async () => {
    useEditorStore.getState().unlockFile(componentFile);

    await useEditorStore.getState().updateText("Altro");

    expect(bridge.writeFile).toHaveBeenCalled();
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("lets the author work when the template itself is the open project", async () => {
    // Aprire il template per scriverlo è il motivo per cui esiste l'editor: lì niente è vietato.
    useEditorStore.setState({
      project: { root: "C:/hmi/templates/operator-shell", name: "operator-shell", framework: "vite", language: "javascript", packageManager: "npm", entryFiles: [], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] },
      lastError: undefined,
    });

    await useEditorStore.getState().updateText("Altro");

    expect(bridge.writeFile).toHaveBeenCalled();
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });

  it("keeps a panel's own file freely editable", async () => {
    const panelFile = "C:/hmi/panels/can-line/src/MachineView.jsx";
    const source = "export default function View(){ return <main><h1>Vista</h1></main>; }";
    bridge.readFile.mockImplementation(async (file: string) => {
      if (file.endsWith("template.json")) throw new Error("nessun template qui");
      return source;
    });
    const document = parseSource(panelFile, source);
    useEditorStore.setState({ document, selectedId: Object.values(document.nodes).find((node) => node.type === "h1")!.id, lastError: undefined });

    await useEditorStore.getState().updateText("Altra vista");

    expect(bridge.writeFile).toHaveBeenCalled();
    expect(useEditorStore.getState().lastError).toBeUndefined();
  });
});
