export type ViewMode = "visual" | "code" | "split";
export type Viewport = "panel-1920" | "panel-1280" | "panel-1024" | "panel-800" | "libero";
export type InteractionMode = "navigate" | "edit";
export type PreviewStatus = "idle" | "starting" | "ready" | "error";

export interface SourceRef {
  file: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One element of a group the user is working on at once. It carries everything an alignment needs
 * to be worked out and then written: where the element is now, and the nudge already on it. */
export interface SelectionItem {
  source: SourceRef;
  instanceId: string;
  info?: RenderedInfo;
  rect: SelectionRect;
  translate: { x: number; y: number };
  /** Rendered values shared with the group Inspector. A missing value means the preview was built by
   * an older bridge, not that the property should be cleared. */
  styles?: Record<string, string>;
}

export interface ElementGeometry {
  display: string;
  translate: string;
  scale: string;
  cssWidth: number;
  cssHeight: number;
}

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type TransformOperation = "move" | ResizeHandle;

export interface NodeCapabilities {
  text: boolean;
  style: boolean;
  insert: boolean;
  remove: boolean;
  reorder: boolean;
}

export interface EditorNode {
  id: string;
  type: string;
  label: string;
  source: SourceRef;
  parentId?: string;
  children: string[];
  props: Record<string, string | number | boolean>;
  /** Attribute names whose value is an expression, so they are listed but not editable visually. */
  dynamicProps: string[];
  styles: Record<string, string | number>;
  text?: string;
  dynamic: boolean;
  capabilities: NodeCapabilities;
}

export interface EditorDocument {
  file: string;
  source: string;
  nodes: Record<string, EditorNode>;
  roots: string[];
  version: number;
}

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileEntry[];
}

export interface ProjectAnalysis {
  root: string;
  originalRoot?: string;
  workspaceRoot?: string;
  isWorkingCopy?: boolean;
  name: string;
  framework: "vite" | "next" | "react" | "unknown";
  language: "typescript" | "javascript";
  packageManager: "npm" | "pnpm" | "yarn";
  entryFiles: string[];
  files: FileEntry[];
  scripts: Record<string, string>;
  dependencies: string[];
  hasNodeModules: boolean;
  /** Declared dependencies whose package manifest cannot be resolved in node_modules. */
  missingDependencies: string[];
}

export interface WorkingCopyResult {
  root: string;
  originalRoot?: string;
  workspaceRoot: string;
  created: boolean;
  /** Files the copy had to skip: the project still opens, but the user is told what is missing. */
  warnings?: string[];
}

export interface PreviewSession {
  sessionId: string;
  url: string;
  port: number;
  /** Directories the project declares as source: everything the preview renders is editable. */
  sourceRoots?: string[];
}

export interface PreviewOutput {
  stream: string;
  line: string;
  sessionId: string;
}

export interface EditorNativeSession {
  project?: ProjectAnalysis | null;
  preview?: PreviewSession | null;
  externalRoots: string[];
  authorizedRoot?: string | null;
  generation: number;
}

export interface PreviewExit {
  sessionId: string;
  code: number | null;
  message: string;
}

export interface PageDefinition {
  id: string;
  name: string;
  route: string;
  file: string;
  routerFile?: string;
  componentName?: string;
  stateValue?: string;
}

export interface ConsoleEntry {
  id: string;
  level: "info" | "warning" | "error" | "success";
  source?: "editor" | "preview" | "hmi";
  message: string;
  time: string;
}

export interface ComponentPlacement {
  source: SourceRef;
  x: number;
  y: number;
  positionContainer: boolean;
}

/** What the running preview knows about an element, regardless of whether its source is reachable. */
export interface RenderedInfo {
  text?: string;
  plcTag?: string;
  id?: string;
  className?: string;
  /** Position among DOM elements emitted by the same JSX node. */
  instanceIndex?: number;
  instanceCount?: number;
  /** The app made this element ignore the mouse (pointer-events: none), so the canvas selects it for
   * inspection but never drags or resizes it. */
  locked?: boolean;
  /** Index of the item inside the list that renders this element, when it comes from one. Unlike the
   * position in the DOM it still points at the same item after a sibling copy is removed. */
  listIndex?: number;
}

