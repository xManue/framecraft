import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { EditorNativeSession, ExportResult, PreviewExit, ProjectAnalysis, PreviewSession, WorkingCopyResult } from "../core/types";
import type { GeneratedProjectFile } from "../core/standardProject";
import type { EditorDraftRecord, EditorReloadCheckpoint } from "../state/editorRecovery";
import type { ConnectionConfigurationSnapshot } from "../core/plcConnections";
import type { AlarmConfigurationSnapshot } from "../core/hmiAlarms";

export const desktopAvailable = isTauri();

function requireDesktop() {
  if (!desktopAvailable) throw new Error("Apri Framecraft come app desktop per accedere alle cartelle locali.");
}

export const desktopBridge = {
  async readAlarmConfiguration(root: string): Promise<AlarmConfigurationSnapshot> {
    requireDesktop(); return invoke("read_alarm_configuration", { root });
  },
  async saveAlarmConfiguration(root: string, expected: AlarmConfigurationSnapshot, source: string): Promise<AlarmConfigurationSnapshot> {
    requireDesktop(); return invoke("save_alarm_configuration", { root, expected, source });
  },
  async readConnectionConfiguration(root: string): Promise<ConnectionConfigurationSnapshot> {
    requireDesktop();
    return invoke("read_connection_configuration", { root });
  },
  async saveConnectionConfiguration(root: string, expected: ConnectionConfigurationSnapshot, next: { connections: string; runtime: string }): Promise<ConnectionConfigurationSnapshot> {
    requireDesktop();
    return invoke("save_connection_configuration", { root, expected, next });
  },
  async readEditorDraft(): Promise<EditorDraftRecord | null> {
    requireDesktop();
    return invoke("read_editor_draft");
  },
  async writeEditorDraft(checkpoint: EditorReloadCheckpoint): Promise<EditorDraftRecord> {
    requireDesktop();
    return invoke("write_editor_draft", { checkpoint });
  },
  async clearEditorDraft(record?: EditorDraftRecord): Promise<void> {
    requireDesktop();
    return invoke("clear_editor_draft", { id: record?.id ?? null, savedAt: record?.checkpoint.savedAt ?? null });
  },
  async getEditorSession(): Promise<EditorNativeSession> {
    requireDesktop();
    return invoke("get_editor_session");
  },
  async chooseDirectory(): Promise<string | null> {
    requireDesktop();
    const selected = await open({ directory: true, multiple: false, title: "Open React project" });
    return typeof selected === "string" ? selected : null;
  },
  async chooseExportDirectory(): Promise<string | null> {
    requireDesktop();
    const selected = await open({ directory: true, multiple: false, title: "Scegli dove salvare il progetto" });
    return typeof selected === "string" ? selected : null;
  },
  async chooseImage(): Promise<string | null> {
    requireDesktop();
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Scegli un'immagine",
      filters: [{ name: "Immagini", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"] }],
    });
    return typeof selected === "string" ? selected : null;
  },
  async importProjectAsset(source: string): Promise<string> {
    requireDesktop();
    return invoke("import_project_asset", { source });
  },
  async exportProject(destination: string): Promise<ExportResult> {
    requireDesktop();
    return invoke("export_project", { destination });
  },
  async analyzeProject(root: string): Promise<ProjectAnalysis> {
    requireDesktop();
    return invoke("analyze_project", { root });
  },
  async createWorkingCopy(root: string): Promise<WorkingCopyResult> {
    requireDesktop();
    return invoke("create_working_copy", { root });
  },
  async readFile(path: string): Promise<string> {
    requireDesktop();
    return invoke("read_text_file", { path });
  },
  async writeFile(path: string, content: string): Promise<void> {
    requireDesktop();
    await invoke("write_text_file", { path, content });
  },
  async createFile(relativePath: string, content: string): Promise<string> {
    requireDesktop();
    return invoke("create_project_file", { relativePath, content });
  },
  async listProjectSourceFiles(): Promise<string[]> {
    requireDesktop();
    return invoke("list_project_source_files");
  },
  async startPreview(root: string, force = false, sessionId: string = crypto.randomUUID(), onExit?: (exit: PreviewExit) => void): Promise<PreviewSession> {
    requireDesktop();
    const exitChannel = new Channel<PreviewExit>();
    exitChannel.onmessage = (exit) => onExit?.(exit);
    return invoke("start_preview", { root, force, sessionId, onExit: exitChannel });
  },
  async stopPreview(): Promise<void> {
    if (desktopAvailable) await invoke("stop_preview");
  },
  async closeProject(): Promise<void> {
    if (desktopAvailable) await invoke("close_project");
  },
  async createProject(root: string, files?: GeneratedProjectFile[]): Promise<ProjectAnalysis> {
    requireDesktop();
    return invoke("create_vite_project", { root, files: files ?? null });
  },
};
