import { Activity, Box, Boxes, Cable, ChevronDown, ChevronsUpDown, Code2, Copy, CopyPlus, Database, Highlighter, Image as ImageIcon, Info, KeyRound, Languages, LayoutGrid, Lock, LogIn, MousePointerClick, Move, Palette, Plus, RefreshCw, Ruler, Save, ShieldCheck, SlidersHorizontal, SquareMousePointer, Tags, Trash2, Type as TypeIcon, Upload, Users, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { EditorNode, SelectionItem } from "../core/types";
import { ElementTransformControls } from "./ElementTransformControls";
import { EditableTextField } from "./EditableTextField";
import { readHighlightRegion } from "../core/highlightRegion";
import { handlersNavigate, type ActionValue, type HandlerBinding, type InteractionAction, type InteractionReport } from "../core/interactions";
import type { ListItemProperty } from "../source-parser/listData";
import type { ValueUse } from "../core/projectIndex";
import { insideProject } from "../core/paths";
import { editableSummary, isEditableFile, type TemplateContract } from "../core/templateContract";
import { plcTagsInSource } from "../core/plcVariables";
import { plcVariablesMatching } from "../core/tagImport";
import { availableDynamizedProperties, hmiDynamizationAttribute, newHmiDynamization, parseHmiDynamizations, removeHmiDynamization, replaceHmiDynamization, serializeHmiDynamizations } from "../core/hmiDynamizations";
import { hmiFlashingContrast, hmiFlashingProperties } from "../core/hmiFlashing";
import { inspectHmiExpression } from "../core/hmiExpression";
import { inspectHmiScript } from "../core/hmiScript";
import { hmiScriptFunctions, hmiScriptGlobalDefinition, hmiScriptVariables } from "../core/hmiScriptModules";
import { hmiEventLabels, hmiEventsAttribute, hmiEventTypesFor, parseHmiEvents, serializeHmiEvents, type HmiEventBinding, type HmiEventType } from "../core/hmiEvents";
import { guidedActionLabels, guidedActionScript, newGuidedAction, readGuidedAction, type GuidedActionKind } from "../core/hmiActions";
import { hmiFaceplateAttribute, hmiFaceplateBindingIssues, parseHmiFaceplateBinding, serializeHmiFaceplateBinding, type HmiFaceplateEventBinding, type HmiFaceplateEventDefinition, type HmiFaceplateInstanceBinding } from "../core/hmiFaceplates";
import { defaultHmiTrendConfig, hmiTrendAttribute, hmiTrendIssues, hmiTrendModes, parseHmiTrendConfig, serializeHmiTrendConfig, type HmiTrendArea, type HmiTrendAxis, type HmiTrendConfig, type HmiTrendMode, type HmiTrendSeries } from "../core/hmiTrend";
import { defaultHmiFunctionTrendConfig, hmiFunctionTrendAttribute, hmiFunctionTrendIssues, parseHmiFunctionTrendConfig, serializeHmiFunctionTrendConfig, type HmiFunctionTrendConfig, type HmiFunctionTrendSeries, type HmiFunctionTrendSource } from "../core/hmiFunctionTrend";
import { dynamizedProperties, type Dynamization, type MappingConditionType } from "../core/hmiStandard";
import { highlightShapePath, insertPathAnchor, movePathAnchor, pathAnchors, pathBounds, pathClosed, setPathClosed, transformPathToBounds, type PathBounds } from "../core/svgPathGeometry";
import { useEditorStore, type ListBinding, type SelectionProblem } from "../state/editorStore";
import { translatedCoordinate } from "./coordinates";
import { borderStyles, formatBorder, parseBorder, type BorderParts } from "./borderValue";

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

const elementNames: Record<string, string> = {
  button: "Pulsante", a: "Collegamento", img: "Immagine", input: "Campo", textarea: "Campo di testo",
  select: "Menu a scelta", label: "Etichetta", span: "Testo", p: "Paragrafo", h1: "Titolo", h2: "Titolo",
  h3: "Titolo", div: "Contenitore", section: "Sezione", article: "Scheda", nav: "Menu", ul: "Elenco", li: "Voce",
  svg: "Disegno", g: "Gruppo interattivo", rect: "Forma", path: "Contorno", circle: "Cerchio", text: "Testo nel disegno",
};

function elementName(type?: string) {
  return type ? elementNames[type] ?? type : "Elemento";
}

const propertyTabs = [
  { id: "appearance", label: "Aspetto", description: "Testo, immagini, dimensioni, colori e ordine degli elementi." },
  { id: "actions", label: "Azioni", description: "Cosa succede al click, evidenziazioni, accesso ed eventi." },
  { id: "data", label: "PLC e dati", description: "Variabili, dinamiche, faceplate e configurazione delle curve." },
  { id: "details", label: "Altro", description: "Proprietà CSS, attributi e dettagli tecnici dell’elemento." },
] as const;
type PropertyTab = typeof propertyTabs[number]["id"];

function InspectorSection({ title, icon, children, initiallyOpen = false, expandSignal }: { title: string; icon: ReactNode; children: ReactNode; initiallyOpen?: boolean; expandSignal?: number }) {
  const [open, setOpen] = useState(initiallyOpen);
  const previousExpand = useRef(expandSignal);
  useEffect(() => {
    if (expandSignal && expandSignal !== previousExpand.current) setOpen(true);
    previousExpand.current = expandSignal;
  }, [expandSignal]);
  return <section className={`inspector-section ${open ? "open" : ""}`}>
    <button className="inspector-section-title" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {icon}<span>{title}</span><ChevronDown size={13} />
    </button>
    {open && <div className="inspector-section-fields">{children}</div>}
  </section>;
}

function StyleField({ label, property, value, disabled, placeholder = "—", group = false }: { label: string; property: string; value?: string | number; disabled?: boolean; placeholder?: string; group?: boolean }) {
  const updateOne = useEditorStore((state) => state.updateStyle);
  const updateGroup = useEditorStore((state) => state.updateMultiSelectionStyles);
  const update = (name: string, next: string | number) => group ? updateGroup({ [name]: next }) : updateOne(name, next);
  const [draft, setDraft] = useState(String(value ?? ""));
  const cancelled = useRef(false);
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);
  return <label className="property-field"><span>{label}</span><input value={draft} disabled={disabled} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { cancelled.current = true; setDraft(String(value ?? "")); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft !== String(value ?? "") && draft.trim()) void update(property, draft.trim());
  }} /></label>;
}

function NumberStyleField({ label, property, value, fallback, unit = "px", disabled, group = false }: { label: string; property: string; value?: string | number; fallback?: number; unit?: string; disabled?: boolean; group?: boolean }) {
  const updateOne = useEditorStore((state) => state.updateStyle);
  const updateGroup = useEditorStore((state) => state.updateMultiSelectionStyles);
  const update = (name: string, next: string | number) => group ? updateGroup({ [name]: next }) : updateOne(name, next);
  const numericValue = Number.parseFloat(String(value ?? fallback ?? ""));
  const shownUnit = String(value ?? "").match(/^[+-]?[\d.]+\s*([a-z]+|%)$/i)?.[1] ?? unit;
  const [draft, setDraft] = useState(Number.isFinite(numericValue) ? String(numericValue) : "");
  const cancelled = useRef(false);
  useEffect(() => {
    const next = Number.parseFloat(String(value ?? fallback ?? ""));
    setDraft(Number.isFinite(next) ? String(next) : "");
  }, [fallback, value]);
  return <label className="property-field numeric-field"><span>{label}</span><span className="property-input-with-unit"><input type="number" step="any" value={draft} disabled={disabled} placeholder="—" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { cancelled.current = true; setDraft(Number.isFinite(numericValue) ? String(numericValue) : ""); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (cancelled.current) { cancelled.current = false; return; }
    const next = Number(draft);
    if (draft !== "" && Number.isFinite(next) && next !== numericValue) void update(property, shownUnit ? `${next}${shownUnit}` : next);
  }} /><small>{shownUnit}</small></span></label>;
}

function CoordinateField({ label, axis, value, translate, disabled }: { label: string; axis: "x" | "y"; value?: number; translate?: string | number; disabled?: boolean }) {
  const update = useEditorStore((state) => state.updateStyle);
  const [draft, setDraft] = useState(value == null ? "" : String(rounded(value)));
  const cancelled = useRef(false);
  useEffect(() => { setDraft(value == null ? "" : String(rounded(value))); }, [value]);
  return <label className="property-field numeric-field"><span>{label}</span><span className="property-input-with-unit"><input type="number" step="1" value={draft} disabled={disabled || value == null} placeholder="—" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { cancelled.current = true; setDraft(value == null ? "" : String(rounded(value))); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (cancelled.current) { cancelled.current = false; return; }
    const next = Number(draft);
    if (draft.trim() && value != null && Number.isFinite(next) && next !== rounded(value)) void update("translate", translatedCoordinate(value, next, translate, axis));
  }} /><small>px</small></span></label>;
}

function StyleSelect({ label, property, value, options, disabled, group = false }: { label: string; property: string; value?: string | number; options: string[]; disabled?: boolean; group?: boolean }) {
  const updateOne = useEditorStore((state) => state.updateStyle);
  const updateGroup = useEditorStore((state) => state.updateMultiSelectionStyles);
  const update = (name: string, next: string | number) => group ? updateGroup({ [name]: next }) : updateOne(name, next);
  const current = String(value ?? "");
  const labels: Record<string, string> = property === "textAlign"
    ? { left: "Sinistra", center: "Centro", right: "Destra", justify: "Giustificato" }
    : property === "fontWeight" ? { "300": "Leggero", "400": "Normale", "500": "Medio", "600": "Semigrassetto", "700": "Grassetto", "800": "Molto marcato", "900": "Massimo" } : {};
  return <label className="property-field"><span>{label}</span><select value={current} disabled={disabled} onChange={(event) => void update(property, event.target.value)}>
    {!current && <option value="">—</option>}
    {current && !options.includes(current) && <option value={current}>{current}</option>}
    {options.map((option) => <option value={option} key={option}>{labels[option] ?? option}</option>)}
  </select></label>;
}

