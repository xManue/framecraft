import { create } from "zustand";
import type { ComponentPlacement, ConsoleEntry, EditorDocument, InteractionMode, PageDefinition, PreviewStatus, ProjectAnalysis, RenderedInfo, SelectionRect, SourceRef, ViewMode, Viewport } from "../core/types";
import type { PlcVariableDefinition } from "../core/plcVariables";
import { desktopBridge, desktopAvailable } from "../filesystem/desktopBridge";
import { insideProject, joinProjectPath } from "../core/paths";

type LeftPanel = "project" | "components" | "pages" | "plc";
type HighlightSettings = { color: string; width: number };
type HighlightPicker = HighlightSettings & { trigger: SourceRef; triggerLabel: string };
type HistorySnapshot = { file: string; source: string };
/** Why an element on the canvas could not be tied back to its source. Naming the exact step turns a
 * dead panel into something the user can act on. */
export type SelectionProblem = "outside" | "unreadable" | "unparsed" | "missing";
export interface UnresolvedSelection {
  file: string;
  tag?: string;
  source: SourceRef;
  reason: SelectionProblem;
  detail?: string;
}

interface EditorState {
  project?: ProjectAnalysis;
  document?: EditorDocument;
  pages: PageDefinition[];
  routerFile?: string;
  routerEditable: boolean;
  activePageId?: string;
  requestedStatePage?: string;
  selectedId?: string;
  selectionRect?: SelectionRect;
  selectionStyles: Record<string, string>;
  /** Bumped to force every Inspector section open; a double click in the canvas sets it. */
  propertiesExpandedAt?: number;
  /** Set when the preview selects an element whose source file is not part of the open project. */
  unresolvedSelection?: UnresolvedSelection;
  /** What the preview reports about the selected element: rendered text, PLC tag, id, classes. */
  selectionInfo?: RenderedInfo;
  /** PLC catalog of the open project, used to describe the signal an element is wired to. */
  plcVariables: PlcVariableDefinition[];
  /** Source directories outside the project folder that the running preview declares. */
  externalRoots: string[];
  previewUrl?: string;
  previewPath: string;
  previewStatus: PreviewStatus;
  previewError?: string;
  lastError?: string;
  highlightPicker?: HighlightPicker;
  interactionMode: InteractionMode;
  viewMode: ViewMode;
  viewport: Viewport;
  zoom: number;
  leftPanel: LeftPanel;
  leftPanelCollapsed: boolean;
  paletteOpen: boolean;
  draggedComponent?: string;
  consoleOpen: boolean;
  standalonePreviewOpen: boolean;
  loading: boolean;
  dirty: boolean;
  recentProjects: string[];
  history: HistorySnapshot[];
  future: HistorySnapshot[];
  consoleEntries: ConsoleEntry[];
  setViewMode: (mode: ViewMode) => void;
  setViewport: (viewport: Viewport) => void;
  setZoom: (zoom: number) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setLeftPanel: (panel: LeftPanel) => void;
  toggleLeftPanel: () => void;
  setPaletteOpen: (open: boolean) => void;
  setDraggedComponent: (jsx?: string) => void;
  setConsoleOpen: (open: boolean) => void;
  chooseAndOpenProject: () => Promise<void>;
  createProject: () => Promise<void>;
  openProject: (root: string) => Promise<void>;
  removeRecentProject: (root: string) => void;
  closeProject: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  openPage: (page: PageDefinition) => Promise<void>;
  createPage: (name: string, route: string) => Promise<void>;
  syncPreviewPath: (path: string) => Promise<void>;
  syncStatePage: (value: string) => void;
  markPreviewReady: () => void;
  addPreviewOutput: (stream: string, line: string) => void;
  setSelectionRect: (rect?: SelectionRect) => void;
  setSelectionStyles: (styles: Record<string, string>) => void;
  setSelectionInfo: (info?: RenderedInfo) => void;
  selectSource: (source: SourceRef, tag?: string) => Promise<void>;
  beginHighlightSelection: (settings: HighlightSettings) => void;
  cancelHighlightSelection: () => void;
  updateHighlightInteraction: (settings: HighlightSettings) => Promise<void>;
  removeHighlightInteraction: () => Promise<void>;
  expandProperties: () => void;
  inspectSource: (source: SourceRef, tag?: string) => Promise<void>;
  updateAttribute: (name: string, value: string) => Promise<void>;
  updateText: (value: string) => Promise<void>;
  updateStyle: (property: string, value: string | number) => Promise<void>;
  updateStyles: (values: Record<string, string | number>) => Promise<void>;
  insertComponent: (jsx: string, placement?: ComponentPlacement) => Promise<void>;
  deleteSelection: () => Promise<void>;
  duplicateSelection: () => Promise<void>;
  moveSelection: (direction: -1 | 1) => Promise<void>;
  replaceCode: (source: string) => void;
  save: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  refreshPreview: () => void;
  restartPreview: () => Promise<void>;
  openStandalonePreview: () => Promise<void>;
  closeStandalonePreview: () => void;
  handleExternalFileChange: (path: string) => Promise<void>;
}

