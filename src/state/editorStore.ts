import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { elementTransformStyles } from "../canvas/elementTransforms";
import { readHighlightRegion, type HighlightPickMode, type HighlightRegion } from "../core/highlightRegion";
import type { ComponentPlacement, ConsoleEntry, EditorDocument, FileEntry, InteractionMode, PageDefinition, PreviewExit, PreviewStatus, ProjectAnalysis, RenderedInfo, SelectionItem, SelectionRect, SourceRef, ViewMode, Viewport } from "../core/types";
import type { AlignMode } from "../canvas/alignment";
import { isPanelFormat } from "../canvas/panels";
import type { PlcVariableDefinition } from "../core/plcVariables";
import type { ListItem } from "../source-parser/listData";
import type { ActionValue, CallSiteContext, HandlerBinding } from "../core/interactions";
import type { HmiIssue } from "../core/hmiValidation";
import type { CarriedImport, ProjectComponentDefinition, ProjectIndex, ValueUse } from "../core/projectIndex";
import type { UserAccessConfig } from "../core/userAccess";
import { manifestPage, pageAffordances, withFieldValue, type Affordance, type ManifestPage, type PanelManifest } from "../core/panelManifest";
import type { TemplateContract } from "../core/templateContract";
import type { DataItem } from "../source-parser/dataList";
import { desktopBridge, desktopAvailable } from "../filesystem/desktopBridge";
import { clearDurableEditorDraft, flushEditorDraft, resumeEditorDraft } from "./editorDraft";
import { insideProject, joinProjectPath } from "../core/paths";
import { insertPathAnchor, movePathAnchor, pathAnchors, pathClosed, removePathAnchor } from "../core/svgPathGeometry";
import type { StandardPageTemplateId } from "../core/hmiPageTemplates";
import type { StandardProjectConfig } from "../core/standardProject";
import type { SimulatedElement, UnresolvedDynamization } from "../core/plcSimulation";
import { emptyHmiResourceCatalog, parseHmiResourceCatalog, type HmiResourceCatalog } from "../core/hmiResources";
import type { HmiScriptTagStatus } from "../core/hmiScript";
import { emptyHmiScriptCatalog, parseHmiScriptCatalog, type HmiScriptCatalog } from "../core/hmiScriptModules";
import { emptyHmiFaceplateCatalog, hmiFaceplateCatalogName, parseHmiFaceplateCatalog, type HmiFaceplateCatalog } from "../core/hmiFaceplates";
import { emptyHmiDataLogCatalog, hmiDataLogCatalogName, parseHmiDataLogCatalog, type HmiDataLogCatalog } from "../core/hmiDataLogs";
import { clearEditorReloadCheckpoint, installEditorReloadRecovery, readEditorReloadCheckpoint, recoverEditorReload, type EditorReloadRecovery } from "./editorRecovery";
import { cleanDiagnosticText } from "../core/editorMessages";

type LeftPanel = "project" | "components" | "pages" | "plc" | "resources" | "scripts" | "faceplates" | "logs" | "page";
/** How large the whole editor is drawn. A panel is built standing at a machine as often as sitting
 * at a desk, so the size of the interface is a setting and not a decision taken once in a CSS file. */
export type UiDensity = "compatta" | "normale" | "grande";
/** A saved arrangement of the workspace: which side panel is open and how wide the sides are.
 * Drawing a page and wiring three hundred PLC tags want different amounts of room. */
export type WorkLayout = "disegno" | "plc" | "sviluppo";

export const densityScale: Record<UiDensity, number> = { compatta: 1, normale: 1.25, grande: 1.45 };

/** The one generated file the ready-made access lives in: accounts, permissions and the login
 * page of the panel are all inside it, so copying the project copies the access with it. */
const userAccessRelativePath = "src/framecraft/user-access.js";

export interface PaneSizes { left: number; inspector: number }

/** How strongly the canvas pulls a dragged element towards its neighbours, and onto what grid.
 * A grid of zero means only the edges of other elements attract. */
export interface SnapSettings { enabled: boolean; grid: number }

export const snapGrids = [4, 8, 10, 20];

interface ViewSettings {
  uiDensity: UiDensity;
  paneSizes: PaneSizes;
  workLayout: WorkLayout;
  viewport: Viewport;
  snap: SnapSettings;
}

export const layoutPresets: Record<WorkLayout, { panes: PaneSizes; panel: LeftPanel }> = {
  disegno: { panes: { left: 220, inspector: 300 }, panel: "components" },
  plc: { panes: { left: 300, inspector: 350 }, panel: "plc" },
  sviluppo: { panes: { left: 260, inspector: 380 }, panel: "project" },
};
type HighlightSettings = { color: string; width: number };
/** The outline drawn over the running panel while it is being shaped. The corners and the midpoints
 * of its sides travel with it: the preview draws them as handles, so the shape is made on the
 * machine it belongs to instead of in a thumbnail beside it. */
export type HighlightPreview = {
  path: string;
  kind?: string;
  /** The panel offers the handles only while the area editor is open. */
  editable?: boolean;
  anchors?: { x: number; y: number; index: number }[];
  sides?: { afterIndex: number; x: number; y: number }[];
};
type HighlightPicker = HighlightSettings & { trigger: SourceRef; triggerLabel: string; mode: HighlightPickMode; requestId: string; previewPath: string };
type HistorySnapshot = { file: string; source: string };
export type EditScope = "instance" | "all";

/** The data row behind the selected element: which array draws it, in which file, and the item's own
 * values. This is what turns "modifica la terza card" from a guard written into the JSX into an edit
 * of the value the list was built from. */
export interface ListBinding {
  file: string;
  /** Content the ranges below were read from, so a stale resolution can be noticed and redone. */
  source: string;
  name: string;
  arrayStart: number;
  arrayEnd: number;
  count: number;
  index: number;
  item?: ListItem;
  /** Property of the item the element displays, when it displays one. */
  textProperty?: string;
  /** Where each value of the row is drawn, so a name like `highlight.d` can be recognised. */
  usages?: Record<string, ValueUse>;
  /** The data lives outside the open project, so every panel that reads it is affected. */
  shared: boolean;
  /** Element the binding was resolved for. */
  nodeId: string;
}
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

/** Gli stati PLC finti con cui si guarda la pagina. `elements` lo riempie l'anteprima, che e'
 * l'unica a sapere quali oggetti della pagina portano addosso una dinamizzazione; `unresolved` e'
 * quello che non si e' potuto simulare, col motivo — le tabelle vuote dell'export, soprattutto. */
export interface SimulationState {
  on: boolean;
  values: Record<string, string>;
  status: Record<string, HmiScriptTagStatus>;
  elements: SimulatedElement[];
  unresolved: UnresolvedDynamization[];
}

