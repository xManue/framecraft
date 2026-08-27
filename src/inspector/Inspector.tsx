import { Box, Cable, ChevronDown, ChevronsUpDown, Code2, Highlighter, Info, LayoutGrid, Lock, MousePointerClick, Move, Palette, Ruler, Save, SlidersHorizontal, Tags, Trash2, Type as TypeIcon, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EditorNode } from "../core/types";
import { insideProject } from "../core/paths";
import { plcTagsInSource } from "../core/plcVariables";
import { useEditorStore } from "../state/editorStore";
import { translatedCoordinate } from "./coordinates";

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function InspectorSection({ title, icon, children, initiallyOpen = false, expandSignal }: { title: string; icon: ReactNode; children: ReactNode; initiallyOpen?: boolean; expandSignal?: number }) {
  const [open, setOpen] = useState(initiallyOpen);
  // A double click in the canvas asks for the complete sheet, so every section opens at once.
  useEffect(() => { if (expandSignal) setOpen(true); }, [expandSignal]);
  return <section className={`inspector-section ${open ? "open" : ""}`}>
    <button className="inspector-section-title" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {icon}<span>{title}</span><ChevronDown size={13} />
    </button>
    {open && <div className="inspector-section-fields">{children}</div>}
  </section>;
}

function StyleField({ label, property, value, disabled, placeholder = "—" }: { label: string; property: string; value?: string | number; disabled?: boolean; placeholder?: string }) {
  const update = useEditorStore((state) => state.updateStyle);
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);
  return <label className="property-field"><span>{label}</span><input value={draft} disabled={disabled} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { setDraft(String(value ?? "")); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (draft !== String(value ?? "") && draft.trim()) void update(property, draft.trim());
  }} /></label>;
}

function NumberStyleField({ label, property, value, fallback, unit = "px", disabled }: { label: string; property: string; value?: string | number; fallback?: number; unit?: string; disabled?: boolean }) {
  const update = useEditorStore((state) => state.updateStyle);
  const numericValue = Number.parseFloat(String(value ?? fallback ?? ""));
  const [draft, setDraft] = useState(Number.isFinite(numericValue) ? String(rounded(numericValue)) : "");
  useEffect(() => {
    const next = Number.parseFloat(String(value ?? fallback ?? ""));
    setDraft(Number.isFinite(next) ? String(rounded(next)) : "");
  }, [fallback, value]);
  return <label className="property-field numeric-field"><span>{label}</span><span className="property-input-with-unit"><input type="number" step="1" value={draft} disabled={disabled} placeholder="—" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") event.currentTarget.blur();
  }} onBlur={() => {
    const next = Number(draft);
    if (draft !== "" && Number.isFinite(next) && next !== numericValue) void update(property, unit ? `${next}${unit}` : next);
  }} /><small>{unit}</small></span></label>;
}

function CoordinateField({ label, axis, value, translate, disabled }: { label: string; axis: "x" | "y"; value?: number; translate?: string | number; disabled?: boolean }) {
  const update = useEditorStore((state) => state.updateStyle);
  const [draft, setDraft] = useState(value == null ? "" : String(rounded(value)));
  useEffect(() => { setDraft(value == null ? "" : String(rounded(value))); }, [value]);
  return <label className="property-field numeric-field"><span>{label}</span><span className="property-input-with-unit"><input type="number" step="1" value={draft} disabled={disabled || value == null} placeholder="—" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") event.currentTarget.blur();
  }} onBlur={() => {
    const next = Number(draft);
    if (value != null && Number.isFinite(next) && next !== value) void update("translate", translatedCoordinate(value, next, translate, axis));
  }} /><small>px</small></span></label>;
}

function StyleSelect({ label, property, value, options, disabled }: { label: string; property: string; value?: string | number; options: string[]; disabled?: boolean }) {
  const update = useEditorStore((state) => state.updateStyle);
  const current = String(value ?? "");
  return <label className="property-field"><span>{label}</span><select value={current} disabled={disabled} onChange={(event) => void update(property, event.target.value)}>
    {!current && <option value="">—</option>}
    {current && !options.includes(current) && <option value={current}>{current}</option>}
    {options.map((option) => <option value={option} key={option}>{option}</option>)}
  </select></label>;
}

