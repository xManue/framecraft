// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error the editor preview plugin is shipped as plain ESM.
import framecraftPlugin, { installPanelLayoutPreference } from "../scripts/framecraft-vite-plugin.mjs";

let root: Root | undefined;
let dispose: (() => void) | undefined;
const key = "framecraft.preview.panel-layout:C:/synthetic-panel";
function ExistingPanel() {
  const [layout, setLayout] = useState("auto");
  return createElement("div", { "data-layout": layout }, createElement("select", { className: "hmi-layout-switch", value: layout, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setLayout(event.target.value) },
    ...["auto", "desktop", "mobile"].map((value) => createElement("option", { key: value, value }, value))));
}
const select = () => document.querySelector<HTMLSelectElement>("select")!;
const layout = () => document.querySelector<HTMLElement>("[data-layout]")!.dataset.layout;
async function mount() { const host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(ExistingPanel))); }
async function change(value: string) { await act(async () => { select().value = value; select().dispatchEvent(new Event("change", { bubbles: true })); }); }
beforeEach(() => { sessionStorage.clear(); document.body.innerHTML = ""; Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
afterEach(async () => { dispose?.(); dispose = undefined; if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("layout dei pannelli già creati nell'anteprima", () => {
  it("ripristina Mobile nello stato React, non solo nel select, dopo la navigazione e smette se scegli Desktop", async () => {
    dispose = installPanelLayoutPreference(document, key); await mount(); expect(layout()).toBe("auto");
    await change("mobile"); expect(sessionStorage.getItem(key)).toBe("mobile");
    dispose!(); await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = "";
    dispose = installPanelLayoutPreference(document, key); await mount();
    expect(select().value).toBe("mobile"); expect(layout()).toBe("mobile");
    await change("desktop"); expect(layout()).toBe("desktop");
    await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = "";
    await mount(); expect(layout()).toBe("desktop");
    await change("auto"); await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = "";
    await mount(); expect(layout()).toBe("auto");
  });
  it("isola pannelli diversi, ignora valori non validi e smette di scrivere dopo dispose", async () => {
    sessionStorage.setItem(key, "mobile"); sessionStorage.setItem("other", "unknown");
    dispose = installPanelLayoutPreference(document, "other"); await mount(); expect(layout()).toBe("auto");
    await change("desktop"); expect(sessionStorage.getItem(key)).toBe("mobile"); expect(sessionStorage.getItem("other")).toBe("desktop");
    dispose!(); await change("mobile"); expect(sessionStorage.getItem("other")).toBe("desktop");
  });
  it("riallinea la scelta più recente tornando indietro su una pagina conservata dal browser", async () => {
    dispose = installPanelLayoutPreference(document, key); await mount(); await change("mobile");
    sessionStorage.setItem(key, "desktop");
    const event = new Event("pageshow"); Object.defineProperty(event, "persisted", { value: true });
    await act(async () => window.dispatchEvent(event));
    expect(layout()).toBe("desktop"); expect(select().value).toBe("desktop");
    await change("auto"); expect(sessionStorage.getItem(key)).toBe("auto");
    dispose!(); sessionStorage.setItem(key, "mobile");
    await act(async () => window.dispatchEvent(event)); expect(layout()).toBe("auto");
  });
  it("mantiene il selettore usabile se lo storage è bloccato", async () => {
    dispose = installPanelLayoutPreference(document, key, () => { throw Error("Storage blocked"); });
    await mount(); await change("mobile"); expect(layout()).toBe("mobile");
    await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = "";
    await mount(); expect(layout()).toBe("mobile");
  });
  it("inietta una chiave condivisa col runtime e distinta per il progetto effettivo", () => {
    const plugin = framecraftPlugin(); plugin.configResolved({ root: "C:\\synthetic-panel" });
    const tags = plugin.transformIndexHtml("<html></html>").tags;
    expect(tags.find((tag: { tag: string }) => tag.tag === "meta").attrs).toEqual({ name: "framecraft-panel-layout-key", content: key });
    expect(tags[0].children).toContain("installPanelLayoutPreference(document, layoutPreferenceKey)");
  });
});
