// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageKey = "framecraft.visual-edit-guide.seen.v1";
let Canvas: typeof import("../src/canvas/Canvas").Canvas;
let store: typeof import("../src/state/editorStore").useEditorStore;
const mounted: { root: Root; host: HTMLDivElement }[] = [];

async function loadCanvas() {
  Canvas = (await import("../src/canvas/Canvas")).Canvas;
  store = (await import("../src/state/editorStore")).useEditorStore;
  store.setState({
    project: { root: "C:/panel" } as never, document: undefined,
    previewUrl: "http://127.0.0.1:4173", previewPath: "/main", previewStatus: "ready",
    previewError: undefined, previewRestarting: false, previewSessionId: undefined,
    previewProcessExited: false, loading: false, interactionMode: "edit", viewport: "panel-1920",
    selectedId: undefined, multiSelection: [], selectionRect: undefined,
    highlightPicker: undefined, zonePicking: undefined, requestedStatePage: undefined, activePageId: undefined,
    leftPanel: "pages", leftPanelCollapsed: false,
    simulation: { on: false, values: {}, status: {}, elements: [], unresolved: [] },
  });
}

async function mount(strict = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(strict ? createElement(StrictMode, null, createElement(Canvas)) : createElement(Canvas)));
  return host;
}

async function unmountAll() {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  await loadCanvas();
});

afterEach(async () => { await unmountAll(); vi.unstubAllGlobals(); });

describe("suggerimento iniziale della modifica visuale", () => {
  it("appare al primo accesso e resta sulla prima pagina senza chiudersi per un normale render", async () => {
    const host = await mount(true);
    expect(host.querySelector(".canvas-start-guide")?.textContent).toContain("Clicca un elemento");
    expect(localStorage.getItem(storageKey)).toBe("1");
    await act(async () => store.setState({ zoom: 0.8, leftPanelCollapsed: true }));
    expect(host.querySelector(".canvas-start-guide")).not.toBeNull();
  });

  it("non riappare al cambio pagina, nemmeno tornando alla pagina iniziale", async () => {
    const host = await mount();
    await act(async () => store.setState({ previewPath: "/settings" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    await act(async () => store.setState({ previewPath: "/main" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    expect(host.querySelector("iframe")?.src).toContain("/main");
  });

  it("non riappare cambiando formato del pannello", async () => {
    const host = await mount();
    await act(async () => store.setState({ viewport: "panel-800" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    await act(async () => store.setState({ viewport: "panel-1920" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
  });

  it("non riappare aprendo un altro progetto", async () => {
    const host = await mount();
    await act(async () => store.setState({ project: { root: "C:/other-panel" } as never }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
  });

  it("si chiude anche passando tra pagine React senza cambiare URL", async () => {
    store.setState({ activePageId: "desktop-home", requestedStatePage: "desktop-home" });
    const host = await mount();
    const frame = host.querySelector("iframe");
    await act(async () => store.setState({ activePageId: "mobile-home", requestedStatePage: "mobile-home" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    expect(host.querySelector("iframe")).toBe(frame);
    await act(async () => store.setState({ activePageId: "desktop-home", requestedStatePage: "desktop-home" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
  });

  it("la X lo chiude e la chiusura resta anche dopo lo smontaggio del canvas", async () => {
    const host = await mount();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Nascondi suggerimento"]')!.click());
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    await unmountAll();
    expect((await mount()).querySelector(".canvas-start-guide")).toBeNull();
  });

  it.each([
    ["Aggiungi elemento", "components"],
    ["Cambia pagina", "pages"],
  ] as const)("%s apre il pannello richiesto e chiude il suggerimento", async (label, panel) => {
    store.setState({ leftPanelCollapsed: true });
    const host = await mount();
    const button = [...host.querySelectorAll<HTMLButtonElement>(".canvas-start-guide button")].find(item => item.textContent?.includes(label))!;
    await act(async () => button.click());
    expect(store.getState().leftPanel).toBe(panel);
    expect(store.getState().leftPanelCollapsed).toBe(false);
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
  });

  it("rispetta la preferenza già salvata", async () => {
    localStorage.setItem(storageKey, "1");
    expect((await mount()).querySelector(".canvas-start-guide")).toBeNull();
  });

  it("salva la prima apparizione anche senza premere la X e la rispetta a un nuovo avvio", async () => {
    expect((await mount()).querySelector(".canvas-start-guide")).not.toBeNull();
    await unmountAll();
    vi.resetModules();
    await loadCanvas();
    expect((await mount()).querySelector(".canvas-start-guide")).toBeNull();
  });

  it.each(["starting", "error"] as const)("lo stato %s non consuma il primo suggerimento", async previewStatus => {
    store.setState({ previewStatus });
    const host = await mount();
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    await act(async () => store.setState({ previewStatus: "ready" }));
    expect(host.querySelector(".canvas-start-guide")).not.toBeNull();
  });

  it("non lo mostra senza anteprima disponibile", async () => {
    store.setState({ previewUrl: undefined });
    const host = await mount();
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    await act(async () => store.setState({ previewUrl: "http://127.0.0.1:4173" }));
    expect(host.querySelector(".canvas-start-guide")).not.toBeNull();
  });

  it("aspetta Modifica e non riappare dopo il passaggio a Usa il pannello", async () => {
    store.setState({ interactionMode: "navigate" });
    const host = await mount();
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
    await act(async () => store.setState({ interactionMode: "edit" }));
    expect(host.querySelector(".canvas-start-guide")).not.toBeNull();
    await act(async () => store.setState({ interactionMode: "navigate" }));
    await act(async () => store.setState({ interactionMode: "edit" }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
  });

  it("non ricompare quando una selezione viene rimossa", async () => {
    const host = await mount();
    await act(async () => store.setState({ multiSelection: [{ instanceId: "item", rect: { x: 0, y: 0, width: 20, height: 20 } }] as never }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
    await act(async () => store.setState({ multiSelection: [] }));
    expect(host.querySelector(".canvas-start-guide")).toBeNull();
  });

  it("non blocca il canvas se la memoria locale è negata e ricorda almeno nella sessione", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new DOMException("Unavailable", "SecurityError"); },
      setItem: () => { throw new DOMException("Unavailable", "SecurityError"); },
    });
    expect((await mount()).querySelector(".canvas-start-guide")).not.toBeNull();
    await unmountAll();
    expect((await mount()).querySelector(".canvas-start-guide")).toBeNull();
  });
});
