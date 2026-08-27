import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectAnalysis, PreviewSession, WorkingCopyResult } from "../core/types";

export const desktopAvailable = isTauri();

function requireDesktop() {
  if (!desktopAvailable) throw new Error("Apri Framecraft come app desktop per accedere alle cartelle locali.");
}

export const desktopBridge = {
  async chooseDirectory(): Promise<string | null> {
    requireDesktop();
    const selected = await open({ directory: true, multiple: false, title: "Open React project" });
    return typeof selected === "string" ? selected : null;
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
  async startPreview(root: string): Promise<PreviewSession> {
    requireDesktop();
    return invoke("start_preview", { root });
  },
  async stopPreview(): Promise<void> {
    if (desktopAvailable) await invoke("stop_preview");
  },
  async closeProject(): Promise<void> {
    if (desktopAvailable) await invoke("close_project");
  },
  async createProject(root: string): Promise<ProjectAnalysis> {
    requireDesktop();
    return invoke("create_vite_project", { root });
  },
};
