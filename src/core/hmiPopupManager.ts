import type { HmiScriptPopupManager, HmiScriptPopupOpenOptions, HmiScriptPopupProperty, HmiScriptPopupReference, HmiScriptScalar } from "./hmiScript";

export interface HmiFaceplatePopupState extends HmiScriptPopupOpenOptions, HmiScriptPopupReference {
  visible: boolean;
  windowFlags: number;
}

export interface HmiFaceplatePopupSurface {
  open(state: HmiFaceplatePopupState): void;
  update(state: HmiFaceplatePopupState): void;
  close(state: HmiFaceplatePopupState): void;
}

export interface HmiFaceplatePopupManager extends HmiScriptPopupManager {
  states(): HmiFaceplatePopupState[];
  closeParentBound(scope?: "screen" | "faceplate"): void;
  dispose(): void;
}

function popupValueText(value: HmiFaceplatePopupState["interfaceValues"][string]): string {
  return value && typeof value === "object" && "Tag" in value ? `Tag: ${value.Tag}` : String(value ?? "");
}

function popupElement(popupId: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("[data-framecraft-runtime-popup-id]")]
    .find((element) => element.dataset.framecraftRuntimePopupId === popupId);
}

/** Superficie DOM usata dal progetto esportato. La resa del contenuto completo arriverà dalla
 * composizione visuale del tipo; intanto finestra, interfaccia, proprietà e ciclo di vita sono reali. */
export function createHmiFaceplatePopupDomSurface(onUserClose: (reference: HmiScriptPopupReference) => void): HmiFaceplatePopupSurface {
  const elements = new Map<string, HTMLElement>();
  const render = (state: HmiFaceplatePopupState) => {
    let root = elements.get(state.popupId) ?? popupElement(state.popupId);
    if (!root) {
      root = document.createElement("section");
      root.dataset.framecraftRuntimePopupId = state.popupId;
      root.dataset.hmiType = "HmiFaceplatePopup";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "false");
      Object.assign(root.style, { position: "fixed", display: "flex", flexDirection: "column", background: "#f7f9fb", color: "#152532", boxShadow: "0 14px 40px rgba(0,0,0,.35)", overflow: "hidden", font: "13px/1.4 system-ui,sans-serif" });
      const header = document.createElement("header");
      header.dataset.framecraftPopupCaption = "";
      Object.assign(header.style, { display: "flex", alignItems: "center", gap: "10px", minHeight: "38px", padding: "0 8px 0 12px", background: "#12354d", color: "white", userSelect: "none" });
      const title = document.createElement("strong");
      title.dataset.framecraftPopupTitle = "";
      title.style.flex = "1";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Chiudi popup");
      Object.assign(close.style, { border: "0", background: "transparent", color: "inherit", font: "24px/1 system-ui", cursor: "pointer" });
      close.addEventListener("click", () => onUserClose({ popupId: state.popupId }));
      header.append(title, close);
      let drag: { x: number; y: number; left: number; top: number } | undefined;
      header.addEventListener("pointerdown", (event) => {
        if (!(Number(root!.dataset.windowFlags) & 16) || event.button !== 0) return;
        drag = { x: event.clientX, y: event.clientY, left: Number.parseFloat(root!.style.left) || 0, top: Number.parseFloat(root!.style.top) || 0 };
        header.setPointerCapture?.(event.pointerId);
      });
      header.addEventListener("pointermove", (event) => {
        if (!drag) return;
        root!.style.left = `${Math.max(0, drag.left + event.clientX - drag.x)}px`;
        root!.style.top = `${Math.max(0, drag.top + event.clientY - drag.y)}px`;
      });
      header.addEventListener("pointerup", () => { drag = undefined; });
      const body = document.createElement("div");
      body.dataset.framecraftPopupBody = "";
      Object.assign(body.style, { flex: "1", minHeight: "0", overflow: "auto", padding: "14px" });
      root.append(header, body);
      document.body.append(root);
    }
    elements.set(state.popupId, root);
    root.dataset.windowFlags = String(state.windowFlags);
    root.setAttribute("aria-label", state.title || state.faceplateType);
    const width = Math.max(160, state.width || 360);
    const height = Math.max(100, state.height || 220);
    const parentClamp = Boolean(state.windowFlags & 128);
    const left = parentClamp ? Math.min(Math.max(0, window.innerWidth - width), Math.max(0, state.left)) : state.left;
    const top = parentClamp ? Math.min(Math.max(0, window.innerHeight - height), Math.max(0, state.top)) : state.top;
    Object.assign(root.style, {
      display: state.visible ? "flex" : "none", left: `${left}px`, top: `${top}px`,
      width: state.adaptWindow ? "max-content" : `${width}px`, height: state.adaptWindow ? "auto" : `${height}px`,
      minWidth: "220px", minHeight: "100px", border: state.windowFlags & 2 ? "1px solid #567184" : "0",
      resize: state.windowFlags & 8 ? "both" : "none", zIndex: state.windowFlags & 4 ? "2147483645" : "2147483600",
    });
    const caption = root.querySelector<HTMLElement>("[data-framecraft-popup-caption]");
    if (caption) caption.style.display = state.windowFlags & 1 ? "flex" : "none";
    const title = root.querySelector<HTMLElement>("[data-framecraft-popup-title]");
    if (title) title.textContent = state.title || state.faceplateType;
    const close = root.querySelector<HTMLElement>("button[aria-label='Chiudi popup']");
    if (close) close.style.display = state.windowFlags & 64 ? "block" : "none";
    const body = root.querySelector<HTMLElement>("[data-framecraft-popup-body]");
    if (body) {
      body.replaceChildren();
      const type = document.createElement("div");
      type.textContent = state.faceplateType;
      Object.assign(type.style, { fontWeight: "700", marginBottom: "10px" });
      const faceplate = document.createElement("div");
      faceplate.dataset.hmiPopupFaceplateType = state.faceplateType;
      faceplate.dataset.hmiPopupInterface = JSON.stringify(state.interfaceValues);
      Object.assign(faceplate.style, { position: "relative", maxWidth: "100%", marginBottom: "10px", overflow: "auto" });
      body.append(type, faceplate);
      for (const [name, value] of Object.entries(state.interfaceValues)) {
        const row = document.createElement("div");
        row.dataset.framecraftPopupInterface = name;
        Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(80px,1fr) 1.4fr", gap: "10px", padding: "5px 0", borderTop: "1px solid #d9e1e6" });
        const label = document.createElement("span"); label.textContent = name;
        const output = document.createElement("output"); output.textContent = popupValueText(value);
        row.append(label, output); body.append(row);
      }
    }
  };
  return {
    open: render,
    update: render,
    close: (state) => {
      (elements.get(state.popupId) ?? popupElement(state.popupId))?.remove();
      elements.delete(state.popupId);
    },
  };
}