function hexColor(value: string | number | undefined) {
  const color = String(value ?? "");
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const rgb = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  if (!rgb) return "#000000";
  return `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
}

function ColorStyleField({ label, property, value, disabled, group = false }: { label: string; property: string; value?: string | number; disabled?: boolean; group?: boolean }) {
  const updateOne = useEditorStore((state) => state.updateStyle);
  const updateGroup = useEditorStore((state) => state.updateMultiSelectionStyles);
  const update = (name: string, next: string | number) => group ? updateGroup({ [name]: next }) : updateOne(name, next);
  const [draft, setDraft] = useState(String(value ?? ""));
  const cancelled = useRef(false);
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);
  return <label className="property-field color-property"><span>{label}</span><span className="color-property-control">
    <input type="color" value={hexColor(draft)} disabled={disabled} aria-label={`${label}: scegli colore`} onChange={(event) => { setDraft(event.target.value); void update(property, event.target.value); }} />
    <input value={draft} disabled={disabled} placeholder="transparent" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") { cancelled.current = true; setDraft(String(value ?? "")); event.currentTarget.blur(); }
    }} onBlur={() => {
      if (cancelled.current) { cancelled.current = false; return; }
      if (draft.trim() && draft !== String(value ?? "")) void update(property, draft.trim());
    }} />
  </span></label>;
}

/** A border written by hand is three decisions in one text field, and "1px solid #8b8b8b" is not a
 * sentence anybody should have to type to draw a line. The three parts are edited separately and
 * written back as the one property CSS understands. */
function BorderField({ label, property, value, disabled, group = false }: { label: string; property: string; value?: string | number; disabled?: boolean; group?: boolean }) {
  const updateOne = useEditorStore((state) => state.updateStyle);
  const updateGroup = useEditorStore((state) => state.updateMultiSelectionStyles);
  const update = (name: string, next: string | number) => group ? updateGroup({ [name]: next }) : updateOne(name, next);
  const parts = parseBorder(value);
  const [width, setWidth] = useState(String(parts.width));
  const cancelled = useRef(false);
  useEffect(() => { setWidth(String(parts.width)); }, [parts.width]);
  const write = (next: Partial<BorderParts>) => void update(property, formatBorder({ ...parts, ...next }));
  const names: Record<string, string> = { solid: "continuo", dashed: "tratteggiato", dotted: "punteggiato", double: "doppio", none: "nessuno" };
  return <div className="border-field">
    <span>{label}</span>
    <input type="number" min="0" max="40" step="any" value={width} disabled={disabled} aria-label={`${label}: spessore`}
      onChange={(event) => setWidth(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { cancelled.current = true; setWidth(String(parts.width)); event.currentTarget.blur(); }
      }} onBlur={() => {
        if (cancelled.current) { cancelled.current = false; return; }
        const next = Number(width);
        if (width.trim() && Number.isFinite(next) && next !== parts.width) write({ width: Math.max(0, next) });
      }} />
    <select value={parts.style} disabled={disabled} aria-label={`${label}: stile`} onChange={(event) => write({ style: event.target.value })}>
      {borderStyles.map((option) => <option key={option} value={option}>{names[option]}</option>)}
    </select>
    <input type="color" value={hexColor(parts.color)} disabled={disabled} aria-label={`${label}: colore`} onChange={(event) => write({ color: event.target.value })} />
  </div>;
}

const internalProps = new Set(["data-fc-highlight-region", "data-fc-highlight-target", "data-fc-highlight-color", "data-fc-highlight-width", "data-fc-highlight-original-click", "data-fc-highlight-id", "data-fc-highlight-event", "data-fc-reacts", "data-fc-user-access", "data-fc-user-name", "data-fc-user-role", "data-fc-user-pin", "data-fc-user-logged-out", "data-fc-user-event", "data-fc-user-requires", "data-fc-user-granted", "data-fc-user-visible-requires", "data-fc-user-visible-granted", hmiDynamizationAttribute]);

function AttributeField({ name, value }: { name: string; value: string | number }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => { setDraft(String(value)); }, [value]);
  return <label className="property-field"><span title={name}>{name}</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { cancelled.current = true; setDraft(String(value)); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft !== String(value)) void update(name, draft);
  }} /></label>;
}

function DynamicAttributeField({ name }: { name: string }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const [draft, setDraft] = useState("");
  const cancelled = useRef(false);
  return <label className="property-field dynamic-property"><span title={name}>{name}</span><input value={draft} placeholder="sostituisci valore dinamico" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter" && draft.trim()) event.currentTarget.blur();
    if (event.key === "Escape") { cancelled.current = true; setDraft(""); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft.trim()) void update(name, draft).then(() => setDraft(""));
  }} /></label>;
}

function NewAttributeField() {
  const update = useEditorStore((state) => state.updateAttribute);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  return <form className="free-property-editor" onSubmit={(event) => {
    event.preventDefault();
    if (!name.trim()) return;
    void update(name.trim(), value).then(() => { setName(""); setValue(""); });
  }}>
    <span className="free-property-title">Aggiungi attributo</span>
    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="es. aria-label" aria-label="Nome nuovo attributo" />
    <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="valore" aria-label="Valore nuovo attributo" />
    <button type="submit" disabled={!name.trim()}>Applica</button>
  </form>;
}

function AttributesSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const editable = Object.entries(node.props).filter(([name]) => !internalProps.has(name));
  const flags = editable.filter(([, value]) => typeof value === "boolean").map(([name]) => name);
  const fields = editable.filter((pair): pair is [string, string | number] => typeof pair[1] !== "boolean");
  const empty = !fields.length && !flags.length && !node.dynamicProps.length;
  return <InspectorSection title="Attributi" icon={<Tags size={12} />} expandSignal={expandSignal}>
    {empty && <p className="inspector-note">Questo elemento non ha attributi.</p>}
    {fields.map(([name, value]) => <AttributeField key={name} name={name} value={value} />)}
    {flags.map((name) => <div className="property-field read-only-property" key={name}><span title={name}>{name}</span><em>attivo</em></div>)}
    {node.dynamicProps.map((name) => name === "...spread"
      ? <div className="property-field read-only-property" key={name}><span title={name}>{name}</span><em>insieme di attributi</em></div>
      : <DynamicAttributeField key={name} name={name} />)}
    <NewAttributeField />
  </InspectorSection>;
}

function ImageSourceSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const chooseImage = useEditorStore((state) => state.chooseImage);
  const binding = useEditorStore((state) => state.listBinding);
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const imageProperty = binding?.nodeId === node.id
    ? binding.item?.properties.find((property) => {
        const usage = binding.usages?.[property.name];
        return usage?.tag === "img" && usage.attribute === "src";
      })
    : undefined;
  const source = imageProperty?.value ?? (typeof node.props.src === "string" ? node.props.src : "");
  let thumbnail = source;
  try { if (source && previewUrl) thumbnail = new URL(source, previewUrl).href; } catch { /* Keep the visible source as-is. */ }
  return <InspectorSection title="Immagine" icon={<ImageIcon size={12} />} initiallyOpen expandSignal={expandSignal}>
    {thumbnail ? <div className="image-source-preview"><img src={thumbnail} alt="Anteprima dell'immagine selezionata" /><span title={source}>{source}</span></div>
      : <p className="inspector-note">L'immagine attuale arriva da un valore dinamico. Puoi sostituirla con un file.</p>}
    <button type="button" className="image-source-button" onClick={() => void chooseImage(imageProperty?.name)}>
      <Upload size={14} /> Scegli e sostituisci immagine
    </button>
    <p className="inspector-note">Il file viene copiato nel progetto e resta disponibile anche quando lo esporti.</p>
  </InspectorSection>;
}

const suggestedCssProperties = [
  "position", "inset", "left", "top", "right", "bottom", "z-index", "width", "height", "min-width", "min-height",
  "max-width", "max-height", "display", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "place-items",
  "align-self", "justify-self", "flex", "flex-grow", "flex-shrink", "order", "gap", "margin", "padding", "overflow-x", "overflow-y",
  "background", "background-color", "background-image", "color", "border", "border-radius", "box-shadow", "filter", "backdrop-filter",
  "opacity", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "white-space", "word-break",
  "cursor", "pointer-events", "user-select", "transition", "transform", "transform-origin",
];

function FreeStyleEditor({ disabled }: { disabled?: boolean }) {
  const update = useEditorStore((state) => state.updateStyle);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  return <form className="free-property-editor" onSubmit={(event) => {
    event.preventDefault();
    if (!name.trim() || !value.trim()) return;
    void update(name.trim(), value.trim()).then(() => setValue(""));
  }}>
    <span className="free-property-title">Qualsiasi proprietà CSS</span>
    <input list="framecraft-css-properties" value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} placeholder="es. grid-column" aria-label="Nome proprietà CSS" />
    <datalist id="framecraft-css-properties">{suggestedCssProperties.map((property) => <option value={property} key={property} />)}</datalist>
    <input value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} placeholder="es. span 2" aria-label="Valore proprietà CSS" />
    <button type="submit" disabled={disabled || !name.trim() || !value.trim()}>Applica</button>
  </form>;
}

function InfoRow({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return <div className="property-field read-only-property"><span title={label}>{label}</span><em title={title}>{value}</em></div>;
}

/** Wires the selected element to a PLC signal. The binding is written into the source as the
 * attribute the running panel already reads; the catalog file only describes the signal. */
function PlcBindingEditor({ node, bound }: { node: EditorNode; bound?: string }) {
  const catalog = useEditorStore((state) => state.plcVariables);
  const bind = useEditorStore((state) => state.bindPlcVariable);
  const addVariable = useEditorStore((state) => state.addPlcVariable);
  const removeAttribute = useEditorStore((state) => state.removeAttribute);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const [draft, setDraft] = useState(bound ?? "");
  const cancelled = useRef(false);
  useEffect(() => { setDraft(bound ?? ""); }, [bound, node.id]);
  const typed = draft.trim();
  const known = catalog.some((variable) => variable.name === typed);
  const current = catalog.find((variable) => variable.name === bound);
  // A panel's catalog runs to hundreds of signals, so the list is what is being looked for, not
  // everything: a native datalist gave no type, no tag table and no way to see what was matched.
  const matches = useMemo(() => {
    const needle = typed.toLowerCase();
    const scored = catalog.filter((variable) => !needle
      || variable.name.toLowerCase().includes(needle)
      || (variable.table ?? "").toLowerCase().includes(needle)
      || variable.description.toLowerCase().includes(needle));
    return scored.slice(0, 40);
  }, [catalog, typed]);

  return <div className="plc-binding-editor">
    <span className="free-property-title">Collega una variabile PLC</span>
    <input value={draft} placeholder="Cerca fra le variabili del catalogo" aria-label="Variabile PLC da collegare"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.currentTarget.blur(); }
        if (event.key === "Escape") { cancelled.current = true; setDraft(bound ?? ""); event.currentTarget.blur(); }
      }}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; return; } if (typed && typed !== bound) void bind(typed); }} />
    {catalog.length > 0 && <ul className="plc-binding-list">
      {matches.map((variable) => <li key={variable.name}>
        <button type="button" className={variable.name === bound ? "bound" : ""} onClick={() => { setDraft(variable.name); void bind(variable.name); }}>
          <strong>{variable.name}</strong>
          <small>{[variable.dataType, variable.table, variable.address].filter(Boolean).join(" · ") || variable.description}</small>
        </button>
      </li>)}
      {!matches.length && <li className="plc-binding-none">Nessuna variabile del catalogo contiene «{typed}».</li>}
    </ul>}
    {!catalog.length && <p className="inspector-note">Il catalogo è vuoto: importa l’export .xlsx delle variabili dal pannello <button type="button" className="link-button" onClick={() => setLeftPanel("plc")}>Variabili PLC</button>.</p>}
    {current && <p className="inspector-note">Collegata a <code>{current.name}</code>{current.dataType ? ` · ${current.dataType}` : ""}{current.description ? ` · ${current.description}` : ""}</p>}
    <div className="plc-binding-actions">
      {typed && !known && <button type="button" onClick={() => void addVariable(typed)}>Aggiungi al catalogo</button>}
      {bound && <button type="button" onClick={() => void removeAttribute("data-plc-variable")}>Scollega</button>}
    </div>
  </div>;
}

/** Everything known about the element regardless of where its source lives: what it actually
 * displays, which PLC signal it is wired to, and where it comes from. */
/** The signal an element shows or commands. On a panel this is the property that matters most, so
 * it is a section of its own rather than a field at the bottom of a card about the source file. */
function PlcSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const catalog = useEditorStore((state) => state.plcVariables);
  const bound = typeof node.props["data-plc-variable"] === "string" ? String(node.props["data-plc-variable"]) : undefined;
  const variable = catalog.find((item) => item.name === bound);
  // Opened for what reads or commands a value, closed on a container: the same section either way,
  // so it is always in the same place when it is wanted.
  const likely = Boolean(bound) || ["button", "input", "output", "meter", "progress", "strong", "span", "text", "select"].includes(node.type);
  return <InspectorSection title="Variabile PLC" icon={<Cable size={12} />} initiallyOpen={likely} expandSignal={expandSignal}>
    {variable && <p className="inspector-note">{[variable.dataType, variable.table, variable.address].filter(Boolean).join(" \u00b7 ")}{variable.description ? ` \u00b7 ${variable.description}` : ""}</p>}
    <PlcBindingEditor node={node} bound={bound} />
  </InspectorSection>;
}

const dynamizationLabels: Record<string, string> = {
  ProcessValue: "Valore mostrato", BackColor: "Colore sfondo", Visible: "Visibilità", Graphic: "Immagine",
  Text: "Testo", Opacity: "Opacità", Width: "Larghezza", Left: "Posizione X", Height: "Altezza", Top: "Posizione Y",
  ForeColor: "Colore testo", Enabled: "Abilitato", BorderWidth: "Spessore bordo", BorderColor: "Colore bordo",
  AlternateBackColor: "Sfondo alternato", IsSelected: "Selezionato", RotationAngle: "Rotazione", Url: "Indirizzo", AngleRange: "Intervallo angolare",
};

function DynamizationTextField({ label, value, placeholder, onCommit, list }: { label: string; value: string; placeholder?: string; onCommit: (value: string) => void; list?: string }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => { setDraft(value); }, [value]);
  return <label className="dynamization-field"><span>{label}</span><input value={draft} list={list} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { cancelled.current = true; setDraft(value); event.currentTarget.blur(); }
  }} onBlur={() => { if (cancelled.current) { cancelled.current = false; return; } if (draft.trim() !== value) onCommit(draft.trim()); }} /></label>;
}

function ExpressionStatus({ source }: { source: string }) {
  if (!source.trim()) return null;
  const inspection = inspectHmiExpression(source);
  return <small className={`dynamization-expression-status ${inspection.error ? "error" : "valid"}`}>
    {inspection.error ?? (inspection.tags.length ? `${inspection.tags.length} tag: ${inspection.tags.join(", ")}` : "Espressione valida")}
  </small>;
}

function DynamizationScriptEditor({ item, onPatch }: { item: Dynamization; onPatch: (values: Partial<Dynamization>) => void }) {
  const scriptCatalog = useEditorStore((state) => state.scriptCatalog);
  const scope = useEditorStore((state) => state.previewPath);
  const [source, setSource] = useState(item.source ?? "");
  const [triggers, setTriggers] = useState((item.triggers ?? []).join(", "));
  const [cycle, setCycle] = useState(item.cycleMs ? String(item.cycleMs) : "");
  useEffect(() => {
    setSource(item.source ?? "");
    setTriggers((item.triggers ?? []).join(", "));
    setCycle(item.cycleMs ? String(item.cycleMs) : "");
  }, [item.source, item.triggers, item.cycleMs]);
  const inspection = inspectHmiScript(source, hmiScriptFunctions(scriptCatalog, scope, "dynamizations"), hmiScriptGlobalDefinition(scriptCatalog, scope, "dynamizations")?.program, [], hmiScriptVariables(scriptCatalog));
  const scriptProblem = inspection.error ?? (inspection.hasAsync ? "Le Promise sono ammesse negli eventi, non nelle dinamizzazioni." : undefined);
  const commitSource = () => { if (source.trim() !== (item.source ?? "")) onPatch({ source: source.trim() }); };
  const commitTrigger = () => {
    const next = [...new Set(triggers.split(",").map((trigger) => trigger.trim()).filter(Boolean))];
    if (next.join("|") !== (item.triggers ?? []).join("|")) onPatch({ triggers: next.length ? next : undefined });
  };
  const commitCycle = () => {
    const numeric = Number(cycle);
    const next = cycle.trim() && Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
    if (next !== item.cycleMs) onPatch({ cycleMs: next });
  };
  return <div className="dynamization-script-editor">
    <label><span>Codice JavaScript sicuro</span><textarea value={source} spellCheck={false}
      placeholder={'const state = Tags("Machine.State").Read();\nreturn state === 1 ? "#00A1D1" : "#808080";'}
      onChange={(event) => setSource(event.target.value)} onBlur={commitSource}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <div className="dynamization-script-trigger-row">
      <label><span>Tag trigger</span><input value={triggers} placeholder={inspection.tagsRead.join(", ") || "automatici dai tag letti"} onChange={(event) => setTriggers(event.target.value)} onBlur={commitTrigger} /></label>
      <label><span>Ciclo ms</span><input type="number" min="20" step="10" value={cycle} placeholder="opzionale" onChange={(event) => setCycle(event.target.value)} onBlur={commitCycle} /></label>
    </div>
    <small className={`dynamization-expression-status ${scriptProblem ? "error" : "valid"}`}>
      {scriptProblem ?? `${inspection.hasReturn ? "return presente" : "return mancante"} · legge ${inspection.tagsRead.length || 0} · scrive ${inspection.tagsWritten.length || 0}`}
    </small>
    {!scriptProblem && inspection.tagsWritten.some((tag) => (item.triggers?.length ? item.triggers : inspection.tagsRead).includes(tag))
      && <small className="dynamization-script-warning">Attenzione: lo script riscrive un suo tag trigger e può riattivarsi continuamente.</small>}
    <p className="dynamization-expression-help">Ammessi: variabili locali, if/switch, return, lettura <code>Tags("Nome").Read()</code>, scrittura, bit, trace, cambio pagina e <code>Tags.CreateTagSet(...)</code> sincrono. Le funzioni riusabili si chiamano con <code>Modules.Alias.Funzione(...)</code> o <code>Local.Funzione(...)</code>. Niente eval, rete, DOM o loop.</p>
  </div>;
}

function FlashingColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="dynamization-field flashing-color-field"><span>{label}</span><span><input type="color" value={hexColor(draft)} aria-label={`${label}: scegli colore`} onChange={(event) => { setDraft(event.target.value); onCommit(event.target.value); }} /><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); } }} onBlur={() => draft.trim() !== value && onCommit(draft.trim())} /></span></label>;
}

function HmiFlashingEditor({ item, onPatch }: { item: Dynamization; onPatch: (values: Partial<Dynamization>) => void }) {
  const catalog = useEditorStore((state) => state.plcVariables);
  const contrast = hmiFlashingContrast(item.color ?? "", item.alternateColor ?? "");
  return <div className="dynamization-flashing-editor">
    <FlashingColorField label="Colore principale" value={item.color ?? "#FF3B30"} onCommit={(color) => onPatch({ color })} />
    <FlashingColorField label="Colore alternativo" value={item.alternateColor ?? "#FFD60A"} onCommit={(alternateColor) => onPatch({ alternateColor })} />
    <label className="dynamization-field"><span>Quando lampeggia</span><select value={item.flashingCondition ?? "Always"} onChange={(event) => onPatch({ flashingCondition: event.target.value as NonNullable<Dynamization["flashingCondition"]> })}><option value="Never">Mai</option><option value="Always">Sempre</option><option value="RangeViolation">Fuori dai limiti</option></select></label>
    <label className="dynamization-field"><span>Velocità</span><select value={item.flashingRate ?? "Medium"} onChange={(event) => onPatch({ flashingRate: event.target.value as NonNullable<Dynamization["flashingRate"]> })}><option value="Slow">Lenta · 2 s</option><option value="Medium">Media · 1 s</option><option value="Fast">Veloce · 500 ms</option></select></label>
    {item.flashingCondition === "RangeViolation" && <>
      <DynamizationTextField label="Variabile controllata" value={item.tag ?? ""} placeholder="Cerca o scrivi un tag" list="hmi-dynamization-tags" onCommit={(tag) => onPatch({ tag })} />
      <datalist id="hmi-dynamization-tags">{catalog.map((variable) => <option key={variable.name} value={variable.name}>{variable.description}</option>)}</datalist>
      <div className="dynamization-script-trigger-row"><label><span>Minimo</span><input type="number" value={item.minimum ?? ""} placeholder="opzionale" onChange={(event) => onPatch({ minimum: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label><span>Massimo</span><input type="number" value={item.maximum ?? ""} placeholder="opzionale" onChange={(event) => onPatch({ maximum: event.target.value === "" ? undefined : Number(event.target.value) })} /></label></div>
    </>}
    {contrast !== undefined && <small className={`dynamization-expression-status ${contrast < 3 ? "error" : "valid"}`}>Contrasto fra i colori: {contrast.toFixed(2)}:1{contrast < 3 ? " · aumentalo per distinguere bene il segnale" : ""}</small>}
    <p className="dynamization-expression-help">Il Runtime rispetta <code>Riduci movimento</code>: al posto dell'animazione mostra righe, doppio bordo e colore alternativo.</p>
  </div>;
}

function DynamizationRule({ entry, conditionType, onChange, onRemove }: { entry: NonNullable<Dynamization["entries"]>[number]; conditionType: MappingConditionType; onChange: (entry: NonNullable<Dynamization["entries"]>[number]) => void; onRemove: () => void }) {
  const [from, setFrom] = useState(entry.from == null ? "" : String(entry.from));
  const [to, setTo] = useState(entry.to == null ? "" : String(entry.to));
  const [condition, setCondition] = useState(entry.condition ?? "");
  const [value, setValue] = useState(entry.value);
  useEffect(() => {
    setFrom(entry.from == null ? "" : String(entry.from)); setTo(entry.to == null ? "" : String(entry.to));
    setCondition(entry.condition ?? ""); setValue(entry.value);
  }, [entry]);
  const commit = () => {
    const next = { value } as NonNullable<Dynamization["entries"]>[number];
    if (conditionType === "Range") {
      const start = Number(from); const end = Number(to);
      if (from !== "" && Number.isFinite(start)) next.from = start;
      if (to !== "" && Number.isFinite(end)) next.to = end;
    } else if (condition) next.condition = condition;
    onChange(next);
  };
  return <div className="dynamization-rule">
    {conditionType === "Range" ? <><label><span>Da</span><input type="number" value={from} onChange={(event) => setFrom(event.target.value)} onBlur={commit} /></label><label><span>A</span><input type="number" value={to} onChange={(event) => setTo(event.target.value)} onBlur={commit} /></label></>
      : <label className="dynamization-condition"><span>{conditionType === "Singlebit" ? "Bit / condizione" : "Quando"}</span><input value={condition} placeholder={conditionType === "Singlebit" ? "es. 0" : "es. valore > 10"} onChange={(event) => setCondition(event.target.value)} onBlur={commit} /></label>}
    <label className="dynamization-result"><span>Mostra / imposta</span><input value={value} placeholder="es. #00A1D1, true, testo" onChange={(event) => setValue(event.target.value)} onBlur={commit} /></label>
    <button type="button" onClick={onRemove} title="Elimina questa regola" aria-label="Elimina questa regola"><Trash2 size={12} /></button>
    {conditionType === "Expression" && <ExpressionStatus source={condition} />}
  </div>;
}

function DynamizationCard({ item, index, all, properties, onWrite }: { item: Dynamization; index: number; all: readonly Dynamization[]; properties: string[]; onWrite: (items: Dynamization[]) => void }) {
  const catalog = useEditorStore((state) => state.plcVariables);
  const resources = useEditorStore((state) => state.resourceCatalog);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const resourceNames = [...resources.textLists.map((list) => list.name), ...resources.graphicLists.map((list) => list.name)].sort();
  const patch = (values: Partial<Dynamization>) => onWrite(replaceHmiDynamization(all, index, { ...item, ...values }));
  const condition = item.conditionType ?? "None";
  const colorProperty = hmiFlashingProperties.includes(item.property as (typeof hmiFlashingProperties)[number]);
  const rules = item.entries ?? [];
  const addRule = () => patch({ entries: [...rules, condition === "Range" ? { from: 0, to: 1, value: "#00A1D1" } : { condition: "0", value: "true" }] });
  return <article className="dynamization-card">
    <div className="dynamization-card-head"><span><Zap size={13} /><strong>{dynamizationLabels[item.property] ?? item.property}</strong></span><button type="button" onClick={() => onWrite(removeHmiDynamization(all, index))} title="Rimuovi dinamica" aria-label={`Rimuovi dinamica ${item.property}`}><Trash2 size={12} /></button></div>
    <label className="dynamization-field"><span>Proprietà che cambia</span><select value={item.property} onChange={(event) => patch({ property: event.target.value })}>{[item.property, ...properties].map((property) => <option key={property} value={property}>{dynamizationLabels[property] ?? property}</option>)}</select></label>
    <label className="dynamization-field"><span>Sorgente</span><select value={item.kind} onChange={(event) => {
      const kind = event.target.value as Dynamization["kind"];
      patch({ kind, tag: kind === "Tag" || kind === "ResourceList" || (kind === "Flashing" && item.flashingCondition === "RangeViolation") ? item.tag : undefined, source: kind === "Tag" || kind === "Flashing" ? undefined : item.source, triggers: kind === "Script" ? item.triggers : undefined, cycleMs: kind === "Script" ? item.cycleMs : undefined, conditionType: kind === "Tag" ? item.conditionType : "None", entries: kind === "Tag" ? item.entries : [], color: kind === "Flashing" ? item.color ?? "#FF3B30" : undefined, alternateColor: kind === "Flashing" ? item.alternateColor ?? "#FFD60A" : undefined, flashingCondition: kind === "Flashing" ? item.flashingCondition ?? "Always" : undefined, flashingRate: kind === "Flashing" ? item.flashingRate ?? "Medium" : undefined, minimum: kind === "Flashing" ? item.minimum : undefined, maximum: kind === "Flashing" ? item.maximum : undefined });
    }}><option value="Tag">Variabile PLC</option><option value="ResourceList">Lista risorse</option><option value="Expression">Espressione</option><option value="Script">Funzione</option>{colorProperty && <option value="Flashing">Lampeggio WinCC</option>}</select></label>
    {item.kind === "Tag" ? <>
      <DynamizationTextField label="Variabile PLC" value={item.tag ?? ""} placeholder="Cerca o scrivi un tag" list="hmi-dynamization-tags" onCommit={(tag) => patch({ tag })} />
      <datalist id="hmi-dynamization-tags">{catalog.map((variable) => <option key={variable.name} value={variable.name}>{variable.description}</option>)}</datalist>
      <label className="dynamization-field"><span>Conversione del valore</span><select value={condition} onChange={(event) => patch({ conditionType: event.target.value as MappingConditionType, entries: [] })}><option value="None">Diretta · usa il valore del tag</option><option value="Range">Intervalli / soglie</option><option value="Singlebit">Bit o condizione singola</option><option value="Expression">Condizione personalizzata</option></select></label>
      {condition !== "None" && <div className="dynamization-rules">
        {rules.map((entry, ruleIndex) => <DynamizationRule key={ruleIndex} entry={entry} conditionType={condition} onChange={(next) => patch({ entries: rules.map((rule, current) => current === ruleIndex ? next : rule) })} onRemove={() => patch({ entries: rules.filter((_, current) => current !== ruleIndex) })} />)}
        <button className="dynamization-add-rule" type="button" onClick={addRule}><Plus size={12} /> Aggiungi regola</button>
      </div>}
    </> : item.kind === "ResourceList" ? <>
      <DynamizationTextField label="Lista risorse" value={item.source ?? ""} placeholder="Scegli o scrivi una lista" list="hmi-resource-lists" onCommit={(source) => patch({ source })} />
      <datalist id="hmi-resource-lists">{resourceNames.map((name) => <option key={name} value={name} />)}</datalist>
      <DynamizationTextField label="Variabile che sceglie la voce" value={item.tag ?? ""} placeholder="Cerca o scrivi un tag" list="hmi-dynamization-tags" onCommit={(tag) => patch({ tag })} />
      <datalist id="hmi-dynamization-tags">{catalog.map((variable) => <option key={variable.name} value={variable.name}>{variable.description}</option>)}</datalist>
      <p className="dynamization-expression-help">Anteprima in <strong>{resources.activeLanguage}</strong>. {resourceNames.length ? "La lista viene risolta dal catalogo del progetto." : <>Il catalogo è vuoto: <button type="button" className="link-button" onClick={() => setLeftPanel("resources")}>crea la lista in Risorse</button>.</>}</p>
    </> : item.kind === "Script" ? <DynamizationScriptEditor item={item} onPatch={patch} /> : item.kind === "Flashing" ? <HmiFlashingEditor item={item} onPatch={patch} /> : <>
      <DynamizationTextField label="Espressione" value={item.source ?? ""} placeholder="Machine.Enabled AND Machine.Ready" onCommit={(source) => patch({ source })} />
      <ExpressionStatus source={item.source ?? ""} />
    </>}
    {(item.kind === "Expression" || condition === "Expression") && <p className="dynamization-expression-help">Operatori: AND, OR, NOT, confronti e calcoli. Per nomi con spazi usa <code>tag("Nome tag")</code>.</p>}
  </article>;
}

function HmiDynamizationSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const removeAttribute = useEditorStore((state) => state.removeAttribute);
  const bound = typeof node.props["data-plc-variable"] === "string" ? String(node.props["data-plc-variable"]) : "";
  const items = parseHmiDynamizations(node.props[hmiDynamizationAttribute]);
  const available = availableDynamizedProperties(items);
  const [property, setProperty] = useState(available[0] ?? "ProcessValue");
  useEffect(() => { if (!available.includes(property)) setProperty(available[0] ?? "ProcessValue"); }, [available, property]);
  const write = (next: Dynamization[]) => void (next.length ? update(hmiDynamizationAttribute, serializeHmiDynamizations(next)) : removeAttribute(hmiDynamizationAttribute));
  return <InspectorSection title={`Dinamica PLC${items.length ? ` · ${items.length}` : ""}`} icon={<Zap size={12} />} initiallyOpen={items.length > 0} expandSignal={expandSignal}>
    {!items.length && <p className="inspector-note">Fai cambiare colore, visibilità, testo o geometria in base a una variabile PLC.</p>}
    <div className="dynamization-list">{items.map((item, index) => <DynamizationCard key={`${item.property}-${index}`} item={item} index={index} all={items} properties={available} onWrite={write} />)}</div>
    {available.length > 0 && <div className="dynamization-add"><select value={property} aria-label="Proprietà dinamica da aggiungere" onChange={(event) => setProperty(event.target.value)}>{available.map((name) => <option key={name} value={name}>{dynamizationLabels[name] ?? name}</option>)}</select><button type="button" onClick={() => write([...items, newHmiDynamization(property, bound)])}><Plus size={12} /> Aggiungi dinamica</button></div>}
    <p className="inspector-note">Le regole vengono salvate insieme all’elemento e usate dal pannello.</p>
  </InspectorSection>;
}

function FaceplateEventScriptField({ definition, binding, onCommit }: { definition: HmiFaceplateEventDefinition; binding?: HmiFaceplateEventBinding; onCommit: (script: string) => void }) {
  const scriptCatalog = useEditorStore((state) => state.scriptCatalog);
  const scope = useEditorStore((state) => state.previewPath);
  const [script, setScript] = useState(binding?.script ?? "");
  useEffect(() => { setScript(binding?.script ?? ""); }, [binding?.script]);
  const inspection = script.trim() ? inspectHmiScript(script, hmiScriptFunctions(scriptCatalog, scope, "events"), hmiScriptGlobalDefinition(scriptCatalog, scope, "events")?.program, [], hmiScriptVariables(scriptCatalog)) : undefined;
  const signature = `${definition.name}(${definition.parameters.map((parameter) => `${parameter.name}: ${parameter.dataType}`).join(", ")})`;
  return <article className="faceplate-event-binding">
    <label className="hmi-event-script"><span>{signature}</span><textarea value={script} spellCheck={false}
      placeholder={definition.parameters[0] ? `HMIRuntime.Trace(${definition.parameters[0].name});` : `HMIRuntime.Trace("${definition.name}");`}
      onChange={(event) => setScript(event.target.value)} onBlur={() => script.trim() !== (binding?.script ?? "") && onCommit(script.trim())}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <small className={`dynamization-expression-status ${inspection?.error ? "error" : script.trim() ? "valid" : ""}`}>{inspection?.error ?? (script.trim() ? "Script collegato · i parametri sono variabili locali" : "Nessuno script collegato")}</small>
  </article>;
}

function HmiFaceplateSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const catalog = useEditorStore((state) => state.faceplateCatalog);
  const variables = useEditorStore((state) => state.plcVariables);
  const update = useEditorStore((state) => state.updateAttribute);
  const remove = useEditorStore((state) => state.removeAttribute);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  if (node.props["data-hmi-type"] !== "HmiFaceplateContainer") return null;
  const binding = parseHmiFaceplateBinding(node.props[hmiFaceplateAttribute]);
  const type = binding ? catalog.types.find((candidate) => candidate.id === binding.typeId && candidate.version === binding.version) : undefined;
  const released = catalog.types.filter((candidate) => candidate.status === "released");
  const issues = binding ? hmiFaceplateBindingIssues(binding, catalog, variables) : [];
  const write = (next: HmiFaceplateInstanceBinding) => void update(hmiFaceplateAttribute, serializeHmiFaceplateBinding(next));
  const selectType = (value: string) => {
    if (!value) { void remove(hmiFaceplateAttribute); return; }
    const next = catalog.types.find((candidate) => `${candidate.id}@${candidate.version}` === value);
    if (!next) return;
    write({
      typeId: next.id, version: next.version, tagBindings: {},
      propertyValues: Object.fromEntries(next.interfaceProperties.flatMap((property) => property.defaultValue === undefined ? [] : [[property.name, property.defaultValue]])),
      eventBindings: {},
    });
  };
  const patchTags = (name: string, value: string) => {
    if (!binding) return;
    const tagBindings = { ...binding.tagBindings };
    if (value.trim()) tagBindings[name] = value.trim(); else delete tagBindings[name];
    write({ ...binding, tagBindings });
  };
  const patchProperties = (name: string, value: string | boolean) => binding && write({ ...binding, propertyValues: { ...binding.propertyValues, [name]: value } });
  const patchEvent = (name: string, script: string) => {
    if (!binding) return;
    const eventBindings = { ...(binding.eventBindings ?? {}) };
    if (script) eventBindings[name] = { script }; else delete eventBindings[name];
    write({ ...binding, eventBindings });
  };
  return <InspectorSection title="Istanza faceplate" icon={<Boxes size={12} />} initiallyOpen expandSignal={expandSignal}>
    <label className="property-stack"><span>Tipo e versione rilasciata</span><select value={binding ? `${binding.typeId}@${binding.version}` : ""} onChange={(event) => selectType(event.target.value)}><option value="">Scegli un faceplate</option>{released.map((candidate) => <option key={`${candidate.id}@${candidate.version}`} value={`${candidate.id}@${candidate.version}`}>{candidate.name} · V{candidate.version}</option>)}</select></label>
    {!released.length && <p className="inspector-note">Non ci sono versioni rilasciate. <button type="button" className="link-button" onClick={() => setLeftPanel("faceplates")}>Apri Tipi faceplate</button>.</p>}
    {type && <>
      <p className="inspector-note">{type.width} × {type.height}px{type.source ? ` · ${type.source}` : ""}</p>
      {type.interfaceTags.length > 0 && <div className="faceplate-instance-interface"><strong>Tag di interfaccia</strong><datalist id="hmi-faceplate-plc-tags">{variables.map((variable) => <option key={variable.name} value={variable.name}>{variable.dataType}</option>)}</datalist>{type.interfaceTags.map((tag) => <DynamizationTextField key={tag.name} label={`${tag.name} · ${tag.dataType}${tag.required ? " *" : ""}`} value={binding?.tagBindings[tag.name] ?? ""} placeholder="Collega variabile PLC" list="hmi-faceplate-plc-tags" onCommit={(value) => patchTags(tag.name, value)} />)}</div>}
      {type.interfaceProperties.length > 0 && <div className="faceplate-instance-interface"><strong>Proprietà di interfaccia</strong>{type.interfaceProperties.map((property) => property.dataType === "Bool"
        ? <label key={property.name} className="dynamization-field"><span>{property.name} · Bool</span><select value={String(binding?.propertyValues[property.name] ?? property.defaultValue ?? false)} onChange={(event) => patchProperties(property.name, event.target.value === "true")}><option value="false">False</option><option value="true">True</option></select></label>
        : <DynamizationTextField key={property.name} label={`${property.name} · ${property.dataType}`} value={String(binding?.propertyValues[property.name] ?? property.defaultValue ?? "")} placeholder="Valore dell'istanza" onCommit={(value) => patchProperties(property.name, value)} />)}</div>}
      {type.interfaceEvents.length > 0 && <div className="faceplate-instance-interface"><strong>Eventi di interfaccia</strong>{type.interfaceEvents.map((event) => <FaceplateEventScriptField key={event.name} definition={event} binding={binding?.eventBindings?.[event.name]} onCommit={(script) => patchEvent(event.name, script)} />)}<p className="inspector-note">Dentro il tipo usa <code>Faceplate.RaiseEvent("Nome", {`{ Parametro: valore }`})</code>. Lo script dell’istanza riceve i parametri con il loro nome.</p></div>}
      {type.localTags.length > 0 && <p className="inspector-note">{type.localTags.length} tag locali isolati nella singola istanza; non sono modificabili dalla pagina esterna.</p>}
    </>}
    {issues.map((issue, index) => <p key={index} className={`dynamization-expression-status ${issue.severity === "error" ? "error" : ""}`}>{issue.message}</p>)}
    <button type="button" className="link-button" onClick={() => setLeftPanel("faceplates")}>Gestisci tipi e versioni</button>
  </InspectorSection>;
}

function HmiTrendSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const variables = useEditorStore((state) => state.plcVariables);
  const dataLogs = useEditorStore((state) => state.dataLogCatalog);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const update = useEditorStore((state) => state.updateAttribute);
  if (node.props["data-hmi-type"] !== "HmiTrendControl" && node.props[hmiTrendAttribute] === undefined) return null;
  const raw = node.props[hmiTrendAttribute];
  const parsed = parseHmiTrendConfig(raw);
  const config = parsed ?? defaultHmiTrendConfig();
  const write = (next: HmiTrendConfig) => void update(hmiTrendAttribute, serializeHmiTrendConfig(next));
  const patch = (values: Partial<HmiTrendConfig>) => write({ ...config, ...values });
  const patchArea = (index: number, values: Partial<HmiTrendArea>) => patch({ areas: config.areas.map((area, current) => current === index ? { ...area, ...values } : area) });
  const patchAreaAxis = (index: number, side: "leftAxis" | "rightAxis", values: Partial<HmiTrendAxis>) => {
    const area = config.areas[index];
    patchArea(index, { [side]: { ...(area[side] ?? config[side]), ...values } });
  };
  const patchTrend = (index: number, values: Partial<HmiTrendSeries>) => patch({ trends: config.trends.map((trend, current) => current === index ? { ...trend, ...values } : trend) });
  const numeric = (value: string) => value.trim() === "" ? undefined : Number.isFinite(Number(value)) ? Number(value) : undefined;
  const addTrend = () => {
    if (config.trends.length >= 9) return;
    let number = config.trends.length + 1;
    while (config.trends.some((trend) => trend.id === `trend-${number}`)) number += 1;
    const seed = defaultHmiTrendConfig().trends[0];
    patch({ trends: [...config.trends, { ...seed, id: `trend-${number}`, name: `Curva ${number}`, areaId: config.areas[0]?.id ?? "area-1", color: ["#00A1D1", "#87BE32", "#F3A712", "#D43D51", "#7A5AF8"][config.trends.length % 5] }] });
  };
  const addArea = () => {
    if (config.areas.length >= 4) return;
    let number = config.areas.length + 1;
    while (config.areas.some((area) => area.id === `area-${number}`)) number += 1;
    patch({ areas: [...config.areas, { id: `area-${number}`, name: `Area ${number}`, weight: 1 }] });
  };
  const removeArea = (index: number) => {
    if (config.areas.length <= 1) return;
    const removed = config.areas[index];
    const areas = config.areas.filter((_, current) => current !== index);
    patch({ areas, trends: config.trends.map((trend) => trend.areaId === removed.id ? { ...trend, areaId: areas[0].id } : trend) });
  };
  const issues = parsed ? hmiTrendIssues(config, variables, dataLogs) : [{ severity: "error" as const, message: "La configurazione Trend Control non è un JSON valido." }];
  return <InspectorSection title="Trend Control" icon={<Activity size={12} />} initiallyOpen expandSignal={expandSignal}>
    <p className="inspector-note">Campioni online reali in memoria oppure curve archiviate, fino a quattro aree indipendenti. I dati storici arrivano dai Data Log del progetto.</p>
    <DynamizationTextField label="Titolo" value={config.caption} onCommit={(caption) => patch({ caption })} />
    <div className="property-pair">
      <DynamizationTextField label="Intervallo (s)" value={String(config.timeRangeMs / 1000)} onCommit={(value) => patch({ timeRangeMs: Math.max(1, Number(value) || 1) * 1000 })} />
      <DynamizationTextField label="Campione (ms)" value={String(config.sampleIntervalMs)} onCommit={(value) => patch({ sampleIntervalMs: Math.max(100, Math.round(Number(value) || 100)) })} />
    </div>
    <div className="trend-option-grid">
      {([['online', 'Aggiorna online'], ['showToolbar', 'Toolbar'], ['showLegend', 'Legenda'], ['showGrid', 'Griglia'], ['showRuler', 'Righello']] as const).map(([name, label]) => <label key={name}><input type="checkbox" checked={config[name]} onChange={(event) => patch({ [name]: event.target.checked })} /> {label}</label>)}
    </div>
    <div className="trend-series-head"><strong>Aree · {config.areas.length}/4</strong><button type="button" onClick={addArea} disabled={config.areas.length >= 4}><Plus size={12} /> Aggiungi</button></div>
    <div className="trend-area-list">{config.areas.map((area, areaIndex) => <details className="trend-area-editor" key={area.id} open={config.areas.length === 1}>
      <summary><span>{area.name}</span><small>{config.trends.filter((trend) => trend.areaId === area.id).length} curve</small></summary>
      <DynamizationTextField label="Nome area" value={area.name} onCommit={(name) => patchArea(areaIndex, { name })} />
      <DynamizationTextField label="Altezza relativa" value={String(area.weight)} onCommit={(value) => patchArea(areaIndex, { weight: Math.max(.25, Math.min(4, Number(value) || 1)) })} />
      {([['leftAxis', 'Asse sinistro'], ['rightAxis', 'Asse destro']] as const).map(([side, label]) => {
        const axis = area[side] ?? config[side];
        return <details className="trend-axis-editor" key={side}><summary>{label}</summary>
          <label className="dynamization-field"><span>Scala</span><select value={axis.scale} onChange={(event) => patchAreaAxis(areaIndex, side, { scale: event.target.value as HmiTrendAxis["scale"] })}><option value="linear">Lineare</option><option value="logarithmic">Logaritmica positiva</option><option value="negative-logarithmic">Logaritmica negativa</option></select></label>
          <DynamizationTextField label="Minimo automatico" value={axis.minimum === undefined ? "" : String(axis.minimum)} placeholder="automatico" onCommit={(value) => patchAreaAxis(areaIndex, side, { minimum: numeric(value) })} />
          <DynamizationTextField label="Massimo automatico" value={axis.maximum === undefined ? "" : String(axis.maximum)} placeholder="automatico" onCommit={(value) => patchAreaAxis(areaIndex, side, { maximum: numeric(value) })} />
          <DynamizationTextField label="Unità" value={axis.unit ?? ""} placeholder="es. °C" onCommit={(unit) => patchAreaAxis(areaIndex, side, { unit: unit || undefined })} />
        </details>;
      })}
      {config.areas.length > 1 && <button type="button" className="trend-remove-area" onClick={() => removeArea(areaIndex)}><Trash2 size={12} /> Elimina area</button>}
    </details>)}</div>
    <datalist id="hmi-trend-plc-tags">{variables.map((variable) => <option key={variable.name} value={variable.name}>{variable.dataType}</option>)}</datalist>
    <div className="trend-series-head"><strong>Curve · {config.trends.length}/9</strong><button type="button" onClick={addTrend} disabled={config.trends.length >= 9}><Plus size={12} /> Aggiungi</button></div>
    <div className="trend-series-list">{config.trends.map((trend, index) => <article className="trend-series-editor" key={trend.id}>
      <header><span style={{ background: trend.color }} /><strong>{trend.name}</strong><button type="button" aria-label={`Elimina ${trend.name}`} disabled={config.trends.length <= 1} onClick={() => patch({ trends: config.trends.filter((_, current) => current !== index) })}><Trash2 size={12} /></button></header>
      <DynamizationTextField label="Nome" value={trend.name} onCommit={(name) => patchTrend(index, { name })} />
      <div className="property-pair"><label className="dynamization-field"><span>Sorgente</span><select value={trend.source} onChange={(event) => patchTrend(index, { source: event.target.value as HmiTrendSeries["source"] })}><option value="online">Online</option><option value="log">Data Log</option></select></label><label className="dynamization-field"><span>Area</span><select value={trend.areaId} onChange={(event) => patchTrend(index, { areaId: event.target.value })}>{config.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label></div>
      {trend.source === "online" ? <DynamizationTextField label="Tag PLC" value={trend.tag} list="hmi-trend-plc-tags" placeholder="Collega variabile" onCommit={(tag) => patchTrend(index, { tag })} /> : <>
        <label className="dynamization-field"><span>Data Log</span><select value={trend.logId ?? ""} onChange={(event) => patchTrend(index, { logId: event.target.value || undefined, loggedTagId: undefined })}><option value="">Scegli archivio</option>{dataLogs.logs.map((log) => <option key={log.id} value={log.id}>{log.name}</option>)}</select></label>
        <label className="dynamization-field"><span>Variabile archiviata</span><select value={trend.loggedTagId ?? ""} onChange={(event) => patchTrend(index, { loggedTagId: event.target.value || undefined })}><option value="">Scegli variabile</option>{dataLogs.logs.find((log) => log.id === trend.logId)?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name} · {tag.tag}</option>)}</select></label>
        {!dataLogs.logs.length && <p className="inspector-note">Non ci sono archivi. <button type="button" className="link-button" onClick={() => setLeftPanel("logs")}>Crea un Data Log</button>.</p>}
      </>}
      <label className="dynamization-field"><span>Disegno</span><select value={trend.mode} onChange={(event) => patchTrend(index, { mode: event.target.value as HmiTrendSeries["mode"] })}>{hmiTrendModes.map((mode) => <option value={mode} key={mode}>{({ points: "Punti", interpolated: "Interpolata", stepped: "A gradini", values: "Valori" } as const)[mode]}</option>)}</select></label>
      <div className="property-pair"><label className="dynamization-field"><span>Asse</span><select value={trend.axis} onChange={(event) => patchTrend(index, { axis: event.target.value as HmiTrendSeries["axis"] })}><option value="left">Sinistro</option><option value="right">Destro</option></select></label><label className="dynamization-field"><span>Colore</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(trend.color) ? trend.color : "#00A1D1"} onChange={(event) => patchTrend(index, { color: event.target.value })} /></label></div>
      <div className="property-pair"><DynamizationTextField label="Soglia bassa" value={trend.lowThreshold === undefined ? "" : String(trend.lowThreshold)} placeholder="nessuna" onCommit={(value) => patchTrend(index, { lowThreshold: numeric(value) })} /><DynamizationTextField label="Soglia alta" value={trend.highThreshold === undefined ? "" : String(trend.highThreshold)} placeholder="nessuna" onCommit={(value) => patchTrend(index, { highThreshold: numeric(value) })} /></div>
      <label className="trend-visible"><input type="checkbox" checked={trend.visible} onChange={(event) => patchTrend(index, { visible: event.target.checked })} /> Visibile all'avvio</label>
    </article>)}</div>
    {issues.map((issue, index) => <p key={index} className={`dynamization-expression-status ${issue.severity === "error" ? "error" : ""}`}>{issue.message}</p>)}
  </InspectorSection>;
}

function HmiFunctionTrendSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const variables = useEditorStore((state) => state.plcVariables);
  const dataLogs = useEditorStore((state) => state.dataLogCatalog);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const update = useEditorStore((state) => state.updateAttribute);
  if (node.props["data-hmi-type"] !== "HmiFunctionTrendControl" && node.props[hmiFunctionTrendAttribute] === undefined) return null;
  const parsed = parseHmiFunctionTrendConfig(node.props[hmiFunctionTrendAttribute]);
  const config = parsed ?? defaultHmiFunctionTrendConfig();
  const patch = (values: Partial<HmiFunctionTrendConfig>) => void update(hmiFunctionTrendAttribute, serializeHmiFunctionTrendConfig({ ...config, ...values }));
  const patchCurve = (index: number, values: Partial<HmiFunctionTrendSeries>) => patch({ trends: config.trends.map((trend, current) => current === index ? { ...trend, ...values } : trend) });
  const patchSource = (index: number, coordinate: "x" | "y", values: Partial<HmiFunctionTrendSource>) => patchCurve(index, { [coordinate]: { ...config.trends[index][coordinate], ...values } });
  const numeric = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
  const nextId = (ids: string[], prefix: string) => { let index = ids.length + 1; while (ids.includes(`${prefix}-${index}`)) index++; return `${prefix}-${index}`; };
  const localDate = (time?: number) => time === undefined ? "" : new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
  const issues = parsed ? hmiFunctionTrendIssues(config, variables, dataLogs) : [{ severity: "error" as const, message: "La configurazione Function Trend non è un JSON valido." }];
  return <InspectorSection title="Function Trend X/Y" icon={<Activity size={12} />} initiallyOpen expandSignal={expandSignal}>
    <p className="inspector-note">Collega una variabile X e una Y per confrontarle. Per gli array, entrambe devono contenere lo stesso numero di valori: ogni indice forma una coppia.</p>
    <DynamizationTextField label="Titolo" value={config.caption} onCommit={(caption) => patch({ caption })} />
    <div className="property-pair"><DynamizationTextField label="Campione (ms)" value={String(config.sampleIntervalMs)} onCommit={(value) => patch({ sampleIntervalMs: Math.max(100, Number(value) || 100) })} /><DynamizationTextField label="Buffer punti" value={String(config.maxPoints)} onCommit={(value) => patch({ maxPoints: Math.max(2, Math.min(100_000, Number(value) || 2)) })} /></div>
    <div className="trend-option-grid">{([['online', 'Aggiorna online'], ['showToolbar', 'Toolbar'], ['showLegend', 'Legenda'], ['showGrid', 'Griglia'], ['showRuler', 'Righello']] as const).map(([name, label]) => <label key={name}><input type="checkbox" checked={config[name]} onChange={(event) => patch({ [name]: event.target.checked })} /> {label}</label>)}</div>
    <datalist id="hmi-function-trend-tags">{variables.map((variable) => <option key={variable.name} value={variable.name}>{variable.dataType}</option>)}</datalist>
    <div className="trend-series-head"><strong>Aree X/Y · {config.areas.length}/4</strong><button type="button" disabled={config.areas.length >= 4} onClick={() => {
      const id = nextId(config.areas.map((area) => area.id), "area"); patch({ areas: [...config.areas, { id, name: `Area ${config.areas.length + 1}`, weight: 1, xAxis: { scale: "linear" }, yAxis: { scale: "linear" } }] });
    }}><Plus size={12} /> Aggiungi</button></div>
    <div className="trend-area-list">{config.areas.map((area, index) => {
      const patchArea = (values: Partial<typeof area>) => patch({ areas: config.areas.map((item, current) => current === index ? { ...item, ...values } : item) });
      return <details className="trend-area-editor" key={area.id} open={config.areas.length === 1}><summary>{area.name}</summary>
        <DynamizationTextField label="Nome area" value={area.name} onCommit={(name) => patchArea({ name })} />
        <DynamizationTextField label="Altezza relativa" value={String(area.weight)} onCommit={(value) => patchArea({ weight: Math.max(.25, Math.min(4, Number(value) || 1)) })} />
        {([['xAxis', 'Asse X (orizzontale)'], ['yAxis', 'Asse Y (verticale)']] as const).map(([side, label]) => {
          const axis = area[side]; const patchAxis = (values: Partial<HmiTrendAxis>) => patchArea({ [side]: { ...axis, ...values } });
          return <details className="trend-axis-editor" key={side}><summary>{label}</summary>
            <label className="dynamization-field"><span>Scala</span><select value={axis.scale} onChange={(event) => patchAxis({ scale: event.target.value as HmiTrendAxis["scale"] })}><option value="linear">Lineare</option><option value="logarithmic">Logaritmica positiva</option><option value="negative-logarithmic">Logaritmica negativa</option></select></label>
            <div className="property-pair"><DynamizationTextField label="Minimo" value={String(axis.minimum ?? "")} placeholder="automatico" onCommit={(value) => patchAxis({ minimum: numeric(value) })} /><DynamizationTextField label="Massimo" value={String(axis.maximum ?? "")} placeholder="automatico" onCommit={(value) => patchAxis({ maximum: numeric(value) })} /></div>
            <DynamizationTextField label="Unità" value={axis.unit ?? ""} onCommit={(unit) => patchAxis({ unit: unit || undefined })} />
          </details>;
        })}
        {config.areas.length > 1 && <button type="button" className="trend-remove-area" onClick={() => {
          const areas = config.areas.filter((_, current) => current !== index); patch({ areas, trends: config.trends.map((trend) => trend.areaId === area.id ? { ...trend, areaId: areas[0].id } : trend) });
        }}><Trash2 size={12} /> Elimina area</button>}
      </details>;
    })}</div>
    <div className="trend-series-head"><strong>Curve X/Y · {config.trends.length}/9</strong><button type="button" disabled={config.trends.length >= 9} onClick={() => {
      const seed = defaultHmiFunctionTrendConfig().trends[0]; patch({ trends: [...config.trends, { ...seed, id: nextId(config.trends.map((trend) => trend.id), "curve"), name: `Curva ${config.trends.length + 1}`, areaId: config.areas[0]?.id ?? "area-1", color: ["#00A1D1", "#87BE32", "#D43D51", "#7A5AF8"][config.trends.length % 4] }] });
    }}><Plus size={12} /> Aggiungi</button></div>
    <div className="trend-series-list">{config.trends.map((trend, index) => <article key={trend.id} className="trend-series-editor">
      <header><span style={{ background: trend.color }} /><strong>{trend.name}</strong><button type="button" aria-label={`Elimina ${trend.name}`} disabled={config.trends.length <= 1} onClick={() => patch({ trends: config.trends.filter((_, current) => current !== index) })}><Trash2 size={12} /></button></header>
      <DynamizationTextField label="Nome curva" value={trend.name} onCommit={(name) => patchCurve(index, { name })} />
      <label className="dynamization-field"><span>Area</span><select value={trend.areaId} onChange={(event) => patchCurve(index, { areaId: event.target.value })}>{config.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      {([['x', 'Sorgente X'], ['y', 'Sorgente Y']] as const).map(([coordinate, label]) => {
        const source = trend[coordinate];
        return <fieldset className="function-trend-source" key={coordinate}><legend>{label}</legend>
          <label className="dynamization-field"><span>Origine {coordinate.toUpperCase()}</span><select value={source.source} onChange={(event) => patchSource(index, coordinate, { source: event.target.value as HmiFunctionTrendSource["source"] })}><option value="online">Online / array PLC</option><option value="log">Data Log</option></select></label>
          {source.source === "online" ? <DynamizationTextField label={`Tag ${coordinate.toUpperCase()}`} value={source.tag} list="hmi-function-trend-tags" onCommit={(tag) => patchSource(index, coordinate, { tag })} /> : <>
            <label className="dynamization-field"><span>Data Log {coordinate.toUpperCase()}</span><select value={source.logId ?? ""} onChange={(event) => patchSource(index, coordinate, { logId: event.target.value || undefined, loggedTagId: undefined })}><option value="">Scegli archivio</option>{dataLogs.logs.map((log) => <option key={log.id} value={log.id}>{log.name}</option>)}</select></label>
            <label className="dynamization-field"><span>Variabile archiviata {coordinate.toUpperCase()}</span><select value={source.loggedTagId ?? ""} onChange={(event) => { const tag = dataLogs.logs.find((log) => log.id === source.logId)?.tags.find((tag) => tag.id === event.target.value); patchSource(index, coordinate, { loggedTagId: tag?.id, tag: tag?.tag ?? "" }); }}><option value="">Scegli variabile</option>{dataLogs.logs.find((log) => log.id === source.logId)?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name} · {tag.tag}</option>)}</select></label>
          </>}
        </fieldset>;
      })}
      <details className="trend-axis-editor"><summary>Selezione campioni e sincronizzazione</summary>
        <label className="dynamization-field"><span>Intervallo</span><select value={trend.range.kind} onChange={(event) => patchCurve(index, { range: { ...trend.range, kind: event.target.value as HmiFunctionTrendSeries["range"]["kind"] } })}><option value="rolling">Ultimo intervallo</option><option value="interval">Inizio e fine</option><option value="points">Numero di punti</option></select></label>
        {trend.range.kind !== "interval" && <DynamizationTextField label="Durata (s)" value={String(trend.range.durationMs / 1000)} onCommit={(value) => patchCurve(index, { range: { ...trend.range, durationMs: Math.max(1, Number(value) || 1) * 1000 } })} />}
        {trend.range.kind !== "rolling" && <label className="dynamization-field"><span>Inizio campioni</span><input type="datetime-local" step="1" value={localDate(trend.range.startTime)} onChange={(event) => patchCurve(index, { range: { ...trend.range, startTime: event.target.value ? Date.parse(event.target.value) : undefined } })} /></label>}
        {trend.range.kind === "interval" && <label className="dynamization-field"><span>Fine campioni</span><input type="datetime-local" step="1" value={localDate(trend.range.endTime)} onChange={(event) => patchCurve(index, { range: { ...trend.range, endTime: event.target.value ? Date.parse(event.target.value) : undefined } })} /></label>}
        {trend.range.kind === "points" && <DynamizationTextField label="Punti di misura" value={String(trend.range.measuringPoints)} onCommit={(value) => patchCurve(index, { range: { ...trend.range, measuringPoints: Math.max(1, Math.min(config.maxPoints, Number(value) || 1)) } })} />}
        <DynamizationTextField label="Tolleranza X/Y (ms)" value={String(trend.pairToleranceMs)} onCommit={(value) => patchCurve(index, { pairToleranceMs: Math.max(0, Number(value) || 0) })} />
        <p className="inspector-note">Ogni campione Y usa il campione X più vicino entro questa tolleranza. Con 0 ms i timestamp devono coincidere.</p>
      </details>
      <div className="property-pair"><label className="dynamization-field"><span>Disegno</span><select value={trend.mode} onChange={(event) => patchCurve(index, { mode: event.target.value as HmiTrendMode })}>{hmiTrendModes.map((mode) => <option key={mode} value={mode}>{({ points: "Punti", interpolated: "Interpolata", stepped: "A gradini", values: "Valori" } as const)[mode]}</option>)}</select></label><label className="dynamization-field"><span>Colore</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(trend.color) ? trend.color : "#00A1D1"} onChange={(event) => patchCurve(index, { color: event.target.value })} /></label></div>
      <div className="property-pair"><DynamizationTextField label="Soglia Y bassa" value={String(trend.lowThreshold ?? "")} onCommit={(value) => patchCurve(index, { lowThreshold: numeric(value) })} /><DynamizationTextField label="Soglia Y alta" value={String(trend.highThreshold ?? "")} onCommit={(value) => patchCurve(index, { highThreshold: numeric(value) })} /></div>
      <label className="trend-visible"><input type="checkbox" checked={trend.visible} onChange={(event) => patchCurve(index, { visible: event.target.checked })} /> Visibile all'avvio</label>
    </article>)}</div>
    <button type="button" className="link-button" onClick={() => setLeftPanel("logs")}>Gestisci Data Log e storico</button>
    {issues.map((issue, index) => <p key={index} className={`dynamization-expression-status ${issue.severity === "error" ? "error" : ""}`}>{issue.message}</p>)}
  </InspectorSection>;
}

function HmiEventCard({ binding, index, all, allowed, onWrite }: { binding: HmiEventBinding; index: number; all: readonly HmiEventBinding[]; allowed: readonly HmiEventType[]; onWrite: (items: HmiEventBinding[]) => void }) {
  const pages = useEditorStore((state) => state.pages);
  const action = readGuidedAction(binding.script);
  const scriptCatalog = useEditorStore((state) => state.scriptCatalog);
  const scope = useEditorStore((state) => state.previewPath);
  const [script, setScript] = useState(binding.script);
  useEffect(() => { setScript(binding.script); }, [binding.script]);
  const inspection = inspectHmiScript(script, hmiScriptFunctions(scriptCatalog, scope, "events"), hmiScriptGlobalDefinition(scriptCatalog, scope, "events")?.program, [], hmiScriptVariables(scriptCatalog));
  const patch = (values: Partial<HmiEventBinding>) => onWrite(all.map((item, current) => current === index ? { ...item, ...values } : item));
  return <article className="dynamization-card hmi-event-card">
    <div className="dynamization-card-head"><span><MousePointerClick size={13} /><strong>{action ? guidedActionLabels[action.kind] : "Azione personalizzata"}</strong></span><button type="button" onClick={() => onWrite(all.filter((_, current) => current !== index))} title="Rimuovi azione" aria-label={`Rimuovi azione ${index + 1}`}><Trash2 size={12} /></button></div>
    <label className="dynamization-field"><span>Quando</span><select value={binding.event} onChange={(event) => patch({ event: event.target.value as HmiEventType })}>
      {[...new Set([binding.event, ...allowed])].map((event) => <option key={event} value={event}>{hmiEventLabels[event]}</option>)}
    </select></label>
    {binding.event === "DoubleTapped" && <p className="inspector-note">Il doppio click è un’estensione Framecraft. Se configuri anche il click singolo, il browser esegue prima i due click singoli.</p>}
    <label className="dynamization-field"><span>Cosa succede</span><select value={action?.kind ?? "script"} onChange={(event) => patch({ script: event.target.value === "script" ? binding.script + "\n// Azione personalizzata" : guidedActionScript(event.target.value as GuidedActionKind, event.target.value === "navigate" ? pages[0]?.stateValue ?? pages[0]?.route ?? "/" : event.target.value === "trace" ? "Evento eseguito" : action && !["trace", "navigate"].includes(action.kind) ? action.target : "NomeElemento") })}>
      {Object.entries(guidedActionLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}<option value="script">Script personalizzato</option>
    </select></label>
    {action ? <>
      {action.kind === "navigate" ? <label className="dynamization-field"><span>Pagina</span><select value={action.target} onChange={(event) => patch({ script: guidedActionScript(action.kind, event.target.value) })}>
        {!pages.some((page) => (page.stateValue ?? page.route) === action.target) && <option value={action.target}>{action.target}</option>}
        {pages.filter((page) => page.stateValue || page.route).map((page) => <option key={page.id} value={page.stateValue ?? page.route}>{page.name}</option>)}
      </select></label> : <DynamizationTextField label={action.kind === "trace" ? "Messaggio" : "Nome oggetto nella pagina"} value={action.target} onCommit={(target) => patch({ script: guidedActionScript(action.kind, target) })} />}
      <p className="inspector-note">{action.kind === "trace" ? "Scrive un messaggio nella diagnostica: non apre un avviso e non conferma un comando PLC." : action.kind === "navigate" ? "Apre la pagina scelta nel pannello." : "Usa il Nome oggetto dell’elemento di destinazione. La modifica dura nella pagina aperta e non cambia il progetto."}</p>
    </> : <>
    <label className="hmi-event-script"><span>Script locale</span><textarea value={script} spellCheck={false}
      placeholder={'HMIRuntime.Tags.SysFct.SetTagValue("Command", 1);'}
      onChange={(event) => setScript(event.target.value)} onBlur={() => script.trim() !== binding.script && patch({ script: script.trim() })}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <small className={`dynamization-expression-status ${inspection.error ? "error" : "valid"}`}>
      {inspection.error ?? `valido${inspection.hasAsync ? " · Promise" : ""} · legge ${inspection.tagsRead.length} · scrive ${inspection.tagsWritten.length}`}
    </small>
    {binding.event === "GestureDetected" && <p className="dynamization-expression-help">Lo script riceve <code>gesture</code>: confrontalo con <code>UI.Enums.HmiGesture.SwipeLeft</code>, <code>SwipeRight</code>, <code>SwipeUp</code> o <code>SwipeDown</code>.</p>}
    {(binding.event === "KeyDown" || binding.event === "KeyUp" || binding.event === "HotKey") && <p className="dynamization-expression-help">Lo script riceve <code>key</code> con il nome del tasto premuto.</p>}
    {binding.event === "CommandFired" && <p className="dynamization-expression-help">Lo script riceve <code>command</code> con il comando emesso dal controllo.</p>}
    {binding.event === "InterfaceEvent" && <p className="dynamization-expression-help">Lo script riceve <code>interfaceEvent</code> con il nome dell’evento del faceplate o custom control.</p>}
    <p className="dynamization-expression-help">In modalità <strong>Usa pannello</strong> scritture, trace e cambio pagina vengono eseguiti nella simulazione e registrati nella diagnostica. Le funzioni di <strong>Pannello → Moduli JavaScript</strong> si chiamano con <code>Modules.Alias.Funzione(...)</code> o <code>Local.Funzione(...)</code>. Sono ammessi anche <code>ReadAsync</code>/<code>WriteAsync</code> con <code>then/catch</code> oppure <code>await</code> e <code>try/catch</code>. I timer usano <code>HMIRuntime.Timers.SetTimeout</code>/<code>SetInterval</code> con callback inline o di modulo e si fermano con <code>ClearTimeout</code>/<code>ClearInterval</code>. Per dati con qualità e data/ora usa <code>WriteQCD</code>; per una modifica tracciata con motivo usa <code>WriteWithOperatorMessage</code>.</p>
    </>}
  </article>;
}

function HmiEventSection({ node }: { node: EditorNode }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const removeAttribute = useEditorStore((state) => state.removeAttribute);
  const items = parseHmiEvents(node.props[hmiEventsAttribute]);
  const allowed = hmiEventTypesFor(node);
  const write = (next: HmiEventBinding[]) => void (next.length ? update(hmiEventsAttribute, serializeHmiEvents(next)) : removeAttribute(hmiEventsAttribute));
  const legacy = typeof node.props["data-hmi-event"] === "string" ? String(node.props["data-hmi-event"]) : "";
  return <div className="element-reaction-actions">
    <DynamizationTextField label="Nome oggetto per gli script" value={String(node.props["data-hmi-name"] ?? node.props.id ?? "")} placeholder="es. M2400" onCommit={(name) => void (name ? update("data-hmi-name", name) : removeAttribute("data-hmi-name"))} />
    <details className="dynamization-expression-help"><summary>Guida alle azioni personalizzate · Unified</summary>
    <details className="dynamization-expression-help"><summary>Leggere e modificare un oggetto · Unified</summary><p>Usa <code>item</code> per questo componente, <code>Screen.Items("M2400")</code> per un nome nella pagina oppure <code>Faceplate.Items("Nome")</code> dentro l’istanza faceplate.</p><p><code>const motore = Screen.Items("M2400"); motore.Text = "Motore pronto"; motore.BackColor = HMIRuntime.Math.RGB(0, 128, 0); motore.Enabled = false; HMIRuntime.Trace(motore.Name);</code></p><p>Sono disponibili <code>Left</code>, <code>Top</code>, <code>Width</code>, <code>Height</code>, <code>Visible</code>, <code>Enabled</code> e i tre colori. <code>Text</code> è disponibile quando il contenuto testuale è univoco; icone e componenti figli non vengono cancellati. Il nome è in sola lettura. Boolean e numeri sono tipizzati.</p><p>Le modifiche sono temporanee durante la prova, non cambiano il JSX e non scrivono tag PLC. Tornando alla modifica grafica vengono ripristinati i valori della pagina.</p></details>
    <details className="dynamization-expression-help"><summary>Lampeggio da script · Unified</summary><p>Usa un nome univoco nella pagina per chiamare <code>Screen.Items("M2400")</code>, oppure <code>item</code> per l’oggetto dell’evento. Dentro un faceplate usa <code>Faceplate.Items("Nome")</code>.</p><p><code>item.PropertyFlashing("BackColor", true, HMIRuntime.Math.RGB(255, 0, 0), HMIRuntime.Math.RGB(0, 0, 0), UI.Enums.HmiFlashingRate.Fast);</code></p><p>Per fermarlo: <code>item.PropertyFlashing("BackColor", false);</code>. Sono disponibili anche <code>ForeColor</code> e <code>BorderColor</code>. Senza colori espliciti usa quelli già configurati nel lampeggio dichiarativo. Il colore base non cambia; la riduzione movimento resta rispettata.</p></details>
    <details className="dynamization-expression-help"><summary>Carattere da script · Unified</summary><p>Usa <code>item.Font</code> o il <code>Font</code> dell’oggetto trovato con <code>Screen.Items</code>/<code>Faceplate.Items</code>.</p><p><code>const font = item.Font; font.Name = "Arial"; font.Size = 18.5; font.Weight = 700; font.Italic = true; font.Underline = false; font.StrikeOut = 0;</code></p><p><code>Size</code> è un Float in DIU, anche decimale; <code>Italic</code>/<code>Underline</code> sono Boolean. <code>Weight</code> usa 0, 300, 400, 600 o 700; <code>StrikeOut</code> usa 0 oppure 1, non true/false. Il font viene applicato al testo univoco o al campo input senza cambiare icone e valori PLC. La famiglia deve essere disponibile sul dispositivo: non vengono scaricati font. Anche queste modifiche sono temporanee durante la prova.</p></details>
    </details>
    {!items.length && <p className="inspector-note">Aggiungi un’azione, poi scegli quando deve partire: click, doppio click o gli altri eventi disponibili per l’elemento.</p>}
    {legacy && <p className="inspector-note">L'elemento importato dichiara già gli eventi <code>{legacy}</code>. Aggiungi qui il comportamento modificabile ed eseguibile.</p>}
    <div className="dynamization-list">{items.map((binding, index) => <HmiEventCard key={`${binding.event}-${index}`} binding={binding} index={index} all={items} allowed={allowed} onWrite={write} />)}</div>
    <button className="dynamization-add-rule hmi-event-add" type="button" onClick={() => write([...items, newGuidedAction("trace", "Evento eseguito", allowed.includes("Tapped") ? "Tapped" : allowed[0] ?? "Tapped")])}><Plus size={12} /> Aggiungi azione</button>
  </div>;
}

function InformationSection({ node, tag, file, expandSignal, initiallyOpen = true }: { node?: EditorNode; tag?: string; file: string; expandSignal?: number; initiallyOpen?: boolean }) {
  const info = useEditorStore((state) => state.selectionInfo);
  const document = useEditorStore((state) => state.document);
  const catalog = useEditorStore((state) => state.plcVariables);
  const project = useEditorStore((state) => state.project);

  const tags = new Set<string>();
  if (info?.plcTag) tags.add(info.plcTag);
  // A binding written as hmi.value("Machine.Speed") lives in the element's own JSX, not in an attribute.
  if (node && document) {
    for (const name of plcTagsInSource(document.source.slice(node.source.start, node.source.end))) tags.add(name);
  }
  const displayed = info?.text?.trim();
  const external = !insideProject(project?.root, file);
  const name = file.split(/[\\/]/).at(-1) ?? file;

  return <InspectorSection title="Informazioni" icon={<Info size={12} />} initiallyOpen={initiallyOpen} expandSignal={expandSignal}>
    <InfoRow label="Elemento" value={node?.type ?? tag ?? "—"} />
    {displayed ? <label className="property-stack read-only-stack"><span>Testo mostrato</span><p title={displayed}>{displayed}</p></label>
      : <InfoRow label="Testo mostrato" value="nessuno" />}
    {node && <InfoRow label="Testo nel sorgente" value={node.capabilities.text ? node.dynamic ? "dinamico · sostituibile" : "statico · modificabile" : node.dynamic ? "struttura dinamica" : "nessuno"} />}
    {[...tags].map((plcTag) => {
      const variable = catalog.find((item) => item.name === plcTag);
      return <div className="plc-binding" key={plcTag}>
        <span className="plc-binding-title"><Cable size={12} /> Variabile PLC</span>
        <strong>{plcTag}</strong>
        <span className="plc-binding-detail">
          <em>{variable?.dataType || "tipo da definire"}</em>
          <em>{variable?.access ?? "read"}</em>
          <em title={variable?.address}>{variable?.address || "indirizzo da definire"}</em>
        </span>
        {variable?.description && <small>{variable.description}</small>}
      </div>;
    })}
    {!tags.size && <InfoRow label="Variabile PLC" value="nessuna" />}
    {info?.id && <InfoRow label="id" value={info.id} title={info.id} />}
    {info?.className && <InfoRow label="Classi" value={info.className} title={info.className} />}
    <InfoRow label="Sorgente" value={node ? `${name}:${node.source.line}` : name} title={file} />
    <InfoRow label="File" value={external ? "condiviso · originale" : "copia di lavoro"} title={file} />
  </InspectorSection>;
}

const readOnlyGroups: { title: string; icon: ReactNode; properties: string[] }[] = [
  { title: "Posizione", icon: <Move size={12} />, properties: ["position", "left", "top", "right", "bottom", "zIndex", "translate", "rotate", "scale"] },
  { title: "Dimensioni", icon: <Ruler size={12} />, properties: ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "aspectRatio"] },
  { title: "Aspetto", icon: <Palette size={12} />, properties: ["backgroundColor", "backgroundImage", "color", "border", "borderRadius", "boxShadow", "outline", "opacity", "objectFit"] },
  { title: "Layout", icon: <LayoutGrid size={12} />, properties: ["display", "flexDirection", "flexWrap", "alignItems", "justifyContent", "gap", "overflow", "margin", "padding"] },
  { title: "Testo e font", icon: <TypeIcon size={12} />, properties: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform", "textDecoration", "whiteSpace"] },
  { title: "Avanzate", icon: <SlidersHorizontal size={12} />, properties: ["visibility", "cursor", "pointerEvents"] },
];

/** An element rendered from outside the open project still has properties worth showing: they come
 * from the running preview rather than from the source, so they are presented read-only. */
function explain(reason: SelectionProblem, name: string) {
  if (reason === "outside") return `${name} sta fuori dal progetto aperto e dalle cartelle sorgente che dichiara.`;
  if (reason === "unreadable") return `Non è stato possibile leggere ${name}.`;
  if (reason === "unparsed") return `${name} contiene un errore di sintassi, quindi non è analizzabile.`;
  return `Questo elemento non corrisponde più al sorgente di ${name}: aggiorna l’anteprima e riprova.`;
}

function ExternalElementSheet({ file, tag, reason, detail, expandSignal }: { file: string; tag?: string; reason: SelectionProblem; detail?: string; expandSignal?: number }) {
  const selectionRect = useEditorStore((state) => state.selectionRect);
  const selectionStyles = useEditorStore((state) => state.selectionStyles);
  const refreshPreview = useEditorStore((state) => state.refreshPreview);
  const name = file.split(/[\\/]/).at(-1) ?? file;
  return <>
    <div className="selection-summary"><span className="node-icon">&lt;/&gt;</span><span><strong>{elementName(tag)}</strong><small>{selectionRect ? `${rounded(selectionRect.width)} × ${rounded(selectionRect.height)} px` : "fuori dal progetto"} · sola lettura</small></span></div>
    <div className="code-component external-source"><Lock size={13} /><span>{explain(reason, name)}{detail ? ` (${detail})` : ""} Le proprietà qui sotto sono quelle calcolate dall’anteprima.<small title={file}>{file}</small></span></div>
    {/* The message tells the user to refresh; handing them the button beats making them hunt for it. */}
    {reason === "missing" && <button className="stale-selection-recovery" onClick={refreshPreview}><RefreshCw size={13} /> Aggiorna l’anteprima e riprova</button>}
    <InformationSection tag={tag} file={file} expandSignal={expandSignal} />
    {readOnlyGroups.map(({ title, icon, properties }) => {
      const rows = properties.filter((property) => selectionStyles[property]);
      if (!rows.length) return null;
      return <InspectorSection key={title} title={title} icon={icon} expandSignal={expandSignal}>
        {rows.map((property) => <div className="property-field read-only-property" key={property}><span title={property}>{property}</span><em title={selectionStyles[property]}>{selectionStyles[property]}</em></div>)}
      </InspectorSection>;
    })}
  </>;
}

/** Why an evidenziazione cannot be added here. Answered before the user goes and picks a part,
 * because being told after the work is done reads as the editor not working at all. */
function highlightBlocker(node: EditorNode, copies: number): string | undefined {
  if (node.type !== "button") return "L'evidenziazione si aggiunge partendo da un pulsante.";
  if (copies > 1) return `Questo pulsante è una delle ${copies} copie disegnate dalla stessa lista: l'evidenziazione varrebbe per tutte e punterebbe sempre alla prima parte.`;
  return undefined;
}

