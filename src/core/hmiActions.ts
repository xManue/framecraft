import type { HmiEventBinding, HmiEventType } from "./hmiEvents";

export type GuidedActionKind = "navigate" | "show" | "hide" | "enable" | "disable" | "trace";
export const guidedActionLabels: Record<GuidedActionKind, string> = {
  navigate: "Apri una pagina", show: "Mostra un elemento", hide: "Nascondi un elemento",
  enable: "Abilita un elemento", disable: "Disabilita un elemento", trace: "Messaggio in diagnostica",
};
export function guidedActionScript(kind: GuidedActionKind, target: string) {
  const value = JSON.stringify(target);
  if (kind === "navigate") return `HMIRuntime.UI.SysFct.ChangeScreen(${value});`;
  if (kind === "trace") return `HMIRuntime.Trace(${value});`;
  return `Screen.Items(${value}).${kind === "show" || kind === "hide" ? "Visible" : "Enabled"} = ${kind === "show" || kind === "enable"};`;
}
export function readGuidedAction(script: string): { kind: GuidedActionKind; target: string } | undefined {
  const literal = script.match(/\("(?:[^"\\]|\\.)*"\)/)?.[0].slice(1, -1);
  if (!literal) return;
  try {
    const target = JSON.parse(literal) as string;
    return (Object.keys(guidedActionLabels) as GuidedActionKind[]).map((kind) => ({ kind, target })).find((action) => guidedActionScript(action.kind, target) === script.trim());
  } catch { return; }
}
export function newGuidedAction(kind: GuidedActionKind, target: string, event: HmiEventType = "Tapped"): HmiEventBinding {
  return { event, script: guidedActionScript(kind, target) };
}
