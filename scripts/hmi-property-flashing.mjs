// Shared by the editor bridge and the generated runtime. References contain IDs, never DOM objects.
export function createHmiPropertyFlashing(surface) {
  const state = new Map();
  const propertyState = new Map();
  let revision = 0;
  const reported = new Set();
  const properties = ["BackColor", "ForeColor", "BorderColor"];
  const fontProperties = ["Name", "Size", "Weight", "Italic", "Underline", "StrikeOut"];
  const propertyKey = (reference, property) => {
    if (reference.screenPropertyPath === "Font") {
      if (!fontProperties.includes(property)) throw new Error("Font non espone la proprieta' " + property + ".");
      return "Font." + property;
    }
    if (property.includes(".")) throw new Error("Accedi alle proprieta' annidate tramite il riferimento Font.");
    return property;
  };
  const color = (value) => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return "#" + value.toString(16).padStart(8, "0");
    if (typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) return value;
    throw new Error("PropertyFlashing richiede colori RGB/ARGB numerici o esadecimali.");
  };
  const commands = () => {
    const live = new Set(surface.items().map((item) => item.itemId));
    for (const itemId of state.keys()) if (!live.has(itemId)) state.delete(itemId);
    return [...state.values()].flatMap((entries) => [...entries.values()]);
  };
  const report = (message) => { if (!reported.has(message)) { if (reported.size >= 256) reported.delete(reported.values().next().value); reported.add(message); surface.report?.(message); } };
  const publish = () => surface.apply(commands());
  const propertyCommands = () => {
    const live = new Set(surface.items().map((item) => item.itemId));
    for (const itemId of propertyState.keys()) if (!live.has(itemId)) propertyState.delete(itemId);
    return [...propertyState].flatMap(([itemId, values]) => [...values].map(([property, value]) => ({ itemId, property, value })));
  };
  return {
    commands,
    propertyCommands,
    reset() { revision++; reported.clear(); state.clear(); propertyState.clear(); surface.applyProperties?.([]); publish(); },
    context(ownerId) {
      const contextRevision = revision;
      const assertActive = () => { if (contextRevision !== revision) throw new Error("Il contesto oggetti HMI non e' piu' attivo."); };
      const itemFor = (reference) => {
        assertActive();
        if (!reference || typeof reference.screenItemId !== "string" || (reference.screenPropertyPath !== undefined && reference.screenPropertyPath !== "Font")) throw new Error("Riferimento grafico HMI non valido.");
        const items = surface.items();
        if (ownerId && !items.some((item) => item.itemId === ownerId)) throw new Error("L'oggetto HMI del contesto non e' piu' disponibile.");
        const item = items.find((candidate) => candidate.itemId === reference.screenItemId);
        if (!item) throw new Error("L'oggetto HMI non e' piu' disponibile.");
        return item;
      };
      return {
        resolve(scope, name) {
          assertActive();
          const items = surface.items();
          const owner = ownerId ? items.find((item) => item.itemId === ownerId) : undefined;
          if (ownerId && !owner) throw new Error("L'oggetto HMI del contesto non e' piu' disponibile.");
          const screens = items.filter((item) => item.itemId === item.screenId);
          const screenId = owner?.screenId ?? (screens.length === 1 ? screens[0].itemId : undefined);
          const faceplateId = owner?.faceplateId;
          if (scope === "item") {
            if (!owner) throw new Error("item richiede un evento o una dinamizzazione di un oggetto HMI.");
            return { screenItemId: owner.itemId };
          }
          const rootId = scope === "faceplate" ? faceplateId : screenId;
          if (!rootId) throw new Error(scope === "faceplate" ? "Faceplate richiede il contesto di un'istanza faceplate." : "Screen non identifica una schermata univoca.");
          const matches = name === undefined ? items.filter((item) => item.itemId === rootId) : items.filter((item) => item.name === name && (scope === "faceplate" ? item.faceplateId === rootId : item.screenId === rootId && (!item.faceplateId || item.itemId === item.faceplateId)));
          if (matches.length !== 1) throw new Error(matches.length ? "Nome oggetto HMI duplicato: " + name : "Oggetto HMI non trovato: " + (name ?? scope));
          return { screenItemId: matches[0].itemId };
        },
        get(reference, property) {
          const item = itemFor(reference);
          if (!reference.screenPropertyPath && property === "Font") {
            if (!fontProperties.some((name) => Object.hasOwn(item.properties ?? {}, "Font." + name))) throw new Error("L'oggetto HMI non espone Font: serve un testo univoco o un campo input.");
            return { screenItemId: item.itemId, screenPropertyPath: "Font" };
          }
          const key = propertyKey(reference, property);
          if (key === "Name") return item.name;
          if (!Object.prototype.hasOwnProperty.call(item.properties ?? {}, key)) throw new Error("L'oggetto HMI non espone la proprieta' " + key + ".");
          const overrides = propertyState.get(item.itemId);
          const value = overrides?.has(key) ? overrides.get(key) : item.properties[key];
          if (value === null && properties.includes(key)) throw new Error("Il colore base " + key + " non e' risolvibile come RGB nel contesto corrente.");
          if (value === null && reference.screenPropertyPath) throw new Error("La proprieta' base " + key + " non e' risolvibile nel contesto corrente.");
          return value;
        },
        set(reference, property, value) {
          const item = itemFor(reference);
          if (!reference.screenPropertyPath && property === "Font") throw new Error("Font e' un riferimento grafico non sostituibile: modifica le sue proprieta'.");
          const key = propertyKey(reference, property);
          if (key === "Name") throw new Error("Name e' in sola lettura nel Runtime: modifica il nome nell'Inspector.");
          if (!Object.prototype.hasOwnProperty.call(item.properties ?? {}, key)) throw new Error("L'oggetto HMI non espone la proprieta' " + key + ".");
          if (["Visible", "Enabled", "Font.Italic", "Font.Underline"].includes(key)) {
            if (typeof value !== "boolean") throw new Error(key + " richiede un Boolean.");
          } else if (key === "Font.Name") {
            if (typeof value !== "string" || value.length > 20000 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Font.Name richiede una stringa fino a 20000 caratteri senza caratteri di controllo.");
          } else if (key === "Font.Size") {
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isFinite(Math.fround(value))) throw new Error("Font.Size richiede un Float finito non negativo in DIU.");
          } else if (key === "Font.Weight") {
            if (![0, 300, 400, 600, 700].includes(value)) throw new Error("Font.Weight richiede HmiFontWeight: None (0), Light (300), Normal (400), SemiBold (600) o Bold (700).");
          } else if (key === "Font.StrikeOut") {
            if (![0, 1].includes(value)) throw new Error("Font.StrikeOut richiede HmiFontStrikeOut: None (0) o Single (1), non Boolean.");
          } else if (key === "Text") {
            if (typeof value !== "string" || value.length > 20000) throw new Error("Text richiede una stringa fino a 20000 caratteri.");
          } else if (["Left", "Top", "Width", "Height", ...properties].includes(key)) {
            const signed = key === "Left" || key === "Top";
            if (typeof value !== "number" || !Number.isInteger(value) || value < (signed ? -2147483648 : 0) || value > (signed ? 2147483647 : 0xffffffff)) throw new Error(key + " richiede un " + (signed ? "Int32." : "UInt32."));
          } else throw new Error("Proprieta' grafica non supportata: " + key);
          if (!surface.applyProperties) throw new Error("Il contesto corrente non permette modifiche grafiche.");
          if (propertyState.get(item.itemId)?.get(key) === value) return;
          if (!propertyState.has(item.itemId)) propertyState.set(item.itemId, new Map());
          propertyState.get(item.itemId).set(key, value);
          surface.applyProperties(propertyCommands());
        },
        propertyFlashing(reference, args) {
          const item = itemFor(reference);
          if (reference.screenPropertyPath) throw new Error("PropertyFlashing richiede un oggetto Screen/Faceplate, non Font.");
          const [property, enabled, value, alternateValue, rate] = args;
          if (!properties.includes(property)) throw new Error("PropertyFlashing: proprieta' non supportata: " + property);
          if (typeof enabled !== "boolean") throw new Error("PropertyFlashing: enable deve essere Boolean.");
          if (rate != null && ![0, 1, 2].includes(rate)) throw new Error("PropertyFlashing: rate deve essere Slow (0), Medium (1) o Fast (2).");
          const existing = state.get(item.itemId)?.get(property);
          const configured = item.flashing?.find((binding) => binding.property === property);
          const source = value ?? existing?.color ?? configured?.color;
          const alternate = alternateValue ?? existing?.alternateColor ?? configured?.alternateColor;
          if (enabled && (source == null || alternate == null)) {
            report("PropertyFlashing: configura due colori oppure passali allo script (" + (item.name || property) + ").");
            return false;
          }
          const command = { itemId: item.itemId, property, enabled,
            ...(source != null ? { color: color(source) } : {}), ...(alternate != null ? { alternateColor: color(alternate) } : {}),
            periodMs: [2000, 1000, 500][rate ?? 1] };
          if (enabled && command.color.toLowerCase() === command.alternateColor.toLowerCase()) {
            report("PropertyFlashing: i due colori devono essere diversi.");
            return false;
          }
          if (!state.has(item.itemId)) state.set(item.itemId, new Map());
          state.get(item.itemId).set(property, command);
          publish();
          return true;
        },
      };
    },
  };
}