function HighlightInteractionEditor({ node, copies }: { node: EditorNode; copies: number }) {
  const beginSelection = useEditorStore((state) => state.beginHighlightSelection);
  const cancelSelection = useEditorStore((state) => state.cancelHighlightSelection);
  const updateInteraction = useEditorStore((state) => state.updateHighlightInteraction);
  const removeInteraction = useEditorStore((state) => state.removeHighlightInteraction);
  const picker = useEditorStore((state) => state.highlightPicker);
  const targetId = typeof node.props["data-fc-highlight-target"] === "string" ? node.props["data-fc-highlight-target"] : undefined;
  const savedColor = typeof node.props["data-fc-highlight-color"] === "string" ? node.props["data-fc-highlight-color"] : "#f59e0b";
  const savedWidth = typeof node.props["data-fc-highlight-width"] === "string" ? Number(node.props["data-fc-highlight-width"]) : 3;
  type HighlightEvent = "Tapped" | "DoubleTapped" | "Down" | "Up" | "ContextTapped";
  const savedEvent = String(node.props["data-fc-highlight-event"] ?? "Tapped") as HighlightEvent;
  const [event, setEvent] = useState(savedEvent);
  const [color, setColor] = useState(savedColor);
  const [width, setWidth] = useState(savedWidth);
  const [zoneShape, setZoneShape] = useState<"rectangle" | "polygon">("rectangle");
  const region = readHighlightRegion(node.props["data-fc-highlight-region"]);
  useEffect(() => { setColor(savedColor); setWidth(savedWidth); }, [node.id, savedColor, savedWidth]);
  useEffect(() => setEvent(savedEvent), [node.id, savedEvent]);
  const isPicking = picker?.trigger.file === node.source.file && picker.trigger.start === node.source.start;
  // An element that already carries a highlight stays editable whatever else is true of it: the
  // interaction exists, and refusing to show it would only hide something the user can undo.
  const blocked = targetId ? undefined : highlightBlocker(node, copies);
  if (blocked) return <p className="inspector-note">{blocked}</p>;

  return <section className="inspector-section interaction-editor">
    <div className="interaction-card">
      <div className="interaction-card-title"><span><Highlighter size={14} /></span><div><strong>Evidenzia una parte</strong><small>{region ? "Zona disegnata e modificabile" : targetId ? "Elemento collegato e modificabile" : "Scegli una parte o disegna una zona"}</small></div></div>
      <label className="user-access-field"><span>Quando evidenzia</span><select value={event} onChange={(change) => setEvent(change.target.value as HighlightEvent)}>{(["Tapped", "DoubleTapped", "Down", "Up", "ContextTapped"] as const).map((item) => <option key={item} value={item}>{hmiEventLabels[item]}</option>)}</select></label>
      <label className="interaction-color"><span>Colore</span><span className="color-control"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Colore evidenziazione" /><code>{color}</code></span></label>
      <label className="interaction-width"><span>Spessore</span><input type="range" min="1" max="8" value={width} onChange={(event) => setWidth(Number(event.target.value))} /><output>{width}px</output></label>
      {isPicking ? <button className="interaction-action secondary" onClick={cancelSelection}><X size={14} /> Annulla selezione</button> : <>
        {targetId && <button className="interaction-action primary" onClick={() => void updateInteraction({ color, width, event })}><Save size={14} /> Applica modifiche</button>}
        <label className="interaction-zone-shape"><span>Forma zona</span><select value={zoneShape} onChange={(event) => setZoneShape(event.target.value as "rectangle" | "polygon")} aria-label="Forma della zona da evidenziare"><option value="rectangle">Rettangolo</option><option value="polygon">Contorno a punti</option></select></label>
        <button type="button" className="interaction-action primary" onClick={() => beginSelection({ color, width, event }, zoneShape)}><SquareMousePointer size={14} /> {region ? "Ridisegna zona" : "Disegna zona"}</button>
        <p className="interaction-zone-help">Trascina sulla foto per un rettangolo, oppure clicca gli angoli di un contorno e premi Invio. Esc annulla.</p>
        <button type="button" className="interaction-action secondary" onClick={() => beginSelection({ color, width, event })}><MousePointerClick size={14} /> {targetId ? "Cambia parte" : "Scegli la parte"}</button>
        {targetId && <button className="interaction-remove" onClick={() => void removeInteraction()}><Trash2 size={13} /> Rimuovi interazione</button>}
      </>}
    </div>
  </section>;
}

