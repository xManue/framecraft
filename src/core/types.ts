export type ViewMode = "visual" | "code" | "split";
export type Viewport = "desktop" | "laptop" | "tablet" | "mobile";
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
  url: string;
  port: number;
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
  message: string;
  time: string;
}

export interface ComponentPlacement {
  source: SourceRef;
  x: number;
  y: number;
  positionContainer: boolean;
}

export type PreviewMessage =
  | { type: "framecraft:select"; source: SourceRef; tag?: string; instanceId: string; rect: SelectionRect; geometry: ElementGeometry; styles: Record<string, string> }
  | { type: "framecraft:inspect"; source: SourceRef; tag?: string }
  | { type: "framecraft:edit-text"; source: SourceRef; value: string }
  | { type: "framecraft:drop"; source: SourceRef; jsx: string; x: number; y: number; positionContainer: boolean }
  | { type: "framecraft:drag-move"; source: SourceRef; instanceId: string; rect: SelectionRect }
  | { type: "framecraft:drag-end"; source: SourceRef; instanceId: string; rect: SelectionRect; translate: string }
  | { type: "framecraft:delete"; source: SourceRef; instanceId?: string }
  | { type: "framecraft:state-page"; value: string }
  | { type: "framecraft:ready"; path: string }
  | { type: "framecraft:resize"; width: number; height: number };