export function createHmiPropertyFlashingDomSurface(root, identify, interactionEnabled = () => true) {
  let sequence = 0;
  const ids = new WeakMap();
  const identifyItem = identify ?? ((element) => { if (!ids.has(element)) ids.set(element, "hmi-item-" + ++sequence); return ids.get(element); });
  const targets = new Map();
  const scripted = new Map();
  const declarative = new Map();
  const before = new Map();
  const propertyOverrides = new Map();
  const propertyBefore = new Map();
  const createdText = new WeakSet();
  const baseColors = new WeakMap();
  let suspendDepth = 0;
  const stems = { BackColor: "background", ForeColor: "foreground", BorderColor: "border" };
  const cssProperties = { Left: "left", Top: "top", Width: "width", Height: "height", Visible: "visibility", BackColor: "background-color", ForeColor: "color", BorderColor: "border-color" };
  const fontCssProperties = { "Font.Name": "font-family", "Font.Size": "font-size", "Font.Weight": "font-weight", "Font.Italic": "font-style" };
  const fontProperties = [...Object.keys(fontCssProperties), "Font.Underline", "Font.StrikeOut"];
  const cssColor = (value) => {
    if (value.length !== 9) return value;
    const alpha = parseInt(value.slice(1, 3), 16) / 255;
    return alpha === 1 ? "#" + value.slice(3) : "rgba(" + [3, 5, 7].map((index) => parseInt(value.slice(index, index + 2), 16)).join(", ") + ", " + alpha + ")";
  };
  const textNodes = (element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || /^(input|textarea|select|img|iframe|script|style)$/.test(element.localName)) return null;
    const direct = [...element.childNodes].filter((node) => node.nodeType === 3);
    if (!element.childElementCount || direct.some((node) => node.data.trim())) return { host: element, nodes: direct };
    const candidates = [...element.querySelectorAll("span, label, div, p, [data-hmi-text]")].filter((child) => {
      if (child.childElementCount || ![...child.childNodes].some((node) => node.nodeType === 3 && node.data.trim())) return false;
      const owner = child.closest("[data-hmi-type], [data-hmi-name], [data-hmi-events], [data-hmi-faceplate]");
      return !child.closest("svg, input, textarea, select") && (!owner || owner === element);
    });
    const marked = candidates.filter((child) => child.hasAttribute("data-hmi-text"));
    const selected = marked.length === 1 ? marked : candidates;
    return selected.length === 1 ? { host: selected[0], nodes: [...selected[0].childNodes].filter((node) => node.nodeType === 3) } : null;
  };
  const fontHost = (element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml") return null;
    if (/^(input|textarea|select)$/.test(element.localName)) return element;
    return textNodes(element)?.host ?? null;
  };
  const decorationLines = (element, computed = root.defaultView?.getComputedStyle(element) ?? element.style) => {
    return new Set((computed.textDecorationLine || computed.textDecoration || "").split(/\s+/).filter((line) => ["underline", "line-through", "overline", "blink"].includes(line)));
  };
  const scopedDecorations = (element, font, computedStyles) => {
    const result = new Map();
    for (let current = font; current; current = current.parentElement) {
      result.set(current, decorationLines(current, computedStyles?.get(current)));
      if (current === element) break;
    }
    return result;
  };
  const fontFamilyName = (value) => {
    const match = /^\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,]+))/.exec(value);
    if (!match) return null;
    return (match[1] ?? match[2] ?? match[3]).trim().replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex, character) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd) : character);
  };
  const fontFamilyCss = (value) => {
    if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i.test(value)) return value.toLowerCase();
    const quote = value.includes('"') && !value.includes("'") ? "'" : '"';
    return quote + value.replace(/\\/g, "\\\\").replaceAll(quote, "\\" + quote) + quote;
  };
  const pixelLength = (value) => {
    const [mantissa, exponent] = String(value).split(/e/i);
    if (exponent === undefined) return mantissa + "px";
    const digits = mantissa.replace(".", ""), point = (mantissa.includes(".") ? mantissa.indexOf(".") : mantissa.length) + Number(exponent);
    return (point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point)) + "px";
  };
  const colorNumber = (value) => {
    if (/^#[0-9a-f]{6}$/i.test(value)) return Number("0xff" + value.slice(1));
    const rgb = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(value);
    if (!rgb) return value === "transparent" ? 0 : undefined;
    const channels = rgb.slice(1, 4).map(Number), alpha = rgb[4] == null ? 1 : Number(rgb[4]);
    if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return undefined;
    return (Math.round(alpha * 255) * 0x1000000 + Math.round(channels[0]) * 0x10000 + Math.round(channels[1]) * 0x100 + Math.round(channels[2])) >>> 0;
  };
  const snapshotProperties = (element) => {
    const computed = root.defaultView?.getComputedStyle(element) ?? element.style;
    const px = (name, fallback) => /^-?[\d.]+px$/.test(computed[name]) ? Math.round(parseFloat(computed[name])) : Math.round(fallback || 0);
    const values = { Left: px("left", element.offsetLeft), Top: px("top", element.offsetTop), Width: Math.round(element.offsetWidth || px("width", 0)), Height: Math.round(element.offsetHeight || px("height", 0)),
      Visible: !element.hidden && computed.visibility !== "hidden" && computed.visibility !== "collapse" && computed.display !== "none",
      Enabled: !element.hasAttribute("disabled") && !element.hasAttribute("inert") && element.getAttribute("aria-disabled") !== "true" && computed.pointerEvents !== "none" };
    const text = textNodes(element);
    if (text) values.Text = text.nodes.map((node) => node.data).join("");
    const font = fontHost(element);
    if (font) {
      const computedStyles = new Map([[element, computed]]);
      const inherited = (name) => {
        for (let current = font; current; current = current.parentElement) {
          if (!computedStyles.has(current)) computedStyles.set(current, root.defaultView?.getComputedStyle(current) ?? current.style);
          const value = computedStyles.get(current).getPropertyValue(name);
          if (value && !["inherit", "unset"].includes(value)) return value;
        }
        return "";
      };
      const size = inherited("font-size"), weight = inherited("font-weight"), italic = inherited("font-style");
      const lines = new Set([...scopedDecorations(element, font, computedStyles).values()].flatMap((entries) => [...entries]));
      values["Font.Name"] = fontFamilyName(inherited("font-family"));
      values["Font.Size"] = /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?px$/i.test(size) && Number.isFinite(parseFloat(size)) ? parseFloat(size) : null;
      values["Font.Weight"] = weight === "normal" ? 400 : weight === "bold" ? 700 : /^\d+$/.test(weight) ? Number(weight) : null;
      values["Font.Italic"] = italic === "normal" ? false : /^(italic|oblique)(?:\s|$)/.test(italic) ? true : null;
      values["Font.Underline"] = lines.has("underline");
      values["Font.StrikeOut"] = lines.has("line-through") ? 1 : 0;
    }
    for (const property of Object.keys(stems)) {
      const color = colorNumber(element.style.getPropertyValue(cssProperties[property]) || baseColors.get(element)?.[property] || computed.getPropertyValue(cssProperties[property]));
      values[property] = color ?? null;
    }
    return values;
  };
  const restoreProperties = (element) => {
    const entries = propertyBefore.get(element);
    if (!entries) return;
    for (const entry of [...entries].reverse()) {
      if (entry.kind === "style") {
        const target = entry.target ?? element;
        if (target.style.getPropertyValue(entry.name) !== entry.applied || target.style.getPropertyPriority(entry.name) !== entry.appliedPriority) continue;
        if (entry.value) target.style.setProperty(entry.name, entry.value, entry.priority);
        else target.style.removeProperty(entry.name);
      } else if (entry.kind === "attribute") {
        if (element.getAttribute(entry.name) !== entry.applied) continue;
        if (entry.value === null) element.removeAttribute(entry.name);
        else element.setAttribute(entry.name, entry.value);
      } else if (entry.node.data === entry.applied) {
        if (createdText.has(entry.node) && !propertyOverrides.get(identifyItem(element))?.has("Text")) entry.node.remove();
        else entry.node.data = entry.value;
      }
    }
    propertyBefore.delete(element);
  };
  const applyProperties = (element) => {
    const overrides = propertyOverrides.get(identifyItem(element));
    if (!overrides?.size) return;
    const entries = [];
    const style = (name, value, target = element) => {
      const entry = { kind: "style", target, name, value: target.style.getPropertyValue(name), priority: target.style.getPropertyPriority(name) };
      if (entry.value === value) return;
      const priority = entry.priority || target.style.getPropertyPriority(name.startsWith("font-") ? "font" : name === "text-decoration-line" ? "text-decoration" : name) || (name.startsWith("font-") || name === "text-decoration-line" ? "important" : "");
      target.style.setProperty(name, value, priority);
      entries.push({ ...entry, applied: target.style.getPropertyValue(name), appliedPriority: target.style.getPropertyPriority(name) });
    };
    const attribute = (name, value) => {
      const previous = element.getAttribute(name);
      if (previous === value) return;
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      entries.push({ kind: "attribute", name, value: previous, applied: value });
    };
    const computed = root.defaultView?.getComputedStyle(element);
    const font = fontHost(element);
    if (font && (overrides.has("Font.Underline") || overrides.has("Font.StrikeOut"))) {
      const decorations = scopedDecorations(element, font);
      const previous = new Map([...decorations].map(([target, lines]) => [target, [...lines].join(" ")]));
      for (const [property, line] of [["Font.Underline", "underline"], ["Font.StrikeOut", "line-through"]]) {
        if (!overrides.has(property)) continue;
        if (!overrides.get(property)) for (const lines of decorations.values()) lines.delete(line);
        else if (![...decorations.values()].some((lines) => lines.has(line))) decorations.get(font).add(line);
      }
      for (const [target, lines] of decorations) if ([...lines].join(" ") !== previous.get(target)) style("text-decoration-line", [...lines].join(" ") || "none", target);
    }
    if ((overrides.has("Left") || overrides.has("Top")) && (!computed?.position || computed.position === "static")) {
      const left = element.offsetLeft || 0, top = element.offsetTop || 0;
      style("position", "absolute");
      if (!overrides.has("Left")) style("left", left + "px");
      if (!overrides.has("Top")) style("top", top + "px");
    }
    if (overrides.has("Width") || overrides.has("Height")) style("box-sizing", "border-box");
    for (const [property, value] of overrides) {
      if (property === "Text") {
        const text = textNodes(element);
        if (!text) continue;
        if (!text.nodes.length) { const node = root.createTextNode(""); createdText.add(node); text.host.appendChild(node); text.nodes.push(node); }
        text.nodes.forEach((node, index) => {
          const applied = index === 0 ? value : "";
          if (node.data !== applied || createdText.has(node)) entries.push({ kind: "text", node, value: node.data, applied });
          if (node.data !== applied) node.data = applied;
        });
      } else if (Object.hasOwn(fontCssProperties, property)) {
        if (font) style(fontCssProperties[property], property === "Font.Name" ? fontFamilyCss(value) : property === "Font.Size" ? pixelLength(value) : property === "Font.Weight" ? (value === 0 ? "normal" : String(value)) : value ? "italic" : "normal", font);
      } else if (property === "Enabled") {
        attribute("inert", value ? null : "");
        attribute("aria-disabled", value ? "false" : "true");
        if ("disabled" in element) attribute("disabled", value ? null : "");
        style("pointer-events", value ? "auto" : "none");
      } else if (Object.hasOwn(cssProperties, property)) {
        if (property === "Visible" && value) { attribute("hidden", null); if (computed?.display === "none") style("display", "revert"); }
        style(cssProperties[property], property === "Visible" ? (value ? "visible" : "hidden") : stems[property] ? cssColor("#" + value.toString(16).padStart(8, "0")) : value + "px");
      }
    }
    if (entries.length) propertyBefore.set(element, entries);
  };
  const allowsReactions = (element) => {
    for (let current = element; current?.nodeType === 1; current = current.parentElement) {
      if (current.getAttribute("data-fc-reacts") === "false") return false;
      if (current.getAttribute("data-fc-user-requires") && current.getAttribute("data-fc-user-granted") !== "true") return false;
      if (current.getAttribute("data-fc-user-visible-requires") && current.getAttribute("data-fc-user-visible-granted") !== "true") return false;
    }
    return true;
  };
  const allowsInteraction = (element) => {
    if (!allowsReactions(element)) return false;
    for (let current = element; current?.nodeType === 1; current = current.parentElement) {
      const properties = propertyOverrides.get(identifyItem(current));
      if (properties?.get("Enabled") === false || properties?.get("Visible") === false) return false;
      if (current.hasAttribute("disabled") || current.hasAttribute("inert") || current.hasAttribute("hidden") || current.getAttribute("aria-disabled") === "true" || current.style?.pointerEvents === "none" || current.style?.visibility === "hidden" || current.style?.display === "none") return false;
    }
    return true;
  };
  const interactionEvents = ["click", "dblclick", "contextmenu", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup", "input", "change", "submit", "focusin", "framecraft:interface-event", "framecraft:faceplate-event", "framecraft:command-fired"];
  const guardInteraction = (event) => {
    if (!interactionEnabled()) return;
    const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (element && !allowsInteraction(element)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  for (const type of interactionEvents) root.addEventListener(type, guardInteraction, true);
  const restore = (element) => {
    baseColors.delete(element);
    const base = before.get(element);
    if (!base) return;
    for (const [name, entry] of base) {
      if (entry.value) element.style.setProperty(name, entry.value, entry.priority);
      else element.style.removeProperty(name);
    }
    before.delete(element);
  };
  const render = (element) => {
    restore(element);
    restoreProperties(element);
    if (suspendDepth || !element.isConnected || !element.style) return;
    applyProperties(element);
    const visuals = new Map((declarative.get(element) ?? []).map((visual) => [visual.property, visual]));
    for (const entry of scripted.get(identifyItem(element)) ?? []) {
      if (entry.enabled) visuals.set(entry.property, entry);
      else visuals.delete(entry.property);
    }
    if (!visuals.size) return;
    const computed = root.defaultView?.getComputedStyle(element);
    baseColors.set(element, Object.fromEntries(Object.keys(stems).map((property) => [property, computed?.getPropertyValue(cssProperties[property]) ?? ""])));
    const names = ["animation", ...Object.values(stems).flatMap((stem) => ["--framecraft-hmi-flash-" + stem + "-color", "--framecraft-hmi-flash-" + stem + "-alternate"])];
    before.set(element, new Map(names.map((name) => [name, { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }])));
    const animations = [];
    for (const visual of visuals.values()) {
      const stem = stems[visual.property];
      if (!stem) continue;
      element.style.setProperty("--framecraft-hmi-flash-" + stem + "-color", cssColor(visual.color));
      element.style.setProperty("--framecraft-hmi-flash-" + stem + "-alternate", cssColor(visual.alternateColor));
      animations.push("framecraft-hmi-flash-" + stem + " " + visual.periodMs + "ms steps(1, end) infinite");
    }
    const baseAnimation = before.get(element).get("animation").value;
    element.style.animation = (baseAnimation && baseAnimation !== "none" ? baseAnimation + ", " : "") + animations.join(", ");
  };
  return {
    items() {
      for (const element of [...before.keys()]) if (!element.isConnected) restore(element);
      for (const element of [...propertyBefore.keys()]) if (!element.isConnected) { propertyOverrides.delete(identifyItem(element)); restoreProperties(element); }
      for (const element of declarative.keys()) if (!element.isConnected) declarative.delete(element);
      targets.clear();
      const defaultScreen = root.querySelector("[data-hmi-screen], [data-hmi-type='HmiScreen']") ?? root.body ?? root.documentElement;
      if (!defaultScreen) return [];
      const elements = new Set([defaultScreen, ...root.querySelectorAll("[data-hmi-name], [data-hmi-type], [data-hmi-screen], [data-hmi-faceplate], [data-hmi-events], [data-hmi-dynamizations], [id]")]);
      const items = [];
      for (const element of elements) {
        if (!element.style) continue;
        const itemId = identifyItem(element);
        targets.set(itemId, element);
        let flashing = [];
        try { const bindings = JSON.parse(element.getAttribute("data-hmi-dynamizations") ?? "[]"); if (Array.isArray(bindings)) flashing = bindings.filter((binding) => binding?.kind === "Flashing"); } catch { /* Invalid configuration is reported by the HMI validator. */ }
        const screen = element.closest("[data-hmi-screen], [data-hmi-type='HmiScreen']") ?? defaultScreen;
        const faceplate = element.closest("[data-hmi-faceplate]");
        items.push({ itemId, name: element.getAttribute("data-hmi-name") || element.id || element.getAttribute("data-hmi-screen") || "", screenId: identifyItem(screen), faceplateId: faceplate ? identifyItem(faceplate) : undefined, flashing, properties: snapshotProperties(element) });
      }
      for (const itemId of scripted.keys()) if (!targets.has(itemId)) scripted.delete(itemId);
      for (const itemId of propertyOverrides.keys()) if (!targets.has(itemId)) propertyOverrides.delete(itemId);
      return items;
    },
    apply(commands) {
      const affected = new Set(scripted.keys());
      scripted.clear();
      for (const command of commands) {
        if (!stems[command.property] || typeof command.enabled !== "boolean" || ![2000, 1000, 500].includes(command.periodMs)) continue;
        if (command.enabled && (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(command.color) || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(command.alternateColor))) continue;
        if (!scripted.has(command.itemId)) scripted.set(command.itemId, []);
        scripted.get(command.itemId).push(command);
        affected.add(command.itemId);
      }
      for (const itemId of affected) { const element = targets.get(itemId); if (element) render(element); }
    },
    applyProperties(commands) {
      const next = new Map();
      for (const command of commands) {
        if (!command || typeof command.itemId !== "string" || !targets.has(command.itemId)) continue;
        const { property, value } = command;
        if (!Object.hasOwn(cssProperties, property) && !["Text", "Enabled", ...fontProperties].includes(property)) continue;
        if (["Enabled", "Visible", "Font.Italic", "Font.Underline"].includes(property) ? typeof value !== "boolean"
          : property === "Text" || property === "Font.Name" ? typeof value !== "string" || value.length > 20000 || (property === "Font.Name" && /[\u0000-\u001f\u007f]/.test(value))
          : property === "Font.Size" ? typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isFinite(Math.fround(value))
          : property === "Font.Weight" ? ![0, 300, 400, 600, 700].includes(value)
          : property === "Font.StrikeOut" ? ![0, 1].includes(value)
          : typeof value !== "number" || !Number.isInteger(value) || value < (["Left", "Top"].includes(property) ? -2147483648 : 0) || value > (["Left", "Top"].includes(property) ? 2147483647 : 0xffffffff)) continue;
        if (property === "Text" && !textNodes(targets.get(command.itemId))) continue;
        if (fontProperties.includes(property) && !fontHost(targets.get(command.itemId))) continue;
        if (!next.has(command.itemId)) next.set(command.itemId, new Map());
        next.get(command.itemId).set(property, value);
      }
      const affected = new Set([...propertyOverrides.keys(), ...next.keys()]);
      const changed = [...affected].filter((id) => JSON.stringify([...(propertyOverrides.get(id) ?? [])]) !== JSON.stringify([...(next.get(id) ?? [])]));
      propertyOverrides.clear();
      for (const [id, properties] of next) propertyOverrides.set(id, properties);
      for (const id of changed) { const element = targets.get(id); if (element) render(element); }
    },
    allowsInteraction,
    allowsReactions,
    setDeclarative(element, visuals) { declarative.set(element, visuals); targets.set(identifyItem(element), element); render(element); },
    suspend() { if (++suspendDepth !== 1) return; for (const element of [...before.keys()]) restore(element); for (const element of [...propertyBefore.keys()]) restoreProperties(element); },
    resume() { suspendDepth = Math.max(0, suspendDepth - 1); if (suspendDepth) return; for (const element of new Set([...declarative.keys(), ...[...scripted.keys(), ...propertyOverrides.keys()].map((id) => targets.get(id)).filter(Boolean)])) render(element); },
    dispose() { scripted.clear(); propertyOverrides.clear(); for (const element of [...before.keys()]) restore(element); for (const element of [...propertyBefore.keys()]) restoreProperties(element); declarative.clear(); targets.clear(); for (const type of interactionEvents) root.removeEventListener(type, guardInteraction, true); },
  };
}