function shortFileName(file: string) {
  return file.split(/[\\/]/).at(-1) ?? file;
}

/** One value of the data row behind the element: the label of a card, the id of a machine part. */
/** What a value of the row turns into on screen. An attribute name means nothing on its own; where
 * it is drawn is what lets the user recognise the area, the picture or the label. */
const drawnAs: Record<string, string> = {
  d: "disegna il contorno", src: "è l'immagine", href: "è il collegamento", alt: "è la descrizione",
  title: "è il titolo", value: "è il valore", "": "è la scritta", className: "sceglie lo stile",
  x: "è la posizione", y: "è la posizione", width: "è la larghezza", height: "è l'altezza",
};

function usageHint(use?: ValueUse) {
  if (!use) return undefined;
  const role = drawnAs[use.attribute] ?? `riempie ${use.attribute}`;
  return `${role} di <${use.tag}> in ${shortFileName(use.file)}`;
}

function ListItemField({ property, hint, label, textFieldRef }: { property: ListItemProperty; hint?: string; label?: string; textFieldRef?: (field: HTMLInputElement | HTMLTextAreaElement | null) => void }) {
  const update = useEditorStore((state) => state.updateListItemProperty);
  const chooseImage = useEditorStore((state) => state.chooseImage);
  const [draft, setDraft] = useState(property.value);
  const cancelled = useRef(false);
  useEffect(() => { setDraft(property.value); }, [property.start, property.value]);
  const apply = (next: string) => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (next !== property.value) void update(property.name, next);
  };

  if (label === "Testo" && property.kind === "text") return <EditableTextField value={property.value} label="Testo" multiline={property.value.length > 60 || property.value.includes("\n")} fieldRef={textFieldRef} onCommit={(value) => update(property.name, value)} />;

  if (property.kind === "boolean") {
    return <label className="property-field"><span title={property.name}>{label ?? property.name}</span>
      <select value={draft} onChange={(event) => { setDraft(event.target.value); apply(event.target.value); }}>
        <option value="true">vero</option>
        <option value="false">falso</option>
      </select>
    </label>;
  }
  if (property.kind === "text" && hint?.includes("è l'immagine")) {
    return <div className="list-image-field">
      <label className="property-field"><span title={`${property.name} · ${hint}`}>{label ?? property.name}</span>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { cancelled.current = true; setDraft(property.value); event.currentTarget.blur(); }
        }} onBlur={() => apply(draft)} />
      </label>
      <button type="button" onClick={() => void chooseImage(property.name)}><Upload size={13} /> Scegli immagine</button>
    </div>;
  }
  // The outline of a machine part is an SVG path hundreds of characters long: a one-line field
  // would show a tenth of it.
  if (property.kind === "text" && (property.value.length > 60 || property.value.includes("\n"))) {
    return <label className="property-stack"><span title={hint ?? property.name}>{label ?? property.name}{hint ? <em className="field-hint"> · {hint}</em> : null}</span>
      <textarea ref={textFieldRef} value={draft} rows={3} spellCheck={false} aria-label={label ?? property.name}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { cancelled.current = true; setDraft(property.value); event.currentTarget.blur(); }
        }}
        onBlur={() => apply(draft)} />
    </label>;
  }
  return <label className="property-field"><span title={hint ? `${property.name} · ${hint}` : property.name}>{label ?? property.name}</span>
    <input ref={textFieldRef} value={draft} type={property.kind === "number" ? "number" : "text"}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { cancelled.current = true; setDraft(property.value); event.currentTarget.blur(); }
      }}
      onBlur={() => apply(draft)} />
  </label>;
}