export interface PreviewSelection {
  source: SourceRef;
  tag?: string;
  info?: RenderedInfo;
  instanceId: string;
  rect: SelectionRect;
  geometry: ElementGeometry;
  styles: Record<string, string>;
  selectionVersion?: number;
}

export type PreviewMessage =
  | (PreviewSelection & { type: "framecraft:select" })
  | (PreviewSelection & { type: "framecraft:selection-response"; requestId: number })
  | { type: "framecraft:inspect"; source: SourceRef; tag?: string; editText?: boolean }
  | { type: "framecraft:edit-text"; source: SourceRef; value: string }
  | { type: "framecraft:drop"; source: SourceRef; jsx: string; x: number; y: number; positionContainer: boolean }
  | { type: "framecraft:selection-rect"; source: SourceRef; instanceId: string; rect: SelectionRect }
  | { type: "framecraft:drag-move"; source: SourceRef; instanceId: string; rect: SelectionRect; selectionVersion?: number }
  | { type: "framecraft:drag-end"; source: SourceRef; instanceId: string; rect: SelectionRect; translate: string; selectionVersion?: number }
  /** A point of the drawing the editor asked the user to indicate, in that drawing's own units. */
  | { type: "framecraft:point-picked"; x: number; y: number }
  | { type: "framecraft:point-missed" }
  | { type: "framecraft:region-picked"; requestId: string; source: SourceRef; region: import("./highlightRegion").HighlightRegion }
  | { type: "framecraft:region-cancelled"; requestId: string }
  | { type: "framecraft:region-missed"; requestId: string; message: string }
  | { type: "framecraft:select-many"; items: SelectionItem[]; selectionVersion?: number }
  | { type: "framecraft:group-drag-move"; items: SelectionItem[] }
  | { type: "framecraft:group-drag-end"; items: SelectionItem[] }
  | { type: "framecraft:delete"; source: SourceRef; instanceId?: string; info?: RenderedInfo }
  | { type: "framecraft:highlight-anchor"; index: number; x: number; y: number; done: boolean }
  | { type: "framecraft:highlight-insert"; afterIndex: number; x: number; y: number }
  | { type: "framecraft:highlight-remove"; index: number }
  /** Gli oggetti della pagina che portano addosso una dinamizzazione, per la simulazione PLC. */
  | { type: "framecraft:dynamizations"; items: { instanceId: string; raw: string }[]; screenItems?: import("../../scripts/hmi-property-flashing.mjs").HmiScreenItemSnapshot[] }
  | { type: "framecraft:screen-items"; screenItems: import("../../scripts/hmi-property-flashing.mjs").HmiScreenItemSnapshot[] }
  /** Evento WinCC dichiarativo scattato nell'anteprima in modalità Usa pannello. */
  | { type: "framecraft:hmi-event"; instanceId: string; eventType: import("./hmiEvents").HmiEventType; raw: string; gesture?: import("./hmiEvents").HmiGesture; key?: string; command?: string; interfaceEvent?: string; faceplateInstanceId?: string; faceplateRaw?: string; screenItems?: import("../../scripts/hmi-property-flashing.mjs").HmiScreenItemSnapshot[] }
  /** Evento emesso dall'interno di un faceplate e collegato allo script della sua istanza. */
  | { type: "framecraft:faceplate-event"; instanceId: string; raw: string; eventName: string; parameters: Record<string, import("./hmiScript").HmiScriptScalar>; screenItems?: import("../../scripts/hmi-property-flashing.mjs").HmiScreenItemSnapshot[] }
  | { type: "framecraft:popup-user-close"; popupId: string }
  | { type: "framecraft:state-page"; value: string }
  | { type: "framecraft:ready"; path: string; selectionProtocol?: number; selectionVersion?: number; screenItems?: import("../../scripts/hmi-property-flashing.mjs").HmiScreenItemSnapshot[] }
  | { type: "framecraft:shortcut"; key: string; shift: boolean }
  | { type: "framecraft:resize"; width: number; height: number };

/** Where a "save as" copy of the working project landed, plus whatever the copy had to skip. */
export interface ExportResult {
  root: string;
  warnings?: string[];
}
