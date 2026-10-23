import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { EditorNativeSession, ExportResult, PreviewExit, ProjectAnalysis, PreviewSession, WorkingCopyResult } from "../core/types";
import type { GeneratedProjectFile } from "../core/standardProject";
import type { EditorDraftRecord, EditorReloadCheckpoint } from "../state/editorRecovery";
import type { ConnectionConfigurationSnapshot } from "../core/plcConnections";
import type { AlarmConfigurationSnapshot } from "../core/hmiAlarms";
import type { AiInterviewDraftSnapshot } from "../ai/aiInterviewDraft";
import type { AiProjectChange } from "../ai/aiProjectEdits";
import type { RecipeConfigurationSnapshot } from "../core/recipeConfiguration";
import type { RecipePlcConfigurationSnapshot } from "../core/recipePlcConfiguration";
import type { RecipeApplyConfigurationSnapshot } from "../core/recipeApplyConfiguration";
import type { OperatorAccountsSnapshot, OperatorAdminCommand } from "../core/operatorAccounts";

export const desktopAvailable = isTauri();

function requireDesktop() {
  if (!desktopAvailable) throw new Error("Apri Framecraft come app desktop per accedere alle cartelle locali.");
}

export const desktopBridge = {
  async readRecipeApplyConfiguration(root: string): Promise<RecipeApplyConfigurationSnapshot> {
    requireDesktop(); return invoke("read_recipe_apply_configuration", { root });
  },
  async saveRecipeApplyConfiguration(root: string, expected: RecipeApplyConfigurationSnapshot, source: string): Promise<RecipeApplyConfigurationSnapshot> {
    requireDesktop(); return invoke("save_recipe_apply_configuration", { root, expected, source });
  },
  async readRecipePlcConfiguration(root: string): Promise<RecipePlcConfigurationSnapshot> {
    requireDesktop(); return invoke("read_recipe_plc_configuration", { root });
  },
  async saveRecipePlcConfiguration(root: string, expected: RecipePlcConfigurationSnapshot, source: string): Promise<RecipePlcConfigurationSnapshot> {
    requireDesktop(); return invoke("save_recipe_plc_configuration", { root, expected, source });
  },
  async readOperatorAccounts(root: string): Promise<OperatorAccountsSnapshot> { requireDesktop(); return invoke("read_operator_accounts", { root }); },
  async updateOperatorAccounts(root: string, expected: OperatorAccountsSnapshot, command: OperatorAdminCommand): Promise<OperatorAccountsSnapshot> { requireDesktop(); return invoke("update_operator_accounts", { root, generation: expected.generation, revision: expected.revision, command }); },
  async saveOperatorConfiguration(root: string, expected: OperatorAccountsSnapshot, source: string): Promise<void> {
    requireDesktop(); if (expected.configuration === null) throw new Error("AUTH_CONFIG");
    return invoke("save_operator_configuration", { root, generation: expected.generation, expected: expected.configuration, source });
  },
  async readRecipeConfiguration(root: string): Promise<RecipeConfigurationSnapshot> {
    requireDesktop(); return invoke("read_recipe_configuration", { root });
  },
  async saveRecipeConfiguration(root: string, expected: RecipeConfigurationSnapshot, source: string): Promise<RecipeConfigurationSnapshot> {
    requireDesktop(); return invoke("save_recipe_configuration", { root, expected, source });
  },
  async readAiProjectFile(root: string, path: string): Promise<string | null> {
    requireDesktop(); return invoke("read_ai_project_file", { root, path });
  },
  async applyAiProjectChanges(root: string, changes: AiProjectChange[]): Promise<string> {
    requireDesktop(); return invoke("apply_ai_project_changes", { root, changes });
  },
  async restoreAiProjectChanges(root: string, backup: string): Promise<void> {
    requireDesktop(); return invoke("restore_ai_project_changes", { root, backup });
  },
  async readAiInterviewDraft(): Promise<AiInterviewDraftSnapshot> {
    requireDesktop(); return invoke("read_ai_interview_draft");
  },
  async writeAiInterviewDraft(expectedRevision: string, source: string | null): Promise<AiInterviewDraftSnapshot> {
    requireDesktop(); return invoke("write_ai_interview_draft", { expectedRevision, source });
  },
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
