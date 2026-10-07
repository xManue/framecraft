// @vitest-environment jsdom
import * as React from "react";
import { act, Children, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPageCategories } from "../src/core/pageNavigation";
import { standardProjectFiles } from "../src/core/standardProject";

const generated = standardProjectFiles({ machineName: "Synthetic mobile", layout: "desktop-mobile", sections: ["main", "settings", "alarms", "statistics", "diagnostic"] });
const source = generated.find((file) => file.path === "src/App.tsx")!.content;
const categories = readPageCategories(source);
const resources = JSON.parse(generated.find((file) => file.path === "framecraft.resources.json")!.content);
let route = "/", viewportWidth = 375, contentWidth = 375, drawingWidth = 1280;
let root: Root | undefined, host: HTMLDivElement | undefined;
const mediaListeners = new Set<() => void>();
const navigate = vi.fn((target: string) => { route = target; });
const disposeRuntime = vi.fn(), installRuntime = vi.fn(() => disposeRuntime);
class Observer {
  static instances: Observer[] = [];
  callback: () => void;
  elements: Element[] = [];
  disconnected = false;
  constructor(callback: () => void) { this.callback = callback; Observer.instances.push(this); }
  observe(element: Element) { this.elements.push(element); }
  disconnect() { this.disconnected = true; }
}
function loadApp(input = source): React.ComponentType {
  const javascript = transpileModule(input, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020, jsx: JsxEmit.React } }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("exports", "require", "React", javascript)(exports, (id: string) => {
    if (id === "react") return React;
    if (id === "react-router-dom") return {
      useNavigate: () => navigate, useLocation: () => ({ pathname: route }), Route: () => null, Navigate: () => null,
      Routes: ({ children }: { children: React.ReactNode }) => (Children.toArray(children) as React.ReactElement<{ path: string; element: React.ReactNode }>[]).find((child) => child.props.path === route)?.props.element,
    };
    if (id === "../framecraft.resources.json") return { default: resources };
    if (id === "./framecraftHmiRuntime") return { installFramecraftHmiRuntime: installRuntime };
    if (id.startsWith("./pages/")) return { [id.split("/").at(-1)!]: () => createElement("section", { className: "hmi-page", style: { width: drawingWidth } }, id) };
    throw Error(`Unexpected synthetic dependency: ${id}`);
  }, React);
  return exports.App as React.ComponentType;
}
const App = loadApp();
async function mount(component = App) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(component)));
}
async function render() { await act(async () => root!.render(createElement(App))); }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function mode(value: string) { const select = document.querySelector<HTMLSelectElement>(".hmi-layout-switch")!; await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
const shell = () => document.querySelector<HTMLElement>(".hmi-shell")!;
const scale = () => Number(shell().style.getPropertyValue("--mobile-scale"));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  route = categories[0].route; viewportWidth = contentWidth = 375; drawingWidth = 1280;
  mediaListeners.clear(); Observer.instances = [];
  sessionStorage.clear();
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ get matches() { return viewportWidth < 1280; }, addEventListener: (_event: string, callback: () => void) => mediaListeners.add(callback), removeEventListener: (_event: string, callback: () => void) => mediaListeners.delete(callback) })));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("hmi-screen") || this.classList.contains("hmi-lateral") ? contentWidth : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("hmi-page") ? drawingWidth : this.classList.contains("hmi-section") ? 110 : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("hmi-section") ? Array.from(this.parentElement!.children).indexOf(this) * 110 : 0; });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; host = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("guscio mobile realmente generato", () => {
  it("mantiene Mobile dopo il ricaricamento causato dal cambio pagina finché non lo cambi manualmente", async () => {
    viewportWidth = contentWidth = 1440;
    await mount(); expect(shell().dataset.panelLayout).toBe("desktop");
    await mode("mobile"); expect(shell().dataset.panelLayout).toBe("mobile");
    await act(async () => root!.unmount()); root = undefined; host?.remove();
    route = categories[1].route;
    await mount(); expect(shell().dataset.panelLayout).toBe("mobile");
    expect(document.querySelector<HTMLSelectElement>(".hmi-layout-switch")!.value).toBe("mobile");
    await mode("desktop"); await act(async () => root!.unmount()); root = undefined; host?.remove();
    route = categories[2].route; viewportWidth = contentWidth = 375;
    await mount(); expect(shell().dataset.panelLayout).toBe("desktop");
    await mode("auto"); await act(async () => root!.unmount()); root = undefined; host?.remove();
    await mount(); expect(shell().dataset.panelLayout).toBe("mobile");
    expect(document.querySelector<HTMLSelectElement>(".hmi-layout-switch")!.value).toBe("auto");
    viewportWidth = 1440; await act(async () => mediaListeners.forEach((callback) => callback()));
    expect(shell().dataset.panelLayout).toBe("desktop");
  });
  it("segue il ridimensionamento, conserva la scelta manuale e torna in automatico", async () => {
    await mount(); expect(shell().dataset.panelLayout).toBe("mobile");
    viewportWidth = 1440; await act(async () => mediaListeners.forEach((callback) => callback()));
    expect(shell().dataset.panelLayout).toBe("desktop");
    await mode("mobile"); expect(shell().dataset.panelLayout).toBe("mobile");
    viewportWidth = 1920; await act(async () => mediaListeners.forEach((callback) => callback()));
    expect(shell().dataset.panelLayout).toBe("mobile");
    await mode("desktop"); viewportWidth = 375; await act(async () => mediaListeners.forEach((callback) => callback()));
    expect(shell().dataset.panelLayout).toBe("desktop");
    await mode("auto"); expect(shell().dataset.panelLayout).toBe("mobile");
    viewportWidth = 812; await act(async () => mediaListeners.forEach((callback) => callback()));
    expect(shell().dataset.panelLayout).toBe("mobile"); expect(navigate).not.toHaveBeenCalled();
  });
  it("riallinea scelta e viewport tornando indietro su una pagina conservata dal browser", async () => {
    viewportWidth = 1440; await mount(); await mode("mobile");
    const key = "framecraft.panel-layout:Synthetic mobile";
    sessionStorage.setItem(key, "desktop"); viewportWidth = 375;
    const event = new Event("pageshow"); Object.defineProperty(event, "persisted", { value: true });
    await act(async () => window.dispatchEvent(event)); expect(shell().dataset.panelLayout).toBe("desktop");
    sessionStorage.setItem(key, "auto");
    await act(async () => window.dispatchEvent(event)); expect(shell().dataset.panelLayout).toBe("mobile");
    expect(document.querySelector<HTMLSelectElement>(".hmi-layout-switch")!.value).toBe("auto");
    await mode("mobile"); expect(sessionStorage.getItem(key)).toBe("mobile");
  });
  it("adatta alla finestra contenuto e ricalcola la scala anche su pagine più larghe", async () => {
    await mount(); expect(scale()).toBeCloseTo(375 / 1280);
    const fit = document.querySelector<HTMLButtonElement>(".hmi-fit-switch")!;
    await click(fit); expect(fit.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector<HTMLElement>(".hmi-screen")!.dataset.mobileFit).toBe("true");
    contentWidth = 320; await act(async () => Observer.instances.filter((observer) => !observer.disconnected).forEach((observer) => observer.callback()));
    expect(scale()).toBeCloseTo(320 / 1280);
    drawingWidth = 1600; route = categories[1].route; await render();
    expect(scale()).toBeCloseTo(320 / 1600);
    contentWidth = 1920; await act(async () => Observer.instances.filter((observer) => !observer.disconnected).forEach((observer) => observer.callback()));
    expect(scale()).toBe(1); expect(installRuntime).toHaveBeenCalledTimes(1);
  });
  it("apre il menu, salta le voci libere e chiude con Escape restituendo il focus", async () => {
    await mount(); const opener = document.querySelector<HTMLButtonElement>('[data-section="settings"]')!;
    opener.focus(); await click(opener);
    const panel = document.querySelector("#hmi-section-menu")!;
    expect(panel.contains(document.activeElement)).toBe(true); expect((document.activeElement as HTMLButtonElement).disabled).toBe(false);
    expect(opener.getAttribute("aria-controls")).toBe("hmi-section-menu");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.querySelector("#hmi-section-menu")).toBeNull(); expect(document.activeElement).toBe(opener);
    await click(opener); await click(document.querySelector<HTMLElement>('[aria-label="Chiudi menu sezione"]')!);
    expect(document.querySelector("#hmi-section-menu")).toBeNull(); expect(document.activeElement).toBe(opener);
  });
  it("porta la categoria attiva nella striscia visibile senza scorrere l’intera pagina", async () => {
    await mount(); const nav = document.querySelector<HTMLElement>(".hmi-lateral")!;
    route = categories.at(-1)!.route; await render(); expect(nav.scrollLeft).toBeGreaterThan(0);
    expect(document.documentElement.scrollTop).toBe(0); expect(document.body.scrollTop).toBe(0);
  });
  it("chiude il menu quando il focus esce, senza rubarlo, e conserva la navigazione", async () => {
    await mount(); const opener = document.querySelector<HTMLButtonElement>('[data-section="settings"]')!;
    await click(opener); const select = document.querySelector<HTMLSelectElement>(".hmi-layout-switch")!;
    await act(async () => select.focus()); expect(document.querySelector("#hmi-section-menu")).toBeNull(); expect(document.activeElement).toBe(select);
    await click(opener); const entry = document.querySelector<HTMLElement>("#hmi-section-menu li:not(.hmi-submenu-heading) button:not(:disabled)")!;
    await click(entry); expect(document.querySelector("#hmi-section-menu")).toBeNull(); expect(navigate).toHaveBeenLastCalledWith(categories[1].entries.find((item) => item.route)!.route);
    expect(document.querySelector('[data-section="settings"]')!.classList.contains("active")).toBe(true);
    expect(document.activeElement).toBe(document.querySelector(".hmi-screen"));
  });
  it("non abilita il mobile nei pannelli solo desktop e rimuove i listener alla chiusura", async () => {
    const desktop = standardProjectFiles({ machineName: "Desktop", layout: "desktop", sections: ["main"] }).find((file) => file.path === "src/App.tsx")!.content;
    await mount(loadApp(desktop)); expect(shell().dataset.panelLayout).toBe("desktop"); expect(document.querySelector(".hmi-layout-controls")).toBeNull();
    expect(mediaListeners.size).toBe(1);
    await act(async () => root!.unmount()); root = undefined;
    expect(mediaListeners.size).toBe(0); expect(Observer.instances.every((observer) => observer.disconnected)).toBe(true); expect(disposeRuntime).toHaveBeenCalledOnce();
  });
});
