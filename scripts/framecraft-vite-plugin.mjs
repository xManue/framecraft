import { transformSync } from "@babel/core";
import * as t from "@babel/types";

const bridgeScript = String.raw`
(() => {
  if (new URLSearchParams(window.location.search).has("framecraftPreview")) return;
  const attribute = "data-fc-source";
  let inlineTarget = null;
  let selectedSource = null;
  let selectedInstanceId = null;
  let dragTarget = null;
  let suppressClick = false;
  let mode = "edit";
  const dropContainers = new Set(["main", "section", "div", "article", "form", "header", "footer", "aside", "nav", "ul", "ol", "li"]);
  let nextInstanceId = 0;
  const elementInstances = new WeakMap();
  const instanceElements = new Map();
  const instanceId = (element) => {
    let id = elementInstances.get(element);
    if (!id) {
      id = "fc-instance-" + (++nextInstanceId);
      elementInstances.set(element, id);
      instanceElements.set(id, element);
    }
    return id;
  };
  // Every read of the source attribute goes through here: a malformed or missing attribute must never
  // throw inside a DOM listener, or the whole bridge stops responding for the rest of the session.
  const readSource = (element) => {
    try {
      const value = element && element.getAttribute(attribute);
      if (!value) return null;
      const parsed = JSON.parse(value);
      return parsed && typeof parsed.file === "string" && typeof parsed.start === "number" ? parsed : null;
    } catch { return null; }
  };
  const matchesSource = (element, source) => {
    const candidate = readSource(element);
    return Boolean(candidate) && candidate.file === source.file && candidate.start === source.start && candidate.end === source.end;
  };
  const sourceElement = (source, requestedInstanceId) => {
    const instance = requestedInstanceId ? instanceElements.get(requestedInstanceId) : null;
    if (instance?.isConnected && matchesSource(instance, source)) return instance;
    return [...document.querySelectorAll("[" + attribute + "]")].find((element) => matchesSource(element, source));
  };
  const dropContainer = (target) => {
    let element = target instanceof Element ? target.closest("[" + attribute + "]") : null;
    while (element && !dropContainers.has(element.localName)) element = element.parentElement?.closest("[" + attribute + "]") || null;
    return element || [...document.querySelectorAll("[" + attribute + "]")].find((candidate) => dropContainers.has(candidate.localName));
  };
  const dropPosition = (element, event) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: event.clientX - rect.left - (Number.parseFloat(style.borderLeftWidth) || 0) + element.scrollLeft,
      y: event.clientY - rect.top - (Number.parseFloat(style.borderTopWidth) || 0) + element.scrollTop,
      positionContainer: style.position === "static",
    };
  };
  const dropMarker = document.createElement("div");
  Object.assign(dropMarker.style, {
    position: "fixed", width: "18px", height: "18px", margin: "-9px 0 0 -9px", border: "2px solid #7c6cff",
    borderRadius: "50%", background: "rgba(124,108,255,.22)", boxShadow: "0 0 0 4px rgba(124,108,255,.16)",
    pointerEvents: "none", zIndex: "2147483647", display: "none",
  });
  document.documentElement.append(dropMarker);
  const sendSelection = (element) => {
    const source = readSource(element);
    if (!source) return;
    const currentInstanceId = instanceId(element);
    selectedSource = source;
    selectedInstanceId = currentInstanceId;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const styles = Object.fromEntries([
      "display", "position", "left", "top", "right", "bottom", "zIndex", "visibility", "cursor", "pointerEvents",
      "flexDirection", "flexWrap", "alignItems", "justifyContent", "gap", "overflow", "translate", "rotate", "scale", "transformOrigin",
      "margin", "padding", "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
      "aspectRatio", "backgroundColor", "backgroundImage", "color", "border", "outline", "boxShadow", "borderRadius", "opacity", "objectFit",
      "fontSize", "fontWeight", "lineHeight", "textAlign", "fontFamily", "letterSpacing", "textTransform", "textDecoration", "whiteSpace",
    ].map((property) => [property, style[property]]));
    // Read from the rendered element, so this still describes components whose source is out of reach.
    const rendered = (element.textContent || "").replace(/\s+/g, " ").trim();
    window.parent.postMessage({
      type: "framecraft:select",
      source,
      tag: element.localName,
      info: {
        text: rendered.length > 300 ? rendered.slice(0, 300) + "…" : rendered,
        plcTag: element.getAttribute("data-plc-variable") || element.getAttribute("data-plc-tag") || undefined,
        id: element.id || undefined,
        className: typeof element.className === "string" ? element.className || undefined : undefined,
      },
      instanceId: currentInstanceId,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      geometry: {
        display: style.display,
        translate: style.translate || "none",
        scale: style.scale || "none",
        cssWidth: Number.parseFloat(style.width) || rect.width,
        cssHeight: Number.parseFloat(style.height) || rect.height,
      },
      styles,
    }, "*");
  };
  const sendReady = () => window.parent.postMessage({ type: "framecraft:ready", path: window.location.pathname }, "*");
  let sizeFrame = 0;
  const sendSize = () => {
    cancelAnimationFrame(sizeFrame);
    sizeFrame = requestAnimationFrame(() => {
      const body = document.body;
      const root = document.documentElement;
      window.parent.postMessage({
        type: "framecraft:resize",
        width: Math.max(root.scrollWidth, body?.scrollWidth || 0),
        height: Math.max(760, root.scrollHeight, body?.scrollHeight || 0),
      }, "*");
    });
  };
  window.addEventListener("message", (event) => {
    if (event.data?.type === "framecraft:set-mode") {
      mode = event.data.mode === "navigate" ? "navigate" : "edit";
      document.documentElement.dataset.framecraftMode = mode;
    } else if (event.data?.type === "framecraft:open-state-page" && typeof event.data.value === "string") {
      window.__framecraftRequestedPage = event.data.value;
      if (typeof window.__framecraftSetPage === "function") {
        window.__framecraftSetPage(event.data.value);
        window.__framecraftRequestedPage = undefined;
      }
    } else if (event.data?.type === "framecraft:preview-style") {
      const element = sourceElement(event.data.source, event.data.instanceId);
      if (element) Object.assign(element.style, event.data.styles);
    } else if (event.data?.type === "framecraft:request-selection") {
      const element = sourceElement(event.data.source, event.data.instanceId);
      if (element) sendSelection(element);
    } else if (event.data?.type === "framecraft:drop-at-point" && mode === "edit") {
      const x = Number(event.data.x);
      const y = Number(event.data.y);
      const element = Number.isFinite(x) && Number.isFinite(y) ? dropContainer(document.elementFromPoint(x, y)) : null;
      const source = readSource(element);
      if (source && typeof event.data.jsx === "string") {
        window.parent.postMessage({ type: "framecraft:drop", source, jsx: event.data.jsx, ...dropPosition(element, { clientX: x, clientY: y }) }, "*");
      }
    }
  });
  document.addEventListener("click", (event) => {
    if (mode !== "edit") return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const element = event.target.closest?.("[" + attribute + "]");
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    sendSelection(element);
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (mode !== "edit" || event.button !== 0 || inlineTarget) return;
    const element = event.target.closest?.("[" + attribute + "]");
    const source = readSource(element);
    if (!source) return;
    const style = getComputedStyle(element);
    const translate = style.translate && style.translate !== "none" ? style.translate : "0px 0px";
    const parts = translate.split(/\s+/).map((value) => Number.parseFloat(value) || 0);
    dragTarget = { element, source, instanceId: instanceId(element), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, translateX: parts[0] || 0, translateY: parts[1] || 0, started: false, translate };
    element.setPointerCapture?.(event.pointerId);
    sendSelection(element);
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!dragTarget || dragTarget.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragTarget.startX;
    const deltaY = event.clientY - dragTarget.startY;
    if (!dragTarget.started && Math.hypot(deltaX, deltaY) < 3) return;
    dragTarget.started = true;
    suppressClick = true;
    event.preventDefault();
    event.stopPropagation();
    dragTarget.translate = Math.round((dragTarget.translateX + deltaX) * 10) / 10 + "px " + Math.round((dragTarget.translateY + deltaY) * 10) / 10 + "px";
    dragTarget.element.style.translate = dragTarget.translate;
    const rect = dragTarget.element.getBoundingClientRect();
    window.parent.postMessage({ type: "framecraft:drag-move", source: dragTarget.source, instanceId: dragTarget.instanceId, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }, "*");
  }, true);
  const finishDrag = (event) => {
    if (!dragTarget || dragTarget.pointerId !== event.pointerId) return;
    const completed = dragTarget;
    dragTarget = null;
    if (!completed.started) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = completed.element.getBoundingClientRect();
    window.parent.postMessage({ type: "framecraft:drag-end", source: completed.source, instanceId: completed.instanceId, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, translate: completed.translate }, "*");
    setTimeout(() => { suppressClick = false; }, 0);
  };
  document.addEventListener("pointerup", finishDrag, true);
  document.addEventListener("pointercancel", finishDrag, true);
  document.addEventListener("dblclick", (event) => {
    if (mode !== "edit") return;
    const element = event.target.closest?.("[" + attribute + "]");
    const source = readSource(element);
    if (!source) return;
    // Any element opens its full property sheet; only a plain text element also becomes editable.
    window.parent.postMessage({ type: "framecraft:inspect", source, tag: element.localName }, "*");
    if (element.children.length || !element.textContent.trim()) return;
    event.preventDefault();
    event.stopPropagation();
    inlineTarget = { element, original: element.textContent };
    element.contentEditable = "true";
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (inlineTarget) {
      if (event.key === "Enter") { event.preventDefault(); inlineTarget.element.blur(); }
      if (event.key === "Escape") { inlineTarget.element.textContent = inlineTarget.original; inlineTarget.element.blur(); }
      return;
    }
    const editing = event.target instanceof Element && event.target.matches("input, textarea, [contenteditable=true]");
    const deleting = event.key === "Delete" || event.key === "Del" || event.key === "Backspace" || event.code === "Delete";
    if (mode === "edit" && deleting && selectedSource && !editing) {
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ type: "framecraft:delete", source: selectedSource, instanceId: selectedInstanceId }, "*");
    }
  }, true);
  document.addEventListener("focusout", (event) => {
    if (!inlineTarget || event.target !== inlineTarget.element) return;
    const { element, original } = inlineTarget;
    inlineTarget = null;
    element.contentEditable = "false";
    const source = readSource(element);
    if (source && element.textContent !== original) window.parent.postMessage({ type: "framecraft:edit-text", source, value: element.textContent }, "*");
  }, true);
  document.addEventListener("dragover", (event) => {
    if (mode !== "edit" || !event.dataTransfer?.types.includes("application/x-framecraft-jsx")) return;
    const element = dropContainer(event.target);
    if (!element) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropMarker.style.display = "block";
    dropMarker.style.left = event.clientX + "px";
    dropMarker.style.top = event.clientY + "px";
  }, true);
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) dropMarker.style.display = "none";
  }, true);
  document.addEventListener("drop", (event) => {
    dropMarker.style.display = "none";
    if (mode !== "edit") return;
    const jsx = event.dataTransfer?.getData("application/x-framecraft-jsx");
    if (!jsx) return;
    const element = dropContainer(event.target);
    const source = readSource(element);
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    window.parent.postMessage({ type: "framecraft:drop", source, jsx, ...dropPosition(element, event) }, "*");
  }, true);
  window.addEventListener("popstate", sendReady);
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method].bind(history);
    history[method] = (...args) => { const result = original(...args); queueMicrotask(sendReady); return result; };
  }
  const sizeObserver = new ResizeObserver(sendSize);
  sizeObserver.observe(document.documentElement);
  if (document.body) sizeObserver.observe(document.body);
  window.addEventListener("resize", sendSize);
  window.addEventListener("load", sendSize);
  let lastStatePage;
  const watchStatePage = () => {
    // The poll outlives the page in tests and during navigation, so it checks it still has a window.
    if (typeof window === "undefined") return;
    if (typeof window.__framecraftRequestedPage === "string" && typeof window.__framecraftSetPage === "function") {
      const requested = window.__framecraftRequestedPage;
      window.__framecraftRequestedPage = undefined;
      window.__framecraftSetPage(requested);
    }
    if (typeof window.__framecraftCurrentPage === "string" && window.__framecraftCurrentPage !== lastStatePage) {
      lastStatePage = window.__framecraftCurrentPage;
      window.parent.postMessage({ type: "framecraft:state-page", value: lastStatePage }, "*");
    }
  };
  document.documentElement.dataset.framecraftMode = mode;
  sendReady();
  sendSize();
  watchStatePage();
  const statePageTimer = setInterval(watchStatePage, 100);
  window.addEventListener("pagehide", () => clearInterval(statePageTimer));
})();`;

