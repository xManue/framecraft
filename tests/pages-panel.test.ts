// @vitest-environment jsdom
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readFile: vi.fn(), writeFile: vi.fn(), createFile: vi.fn(), analyzeProject: vi.fn() } }));
import { desktopBridge } from "../src/filesystem/desktopBridge";
import { useEditorStore } from "../src/state/editorStore";
import { PagesPanel } from "../src/editor/PagesPanel";
import { standardProjectFiles } from "../src/core/standardProject";
import { readPageCategories } from "../src/core/pageNavigation";
import { detectPages } from "../src/core/pages";
const editorStyles = readFileSync(new NodeURL("../src/styles/global.css", import.meta.url), "utf8");
const project = { root: "C:/synthetic-panel", name: "Synthetic", framework: "vite" as const, language: "typescript" as const, packageManager: "npm" as const, entryFiles: [] as string[], files: [], scripts: {}, dependencies: [], hasNodeModules: true, missingDependencies: [] };
const generated = standardProjectFiles({ machineName: "Synthetic", layout: "desktop-mobile", sections: ["main"] });
const sources = Object.fromEntries(generated.filter((item) => /src\/.*\.tsx$/.test(item.path)).map((item) => [`${project.root}/${item.path}`, item.content]));
const router = `${project.root}/src/App.tsx`;
const actions = { createPage: useEditorStore.getState().createPage, createCategory: useEditorStore.getState().createCategory };
let root: Root | undefined, host: HTMLDivElement | undefined;
function button(name: string) { const found = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === name); if (!found) throw Error(`Pulsante non trovato: ${name}`); return found; }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function input(element: HTMLInputElement, text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, text); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(PagesPanel))); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  const pageModel = detectPages(sources);
  useEditorStore.setState({ ...actions, project: { ...project, entryFiles: Object.keys(sources) }, pages: pageModel.pages, routerFile: router, routerEditable: true, pageCategories: readPageCategories(sources[router]), document: undefined, selectedId: undefined, dirty: false, consoleEntries: [], history: [], future: [], selectionInfo: undefined });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; useEditorStore.setState(actions); vi.restoreAllMocks(); });
describe("finestra pagine e categorie", () => {
  it("mantiene lo stile delle pagine dentro categorie e gruppi liberi", async () => {
    useEditorStore.setState({ activePageId: useEditorStore.getState().pages[0].id, pageCategories: [] });
    const style = document.createElement("style"); style.textContent = editorStyles; document.head.append(style);
    try {
      await mount();
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".page-category-group > button"));
      expect(buttons).toHaveLength(useEditorStore.getState().pages.length);
      for (const item of buttons) { expect(item.classList.contains("page-list-item")).toBe(true); expect(getComputedStyle(item).display).toBe("flex"); expect(getComputedStyle(item).backgroundColor).not.toBe("buttonface"); }
      expect(document.querySelectorAll('.page-list [aria-current="page"]')).toHaveLength(1);
      await act(async () => { useEditorStore.setState({ pageCategories: readPageCategories(sources[router]) }); root!.render(createElement(PagesPanel)); });
      for (const item of document.querySelectorAll(".page-category-group > button")) expect(getComputedStyle(item).display).toBe("flex");
    } finally { style.remove(); }
  });
  it("non ripristina un vecchio menu se una lettura lenta termina dopo la creazione", async () => {
    let complete!: (source: string) => void;
    vi.mocked(desktopBridge.readFile).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const read = useEditorStore.getState().refreshPageCategories();
    const newer = [...useEditorStore.getState().pageCategories, { ...useEditorStore.getState().pageCategories[0], id: "new", label: "Nuova", number: 10 }];
    useEditorStore.setState({ pageCategories: newer }); complete(sources[router]); await read;
    expect(useEditorStore.getState().pageCategories).toBe(newer);
  });
  it("apre una finestra accessibile, non il modulo inline, e torna al comando con Escape", async () => {
    await mount(); const opener = button("Nuova pagina"); opener.focus(); await click(opener);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".new-page-form")).toBeNull();
    expect(document.activeElement?.tagName).toBe("INPUT");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(opener);
  });
  it("crea la categoria e resta nella finestra per aggiungere la prima pagina", async () => {
    const create = vi.fn(async () => {
      const category = { ...readPageCategories(sources[router])[0], id: "manutenzione", label: "Manutenzione", number: 10, route: "", pages: [], entries: [] };
      useEditorStore.setState({ pageCategories: [...useEditorStore.getState().pageCategories, category] }); return category;
    });
    useEditorStore.setState({ createCategory: create }); await mount(); await click(button("Nuova categoria"));
    await input(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, "Manutenzione");
    await click(button("Crea categoria")); expect(create).toHaveBeenCalledWith("Manutenzione"); expect(document.querySelector('[role="status"]')?.textContent).toContain("prima pagina"); expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const template = Array.from(document.querySelectorAll<HTMLButtonElement>(".page-template-choice > button")).find((item) => item.textContent?.includes("Funzioni speciali"))!;
    await click(template); expect(document.querySelector<HTMLSelectElement>(".page-creation-fields select")!.value).toBe("manutenzione");
  });
  it("conserva i campi in caso di errore e non finge che la pagina sia stata creata", async () => {
    const create = vi.fn(async () => { throw Error("Percorso già usato: scegli un altro percorso."); });
    useEditorStore.setState({ createPage: create }); await mount(); await click(button("Nuova pagina"));
    await input(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, "Motori"); await click(button("Crea e apri pagina"));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Percorso già usato"); expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe("Motori"); expect(create).toHaveBeenCalledOnce();
  });
  it("collega realmente categoria e pagina al router e alla navigazione standard", async () => {
    const disk = { ...sources };
    vi.mocked(desktopBridge.readFile).mockImplementation(async (file) => { if (!(file in disk)) throw Error("ENOENT"); return disk[file]; });
    vi.mocked(desktopBridge.writeFile).mockImplementation(async (file, source) => { disk[file] = source; });
    vi.mocked(desktopBridge.createFile).mockImplementation(async (file, source) => { const full = `${project.root}/${file}`; disk[full] = source; return full; });
    vi.mocked(desktopBridge.analyzeProject).mockImplementation(async () => ({ ...project, entryFiles: Object.keys(disk) }));
    const category = await actions.createCategory("Manutenzione"); await actions.createPage("Motori", "/motori", category.id, "blank");
    expect(readPageCategories(disk[router]).find((item) => item.id === category.id)).toMatchObject({ route: "/motori", pages: ["/motori"], entries: [{ label: "Motori", route: "/motori" }] });
    expect(disk[`${project.root}/src/pages/MotoriPage.tsx`]).toContain("data-page-number={10001}");
    expect(disk[router]).toContain('"10001": "/motori"');
    expect(useEditorStore.getState().previewPath).toBe("/motori"); expect(useEditorStore.getState().document?.file).toBe(`${project.root}/src/pages/MotoriPage.tsx`);
  });
  it("non sovrascrive pagine esistenti o una bozza della navigazione", async () => {
    const existingName = Object.keys(sources).find((file) => file.includes("/pages/"))!.split("/").at(-1)!.replace(/Page\.tsx$/, "");
    await expect(actions.createPage(existingName, "/nuova")).rejects.toThrow(/file pagina/);
    useEditorStore.setState({ dirty: true, document: { file: router } as never });
    await expect(actions.createCategory("Altra")).rejects.toThrow(/bozza/); expect(desktopBridge.writeFile).not.toHaveBeenCalled();
  });
});