function EmptyHighlightEditor({ properties }: { properties: ListItemProperty[] }) {
  const setHighlight = useEditorStore((state) => state.setListItemHighlight);
  const byName = new Map(properties.map((property) => [property.name, property]));
  const x = Number(byName.get("marker.x")?.value ?? 0) - 8;
  const y = Number(byName.get("marker.y")?.value ?? 0) - 8;
  const width = Number(byName.get("marker.width")?.value ?? 120) + 16;
  const bounds = { x, y, width: Math.max(20, width), height: 68 };
  return <div className="empty-highlight-editor">
    <div className="free-property-title"><Highlighter size={12} /> Nessuna area evidenziata</div>
    <p className="inspector-note">Non c’è nessuna forma da scegliere: parte da un contorno di quattro angoli sulla zona cliccabile, poi lo tiri come vuoi — qui o direttamente sul pannello — trascinando lati e angoli, aggiungendone e togliendone.</p>
    <button type="button" className="create-highlight-button" onClick={() => void setHighlight({ type: "area", d: highlightShapePath("rectangle", bounds) })}>
      <Plus size={14} /> Crea area modificabile
    </button>
  </div>;
}

/** Machine overlays commonly keep the clickable hotspot and the coloured outline in the same data
 * row. Presenting `marker.x` and a long SVG `d` as unrelated developer fields made a very ordinary
 * edit unnecessarily cryptic. */