export default function framecraftSourcePlugin() {
  const uninstrumented = new Set();
  return {
    name: "framecraft-source-map",
    enforce: "pre",
    transform(code, rawId) {
      const id = rawId.split("?")[0];
      if (!/\.[jt]sx$/.test(id) || id.includes("node_modules")) return null;
      try {
        return instrument(code, id);
      } catch (error) {
        // Instrumentation is an editor convenience. A file Babel cannot handle is served untouched:
        // it becomes unselectable in the canvas, but the user's app still runs.
        if (!uninstrumented.has(id)) {
          uninstrumented.add(id);
          const message = `framecraft: ${id} non è stato strumentato (${error.message}). Resta visibile ma non selezionabile.`;
          if (typeof this?.warn === "function") this.warn(message); else console.warn(message);
        }
        return null;
      }
    },
    transformIndexHtml(html) {
      return { html, tags: [{ tag: "script", attrs: { type: "module" }, children: bridgeScript, injectTo: "body" }] };
    },
  };
}

function instrument(code, id) {
  const result = transformSync(code, {
    filename: id,
    sourceMaps: true,
    sourceFileName: id,
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: "module", plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"] },
    generatorOpts: { retainLines: true },
    plugins: [() => {
      const instrumentedStateDeclarations = new WeakSet();
      return { visitor: {
        VariableDeclarator(path) {
          if (!t.isArrayPattern(path.node.id) || !t.isCallExpression(path.node.init)) return;
          const state = path.node.id.elements[0];
          const setter = path.node.id.elements[1];
          const callee = path.node.init.callee;
          const useStateCall = t.isIdentifier(callee, { name: "useState" })
            || t.isMemberExpression(callee) && t.isIdentifier(callee.property, { name: "useState" });
          if (!useStateCall || !t.isIdentifier(state) || !t.isIdentifier(setter) || !/(page|view|screen|section)/i.test(state.name)) return;
          const declaration = path.parentPath;
          if (!declaration.isVariableDeclaration() || instrumentedStateDeclarations.has(declaration.node)) return;
          instrumentedStateDeclarations.add(declaration.node);
          declaration.insertAfter([
            t.expressionStatement(t.assignmentExpression("=", t.memberExpression(t.identifier("window"), t.identifier("__framecraftSetPage")), t.identifier(setter.name))),
            t.expressionStatement(t.assignmentExpression("=", t.memberExpression(t.identifier("window"), t.identifier("__framecraftCurrentPage")), t.identifier(state.name))),
          ]);
        },
        JSXOpeningElement(path) {
          if (!t.isJSXIdentifier(path.node.name) || !/^[a-z]/.test(path.node.name.name) || path.node.start == null || path.parent.end == null || !path.parent.loc) return;
          if (path.node.attributes.some((attribute) => t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: "data-fc-source" }))) return;
          const source = { file: id, start: path.parent.start, end: path.parent.end, line: path.parent.loc.start.line, column: path.parent.loc.start.column + 1 };
          path.node.attributes.push(t.jsxAttribute(
            t.jsxIdentifier("data-fc-source"),
            t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(source))),
          ));
        },
      } };
    }],
  });
  return result?.code ? { code: result.code, map: result.map } : null;
}