export interface EditorState {
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
  /** Bumped when the text field should take the cursor: a double click on a label the preview
   * cannot edit in place. */
  textFocusRequestedAt?: number;
  /** Set when the preview selects an element whose source file is not part of the open project. */
  unresolvedSelection?: UnresolvedSelection;
  /** What the preview reports about the selected element: rendered text, PLC tag, id, classes. */
  selectionInfo?: RenderedInfo;
  /** Whether an edit touches only the selected copy of a repeated element or every copy of it. */
  editScope: EditScope;
  /** Data row behind the selected element, when the preview says it comes from a list. */
  listBinding?: ListBinding;
  /** Every panel that renders the open file, and what each of them passes to it. */
  callSites?: CallSiteContext[];
  /** PLC catalog of the open project, used to describe the signal an element is wired to. */
  plcVariables: PlcVariableDefinition[];
  /** Liste di testi e grafiche selezionate da un valore PLC, con lingue di Runtime. */
  resourceCatalog: HmiResourceCatalog;
  /** Moduli globali e definizioni locali compilati per la sandbox HMI. */
  scriptCatalog: HmiScriptCatalog;
  /** Tipi faceplate, versioni e contratti di interfaccia del progetto. */
  faceplateCatalog: HmiFaceplateCatalog;
  /** Archivi di processo e modalità di acquisizione usati da Trend e Runtime. */
  dataLogCatalog: HmiDataLogCatalog;
  /** Cosa non torna nel pannello: tag vuoti, dinamiche a meta', numeri di pagina doppi, pulsanti
   * che portano dove non c'e' niente. Si riempie col controllo, e prima di ogni esportazione. */
  hmiIssues: HmiIssue[];
  /** La simulazione degli stati PLC: valori di prova scritti a mano al posto del PLC. */
  simulation: SimulationState;
  /** Components exported and already used by the project, shown before the generic catalog. */
  projectComponents: ProjectComponentDefinition[];
  /** Source directories outside the project folder that the running preview declares. */
  externalRoots: string[];
  previewUrl?: string;
  previewPath: string;
  previewStatus: PreviewStatus;
  previewError?: string;
  previewRestarting: boolean;
  previewSessionId?: string;
  previewProcessExited: boolean;
  lastError?: string;
  highlightPicker?: HighlightPicker;
  /** Temporary outline drawn over the running panel while its geometry is edited. */
  highlightPreview?: HighlightPreview;
  interactionMode: InteractionMode;
  viewMode: ViewMode;
  viewport: Viewport;
  zoom: number;
  /** When true the canvas chooses its zoom from the available width. Kept in the shared store so
   * the command can live in the main menu instead of requiring a permanent canvas toolbar. */
  fitCanvas: boolean;
  leftPanel: LeftPanel;
  uiDensity: UiDensity;
  paneSizes: PaneSizes;
  workLayout: WorkLayout;
  snap: SnapSettings;
  /** The elements being worked on together. Empty unless the user picked more than one. */
  multiSelection: SelectionItem[];
  leftPanelCollapsed: boolean;
  paletteOpen: boolean;
  /** Accounts and permissions of the open project, read from the runtime the panel already carries.
   * Undefined until the window or the inspector asks for them the first time. */
  userAccessConfig?: UserAccessConfig;
  /** The accounts window is a workspace of its own: several accounts, their permissions and what
   * each one may press do not fit in the property sheet on the side. */
  userAccessOpen: boolean;
  userAccessBusy: boolean;
  /** What the open panel says the editor may change, page by page. Undefined when the panel carries
   * no manifest: then the editor stays the free one it has always been. */
  panelManifest?: PanelManifest;
  /** Pages the user asked to edit freely anyway, for this session only. A guided page is a rule of
   * the template, not a lock on the file: refusing every way out would only get the editor avoided. */
  unlockedPages: string[];
  /** Files of a shared template the user chose to edit anyway, for this session only. */
  unlockedFiles: string[];
  /** The zone whose position or outline is being pointed at on the picture, if any. */
  zonePicking?: { affordanceId: string; itemId: string; field: string; mode: "point" | "path"; points: { x: number; y: number }[] };
  draggedComponent?: string;
  consoleOpen: boolean;
  standalonePreviewOpen: boolean;
  loading: boolean;
  /** A "save as" copy is running; the command must not be started twice. */
  exporting: boolean;
  dirty: boolean;
  recentProjects: string[];
  history: HistorySnapshot[];
  future: HistorySnapshot[];
  consoleEntries: ConsoleEntry[];
  reloadRecovery?: EditorReloadRecovery;
  draftBackup?: { status: "saving" | "saved" | "error"; savedAt?: number; error?: string };
  retryReloadRecovery: () => Promise<void>;
  resumePersistentRecovery: (choice?: "draft" | "disk") => Promise<void>;
  retryDraftBackup: () => Promise<void>;
  discardReloadRecovery: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setViewport: (viewport: Viewport) => void;
  setZoom: (zoom: number) => void;
  setFitCanvas: (fit: boolean) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setLeftPanel: (panel: LeftPanel) => void;
  setUiDensity: (density: UiDensity) => void;
  /** New width of one side panel, in the editor's own pixels. */
  setPaneSize: (pane: keyof PaneSizes, width: number) => void;
  setSnap: (snap: Partial<SnapSettings>) => void;
  setSimulationOn: (on: boolean) => void;
  setSimulationValue: (tag: string, value: string) => void;
  setSimulationStatus: (tag: string, status: HmiScriptTagStatus) => void;
  setSimulationElements: (elements: SimulatedElement[]) => void;
  setSimulationUnresolved: (unresolved: UnresolvedDynamization[]) => void;
  setMultiSelection: (items: SelectionItem[]) => void;
  alignSelection: (mode: AlignMode) => Promise<void>;
  updateMultiSelectionStyles: (values: Record<string, string | number>) => Promise<void>;
  commitMultiSelection: (items: SelectionItem[]) => Promise<void>;
  applyWorkLayout: (layout: WorkLayout) => void;
  toggleLeftPanel: () => void;
  setPaletteOpen: (open: boolean) => void;
  setDraggedComponent: (jsx?: string) => void;
  setConsoleOpen: (open: boolean) => void;
  clearConsole: () => void;
  chooseAndOpenProject: () => Promise<void>;
  createProject: () => Promise<void>;
  createStandardProject: (config: StandardProjectConfig) => Promise<void>;
  openProject: (root: string) => Promise<void>;
  removeRecentProject: (root: string) => void;
  closeProject: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  openPage: (page: PageDefinition) => Promise<void>;
  /** `sectionId` e' una delle sette sezioni dello standard: se c'e', la pagina nasce numerata. */
  createPage: (name: string, route: string, sectionId?: string, templateId?: StandardPageTemplateId) => Promise<void>;
  syncPreviewPath: (path: string) => Promise<void>;
  syncStatePage: (value: string) => void;
  markPreviewReady: () => void;
  handlePreviewExit: (exit: PreviewExit) => void;
  reportedPreviewExit: (sessionId: string) => PreviewExit | undefined;
  addPreviewOutput: (stream: string, line: string, sessionId?: string) => void;
  setSelectionRect: (rect?: SelectionRect) => void;
  setSelectionStyles: (styles: Record<string, string>) => void;
  setSelectionInfo: (info?: RenderedInfo) => void;
  setHighlightPreview: (preview?: HighlightPreview) => void;
  /** Shaping the outline straight on the panel: drag a corner, add one on a side, take one away. */
  moveHighlightAnchor: (index: number, x: number, y: number, done: boolean) => Promise<void>;
  insertHighlightAnchor: (afterIndex: number, x: number, y: number) => Promise<void>;
  removeHighlightAnchor: (index: number) => Promise<void>;
  setEditScope: (scope: EditScope) => void;
  selectSource: (source: SourceRef, tag?: string, region?: HighlightRegion) => Promise<boolean>;
  beginHighlightSelection: (settings: HighlightSettings, mode?: HighlightPickMode) => void;
  cancelHighlightSelection: () => void;
  updateHighlightInteraction: (settings: HighlightSettings) => Promise<void>;
  removeHighlightInteraction: () => Promise<void>;
  expandProperties: () => void;
  inspectSource: (source: SourceRef, tag?: string, focusText?: boolean) => Promise<void>;
  updateAttribute: (name: string, value: string) => Promise<void>;
  updateActionValue: (range: { start: number; end: number }, kind: "page" | "link" | "text" | "number" | "boolean", value: string, origin?: { file: string; raw: string }) => Promise<void>;
  updateActionValueForItem: (action: ActionValue, itemKey: string, value: string) => Promise<void>;
  updateHandler: (handler: HandlerBinding, name: string) => Promise<void>;
  configureUserAccess: () => Promise<void>;
  removeUserAccess: () => Promise<void>;
  /** Reads the accounts back from the generated runtime without opening anything. */
  refreshUserAccess: () => Promise<UserAccessConfig | undefined>;
  /** The declared editing surface of the page being shown, empty when the panel declares none. */
  activeAffordances: () => Affordance[];
  /** The page being shown, when its template says it is guided and the user has not opened it up. */
  guidedPage: () => ManifestPage | undefined;
  unlockPage: () => void;
  /** What the template that owns this file lets a panel change, when it owns one. */
  templateContractOf: (file: string) => Promise<import("../core/templateContract").TemplateContract | undefined>;
  unlockFile: (file: string) => void;
  /** Items of a declared list, already filtered as the affordance asks. */
  readAffordanceItems: (affordance: Affordance) => Promise<DataItem[]>;
  addAffordanceItem: (affordance: Affordance, item: DataItem) => Promise<void>;
  updateAffordanceItem: (affordance: Affordance, itemId: string, path: string, value: unknown) => Promise<void>;
  removeAffordanceItem: (affordance: Affordance, itemId: string) => Promise<void>;
  /** Reference list an affordance points at: the machine parts a zone can command. */
  readAffordanceReference: (affordance: Affordance, name: string) => Promise<{ id: string; label: string }[]>;
  beginZonePicking: (affordanceId: string, itemId: string, field: string, mode: "point" | "path") => void;
  cancelZonePicking: () => void;
  addPickedPoint: (x: number, y: number) => Promise<void>;
  finishZonePicking: () => Promise<void>;
  openUserAccess: () => Promise<void>;
  closeUserAccess: () => void;
  saveUserAccess: (config: UserAccessConfig) => Promise<void>;
  removeAttribute: (name: string) => Promise<void>;
  bindPlcVariable: (name: string) => Promise<void>;
  addPlcVariable: (name: string) => Promise<void>;
  /** Re-reads framecraft.plc.json, so a catalog imported or edited in its own panel is immediately
   * the one the element pickers offer. */
  refreshPlcVariables: () => Promise<void>;
  /** Rilegge il catalogo delle liste risorse dopo una modifica nel suo pannello. */
  refreshResourceCatalog: () => Promise<void>;
  /** Rilegge i moduli dopo il salvataggio dal relativo pannello. */
  refreshScriptCatalog: () => Promise<void>;
  /** Rilegge tipi e versioni faceplate dopo il salvataggio. */
  refreshFaceplateCatalog: () => Promise<void>;
  /** Rilegge il catalogo Data Log dopo il salvataggio. */
  refreshDataLogCatalog: () => Promise<void>;
  /** Lingua con cui la simulazione risolve i testi multilingua. */
  setResourceLanguage: (language: string) => void;
  /** Fills a data-driven table with the catalog signals whose name or tag table matches. */
  fillListFromPlcVariables: (filter: string) => Promise<void>;
  updateListItemProperty: (property: string, value: string) => Promise<boolean>;
  chooseImage: (listProperty?: string) => Promise<void>;
  setListItemHighlight: (highlight?: { type: string; d: string }) => Promise<void>;
  removeListItem: () => Promise<void>;
  duplicateListItem: () => Promise<void>;
  updateText: (value: string) => Promise<boolean>;
  updateStyle: (property: string, value: string | number) => Promise<void>;
  updateStyles: (values: Record<string, string | number>, renderedStyles?: Record<string, string>) => Promise<boolean>;
  insertComponent: (jsx: string, placement?: ComponentPlacement) => Promise<void>;
  deleteSelection: () => Promise<void>;
  duplicateSelection: () => Promise<void>;
  moveSelection: (direction: -1 | 1) => Promise<void>;
  replaceCode: (source: string) => void;
  save: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  checkHmiProject: () => Promise<HmiIssue[]>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  refreshPreview: () => void;
  restartPreview: (force?: boolean) => Promise<void>;
  cancelPreviewStartup: () => Promise<void>;
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

const defaultView: ViewSettings = {
  uiDensity: "normale",
  paneSizes: { left: 250, inspector: 310 },
  workLayout: "disegno",
  viewport: "libero",
  snap: { enabled: true, grid: 8 },
};

/** Every choice about how the editor looks, remembered together: they are set once and then never
 * thought about again, and losing half of them on a restart is worse than losing all of them. */
function readViewSettings(): ViewSettings {
  if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") return defaultView;
  try {
    const stored = JSON.parse(localStorage.getItem("framecraft.view") ?? "{}") as Partial<ViewSettings>;
    const left = Number(stored.paneSizes?.left);
    const inspector = Number(stored.paneSizes?.inspector);
    return {
      uiDensity: stored.uiDensity && stored.uiDensity in densityScale ? stored.uiDensity : defaultView.uiDensity,
      workLayout: stored.workLayout && stored.workLayout in layoutPresets ? stored.workLayout : defaultView.workLayout,
      // The panel a project is built for does not change from one session to the next.
      viewport: isPanelFormat(stored.viewport) ? stored.viewport : defaultView.viewport,
      snap: {
        enabled: stored.snap?.enabled !== false,
        grid: snapGrids.includes(Number(stored.snap?.grid)) ? Number(stored.snap?.grid) : defaultView.snap.grid,
      },
      paneSizes: {
        left: Number.isFinite(left) ? clampPane(left) : defaultView.paneSizes.left,
        inspector: Number.isFinite(inspector) ? clampPane(inspector) : defaultView.paneSizes.inspector,
      },
    };
  } catch {
    return defaultView;
  }
}

/** A panel dragged to nothing, or over the whole window, is a panel the user cannot get back. */
export function clampPane(width: number) {
  return Math.round(Math.min(620, Math.max(180, width)));
}

function persistViewSettings(settings: ViewSettings) {
  if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") return;
  try { localStorage.setItem("framecraft.view", JSON.stringify(settings)); } catch { /* A remembered layout is a convenience, never a reason to fail. */ }
}

function persistRecentProjects(projects: string[]) {
  if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") return;
  try { localStorage.setItem("framecraft.recent", JSON.stringify(projects)); } catch { /* Recent projects must never block opening a project. */ }
}

const recent = readRecentProjects();
const view = readViewSettings();
/** HTML elements that can host a dropped component. SVG shapes are deliberately absent: an <svg>
 * accepts a <div> in the AST but never renders it, so inserting there looks like nothing happened. */
const insertableElements = new Set(["main", "section", "div", "article", "form", "header", "footer", "aside", "nav",
  "ul", "ol", "li", "label", "p", "span", "figure", "figcaption", "blockquote", "fieldset", "dialog", "details",
  "summary", "table", "thead", "tbody", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"]);

function fileName(file: string) {
  return file.split(/[\\/]/).at(-1) ?? file;
}

interface EditorTransientRuntime {
  projectOpening: boolean;
  previewRestartTask?: Promise<void>;
  previewRefreshSequence: number;
  listBindingRequest?: { key: string; promise: Promise<ListBinding | undefined> };
  projectIndexRequest?: { root: string; promise: Promise<ProjectIndex | undefined> };
  anchorDragPath?: string;
  selectionSequence: number;
  contractCache: Map<string, TemplateContract | null>;
  declaredEdits: number;
  callSiteRequest?: string;
  previewExits: Map<string, PreviewExit>;
}

type EditorHotData = { store?: UseBoundStore<StoreApi<EditorState>>; runtime?: EditorTransientRuntime; recoveryTask?: Promise<void> };
const hotData = import.meta.hot?.data as EditorHotData | undefined;
const runtime: EditorTransientRuntime = hotData?.runtime ?? {
  projectOpening: false, previewRefreshSequence: 0, selectionSequence: 0,
  contractCache: new Map(), declaredEdits: 0, previewExits: new Map(),
};
runtime.previewExits ??= new Map();
if (hotData) hotData.runtime = runtime;

function projectFilePaths(entries: FileEntry[]): string[] {
  return entries.flatMap((entry) => entry.kind === "directory" ? projectFilePaths(entry.children ?? []) : [entry.path]);
}

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

function entry(level: ConsoleEntry["level"], message: string, source: NonNullable<ConsoleEntry["source"]> = "editor"): ConsoleEntry {
  return { id: crypto.randomUUID(), level, source, message, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
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

/** Come il catalogo PLC, anche quello risorse e' facoltativo nei vecchi progetti. */
async function readResourceCatalog(root: string): Promise<HmiResourceCatalog> {
  try {
    return parseHmiResourceCatalog(await desktopBridge.readFile(joinProjectPath(root, "framecraft.resources.json")));
  } catch {
    return emptyHmiResourceCatalog();
  }
}

async function readScriptCatalog(root: string): Promise<HmiScriptCatalog> {
  try {
    return parseHmiScriptCatalog(await desktopBridge.readFile(joinProjectPath(root, "framecraft.scripts.json")));
  } catch {
    return emptyHmiScriptCatalog();
  }
}

async function readFaceplateCatalog(root: string): Promise<HmiFaceplateCatalog> {
  try {
    return parseHmiFaceplateCatalog(await desktopBridge.readFile(joinProjectPath(root, hmiFaceplateCatalogName)));
  } catch {
    return emptyHmiFaceplateCatalog();
  }
}

async function readDataLogCatalog(root: string): Promise<HmiDataLogCatalog> {
  try {
    return parseHmiDataLogCatalog(await desktopBridge.readFile(joinProjectPath(root, hmiDataLogCatalogName)));
  } catch {
    return emptyHmiDataLogCatalog();
  }
}

/** A panel that carries no manifest simply has no declared surface: the editor stays the free one. */
async function readPanelManifest(root: string) {
  try {
    const { parsePanelManifest } = await import("../core/panelManifest");
    return parsePanelManifest(await desktopBridge.readFile(joinProjectPath(root, "panel.json")));
  } catch {
    return undefined;
  }
}

/** I numeri di pagina gia' presi, e da li' il numero della prossima.
 *
 * Guarda in due posti perche' due posti ce l'hanno: i sorgenti delle pagine (dove il numero sta come
 * `data-page-number`) e il `panel.json`, che puo' dichiarare una pagina anche prima che esista. */
async function planStandardPage(root: string, pages: PageDefinition[], manifest: PanelManifest | undefined, sectionId: string) {
  const { collectPageNumbers, planPageNumber } = await import("../core/hmiPages");
  const { manifestPageNumbers } = await import("../core/panelManifest");
  const sources: string[] = [];
  await Promise.all(pages.map(async (page) => {
    try { sources.push(await desktopBridge.readFile(page.file)); } catch { /* Una pagina illeggibile non blocca la numerazione. */ }
  }));
  void root;
  return planPageNumber(sectionId, [...collectPageNumbers(sources), ...manifestPageNumbers(manifest)]);
}

/** Scrive il numero nel `panel.json`. Se il pannello non ne ha uno non succede niente: la pagina
 * resta numerata nel suo sorgente, che e' dove il numero conta davvero. */
async function recordPageNumber(root: string, page: { id: string; name: string; pageNumber: number; section?: string }) {
  const file = joinProjectPath(root, "panel.json");
  try {
    const { manifestWithPageNumber, parsePanelManifest } = await import("../core/panelManifest");
    const text = await desktopBridge.readFile(file);
    const next = manifestWithPageNumber(text, page);
    if (!next) return;
    await desktopBridge.writeFile(file, next);
    useEditorStore.setState({ panelManifest: parsePanelManifest(next) });
  } catch { /* Il manifesto e' facoltativo: se non c'e' o non si lascia scrivere, si va avanti. */ }
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

type ProjectComponentMarker = Pick<ProjectComponentDefinition, "file" | "name" | "exported" | "isDefault">;

/** A palette drag carries its import beside the JSX. The marker never reaches project source: here
 * it becomes a normal relative import, reusing the local alias when the page already has one. */
function prepareProjectComponent(source: string, file: string, transportedJsx: string) {
  const match = transportedJsx.match(/^\/\*framecraft-project:([^*]+)\*\/\s*/);
  if (!match) return { jsx: transportedJsx, addImport: (value: string) => value };
  let component: ProjectComponentMarker & { imports?: CarriedImport[]; missing?: string[] };
  try { component = JSON.parse(decodeURIComponent(match[1])); }
  catch { throw new Error("Il componente del progetto non contiene informazioni di importazione valide."); }

  // Un componente che vuole dei dati e non li riceve non disegna niente: inserirlo nudo sembra un
  // inserimento riuscito e non lo e'. Meglio dirlo, con il nome delle props che gli mancano.
  if (component.missing?.length) {
    throw new Error(`<${component.name}> vuole dei dati che non so portare da solo: ${component.missing.join(", ")}. `
      + `Aprilo dove e' gia' usato e copia le props da li', oppure inseriscilo da un template che porta i suoi dati.`);
  }

  let jsx = transportedJsx.slice(match[0].length);
  const statements: string[] = [];
  const here = (value: string) => value.replaceAll("\\", "/").toLowerCase();

  if (here(component.file) !== here(file)) {
    const specifier = relativeImport(file, component.file);
    const local = existingLocalName(source, specifier, component.exported, component.isDefault);
    if (local && local !== component.name) jsx = renameJsxTag(jsx, component.name, local);
    if (!local) {
      let name = component.name;
      let suffix = 2;
      while (new RegExp(`\\b${name}\\b`).test(source)) name = `${component.name}Framecraft${suffix++}`;
      if (name !== component.name) jsx = renameJsxTag(jsx, component.name, name);
      statements.push(importStatement(name, component.exported, component.isDefault, specifier));
    }
  }

  // I dati che le props citano viaggiano insieme al componente: e' questo che gli fa disegnare
  // qualcosa. Se il file di arrivo usa gia' quel nome si lascia stare: o e' lo stesso dato, o e' roba
  // sua, e in tutti e due i casi un import in piu' farebbe danno.
  for (const carried of component.imports ?? []) {
    if (new RegExp(`\\b${carried.local}\\b`).test(source)) continue;
    if (here(carried.file) === here(file)) continue;
    statements.push(importStatement(carried.local, carried.exported, carried.isDefault, relativeImport(file, carried.file)));
  }

  if (!statements.length) return { jsx, addImport: (value: string) => value };
  const block = statements.join("");
  return {
    jsx,
    addImport(value: string) {
      const directives = value.match(/^(?:\s*["'][^"']+["'];?\s*)+/)?.[0]?.length ?? 0;
      const last = [...value.matchAll(/^import[\s\S]*?;\s*$/gm)].at(-1);
      if (!last || last.index == null) return value.slice(0, directives) + block + value.slice(directives);
      const offset = last.index + last[0].length;
      return value.slice(0, offset) + block + value.slice(offset);
    },
  };
}

function importStatement(local: string, exported: string, isDefault: boolean, specifier: string) {
  return isDefault
    ? `import ${local} from "${specifier}";\n`
    : `import { ${exported}${local === exported ? "" : ` as ${local}`} } from "${specifier}";\n`;
}

function renameJsxTag(jsx: string, from: string, to: string) {
  return jsx.replace(new RegExp(`(<\\/?\\s*)${from}(?=[\\s/>])`, "g"), `$1${to}`);
}

/** Il nome con cui il file di arrivo importa gia' quella cosa, se la importa. */
function existingLocalName(source: string, specifier: string, exported: string, isDefault: boolean) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const imports = [...source.matchAll(new RegExp(`import\\s+([\\s\\S]*?)\\s+from\\s+["']${escaped}["']`, "g"))];
  for (const imported of imports) {
    const clause = imported[1].trim();
    if (isDefault) {
      const local = clause.match(/^([A-Za-z_$][\w$]*)/)?.[1];
      if (local) return local;
      continue;
    }
    const body = clause.match(/\{([\s\S]*?)\}/)?.[1] ?? "";
    for (const item of body.split(",")) {
      const names = item.trim().split(/\s+as\s+/);
      if (names[0] === exported) return names[1] ?? names[0];
    }
  }
  return undefined;
}

function insertionTarget(document: EditorDocument, selectedId?: string) {
  let current = selectedId ? document.nodes[selectedId] : undefined;
  while (current) {
    if (current.capabilities.insert && insertableElements.has(current.type)) return current;
    current = current.parentId ? document.nodes[current.parentId] : undefined;
  }
  return Object.values(document.nodes).find((node) => node.capabilities.insert && insertableElements.has(node.type));
}

/** Applies a view change and writes the whole set back, so the editor comes up as it was left. */
function rememberView(change: Partial<ViewSettings>) {
  return (state: EditorState): Partial<EditorState> => {
    const next: ViewSettings = {
      uiDensity: change.uiDensity ?? state.uiDensity,
      paneSizes: change.paneSizes ?? state.paneSizes,
      workLayout: change.workLayout ?? state.workLayout,
      viewport: change.viewport ?? state.viewport,
      snap: change.snap ?? state.snap,
    };
    persistViewSettings(next);
    return next;
  };
}

/** Adds the corners and the midpoints of the sides to an outline, which is all the preview needs to
 * draw handles over the panel without knowing anything about SVG paths. */
function withHandles(preview?: HighlightPreview): HighlightPreview | undefined {
  if (!preview?.path) return preview;
  try {
    const anchors = pathAnchors(preview.path);
    const closed = pathClosed(preview.path);
    const sides = anchors.slice(0, closed ? anchors.length : Math.max(0, anchors.length - 1)).map((anchor, index) => {
      const next = anchors[(index + 1) % anchors.length];
      return { afterIndex: index, x: (anchor.x + next.x) / 2, y: (anchor.y + next.y) / 2 };
    });
    return { ...preview, anchors, sides };
  } catch {
    // A path the geometry cannot read is still drawn: it simply comes without handles.
    return { ...preview, anchors: undefined, sides: undefined };
  }
}

function highlightSettings(settings: HighlightSettings) {
  if (!/^#[0-9a-f]{6}$/i.test(settings.color)) throw new Error("Scegli un colore valido per l'evidenziazione.");
  if (!Number.isFinite(settings.width)) throw new Error("Scegli uno spessore valido per l'evidenziazione.");
  return { color: settings.color.toLowerCase(), width: Math.min(8, Math.max(1, Math.round(settings.width))) };
}

const createEditorState: StateCreator<EditorState> = (set, get) => {
  async function restoreSnapshot(snapshot: HistorySnapshot) {
    const sequence = ++runtime.selectionSequence;
    const currentDocument = get().document;
    const project = get().project;
    const current = () => sequence === runtime.selectionSequence && get().document === currentDocument && get().project === project;
    const selected = currentDocument?.file === snapshot.file && get().selectedId ? currentDocument.nodes[get().selectedId!] : undefined;
    const { parseSource } = await import("../source-parser/parseSource");
    const { matchLineEndings } = await import("../source-parser/lineEndings");
    if (!current()) return undefined;
    let parsed;
    try {
      parsed = parseSource(snapshot.file, snapshot.source, (currentDocument?.version ?? 0) + 1);
    } catch (error) {
      // Nothing is written when this happens, so the file on disk stays intact. What the user needs
      // is to know that, not the parser's "Unexpected token (81:8)".
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Modifica annullata: avrebbe lasciato ${fileName(snapshot.file)} con codice non valido (${detail}). Il file non è stato toccato.`);
    }
    const nextSelected = selected && Object.values(parsed.nodes).find((node) => node.type === selected.type && node.source.start === selected.source.start);
    set({ document: parsed, selectedId: nextSelected?.id, selectionStyles: nextSelected ? get().selectionStyles : {}, dirty: true });
    if (desktopAvailable) {
      await desktopBridge.writeFile(snapshot.file, matchLineEndings(snapshot.source));
      if (get().document === parsed) set({ dirty: false });
    }
    return parsed;
  }

  /** The template.json that owns a file, looked up once per directory. A file with no template above
   * it — the panel's own sources — has no contract and stays freely editable. */
  async function templateContractFor(file: string) {
    const { parseTemplateContract, templateDirectories } = await import("../core/templateContract");
    for (const directory of templateDirectories(file)) {
      const cached = runtime.contractCache.get(directory);
      if (cached !== undefined) {
        if (cached) return cached;
        continue;
      }
      let contract: TemplateContract | undefined;
      try {
        contract = parseTemplateContract(directory, await desktopBridge.readFile(`${directory}/template.json`));
      } catch { contract = undefined; }
      runtime.contractCache.set(directory, contract ?? null);
      if (contract) return contract;
    }
    return undefined;
  }

  /** The other half of the paletti, and the one the templates had already written down: a shared
   * component is not a file a panel may rewrite.
   *
   * It guards a template used *from somewhere else*. Opening the template itself as the project is
   * how it gets written in the first place: there the author is at home and nothing is refused. */
  async function refuseIfTemplateOwns(file: string) {
    if (get().unlockedFiles.includes(file)) return;
    if (insideProject(get().project?.root, file)) return;
    const contract = await templateContractFor(file);
    if (!contract) return;
    const { editableSummary, isEditableFile } = await import("../core/templateContract");
    if (isEditableFile(contract, file)) return;
    throw new Error(`${fileName(file)} è del template condiviso «${contract.name}»: cambiarlo varrebbe per tutte le macchine. Da un pannello si cambiano i suoi dati e il suo stile (${editableSummary(contract)}). Per farlo lo stesso: «Modifica comunque questo file» nella scheda dell'elemento.`);
  }

  /** Edits the page's own template declared, and therefore allows even while the page is guided.
   * Everything else that writes source is refused there. */
  async function declared<T>(run: () => Promise<T>) {
    runtime.declaredEdits += 1;
    try { return await run(); }
    finally { runtime.declaredEdits -= 1; }
  }

  /** A guided page is one whose template says what may be changed on it. The refusal lives here,
   * at the single point every source edit goes through, so no new command can forget it. */
  function refuseIfGuided() {
    if (runtime.declaredEdits) return;
    const page = get().guidedPage();
    if (!page) return;
    const what = page.affordances.map((affordance) => affordance.label.toLowerCase()).join(", ");
    throw new Error(`«${page.name ?? page.id}» è una pagina guidata dal suo template: qui si può cambiare solo ${what}, dal pannello «Questa pagina». Per modificarla comunque, sbloccala dalla scheda dell'elemento.`);
  }

  /** Returns the re-parsed document so a caller can point at what its own edit produced. */
  async function applySource(source: string, pushHistory = true, document = get().document, valid = () => true) {
    refuseIfGuided();
    const project = get().project;
    if (!document || get().document !== document || !valid()) return undefined;
    await refuseIfTemplateOwns(document.file);
    if (get().document !== document || get().project !== project || !valid()) return undefined;
    // Every range the data binding remembers moves with the edit, so it is resolved again.
    runtime.listBindingRequest = undefined;
    runtime.projectIndexRequest = undefined;
    runtime.callSiteRequest = undefined;
    const parsed = await restoreSnapshot({ file: document.file, source });
    if (parsed && pushHistory && get().project === project) set((state) => ({ history: [...state.history, { file: document.file, source: document.source }].slice(-100), future: [] }));
    return parsed;
  }

  function selectionEditCurrent() {
    const { document, selectedId, project, interactionMode, editScope, selectionInfo } = get();
    const sequence = runtime.selectionSequence;
    return (applied?: EditorDocument) => {
      const state = get();
      return state.document === (applied ?? document) && (applied !== undefined || state.selectedId === selectedId) && state.project === project
        && state.interactionMode === interactionMode && state.editScope === editScope && runtime.selectionSequence === sequence + (applied ? 1 : 0)
        && state.selectionInfo?.listIndex === selectionInfo?.listIndex
        && state.selectionInfo?.instanceIndex === selectionInfo?.instanceIndex
        && state.selectionInfo?.instanceCount === selectionInfo?.instanceCount;
    };
  }

  async function flushPendingDocument(document: EditorDocument, current: () => boolean) {
    if (!get().dirty) return current();
    try {
      const { parseSource } = await import("../source-parser/parseSource");
      if (!current()) return false;
      parseSource(document.file, document.source, document.version);
      if (!desktopAvailable) {
        reportWarning(`Salva le modifiche di ${fileName(document.file)} prima di cambiare file.`);
        return false;
      }
      await desktopBridge.writeFile(document.file, document.source);
      if (!current()) return false;
      set({ dirty: false });
      reportWarning(`Modifiche in sospeso salvate in ${document.file} prima di cambiare file.`);
      return true;
    } catch (error) { if (current()) reportError(error); return false; }
  }

  /** Rewrites one range, in the open file or in another one. The text that is there now is checked
   * first: ranges in another file were read when the index was built, and a file that moved on in
   * the meantime would otherwise be rewritten in the wrong place. */
  async function editSourceRange(file: string, range: { start: number; end: number }, expected: string, replacement: string) {
    const { replaceSourceRange } = await import("../source-parser/transformSource");
    const open = get().document;
    const stale = () => new Error(`${fileName(file)} è cambiato da quando è stato letto: riseleziona l'elemento e riprova.`);
    if (open && open.file === file) {
      if (open.source.slice(range.start, range.end) !== expected) throw stale();
      await applySource(replaceSourceRange(open.source, range.start, range.end, replacement), true, open);
      return;
    }
    const current = await desktopBridge.readFile(file);
    if (current.slice(range.start, range.end) !== expected) throw stale();
    await applyToFile(file, replaceSourceRange(current, range.start, range.end, replacement));
  }

  /** Writes a file that is not the one open in the editor: the data a list is built from regularly
   * lives in its own module. History still records it, so Ctrl+Z brings it back. */
  async function applyToFile(file: string, next: string, valid = () => true, expected?: string) {
    if (!valid()) return false;
    refuseIfGuided();
    await refuseIfTemplateOwns(file);
    const { matchLineEndings } = await import("../source-parser/lineEndings");
    if (!valid()) return false;
    const previous = await desktopBridge.readFile(file);
    if (!valid()) return false;
    if (expected !== undefined && previous !== expected) throw new Error(`${fileName(file)} è cambiato: aggiorna l'anteprima e riprova senza sovrascrivere il file.`);
    next = matchLineEndings(next);
    if (previous === next) return true;
    if (desktopAvailable) await desktopBridge.writeFile(file, next);
    set((state) => ({ history: [...state.history, { file, source: previous }].slice(-100), future: [] }));
    runtime.listBindingRequest = undefined;
    runtime.projectIndexRequest = undefined;
    runtime.callSiteRequest = undefined;
    void resolveListBinding();
    return true;
  }

  /** Reads the project's own files once and keeps the answer. It is what lets the editor say which
   * panel renders a component, and therefore which array a prop like `parts` actually holds. */
  async function ensureProjectIndex(): Promise<ProjectIndex | undefined> {
    const project = get().project;
    if (!project) return undefined;
    if (runtime.projectIndexRequest?.root === project.root) return runtime.projectIndexRequest.promise;
    const promise = (async () => {
      try {
        const { buildProjectIndex, readProjectSources } = await import("../core/projectIndex");
        const listed = desktopAvailable && typeof desktopBridge.listProjectSourceFiles === "function"
          ? await desktopBridge.listProjectSourceFiles()
          : projectFilePaths(project.files);
        // Linked templates contain the menu buttons, while the panel project contains the final
        // setCurrentPage wiring. Both sides must be indexed or the destination disappears halfway.
        const sources = await readProjectSources(listed, (file) => desktopBridge.readFile(file), 1200);
        const index = buildProjectIndex(sources);
        if (get().project?.root === project.root) set({ projectComponents: index.components() });
        return index;
      } catch {
        return undefined;
      }
    })();
    runtime.projectIndexRequest = { root: project.root, promise };
    return promise;
  }

  /** The outline written in the data row behind the selection: what a drag on the panel changes. The
   * row is resolved rather than read from the cache, because the drag can start on a copy the panel
   * selected a moment ago. */
  async function highlightPathOfRow(): Promise<string | undefined> {
    const binding = await currentListBinding();
    return binding?.item?.properties.find((property) => property.name === "highlight.d")?.value || undefined;
  }

  /** Resolves the data row behind the selection once per element, and hands the same promise to
   * whoever asks while it is still in flight. */
  async function resolveListBinding(): Promise<ListBinding | undefined> {
    const sequence = runtime.selectionSequence;
    const { document, selectedId, selectionInfo, project } = get();
    const node = document && selectedId ? document.nodes[selectedId] : undefined;
    const index = selectionInfo?.listIndex ?? selectionInfo?.instanceIndex;
    // Who renders this file is worth knowing for any element, not only for one drawn by a list.
    if (document) void resolveCallSite(document.file);
    if (!document || !node || index == null) { set({ listBinding: undefined }); return undefined; }
    const key = `${document.file}:${node.id}:${index}`;
    if (runtime.listBindingRequest?.key === key) return runtime.listBindingRequest.promise;
    const promise = (async (): Promise<ListBinding | undefined> => {
      try {
        const { listReference, resolveListArray } = await import("../source-parser/listData");
        const reference = listReference(document.source, node.source.start, node.source.end);
        if (!reference) return undefined;
        const { loadModule } = await import("../core/moduleResolver");
        const readFile = (path: string) => desktopBridge.readFile(path);
        // The list is often drawn from a prop, and more than one component deep: only the panels that
        // render this file know what that prop holds, which is the whole reason the index exists.
        const projectIndex = await ensureProjectIndex();
        const resolved = await resolveListArray(document.file, document.source, reference.name, {
          // A shared template is rendered both by the panel being edited and by the demo page that
          // ships beside it. They fill the same list from different files, and the panel is the one
          // whose rows are on screen.
          usesOf: (candidate) => [...(projectIndex?.usesOf(candidate) ?? [])]
            .sort((left, right) => Number(insideProject(project?.root, right.file)) - Number(insideProject(project?.root, left.file))),
          load: (from, specifier) => loadModule(from, specifier, readFile),
        }, reference);
        if (!resolved?.array.items.length) return undefined;
        const { file, source, array } = resolved;
        // Where each value of the row is drawn: it is the difference between "highlight.d" and
        // "the outline drawn over the machine".
        const usages: Record<string, ValueUse> = {};
        for (const property of array.items[index]?.properties ?? []) {
          const [use] = projectIndex?.whereUsed(property.name) ?? [];
          if (use) usages[property.name] = use;
        }
        return {
          file, source, name: reference.name, arrayStart: array.start, arrayEnd: array.end,
          count: array.items.length, index, item: array.items[index], textProperty: reference.textProperty,
          shared: !insideProject(project?.root, file), nodeId: node.id, usages,
        };
      } catch {
        // A list the editor cannot follow is not an error: the JSX edit stays available.
        return undefined;
      }
    })();
    runtime.listBindingRequest = { key, promise };
    const binding = await promise;
    if (sequence === runtime.selectionSequence && get().selectedId === selectedId && get().document === document
      && get().project === project) set({ listBinding: binding });
    void resolveCallSite(document.file);
    return binding;
  }

  /** The panels that render the open file, so a handler which only forwards a prop can still be
   * explained. All of them are kept: the same overlay is rendered by the machine view and by the
   * manual, with a different handler each, and reporting only one would be a guess. */
  async function resolveCallSite(file: string) {
    if (runtime.callSiteRequest === file) return;
    runtime.callSiteRequest = file;
    const index = await ensureProjectIndex();
    const uses = index?.usesOf(file) ?? [];
    // The selection moved on while the index was being read: nothing was answered, so nothing is
    // remembered either, or this file would never be looked up again.
    if (get().document?.file !== file) { runtime.callSiteRequest = undefined; return; }
    // Two call sites in the same file passing the same things say nothing more than one.
    const seen = new Set<string>();
    const callSites: CallSiteContext[] = [];
    const contextFor = (use: (typeof uses)[number], depth: number, trail: Set<string>): CallSiteContext => {
      const identity = `${use.file}:${use.line}:${JSON.stringify(use.props)}`;
      const nextTrail = new Set(trail).add(identity);
      const callers = depth > 0
        ? (index?.usesOf(use.file) ?? [])
            .filter((caller) => !nextTrail.has(`${caller.file}:${caller.line}:${JSON.stringify(caller.props)}`))
            .map((caller) => contextFor(caller, depth - 1, nextTrail))
        : [];
      return { file: use.file, source: use.source, props: use.props, propRanges: use.propRanges, callers };
    };
    for (const use of uses) {
      const key = `${use.file}:${JSON.stringify(use.props)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Who renders the caller in turn: a handler that only forwards — `onOpenPart?.(id)` — is
      // decided one file further up, and that is where "dove porta questo tasto" is written.
      callSites.push(contextFor(use, 5, new Set()));
    }
    set({ callSites });
  }

  /** Re-reads the data file before writing: the ranges were read earlier and the file may have moved
   * on since, in which case the row is located again before anything is written. */
  async function currentListBinding(): Promise<ListBinding | undefined> {
    // Same element, other copy: the cached row still points at the one selected before, so the index
    // has to match too or an edit would land on the wrong item of the list.
    const info = get().selectionInfo;
    const index = info?.listIndex ?? info?.instanceIndex;
    const cached = get().listBinding;
    const binding = cached && cached.nodeId === get().selectedId && (index == null || cached.index === index)
      ? cached
      : await resolveListBinding();
    if (!binding) return undefined;
    const fresh = await desktopBridge.readFile(binding.file).catch(() => undefined);
    if (fresh === undefined || fresh === binding.source) return binding;
    runtime.listBindingRequest = undefined;
    return resolveListBinding();
  }

  /** Reads the accounts back out of the file the panel already loads. A project without the ready
   * access simply has no file, and that is not an error worth showing. */
  async function readUserAccessConfig() {
    const project = get().project;
    if (!project || !desktopAvailable) return undefined;
    try {
      const { parseUserAccessRuntime } = await import("../core/userAccess");
      return parseUserAccessRuntime(await desktopBridge.readFile(joinProjectPath(project.root, userAccessRelativePath)));
    } catch {
      return undefined;
    }
  }

  /** Writes the panel runtime with the accounts it has to know, and makes sure the file that starts
   * React loads it exactly once. Everything that changes accounts goes through here. */
  async function writeUserAccessRuntime(config: UserAccessConfig) {
    const project = get().project;
    if (!project) throw new Error("Apri un progetto prima di gestire gli accessi.");
    const { normalizeUserAccessConfig, relativeModulePath, serializeUserAccessRuntime, userAccessImport } = await import("../core/userAccess");
    const normalized = normalizeUserAccessConfig(config);
    const runtimePath = joinProjectPath(project.root, userAccessRelativePath);
    await desktopBridge.createFile(userAccessRelativePath, serializeUserAccessRuntime(normalized));

    const ordered = project.entryFiles.filter((file) => insideProject(project.root, file)).sort((left, right) => {
      const rank = (file: string) => /[\\/]main\.(tsx?|jsx?)$/i.test(file) ? 0 : /[\\/]index\.(tsx?|jsx?)$/i.test(file) ? 1 : 2;
      return rank(left) - rank(right);
    });
    let entryFile: string | undefined;
    let entrySource = "";
    for (const file of ordered) {
      const source = get().document?.file === file ? get().document?.source ?? "" : await desktopBridge.readFile(file).catch(() => "");
      if (!source) continue;
      const startsReact = /createRoot\s*\(|ReactDOM\.render\s*\(|hydrateRoot\s*\(/.test(source);
      if (startsReact || !entryFile) { entryFile = file; entrySource = source; }
      if (startsReact) break;
    }
    if (!entryFile) throw new Error("Non trovo il file che avvia React: verifica che il file di ingresso del progetto (per esempio src/main.jsx o src/main.tsx) esista e sia leggibile.");
    const imported = userAccessImport(entrySource, relativeModulePath(entryFile, runtimePath));
    if (imported !== entrySource) {
      await declared(async () => { if (get().document?.file === entryFile) await applySource(imported); else await applyToFile(entryFile, imported); });
    }
    set({ userAccessConfig: normalized });
    return normalized;
  }

  /** The declared list of an affordance, read from the file the manifest names. */
  async function affordanceList(affordance: Affordance) {
    const project = get().project;
    if (!project) throw new Error("Apri un progetto prima di modificare questa pagina.");
    const file = joinProjectPath(project.root, affordance.data.file);
    const source = await desktopBridge.readFile(file);
    const { readDataList } = await import("../source-parser/dataList");
    const list = readDataList(source, affordance.data.list);
    if (!list) throw new Error(`La lista ${affordance.data.list} in ${affordance.data.file} non è fatta di soli valori semplici: aprila nel codice.`);
    return { file, source, list };
  }

  const matchesFilter = (item: DataItem, filter?: Record<string, string>) =>
    !filter || Object.entries(filter).every(([key, value]) => item[key] === value);

  /** Writes the list back with the items given, keeping the ones the affordance does not own. */
  async function writeAffordanceItems(affordance: Affordance, mine: DataItem[]) {
    const { file, source, list } = await affordanceList(affordance);
    const others = list.items.filter((item) => !matchesFilter(item, affordance.data.filter));
    const { writeDataList } = await import("../source-parser/dataList");
    await declared(() => applyToFile(file, writeDataList(source, list, [...others, ...mine])));
  }

  function reportError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    set((state) => ({ lastError: message, consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("error", message)] }));
  }

  function reportWarning(message: string) {
    set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("warning", message)] }));
  }

  function reportSuccess(message: string) {
    set((state) => ({ consoleEntries: [...state.consoleEntries, entry("success", message)] }));
  }

  /** One JSX element can draw a whole row of buttons or cards. Editing it edits every one of them,
   * which is what used to make a change land on all the similar elements at once, so every edit
   * first asks how many copies the preview is showing and which one the user picked. */
  function repetition() {
    const info = get().selectionInfo;
    const count = info?.instanceCount ?? 1;
    // The list index keeps pointing at the same item after a copy is removed; the DOM position does not.
    const index = info?.listIndex ?? info?.instanceIndex;
    return { count, index, isolate: count > 1 && index != null && get().editScope === "instance" };
  }

  /** Applies one visual change to every rendered item picked by the user. Items are processed from
   * the end of each file towards the start, so adding a style never invalidates a source range that
   * still has to be used. The many writes remain one Undo action. */
  async function updateSelectedItems(items: SelectionItem[], valuesFor: (item: SelectionItem) => Record<string, string | number>) {
    const historyMark = get().history.length;
    const consoleMark = get().consoleEntries.length;
    const beforeInfo = get().selectionInfo;
    const beforeScope = get().editScope;
    const project = get().project;
    let changed = 0;
    let canceled = false;
    const documentsBefore = new Map<string, EditorDocument>();
    const documentsAfter = new Map<string, EditorDocument>();
    const refreshed = (item: SelectionItem): SelectionItem | undefined => {
      const before = documentsBefore.get(item.source.file), after = documentsAfter.get(item.source.file);
      if (!before || !after || before === after) return item;
      const oldNodes = Object.values(before.nodes), newNodes = Object.values(after.nodes);
      const index = oldNodes.findIndex((node) => node.source.start === item.source.start && node.source.end === item.source.end);
      // A style edit keeps the JSX tree intact. Only remap offsets of our own accepted edit.
      if (index < 0 || oldNodes.length !== newNodes.length || oldNodes[index].type !== newNodes[index]?.type) return undefined;
      return { ...item, source: newNodes[index].source };
    };
    const ordered = [...items].sort((left, right) => left.source.file.localeCompare(right.source.file) || right.source.start - left.source.start);
    try {
      for (const item of ordered) {
        const updated = refreshed(item);
        if (!updated) { canceled = true; break; }
        set({ selectionInfo: item.info, editScope: "instance" });
        if (!await get().selectSource(updated.source)) { canceled = true; break; }
        if (!get().selectedId) continue;
        if (!documentsBefore.has(item.source.file)) documentsBefore.set(item.source.file, get().document!);
        if (!await get().updateStyles(valuesFor(item), item.styles)) { canceled = true; break; }
        documentsAfter.set(item.source.file, get().document!);
        changed += 1;
      }
    } finally {
      if (!canceled && get().project === project) {
        set({ selectionInfo: beforeInfo, editScope: beforeScope });
        set((state) => {
          const seen = new Set<string>();
          const collapsed: HistorySnapshot[] = [];
          for (const snapshot of state.history.slice(historyMark)) {
            if (seen.has(snapshot.file)) continue;
            seen.add(snapshot.file);
            collapsed.push(snapshot);
          }
          return {
            history: [...state.history.slice(0, historyMark), ...collapsed],
            consoleEntries: [...state.consoleEntries.slice(0, consoleMark), ...state.consoleEntries.slice(consoleMark).filter((item) => item.level !== "success")],
          };
        });
      }
    }
    const updatedItems = items.map(refreshed);
    if (updatedItems.some((item) => !item)) canceled = true;
    return { changed, canceled, items: updatedItems.filter((item): item is SelectionItem => Boolean(item)) };
  }

  /** Says out loud what an edit reached, because "it also changed the others" is invisible otherwise. */
  function scopeNote(type: string, count: number, index?: number) {
    if (count <= 1) return `<${type}>`;
    if (index == null) return `tutte le ${count} copie di <${type}>`;
    return get().editScope === "instance" ? `la copia #${index + 1} di <${type}>` : `tutte le ${count} copie di <${type}>`;
  }

  // A file that cannot be parsed still opens as a code-only document: a syntax error in one page
  // must never abort opening the whole project. The failing step is reported so the editor can say
  // what went wrong rather than showing an empty panel.
  async function readDocument(file: string, current: () => boolean = () => true): Promise<{ document?: EditorDocument; reason?: SelectionProblem; detail?: string }> {
    let source: string;
    try {
      source = await desktopBridge.readFile(file);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (current()) reportWarning(`Impossibile leggere ${file}: ${detail}`);
      return { reason: "unreadable", detail };
    }
    if (!current()) return {};
    const { parseSource } = await import("../source-parser/parseSource");
    if (!current()) return {};
    try {
      return { document: parseSource(file, source) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (current()) reportWarning(`${file} contiene un errore di sintassi (${detail}). Correggilo in modalità Code.`);
      return { document: { file, source, nodes: {}, roots: [], version: 1 }, reason: "unparsed", detail };
    }
  }

  async function documentFor(file: string): Promise<EditorDocument | undefined> {
    return (await readDocument(file)).document;
  }

  return {
    pages: [], routerEditable: false, activePageId: undefined, requestedStatePage: undefined, previewPath: "/", previewStatus: "idle", previewRestarting: false, previewProcessExited: false, interactionMode: "edit", selectionStyles: {}, editScope: "instance", plcVariables: [], resourceCatalog: emptyHmiResourceCatalog(), scriptCatalog: emptyHmiScriptCatalog(), faceplateCatalog: emptyHmiFaceplateCatalog(), dataLogCatalog: emptyHmiDataLogCatalog(), hmiIssues: [], projectComponents: [], externalRoots: [],
    simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] },
    viewMode: "visual", zoom: 0.82, fitCanvas: true, leftPanel: "pages", leftPanelCollapsed: false, multiSelection: [],
    ...view, paletteOpen: false, userAccessOpen: false, userAccessBusy: false, panelManifest: undefined, zonePicking: undefined, unlockedPages: [], unlockedFiles: [], draggedComponent: undefined, consoleOpen: false, standalonePreviewOpen: false, loading: false, exporting: false, dirty: false, recentProjects: recent, history: [], future: [],
    consoleEntries: [entry("info", desktopAvailable ? "Desktop bridge ready" : "Browser mode: local project actions require the Tauri app")],
    setViewMode: (viewMode) => set({ viewMode }),
    retryReloadRecovery: async () => {
      if (get().reloadRecovery?.persistent) await resumeEditorDraft(useEditorStore);
      else await recoverEditorReload(useEditorStore);
      if (get().project) await ensureProjectIndex();
    },
    resumePersistentRecovery: async (choice) => {
      await resumeEditorDraft(useEditorStore, choice);
      if (get().project) await ensureProjectIndex();
    },
    retryDraftBackup: async () => { try { await flushEditorDraft(useEditorStore); } catch { /* The backup error is visible in the editor. */ } },
    discardReloadRecovery: async () => {
      if (get().reloadRecovery?.status === "opening") return;
      if (get().reloadRecovery?.checkpoint?.dirty && !window.confirm("Scartare la bozza e tornare ai progetti?\n\nLa copia con le modifiche non salvate verrà eliminata. I file già salvati nel progetto non verranno modificati. Se vuoi riprendere il lavoro, scegli Annulla e recupera la bozza.")) return;
      const pending = get().reloadRecovery;
      if (pending) set({ reloadRecovery: { ...pending, status: "checking" } });
      try { await clearDurableEditorDraft(useEditorStore, pending?.persistent); }
      catch (error) { set((state) => ({ reloadRecovery: state.reloadRecovery && { ...state.reloadRecovery, status: "failed", error: String(error) } })); return; }
      clearEditorReloadCheckpoint();
      set({ reloadRecovery: undefined });
    },
    setViewport: (viewport) => set(rememberView({ viewport })),
    setZoom: (zoom) => set({ zoom: Math.min(1.5, Math.max(0.25, zoom)) }),
    setFitCanvas: (fitCanvas) => set({ fitCanvas }),
    setInteractionMode: (interactionMode) => {
      if (interactionMode !== get().interactionMode) runtime.selectionSequence++;
      set({ interactionMode, selectedId: interactionMode === "navigate" ? undefined : get().selectedId,
      selectionRect: interactionMode === "navigate" ? undefined : get().selectionRect,
      selectionStyles: interactionMode === "navigate" ? {} : get().selectionStyles,
      highlightPicker: interactionMode === "navigate" ? undefined : get().highlightPicker });
    },
    setLeftPanel: (leftPanel) => set((state) => ({ leftPanel, leftPanelCollapsed: state.leftPanel === leftPanel ? !state.leftPanelCollapsed : false })),

    setUiDensity: (uiDensity) => set(rememberView({ uiDensity })),
    setPaneSize: (pane, width) => set((state) => rememberView({ paneSizes: { ...state.paneSizes, [pane]: clampPane(width) } })(state)),
    setSnap: (snap) => set((state) => rememberView({ snap: { ...state.snap, ...snap } })(state)),
    setMultiSelection: (multiSelection) => set({ multiSelection }),

    // Spegnendo la simulazione si buttano via anche gli elementi raccolti: alla riaccensione la
    // pagina puo' essere un'altra, e chiederglielo di nuovo costa un messaggio.
    setSimulationOn: (on) => set((state) => ({
      simulation: on
        ? { ...state.simulation, on: true }
        : { on: false, values: state.simulation.values, status: state.simulation.status, elements: [], unresolved: [] },
    })),
    setSimulationValue: (tag, value) => set((state) => ({
      simulation: { ...state.simulation, values: { ...state.simulation.values, [tag]: value } },
    })),
    setSimulationStatus: (tag, status) => set((state) => ({
      simulation: { ...state.simulation, status: { ...state.simulation.status, [tag]: { ...state.simulation.status[tag], ...status } } },
    })),
    setSimulationElements: (elements) => set((state) => ({ simulation: { ...state.simulation, elements } })),
    setSimulationUnresolved: (unresolved) => set((state) => ({ simulation: { ...state.simulation, unresolved } })),

    async updateMultiSelectionStyles(values) {
      const items = get().multiSelection;
      if (items.length < 2) { reportWarning("Scegli almeno due elementi con Ctrl+clic o Shift+clic."); return; }
      const { changed, canceled, items: updatedItems } = await updateSelectedItems(items, () => values);
      if (!changed || canceled) return;
      set({ multiSelection: updatedItems.map((item) => ({ ...item, styles: { ...item.styles, ...Object.fromEntries(Object.entries(elementTransformStyles(values, item.styles)).map(([name, value]) => [name, String(value)])) } })) });
      reportSuccess(`Proprietà applicata a ${changed} elementi. Ctrl+Z annulla tutto in un solo passaggio.`);
    },

    async commitMultiSelection(items) {
      if (items.length < 2) return;
      const { changed, canceled, items: updatedItems } = await updateSelectedItems(items, (item) => ({ translate: `${item.translate.x}px ${item.translate.y}px` }));
      if (!changed || canceled) return;
      set({ multiSelection: updatedItems });
      reportSuccess(`Gruppo spostato: ${changed} elementi aggiornati insieme. Ctrl+Z annulla tutto.`);
    },

    /** Lines up everything the user picked. The geometry comes from the running page, so this works
     * on elements the editor never parsed as a group, and the result is written one element at a
     * time — into the source, like every other change, so it survives a reload and a rebuild. */
    async alignSelection(mode) {
      const items = get().multiSelection;
      if (items.length < 2) { reportWarning("Scegli almeno due elementi: tieni premuto Shift e clicca."); return; }
      const current = selectionEditCurrent();
      const { alignItems, alignLabels } = await import("../canvas/alignment");
      if (!current() || get().multiSelection !== items) return;
      const changes = alignItems(items, mode);
      if (!changes.length) { reportWarning(`${alignLabels[mode]}: gli elementi sono già a posto.`); return; }
      // Where the history stood before the first element moved. One command has to be one undo, and
      // this is a command that writes as many times as there are elements in the group.
      const mark = get().history.length;
      const before = get().selectionInfo;
      const project = get().project;
      let moved = 0;
      let canceled = false;
      // Written back to front. Every rewrite moves everything after it in the file, so aligning the
      // first element first would leave the rest of the group pointing at the wrong text.
      const ordered = changes
        .map((change) => ({ change, item: items.find((candidate) => candidate.instanceId === change.instanceId) }))
        .filter((entry): entry is { change: typeof entry.change; item: SelectionItem } => Boolean(entry.item))
        .sort((left, right) => right.item.source.start - left.item.source.start);
      try {
        for (const { change, item } of ordered) {
          // The copy to move is named by the running page: without this a list drawing eight buttons
          // would take every change on its first one.
          set({ selectionInfo: item.info });
          if (!await get().selectSource(item.source)) { canceled = true; break; }
          if (!get().selectedId) continue;
          if (!await get().updateStyles({ translate: change.translate })) { canceled = true; break; }
          moved += 1;
        }
      } finally {
        if (!canceled && get().project === project) {
          set({ selectionInfo: before });
          set((state) => {
            const seen = new Set<string>();
            const collapsed: HistorySnapshot[] = [];
            for (const snapshot of state.history.slice(mark)) {
              if (seen.has(snapshot.file)) continue;
              seen.add(snapshot.file);
              collapsed.push(snapshot);
            }
            return { history: [...state.history.slice(0, mark), ...collapsed] };
          });
        }
      }
      if (moved && !canceled) reportSuccess(`${alignLabels[mode]}: ${moved} ${moved === 1 ? "elemento spostato" : "elementi spostati"}.`);
    },

    /** Puts the workspace into one of the saved arrangements. It moves the panels rather than
     * hiding features: the same editor, set up for what is being done right now. */
    applyWorkLayout(workLayout) {
      const preset = layoutPresets[workLayout];
      set((state) => rememberView({ workLayout, paneSizes: preset.panes })(state));
      set({ leftPanel: preset.panel, leftPanelCollapsed: false });
    },
    toggleLeftPanel: () => set((state) => ({ leftPanelCollapsed: !state.leftPanelCollapsed })),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    setDraggedComponent: (draggedComponent) => set({ draggedComponent }),
    setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
    clearConsole: () => set({ consoleEntries: [], lastError: undefined }),
    async chooseAndOpenProject() {
      try { const root = await desktopBridge.chooseDirectory(); if (root) await get().openProject(root); } catch (error) { reportError(error); }
    },
    async createProject() {
      if (runtime.projectOpening) return;
      try {
        const root = await desktopBridge.chooseDirectory();
        if (!root) return;
        runtime.projectOpening = true;
        set({ loading: true, lastError: undefined });
        try { await desktopBridge.createProject(root); }
        finally { runtime.projectOpening = false; }
        await get().openProject(root);
      } catch (error) { set({ loading: false }); reportError(error); }
    },
    async createStandardProject(config) {
      if (runtime.projectOpening) return;
      try {
        const root = await desktopBridge.chooseDirectory();
        if (!root) return;
        const { standardProjectFiles } = await import("../core/standardProject");
        const files = standardProjectFiles(config);
        runtime.projectOpening = true;
        set({ loading: true, lastError: undefined });
        try { await desktopBridge.createProject(root, files); }
        finally { runtime.projectOpening = false; }
        await get().openProject(root);
      } catch (error) { set({ loading: false }); reportError(error); }
    },
    async openProject(root) {
      if (runtime.projectOpening) return;
      runtime.projectOpening = true;
      set({ loading: true, previewStatus: "starting", previewError: undefined, previewSessionId: undefined, previewProcessExited: false, lastError: undefined });
      try {
        await runtime.previewRestartTask;
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
        set({ project, document, plcVariables: [], resourceCatalog: emptyHmiResourceCatalog(), scriptCatalog: emptyHmiScriptCatalog(), faceplateCatalog: emptyHmiFaceplateCatalog(), dataLogCatalog: emptyHmiDataLogCatalog(), hmiIssues: [], projectComponents: [], pages: pageData.pages, routerFile: pageData.routerFile, routerEditable: pageData.routerEditable,
          activePageId: firstPage?.id, requestedStatePage: firstPage?.stateValue,
          previewUrl: undefined, previewPath: firstPage?.route ?? "/", recentProjects, history: [], future: [], dirty: false, externalRoots: [], selectedId: undefined, selectionRect: undefined, selectionStyles: {}, selectionInfo: undefined, editScope: "instance", unresolvedSelection: undefined,
          highlightPicker: undefined, standalonePreviewOpen: false, previewStatus: "starting", leftPanel: pageData.pages.length ? "pages" : "project", leftPanelCollapsed: false,
          userAccessConfig: undefined, userAccessOpen: false, userAccessBusy: false, panelManifest: undefined, zonePicking: undefined, unlockedPages: [], unlockedFiles: [] });
        // The manifest only decides what the editor offers, so it must never delay the preview.
        void readPanelManifest(project.root).then((panelManifest) => set({ panelManifest }));
        void ensureProjectIndex();
        // The PLC catalog only enriches the Inspector, so it must never delay starting the preview.
        void readPlcCatalog(project.root).then((plcVariables) => set({ plcVariables }));
        void readResourceCatalog(project.root).then((resourceCatalog) => set({ resourceCatalog }));
        void readScriptCatalog(project.root).then((scriptCatalog) => set({ scriptCatalog }));
        void readFaceplateCatalog(project.root).then((faceplateCatalog) => set({ faceplateCatalog }));
        void readDataLogCatalog(project.root).then((dataLogCatalog) => set({ dataLogCatalog }));
        const sessionId = crypto.randomUUID();
        set({ previewSessionId: sessionId, previewProcessExited: false });
        try {
          const preview = await desktopBridge.startPreview(workingCopy.root, false, sessionId, get().handlePreviewExit);
          if (get().project?.root !== project.root || get().previewSessionId !== sessionId || get().previewProcessExited) return;
          set((state) => ({ previewUrl: preview.url, previewStatus: "starting", externalRoots: preview.sourceRoots ?? [], consoleEntries: [...state.consoleEntries,
            ...(workingCopy.created ? [entry("success", `Copia di lavoro creata. L'originale resta invariato: ${workingCopy.originalRoot}`)] : []),
            entry("success", `Preview avviata su ${preview.url}`)] }));
          // Starting Vite authorises linked template roots. Rebuild now so those real, reusable HMI
          // components appear in the palette too, not only files physically under src/.
          runtime.projectIndexRequest = undefined;
          void ensureProjectIndex();
        } catch (error) {
          if (get().project?.root !== project.root || get().previewSessionId !== sessionId || get().previewProcessExited) return;
          const message = error instanceof Error ? error.message : String(error);
          set({ previewStatus: "error", previewError: message }); reportError(error);
        }
      } catch (error) {
        // The preview may already be running for a project we failed to finish opening.
        try { await desktopBridge.stopPreview(); } catch { /* Stopping a preview that never started is not an error. */ }
        set({ previewStatus: "error", previewError: error instanceof Error ? error.message : String(error) }); reportError(error);
      } finally {
        set({ loading: false });
        runtime.projectOpening = false;
      }
    },
    removeRecentProject(root) {
      const recentProjects = get().recentProjects.filter((item) => item !== root);
      persistRecentProjects(recentProjects);
      set({ recentProjects });
    },
    async closeProject() {
      if (get().reloadRecovery?.status === "opening") return;
      if ((get().dirty || get().reloadRecovery?.checkpoint?.dirty) && !window.confirm("Ci sono modifiche non salvate. Vuoi tornare comunque ai progetti?")) return;
      const previewSessionId = get().previewSessionId;
      const recovery = get().reloadRecovery;
      set({ loading: true, previewSessionId: undefined, reloadRecovery: undefined });
      try { await clearDurableEditorDraft(useEditorStore, recovery?.persistent); }
      catch (error) { set({ loading: false, previewSessionId, reloadRecovery: recovery }); reportError(error); return; }
      clearEditorReloadCheckpoint();
      set({ loading: true, previewSessionId: undefined, reloadRecovery: undefined });
      await runtime.previewRestartTask;
      // Returning to the project list must always succeed, even if the host cannot stop the preview.
      try { await desktopBridge.closeProject(); } catch (error) { reportError(error); }
      set({ project: undefined, document: undefined, pages: [], routerFile: undefined, routerEditable: false, activePageId: undefined, requestedStatePage: undefined, selectedId: undefined, selectionRect: undefined, selectionStyles: {}, plcVariables: [], resourceCatalog: emptyHmiResourceCatalog(), scriptCatalog: emptyHmiScriptCatalog(), faceplateCatalog: emptyHmiFaceplateCatalog(), dataLogCatalog: emptyHmiDataLogCatalog(), hmiIssues: [], projectComponents: [],
        previewUrl: undefined, previewPath: "/", previewStatus: "idle", previewError: undefined, previewRestarting: false, previewSessionId: undefined, previewProcessExited: false, lastError: undefined, highlightPicker: undefined,
        standalonePreviewOpen: false, history: [], future: [], dirty: false, loading: false, userAccessConfig: undefined, userAccessOpen: false, userAccessBusy: false, panelManifest: undefined, zonePicking: undefined, unlockedPages: [], unlockedFiles: [] });
    },
    async openFile(path) {
      if (!/\.[jt]sx?$/i.test(path)) return;
      const sequence = ++runtime.selectionSequence;
      const project = get().project;
      const current = get().document;
      const currentSelection = () => sequence === runtime.selectionSequence && get().project === project && get().document === current;
      // Visual edits are written straight to disk, so a pending code-view buffer is flushed the same way
      // instead of being silently dropped when the user switches file.
      if (current && get().dirty && current.file !== path) {
        if (!await flushPendingDocument(current, currentSelection)) return;
      }
      if (current?.file === path && get().dirty) return;
      const { document } = await readDocument(path, currentSelection);
      if (document && currentSelection()) set({ document, selectedId: undefined, selectionRect: undefined, selectionStyles: {}, dirty: false });
    },
    async openPage(page) {
      set({ previewPath: page.route, activePageId: page.id, requestedStatePage: page.stateValue,
        interactionMode: "edit", selectedId: undefined, selectionRect: undefined, highlightPicker: undefined });
      await get().openFile(page.file);
    },
    async createPage(name, route, sectionId, templateId = "blank") {
      const { project, routerFile, pages } = get();
      if (!project || !routerFile || !get().routerEditable) throw new Error("La creazione visuale richiede React Router con un componente <Routes>.");
      const cleanName = name.trim().replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
      const cleanRoute = route.trim();
      if (!cleanName) throw new Error("Inserisci un nome per la pagina.");
      if (templateId !== "blank" && !sectionId) throw new Error("Scegli una sezione dello standard per usare questo template HMI.");
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
        const plan = sectionId ? await planStandardPage(project.root, get().pages, get().panelManifest, sectionId) : undefined;
        if (sectionId && !plan) throw new Error("La sezione e' piena: 14 voci di menu da 40 pagine sono tutte occupate.");
        const { standardPageSource } = await import("../core/hmiPages");
        const pageSource = plan
          ? standardPageSource({ componentName, title: cleanName, plan, templateId })
          : `export function ${componentName}() {\n  return (\n    <main className="page">\n      <h1>${cleanName}</h1>\n      <p>Inizia a modificare questa pagina in Framecraft.</p>\n    </main>\n  );\n}\n`;
        const createdPath = await desktopBridge.createFile(relativePath, pageSource);
        await desktopBridge.writeFile(routerFile, nextRouter);
        const nextProject = await desktopBridge.analyzeProject(project.root);
        const pageData = await inspectPages(nextProject);
        const createdPage = pageData.pages.find((page) => page.route === cleanRoute);
        set({ project: nextProject, pages: pageData.pages, routerFile: pageData.routerFile, routerEditable: pageData.routerEditable,
          previewPath: cleanRoute, activePageId: createdPage?.id, requestedStatePage: undefined });
        if (plan && createdPage) await recordPageNumber(project.root, { id: createdPage.id, name: cleanName, pageNumber: plan.number, section: sectionId });
        await get().openFile(createdPath);
      } catch (error) { reportError(error); throw error; }
    },
    async syncPreviewPath(path) {
      if (get().previewProcessExited || !get().previewUrl) return;
      const previousPath = get().previewPath;
      if (path !== previousPath) runtime.selectionSequence++;
      const page = get().pages.find((item) => !item.stateValue && item.route === path);
      set({ previewPath: path, activePageId: page?.id ?? get().activePageId, previewStatus: "ready", previewError: undefined });
      if (path !== previousPath && page && get().document?.file !== page.file) await get().openFile(page.file);
    },
    syncStatePage(value) {
      const page = get().pages.find((item) => item.stateValue === value);
      if (page) set({ activePageId: page.id, requestedStatePage: value });
    },
    markPreviewReady: () => { if (!get().previewProcessExited && get().previewUrl) set({ previewStatus: "ready", previewError: undefined }); },
    handlePreviewExit(exit) {
      if (!exit.sessionId) return;
      runtime.previewExits.set(exit.sessionId, exit);
      if (runtime.previewExits.size > 32) {
        const oldest = runtime.previewExits.keys().next().value;
        if (oldest !== undefined) runtime.previewExits.delete(oldest);
      }
      const state = get();
      if (!state.project || !exit.sessionId || state.previewSessionId !== exit.sessionId || state.previewProcessExited) return;
      runtime.selectionSequence++;
      set({ previewUrl: undefined, previewStatus: "error", previewError: exit.message, previewProcessExited: true,
        consoleEntries: [...state.consoleEntries, entry("error", exit.message, "preview")].slice(-300) });
    },
    reportedPreviewExit: (sessionId) => runtime.previewExits.get(sessionId),
    addPreviewOutput(stream, line, sessionId) {
      if (sessionId && get().previewSessionId !== sessionId) return;
      const diagnosticLine = cleanDiagnosticText(line);
      const looksLikeError = /(?:^|[\s\[])(error|failed|exception)\b/i.test(diagnosticLine);
      const fatal = fatalPreviewOutput.some((pattern) => pattern.test(diagnosticLine));
      const level: ConsoleEntry["level"] = looksLikeError ? "error" : stream === "stderr" ? "warning" : "info";
      set((state) => {
        // Only a fatal line during startup may switch the canvas to the error state. Once the preview is
        // running, a noisy log line is just a log line: blanking a working iframe loses the user's place.
        const breaksPreview = fatal && state.previewStatus !== "ready" && !state.previewProcessExited;
        return {
          previewStatus: breaksPreview ? "error" : state.previewStatus,
          previewError: breaksPreview ? line : state.previewError,
          consoleEntries: [...state.consoleEntries, entry(level, line, diagnosticLine.startsWith("[HMI ") ? "hmi" : "preview")].slice(-300),
        };
      });
    },
    setSelectionRect: (selectionRect) => set({ selectionRect }),
    setSelectionStyles: (selectionStyles) => set({ selectionStyles }),
    setSelectionInfo: (selectionInfo) => set({ selectionInfo }),
    setHighlightPreview: (highlightPreview) => set({ highlightPreview: withHandles(highlightPreview) }),

    async moveHighlightAnchor(index, x, y, done) {
      try {
        const base = runtime.anchorDragPath ?? await highlightPathOfRow();
        if (!base) return;
        runtime.anchorDragPath = base;
        const next = movePathAnchor(base, index, x, y);
        set((state) => ({ highlightPreview: withHandles({ ...state.highlightPreview, path: next, editable: true }) }));
        if (!done) return;
        runtime.anchorDragPath = undefined;
        await get().updateListItemProperty("highlight.d", next);
      } catch (error) {
        runtime.anchorDragPath = undefined;
        reportError(error);
      }
    },

    async insertHighlightAnchor(afterIndex, x, y) {
      try {
        const base = await highlightPathOfRow();
        if (!base) return;
        await get().updateListItemProperty("highlight.d", insertPathAnchor(base, afterIndex, { x, y }));
      } catch (error) { reportError(error); }
    },

    async removeHighlightAnchor(index) {
      try {
        const base = await highlightPathOfRow();
        if (!base) return;
        await get().updateListItemProperty("highlight.d", removePathAnchor(base, index));
      } catch (error) { reportError(error); }
    },
    setEditScope: (editScope) => set({ editScope }),
    async selectSource(source, tag, regionInput) {
      const sequence = ++runtime.selectionSequence;
      const project = get().project;
      const path = get().previewPath;
      const mode = get().interactionMode;
      const documentAtStart = get().document;
      const picker = get().highlightPicker;
      const current = () => sequence === runtime.selectionSequence && get().project === project
        && get().previewPath === path && get().interactionMode === mode && !get().loading
        && get().document === documentAtStart && (!picker || get().highlightPicker === picker);
      if (!current()) return false;
      if (picker) {
        if (picker.mode !== "element" && !regionInput) return false;
        try {
          const region = regionInput === undefined ? undefined : readHighlightRegion(regionInput);
          if (regionInput !== undefined && !region) throw new Error("La zona disegnata non è valida. Ridisegnala senza punti allineati.");
          if (region) {
            refuseIfGuided();
            for (const file of [picker.trigger.file, source.file]) {
              if (project && !insideProject(project.root, file) && !get().externalRoots.some((root) => insideProject(root, file))) throw new Error("La zona è fuori dalle cartelle autorizzate del progetto.");
              await refuseIfTemplateOwns(file);
              if (!current()) return false;
            }
          }
          const options = { targetId: `fc-highlight-${crypto.randomUUID().slice(0, 8)}`, ...highlightSettings(picker), ...(region ? { region } : {}) };
          const triggerSource = await desktopBridge.readFile(picker.trigger.file);
          if (!current()) return false;
          if (get().dirty && documentAtStart?.file === picker.trigger.file && documentAtStart.source !== triggerSource) throw new Error("Salva prima le modifiche al codice, poi ridisegna la zona: il documento non salvato resta intatto.");
          const sameFile = picker.trigger.file === source.file;
          const targetSource = sameFile ? triggerSource : await desktopBridge.readFile(source.file);
          if (!current()) return false;
          // The identifier is written into one JSX element. If a list draws that element every copy
          // carries the same one and the click always lands on the first, so this is refused rather
          // than written and left to look broken in the running panel.
          const { listReference } = await import("../source-parser/listData");
          if (listReference(targetSource, source.start, source.end)) {
            throw new Error("La parte scelta è disegnata da una lista: ogni copia riceverebbe lo stesso identificatore e l'evidenziazione finirebbe sempre sulla prima. Scegli un elemento singolo.");
          }
          const { addHighlightInteraction, addHighlightTarget, addHighlightTrigger } = await import("../source-parser/transformSource");
          const { parseSource } = await import("../source-parser/parseSource");
          if (!current()) return false;
          const triggerNodes = Object.values(parseSource(picker.trigger.file, triggerSource).nodes);
          const triggerIndex = triggerNodes.findIndex((node) => node.source.start === picker.trigger.start && node.source.end === picker.trigger.end);
          if (triggerIndex < 0) throw new Error("Il pulsante è cambiato: aggiorna l'anteprima e ridisegna la zona.");
          const targetNodes = sameFile ? triggerNodes : Object.values(parseSource(source.file, targetSource).nodes);
          const targetNode = targetNodes.find((node) => node.source.start === source.start && node.source.end === source.end);
          if (!targetNode) throw new Error("La pagina è cambiata: aggiorna l'anteprima e ridisegna la zona.");
          if (region?.space === "svg" && targetNode.type !== "svg") throw new Error("Il disegno SVG è cambiato: aggiorna l'anteprima e ridisegna la zona.");
          if (typeof targetNode.props["data-fc-highlight-id"] === "string") options.targetId = targetNode.props["data-fc-highlight-id"];
          let nextTrigger: string;
          if (sameFile) {
            nextTrigger = addHighlightInteraction(triggerSource, picker.trigger.start, picker.trigger.end, source.start, source.end, options);
          } else {
            const nextTarget = addHighlightTarget(targetSource, source.start, source.end, options.targetId);
            nextTrigger = addHighlightTrigger(triggerSource, picker.trigger.start, picker.trigger.end, options);
            if (region) {
              if (!await applyToFile(source.file, nextTarget, current, targetSource)) return false;
            } else await desktopBridge.writeFile(source.file, nextTarget);
            if (!current()) return false;
          }
          if (region && documentAtStart?.file === picker.trigger.file) {
            const parsed = await applySource(nextTrigger, true, documentAtStart, current);
            if (!parsed || get().document !== parsed || get().project !== project || get().highlightPicker !== picker) return false;
            const selectedId = Object.values(parsed.nodes)[triggerIndex]?.id;
            set({ selectedId, highlightPicker: undefined });
            reportSuccess("Zona di evidenziazione salvata. Scegli Usa il pannello e premi il pulsante per provarla.");
            return false;
          }
          await desktopBridge.writeFile(picker.trigger.file, nextTrigger);
          if (!current()) return false;
          const parsed = parseSource(picker.trigger.file, nextTrigger, (get().document?.version ?? 0) + 1);
          const selectedId = Object.values(parsed.nodes)[triggerIndex]?.id;
          set((state) => ({ document: parsed, selectedId, highlightPicker: undefined, dirty: false,
            history: [...state.history, { file: picker.trigger.file, source: triggerSource }].slice(-100), future: [],
            consoleEntries: [...state.consoleEntries, entry("success", "Interazione di evidenziazione aggiunta. Scegli Usa il pannello per provarla.")] }));
        } catch (error) { if (current()) { set({ highlightPicker: undefined }); reportError(error); } }
        return false;
      }
      // A project can legitimately render components from outside its own folder — a shared template
      // catalog reached through a Vite alias, for instance. Those files are not part of the working
      // copy, so they cannot be edited, but the element must still report what it is.
      const unresolved = (reason: SelectionProblem, detail?: string, codeOnly?: EditorDocument) => {
        if (current()) set({ ...(codeOnly ? { document: codeOnly, selectionRect: undefined, dirty: false } : {}),
          selectedId: undefined, listBinding: undefined, unresolvedSelection: { file: source.file, tag, source, reason, detail } });
        return false;
      };
      const editable = insideProject(get().project?.root, source.file)
        || get().externalRoots.some((root) => insideProject(root, source.file));
      if (!editable) return unresolved("outside");

      const selected = get().selectedId ? get().document?.nodes[get().selectedId!] : undefined;
      if (!selected || selected.source.file !== source.file || selected.source.start !== source.start || selected.source.end !== source.end) {
        set({ selectedId: undefined, listBinding: undefined, unresolvedSelection: undefined });
      }

      let document = get().document;
      if (!document || document.file !== source.file) {
        if (document && !await flushPendingDocument(document, current)) return false;
        const opened = await readDocument(source.file, current);
        if (!current()) return false;
        if (!opened.document) return unresolved(opened.reason ?? "unreadable", opened.detail);
        document = opened.document;
        if (opened.reason) return unresolved(opened.reason, opened.detail, document);
      }
      const locate = (candidate: EditorDocument) => Object.values(candidate.nodes).find((item) => item.source.start === source.start && item.source.end === source.end);
      let node = locate(document);
      // The preview and the open document can drift apart by one save: the running page still carries
      // the offsets it was built with. Re-reading the file is what turns that dead end back into a
      // working selection instead of leaving the user with a read-only panel.
      if (!node) {
        if (get().dirty && document === get().document) {
          return unresolved("missing", "Il sorgente ha modifiche non salvate: salva e aggiorna l'anteprima prima di riselezionare.");
        }
        const fresh = await readDocument(source.file, current);
        if (!current()) return false;
        if (fresh.document && !fresh.reason) {
          const refreshed = locate(fresh.document);
          if (refreshed) {
            set({ document: fresh.document, selectedId: refreshed.id, unresolvedSelection: undefined, dirty: false,
              editScope: refreshed.id === get().selectedId ? get().editScope : "instance" });
            void resolveListBinding();
            return true;
          }
        }
      }
      if (!node) return unresolved("missing");
      // Choosing another element starts over from "only this copy": inheriting "all copies" from a
      // previous selection would quietly widen the next edit.
      set({ ...(document !== get().document ? { document, dirty: false } : {}), selectedId: node.id,
        unresolvedSelection: undefined, editScope: node.id === get().selectedId ? get().editScope : "instance" });
      // What data draws this element is read in the background: a click must not wait for a file.
      void resolveListBinding();
      return true;
    },
    beginHighlightSelection(settings, mode = "element") {
      const { document, selectedId } = get();
      const node = selectedId ? document?.nodes[selectedId] : undefined;
      try {
        if (!node || node.type !== "button") throw new Error("Seleziona prima un pulsante.");
        if (!["element", "rectangle", "polygon"].includes(mode)) throw new Error("Scegli una modalità di evidenziazione valida.");
        const { count } = repetition();
        if (count > 1) throw new Error(`Questo pulsante è una delle ${count} copie della stessa lista: un'evidenziazione varrebbe per tutte e punterebbe sempre alla prima parte.`);
        runtime.selectionSequence++;
        set({ highlightPicker: { trigger: node.source, triggerLabel: node.text || node.type, mode, requestId: crypto.randomUUID(), previewPath: get().previewPath, ...highlightSettings(settings) }, interactionMode: "edit", zonePicking: undefined, multiSelection: [] });
      } catch (error) { reportError(error); }
    },
    cancelHighlightSelection: () => { if (get().highlightPicker) runtime.selectionSequence++; set({ highlightPicker: undefined }); },
    async updateHighlightInteraction(settings) {
      const { document, selectedId } = get();
      const node = selectedId ? document?.nodes[selectedId] : undefined;
      const current = selectionEditCurrent();
      try {
        const targetId = node?.props["data-fc-highlight-target"];
        if (!document || !node || typeof targetId !== "string") throw new Error("Seleziona un pulsante con un'evidenziazione configurata.");
        const { updateHighlightTrigger } = await import("../source-parser/transformSource");
        if (!current()) return;
        if (!await applySource(updateHighlightTrigger(document.source, node.source.start, node.source.end, { targetId, ...highlightSettings(settings) }), true, document, current)) return;
        set((state) => ({ consoleEntries: [...state.consoleEntries, entry("success", "Evidenziazione aggiornata.")] }));
      } catch (error) { reportError(error); }
    },
    async removeHighlightInteraction() {
      const { document, selectedId } = get();
      const node = selectedId ? document?.nodes[selectedId] : undefined;
      const current = selectionEditCurrent();
      try {
        if (!document || !node) return;
        const { removeHighlightTrigger } = await import("../source-parser/transformSource");
        if (!current()) return;
        if (!await applySource(removeHighlightTrigger(document.source, node.source.start, node.source.end), true, document, current)) return;
        set((state) => ({ consoleEntries: [...state.consoleEntries, entry("success", "Interazione rimossa. L'elemento evidenziato non è stato modificato.")] }));
      } catch (error) { reportError(error); }
    },
    expandProperties: () => set({ propertiesExpandedAt: Date.now() }),
    async inspectSource(source, tag, focusText) {
      const selecting = get().selectSource(source, tag);
      const sequence = runtime.selectionSequence;
      await selecting;
      if (sequence !== runtime.selectionSequence) return;
      // A double click on a label that cannot be edited in place must still land on its text: the
      // sheet opens with the cursor already in the field.
      set(focusText ? { textFocusRequestedAt: Date.now() } : { propertiesExpandedAt: Date.now() });
    },
    /** Changes a value the selected element passes to its own handler: which page it opens, which
     * signal it writes, whether it opens or closes. It is a literal in the source, so it belongs to
     * the element rather than to a single rendered copy. */
    async updateActionValue(range, kind, value, origin) {
      const { document } = get(); if (!document) return;
      const current = selectionEditCurrent();
      try {
        let literal: string;
        if (kind === "boolean") literal = value === "true" ? "true" : "false";
        else if (kind === "number") {
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) throw new Error(`«${value}» non è un numero.`);
          literal = String(parsed);
        } else literal = JSON.stringify(value);
        // A value inside the handler belongs to the page that supplies it, not to this element.
        if (origin) {
          await editSourceRange(origin.file, range, origin.raw, literal);
          reportSuccess(`Aggiornato in ${fileName(origin.file)}: vale per tutto quello che passa da lì.`);
          return;
        }
        const { replaceSourceRange } = await import("../source-parser/transformSource");
        if (!current()) return;
        if (!await applySource(replaceSourceRange(document.source, range.start, range.end, literal), true, document, current)) return;
        const { count } = repetition();
        reportSuccess(count > 1
          ? `Azione aggiornata: il valore è scritto una volta sola, quindi vale per tutte le ${count} copie.`
          : "Azione aggiornata.");
      } catch (error) { reportError(error); }
    },

    /** Keeps a runtime-built destination as the default and inserts a small exception for the
     * selected row. Other hotspots continue to use the original page rule. */
    async updateActionValueForItem(action, itemKey, value) {
      try {
        if (!action.file || !action.raw || !action.parameter || !action.defaultRaw) throw new Error("Questa destinazione non può ancora essere separata per singola voce.");
        const next = value.trim();
        if (!next) throw new Error("Scegli la pagina da aprire.");
        const overrides = new Map((action.itemOverrides ?? []).map((item) => [item.key, item.value]));
        const placeholder = `\${${action.parameter}}`;
        const defaultValue = action.defaultRaw.startsWith("`") && action.defaultRaw.endsWith("`")
          ? action.defaultRaw.slice(1, -1).replaceAll(placeholder, itemKey)
          : undefined;
        if (next === defaultValue) overrides.delete(itemKey);
        else overrides.set(itemKey, next);
        let expression = action.defaultRaw;
        for (const [key, destination] of [...overrides].reverse()) {
          expression = `${action.parameter} === ${JSON.stringify(key)} ? ${JSON.stringify(destination)} : ${expression}`;
        }
        await editSourceRange(action.file, { start: action.start, end: action.end }, action.raw, expression);
        reportSuccess(`La voce «${itemKey}» adesso apre «${next}». Le altre voci non cambiano.`);
      } catch (error) { reportError(error); }
    },

    /** Hands the element a different function. The element itself only forwards the call, so what a
     * click does is changed where the function is wired: in the page that supplies it, or in this
     * file when the element names one of its own. */
    async updateHandler(handler, name) {
      const next = name.trim();
      try {
        if (!/^[A-Za-z_$][\w$]*$/.test(next)) throw new Error(`«${name}» non è il nome di una funzione.`);
        if (next === handler.name) return;
        await editSourceRange(handler.file, { start: handler.start, end: handler.end }, handler.raw, next);
        reportSuccess(`Al posto di ${handler.name} adesso viene chiamata ${next} (${fileName(handler.file)}).`);
      } catch (error) { reportError(error); }
    },
    async configureUserAccess() {
      const { document, selectedId, project } = get();
      if (!document || !selectedId || !project) return;
      const current = selectionEditCurrent();
      try {
        const node = document.nodes[selectedId];
        if (!node) throw new Error("Riseleziona l’elemento a cui vuoi assegnare l’accesso utente.");
        const { defaultUserAccessConfig } = await import("../core/userAccess");
        // A project that already has accounts keeps them: this button only adds one more way in.
        const config = get().userAccessConfig ?? await readUserAccessConfig() ?? defaultUserAccessConfig;
        if (!current()) return;
        const { updateStaticAttributes } = await import("../source-parser/transformSource");
        if (!current()) return;
        const parsed = await applySource(updateStaticAttributes(document.source, node.source.start, node.source.end, {
          "data-fc-user-access": "true",
          "data-fc-user-logged-out": "Nessun utente",
        }), true, document, current);
        if (!parsed || !current(parsed)) return;
        await writeUserAccessRuntime(config);
        if (get().project === project) set({ userAccessOpen: true });
        reportSuccess("Accesso utente aggiunto. Gestisci account e permessi nella finestra appena aperta, poi usa Prova pannello.");
      } catch (error) { reportError(error); }
    },
    activeAffordances() {
      const { panelManifest, pages, activePageId } = get();
      const page = pages.find((item) => item.id === activePageId);
      return pageAffordances(panelManifest, page?.stateValue || page?.id);
    },
    guidedPage() {
      const { panelManifest, pages, activePageId, unlockedPages } = get();
      const page = pages.find((item) => item.id === activePageId);
      const key = page?.stateValue || page?.id;
      if (!key || unlockedPages.includes(key)) return undefined;
      const declared = manifestPage(panelManifest, key);
      return declared?.locked && declared.affordances.length ? declared : undefined;
    },
    templateContractOf: (file) => templateContractFor(file),
    unlockFile(file) {
      set((state) => ({ unlockedFiles: [...new Set([...state.unlockedFiles, file])] }));
      reportWarning(`${fileName(file)} è sbloccato fino alla chiusura del progetto. Quello che cambi lì vale per tutte le macchine che usano quel template.`);
    },
    unlockPage() {
      const { pages, activePageId } = get();
      const page = pages.find((item) => item.id === activePageId);
      const key = page?.stateValue || page?.id;
      if (!key) return;
      set((state) => ({ unlockedPages: [...new Set([...state.unlockedPages, key])] }));
      reportWarning(`«${page?.name ?? key}» è aperta alla modifica libera fino alla chiusura del progetto. Quello che cambi qui esce da quello che il template sa rifare.`);
    },
    async readAffordanceItems(affordance) {
      try {
        const { list } = await affordanceList(affordance);
        return list.items.filter((item) => matchesFilter(item, affordance.data.filter));
      } catch (error) { reportError(error); return []; }
    },
    async readAffordanceReference(affordance, name) {
      const reference = affordance.references?.[name];
      const project = get().project;
      if (!reference || !project) return [];
      try {
        const source = await desktopBridge.readFile(joinProjectPath(project.root, reference.file));
        const { readDataList } = await import("../source-parser/dataList");
        return (readDataList(source, reference.list)?.items ?? []).flatMap((item) => {
          const id = item[reference.id];
          const label = item[reference.label];
          return typeof id === "string" ? [{ id, label: typeof label === "string" ? label : id }] : [];
        });
      } catch { return []; }
    },
    async addAffordanceItem(affordance, item) {
      try {
        if (!affordance.can.includes("add")) throw new Error("Questa pagina non permette di aggiungere elementi qui.");
        const { list } = await affordanceList(affordance);
        const mine = list.items.filter((candidate) => matchesFilter(candidate, affordance.data.filter));
        if (mine.some((candidate) => candidate.id === item.id)) throw new Error("Esiste già un elemento con questo nome su questa pagina.");
        await writeAffordanceItems(affordance, [...mine, item]);
        reportSuccess(`«${item.label ?? item.id}» aggiunto. Indica la posizione sulla foto per vederlo comparire.`);
      } catch (error) { reportError(error); }
    },
    async updateAffordanceItem(affordance, itemId, path, value) {
      try {
        const { list } = await affordanceList(affordance);
        const mine = list.items.filter((candidate) => matchesFilter(candidate, affordance.data.filter));
        if (!mine.some((candidate) => candidate.id === itemId)) throw new Error("Questo elemento non c'è più: aggiorna l'anteprima.");
        await writeAffordanceItems(affordance, mine.map((candidate) => candidate.id === itemId
          ? withFieldValue(candidate, path, value) as DataItem : candidate));
      } catch (error) { reportError(error); }
    },
    async removeAffordanceItem(affordance, itemId) {
      try {
        if (!affordance.can.includes("remove")) throw new Error("Questa pagina non permette di togliere elementi qui.");
        const { list } = await affordanceList(affordance);
        const mine = list.items.filter((candidate) => matchesFilter(candidate, affordance.data.filter));
        await writeAffordanceItems(affordance, mine.filter((candidate) => candidate.id !== itemId));
        reportSuccess("Elemento rimosso da questa pagina.");
      } catch (error) { reportError(error); }
    },
    beginZonePicking: (affordanceId, itemId, field, mode) => set({ zonePicking: { affordanceId, itemId, field, mode, points: [] } }),
    cancelZonePicking: () => set({ zonePicking: undefined }),
    /** One click on the picture. A position is written straight away; a contorno collects its corners
     * until the user says it is finished. */
    async addPickedPoint(x, y) {
      const picking = get().zonePicking;
      if (!picking) return;
      const affordance = get().activeAffordances().find((item) => item.id === picking.affordanceId);
      if (!affordance) { set({ zonePicking: undefined }); return; }
      const point = { x: Math.round(x), y: Math.round(y) };
      if (picking.mode === "point") {
        set({ zonePicking: undefined });
        await get().updateAffordanceItem(affordance, picking.itemId, picking.field, point);
        return;
      }
      set({ zonePicking: { ...picking, points: [...picking.points, point] } });
    },
    async finishZonePicking() {
      const picking = get().zonePicking;
      set({ zonePicking: undefined });
      if (!picking || picking.mode !== "path" || picking.points.length < 2) return;
      const affordance = get().activeAffordances().find((item) => item.id === picking.affordanceId);
      if (!affordance) return;
      const items = await get().readAffordanceItems(affordance);
      const closed = items.find((item) => item.id === picking.itemId)?.style === "area";
      const [first, ...rest] = picking.points;
      const path = `M${first.x} ${first.y}${rest.map((point) => ` L${point.x} ${point.y}`).join("")}${closed ? " Z" : ""}`;
      await get().updateAffordanceItem(affordance, picking.itemId, picking.field, path);
      reportSuccess("Contorno disegnato. Trascina gli angoli sull'anteprima per correggerlo.");
    },
    async refreshUserAccess() {
      const config = await readUserAccessConfig();
      if (config) set({ userAccessConfig: config });
      return config;
    },
    async openUserAccess() {
      if (!get().project) return;
      set({ userAccessOpen: true, userAccessBusy: true });
      try {
        const { defaultUserAccessConfig } = await import("../core/userAccess");
        set({ userAccessConfig: await readUserAccessConfig() ?? get().userAccessConfig ?? defaultUserAccessConfig });
      } catch (error) { reportError(error); }
      finally { set({ userAccessBusy: false }); }
    },
    closeUserAccess: () => set({ userAccessOpen: false }),
    /** Saving writes the whole runtime again: the accounts live inside the file the panel loads, so
     * there is nothing else to keep in step. */
    async saveUserAccess(config) {
      if (!get().project) return;
      set({ userAccessBusy: true });
      try {
        const { normalizeUserAccessConfig } = await import("../core/userAccess");
        const normalized = normalizeUserAccessConfig(config);
        await writeUserAccessRuntime(normalized);
        reportSuccess(`Accessi salvati: ${normalized.accounts.length} account e ${normalized.permissions.length} permessi. Ricarica l’anteprima per provarli.`);
      } catch (error) { reportError(error); }
      finally { set({ userAccessBusy: false }); }
    },
    async removeUserAccess() {
      const { document, selectedId } = get();
      if (!document || !selectedId) return;
      const current = selectionEditCurrent();
      try {
        const node = document.nodes[selectedId];
        const { removeStaticAttributes } = await import("../source-parser/transformSource");
        if (!current()) return;
        if (!await applySource(removeStaticAttributes(document.source, node.source.start, node.source.end, [
          "data-fc-user-access", "data-fc-user-name", "data-fc-user-role", "data-fc-user-pin", "data-fc-user-logged-out",
        ]), true, document, current)) return;
        reportSuccess("Accesso utente rimosso da questo elemento. Il componente pronto resta disponibile per gli altri pulsanti.");
      } catch (error) { reportError(error); }
    },
    async updateAttribute(name, value) {
      const { document, selectedId } = get(); if (!document || !selectedId) return;
      const current = selectionEditCurrent();
      try {
        const node = document.nodes[selectedId];
        const { count, index, isolate } = repetition();
        const { updateStaticAttributes, updateStaticAttributesForInstance } = await import("../source-parser/transformSource");
        if (!current()) return;
        if (!await applySource(isolate
          ? updateStaticAttributesForInstance(document.source, node.source.start, node.source.end, { [name]: value }, index!)
          : updateStaticAttributes(document.source, node.source.start, node.source.end, { [name]: value }), true, document, current)) return;
        reportSuccess(`${name} aggiornato su ${scopeNote(node.type, count, index)}.`);
      } catch (error) { reportError(error); }
    },
    async updateText(value) {
      const { document, selectedId } = get(); if (!document || !selectedId) return false;
      const current = selectionEditCurrent();
      try {
        const node = document.nodes[selectedId];
        const { count, index, isolate } = repetition();
        // A row of a list shows a value that lives in the data. Writing there keeps the JSX clean and
        // is what the user meant: renaming the third card renames that card, everywhere it appears.
        const binding = isolate ? await currentListBinding() : undefined;
        if (!current()) return false;
        const property = binding?.textProperty
          ? binding.item?.properties.find((item) => item.name === binding.textProperty && item.kind === "text")
          : undefined;
        if (binding && property) {
          const { replaceSourceRange } = await import("../source-parser/transformSource");
          if (!current()) return false;
          if (!await applyToFile(binding.file, replaceSourceRange(binding.source, property.start, property.end, JSON.stringify(value)), current, binding.source)) return false;
          reportSuccess(`Testo della voce ${binding.index + 1} di «${binding.name}» aggiornato in ${fileName(binding.file)}${binding.shared ? " (file condiviso)" : ""}.`);
          return true;
        }
        const { updateStaticText, updateStaticTextForInstance } = await import("../source-parser/transformSource");
        if (!current()) return false;
        if (!await applySource(isolate
          ? updateStaticTextForInstance(document.source, node.source.start, node.source.end, value, index!)
          : updateStaticText(document.source, node.source.start, node.source.end, value), true, document, current)) return false;
        reportSuccess(`Testo aggiornato su ${scopeNote(node.type, count, index)}.`);
        return true;
      }
      catch (error) { reportError(error); return false; }
    },

    async removeAttribute(name) {
      const { document, selectedId } = get(); if (!document || !selectedId) return;
      const current = selectionEditCurrent();
      try {
        const node = document.nodes[selectedId];
        const { removeStaticAttributes } = await import("../source-parser/transformSource");
        if (!current()) return;
        if (!await applySource(removeStaticAttributes(document.source, node.source.start, node.source.end, [name]), true, document, current)) return;
        reportSuccess(`${name} rimosso da <${node.type}>.`);
      } catch (error) { reportError(error); }
    },

    /** Wires the element to a PLC signal. The binding lives in the source as the attribute the panels
     * already read at runtime; the catalog only describes the signal. */
    async bindPlcVariable(name) {
      const tag = name.trim();
      if (!tag) return;
      await get().updateAttribute("data-plc-variable", tag);
      if (!get().plcVariables.some((variable) => variable.name === tag)) {
        reportWarning(`«${tag}» non è nel catalogo PLC: aggiungilo per descriverne tipo e indirizzo.`);
      }
    },

    async refreshPlcVariables() {
      const project = get().project;
      if (!project) return;
      const plcVariables = await readPlcCatalog(project.root);
      if (get().project === project) set({ plcVariables });
    },

    async refreshResourceCatalog() {
      const project = get().project;
      if (!project) return;
      const resourceCatalog = await readResourceCatalog(project.root);
      if (get().project === project) set({ resourceCatalog });
    },

    async refreshScriptCatalog() {
      const project = get().project;
      if (!project) return;
      const scriptCatalog = await readScriptCatalog(project.root);
      if (get().project === project) set({ scriptCatalog });
    },

    async refreshFaceplateCatalog() {
      const project = get().project;
      if (!project) return;
      const faceplateCatalog = await readFaceplateCatalog(project.root);
      if (get().project === project) set({ faceplateCatalog });
    },

    async refreshDataLogCatalog() {
      const project = get().project;
      if (!project) return;
      const dataLogCatalog = await readDataLogCatalog(project.root);
      if (get().project === project) set({ dataLogCatalog });
    },

    setResourceLanguage(language) {
      set((state) => state.resourceCatalog.languages.includes(language)
        ? { resourceCatalog: { ...state.resourceCatalog, activeLanguage: language } }
        : {});
    },

    /** Writes one row per matching signal into the array the table is drawn from. The rows a
     * template ships with are examples: what the panel needs is the signals this machine has. */
    async fillListFromPlcVariables(filter) {
      try {
        const binding = await currentListBinding();
        if (!binding?.item) throw new Error("Seleziona una riga della tabella: l'editor deve sapere quale lista riempire.");
        const keys = [...new Set(binding.item.properties.map((property) => property.name).filter((name) => !name.includes(".")))];
        if (!keys.length) throw new Error("Questa riga non ha valori semplici da riempire: aprila nel codice.");
        const { listRowsFromVariables, plcVariablesMatching } = await import("../core/tagImport");
        const matching = plcVariablesMatching(get().plcVariables, filter);
        if (!matching.length) throw new Error(`Nessuna variabile del catalogo contiene «${filter}». Importa il file delle variabili o cambia il filtro.`);
        const { replaceListItems } = await import("../source-parser/listData");
        const next = replaceListItems(binding.source, binding.arrayStart, binding.arrayEnd, listRowsFromVariables(matching, keys));
        await applyToFile(binding.file, next);
        reportSuccess(`${matching.length} variabili con «${filter}» scritte in «${binding.name}» (${fileName(binding.file)})${binding.shared ? " · file condiviso: vale per tutti i pannelli" : ""}. Ctrl+Z annulla.`);
      } catch (error) { reportError(error); }
    },

    /** Adds a signal to framecraft.plc.json, which is where type, address and description live. */
    async addPlcVariable(name) {
      const tag = name.trim();
      const project = get().project;
      if (!tag || !project) return;
      try {
        if (get().plcVariables.some((variable) => variable.name === tag)) return;
        const { serializePlcCatalog } = await import("../core/plcVariables");
        const next = [...get().plcVariables, { name: tag, dataType: "", access: "read" as const, address: "", description: "" }]
          .sort((left, right) => left.name.localeCompare(right.name));
        if (desktopAvailable) await desktopBridge.writeFile(joinProjectPath(project.root, "framecraft.plc.json"), serializePlcCatalog(next));
        set({ plcVariables: next });
        reportSuccess(`«${tag}» aggiunta al catalogo PLC. Completa tipo e indirizzo dal pannello Variabili PLC.`);
      } catch (error) { reportError(error); }
    },

    /** Changes one value of the data row: the label of a card, the id of a machine part. */
    async updateListItemProperty(property, value) {
      const current = selectionEditCurrent();
      try {
        const binding = await currentListBinding();
        if (!current()) return false;
        const target = binding?.item?.properties.find((item) => item.name === property);
        if (!binding || !target) throw new Error("Questa voce non e' piu' raggiungibile: riseleziona l'elemento.");
        if (target.kind === "number" && !Number.isFinite(Number(value))) throw new Error(`Il valore ${value} non e' un numero.`);
        const literal = target.kind === "boolean" ? (value === "true" ? "true" : "false")
          : target.kind === "number" ? String(Number(value))
            : JSON.stringify(value);
        const { replaceSourceRange } = await import("../source-parser/transformSource");
        if (!current()) return false;
        if (!await applyToFile(binding.file, replaceSourceRange(binding.source, target.start, target.end, literal), current, binding.source)) return false;
        reportSuccess(`${property} della voce ${binding.index + 1} di «${binding.name}» aggiornato in ${fileName(binding.file)}${binding.shared ? " (file condiviso: vale per tutti i pannelli)" : ""}.`);
        return true;
      } catch (error) { reportError(error); return false; }
    },

    /** Copies a chosen image into the working project before changing the selected image. Relative
     * project URLs keep working after export, unlike a direct path into the user's Downloads folder. */
    async chooseImage(listProperty) {
      try {
        const source = await desktopBridge.chooseImage();
        if (!source) return;
        const projectUrl = await desktopBridge.importProjectAsset(source);
        if (listProperty) await get().updateListItemProperty(listProperty, projectUrl);
        else await get().updateAttribute("src", projectUrl);
      } catch (error) { reportError(error); }
    },

    async setListItemHighlight(highlight) {
      try {
        const binding = await currentListBinding();
        if (!binding) throw new Error("Questo elemento non arriva da una lista di dati modificabile.");
        const { setListItemHighlight } = await import("../source-parser/listData");
        const next = setListItemHighlight(binding.source, binding.arrayStart, binding.arrayEnd, binding.index, highlight);
        await applyToFile(binding.file, next);
        reportSuccess(highlight
          ? `Evidenziazione creata per la sola voce ${binding.index + 1} di «${binding.name}».`
          : `Evidenziazione rimossa dalla sola voce ${binding.index + 1} di «${binding.name}».`);
      } catch (error) { reportError(error); }
    },

    /** Removes the data row itself, so every list built from that array loses it. */
    async removeListItem() {
      try {
        const binding = await currentListBinding();
        if (!binding) throw new Error("Questo elemento non arriva da una lista di dati modificabile.");
        const { removeListItem } = await import("../source-parser/listData");
        await applyToFile(binding.file, removeListItem(binding.source, binding.arrayStart, binding.arrayEnd, binding.index));
        set({ listBinding: undefined });
        reportSuccess(`Voce ${binding.index + 1} rimossa da «${binding.name}» (${fileName(binding.file)}): sparisce ovunque quella lista venga usata. Ctrl+Z per annullare.`);
      } catch (error) { reportError(error); }
    },

    async duplicateListItem() {
      try {
        const binding = await currentListBinding();
        if (!binding) throw new Error("Questo elemento non arriva da una lista di dati modificabile.");
        const { duplicateListItem } = await import("../source-parser/listData");
        await applyToFile(binding.file, duplicateListItem(binding.source, binding.arrayStart, binding.arrayEnd, binding.index));
        reportSuccess(`Voce ${binding.index + 1} duplicata in «${binding.name}» (${fileName(binding.file)}). Modificala dai campi della voce.`);
      } catch (error) { reportError(error); }
    },
    async updateStyle(property, value) {
      await get().updateStyles({ [property]: value });
    },
    async updateStyles(values, renderedStyles) {
      const { document, selectedId, unresolvedSelection } = get();
      if (!document || !selectedId) {
        if (unresolvedSelection) reportWarning(`Non posso modificare questo elemento: ${fileName(unresolvedSelection.file)} non è agganciato a un sorgente modificabile.`);
        return false;
      }
      const current = selectionEditCurrent();
      try {
        const node = document.nodes[selectedId];
        values = elementTransformStyles(values, { ...(renderedStyles ?? get().selectionStyles), ...node.styles });
        const { count, index, isolate } = repetition();
        const { updateInlineStyles, updateInlineStylesForInstance } = await import("../source-parser/transformSource");
        if (!current()) return false;
        const nextSource = isolate
          ? updateInlineStylesForInstance(document.source, node.source.start, node.source.end, values, index!)
          : updateInlineStyles(document.source, node.source.start, node.source.end, values);
        const parsed = await applySource(nextSource, true, document, current);
        if (!parsed) return false;
        set((state) => ({
          ...(current(parsed) && state.selectedId === Object.values(parsed.nodes).find((item) => item.source.start === node.source.start && item.type === node.type)?.id
            ? { selectionStyles: { ...state.selectionStyles, ...Object.fromEntries(Object.entries(values).map(([name, value]) => [name, String(value)])) } } : {}),
          consoleEntries: [...state.consoleEntries, entry("success", `Proprietà aggiornate su ${scopeNote(node.type, count, index)}.`)],
        }));
        return current(parsed);
      }
      catch (error) { reportError(error); return false; }
    },
    async insertComponent(jsx, placement) {
      try {
        let document = get().document;
        let anchorId = get().selectedId;
        // A component is dropped on what the page shows, which is regularly rendered by a different
        // file than the one open in the editor. Inserting into the open file instead would write the
        // element somewhere the user is not looking, which reads exactly like nothing happening.
        if (placement && (!document || document.file !== placement.source.file)) {
          const opened = await readDocument(placement.source.file);
          if (!opened.document || opened.reason) {
            throw new Error(`Non posso inserire in ${fileName(placement.source.file)}: apri il file in modalità Code e correggilo, poi riprova.`);
          }
          document = opened.document;
          anchorId = undefined;
          set({ document, selectedId: undefined, selectionRect: undefined, selectionStyles: {}, unresolvedSelection: undefined, dirty: false });
        }
        if (!document) throw new Error("Apri una pagina prima di aggiungere componenti.");
        const placementNode = placement
          ? Object.values(document.nodes).find((node) => node.source.start === placement.source.start && node.source.end === placement.source.end)
          : undefined;
        const node = insertionTarget(document, placementNode?.id ?? anchorId);
        if (!node) {
          throw new Error(`${fileName(document.file)} non contiene un contenitore HTML in cui inserire (un disegno SVG non può ospitare un componente). Trascina il componente sul punto della pagina dove vuoi metterlo.`);
        }
        const current = selectionEditCurrent();
        const { insertElement, insertElementAtPosition } = await import("../source-parser/transformSource");
        if (!current()) return;
        const prepared = prepareProjectComponent(document.source, document.file, jsx);
        const sourceWithElement = placement && placementNode
          ? insertElementAtPosition(document.source, node.source.start, node.source.end, prepared.jsx, placement.x, placement.y, placement.positionContainer)
          : insertElement(document.source, node.source.start, node.source.end, prepared.jsx);
        const source = prepared.addImport(sourceWithElement);
        const importShift = source.length - sourceWithElement.length;
        const parsed = await applySource(source, true, document, current);
        if (!parsed) return;
        // Both transforms append the new element as the container's last child, so selecting it is
        // cheap — and it is the only proof the user gets that the insert landed where they meant.
        const container = parsed && Object.values(parsed.nodes).find((item) => item.source.start === node.source.start + importShift && item.type === node.type);
        const inserted = container?.children.map((id) => parsed!.nodes[id]).at(-1);
        if (inserted && current(parsed)) set({ selectedId: inserted.id, unresolvedSelection: undefined });
        set((state) => ({ consoleEntries: [...state.consoleEntries,
          entry("success", `Componente inserito in ${fileName(document!.file)} dentro <${node.type}>${inserted ? ` alla riga ${inserted.source.line}` : ""}.`)] }));
      }
      catch (error) { reportError(error); }
    },
    async deleteSelection() {
      const { document, selectedId, unresolvedSelection } = get();
      if (!document || !selectedId) {
        // Silence here is what makes the Delete key feel broken: the user did select something, the
        // editor just could not tie it back to a line of source.
        if (unresolvedSelection) reportWarning(`Non riesco a eliminare questo elemento: non è agganciato al sorgente di ${fileName(unresolvedSelection.file)}. Aggiorna l'anteprima e riseleziona.`);
        else reportWarning("Canc elimina l'elemento selezionato: clicca prima l'elemento nel canvas.");
        return;
      }
      const current = selectionEditCurrent();
      const node = document.nodes[selectedId];
      if (!node.capabilities.remove) {
        set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("warning", "Il contenitore principale della pagina non può essere eliminato. Seleziona un elemento al suo interno.")] }));
        return;
      }
      const { count, index, isolate } = repetition();
      try {
        const { deleteElement, deleteElementInstance } = await import("../source-parser/transformSource");
        if (!current()) return;
        // Cutting the element out of a list is what wiped every row at once: the removal left the
        // callback empty, the fallback turned the whole body into null, and the list rendered nothing.
        if (isolate) {
          const parsed = await applySource(deleteElementInstance(document.source, node.source.start, node.source.end, index!), true, document, current);
          if (!parsed) return;
          if (current(parsed)) set({ selectedId: undefined, selectionRect: undefined, selectionStyles: {}, unresolvedSelection: undefined });
          reportSuccess(`Eliminata solo la copia #${index! + 1} di <${node.type}>: le altre ${count - 1} restano. Ctrl+Z per annullare.`);
          return;
        }
        const deletion = deleteElement(document.source, node.source.start, node.source.end);
        const parsed = await applySource(deletion.source, true, document, current);
        if (!parsed) return;
        set((state) => ({ ...(current(parsed) ? { selectedId: undefined, selectionRect: undefined, selectionStyles: {}, unresolvedSelection: undefined } : {}),
          consoleEntries: [...state.consoleEntries, entry("success", deletion.emptied
            ? `<${node.type}> era il contenuto di un'espressione (una lista o una condizione): resta il blocco ma non genera più niente. Ctrl+Z per annullare.`
            : count > 1
              ? `Eliminate tutte le ${count} copie di <${node.type}> da ${fileName(document.file)}. Ctrl+Z per annullare.`
              : `<${node.type}> eliminato da ${fileName(document.file)}. Ctrl+Z per annullare.`)] }));
      } catch (error) { reportError(error); }
    },
    async duplicateSelection() {
      const { document, selectedId } = get(); if (!document || !selectedId) return; const node = document.nodes[selectedId]; if (!node.capabilities.remove) return;
      const current = selectionEditCurrent();
      try { const { duplicateElement } = await import("../source-parser/transformSource"); if (current()) await applySource(duplicateElement(document.source, node.source.start, node.source.end), true, document, current); } catch (error) { reportError(error); }
    },
    async moveSelection(direction) {
      const { document, selectedId } = get(); if (!document || !selectedId) return; const node = document.nodes[selectedId]; if (!node.capabilities.reorder) return;
      const current = selectionEditCurrent();
      try { const { reorderElement } = await import("../source-parser/transformSource"); if (current()) await applySource(reorderElement(document.source, node.source.start, node.source.end, direction), true, document, current); } catch (error) { reportError(error); }
    },
    replaceCode: (source) => { const document = get().document; if (document) set({ document: { ...document, source }, dirty: true }); },
    async save() {
      const { document, dirty } = get(); if (!document || !desktopAvailable) return;
      try {
        const previousSource = document.source;
        const diskSource = dirty ? await desktopBridge.readFile(document.file) : previousSource;
        const { parseSource } = await import("../source-parser/parseSource");
        let parsed;
        try {
          parsed = parseSource(document.file, document.source, document.version + 1);
        } catch (error) {
          // A broken buffer from the code view must not reach the disk, and the user needs to be told
          // which file is broken rather than being handed a bare parser message.
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`${fileName(document.file)} contiene un errore di sintassi (${detail}), quindi non è stato salvato. Correggilo in modalità Code.`);
        }
        await desktopBridge.writeFile(document.file, document.source);
        set((state) => ({ document: parsed, dirty: false,
          history: diskSource !== previousSource ? [...state.history, { file: document.file, source: diskSource }].slice(-100) : state.history,
          future: diskSource !== previousSource ? [] : state.future,
          consoleEntries: [...state.consoleEntries, entry("success", `Salvato ${document.file}`)] }));
      }
      catch (error) { reportError(error); }
    },
    /** Quello che il pannello dice di se' prima di uscire da Framecraft: si legge tutto il progetto,
     * non solo la pagina aperta, perche' un numero doppio o un pulsante orfano si vedono solo
     * mettendo le pagine una accanto all'altra. Non blocca niente: elenca, e chi guarda decide. */
    async checkHmiProject() {
      const { project, plcVariables, resourceCatalog, scriptCatalog, faceplateCatalog, dataLogCatalog, pages } = get();
      if (!project) return [];
      try {
        const { readProjectSources } = await import("../core/projectIndex");
        const { describeHmiIssues, validateHmiProject } = await import("../core/hmiValidation");
        const listed = desktopAvailable && typeof desktopBridge.listProjectSourceFiles === "function"
          ? await desktopBridge.listProjectSourceFiles()
          : projectFilePaths(project.files);
        const sources = await readProjectSources(listed, (file) => desktopBridge.readFile(file), 1200);
        // Le route si passano solo se il router e' stato letto davvero: senza, la navigazione non
        // si controlla, invece di accusare pulsanti giusti.
        const issues = validateHmiProject({ sources, variables: plcVariables, resources: resourceCatalog, scripts: scriptCatalog, faceplates: faceplateCatalog, dataLogs: dataLogCatalog,
          routes: pages.length ? pages.map((page) => page.route) : undefined,
          pageRoutes: Object.fromEntries(pages.map((page) => [page.file, page.route])) });
        const errors = issues.filter((issue) => issue.severity === "error");
        // In console vanno gli errori uno per uno; gli avvisi sono centinaia in un pannello appena
        // nato — quelli si contano e basta, la lista intera sta nel pannello PLC.
        set((state) => ({
          hmiIssues: issues,
          consoleOpen: issues.length > 0,
          consoleEntries: [...state.consoleEntries,
            entry(errors.length ? "error" : "success", describeHmiIssues(issues)),
            ...errors.slice(0, 50).map((issue) => entry("error", issue.message)),
          ].slice(-300),
        }));
        return issues;
      } catch (error) { reportError(error); return []; }
    },
    /** The working copy is hidden beside the original, so exporting it is the only way the user's
     * edits ever leave Framecraft. The copy is always written to a fresh folder: nothing is
     * overwritten, so a wrong click can never destroy an existing project. */
    async saveProjectAs() {
      const { project, exporting } = get();
      if (!project || exporting) return;
      if (!desktopAvailable) { reportError(new Error("Apri Framecraft come app desktop per salvare il progetto su disco.")); return; }
      try {
        const destination = await desktopBridge.chooseExportDirectory();
        if (!destination) return;
        set({ exporting: true });
        await get().save();
        await get().checkHmiProject();
        const result = await desktopBridge.exportProject(destination);
        for (const warning of result.warnings ?? []) reportWarning(warning);
        set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("success", `Progetto salvato in ${result.root}`)] }));
      } catch (error) { reportError(error); }
      finally { set({ exporting: false }); }
    },
    async undo() {
      const { document, history, future } = get();
      const project = get().project;
      const previous = history.at(-1);
      if (!document || !previous) return;
      try {
        if (!await restoreSnapshot(previous)) return;
        if (get().project !== project || get().history !== history || get().future !== future) return;
        set((state) => ({ history: history.slice(0, -1), future: [{ file: document.file, source: document.source }, ...future],
          consoleEntries: [...state.consoleEntries, entry("success", "Azione annullata.")] }));
      } catch (error) { reportError(error); }
    },
    async redo() {
      const { document, history, future } = get();
      const project = get().project;
      const next = future[0];
      if (!document || !next) return;
      try {
        if (!await restoreSnapshot(next)) return;
        if (get().project !== project || get().history !== history || get().future !== future) return;
        set((state) => ({ future: future.slice(1), history: [...history, { file: document.file, source: document.source }].slice(-100),
          consoleEntries: [...state.consoleEntries, entry("success", "Azione ripristinata.")] }));
      } catch (error) { reportError(error); }
    },
    refreshPreview() {
      if (get().loading || get().previewRestarting || !get().project) return;
      runtime.selectionSequence++;
      const url = get().previewUrl;
      if (!url) { void get().restartPreview(); return; }
      const refreshed = new URL(url);
      refreshed.searchParams.set("framecraft", `${Date.now()}-${++runtime.previewRefreshSequence}`);
      set({ previewUrl: refreshed.toString(), previewStatus: "starting", previewError: undefined });
    },
    // Restarting the dev server must not re-open the project: the open document, history and selection stay.
    async restartPreview(force = false) {
      const project = get().project;
      if (!project || get().loading || get().previewRestarting) return;
      runtime.selectionSequence++;
      const sessionId = crypto.randomUUID();
      set((state) => ({ previewUrl: undefined, previewStatus: "starting", previewError: undefined, previewRestarting: true,
        previewSessionId: sessionId, previewProcessExited: false,
        consoleEntries: [...state.consoleEntries, entry("info", force ? "Riavvio Vite con ricostruzione della cache delle dipendenze…" : "Riavvio Vite…")] }));
      const task = (async () => {
        try {
          await desktopBridge.stopPreview();
          if (get().project?.root !== project.root || get().previewSessionId !== sessionId) return;
          const preview = await desktopBridge.startPreview(project.root, force, sessionId, get().handlePreviewExit);
          if (get().project?.root !== project.root || get().previewSessionId !== sessionId || get().previewProcessExited) return;
          set((state) => ({ previewUrl: preview.url, previewStatus: "starting", externalRoots: preview.sourceRoots ?? [],
            consoleEntries: [...state.consoleEntries, entry("success", `Preview riavviata su ${preview.url}${force ? " · cache ricostruita" : ""}`)] }));
        } catch (error) {
          if (get().project?.root !== project.root || get().previewSessionId !== sessionId || get().previewProcessExited) return;
          set({ previewStatus: "error", previewError: error instanceof Error ? error.message : String(error) });
          reportError(error);
        } finally {
          if (get().previewSessionId === sessionId || (!get().previewSessionId && get().project?.root === project.root)) set({ previewRestarting: false });
        }
      })();
      runtime.previewRestartTask = task;
      try { await task; } finally { if (runtime.previewRestartTask === task) runtime.previewRestartTask = undefined; }
    },
    async cancelPreviewStartup() {
      const { project, previewSessionId, loading, previewRestarting } = get();
      if (!project || !previewSessionId || (!loading && !previewRestarting)) return;
      set((state) => ({ previewSessionId: undefined, previewUrl: undefined, previewProcessExited: true,
        previewStatus: "error", previewError: "Avvio Vite interrotto. Puoi riprovare senza riaprire il progetto.",
        consoleEntries: [...state.consoleEntries, entry("info", "Avvio Vite interrotto dall'utente.", "preview")].slice(-300) }));
      try { await desktopBridge.stopPreview(); }
      catch (error) { if (get().project === project && !get().previewSessionId) reportError(error); }
      finally { if (get().project === project && !get().previewSessionId) set({ loading: false, previewRestarting: false }); }
    },
    async openStandalonePreview() {
      const { previewUrl } = get();
      if (!previewUrl) return;
      set({ standalonePreviewOpen: true });
    },
    closeStandalonePreview: () => set({ standalonePreviewOpen: false }),
    async handleExternalFileChange(path) {
      const document = get().document; if (!document || document.file !== path) return;
      const project = get().project;
      const current = () => get().project === project && get().document === document;
      try {
        const source = await desktopBridge.readFile(path); if (!current() || source === document.source) return;
        if (get().dirty) { set((state) => ({ consoleOpen: true, consoleEntries: [...state.consoleEntries, entry("warning", `Modifica esterna ignorata: ${path} contiene modifiche non salvate.`)] })); return; }
        const { parseSource } = await import("../source-parser/parseSource");
        if (current()) set({ document: parseSource(path, source, document.version + 1), selectedId: undefined });
      } catch (error) { if (current()) reportError(error); }
    },
  };
};

const previousStore = hotData?.store;
export const useEditorStore = previousStore ?? create<EditorState>(createEditorState);
if (previousStore) {
  const refreshed = createEditorState(previousStore.setState, previousStore.getState, previousStore);
  const data = Object.fromEntries(Object.entries(previousStore.getState()).filter(([, value]) => typeof value !== "function"));
  previousStore.setState({ ...refreshed, ...data } as EditorState, true);
}
if (hotData) hotData.store = useEditorStore;
if (import.meta.hot && hotData) {
  installEditorReloadRecovery(useEditorStore, import.meta.hot);
  if (!previousStore) {
    const reloadRecovery = readEditorReloadCheckpoint();
    if (reloadRecovery) {
      useEditorStore.setState({ reloadRecovery });
      if (reloadRecovery.status === "checking") hotData!.recoveryTask = useEditorStore.getState().retryReloadRecovery();
    }
  }
}
