// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/filesystem/desktopBridge", () => ({ desktopAvailable: true, desktopBridge: { readFile: vi.fn(), writeFile: vi.fn() } }));
import { Inspector } from "../src/inspector/Inspector";
import { useEditorStore } from "../src/state/editorStore";
import { parseSource } from "../src/source-parser/parseSource";
import { updateStaticAttributes } from "../src/source-parser/transformSource";
import { parseHmiEvents } from "../src/core/hmiEvents";
import { readGuidedAction } from "../src/core/hmiActions";

const initial = useEditorStore.getState();
afterEach(() => useEditorStore.setState(initial));
async function inspector(source: string) {
  const selectSource = (next: string) => { const document = parseSource("C:/panel/Page.jsx", next); const node = Object.values(document.nodes).find((item) => item.type === "button")!; useEditorStore.setState({ document, selectedId: node.id }); };
  selectSource(source);
  const update = vi.fn(async (name: string, value: string) => { const state = useEditorStore.getState(); const node = state.document!.nodes[state.selectedId!]; selectSource(updateStaticAttributes(state.document!.source, node.source.start, node.source.end, { [name]: value })); });
  useEditorStore.setState({ project: undefined, selectionInfo: undefined, unresolvedSelection: undefined, multiSelection: [], updateAttribute: update, userAccessConfig: { permissions: [{ id: "comandi", label: "Comandi macchina" }], accounts: [], autoLogoutMinutes: 0 } });
  HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div"); const root = createRoot(container);
  await act(async () => root.render(createElement(Inspector)));
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent === "Azioni")!.click());
  return { container, root, update };
}
function field(container: HTMLElement, label: string) { return [...container.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === label)!.querySelector<HTMLSelectElement>("select")!; }

describe("Cosa fa: reazioni e utente attivo", () => {
  it("mostra prima Abilita reazioni, nasconde le azioni pronte da spento e conserva quelle configurate", async () => {
    const source = `export function Page(){return <button data-fc-reacts="false" data-hmi-events='[{"event":"Tapped","script":"HMIRuntime.Trace(1);"}]'>Prova</button>}`;
    const { container, root, update } = await inspector(source);
    try {
      const switchButton = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
      expect(switchButton.getAttribute("aria-checked")).toBe("false");
      expect(container.querySelector(".user-access-card")).toBeNull(); expect(container.querySelector(".interaction-editor")).toBeNull(); expect(container.querySelector(".hmi-event-card")).toBeNull();
      expect(field(container, "Visibile a chi ha il permesso")).toBeDefined();
      await act(async () => switchButton.click()); expect(update).toHaveBeenCalledWith("data-fc-reacts", "true");
      expect(container.querySelector(".user-access-card")).not.toBeNull(); expect(container.querySelector(".interaction-editor")).not.toBeNull(); expect(container.querySelector(".hmi-event-card")).not.toBeNull();
      expect(field(container, "Quando").querySelector('[value="DoubleTapped"]')).not.toBeNull();
      await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
      expect(useEditorStore.getState().document!.source).toContain("HMIRuntime.Trace(1);"); expect(container.querySelector(".hmi-event-card")).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
  it("aggiunge e modifica un'azione guidata con doppio click e regole utente separate", async () => {
    const { container, root } = await inspector('export function Page(){return <button data-fc-reacts="true">Prova</button>}');
    try {
      await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Aggiungi azione"))!.click());
      await act(async () => { const when = field(container, "Quando"); when.value = "DoubleTapped"; when.dispatchEvent(new Event("change", { bubbles: true })); });
      await act(async () => { const what = field(container, "Cosa succede"); what.value = "hide"; what.dispatchEvent(new Event("change", { bubbles: true })); });
      const state = useEditorStore.getState(); const node = state.document!.nodes[state.selectedId!]; const binding = parseHmiEvents(node.props["data-hmi-events"])[0];
      expect(binding.event).toBe("DoubleTapped"); expect(readGuidedAction(binding.script)).toEqual({ kind: "hide", target: "NomeElemento" });
      expect(container.querySelector(".hmi-event-script")).toBeNull();
      await act(async () => { const visibility = field(container, "Visibile a chi ha il permesso"); visibility.value = "comandi"; visibility.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(useEditorStore.getState().document!.source).toContain('data-fc-user-visible-requires="comandi"');
      expect(field(container, "Utilizzabile da chi ha il permesso").value).toBe("");
    } finally { await act(async () => root.unmount()); }
  });
});
