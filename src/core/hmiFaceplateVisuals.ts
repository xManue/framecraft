import type {
  HmiFaceplateCatalog,
  HmiFaceplateInstanceBinding,
  HmiFaceplateTypeDefinition,
  HmiFaceplateVisualBinding,
  HmiFaceplateVisualObject,
} from "./hmiFaceplates";

export interface HmiFaceplateVisualRenderOptions {
  localValues?: (host: Element, type: HmiFaceplateTypeDefinition, binding: HmiFaceplateInstanceBinding) => Readonly<Record<string, string>> | undefined;
}

function visualTruthy(value: unknown): boolean {
  return !/^(?:|0|false|no|off)$/i.test(String(value ?? "").trim());
}

function visualColor(value: unknown): string {
  const text = String(value ?? "");
  const hex = text.replace("#", "");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return text;
  const alpha = Number.parseInt(hex.slice(0, 2), 16);
  const red = Number.parseInt(hex.slice(2, 4), 16);
  const green = Number.parseInt(hex.slice(4, 6), 16);
  const blue = Number.parseInt(hex.slice(6, 8), 16);
  return alpha === 255 ? `#${hex.slice(2)}` : `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`;
}

function visualBindingValue(binding: HmiFaceplateVisualBinding, type: HmiFaceplateTypeDefinition, instance: HmiFaceplateInstanceBinding, values: Readonly<Record<string, string>>, locals: Readonly<Record<string, string>>): unknown {
  if (binding.source === "tag") {
    const projectTag = instance.tagBindings[binding.name];
    return projectTag ? values[projectTag] : instance.propertyValues[binding.name];
  }
  if (binding.source === "local") return locals[binding.name] ?? type.localTags.find((tag) => tag.name === binding.name)?.startValue;
  return instance.propertyValues[binding.name] ?? type.interfaceProperties.find((property) => property.name === binding.name)?.defaultValue;
}

function visualElement(object: HmiFaceplateVisualObject): HTMLElement {
  const element = object.type === "button" ? document.createElement("button")
    : object.type === "io-field" ? document.createElement("output")
      : object.type === "graphic" ? document.createElement("img")
        : object.type === "text" ? document.createElement("span") : document.createElement("div");
  const hmiType = { rectangle: "HmiRectangle", ellipse: "HmiEllipse", text: "HmiTextBox", "io-field": "HmiIOField", button: "HmiButton", bar: "HmiBar", graphic: "HmiGraphicView" }[object.type];
  element.dataset.hmiType = hmiType;
  element.dataset.hmiFaceplateObject = object.id;
  element.dataset.hmiName = object.id;
  if (element instanceof HTMLButtonElement) element.type = "button";
  if (element instanceof HTMLImageElement) element.alt = object.text ?? object.id;
  Object.assign(element.style, {
    position: "absolute", boxSizing: "border-box", left: `${object.left}px`, top: `${object.top}px`,
    width: `${object.width}px`, height: `${object.height}px`, display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", border: `1px solid ${visualColor(object.borderColor ?? "#FF8A949B")}`,
    borderRadius: object.type === "ellipse" ? "50%" : "3px", background: visualColor(object.backColor ?? (object.type === "button" ? "#FF3F464C" : "#FFF4F6F7")),
    color: visualColor(object.foreColor ?? (object.type === "button" ? "#FFFFFFFF" : "#FF20262B")),
    font: `${object.fontSize ?? 12}px/1.25 system-ui,sans-serif`, textAlign: "center",
  });
  if (object.type === "bar") {
    const fill = document.createElement("i");
    fill.dataset.hmiFaceplateBarFill = "";
    Object.assign(fill.style, { display: "block", width: "0%", height: "100%", marginRight: "auto", background: visualColor(object.backColor ?? "#FF00A1D1") });
    element.style.background = "#E5E7E9";
    element.append(fill);
  } else if (object.type === "graphic" && object.graphic) (element as HTMLImageElement).src = object.graphic;
  else element.textContent = object.text ?? "";
  return element;
}