function hexColor(value: string | number | undefined) {
  const color = String(value ?? "");
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const rgb = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  if (!rgb) return "#000000";
  return `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
}

function ColorStyleField({ label, property, value, disabled }: { label: string; property: string; value?: string | number; disabled?: boolean }) {
  const update = useEditorStore((state) => state.updateStyle);
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);
  return <label className="property-field color-property"><span>{label}</span><span className="color-property-control">
    <input type="color" value={hexColor(draft)} disabled={disabled} aria-label={`${label}: scegli colore`} onChange={(event) => { setDraft(event.target.value); void update(property, event.target.value); }} />
    <input value={draft} disabled={disabled} placeholder="transparent" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => {
      if (draft.trim() && draft !== String(value ?? "")) void update(property, draft.trim());
    }} />
  </span></label>;
}

const internalProps = new Set(["data-fc-highlight-target", "data-fc-highlight-color", "data-fc-highlight-width", "data-fc-highlight-id"]);

function AttributeField({ name, value }: { name: string; value: string | number }) {
  const update = useEditorStore((state) => state.updateAttribute);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return <label className="property-field"><span title={name}>{name}</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { setDraft(String(value)); event.currentTarget.blur(); }
  }} onBlur={() => {
    if (draft !== String(value)) void update(name, draft);
  }} /></label>;
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
    {node.dynamicProps.map((name) => <div className="property-field read-only-property" key={name}><span title={name}>{name}</span><em>dinamico · solo in Code</em></div>)}
  </InspectorSection>;
}

function InfoRow({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return <div className="property-field read-only-property"><span title={label}>{label}</span><em title={title}>{value}</em></div>;
}

/** Everything known about the element regardless of where its source lives: what it actually
 * displays, which PLC signal it is wired to, and where it comes from. */
function InformationSection({ node, tag, file, expandSignal }: { node?: EditorNode; tag?: string; file: string; expandSignal?: number }) {
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

  return <InspectorSection title="Informazioni" icon={<Info size={12} />} initiallyOpen expandSignal={expandSignal}>
    <InfoRow label="Elemento" value={node?.type ?? tag ?? "—"} />
    {displayed ? <label className="property-stack read-only-stack"><span>Testo mostrato</span><p title={displayed}>{displayed}</p></label>
      : <InfoRow label="Testo mostrato" value="nessuno" />}
    {node && <InfoRow label="Testo nel sorgente" value={node.capabilities.text ? "statico · modificabile" : node.dynamic ? "dinamico · da codice" : "nessuno"} />}
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
function ExternalElementSheet({ file, tag, expandSignal }: { file: string; tag?: string; expandSignal?: number }) {
  const selectionRect = useEditorStore((state) => state.selectionRect);
  const selectionStyles = useEditorStore((state) => state.selectionStyles);
  const name = file.split(/[\\/]/).at(-1) ?? file;
  return <>
    <div className="selection-summary"><span className="node-icon">&lt;/&gt;</span><span><strong>{tag ?? "elemento"}</strong><small>{selectionRect ? `${rounded(selectionRect.width)} × ${rounded(selectionRect.height)} px` : "fuori dal progetto"} · sola lettura</small></span></div>
    <div className="code-component external-source"><Lock size={13} /><span>Il sorgente di <strong>{name}</strong> non è raggiungibile: le proprietà qui sotto sono quelle calcolate dall’anteprima.<small title={file}>{file}</small></span></div>
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

function HighlightInteractionEditor({ node }: { node: EditorNode }) {
  const beginSelection = useEditorStore((state) => state.beginHighlightSelection);
  const cancelSelection = useEditorStore((state) => state.cancelHighlightSelection);
  const updateInteraction = useEditorStore((state) => state.updateHighlightInteraction);
  const removeInteraction = useEditorStore((state) => state.removeHighlightInteraction);
  const picker = useEditorStore((state) => state.highlightPicker);
  const targetId = typeof node.props["data-fc-highlight-target"] === "string" ? node.props["data-fc-highlight-target"] : undefined;
  const savedColor = typeof node.props["data-fc-highlight-color"] === "string" ? node.props["data-fc-highlight-color"] : "#f59e0b";
  const savedWidth = typeof node.props["data-fc-highlight-width"] === "string" ? Number(node.props["data-fc-highlight-width"]) : 3;
  const [color, setColor] = useState(savedColor);
  const [width, setWidth] = useState(savedWidth);
  useEffect(() => { setColor(savedColor); setWidth(savedWidth); }, [node.id, savedColor, savedWidth]);
  const isPicking = picker?.trigger.file === node.source.file && picker.trigger.start === node.source.start;

  return <section className="inspector-section interaction-editor">
    <div className="inspector-static-title"><MousePointerClick size={12} /> Interazione</div>
    <div className="interaction-card">
      <div className="interaction-card-title"><span><Highlighter size={14} /></span><div><strong>Evidenzia una parte</strong><small>{targetId ? "Configurata e modificabile" : "Al click sul pulsante"}</small></div></div>
      <label className="interaction-color"><span>Colore</span><span className="color-control"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Colore evidenziazione" /><code>{color}</code></span></label>
      <label className="interaction-width"><span>Spessore</span><input type="range" min="1" max="8" value={width} onChange={(event) => setWidth(Number(event.target.value))} /><output>{width}px</output></label>
      {isPicking ? <button className="interaction-action secondary" onClick={cancelSelection}><X size={14} /> Annulla selezione</button> : targetId ? <>
        <button className="interaction-action primary" onClick={() => void updateInteraction({ color, width })}><Save size={14} /> Applica modifiche</button>
        <button className="interaction-action secondary" onClick={() => beginSelection({ color, width })}><MousePointerClick size={14} /> Cambia parte</button>
        <button className="interaction-remove" onClick={() => void removeInteraction()}><Trash2 size={13} /> Rimuovi interazione</button>
      </> : <button className="interaction-action primary" onClick={() => beginSelection({ color, width })}><MousePointerClick size={14} /> Scegli la parte</button>}
    </div>
  </section>;
}

export function Inspector() {
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  const selectionRect = useEditorStore((state) => state.selectionRect);
  const selectionStyles = useEditorStore((state) => state.selectionStyles);
  const updateText = useEditorStore((state) => state.updateText);
  const remove = useEditorStore((state) => state.deleteSelection);
  const setMode = useEditorStore((state) => state.setViewMode);
  const expandSignal = useEditorStore((state) => state.propertiesExpandedAt);
  const expandProperties = useEditorStore((state) => state.expandProperties);
  const unresolvedSelection = useEditorStore((state) => state.unresolvedSelection);
  const node = selectedId ? document?.nodes[selectedId] : undefined;
  const inspectorRef = useRef<HTMLElement>(null);
  const [text, setText] = useState(node?.text ?? "");
  useEffect(() => { setText(node?.text ?? ""); }, [node?.id, node?.text]);
  useEffect(() => { inspectorRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [node?.id]);

  if (!node && unresolvedSelection) {
    return <aside ref={inspectorRef} className="inspector has-selection">
      <div className="panel-title"><span>PROPRIETÀ</span><button onClick={expandProperties} title="Mostra tutte le proprietà" aria-label="Mostra tutte le proprietà"><ChevronsUpDown size={13} /></button></div>
      <ExternalElementSheet file={unresolvedSelection.file} tag={unresolvedSelection.tag} expandSignal={expandSignal} />
    </aside>;
  }
  if (!node) return <aside ref={inspectorRef} className="inspector empty-inspector"><div className="panel-title"><span>PROPRIETÀ</span></div><div><Info size={20} /><strong>Nessun elemento selezionato</strong><p>Clicca un elemento nel canvas: coordinate, dimensioni, colori, font e layout appariranno qui.</p></div></aside>;
  const locked = !node.capabilities.style;
  const style = (property: string) => node.styles[property] ?? selectionStyles[property];
  return <aside ref={inspectorRef} className="inspector has-selection">
    <div className="panel-title"><span>PROPRIETÀ</span><button onClick={expandProperties} title="Mostra tutte le proprietà (doppio click sull'elemento)" aria-label="Mostra tutte le proprietà"><ChevronsUpDown size={13} /></button><button onClick={() => setMode("code")} title="Apri il codice" aria-label="Apri il codice dell'elemento"><Code2 size={13} /></button></div>
    <div className="selection-summary"><span className="node-icon">&lt;/&gt;</span><span><strong>{node.type}</strong><small>{selectionRect ? `${rounded(selectionRect.width)} × ${rounded(selectionRect.height)} px` : `Riga ${node.source.line}:${node.source.column}`} · selezionato</small></span></div>
    {node.dynamic && <div className="code-component"><Lock size={13} /><span>Il contenuto è dinamico; geometria e stile restano modificabili.</span></div>}
    <InformationSection node={node} tag={node.type} file={node.source.file} expandSignal={expandSignal} />
    {node.capabilities.text && <InspectorSection title="Contenuto" icon={<TypeIcon size={12} />} initiallyOpen expandSignal={expandSignal}><label className="property-stack"><span>Testo</span><textarea value={text} aria-label="Testo dell'elemento" onChange={(event) => setText(event.target.value)} onBlur={() => text !== node.text && void updateText(text)} /></label></InspectorSection>}
    {(node.type === "button" || typeof node.props["data-fc-highlight-target"] === "string") && <HighlightInteractionEditor node={node} />}
    <AttributesSection node={node} expandSignal={expandSignal} />

    <InspectorSection title="Posizione" icon={<Move size={12} />} initiallyOpen expandSignal={expandSignal}>
      <div className="property-pair coordinate-pair"><CoordinateField label="X" axis="x" value={selectionRect?.x} translate={style("translate")} disabled={locked} /><CoordinateField label="Y" axis="y" value={selectionRect?.y} translate={style("translate")} disabled={locked} /></div>
      <StyleSelect label="Posizione" property="position" value={style("position")} options={["static", "relative", "absolute", "fixed", "sticky"]} disabled={locked} />
      <div className="property-pair"><StyleField label="Left" property="left" value={style("left")} disabled={locked} /><StyleField label="Top" property="top" value={style("top")} disabled={locked} /></div>
      <div className="property-pair"><StyleField label="Right" property="right" value={style("right")} disabled={locked} /><StyleField label="Bottom" property="bottom" value={style("bottom")} disabled={locked} /></div>
      <StyleField label="Livello" property="zIndex" value={style("zIndex")} disabled={locked} />
      <StyleField label="Spostamento" property="translate" value={style("translate")} disabled={locked} />
      <div className="property-pair"><StyleField label="Rotazione" property="rotate" value={style("rotate")} disabled={locked} /><StyleField label="Scala" property="scale" value={style("scale")} disabled={locked} /></div>
    </InspectorSection>

    <InspectorSection title="Dimensioni" icon={<Ruler size={12} />} initiallyOpen expandSignal={expandSignal}>
      <div className="property-pair"><NumberStyleField label="W" property="width" value={style("width")} fallback={selectionRect?.width} disabled={locked} /><NumberStyleField label="H" property="height" value={style("height")} fallback={selectionRect?.height} disabled={locked} /></div>
      <div className="property-pair"><StyleField label="Min W" property="minWidth" value={style("minWidth")} disabled={locked} /><StyleField label="Min H" property="minHeight" value={style("minHeight")} disabled={locked} /></div>
      <div className="property-pair"><StyleField label="Max W" property="maxWidth" value={style("maxWidth")} disabled={locked} /><StyleField label="Max H" property="maxHeight" value={style("maxHeight")} disabled={locked} /></div>
      <StyleField label="Proporzioni" property="aspectRatio" value={style("aspectRatio")} disabled={locked} placeholder="auto / 16 / 9" />
    </InspectorSection>

    <InspectorSection title="Aspetto" icon={<Palette size={12} />} initiallyOpen expandSignal={expandSignal}>
      <ColorStyleField label="Sfondo" property="backgroundColor" value={style("backgroundColor")} disabled={locked} />
      <ColorStyleField label="Testo" property="color" value={style("color")} disabled={locked} />
      <StyleField label="Immagine bg" property="backgroundImage" value={style("backgroundImage")} disabled={locked} />
      <StyleField label="Bordo" property="border" value={style("border")} disabled={locked} />
      <StyleField label="Raggio" property="borderRadius" value={style("borderRadius")} disabled={locked} />
      <StyleField label="Ombra" property="boxShadow" value={style("boxShadow")} disabled={locked} />
      <StyleField label="Outline" property="outline" value={style("outline")} disabled={locked} />
      <NumberStyleField label="Opacità" property="opacity" value={style("opacity")} unit="" disabled={locked} />
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
      <NumberStyleField label="Dimensione" property="fontSize" value={style("fontSize")} disabled={locked} />
      <StyleSelect label="Peso" property="fontWeight" value={style("fontWeight")} options={["300", "400", "500", "600", "700", "800", "900"]} disabled={locked} />
      <StyleField label="Interlinea" property="lineHeight" value={style("lineHeight")} disabled={locked} />
      <StyleField label="Spaziatura" property="letterSpacing" value={style("letterSpacing")} disabled={locked} />
      <StyleSelect label="Allineamento" property="textAlign" value={style("textAlign")} options={["left", "center", "right", "justify"]} disabled={locked} />
      <StyleSelect label="Maiuscole" property="textTransform" value={style("textTransform")} options={["none", "uppercase", "lowercase", "capitalize"]} disabled={locked} />
      <StyleSelect label="Decorazione" property="textDecoration" value={style("textDecoration")} options={["none", "underline", "line-through", "overline"]} disabled={locked} />
      <StyleSelect label="A capo" property="whiteSpace" value={style("whiteSpace")} options={["normal", "nowrap", "pre", "pre-wrap", "break-spaces"]} disabled={locked} />
    </InspectorSection>

    <InspectorSection title="Avanzate" icon={<SlidersHorizontal size={12} />} expandSignal={expandSignal}>
      <StyleSelect label="Visibilità" property="visibility" value={style("visibility")} options={["visible", "hidden", "collapse"]} disabled={locked} />
      <StyleSelect label="Click" property="pointerEvents" value={style("pointerEvents")} options={["auto", "none"]} disabled={locked} />
      <StyleField label="Cursore" property="cursor" value={style("cursor")} disabled={locked} />
      {(node.type === "img" || node.type === "video") && <StyleSelect label="Adattamento" property="objectFit" value={style("objectFit")} options={["fill", "contain", "cover", "none", "scale-down"]} disabled={locked} />}
      <div className="property-source"><Box size={12} /><span>Riga {node.source.line}:{node.source.column}</span></div>
    </InspectorSection>

    <button className="danger-action" onClick={() => void remove()} disabled={!node.capabilities.remove}><Trash2 size={14} /> Elimina elemento</button>
  </aside>;
}