function readRecentProjects() {
  if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem("framecraft.recent") ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function persistRecentProjects(projects: string[]) {
  if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") return;
  try { localStorage.setItem("framecraft.recent", JSON.stringify(projects)); } catch { /* Recent projects must never block opening a project. */ }
}

const recent = readRecentProjects();
const insertableElements = new Set(["main", "section", "div", "article", "form", "header", "footer", "aside", "nav", "ul", "ol", "li", "label"]);

// Re-entrancy is tracked outside the store so a failed open can never leave the loading screen stuck.
let projectOpening = false;

// Only a genuine startup failure may hide the preview: a log line that merely mentions an error must not.
const fatalPreviewOutput = [
  /error when starting dev server/i,
  /failed to load config/i,
  /EADDRINUSE|address already in use|is already in use/i,
  /cannot find module/i,
  /is not recognized as an internal or external command/i,
  /command not found/i,
  /ERR_MODULE_NOT_FOUND/,
];

function entry(level: ConsoleEntry["level"], message: string): ConsoleEntry {
  return { id: crypto.randomUUID(), level, message, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
}

/** The catalog is optional: a project without one simply shows the tag name with no description. */
async function readPlcCatalog(root: string): Promise<PlcVariableDefinition[]> {
  try {
    const { parsePlcCatalog } = await import("../core/plcVariables");
    return parsePlcCatalog(await desktopBridge.readFile(joinProjectPath(root, "framecraft.plc.json")));
  } catch {
    return [];
  }
}

async function inspectPages(project: ProjectAnalysis) {
  const sources: Record<string, string> = {};
  await Promise.all(project.entryFiles.map(async (file) => {
    try { sources[file] = await desktopBridge.readFile(file); } catch { /* An unreadable component must not block the project. */ }
  }));
  const { detectPages } = await import("../core/pages");
  return detectPages(sources);
}

function relativeImport(fromFile: string, toFile: string) {
  const from = fromFile.replaceAll("\\", "/").split("/");
  const to = toFile.replaceAll("\\", "/").replace(/\.(tsx|jsx)$/, "").split("/");
  from.pop();
  while (from.length && to.length && from[0]?.toLowerCase() === to[0]?.toLowerCase()) { from.shift(); to.shift(); }
  const result = `${"../".repeat(from.length)}${to.join("/")}`;
  return result.startsWith(".") ? result : `./${result}`;
}

function insertionTarget(document: EditorDocument, selectedId?: string) {
  let current = selectedId ? document.nodes[selectedId] : undefined;
  while (current) {
    if (current.capabilities.insert && insertableElements.has(current.type)) return current;
    current = current.parentId ? document.nodes[current.parentId] : undefined;
  }
  return Object.values(document.nodes).find((node) => node.capabilities.insert && insertableElements.has(node.type))
    ?? Object.values(document.nodes).find((node) => node.capabilities.insert && /^[a-z]/.test(node.type));
}

function highlightSettings(settings: HighlightSettings) {
  if (!/^#[0-9a-f]{6}$/i.test(settings.color)) throw new Error("Scegli un colore valido per l'evidenziazione.");
  return { color: settings.color.toLowerCase(), width: Math.min(8, Math.max(1, Math.round(settings.width))) };
}

export const useEditorStore = create<EditorState>((set, get) => {
  async function restoreSnapshot(snapshot: HistorySnapshot) {
    const currentDocument = get().document;
    const selected = currentDocument?.file === snapshot.file && get().selectedId ? currentDocument.nodes[get().selectedId!] : undefined;
    const { parseSource } = await import("../source-parser/parseSource");
    const parsed = parseSource(snapshot.file, snapshot.source, (currentDocument?.version ?? 0) + 1);
    const nextSelected = selected && Object.values(parsed.nodes).find((node) => node.type === selected.type && node.source.start === selected.source.start);
    set({ document: parsed, selectedId: nextSelected?.id, selectionStyles: nextSelected ? get().selectionStyles : {}, dirty: true });
    if (desktopAvailable) {
      await desktopBridge.writeFile(snapshot.file, snapshot.source);
      set({ dirty: false });
    }
  }

  async function applySource(source: string, pushHistory = true) {
    const document = get().document;
    if (!document) return;
    await restoreSnapshot({ file: document.file, source });
    if (pushHistory) set((state) => ({ history: [...state.history, { file: document.file, source: document.source }].slice(-100), future: [] }));
  }

  function reportError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    set((state) => ({ lastError: message, consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("error", message)] }));
  }

  function reportWarning(message: string) {
    set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("warning", message)] }));
  }

  // A file that cannot be parsed still opens as a code-only document: a syntax error in one page
  // must never abort opening the whole project. The failing step is reported so the editor can say
  // what went wrong rather than showing an empty panel.
  async function readDocument(file: string): Promise<{ document?: EditorDocument; reason?: SelectionProblem; detail?: string }> {
    let source: string;
    try {
      source = await desktopBridge.readFile(file);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      reportWarning(`Impossibile leggere ${file}: ${detail}`);
      return { reason: "unreadable", detail };
    }
    const { parseSource } = await import("../source-parser/parseSource");
    try {
      return { document: parseSource(file, source) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      reportWarning(`${file} contiene un errore di sintassi (${detail}). Correggilo in modalità Code.`);
      return { document: { file, source, nodes: {}, roots: [], version: 1 }, reason: "unparsed", detail };
    }
  }

  async function documentFor(file: string): Promise<EditorDocument | undefined> {
    return (await readDocument(file)).document;
  }

  return {
    pages: [], routerEditable: false, activePageId: undefined, requestedStatePage: undefined, previewPath: "/", previewStatus: "idle", interactionMode: "edit", selectionStyles: {}, plcVariables: [], externalRoots: [],
    viewMode: "visual", viewport: "desktop", zoom: 0.82, leftPanel: "pages", leftPanelCollapsed: false,
    paletteOpen: false, draggedComponent: undefined, consoleOpen: false, standalonePreviewOpen: false, loading: false, dirty: false, recentProjects: recent, history: [], future: [],
    consoleEntries: [entry("info", desktopAvailable ? "Desktop bridge ready" : "Browser mode: local project actions require the Tauri app")],
    setViewMode: (viewMode) => set({ viewMode }),
    setViewport: (viewport) => set({ viewport }),
    setZoom: (zoom) => set({ zoom: Math.min(1.5, Math.max(0.25, zoom)) }),
    setInteractionMode: (interactionMode) => set({ interactionMode, selectedId: interactionMode === "navigate" ? undefined : get().selectedId,
      selectionRect: interactionMode === "navigate" ? undefined : get().selectionRect,
      selectionStyles: interactionMode === "navigate" ? {} : get().selectionStyles,
      highlightPicker: interactionMode === "navigate" ? undefined : get().highlightPicker }),
    setLeftPanel: (leftPanel) => set((state) => ({ leftPanel, leftPanelCollapsed: state.leftPanel === leftPanel ? !state.leftPanelCollapsed : false })),
    toggleLeftPanel: () => set((state) => ({ leftPanelCollapsed: !state.leftPanelCollapsed })),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    setDraggedComponent: (draggedComponent) => set({ draggedComponent }),
    setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
    async chooseAndOpenProject() {
      try { const root = await desktopBridge.chooseDirectory(); if (root) await get().openProject(root); } catch (error) { reportError(error); }
    },
    async createProject() {
      if (projectOpening) return;
      try {
        const root = await desktopBridge.chooseDirectory();
        if (!root) return;
        projectOpening = true;
        set({ loading: true, lastError: undefined });
        try { await desktopBridge.createProject(root); }
        finally { projectOpening = false; }
        await get().openProject(root);
      } catch (error) { set({ loading: false }); reportError(error); }
    },
    async openProject(root) {
      if (projectOpening) return;
      projectOpening = true;
      set({ loading: true, previewStatus: "starting", previewError: undefined, lastError: undefined });
      try {
        const workingCopy = await desktopBridge.createWorkingCopy(root);
        for (const warning of workingCopy.warnings ?? []) reportWarning(warning);
        const analysis = await desktopBridge.analyzeProject(workingCopy.root);
        const project: ProjectAnalysis = { ...analysis, originalRoot: workingCopy.originalRoot, workspaceRoot: workingCopy.workspaceRoot, isWorkingCopy: true };
        const pageData = await inspectPages(project);
        const firstPage = pageData.pages.find((page) => page.route === "/") ?? pageData.pages[0];
        const target = firstPage?.file ?? project.entryFiles.find((file) => /App\.(tsx|jsx)$/.test(file)) ?? project.entryFiles[0];
        if (!target) throw new Error("Nessun file React modificabile trovato in src/.");
        const document = await documentFor(target);
        const recentProjects = [workingCopy.root, ...get().recentProjects.filter((item) => item !== root && item !== workingCopy.root && item !== workingCopy.originalRoot)].slice(0, 8);
        persistRecentProjects(recentProjects);
        set({ project, document, plcVariables: [], pages: pageData.pages, routerFile: pageData.routerFile, routerEditable: pageData.routerEditable,
          activePageId: firstPage?.id, requestedStatePage: firstPage?.stateValue,
          previewUrl: undefined, previewPath: firstPage?.route ?? "/", recentProjects, history: [], future: [], dirty: false, externalRoots: [], selectedId: undefined, selectionRect: undefined, selectionStyles: {}, selectionInfo: undefined, unresolvedSelection: undefined,
          highlightPicker: undefined, standalonePreviewOpen: false, previewStatus: "starting", leftPanel: pageData.pages.length ? "pages" : "project", leftPanelCollapsed: false });
        // The PLC catalog only enriches the Inspector, so it must never delay starting the preview.
        void readPlcCatalog(project.root).then((plcVariables) => set({ plcVariables }));
        try {
          const preview = await desktopBridge.startPreview(workingCopy.root);
          set((state) => ({ previewUrl: preview.url, previewStatus: "starting", externalRoots: preview.sourceRoots ?? [], consoleEntries: [...state.consoleEntries,
            ...(workingCopy.created ? [entry("success", `Copia di lavoro creata. L'originale resta invariato: ${workingCopy.originalRoot}`)] : []),
            entry("success", `Preview avviata su ${preview.url}`)] }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ previewStatus: "error", previewError: message }); reportError(error);
        }
      } catch (error) {
        // The preview may already be running for a project we failed to finish opening.
        try { await desktopBridge.stopPreview(); } catch { /* Stopping a preview that never started is not an error. */ }
        set({ previewStatus: "error", previewError: error instanceof Error ? error.message : String(error) }); reportError(error);
      } finally {
        set({ loading: false });
        projectOpening = false;
      }
    },
    removeRecentProject(root) {
      const recentProjects = get().recentProjects.filter((item) => item !== root);
      persistRecentProjects(recentProjects);
      set({ recentProjects });
    },
    async closeProject() {
      if (get().dirty && !window.confirm("Ci sono modifiche non salvate. Vuoi tornare comunque ai progetti?")) return;
      // Returning to the project list must always succeed, even if the host cannot stop the preview.
      try { await desktopBridge.closeProject(); } catch (error) { reportError(error); }
      set({ project: undefined, document: undefined, pages: [], routerFile: undefined, routerEditable: false, activePageId: undefined, requestedStatePage: undefined, selectedId: undefined, selectionRect: undefined, selectionStyles: {},
        previewUrl: undefined, previewPath: "/", previewStatus: "idle", previewError: undefined, lastError: undefined, highlightPicker: undefined,
        standalonePreviewOpen: false, history: [], future: [], dirty: false, loading: false });
    },
    async openFile(path) {
      if (!/\.[jt]sx?$/.test(path)) return;
      const current = get().document;
      // Visual edits are written straight to disk, so a pending code-view buffer is flushed the same way
      // instead of being silently dropped when the user switches file.
      if (current && get().dirty && current.file !== path) {
        try {
          await desktopBridge.writeFile(current.file, current.source);
          set({ dirty: false });
          reportWarning(`Modifiche in sospeso salvate in ${current.file} prima di cambiare file.`);
        } catch (error) { reportError(error); return; }
      }
      const document = await documentFor(path);
      if (document) set({ document, selectedId: undefined, selectionRect: undefined, selectionStyles: {}, dirty: false });
    },
    async openPage(page) {
      set({ previewPath: page.route, activePageId: page.id, requestedStatePage: page.stateValue,
        interactionMode: "edit", selectedId: undefined, selectionRect: undefined, highlightPicker: undefined });
      await get().openFile(page.file);
    },
    async createPage(name, route) {
      const { project, routerFile, pages } = get();
      if (!project || !routerFile || !get().routerEditable) throw new Error("La creazione visuale richiede React Router con un componente <Routes>.");
      const cleanName = name.trim().replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
      const cleanRoute = route.trim();
      if (!cleanName) throw new Error("Inserisci un nome per la pagina.");
      if (!/^\/[a-zA-Z0-9/_-]*$/.test(cleanRoute)) throw new Error("Il percorso deve iniziare con / e contenere solo lettere, numeri, - e _.");
      if (pages.some((page) => page.route === cleanRoute)) throw new Error("Esiste già una pagina con questo percorso.");
      const componentName = `${cleanName}Page`;
      const extension = project.language === "typescript" ? "tsx" : "jsx";
      const relativePath = `src/pages/${componentName}.${extension}`;
      const targetPath = joinProjectPath(project.root, relativePath);
      try {
        const routerSource = await desktopBridge.readFile(routerFile);
        const { insertReactRoute } = await import("../core/pages");
        const nextRouter = insertReactRoute(routerSource, componentName, relativeImport(routerFile, targetPath), cleanRoute);
        const pageSource = `export function ${componentName}() {\n  return (\n    <main className="page">\n      <h1>${cleanName}</h1>\n      <p>Start editing this page in Framecraft.</p>\n    </main>\n  );\n}\n`;
        const createdPath = await desktopBridge.createFile(relativePath, pageSource);
        await desktopBridge.writeFile(routerFile, nextRouter);
        const nextProject = await desktopBridge.analyzeProject(project.root);
        const pageData = await inspectPages(nextProject);
        const createdPage = pageData.pages.find((page) => page.route === cleanRoute);
        set({ project: nextProject, pages: pageData.pages, routerFile: pageData.routerFile, routerEditable: pageData.routerEditable,
          previewPath: cleanRoute, activePageId: createdPage?.id, requestedStatePage: undefined });
        await get().openFile(createdPath);
      } catch (error) { reportError(error); throw error; }
    },
    async syncPreviewPath(path) {
      const previousPath = get().previewPath;
      const page = get().pages.find((item) => !item.stateValue && item.route === path);
      set({ previewPath: path, activePageId: page?.id ?? get().activePageId, previewStatus: "ready", previewError: undefined });
      if (path !== previousPath && page && get().document?.file !== page.file) await get().openFile(page.file);
    },
    syncStatePage(value) {
      const page = get().pages.find((item) => item.stateValue === value);
      if (page) set({ activePageId: page.id, requestedStatePage: value });
    },
    markPreviewReady: () => set({ previewStatus: "ready", previewError: undefined }),
    addPreviewOutput(stream, line) {
      const looksLikeError = /\b(error|failed|exception)\b/i.test(line);
      const fatal = fatalPreviewOutput.some((pattern) => pattern.test(line));
      const level: ConsoleEntry["level"] = looksLikeError ? "error" : stream === "stderr" ? "warning" : "info";
      set((state) => {
        // Only a fatal line during startup may switch the canvas to the error state. Once the preview is
        // running, a noisy log line is just a log line: blanking a working iframe loses the user's place.
        const breaksPreview = fatal && state.previewStatus !== "ready";
        return {
          previewStatus: breaksPreview ? "error" : state.previewStatus,
          previewError: breaksPreview ? line : state.previewError,
          consoleEntries: [...state.consoleEntries, entry(level, line)].slice(-300),
        };
      });
    },
    setSelectionRect: (selectionRect) => set({ selectionRect }),
    setSelectionStyles: (selectionStyles) => set({ selectionStyles }),
    setSelectionInfo: (selectionInfo) => set({ selectionInfo }),
    async selectSource(source, tag) {
      const picker = get().highlightPicker;
      if (picker) {
        try {
          const options = { targetId: `fc-highlight-${crypto.randomUUID().slice(0, 8)}`, ...highlightSettings(picker) };
          const triggerSource = await desktopBridge.readFile(picker.trigger.file);
          const { addHighlightInteraction, addHighlightTarget, addHighlightTrigger } = await import("../source-parser/transformSource");
          let nextTrigger: string;
          if (picker.trigger.file === source.file) {
            nextTrigger = addHighlightInteraction(triggerSource, picker.trigger.start, picker.trigger.end, source.start, source.end, options);
          } else {
            const targetSource = await desktopBridge.readFile(source.file);
            const nextTarget = addHighlightTarget(targetSource, source.start, source.end, options.targetId);
            nextTrigger = addHighlightTrigger(triggerSource, picker.trigger.start, picker.trigger.end, options);
            await desktopBridge.writeFile(source.file, nextTarget);
          }
          await desktopBridge.writeFile(picker.trigger.file, nextTrigger);
          const { parseSource } = await import("../source-parser/parseSource");
          const parsed = parseSource(picker.trigger.file, nextTrigger, (get().document?.version ?? 0) + 1);
          const selectedId = Object.values(parsed.nodes).find((node) => node.props["data-fc-highlight-target"] === options.targetId)?.id;
          set((state) => ({ document: parsed, selectedId, highlightPicker: undefined, dirty: false,
            history: [...state.history, { file: picker.trigger.file, source: triggerSource }].slice(-100), future: [],
            consoleEntries: [...state.consoleEntries, entry("success", "Interazione di evidenziazione aggiunta. Passa a Naviga per provarla.")] }));
        } catch (error) { set({ highlightPicker: undefined }); reportError(error); }
        return;
      }
      // A project can legitimately render components from outside its own folder — a shared template
      // catalog reached through a Vite alias, for instance. Those files are not part of the working
      // copy, so they cannot be edited, but the element must still report what it is.
      const unresolved = (reason: SelectionProblem, detail?: string) =>
        set({ selectedId: undefined, unresolvedSelection: { file: source.file, tag, source, reason, detail } });
      const editable = insideProject(get().project?.root, source.file)
        || get().externalRoots.some((root) => insideProject(root, source.file));
      if (!editable) { unresolved("outside"); return; }

      let document = get().document;
      if (!document || document.file !== source.file) {
        const opened = await readDocument(source.file);
        if (!opened.document) { unresolved(opened.reason ?? "unreadable", opened.detail); return; }
        document = opened.document;
        set({ document, selectionRect: undefined, dirty: false });
        if (opened.reason) { unresolved(opened.reason, opened.detail); return; }
      }
      const node = Object.values(document.nodes).find((item) => item.source.start === source.start && item.source.end === source.end);
      if (!node) { unresolved("missing"); return; }
      set({ selectedId: node.id, unresolvedSelection: undefined });
    },
    beginHighlightSelection(settings) {
      const { document, selectedId } = get();
      const node = selectedId ? document?.nodes[selectedId] : undefined;
      try {
        if (!node || node.type !== "button") throw new Error("Seleziona prima un pulsante.");
        set({ highlightPicker: { trigger: node.source, triggerLabel: node.text || node.type, ...highlightSettings(settings) }, interactionMode: "edit" });
      } catch (error) { reportError(error); }
    },
    cancelHighlightSelection: () => set({ highlightPicker: undefined }),
    async updateHighlightInteraction(settings) {
      const { document, selectedId } = get();
      const node = selectedId ? document?.nodes[selectedId] : undefined;
      try {
        const targetId = node?.props["data-fc-highlight-target"];
        if (!document || !node || typeof targetId !== "string") throw new Error("Seleziona un pulsante con un'evidenziazione configurata.");
        const { updateHighlightTrigger } = await import("../source-parser/transformSource");
        await applySource(updateHighlightTrigger(document.source, node.source.start, node.source.end, { targetId, ...highlightSettings(settings) }));
        set((state) => ({ consoleEntries: [...state.consoleEntries, entry("success", "Evidenziazione aggiornata.")] }));
      } catch (error) { reportError(error); }
    },
    async removeHighlightInteraction() {
      const { document, selectedId } = get();
      const node = selectedId ? document?.nodes[selectedId] : undefined;
      try {
        if (!document || !node) return;
        const { removeHighlightTrigger } = await import("../source-parser/transformSource");
        await applySource(removeHighlightTrigger(document.source, node.source.start, node.source.end));
        set((state) => ({ consoleEntries: [...state.consoleEntries, entry("success", "Interazione rimossa. L'elemento evidenziato non è stato modificato.")] }));
      } catch (error) { reportError(error); }
    },
    expandProperties: () => set({ propertiesExpandedAt: Date.now() }),
    async inspectSource(source, tag) {
      await get().selectSource(source, tag);
      set({ propertiesExpandedAt: Date.now() });
    },
    async updateAttribute(name, value) {
      const { document, selectedId } = get(); if (!document || !selectedId) return;
      try {
        const node = document.nodes[selectedId];
        const { updateStaticAttributes } = await import("../source-parser/transformSource");
        await applySource(updateStaticAttributes(document.source, node.source.start, node.source.end, { [name]: value }));
      } catch (error) { reportError(error); }
    },
    async updateText(value) {
      const { document, selectedId } = get(); if (!document || !selectedId) return;
      try { const node = document.nodes[selectedId]; const { updateStaticText } = await import("../source-parser/transformSource"); await applySource(updateStaticText(document.source, node.source.start, node.source.end, value)); }
      catch (error) { reportError(error); }
    },
    async updateStyle(property, value) {
      await get().updateStyles({ [property]: value });
    },
    async updateStyles(values) {
      const { document, selectedId } = get(); if (!document || !selectedId) return;
      try { const node = document.nodes[selectedId]; const { updateInlineStyles } = await import("../source-parser/transformSource"); await applySource(updateInlineStyles(document.source, node.source.start, node.source.end, values)); }
      catch (error) { reportError(error); }
    },
    async insertComponent(jsx, placement) {
      const { document, selectedId } = get(); if (!document) return;
      try {
        const placementNode = placement && document.file === placement.source.file
          ? Object.values(document.nodes).find((node) => node.source.start === placement.source.start && node.source.end === placement.source.end)
          : undefined;
        const node = insertionTarget(document, placementNode?.id ?? selectedId);
        if (!node) throw new Error("Apri una pagina con un contenitore modificabile prima di aggiungere componenti.");
        const { insertElement, insertElementAtPosition } = await import("../source-parser/transformSource");
        const source = placement
          ? insertElementAtPosition(document.source, node.source.start, node.source.end, jsx, placement.x, placement.y, placement.positionContainer)
          : insertElement(document.source, node.source.start, node.source.end, jsx);
        await applySource(source);
      }
      catch (error) { reportError(error); }
    },
    async deleteSelection() {
      const { document, selectedId } = get(); if (!document || !selectedId) return; const node = document.nodes[selectedId];
      if (!node.capabilities.remove) {
        set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("warning", "Il contenitore principale della pagina non può essere eliminato. Seleziona un elemento al suo interno.")] }));
        return;
      }
      try { const { deleteElement } = await import("../source-parser/transformSource"); await applySource(deleteElement(document.source, node.source.start, node.source.end)); } catch (error) { reportError(error); }
    },
    async duplicateSelection() {
      const { document, selectedId } = get(); if (!document || !selectedId) return; const node = document.nodes[selectedId]; if (!node.capabilities.remove) return;
      try { const { duplicateElement } = await import("../source-parser/transformSource"); await applySource(duplicateElement(document.source, node.source.start, node.source.end)); } catch (error) { reportError(error); }
    },
    async moveSelection(direction) {
      const { document, selectedId } = get(); if (!document || !selectedId) return; const node = document.nodes[selectedId]; if (!node.capabilities.reorder) return;
      try { const { reorderElement } = await import("../source-parser/transformSource"); await applySource(reorderElement(document.source, node.source.start, node.source.end, direction)); } catch (error) { reportError(error); }
    },
    replaceCode: (source) => { const document = get().document; if (document) set({ document: { ...document, source }, dirty: true }); },
    async save() {
      const { document, dirty } = get(); if (!document || !desktopAvailable) return;
      try {
        const previousSource = document.source;
        const diskSource = dirty ? await desktopBridge.readFile(document.file) : previousSource;
        const { parseSource } = await import("../source-parser/parseSource");
        const parsed = parseSource(document.file, document.source, document.version + 1);
        await desktopBridge.writeFile(document.file, document.source);
        set((state) => ({ document: parsed, dirty: false,
          history: diskSource !== previousSource ? [...state.history, { file: document.file, source: diskSource }].slice(-100) : state.history,
          future: diskSource !== previousSource ? [] : state.future,
          consoleEntries: [...state.consoleEntries, entry("success", `Salvato ${document.file}`)] }));
      }
      catch (error) { reportError(error); }
    },
    async undo() {
      const { document, history, future } = get();
      const previous = history.at(-1);
      if (!document || !previous) return;
      try {
        await restoreSnapshot(previous);
        set((state) => ({ history: history.slice(0, -1), future: [{ file: document.file, source: document.source }, ...future],
          consoleEntries: [...state.consoleEntries, entry("success", "Azione annullata.")] }));
      } catch (error) { reportError(error); }
    },
    async redo() {
      const { document, history, future } = get();
      const next = future[0];
      if (!document || !next) return;
      try {
        await restoreSnapshot(next);
        set((state) => ({ future: future.slice(1), history: [...history, { file: document.file, source: document.source }].slice(-100),
          consoleEntries: [...state.consoleEntries, entry("success", "Azione ripristinata.")] }));
      } catch (error) { reportError(error); }
    },
    refreshPreview() { const url = get().previewUrl; if (url) set({ previewUrl: `${url.split("?")[0]}?framecraft=${Date.now()}`, previewStatus: "starting" }); },
    // Restarting the dev server must not re-open the project: the open document, history and selection stay.
    async restartPreview() {
      const project = get().project;
      if (!project || get().loading) return;
      set({ previewUrl: undefined, previewStatus: "starting", previewError: undefined });
      try {
        await desktopBridge.stopPreview();
        const preview = await desktopBridge.startPreview(project.root);
        set((state) => ({ previewUrl: preview.url, previewStatus: "starting", externalRoots: preview.sourceRoots ?? [],
          consoleEntries: [...state.consoleEntries, entry("success", `Preview riavviata su ${preview.url}`)] }));
      } catch (error) {
        set({ previewStatus: "error", previewError: error instanceof Error ? error.message : String(error) });
        reportError(error);
      }
    },
    async openStandalonePreview() {
      const { previewUrl } = get();
      if (!previewUrl) return;
      set({ standalonePreviewOpen: true });
    },
    closeStandalonePreview: () => set({ standalonePreviewOpen: false }),
    async handleExternalFileChange(path) {
      const document = get().document; if (!document || document.file !== path) return;
      try {
        const source = await desktopBridge.readFile(path); if (source === get().document?.source) return;
        if (get().dirty) { set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("warning", `Modifica esterna ignorata: ${path} contiene modifiche non salvate.`)] })); return; }
        const { parseSource } = await import("../source-parser/parseSource"); set({ document: parseSource(path, source, document.version + 1), selectedId: undefined });
      } catch (error) { reportError(error); }
    },
  };
});