function SelectionAreaEditor({ properties }: { properties: ListItemProperty[] }) {
  const update = useEditorStore((state) => state.updateListItemProperty);
  const setHighlight = useEditorStore((state) => state.setListItemHighlight);
  const setHighlightPreview = useEditorStore((state) => state.setHighlightPreview);
  // One corner too many is as ordinary as one missing: the store owns the geometry so a refusal
  // — the last three corners of a closed outline — is explained instead of ignored.
  const removeAnchor = useEditorStore((state) => state.removeHighlightAnchor);
  const byName = new Map(properties.map((property) => [property.name, property]));
  const x = byName.get("marker.x");
  const y = byName.get("marker.y");
  const width = byName.get("marker.width");
  const type = byName.get("highlight.type");
  const path = byName.get("highlight.d");
  // The clickable hotspot and the outline usually travel together, but a row that carries only the
  // outline is still worth shaping: refusing it left the drawing editable nowhere.
  if (!path) return null;
  const safeBounds = (value: string): PathBounds => {
    try { return pathBounds(value); } catch { return { x: 0, y: 0, width: 100, height: 100 }; }
  };
  const [previewPath, setPreviewPath] = useState(path.value);
  const previewPathRef = useRef(path.value);
  const [geometry, setGeometry] = useState(() => safeBounds(path.value));
  type DragMode = "move" | "n" | "e" | "s" | "w" | "anchor";
  const drag = useRef<{ pointerId: number; mode: DragMode; clientX: number; clientY: number; bounds: PathBounds; path: string; anchorIndex?: number; anchorX?: number; anchorY?: number } | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    setPreviewPath(path.value);
    previewPathRef.current = path.value;
    setGeometry(safeBounds(path.value));
  }, [path.start, path.value]);
  useEffect(() => {
    setHighlightPreview({ path: previewPath, kind: type?.value, editable: true });
    return () => setHighlightPreview(undefined);
  }, [previewPath, setHighlightPreview, type?.value]);

  const viewBox = useMemo(() => {
    const bounds = safeBounds(path.value);
    const padding = Math.max(35, Math.max(bounds.width, bounds.height) * .28);
    return { x: bounds.x - padding, y: bounds.y - padding, width: Math.max(120, bounds.width + padding * 2), height: Math.max(90, bounds.height + padding * 2) };
  }, [path.start, path.value]);
  const shown = safeBounds(previewPath);
  const handle = Math.max(viewBox.width, viewBox.height) / 48;

  const previewGeometry = (next: PathBounds, sourcePath = path.value) => {
    const clean = { x: next.x, y: next.y, width: Math.max(1, next.width), height: Math.max(1, next.height) };
    setGeometry(clean);
    const transformed = transformPathToBounds(sourcePath, clean);
    setPreviewPath(transformed);
    previewPathRef.current = transformed;
    return transformed;
  };
  const commitGeometry = (next: PathBounds) => {
    try {
      const transformed = previewGeometry(next);
      if (transformed !== path.value) void update("highlight.d", transformed);
    } catch { setPreviewPath(path.value); setGeometry(safeBounds(path.value)); }
  };
  const changeGeometry = (name: keyof PathBounds, value: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    try { previewGeometry({ ...geometry, [name]: numeric }); } catch { /* Keep the last valid outline. */ }
  };
  const beginDrag = (event: ReactPointerEvent<SVGElement>, mode: DragMode, anchorIndex?: number) => {
    event.preventDefault();
    event.stopPropagation();
    const anchor = anchorIndex == null ? undefined : pathAnchors(previewPath)[anchorIndex];
    drag.current = { pointerId: event.pointerId, mode, clientX: event.clientX, clientY: event.clientY, bounds: shown, path: previewPath,
      anchorIndex, anchorX: anchor?.x, anchorY: anchor?.y };
    svg.current?.setPointerCapture?.(event.pointerId);
  };
  const beginAddAnchor = (event: ReactPointerEvent<SVGElement>, afterIndex: number, point: { x: number; y: number }) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const nextPath = insertPathAnchor(previewPath, afterIndex, point);
      setPreviewPath(nextPath);
      previewPathRef.current = nextPath;
      setGeometry(safeBounds(nextPath));
      drag.current = { pointerId: event.pointerId, mode: "anchor", clientX: event.clientX, clientY: event.clientY,
        bounds: safeBounds(nextPath), path: nextPath, anchorIndex: afterIndex + 1, anchorX: point.x, anchorY: point.y };
      svg.current?.setPointerCapture?.(event.pointerId);
    } catch { /* A side too short to split stays unchanged. */ }
  };
  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const session = drag.current;
    const element = svg.current;
    if (!session || !element || session.pointerId !== event.pointerId) return;
    const rect = element.getBoundingClientRect();
    const dx = (event.clientX - session.clientX) * viewBox.width / rect.width;
    const dy = (event.clientY - session.clientY) * viewBox.height / rect.height;
    if (session.mode === "anchor" && session.anchorIndex != null && session.anchorX != null && session.anchorY != null) {
      try {
        const nextPath = movePathAnchor(session.path, session.anchorIndex, session.anchorX + dx, session.anchorY + dy);
        setPreviewPath(nextPath);
        previewPathRef.current = nextPath;
        setGeometry(safeBounds(nextPath));
      } catch { /* Pointer stays on the last valid point. */ }
      return;
    }
    let next = { ...session.bounds };
    if (session.mode === "move") next = { ...next, x: next.x + dx, y: next.y + dy };
    else {
      if (session.mode === "w") { next.x += dx; next.width -= dx; }
      if (session.mode === "e") next.width += dx;
      if (session.mode === "n") { next.y += dy; next.height -= dy; }
      if (session.mode === "s") next.height += dy;
      if (next.width < 4) { if (session.mode.includes("w")) next.x -= 4 - next.width; next.width = 4; }
      if (next.height < 4) { if (session.mode.includes("n")) next.y -= 4 - next.height; next.height = 4; }
    }
    try { previewGeometry(next, session.path); } catch { /* Pointer stays on the last valid geometry. */ }
  };
  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = undefined;
    svg.current?.releasePointerCapture?.(event.pointerId);
    if (previewPathRef.current !== path.value) void update("highlight.d", previewPathRef.current);
  };
  const anchors = pathAnchors(previewPath);
  const closed = pathClosed(previewPath);
  const sides = anchors.slice(0, closed ? anchors.length : Math.max(0, anchors.length - 1)).map((anchor, index) => {
    const next = anchors[(index + 1) % anchors.length];
    return { afterIndex: index, x: (anchor.x + next.x) / 2, y: (anchor.y + next.y) / 2 };
  });
  const changeClosure = () => {
    try {
      const nextPath = setPathClosed(previewPath, !closed);
      setPreviewPath(nextPath);
      previewPathRef.current = nextPath;
      setGeometry(safeBounds(nextPath));
      void setHighlight({ type: closed ? "route" : "area", d: nextPath });
    } catch { /* The helper explains the requirement by leaving the button disabled below. */ }
  };
  return <div className="selection-area-editor">
    {x && y && width && <>
      <div className="free-property-title"><MousePointerClick size={12} /> Area cliccabile</div>
      <p className="inspector-note">Questi valori spostano e allargano la zona che riceve il click per questa sola voce.</p>
      <ListItemField property={x} label="Posizione X" />
      <ListItemField property={y} label="Posizione Y" />
      <ListItemField property={width} label="Larghezza" />
    </>}
    <div className="free-property-title area-highlight-title"><Highlighter size={12} /> Area evidenziata</div>
    <p className="inspector-note">La forma non è un modello da scegliere: è la tua. Trascina il contorno per spostarlo, le maniglie blu per allungare un lato, ogni punto arancione per muovere un angolo, i “+” per aggiungerne uno e un doppio click su un angolo per toglierlo. Gli stessi punti compaiono sul pannello: puoi disegnarla direttamente sulla macchina.</p>
    <svg ref={svg} className="highlight-geometry-canvas" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      tabIndex={0}
      aria-label="Anteprima modificabile dell’area evidenziata"
      onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
      <defs><pattern id="framecraft-highlight-grid" width={viewBox.width / 12} height={viewBox.width / 12} patternUnits="userSpaceOnUse"><path d={`M ${viewBox.width / 12} 0 L 0 0 0 ${viewBox.width / 12}`} /></pattern></defs>
      <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} className="highlight-grid" />
      <path d={previewPath} className={`highlight-shape ${type?.value === "route" ? "route" : "area"}`} onPointerDown={(event) => beginDrag(event, "move")} />
      <rect x={shown.x} y={shown.y} width={shown.width} height={shown.height} className="highlight-bounds" />
      {([['n', shown.x + shown.width / 2, shown.y], ['e', shown.x + shown.width, shown.y + shown.height / 2], ['s', shown.x + shown.width / 2, shown.y + shown.height], ['w', shown.x, shown.y + shown.height / 2]] as const).map(([mode, cx, cy]) =>
        <rect key={mode} x={cx - handle * 1.25} y={cy - handle * 1.25} width={handle * 2.5} height={handle * 2.5} rx={handle * .7} className={`highlight-edge-handle ${mode}`} onPointerDown={(event) => beginDrag(event, mode)} />)}
      {sides.map((side) => <g key={`side-${side.afterIndex}`} className="highlight-add-point" onPointerDown={(event) => beginAddAnchor(event, side.afterIndex, side)}>
        <circle cx={side.x} cy={side.y} r={handle * .8} /><path d={`M${side.x - handle * .35} ${side.y}H${side.x + handle * .35}M${side.x} ${side.y - handle * .35}V${side.y + handle * .35}`} />
      </g>)}
      {anchors.map((anchor) => <rect key={`anchor-${anchor.index}`} x={anchor.x - handle} y={anchor.y - handle} width={handle * 2} height={handle * 2} rx={handle * .25}
        className="highlight-anchor-handle" onPointerDown={(event) => beginDrag(event, "anchor", anchor.index)}
        onDoubleClick={(event) => { event.preventDefault(); void removeAnchor(anchor.index); }} />)}
    </svg>
    <button type="button" className="highlight-closure-button" disabled={!closed && anchors.length < 3} onClick={changeClosure}>
      {closed ? "Apri il contorno" : "Chiudi il contorno e riempi l’area"}
    </button>
    <div className="highlight-geometry-fields">
      {([['x', 'X'], ['y', 'Y'], ['width', 'Larghezza'], ['height', 'Altezza']] as const).map(([name, label]) => <label key={name}><span>{label}</span><input type="number" step="1" value={Math.round(geometry[name] * 10) / 10}
        onChange={(event) => changeGeometry(name, event.target.value)}
        onBlur={() => commitGeometry(geometry)} /></label>)}
    </div>
    <details className="advanced-area-path">
      <summary>Modifica il contorno preciso</summary>
      <ListItemField property={path} label="Tracciato SVG" hint={usageHint(undefined)} />
    </details>
    <button type="button" className="remove-highlight-button" onClick={() => void setHighlight()}><Trash2 size={13} /> Rimuovi evidenziazione</button>
  </div>;
}

/** The row of data an element is drawn from. Editing here beats writing a guard into the JSX: it is
 * the value the list was built from, so the change reads like the panel, not like a patch. */
function ListItemSection({ expandSignal, focusText, textFocusRequestedAt }: { expandSignal?: number; focusText?: (field: HTMLInputElement | HTMLTextAreaElement | null) => void; textFocusRequestedAt?: number }) {
  const binding = useEditorStore((state) => state.listBinding);
  const selectedId = useEditorStore((state) => state.selectedId);
  const remove = useEditorStore((state) => state.removeListItem);
  const duplicate = useEditorStore((state) => state.duplicateListItem);
  const selectedText = useEditorStore((state) => state.selectionInfo?.text)?.trim();
  if (!binding || binding.nodeId !== selectedId || !binding.item) return null;
  const areaNames = new Set(["marker.x", "marker.y", "marker.width", "highlight.type", "highlight.d"]);
  const hasMarker = ["marker.x", "marker.y", "marker.width"].every((name) => binding.item!.properties.some((property) => property.name === name));
  const highlightType = binding.item.properties.find((property) => property.name === "highlight.type")?.value;
  const highlightPath = binding.item.properties.find((property) => property.name === "highlight.d")?.value;
  // An outline is shapeable wherever it is written, with or without the hotspot beside it.
  const hasArea = Boolean(highlightPath) && highlightType !== "none";
  const regularProperties = hasMarker || hasArea ? binding.item.properties.filter((property) => !areaNames.has(property.name)) : binding.item.properties;
  const textProperties = regularProperties.filter((property) => property.kind === "text" && binding.usages?.[property.name]?.attribute === "");
  const primaryText = regularProperties.find((property) => property.name === binding.textProperty)
    ?? textProperties.find((property) => property.value === selectedText) ?? textProperties[0];
  const otherProperties = regularProperties.filter((property) => property !== primaryText);
  return <InspectorSection title="Testo e dati" icon={<Database size={12} />} initiallyOpen expandSignal={Math.max(expandSignal ?? 0, textFocusRequestedAt ?? 0)}>
    <p className="inspector-note">Elemento {binding.index + 1} di {binding.count}. Il testo e i dati cambiano solo nella voce selezionata.
      {binding.shared ? " Il file è condiviso: la stessa voce cambia anche negli altri pannelli che lo usano." : ""}</p>
    {primaryText && <ListItemField key={primaryText.name} property={primaryText} label="Testo" hint={usageHint(binding.usages?.[primaryText.name])} textFieldRef={focusText} />}
    {primaryText && otherProperties.length > 0 ? <details className="list-additional-properties">
      <summary>Altri dati dell’elemento ({otherProperties.length})<ChevronDown size={14} /></summary>
      <p className="inspector-note">Lista <code>{binding.name}</code> · {shortFileName(binding.file)}</p>
      {otherProperties.map((property) => <ListItemField key={property.name} property={property} hint={usageHint(binding.usages?.[property.name])} />)}
    </details> : otherProperties.map((property) => <ListItemField key={property.name} property={property} hint={usageHint(binding.usages?.[property.name])} />)}
    {!regularProperties.length && <p className="inspector-note">Questa voce non contiene valori semplici da modificare.</p>}
    {hasArea && <SelectionAreaEditor properties={binding.item.properties} />}
    {hasMarker && !hasArea && <EmptyHighlightEditor properties={binding.item.properties} />}
    <div className="list-item-actions">
      <button type="button" onClick={() => void duplicate()}><CopyPlus size={13} /> Duplica voce</button>
      <button type="button" className="danger" onClick={() => void remove()}><Trash2 size={13} /> Elimina voce</button>
    </div>
  </InspectorSection>;
}

/** Fills a data-driven table from the PLC catalog. The alarm list of a panel is exactly this: a
 * table whose rows are signals, shipped with two examples and meant to be replaced by the ones the
 * machine really has. */
function PlcListFill({ binding }: { binding: ListBinding }) {
  const catalog = useEditorStore((state) => state.plcVariables);
  const fill = useEditorStore((state) => state.fillListFromPlcVariables);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const [filter, setFilter] = useState("Alarm");
  const [running, setRunning] = useState(false);
  const matching = useMemo(() => plcVariablesMatching(catalog, filter), [catalog, filter]);
  const columns = [...new Set((binding.item?.properties ?? []).map((property) => property.name).filter((name) => !name.includes(".")))];
  if (!binding.item) return null;
  return <div className="plc-list-fill">
    <div className="free-property-title"><Database size={12} /> Riempi la tabella dal catalogo PLC</div>
    {catalog.length
      ? <>
        <label className="property-field"><span>Variabili che contengono</span>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Alarm" aria-label="Filtro sul nome della variabile" />
        </label>
        <p className="inspector-note">{matching.length} variabili su {catalog.length} hanno «{filter}» nel nome o nella tabella tag.
          {columns.length ? <> Verranno scritte le colonne <code>{columns.join(", ")}</code>, una riga per variabile, al posto delle {binding.count} righe attuali di <code>{binding.name}</code>. Ctrl+Z annulla.</> : " Questa riga non ha colonne semplici da riempire."}</p>
        <button type="button" className="plc-list-fill-button" disabled={running || !matching.length || !columns.length}
          onClick={() => { setRunning(true); void fill(filter).finally(() => setRunning(false)); }}>
          <Database size={13} /> {running ? "Scrittura…" : `Importa ${matching.length} variabili nella tabella`}
        </button>
      </>
      : <p className="inspector-note">Il catalogo è vuoto: importa l’export .xlsx delle variabili dal pannello <button type="button" className="link-button" onClick={() => setLeftPanel("plc")}>Variabili PLC</button>.</p>}
  </div>;
}

function pageValuesIn(handlers: HandlerBinding[]): ActionValue[] {
  return handlers.flatMap((handler) => [
    ...handler.values.filter((value) => value.kind === "page"),
    ...pageValuesIn(handler.next),
  ]);
}

function defaultForItem(value: ActionValue, itemKey: string) {
  if (!value.defaultRaw || !value.parameter || !value.defaultRaw.startsWith("`") || !value.defaultRaw.endsWith("`")) return value.value;
  return value.defaultRaw.slice(1, -1).replaceAll(`\${${value.parameter}}`, itemKey);
}

/** A repeated hotspot needs a per-row destination, not the old global literal editor. The source
 * keeps its current runtime rule and stores only an exception for the selected item. */
function RepeatedClickBehavior({ action, dataRow }: { action: InteractionAction; dataRow: ListBinding }) {
  const update = useEditorStore((state) => state.updateActionValueForItem);
  const pages = useEditorStore((state) => state.pages);
  const value = pageValuesIn(action.handlers).find((candidate) => candidate.composed && candidate.parameter && candidate.defaultRaw && candidate.file && candidate.raw);
  const keyProperty = dataRow.item?.properties.find((property) => action.dataProperties.includes(property.name) && ["text", "number"].includes(property.kind))
    ?? dataRow.item?.properties.find((property) => property.name === "id" && ["text", "number"].includes(property.kind));
  const itemKey = keyProperty?.value;
  const [draft, setDraft] = useState("");
  const current = value && itemKey ? value.itemOverrides?.find((override) => override.key === itemKey)?.value ?? defaultForItem(value, itemKey) : "";
  useEffect(() => { setDraft(current); }, [current, itemKey, value?.start]);
  if (!value || !itemKey) return null;
  const suggestions = pages.map((page) => page.stateValue ?? page.route).filter(Boolean);
  const twoSteps = action.handlers.some((handler) => handler.lines.some((line) => /activePart|selectedPart/i.test(line)) && handler.lines.some((line) => /onOpen|navigate|page/i.test(line)));
  const doubleClick = action.trigger === "Al doppio click";
  return <div className="repeated-click-behavior">
    <div className="free-property-title"><MousePointerClick size={12} /> Navigazione di questa copia</div>
    {!doubleClick && twoSteps && <div className="click-step"><b>1</b><span><strong>Primo click</strong><small>Seleziona ed evidenzia questa parte.</small></span></div>}
    <div className="click-step"><b>{!doubleClick && twoSteps ? "2" : "1"}</b><span><strong>{doubleClick ? "Doppio click" : twoSteps ? "Secondo click" : "Al click"}</strong><small>Apre la pagina scelta qui sotto.</small></span></div>
    <label className="property-field"><span>Pagina da aprire</span><input value={draft} list="framecraft-page-values" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") { setDraft(current); event.currentTarget.blur(); }
    }} onBlur={() => { if (draft.trim() && draft.trim() !== current) void update(value, itemKey, draft); }} /></label>
    <datalist id="framecraft-page-values">{suggestions.map((page) => <option value={page} key={page} />)}</datalist>
    <p className="inspector-note">Vale solo per <code>{itemKey}</code>. Le altre {Math.max(0, dataRow.count - 1)} voci mantengono la loro pagina.</p>
  </div>;
}

function DataPageBehavior({ action, dataRow, property }: { action: InteractionAction; dataRow: ListBinding; property: ListItemProperty }) {
  const doubleClick = action.trigger === "Al doppio click";
  return <div className="repeated-click-behavior">
    <div className="free-property-title"><MousePointerClick size={12} /> Navigazione di questa voce</div>
    <div className="click-step"><b>1</b><span><strong>{doubleClick ? "Doppio click" : "Al click"}</strong><small>Apre la pagina indicata qui sotto.</small></span></div>
    <ListItemField property={property} label="Pagina da aprire" />
    <p className="inspector-note">È la destinazione della sola voce #{dataRow.index + 1}. Le altre {Math.max(0, dataRow.count - 1)} non cambiano.</p>
  </div>;
}

/** One editable value of an action: the page a button opens, the address a link points at, the
 * signal it writes. Changing it rewrites that literal in the source and nothing else. */
function ActionValueField({ value }: { value: ActionValue }) {
  const update = useEditorStore((state) => state.updateActionValue);
  const pages = useEditorStore((state) => state.pages);
  // A composed value is not typed over: the field starts empty and shows what is built today, so
  // writing in it means "manda tutti qui" and leaving it alone means "lascia com'è".
  const [draft, setDraft] = useState(value.composed ? "" : value.value);
  useEffect(() => { setDraft(value.composed ? "" : value.value); }, [value.composed, value.start, value.value]);
  const origin = value.file ? { file: value.file, raw: value.raw ?? "" } : undefined;
  const fieldLabel = value.kind === "page" ? "Pagina da aprire" : value.label;
  const apply = (next: string) => {
    if (value.composed ? !next.trim() : next === value.value) return;
    void update({ start: value.start, end: value.end }, value.kind, next.trim(), origin);
  };

  if (value.kind === "boolean") {
    return <label className="property-field"><span title={fieldLabel}>{fieldLabel}</span>
      <select value={draft} onChange={(event) => { setDraft(event.target.value); apply(event.target.value); }}>
        <option value="true">sì / apre</option>
        <option value="false">no / chiude</option>
      </select>
    </label>;
  }
  const suggestions = value.kind === "page" ? pages.map((page) => page.stateValue ?? page.route).filter(Boolean) : [];
  return <>
    <label className="property-field"><span title={fieldLabel}>{fieldLabel}</span>
      <input
        value={draft}
        type={value.kind === "number" ? "number" : "text"}
        placeholder={value.composed ? value.value : undefined}
        list={value.kind === "page" ? "framecraft-page-values" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setDraft(value.composed ? "" : value.value); event.currentTarget.blur(); }
        }}
        onBlur={() => apply(draft)}
      />
      {value.kind === "page" && <datalist id="framecraft-page-values">{suggestions.map((page) => <option value={page} key={page} />)}</datalist>}
    </label>
    {value.composed && <p className="inspector-note">Oggi è costruita al momento: <code>{value.value}</code>. Scrivi qui il nome di una pagina per mandarci tutti quelli che passano di qui.</p>}
  </>;
}

/** Where the behaviour is wired. An element that forwards a call cannot say what happens next, so
 * the panel reaches into the file that decides: which function is handed over, and the values that
 * function is written with. */