function popupInteger(value: HmiScriptScalar, property: HmiScriptPopupProperty): number {
  const number = Number(value);
  const unsigned = property === "Width" || property === "Height" || property === "WindowFlags";
  if (!Number.isInteger(number) || (unsigned && number < 0) || number < -2147483648 || number > 4294967295) throw new Error(`${property} del popup non e' valido.`);
  return number;
}

function popupVisible(value: HmiScriptScalar): boolean {
  if (typeof value === "string") return !/^(?:|0|false|no|off)$/i.test(value.trim());
  return Boolean(value);
}

function popupGeometryKey(property: Exclude<HmiScriptPopupProperty, "Visible" | "WindowFlags">): "left" | "top" | "width" | "height" {
  return property.toLowerCase() as "left" | "top" | "width" | "height";
}

export function createHmiFaceplatePopupManager(surface: HmiFaceplatePopupSurface): HmiFaceplatePopupManager {
  const active = new Map<string, HmiFaceplatePopupState>();
  const names = new Map<string, string>();
  let serial = 0;
  let currentId: string | undefined;
  const stateFor = (reference: HmiScriptPopupReference) => {
    const state = active.get(reference.popupId);
    if (!state) throw new Error(`La finestra popup ${reference.popupId} non e' più aperta.`);
    return state;
  };
  const closeState = (state: HmiFaceplatePopupState) => {
    active.delete(state.popupId);
    if (state.popupWindowName) names.delete(state.popupWindowName);
    if (currentId === state.popupId) currentId = [...active.keys()].at(-1);
    surface.close({ ...state, interfaceValues: { ...state.interfaceValues } });
  };
  return {
    open(options) {
      if (options.popupWindowName && names.has(options.popupWindowName)) throw new Error(`Il nome popup «${options.popupWindowName}» è già in uso.`);
      const popupId = `faceplate-popup-${++serial}`;
      const state: HmiFaceplatePopupState = {
        ...options, popupId, interfaceValues: { ...options.interfaceValues }, visible: !options.invisible,
        windowFlags: 1 | 2 | 16 | 64,
      };
      active.set(popupId, state);
      if (state.popupWindowName) names.set(state.popupWindowName, popupId);
      currentId = popupId;
      surface.open({ ...state, interfaceValues: { ...state.interfaceValues } });
      return { popupId };
    },
    get(reference, property) {
      const state = stateFor(reference);
      if (property === "Visible") return state.visible;
      if (property === "WindowFlags") return state.windowFlags;
      return state[popupGeometryKey(property)];
    },
    set(reference, property, value) {
      const state = stateFor(reference);
      if (property === "Visible") state.visible = popupVisible(value);
      else if (property === "WindowFlags") state.windowFlags = popupInteger(value, property);
      else state[popupGeometryKey(property)] = popupInteger(value, property);
      surface.update({ ...state, interfaceValues: { ...state.interfaceValues } });
    },
    close(reference) {
      const state = reference ? stateFor(reference) : currentId ? active.get(currentId) : undefined;
      if (state) closeState(state);
    },
    states: () => [...active.values()].map((state) => ({ ...state, interfaceValues: { ...state.interfaceValues } })),
    closeParentBound(scope) {
      for (const state of [...active.values()]) if (state.parentBound && (!scope || state.scope === scope)) closeState(state);
    },
    dispose() { for (const state of [...active.values()]) closeState(state); },
  };
}

export function hmiPopupManagerRuntimeModuleSource(): string {
  return `// @ts-nocheck\n${String(popupValueText)}\n${String(popupElement)}\nexport ${String(createHmiFaceplatePopupDomSurface)}\n${String(popupInteger)}\n${String(popupVisible)}\n${String(popupGeometryKey)}\nexport ${String(createHmiFaceplatePopupManager)}\n`;
}
