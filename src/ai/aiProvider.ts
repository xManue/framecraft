import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface AiAccount { connected: boolean; email: string | null; plan: string | null }
export interface AiModel { id: string; name: string; default: boolean; defaultReasoningEffort?: string | null; supportedReasoningEfforts?: { reasoningEffort: string; description: string }[] }
export interface AiRequest { requestId: string; model: string; reasoningEffort?: string; prompt: string; schema: unknown }
export interface AiResult { requestId: string; text: string }
export interface AiEvent { type: "account" | "progress" | "sandbox"; requestId?: string; success?: boolean }
export interface AiSandboxStatus {
  status: "ready" | "notConfigured" | "updateRequired" | "notRequired" | "unknown";
  phase: "idle" | "running" | "completed" | "failed" | "uncertain";
}
export const sandboxPending = (status?: AiSandboxStatus) => status?.phase === "running" || status?.phase === "uncertain";
export interface AiProvider {
  id: string;
  connect(): Promise<AiAccount>;
  login(): Promise<unknown>;
  logout(): Promise<void>;
  models(): Promise<AiModel[]>;
  sandboxStatus?(): Promise<AiSandboxStatus>;
  setupSandbox?(approved: boolean): Promise<AiSandboxStatus>;
  propose(request: AiRequest): Promise<AiResult>;
  cancel(requestId: string): Promise<void>;
  subscribe(callback: (event: AiEvent) => void): Promise<() => void>;
}
const desktop = () => { if (!isTauri()) throw new Error("L’AI con Codex CLI funziona nell’app desktop. Puoi usare l’editor web senza AI."); };
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  desktop();
  try { return await invoke<T>(command, args); }
  catch (error) {
    if (/command.+not found|unknown command/i.test(String(error))) throw new Error("Questa versione desktop non include la funzione AI richiesta. Apri una nuova build di Framecraft; puoi continuare a mano senza riavviare l’anteprima del pannello.");
    throw error;
  }
}

export const codexProvider: AiProvider = {
  id: "codex-cli",
  connect: () => call("ai_codex_connect"),
  login: () => call("ai_codex_login"),
  logout: () => call("ai_codex_logout"),
  models: () => call("ai_codex_models"),
  sandboxStatus: () => call("ai_codex_sandbox_status"),
  setupSandbox: approved => call("ai_codex_setup_sandbox", { approved }),
  propose: request => call("ai_codex_propose", { request }),
  cancel: requestId => call("ai_codex_cancel", { requestId }),
  async subscribe(callback) { desktop(); return listen<AiEvent>("framecraft:ai-event", event => callback(event.payload)); },
};