function HandlerEditor({ handler, nested = false, suppressPages = false }: { handler: HandlerBinding; nested?: boolean; suppressPages?: boolean }) {
  const update = useEditorStore((state) => state.updateHandler);
  const options = handler.name ? [handler.name, ...handler.options.filter((option) => option !== handler.name)] : [];
  return <div className="handler-editor">
    <span className="free-property-title">{handler.name
      ? `Cosa esegue, in ${shortFileName(handler.file)}`
      : `Poi ${handler.prop}, deciso in ${shortFileName(handler.file)}`}</span>
    {options.length > 1 && <label className="property-field"><span title={handler.prop}>funzione</span>
      <select value={handler.name} onChange={(event) => void update(handler, event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>}
    {options.length === 1 && <p className="inspector-note"><code>{handler.name}</code> è l'unica funzione di {shortFileName(handler.file)} che può prendere il suo posto.</p>}
    {/* The first level is already spelled out above the card; deeper ones are new information. */}
    {(nested || !handler.name) && handler.lines.length > 0 && <ul>{handler.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
    {handler.values.filter((value) => !suppressPages || value.kind !== "page").map((value) => <ActionValueField key={`${value.file}-${value.start}`} value={value} />)}
    {handler.values.some((value) => !suppressPages || value.kind !== "page") && handler.name && <p className="inspector-note">Questi valori stanno dentro <code>{handler.name}</code>: valgono per tutto ciò che la chiama in {shortFileName(handler.file)}.</p>}
    {handler.next.map((step) => <HandlerEditor key={`${step.file}-${step.prop}-${step.start}`} handler={step} nested suppressPages={suppressPages} />)}
  </div>;
}

/** One thing the element does, together with whatever of it can be changed from here: the literals
 * it passes, and the values of its own data row that the action reads. A hotspot that calls
 * `onPartToggle(part.id)` has no literal to offer, but `id` is right there in the data. */
function ActionCard({ action, copies, dataRow }: { action: InteractionAction; copies: number; dataRow?: ListBinding }) {
  const pageProperty = dataRow?.item?.properties.find((property) => ["page", "pageId", "route", "screen", "screenId", "id"].includes(property.name) && ["text", "number"].includes(property.kind));
  const perItemPage = Boolean(dataRow && (action.trigger === "Al click" || action.trigger === "Al doppio click")
    && pageValuesIn(action.handlers).some((value) => value.composed && value.parameter));
  const dataPage = Boolean(dataRow && pageProperty && !perItemPage
    && (action.trigger === "Al click" || action.trigger === "Al doppio click") && handlersNavigate(action.handlers));
  const fields = dataRow?.item?.properties.filter((property) => action.dataProperties.includes(property.name)
    && (!dataPage || property.name !== pageProperty?.name)) ?? [];
  return <div className="action-card">
    <span className="action-trigger">{action.trigger}</span>
    {dataRow && (perItemPage || dataPage) ? <>
      {perItemPage ? <RepeatedClickBehavior action={action} dataRow={dataRow} />
        : pageProperty ? <DataPageBehavior action={action} dataRow={dataRow} property={pageProperty} /> : null}
      <details className="action-technical-details"><summary>Dettagli tecnici</summary>
        <strong>{action.summary}</strong>
        {action.details.length > 0 && <ul>{action.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
        {action.handlers.map((handler) => <HandlerEditor key={`${handler.file}-${handler.prop}-${handler.start}`} handler={handler} suppressPages />)}
      </details>
    </> : <>
      <strong>{action.summary}</strong>
      {action.values.map((value) => <ActionValueField key={`${value.start}-${value.label}`} value={value} />)}
      {action.values.length > 0 && copies > 1 && <p className="inspector-note">Questo valore è scritto una volta sola nel codice: cambiarlo vale per tutte le {copies} copie.</p>}
      {fields.map((property) => <ListItemField key={property.name} property={property} hint={usageHint(dataRow?.usages?.[property.name])} />)}
      {!action.values.length && !fields.length && !action.handlers.length && <p className="inspector-note">Questa azione non passa valori fissi: il comportamento sta nel codice{dataRow ? ", e i valori di questa copia si modificano in Aspetto → Testo e dati" : ""}.</p>}
      {(action.details.length > 0 || action.handlers.length > 0) && <details className="action-technical-details"><summary>Dettagli tecnici</summary>
        {action.details.length > 0 && <ul>{action.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
        {action.handlers.map((handler) => <HandlerEditor key={`${handler.file}-${handler.prop}-${handler.start}`} handler={handler} />)}
      </details>}
    </>}
  </div>;
}

function UserAccessField({ label, attribute, value, type = "text", placeholder, hint }: { label: string; attribute: string; value: string; type?: "text" | "password"; placeholder?: string; hint?: string }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <label className="user-access-field"><span>{label}</span><input type={type} value={draft} placeholder={placeholder} autoComplete="off"
    onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); }
    }} onBlur={() => draft !== value && void update(attribute, draft)} />{hint && <small>{hint}</small>}</label>;
}

/** Ready-made behaviours belong beside the actions already present on an element. The accounts are a
 * project-wide matter with a window of its own, so what is left here is the one thing that belongs
 * to this element: that it opens the access page, and the wording it shows when nobody is in. */
function UserAccessEditor({ node }: { node: EditorNode }) {
  const configure = useEditorStore((state) => state.configureUserAccess);
  const remove = useEditorStore((state) => state.removeUserAccess);
  const open = useEditorStore((state) => state.openUserAccess);
  const config = useEditorStore((state) => state.userAccessConfig);
  const configured = node.props["data-fc-user-access"] !== undefined;
  const supported = configured || ["button", "a", "div", "section", "span", "header"].includes(node.type);
  if (!supported) return null;
  if (!configured) return <div className="interaction-card user-access-card ready-action-card">
    <div className="interaction-card-title"><span><LogIn size={14} /></span><div><strong>Accesso utente</strong><small>Login, account e permessi pronti, senza codice</small></div></div>
    <p>Trasforma questo elemento nel comando che apre la pagina di accesso del pannello.</p>
    <button type="button" className="interaction-action primary" onClick={() => void configure()}><ShieldCheck size={14} /> Aggiungi accesso utente</button>
  </div>;
  return <div className="interaction-card user-access-card configured">
    <div className="interaction-card-title"><span><ShieldCheck size={14} /></span><div><strong>Apre la pagina di accesso</strong><small>{config ? `${config.accounts.length} account · ${config.permissions.length} permessi` : "Login, utente attivo e logout"}</small></div></div>
    <UserAccessField label="Testo da disconnesso" attribute="data-fc-user-logged-out" value={String(node.props["data-fc-user-logged-out"] ?? "Nessun utente")} />
    <label className="user-access-field"><span>Quando apre l’accesso</span><select value={String(node.props["data-fc-user-event"] ?? "Tapped")} onChange={(event) => void useEditorStore.getState().updateAttribute("data-fc-user-event", event.target.value)}>
      {["Tapped", "DoubleTapped", "ContextTapped", "Down", "Up"].map((event) => <option key={event} value={event}>{hmiEventLabels[event as HmiEventType]}</option>)}
    </select></label>
    <button type="button" className="interaction-action primary" onClick={() => void open()}><Users size={14} /> Gestisci account e permessi…</button>
    <button type="button" className="interaction-remove user-access-remove" onClick={() => void remove()}><Trash2 size={13} /> Rimuovi accesso utente</button>
  </div>;
}

/** Any element can be reserved to a permission, not only the one that opens the login: this is where
 * a command is handed to the maintainer and taken away from the operator. */
function PermissionGateEditor({ node, reacts }: { node: EditorNode; reacts: boolean }) {
  const config = useEditorStore((state) => state.userAccessConfig);
  const refresh = useEditorStore((state) => state.refreshUserAccess);
  const open = useEditorStore((state) => state.openUserAccess);
  const update = useEditorStore((state) => state.updateAttribute);
  const removeAttribute = useEditorStore((state) => state.removeAttribute);
  const required = String(node.props["data-fc-user-requires"] ?? "");
  const visibility = String(node.props["data-fc-user-visible-requires"] ?? "");
  useEffect(() => { if (!config) void refresh(); }, [config, refresh]);
  // Without the ready access installed there is nothing to require, and offering it would only
  // produce an attribute no runtime reads.
  const permissions = config?.permissions ?? [];
  const rule = (attribute: string, label: string, value: string) => {
    const unknown = value && !permissions.some((permission) => permission.id === value);
    return <label className="user-access-field"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => void (event.target.value ? update(attribute, event.target.value) : removeAttribute(attribute))}>
      <option value="">Tutti · anche senza accesso</option>
      {unknown && <option value={value}>Permesso non disponibile: {value}</option>}
      {permissions.map((permission) => <option key={permission.id} value={permission.id}>{permission.label}</option>)}
    </select>{unknown && <small>Il permesso non esiste: questa regola nega l’accesso a tutti finché non la correggi.</small>}</label>;
  };
  return <div className="interaction-card permission-gate-card">
    <div className="interaction-card-title"><span><KeyRound size={14} /></span><div><strong>Chi vede e usa l’elemento</strong><small>Regole separate per l’utente attivo</small></div></div>
    {rule("data-fc-user-visible-requires", "Visibile a chi ha il permesso", visibility)}
    {(reacts || required) && rule("data-fc-user-requires", "Utilizzabile da chi ha il permesso", required)}
    {!permissions.length && <p className="inspector-note">Apri account e permessi, aggiungi i permessi e assegnali agli utenti; poi torna qui a sceglierli.</p>}
    <p className="inspector-note">In Modifica l’elemento resta visibile e selezionabile. Queste regole gestiscono il pannello, non sostituiscono autorizzazioni e sicurezza sul server PLC.</p>
    <button type="button" className="interaction-action" onClick={() => void open()}><Users size={14} /> Apri account e permessi</button>
  </div>;
}

/** What happens when this element is used: where it leads, what it opens, what it highlights. The
 * canvas can show what an element looks like but never what it does, and on an HMI panel that is
 * most of what there is to know about a button. */
function ActionSection({ node, expandSignal }: { node: EditorNode; expandSignal?: number }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const [busy, setBusy] = useState(false);
  const source = useEditorStore((state) => state.document?.source);
  const callSites = useEditorStore((state) => state.callSites);
  const copies = useEditorStore((state) => state.selectionInfo?.instanceCount ?? 1);
  const [report, setReport] = useState<InteractionReport>();
  useEffect(() => {
    let alive = true;
    setReport(undefined);
    if (!source) return;
    // Babel only loads when a selection actually asks for this, so opening a project stays light.
    void import("../core/interactions").then((module) => {
      if (alive) setReport(module.describeInteractions(source, node.source.start, node.source.end, callSites ?? [], node.source.file));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [callSites, node.source.end, node.source.file, node.source.start, source]);

  const binding = useEditorStore((state) => state.listBinding);
  const selectedId = useEditorStore((state) => state.selectedId);
  const dataRow = binding && binding.nodeId === selectedId && binding.item ? binding : undefined;
  const highlighted = typeof node.props["data-fc-highlight-target"] === "string";
  const visibleActions = report?.actions.filter((action) => action.trigger !== "Alla pressione di un tasto"
    || !report.actions.some((candidate) => candidate.trigger === "Al click" && candidate.summary === action.summary)) ?? [];
  const configured = highlighted || node.props["data-fc-user-access"] !== undefined || parseHmiEvents(node.props[hmiEventsAttribute]).length > 0 || visibleActions.length > 0;
  const reacts = String(node.props["data-fc-reacts"]) === "false" ? false : String(node.props["data-fc-reacts"]) === "true" || configured;
  return <InspectorSection title="Cosa fa" icon={<Zap size={12} />} initiallyOpen expandSignal={expandSignal}>
    <button type="button" role="switch" aria-checked={reacts} className={`element-reactions-switch ${reacts ? "enabled" : ""}`} disabled={busy} onClick={async () => { setBusy(true); try { await update("data-fc-reacts", reacts ? "false" : "true"); } finally { setBusy(false); } }}>
      <Zap size={15} /><span><strong>{reacts ? "Reazioni abilitate" : "Abilita reazioni"}</strong><small>{reacts ? "Scegli gli eventi e le azioni qui sotto" : "L’elemento può diventare interattivo"}</small></span><span className="element-reactions-indicator" aria-hidden="true" />
    </button>
    {!reacts && <p className="inspector-note">Non esegue azioni. Abilita le reazioni per configurarle; quelle già presenti sono conservate.</p>}
    {reacts && <>
    {!report ? <p className="inspector-note">Lettura del codice…</p>
      : <>
          {report.owner && <p className="inspector-note">L’azione è del contenitore &lt;{report.owner.type}&gt; alla riga {report.owner.line}. Modificandola qui cambia quel contenitore.</p>}
          {dataRow && <p className="inspector-note">Agisce sulla voce {dataRow.index + 1} di <code>{dataRow.name}</code>: i suoi valori si modificano in Aspetto → Testo e dati.</p>}
          {visibleActions.map((action, position) => <ActionCard key={`${action.trigger}-${position}`} action={action} copies={copies} dataRow={dataRow} />)}
        </>}
    <HmiEventSection node={node} />
    <UserAccessEditor node={node} />
    {/* The highlight is the one behaviour the editor itself creates, so it is set up in the very
        place that answers "what does this do" instead of in a panel of its own. */}
    {(highlighted || node.type === "button") && <HighlightInteractionEditor node={node} copies={copies} />}
    </>}
    <PermissionGateEditor node={node} reacts={reacts} />
  </InspectorSection>;
}

/** An element the app itself makes click-through can be pointed at, but moving it from the canvas
 * would change a drawing the app never meant to be dragged. */
function LockedElementNote() {
  const locked = useEditorStore((state) => state.selectionInfo?.locked);
  if (!locked) return null;
  return <div className="code-component"><Lock size={13} /><span>Questo elemento non riceve il mouse (pointer-events: none): il canvas non lo trascina. Testo, colori e posizione si modificano dai campi qui sotto.</span></div>;
}

/** A single JSX element draws every row of a list, so an edit on one of them reaches all the others
 * unless the editor is told which copy was clicked. This is where that choice is made visible. */
function RepeatScope() {
  const info = useEditorStore((state) => state.selectionInfo);
  const scope = useEditorStore((state) => state.editScope);
  const setScope = useEditorStore((state) => state.setEditScope);
  const listBinding = useEditorStore((state) => state.listBinding);
  const selectedId = useEditorStore((state) => state.selectedId);
  const count = info?.instanceCount ?? 1;
  const index = info?.listIndex ?? info?.instanceIndex;
  if (count <= 1) return null;
  const isolated = scope === "instance" && index != null;
  const hasDataRow = listBinding?.nodeId === selectedId && Boolean(listBinding?.item);
  return <div className="repeat-scope">
    <div className="repeat-scope-title"><Copy size={13} /><strong>Elemento ripetuto ×{count}</strong></div>
    <p>{index == null
      ? "L’anteprima non sa quale copia è selezionata, quindi le modifiche valgono per tutte."
      : isolated
        ? `Aspetto e Canc valgono solo per la copia #${index + 1}.`
        : `Aspetto e Canc valgono per tutte le ${count} copie.`}</p>
    {hasDataRow && <p>Il campo Testo e gli altri dati della lista cambiano sempre solo nella voce selezionata.</p>}
    {index != null && <div className="repeat-scope-switch" role="group" aria-label="Ambito delle modifiche">
      <button type="button" className={isolated ? "active" : ""} aria-pressed={isolated} onClick={() => setScope("instance")}>Solo questa</button>
      <button type="button" className={isolated ? "" : "active"} aria-pressed={!isolated} onClick={() => setScope("all")}>Tutte ({count})</button>
    </div>}
  </div>;
}

/** A template kept outside the project is shared with every other panel that imports it. */
function SharedFileNote({ file }: { file: string }) {
  const project = useEditorStore((state) => state.project);
  const contractOf = useEditorStore((state) => state.templateContractOf);
  const unlockFile = useEditorStore((state) => state.unlockFile);
  const unlocked = useEditorStore((state) => state.unlockedFiles.includes(file));
  const [contract, setContract] = useState<TemplateContract | undefined>();
  const shared = !insideProject(project?.root, file);
  useEffect(() => {
    if (!shared) { setContract(undefined); return; }
    let alive = true;
    void contractOf(file).then((found) => { if (alive) setContract(found); });
    return () => { alive = false; };
  }, [contractOf, file, shared]);

  // Il template dice quali suoi file un pannello può cambiare. Dirlo qui, davanti all'elemento che si
  // sta per modificare, è l'unico momento in cui serve saperlo — e il modo per farlo comunque sta
  // nella stessa scheda, non in un messaggio che scompare.
  if (shared && contract && !isEditableFile(contract, file)) return <div className="code-component template-owned">
    <Lock size={13} />
    <span>Questo elemento è disegnato dal template condiviso <strong>{contract.name}</strong>: cambiarlo qui lo cambierebbe su tutte le macchine. Da un pannello si cambiano i suoi dati e il suo stile ({editableSummary(contract)}).
      <small title={file}>{file}</small>
      {unlocked
        ? <em>Sbloccato per questa sessione.</em>
        : <button className="guided-unlock" onClick={() => unlockFile(file)}>Modifica comunque questo file</button>}
    </span>
  </div>;

  if (!shared) return null;
  return <div className="code-component shared-source"><Cable size={13} /><span>Questo file è fuori dal progetto ed è condiviso: la modifica vale per tutti i pannelli che lo usano.<small title={file}>{file}</small></span></div>;
}

function GroupInspector({ items }: { items: SelectionItem[] }) {
  const clear = useEditorStore((state) => state.setMultiSelection);
  const left = Math.min(...items.map((item) => item.rect.x));
  const top = Math.min(...items.map((item) => item.rect.y));
  const right = Math.max(...items.map((item) => item.rect.x + item.rect.width));
  const bottom = Math.max(...items.map((item) => item.rect.y + item.rect.height));
  const commonStyle = (property: string) => {
    const values = items.map((item) => item.styles?.[property]);
    const first = values[0];
    return first !== undefined && values.every((value) => value === first) ? first : undefined;
  };
  return <aside className="inspector has-selection group-inspector">
    <div className="panel-title"><span>MODIFICA GRUPPO</span><button type="button" onClick={() => clear([])} title="Torna alla selezione singola" aria-label="Chiudi selezione multipla"><X size={13} /></button></div>
    <div className="selection-summary group-selection-summary"><span className="node-icon"><Boxes size={14} /></span><span><strong>{items.length} elementi selezionati</strong><small>{rounded(right - left)} × {rounded(bottom - top)} px · gruppo</small></span></div>
    <div className="group-selection-note"><Move size={14} /><span>Trascina uno degli elementi per spostare tutto il gruppo. Le proprietà qui sotto vengono applicate a tutti.</span></div>

    <InspectorSection title="Dimensioni" icon={<Ruler size={12} />} initiallyOpen>
      <div className="property-pair"><NumberStyleField group label="Larghezza" property="width" value={commonStyle("width")} /><NumberStyleField group label="Altezza" property="height" value={commonStyle("height")} /></div>
      <p className="inspector-note">Se i valori sono diversi, il campo resta vuoto. Inserirne uno rende gli elementi della stessa misura.</p>
    </InspectorSection>
    <InspectorSection title="Livelli e rotazione" icon={<SlidersHorizontal size={12} />} initiallyOpen>
      <ElementTransformControls group zIndex={commonStyle("zIndex")} rotate={commonStyle("rotate")} />
    </InspectorSection>
    <InspectorSection title="Aspetto" icon={<Palette size={12} />} initiallyOpen>
      <ColorStyleField group label="Sfondo" property="backgroundColor" value={commonStyle("backgroundColor")} />
      <ColorStyleField group label="Testo" property="color" value={commonStyle("color")} />
      <BorderField group label="Bordo" property="border" value={commonStyle("border")} />
      <NumberStyleField group label="Angoli" property="borderRadius" value={commonStyle("borderRadius")} />
      <NumberStyleField group label="Opacità" property="opacity" value={commonStyle("opacity")} unit="" />
    </InspectorSection>
    <InspectorSection title="Testo e font" icon={<TypeIcon size={12} />} initiallyOpen>
      <StyleField group label="Font" property="fontFamily" value={commonStyle("fontFamily")} placeholder="valori diversi" />
      <NumberStyleField group label="Dimensione" property="fontSize" value={commonStyle("fontSize")} />
      <StyleSelect group label="Peso" property="fontWeight" value={commonStyle("fontWeight")} options={["300", "400", "500", "600", "700", "800", "900"]} />
      <StyleSelect group label="Allineamento" property="textAlign" value={commonStyle("textAlign")} options={["left", "center", "right", "justify"]} />
      <StyleField group label="Interlinea" property="lineHeight" value={commonStyle("lineHeight")} /><StyleField group label="Spaziatura" property="letterSpacing" value={commonStyle("letterSpacing")} />
    </InspectorSection>
    <InspectorSection title="Avanzate" icon={<SlidersHorizontal size={12} />}>
      <StyleField group label="Ombra" property="boxShadow" value={commonStyle("boxShadow")} />
      <StyleField group label="Outline" property="outline" value={commonStyle("outline")} />
      <StyleField group label="Rotazione CSS" property="rotate" value={commonStyle("rotate")} />
      <StyleField group label="Scala" property="scale" value={commonStyle("scale")} />
    </InspectorSection>
  </aside>;
}

/** Perché su questa pagina i campi non ci sono. Detto qui, dove l'utente sta cercando di cambiare
 * qualcosa, e non in una nota generale che nessuno legge. */
function GuidedPageNote() {
  const page = useEditorStore((state) => state.guidedPage());
  const unlock = useEditorStore((state) => state.unlockPage);
  const setPanel = useEditorStore((state) => state.setLeftPanel);
  if (!page) return null;
  return <div className="guided-note">
    <div className="guided-note-title"><Lock size={13} /> <strong>Pagina guidata dal template</strong></div>
    <p>Qui si cambia {page.affordances.map((affordance) => affordance.label.toLowerCase()).join(", ")}. Il resto lo tiene il template, così tutte le macchine restano uguali.</p>
    <button className="interaction-action primary" onClick={() => setPanel("page")}><SquareMousePointer size={14} /> Apri «Questa pagina»</button>
    <button className="guided-unlock" onClick={unlock}>Sblocca comunque questa pagina</button>
  </div>;
}

/** A static JSX label becomes a WinCC-style multilingual object text by carrying one stable key.
 * The original JSX text remains the engineering fallback and is restored when a key is missing. */
function MultilingualTextBinding({ node }: { node: EditorNode }) {
  const catalog = useEditorStore((state) => state.resourceCatalog);
  const update = useEditorStore((state) => state.updateAttribute);
  const removeAttribute = useEditorStore((state) => state.removeAttribute);
  const setPanel = useEditorStore((state) => state.setLeftPanel);
  const key = typeof node.props["data-hmi-text"] === "string" ? String(node.props["data-hmi-text"]) : "";
  if (!node.capabilities.text && !key) return null;
  const unknown = Boolean(key) && !catalog.multilingualTexts.some((item) => item.key === key);
  return <details className="multilingual-options" open={Boolean(key)}>
    <summary><Languages size={13} /><span>Testo multilingua{key ? ` · ${key}` : ""}</span><ChevronDown size={13} /></summary>
    <div className="multilingual-text-binding">
    <select value={unknown ? "" : key} onChange={(event) => {
      const value = event.target.value;
      void (value ? update("data-hmi-text", value) : removeAttribute("data-hmi-text"));
    }}>
      <option value="">Testo fisso del sorgente</option>
      {catalog.multilingualTexts.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
    </select>
    {unknown && <small>La chiave «{key}» non esiste più: in Runtime resta il testo del sorgente.</small>}
    <button type="button" className="link-button" onClick={() => setPanel("resources")}>{catalog.multilingualTexts.length ? `Modifica traduzioni · anteprima ${catalog.activeLanguage}` : "Crea il primo testo in Risorse"}</button>
    </div>
  </details>;
}

export function Inspector() {
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  const selectionRect = useEditorStore((state) => state.selectionRect);
  const selectionStyles = useEditorStore((state) => state.selectionStyles);
  const selectionInfo = useEditorStore((state) => state.selectionInfo);
  const updateText = useEditorStore((state) => state.updateText);
  const remove = useEditorStore((state) => state.deleteSelection);
  const setMode = useEditorStore((state) => state.setViewMode);
  const expandSignal = useEditorStore((state) => state.propertiesExpandedAt);
  const expandProperties = useEditorStore((state) => state.expandProperties);
  const unresolvedSelection = useEditorStore((state) => state.unresolvedSelection);
  const multiSelection = useEditorStore((state) => state.multiSelection);
  const dirty = useEditorStore((state) => state.dirty);
  const listBinding = useEditorStore((state) => state.listBinding);
  const node = selectedId ? document?.nodes[selectedId] : undefined;
  const inspectorRef = useRef<HTMLElement>(null);
  const textFocusRequestedAt = useEditorStore((state) => state.textFocusRequestedAt);
  const textFocusHandled = useRef<{ at: number; selection: string; field: HTMLInputElement | HTMLTextAreaElement; list: boolean } | undefined>(undefined);
  const [tab, setTab] = useState<PropertyTab>("appearance");
  const selectionKey = `${node?.source.file}:${node?.source.start}:${node?.type}:${selectionInfo?.listIndex}:${selectionInfo?.instanceIndex}`;
  // The AST id includes the end offset: editing a property changes it, not the selected object.
  useEffect(() => { setTab("appearance"); inspectorRef.current?.scrollTo({ top: 0, behavior: "instant" }); },
    [node?.source.file, node?.source.start, node?.type, selectionInfo?.listIndex, selectionInfo?.instanceIndex]);
  const focusText = (field: HTMLInputElement | HTMLTextAreaElement | null, list = false) => {
    if (!field || tab !== "appearance" || !textFocusRequestedAt) return;
    const previous = textFocusHandled.current;
    if (previous?.at === textFocusRequestedAt && (previous.selection !== selectionKey || previous.list || !list || previous.field.isConnected || field.ownerDocument.activeElement !== field.ownerDocument.body)) return;
    textFocusHandled.current = { at: textFocusRequestedAt, selection: selectionKey, field, list };
    field.focus(); field.select(); field.scrollIntoView({ block: "center" });
  };
  useEffect(() => {
    if (textFocusRequestedAt) setTab("appearance");
  }, [textFocusRequestedAt]);
  const chooseTab = (next: PropertyTab) => { setTab(next); inspectorRef.current?.scrollTo({ top: 0, behavior: "instant" }); };

  if (multiSelection.length > 1) return <GroupInspector items={multiSelection} />;
  if (!node && unresolvedSelection) {
    return <aside ref={inspectorRef} className="inspector has-selection">
      <div className="panel-title"><span>MODIFICA ELEMENTO</span><button onClick={expandProperties} title="Mostra tutte le proprietà" aria-label="Mostra tutte le proprietà"><ChevronsUpDown size={13} /></button></div>
      <GuidedPageNote />
      <ExternalElementSheet file={unresolvedSelection.file} tag={unresolvedSelection.tag} reason={unresolvedSelection.reason} detail={unresolvedSelection.detail} expandSignal={expandSignal} />
    </aside>;
  }
  if (!node) return <aside ref={inspectorRef} className="inspector empty-inspector"><div className="panel-title"><span>MODIFICA ELEMENTO</span></div><GuidedPageNote /><div><Info size={20} /><strong>Clicca ciò che vuoi cambiare</strong><p>Testo, dimensioni, colori, azioni e variabile PLC compariranno qui automaticamente.</p></div></aside>;
  const locked = !node.capabilities.style;
  const listText = listBinding?.nodeId === node.id ? listBinding.item?.properties.find((property) => property.name === listBinding.textProperty) : undefined;
  const displayedText = listText?.value ?? node.text ?? selectionInfo?.text;
  const style = (property: string) => node.styles[property] ?? selectionStyles[property];
  return <aside ref={inspectorRef} className="inspector has-selection">
    <div className="inspector-navigation">
      <div className="panel-title"><span>MODIFICA ELEMENTO</span></div>
      <div className="selection-summary"><span className="node-icon"><SquareMousePointer size={18} /></span><span><strong>{elementName(node.type)}</strong><small>{displayedText?.trim().slice(0, 48) || (selectionRect ? `${rounded(selectionRect.width)} × ${rounded(selectionRect.height)} px` : "Elemento selezionato")}</small></span></div>
      <div className="inspector-tabs" role="tablist" aria-label="Proprietà dell’elemento">
        {propertyTabs.map(({ id, label }, index) => <button key={id} id={`element-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`element-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => chooseTab(id)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % propertyTabs.length : event.key === "ArrowLeft" ? (index + propertyTabs.length - 1) % propertyTabs.length : event.key === "Home" ? 0 : event.key === "End" ? propertyTabs.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); chooseTab(propertyTabs[next].id);
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#element-tab-${propertyTabs[next].id}`)?.focus();
        }}>{label}</button>)}
      </div>
      <p className="inspector-tab-description">{propertyTabs.find((item) => item.id === tab)?.description}</p>
    </div>
    <GuidedPageNote />
    <RepeatScope />
    <LockedElementNote />
    <SharedFileNote file={node.source.file} />
    <div key={`${selectionKey}:appearance`} id="element-panel-appearance" role="tabpanel" aria-labelledby="element-tab-appearance" hidden={tab !== "appearance"}>
    {node.dynamic && !listText && <div className="code-component"><Lock size={13} /><span>{listBinding?.nodeId === node.id ? "La scritta arriva dai dati della voce: modificala qui sotto, senza cambiare il codice." : "Il contenuto arriva da una variabile. Puoi sostituirlo con un valore fisso oppure continuare a modificare geometria e stile."}</span></div>}
    {node.type === "img" && <ImageSourceSection node={node} expandSignal={expandSignal} />}
    <ListItemSection expandSignal={expandSignal} focusText={(field) => focusText(field, true)} textFocusRequestedAt={tab === "appearance" ? textFocusRequestedAt : undefined} />
    {listText ? <div className="list-text-translations"><MultilingualTextBinding node={node} /></div> : <InspectorSection title="Contenuto" icon={<TypeIcon size={12} />} initiallyOpen expandSignal={Math.max(expandSignal ?? 0, textFocusRequestedAt ?? 0)}>
      {node.capabilities.text
        // The field starts from what the preview shows when the source holds an expression, so the
        // comparison starts from there too: leaving the field untouched must never write anything.
        ? <EditableTextField value={node.text ?? selectionInfo?.text ?? ""} ariaLabel="Testo dell'elemento" fieldRef={focusText} onCommit={updateText} />
        // Saying where the text actually lives beats an empty panel: the writing belongs to a child.
        : <p className="inspector-note">{node.children.length
          ? "Il testo di questo elemento sta dentro gli elementi figli: clicca direttamente la scritta da cambiare."
          : "Questo elemento non contiene testo."}</p>}
      <MultilingualTextBinding node={node} />
    </InspectorSection>}

    <p className="inspector-edit-hint">Misure: Invio o uscita dal campo. Colori e scelte cambiano subito. Ctrl+Z annulla.</p>
    <InspectorSection title="Posizione e dimensioni" icon={<Move size={12} />} initiallyOpen expandSignal={expandSignal}>
      <div className="property-pair coordinate-pair"><CoordinateField label="X" axis="x" value={selectionRect?.x} translate={style("translate")} disabled={locked} /><CoordinateField label="Y" axis="y" value={selectionRect?.y} translate={style("translate")} disabled={locked} /></div>
      <div className="property-pair"><NumberStyleField label="Larghezza" property="width" value={style("width")} fallback={selectionRect?.width} disabled={locked} /><NumberStyleField label="Altezza" property="height" value={style("height")} fallback={selectionRect?.height} disabled={locked} /></div>
    </InspectorSection>
    <InspectorSection title="Aspetto" icon={<Palette size={12} />} initiallyOpen expandSignal={expandSignal}>
      <ColorStyleField label="Sfondo" property="backgroundColor" value={style("backgroundColor")} disabled={locked} />
      <ColorStyleField label="Colore testo" property="color" value={style("color")} disabled={locked} />
      <NumberStyleField label="Dimensione testo" property="fontSize" value={style("fontSize")} disabled={locked} />
      <StyleSelect label="Peso testo" property="fontWeight" value={style("fontWeight")} options={["300", "400", "500", "600", "700", "800", "900"]} disabled={locked} />
      <StyleSelect label="Allineamento" property="textAlign" value={style("textAlign")} options={["left", "center", "right", "justify"]} disabled={locked} />
      <BorderField label="Bordo" property="border" value={style("border")} disabled={locked} />
      <NumberStyleField label="Angoli" property="borderRadius" value={style("borderRadius")} disabled={locked} />
      <NumberStyleField label="Opacità" property="opacity" value={style("opacity")} unit="" disabled={locked} />
    </InspectorSection>

    <InspectorSection title="Livelli e rotazione" icon={<SlidersHorizontal size={12} />} initiallyOpen expandSignal={expandSignal}>
      <ElementTransformControls key={node.id} zIndex={style("zIndex")} rotate={style("rotate")} disabled={locked} />
    </InspectorSection>
    </div>

    <div key={`${selectionKey}:actions`} id="element-panel-actions" role="tabpanel" aria-labelledby="element-tab-actions" hidden={tab !== "actions"}>
      <ActionSection node={node} expandSignal={expandSignal} />
    </div>
    <div key={`${selectionKey}:data`} id="element-panel-data" role="tabpanel" aria-labelledby="element-tab-data" hidden={tab !== "data"}>
      <PlcSection node={node} expandSignal={expandSignal} />
      {listBinding?.nodeId === node.id && listBinding.item && <InspectorSection title="Dati della lista" icon={<Database size={12} />} expandSignal={expandSignal}>
        <PlcListFill binding={listBinding} />
      </InspectorSection>}
      <HmiDynamizationSection node={node} expandSignal={expandSignal} />
      <HmiFaceplateSection node={node} expandSignal={expandSignal} />
      <HmiTrendSection node={node} expandSignal={expandSignal} />
      <HmiFunctionTrendSection node={node} expandSignal={expandSignal} />
    </div>
    <div key={`${selectionKey}:details`} id="element-panel-details" role="tabpanel" aria-labelledby="element-tab-details" hidden={tab !== "details"}>
    <div className="inspector-detail-actions">
      <button type="button" onClick={expandProperties}><ChevronsUpDown size={15} /> Espandi tutte le sezioni</button>
      <button type="button" onClick={() => setMode("code")} aria-label="Apri il codice dell'elemento"><Code2 size={15} /> Apri il codice</button>
    </div>
    <AttributesSection node={node} expandSignal={expandSignal} />

    <InspectorSection title="Posizione CSS" icon={<Move size={12} />} expandSignal={expandSignal}>
      <StyleSelect label="Posizione" property="position" value={style("position")} options={["static", "relative", "absolute", "fixed", "sticky"]} disabled={locked} />
      <div className="property-pair"><StyleField label="Left" property="left" value={style("left")} disabled={locked} /><StyleField label="Top" property="top" value={style("top")} disabled={locked} /></div>
      <div className="property-pair"><StyleField label="Right" property="right" value={style("right")} disabled={locked} /><StyleField label="Bottom" property="bottom" value={style("bottom")} disabled={locked} /></div>
      <StyleField label="Spostamento" property="translate" value={style("translate")} disabled={locked} />
      <div className="property-pair"><StyleField label="Rotazione CSS" property="rotate" value={style("rotate")} disabled={locked} /><StyleField label="Scala" property="scale" value={style("scale")} disabled={locked} /></div>
    </InspectorSection>

    <InspectorSection title="Vincoli dimensionali" icon={<Ruler size={12} />} expandSignal={expandSignal}>
      <div className="property-pair"><StyleField label="Min W" property="minWidth" value={style("minWidth")} disabled={locked} /><StyleField label="Min H" property="minHeight" value={style("minHeight")} disabled={locked} /></div>
      <div className="property-pair"><StyleField label="Max W" property="maxWidth" value={style("maxWidth")} disabled={locked} /><StyleField label="Max H" property="maxHeight" value={style("maxHeight")} disabled={locked} /></div>
      <StyleField label="Proporzioni" property="aspectRatio" value={style("aspectRatio")} disabled={locked} placeholder="auto / 16 / 9" />
    </InspectorSection>

    <InspectorSection title="Effetti e sfondo" icon={<Palette size={12} />} expandSignal={expandSignal}>
      <StyleField label="Immagine bg" property="backgroundImage" value={style("backgroundImage")} disabled={locked} />
      <StyleField label="Ombra" property="boxShadow" value={style("boxShadow")} disabled={locked} />
      <StyleField label="Outline" property="outline" value={style("outline")} disabled={locked} />
    </InspectorSection>

    <InspectorSection title="Layout" icon={<LayoutGrid size={12} />} expandSignal={expandSignal}>
      <StyleSelect label="Display" property="display" value={style("display")} options={["block", "inline", "inline-block", "flex", "grid", "none"]} disabled={locked} />
      <StyleSelect label="Direzione" property="flexDirection" value={style("flexDirection")} options={["row", "column", "row-reverse", "column-reverse"]} disabled={locked} />
      <StyleSelect label="A capo" property="flexWrap" value={style("flexWrap")} options={["nowrap", "wrap", "wrap-reverse"]} disabled={locked} />
      <StyleSelect label="Allinea" property="alignItems" value={style("alignItems")} options={["stretch", "flex-start", "center", "flex-end", "baseline"]} disabled={locked} />
      <StyleSelect label="Distribuisci" property="justifyContent" value={style("justifyContent")} options={["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"]} disabled={locked} />
      <StyleField label="Gap" property="gap" value={style("gap")} disabled={locked} />
      <StyleSelect label="Overflow" property="overflow" value={style("overflow")} options={["visible", "hidden", "auto", "scroll", "clip"]} disabled={locked} />
      <StyleField label="Margine" property="margin" value={style("margin")} disabled={locked} />
      <StyleField label="Padding" property="padding" value={style("padding")} disabled={locked} />
    </InspectorSection>

    <InspectorSection title="Testo e font" icon={<TypeIcon size={12} />} expandSignal={expandSignal}>
      <StyleField label="Font" property="fontFamily" value={style("fontFamily")} disabled={locked} />
      <StyleField label="Interlinea" property="lineHeight" value={style("lineHeight")} disabled={locked} />
      <StyleField label="Spaziatura" property="letterSpacing" value={style("letterSpacing")} disabled={locked} />
      <StyleSelect label="Maiuscole" property="textTransform" value={style("textTransform")} options={["none", "uppercase", "lowercase", "capitalize"]} disabled={locked} />
      <StyleSelect label="Decorazione" property="textDecoration" value={style("textDecoration")} options={["none", "underline", "line-through", "overline"]} disabled={locked} />
      <StyleSelect label="A capo" property="whiteSpace" value={style("whiteSpace")} options={["normal", "nowrap", "pre", "pre-wrap", "break-spaces"]} disabled={locked} />
    </InspectorSection>

    <InspectorSection title="Avanzate" icon={<SlidersHorizontal size={12} />} expandSignal={expandSignal}>
      <StyleSelect label="Visibilità" property="visibility" value={style("visibility")} options={["visible", "hidden", "collapse"]} disabled={locked} />
      <StyleSelect label="Click" property="pointerEvents" value={style("pointerEvents")} options={["auto", "none"]} disabled={locked} />
      <StyleField label="Cursore" property="cursor" value={style("cursor")} disabled={locked} />
      {(node.type === "img" || node.type === "video") && <StyleSelect label="Adattamento" property="objectFit" value={style("objectFit")} options={["fill", "contain", "cover", "none", "scale-down"]} disabled={locked} />}
      <FreeStyleEditor disabled={locked} />
      <div className="property-source"><Box size={12} /><span>Riga {node.source.line}:{node.source.column}</span></div>
    </InspectorSection>

    <InformationSection node={node} tag={node.type} file={node.source.file} expandSignal={expandSignal} initiallyOpen={false} />
    </div>

    <p className="inspector-save-hint">{dirty ? "La pagina ha modifiche non salvate. Usa File → Salva (Ctrl+S)." : "File → Salva registra la pagina su disco (Ctrl+S)."}</p>
    <button className="danger-action" onClick={() => void remove()} disabled={!node.capabilities.remove}><Trash2 size={14} /> Elimina {elementName(node.type).toLocaleLowerCase("it")} <kbd>Canc</kbd></button>
  </aside>;
}