function applyVisualBinding(element: HTMLElement, binding: HmiFaceplateVisualBinding, value: unknown) {
  if (value === undefined || value === null) return;
  const text = String(value);
  const number = Number(value);
  if (binding.property === "Text") element.textContent = text;
  else if (binding.property === "ProcessValue") {
    const fill = element.querySelector<HTMLElement>("[data-hmi-faceplate-bar-fill]");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, Number.isFinite(number) ? number : 0))}%`;
    else element.textContent = text;
  } else if (binding.property === "BackColor") {
    const fill = element.querySelector<HTMLElement>("[data-hmi-faceplate-bar-fill]");
    (fill ?? element).style.backgroundColor = visualColor(value);
  } else if (binding.property === "ForeColor") element.style.color = visualColor(value);
  else if (binding.property === "BorderColor") element.style.borderColor = visualColor(value);
  else if (binding.property === "Visible") element.style.visibility = visualTruthy(value) ? "visible" : "hidden";
  else if (binding.property === "Enabled") {
    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) element.disabled = !visualTruthy(value);
    else { element.style.pointerEvents = visualTruthy(value) ? "auto" : "none"; element.style.opacity = visualTruthy(value) ? "1" : ".55"; }
  } else if (["Left", "Top", "Width", "Height"].includes(binding.property) && Number.isFinite(number)) {
    const css = binding.property.toLowerCase() as "left" | "top" | "width" | "height";
    element.style[css] = `${number}px`;
  } else if (binding.property === "Graphic" && element instanceof HTMLImageElement) element.src = text;
}

function visualEventParameters(object: HmiFaceplateVisualObject): Record<string, string | number | boolean> {
  return object.event?.parameters ?? {};
}

function nestedBinding(parent: HmiFaceplateInstanceBinding, nested: HmiFaceplateTypeDefinition["nestedInstances"][number]): HmiFaceplateInstanceBinding {
  return {
    typeId: nested.typeId, version: nested.version,
    tagBindings: Object.fromEntries(Object.entries(nested.tagBindings).flatMap(([inner, outer]) => parent.tagBindings[outer] ? [[inner, parent.tagBindings[outer]]] : [])),
    propertyValues: Object.fromEntries(Object.entries(nested.propertyBindings).flatMap(([inner, outer]) => parent.propertyValues[outer] !== undefined ? [[inner, parent.propertyValues[outer]]] : [])),
    eventBindings: {},
  };
}

export function renderHmiFaceplateInstance(host: HTMLElement, catalog: HmiFaceplateCatalog, instance: HmiFaceplateInstanceBinding, values: Readonly<Record<string, string>>, options: HmiFaceplateVisualRenderOptions = {}, stack: readonly string[] = []): boolean {
  const type = catalog.types.find((candidate) => candidate.id === instance.typeId && candidate.version === instance.version);
  if (!type || (!type.visualization.length && !type.nestedInstances.length)) return false;
  const key = `${type.id}@${type.version}`;
  if (stack.includes(key)) return false;
  const currentCanvas = Array.from(host.children).find((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-hmi-faceplate-visual-root"));
  if (!currentCanvas && Array.from(host.children).some((child) => child instanceof HTMLElement)) return false;
  const locals = options.localValues?.(host, type, instance) ?? {};
  const usedValues = Object.fromEntries(Object.values(instance.tagBindings).map((tag) => [tag, values[tag]]));
  const signature = JSON.stringify([key, type.visualization, type.nestedInstances, instance, usedValues, locals]);
  if (host.dataset.framecraftFaceplateVisualSignature === signature) return true;
  host.dataset.framecraftFaceplateVisualSignature = signature;
  host.style.position = host.style.position || "relative";
  host.style.overflow = "hidden";
  const canvas = document.createElement("div");
  canvas.dataset.hmiFaceplateVisualRoot = "";
  canvas.dataset.hmiFaceplateVisualization = key;
  Object.assign(canvas.style, { position: "relative", width: `${type.width}px`, height: `${type.height}px`, overflow: "hidden" });
  for (const object of type.visualization) {
    const element = visualElement(object);
    for (const binding of object.bindings) applyVisualBinding(element, binding, visualBindingValue(binding, type, instance, values, locals));
    if (object.event && element instanceof HTMLButtonElement) element.addEventListener("click", () => element.dispatchEvent(new CustomEvent("framecraft:faceplate-event", { bubbles: true, detail: { name: object.event!.name, parameters: visualEventParameters(object) } })));
    canvas.append(element);
  }
  for (const nested of type.nestedInstances) {
    const element = document.createElement("div");
    element.dataset.hmiType = "HmiFaceplateContainer";
    element.dataset.hmiFaceplateNested = nested.id;
    element.dataset.hmiName = nested.id;
    const binding = nestedBinding(instance, nested);
    element.dataset.hmiFaceplate = JSON.stringify(binding);
    Object.assign(element.style, { position: "absolute", left: `${nested.left}px`, top: `${nested.top}px`, width: `${nested.width}px`, height: `${nested.height}px`, overflow: "hidden" });
    canvas.append(element);
    renderHmiFaceplateInstance(element, catalog, binding, values, options, [...stack, key]);
  }
  if (currentCanvas) currentCanvas.replaceWith(canvas);
  else {
    for (const child of Array.from(host.childNodes)) if (child.nodeType === 3) child.remove();
    host.append(canvas);
  }
  return true;
}

function runtimeFaceplateName(value: string): string {
  return value.trim().replace(/[.\\/ ]+/g, "_").replace(/_+/g, "_").toLocaleLowerCase();
}

export function findHmiFaceplateRuntimeType(catalog: HmiFaceplateCatalog, runtimeName: string): HmiFaceplateTypeDefinition | undefined {
  const wanted = runtimeFaceplateName(runtimeName);
  return catalog.types.find((type) => {
    const version = type.version.replaceAll(".", "_");
    return [type.id, type.name, `${type.name}_V_${version}`, `V_${version}_${type.name}`, `V${version}_${type.name}`].some((candidate) => runtimeFaceplateName(candidate) === wanted);
  });
}

function popupBinding(type: HmiFaceplateTypeDefinition, raw: unknown): HmiFaceplateInstanceBinding {
  const values = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const tagBindings: Record<string, string> = {};
  const propertyValues: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value && typeof value === "object" && !Array.isArray(value) && "Tag" in value && typeof value.Tag === "string") tagBindings[name] = value.Tag;
    else if (["string", "number", "boolean"].includes(typeof value)) propertyValues[name] = value as string | number | boolean;
  }
  return { typeId: type.id, version: type.version, tagBindings, propertyValues, eventBindings: {} };
}

export function renderHmiFaceplates(root: ParentNode, catalog: HmiFaceplateCatalog, values: Readonly<Record<string, string>>, options: HmiFaceplateVisualRenderOptions = {}): number {
  for (const popup of root.querySelectorAll<HTMLElement>("[data-hmi-popup-faceplate-type]")) {
    const type = findHmiFaceplateRuntimeType(catalog, popup.dataset.hmiPopupFaceplateType ?? "");
    if (!type) continue;
    let raw: unknown = {};
    try { raw = JSON.parse(popup.dataset.hmiPopupInterface ?? "{}"); } catch { /* render with defaults */ }
    const serialized = JSON.stringify(popupBinding(type, raw));
    if (popup.dataset.hmiFaceplate !== serialized) popup.dataset.hmiFaceplate = serialized;
    popup.style.width = `${type.width}px`; popup.style.height = `${type.height}px`;
  }
  let rendered = 0;
  for (const host of root.querySelectorAll<HTMLElement>("[data-hmi-faceplate]")) {
    if (host.parentElement?.closest("[data-hmi-faceplate]")) continue;
    let binding: HmiFaceplateInstanceBinding | undefined;
    try { binding = JSON.parse(host.dataset.hmiFaceplate ?? "null") as HmiFaceplateInstanceBinding; } catch { binding = undefined; }
    if (binding?.typeId && renderHmiFaceplateInstance(host, catalog, binding, values, options)) rendered += 1;
  }
  return rendered;
}

export function hmiFaceplateVisualRuntimeModuleSource(): string {
  return `// @ts-nocheck\n${String(visualTruthy)}\n${String(visualColor)}\n${String(visualBindingValue)}\n${String(visualElement)}\n${String(applyVisualBinding)}\n${String(visualEventParameters)}\n${String(nestedBinding)}\nexport ${String(renderHmiFaceplateInstance)}\n${String(runtimeFaceplateName)}\nexport ${String(findHmiFaceplateRuntimeType)}\n${String(popupBinding)}\nexport ${String(renderHmiFaceplates)}\n`;
}
