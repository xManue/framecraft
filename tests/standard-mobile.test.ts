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
const layoutKey = "framecraft.panel-layout:Synthetic mobile";
async function mount(component = App) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(component)));
}
async function render() { await act(async () => root!.render(createElement(App))); }
async function click(element: HTMLElement) { await act(async () => element.click()); }
const returnButton = () => document.querySelector<HTMLButtonElement>("[data-panel-return]")!;
async function choose(value: string) { await click(document.querySelector<HTMLButtonElement>(`[data-panel-start-mode="${value}"]`)!); }
async function mode(value: string) { await click(returnButton()); await choose(value); }
const shell = () => document.querySelector<HTMLElement>(".hmi-shell")!;
const scale = () => Number(shell().style.getPropertyValue("--mobile-scale"));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  route = categories[0].route; viewportWidth = contentWidth = 375; drawingWidth = 1280;
  mediaListeners.clear(); Observer.instances = [];
  sessionStorage.clear();
  sessionStorage.setItem(layoutKey, "mobile");
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ get matches() { return viewportWidth < 1280; }, addEventListener: (_event: string, callback: () => void) => mediaListeners.add(callback), removeEventListener: (_event: string, callback: () => void) => mediaListeners.delete(callback) })));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("hmi-screen") || this.classList.contains("hmi-lateral") ? contentWidth : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("hmi-page") ? drawingWidth : this.classList.contains("hmi-section") ? 110 : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("hmi-section") ? Array.from(this.parentElement!.children).indexOf(this) * 110 : 0; });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; host = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("guscio mobile realmente generato", () => {
  it.each(["desktop", "mobile"])("presenta la scelta iniziale nel pannello e apre %s solo dopo la scelta", async (value) => {
    sessionStorage.clear(); route = categories[1].route; viewportWidth = value === "mobile" ? 1440 : 375;
    await mount();
    expect(document.querySelector(".hmi-start")).not.toBeNull(); expect(document.querySelector(".hmi-shell")).toBeNull();
    expect(document.querySelectorAll("[data-panel-start-mode]")).toHaveLength(2);
    expect(document.activeElement).toBe(document.querySelector('[data-panel-start-mode="desktop"]'));
    expect(installRuntime).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    await click(document.querySelector<HTMLButtonElement>(`[data-panel-start-mode="${value}"]`)!);
    expect(document.querySelector(".hmi-start")).toBeNull(); expect(shell().dataset.panelLayout).toBe(value);
    expect(sessionStorage.getItem(layoutKey)).toBe(value); expect(route).toBe(categories[1].route);
    expect(document.querySelector(".hmi-page")).not.toBeNull(); expect(installRuntime).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(document.querySelector(".hmi-screen"));
    route = categories[2].route; await render(); expect(shell().dataset.panelLayout).toBe(value);
    await act(async () => root!.unmount()); root = undefined; host?.remove();
    await mount(); expect(document.querySelector(".hmi-start")).toBeNull(); expect(shell().dataset.panelLayout).toBe(value);
  });
  it.each(["unknown", "auto"])("richiede la scelta con la preferenza %s e continua senza storage disponibile", async (saved) => {
    sessionStorage.setItem(layoutKey, saved); await mount(); expect(document.querySelector(".hmi-start")).not.toBeNull();
    await act(async () => root!.unmount()); root = undefined; host?.remove();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("Storage blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw Error("Storage blocked"); });
    await mount(); expect(document.querySelector(".hmi-start")).not.toBeNull();
    await click(document.querySelector<HTMLButtonElement>('[data-panel-start-mode="mobile"]')!);
    expect(shell().dataset.panelLayout).toBe("mobile"); route = categories[1].route; await render();
    expect(shell().dataset.panelLayout).toBe("mobile");
    await click(returnButton()); expect(document.querySelector(".hmi-shell")).toBeNull();
    await choose("desktop"); expect(shell().dataset.panelLayout).toBe("desktop");
  });
  it.each(["desktop", "mobile"])("torna da %s alla scelta, chiude il menu e libera il runtime prima di cambiare dispositivo", async (value) => {
    sessionStorage.setItem(layoutKey, value); route = categories[1].route;
    sessionStorage.setItem("framecraft.operator-session", "synthetic-user");
    await mount(); await click(document.querySelector<HTMLButtonElement>('[data-section="settings"]')!);
    expect(document.querySelector("#hmi-section-menu")).not.toBeNull();
    expect(document.querySelector(".hmi-layout-switch")).toBeNull();
    await click(returnButton());
    expect(document.querySelector(".hmi-start")).not.toBeNull(); expect(document.querySelector(".hmi-shell")).toBeNull();
    expect(document.querySelector("#hmi-section-menu")).toBeNull();
    expect(sessionStorage.getItem(layoutKey)).toBeNull();
    expect(sessionStorage.getItem("framecraft.operator-session")).toBe("synthetic-user");
    expect(document.activeElement).toBe(document.querySelector('[data-panel-start-mode="desktop"]'));
    expect(Observer.instances.every((observer) => observer.disconnected)).toBe(true); expect(disposeRuntime).toHaveBeenCalledOnce();
    expect((window as Window & { __framecraftSetPage?: unknown }).__framecraftSetPage).toBeUndefined();
    await choose(value === "desktop" ? "mobile" : "desktop");
    expect(shell().dataset.panelLayout).toBe(value === "desktop" ? "mobile" : "desktop");
    expect(route).toBe(categories[1].route); expect(navigate).not.toHaveBeenCalled();
    expect(installRuntime).toHaveBeenCalledTimes(2); expect(document.activeElement).toBe(document.querySelector(".hmi-screen"));
  });
  it("condivide la scelta iniziale con la chiave specifica del progetto in anteprima", async () => {
    const meta = document.createElement("meta"); meta.name = "framecraft-panel-layout-key"; meta.content = "framecraft.preview.panel-layout:synthetic-new";
    document.head.append(meta);
    try {
      await mount(); expect(document.querySelector(".hmi-start")).not.toBeNull();
      await click(document.querySelector<HTMLButtonElement>('[data-panel-start-mode="mobile"]')!);
      expect(sessionStorage.getItem(meta.content)).toBe("mobile"); expect(sessionStorage.getItem(layoutKey)).toBe("mobile");
      await act(async () => root!.unmount()); root = undefined; host?.remove(); await mount();
      expect(shell().dataset.panelLayout).toBe("mobile"); expect(document.querySelector(".hmi-start")).toBeNull();
      await click(returnButton()); expect(sessionStorage.getItem(meta.content)).toBeNull();
      expect(sessionStorage.getItem(layoutKey)).toBe("mobile");
      await act(async () => root!.unmount()); root = undefined; host?.remove(); await mount();
      expect(document.querySelector(".hmi-start")).not.toBeNull();
    } finally { meta.remove(); }
  });
  it("mantiene Mobile dopo il ricaricamento causato dal cambio pagina finché non lo cambi manualmente", async () => {
    viewportWidth = contentWidth = 1440;
    sessionStorage.setItem(layoutKey, "desktop");
    await mount(); expect(shell().dataset.panelLayout).toBe("desktop");
    await mode("mobile"); expect(shell().dataset.panelLayout).toBe("mobile");
    await act(async () => root!.unmount()); root = undefined; host?.remove();
    route = categories[1].route;
    await mount(); expect(shell().dataset.panelLayout).toBe("mobile");
    expect(sessionStorage.getItem(layoutKey)).toBe("mobile");
    await mode("desktop"); await act(async () => root!.unmount()); root = undefined; host?.remove();
    route = categories[2].route; viewportWidth = contentWidth = 375;
    await mount(); expect(shell().dataset.panelLayout).toBe("desktop");
    await click(returnButton()); await act(async () => root!.unmount()); root = undefined; host?.remove();
    await mount(); expect(document.querySelector(".hmi-start")).not.toBeNull(); expect(document.querySelector(".hmi-shell")).toBeNull();
    await choose("mobile"); viewportWidth = 1440; await act(async () => window.dispatchEvent(new Event("resize")));
    expect(shell().dataset.panelLayout).toBe("mobile");
  });
  it("non cambia layout al ridimensionamento: il cambio passa sempre dalla pagina iniziale", async () => {
    await mount(); expect(shell().dataset.panelLayout).toBe("mobile");
    viewportWidth = 1440; await act(async () => window.dispatchEvent(new Event("resize")));
    expect(shell().dataset.panelLayout).toBe("mobile");
    viewportWidth = 1920; await act(async () => window.dispatchEvent(new Event("resize")));
    expect(shell().dataset.panelLayout).toBe("mobile");
    await mode("desktop"); viewportWidth = 375; await act(async () => window.dispatchEvent(new Event("resize")));
    expect(shell().dataset.panelLayout).toBe("desktop");
    await mode("mobile"); expect(shell().dataset.panelLayout).toBe("mobile");
    viewportWidth = 812; await act(async () => window.dispatchEvent(new Event("resize")));
    expect(shell().dataset.panelLayout).toBe("mobile"); expect(navigate).not.toHaveBeenCalled(); expect(mediaListeners.size).toBe(0);
  });
  it("riallinea la scelta e torna alla pagina iniziale anche sulle pagine conservate dal browser", async () => {
    viewportWidth = 1440; await mount(); await mode("mobile");
    const key = "framecraft.panel-layout:Synthetic mobile";
    sessionStorage.setItem(key, "desktop"); viewportWidth = 375;
    const event = new Event("pageshow"); Object.defineProperty(event, "persisted", { value: true });
    await act(async () => window.dispatchEvent(event)); expect(shell().dataset.panelLayout).toBe("desktop");
    sessionStorage.removeItem(key);
    await act(async () => window.dispatchEvent(event)); expect(document.querySelector(".hmi-start")).not.toBeNull();
    expect(document.querySelector(".hmi-shell")).toBeNull(); expect(disposeRuntime).toHaveBeenCalledTimes(2);
    await choose("mobile"); expect(sessionStorage.getItem(key)).toBe("mobile");
    sessionStorage.setItem(key, "auto");
    await act(async () => window.dispatchEvent(event)); expect(document.querySelector(".hmi-start")).not.toBeNull();
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
    await click(opener); const back = returnButton();
    await act(async () => back.focus()); expect(document.querySelector("#hmi-section-menu")).toBeNull(); expect(document.activeElement).toBe(back);
    await click(opener); const entry = document.querySelector<HTMLElement>("#hmi-section-menu li:not(.hmi-submenu-heading) button:not(:disabled)")!;
    await click(entry); expect(document.querySelector("#hmi-section-menu")).toBeNull(); expect(navigate).toHaveBeenLastCalledWith(categories[1].entries.find((item) => item.route)!.route);
    expect(document.querySelector('[data-section="settings"]')!.classList.contains("active")).toBe(true);
    expect(document.activeElement).toBe(document.querySelector(".hmi-screen"));
  });
  it("non abilita il mobile nei pannelli solo desktop e rimuove i listener alla chiusura", async () => {
    const desktop = standardProjectFiles({ machineName: "Desktop", layout: "desktop", sections: ["main"] }).find((file) => file.path === "src/App.tsx")!.content;
    await mount(loadApp(desktop)); expect(shell().dataset.panelLayout).toBe("desktop"); expect(document.querySelector(".hmi-layout-controls")).toBeNull(); expect(document.querySelector(".hmi-start")).toBeNull();
    expect(document.querySelector("[data-panel-return]")).toBeNull(); expect(mediaListeners.size).toBe(0);
    await act(async () => root!.unmount()); root = undefined;
    expect(mediaListeners.size).toBe(0); expect(Observer.instances.every((observer) => observer.disconnected)).toBe(true); expect(disposeRuntime).toHaveBeenCalledOnce();
  });
});
