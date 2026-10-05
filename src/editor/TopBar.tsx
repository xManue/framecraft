import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, Braces,
  AlignVerticalDistributeCenter, ArrowLeft, Blocks, Cable, Check, ChevronDown,
  Code2, Columns2, Compass, Database, Eye, FileCheck2, FolderOpen, Gauge, HardDriveDownload,
  HelpCircle, Languages, LayoutTemplate, Magnet, Maximize, Minus, MonitorCog,
  MousePointer2, Pencil, Play, Plus, Redo2, RefreshCw, Save,
  TerminalSquare, Trash2, Undo2, X, ZoomIn,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { alignLabels, type AlignMode } from "../canvas/alignment";
import { panelFormats } from "../canvas/panels";
import type { ViewMode, Viewport } from "../core/types";
import { snapGrids, useEditorStore, type UiDensity, type WorkLayout } from "../state/editorStore";
import { PlcConnectionsDialog } from "./PlcConnectionsDialog";

const viewModes: { id: ViewMode; label: string; description: string; icon: typeof Eye }[] = [
  { id: "visual", label: "Disegno", description: "Solo il pannello grafico", icon: Eye },
  { id: "split", label: "Affiancati", description: "Pannello e codice insieme", icon: Columns2 },
  { id: "code", label: "Codice", description: "Sorgente della pagina", icon: Code2 },
];

const layouts: { id: WorkLayout; label: string }[] = [
  { id: "disegno", label: "Disegno" },
  { id: "plc", label: "Collegamenti PLC" },
  { id: "sviluppo", label: "Sviluppo" },
];

const densities: { id: UiDensity; label: string }[] = [
  { id: "compatta", label: "Compatta" },
  { id: "normale", label: "Normale" },
  { id: "grande", label: "Grande" },
];

const alignCommands: { mode: AlignMode; icon: typeof AlignStartVertical }[] = [
  { mode: "left", icon: AlignStartVertical },
  { mode: "center-x", icon: AlignCenterVertical },
  { mode: "right", icon: AlignEndVertical },
  { mode: "spread-x", icon: AlignHorizontalDistributeCenter },
  { mode: "top", icon: AlignStartHorizontal },
  { mode: "center-y", icon: AlignCenterHorizontal },
  { mode: "bottom", icon: AlignEndHorizontal },
  { mode: "spread-y", icon: AlignVerticalDistributeCenter },
];

type TopMenu = "file" | "edit" | "view" | "panel" | "help";

export function TopBar() {
  const project = useEditorStore((state) => state.project)!;
  const viewport = useEditorStore((state) => state.viewport);
  const setViewport = useEditorStore((state) => state.setViewport);
  const mode = useEditorStore((state) => state.viewMode);
  const setMode = useEditorStore((state) => state.setViewMode);
  const previewUrl = useEditorStore((state) => state.previewUrl);
  const save = useEditorStore((state) => state.save);
  const saveAs = useEditorStore((state) => state.saveProjectAs);
  const exporting = useEditorStore((state) => state.exporting);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const undoCount = useEditorStore((state) => state.history.length);
  const redoCount = useEditorStore((state) => state.future.length);
  const dirty = useEditorStore((state) => state.dirty);
  const closeProject = useEditorStore((state) => state.closeProject);
  const switchProject = useEditorStore((state) => state.chooseAndOpenProject);
  const openPreview = useEditorStore((state) => state.openStandalonePreview);
  const setLeftPanel = useEditorStore((state) => state.setLeftPanel);
  const setConsoleOpen = useEditorStore((state) => state.setConsoleOpen);
  const checkProject = useEditorStore((state) => state.checkHmiProject);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const setInteractionMode = useEditorStore((state) => state.setInteractionMode);
  const snap = useEditorStore((state) => state.snap);
  const setSnap = useEditorStore((state) => state.setSnap);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const fitCanvas = useEditorStore((state) => state.fitCanvas);
  const setFitCanvas = useEditorStore((state) => state.setFitCanvas);
  const refreshPreview = useEditorStore((state) => state.refreshPreview);
  const restartPreview = useEditorStore((state) => state.restartPreview);
  const previewBusy = useEditorStore((state) => state.loading || state.previewRestarting);
  const workLayout = useEditorStore((state) => state.workLayout);
  const applyWorkLayout = useEditorStore((state) => state.applyWorkLayout);
  const uiDensity = useEditorStore((state) => state.uiDensity);
  const setUiDensity = useEditorStore((state) => state.setUiDensity);
  const multiSelection = useEditorStore((state) => state.multiSelection);
  const selectedId = useEditorStore((state) => state.selectedId);
  const alignSelection = useEditorStore((state) => state.alignSelection);
  const setMultiSelection = useEditorStore((state) => state.setMultiSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const errors = useEditorStore((state) => state.consoleEntries.filter((item) => item.level === "error").length);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<TopMenu>();
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!activeMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setActiveMenu(undefined);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveMenu(undefined);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [activeMenu]);

  const toggleMenu = (menu: TopMenu) => setActiveMenu((current) => current === menu ? undefined : menu);
  const runAndClose = (action: () => void) => { setActiveMenu(undefined); action(); };
  const zoomBy = (delta: number) => {
    setFitCanvas(false);
    setZoom(zoom + delta);
  };

  return <>
    <header className="topbar">
      <div className="topbar-start">
        <div className="topbar-project" title={dirty ? `${project.name} · modifiche non salvate` : project.name}>
          <span className="brand-mini">F</span><strong>{project.name}</strong>
          {project.isWorkingCopy && <span className="working-copy-badge" title={project.originalRoot ? `Originale protetto: ${project.originalRoot}` : "Progetto creato nell'area di lavoro Framecraft"}>COPIA</span>}
          {dirty && <span className="project-dirty" aria-label="Modifiche non salvate" />}
        </div>
        <nav ref={menuRef} className="topbar-menus" aria-label="Menu principale">
          <div className="topbar-menu">
            <button className={activeMenu === "file" ? "active" : ""} onClick={() => toggleMenu("file")} aria-expanded={activeMenu === "file"} aria-haspopup="menu">File <ChevronDown size={12} /></button>
            {activeMenu === "file" && <div className="topbar-dropdown" role="menu" aria-label="File">
              <button role="menuitem" onClick={() => runAndClose(() => void switchProject())}><FolderOpen size={15} /><span><strong>Apri o cambia progetto</strong><small>Scegli un’altra cartella di lavoro</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => void save())}><Save size={15} /><span><strong>Salva</strong><small>Registra la modifica corrente</small></span><kbd>Ctrl S</kbd></button>
              <button role="menuitem" disabled={exporting} onClick={() => runAndClose(() => void saveAs())}><HardDriveDownload size={15} /><span><strong>{exporting ? "Esportazione in corso…" : "Esporta copia"}</strong><small>Scegli la cartella della copia finale</small></span></button>
              <div className="topbar-menu-separator" />
              <button role="menuitem" onClick={() => runAndClose(() => void closeProject())}><ArrowLeft size={15} /><span><strong>Chiudi progetto</strong><small>Torna alla schermata iniziale</small></span></button>
            </div>}
          </div>

          <div className="topbar-menu">
            <button className={activeMenu === "edit" ? "active" : ""} onClick={() => toggleMenu("edit")} aria-expanded={activeMenu === "edit"} aria-haspopup="menu">Modifica <ChevronDown size={12} /></button>
            {activeMenu === "edit" && <div className="topbar-dropdown topbar-dropdown-scroll" role="menu" aria-label="Modifica">
              <button role="menuitem" disabled={!undoCount} onClick={() => runAndClose(() => void undo())}><Undo2 size={15} /><span><strong>Annulla</strong><small>{undoCount ? `${undoCount} azioni disponibili` : "Nessuna azione da annullare"}</small></span><kbd>Ctrl Z</kbd></button>
              <button role="menuitem" disabled={!redoCount} onClick={() => runAndClose(() => void redo())}><Redo2 size={15} /><span><strong>Ripristina</strong><small>{redoCount ? `${redoCount} azioni disponibili` : "Nessuna azione da ripristinare"}</small></span><kbd>Ctrl ⇧ Z</kbd></button>
              <button role="menuitem" disabled={!selectedId && !multiSelection.length} onClick={() => runAndClose(() => void deleteSelection())}><Trash2 size={15} /><span><strong>Elimina selezione</strong><small>Rimuove gli elementi scelti</small></span><kbd>Canc</kbd></button>
              <small className="topbar-menu-heading">GUIDE E ALLINEAMENTO</small>
              <button role="menuitemcheckbox" aria-checked={snap.enabled} onClick={() => setSnap({ enabled: !snap.enabled })}><Magnet size={15} /><span><strong>Guide intelligenti</strong><small>Bordi, centri e distanze si agganciano</small></span>{snap.enabled && <Check size={14} />}</button>
              <label className="topbar-menu-select"><Magnet size={15} /><span><strong>Passo griglia</strong><small>Usato quando non c’è un bordo vicino</small></span><select value={snap.grid} disabled={!snap.enabled} onChange={(event) => setSnap({ grid: Number(event.target.value) })} aria-label="Passo griglia"><option value={0}>Libero</option>{snapGrids.map((step) => <option key={step} value={step}>{step} px</option>)}</select></label>
              {multiSelection.length > 1 && <><small className="topbar-menu-heading">ALLINEA {multiSelection.length} ELEMENTI</small><div className="topbar-align-grid">{alignCommands.map(({ mode: alignMode, icon: Icon }) => <button key={alignMode} onClick={() => void alignSelection(alignMode)} title={alignLabels[alignMode]} aria-label={alignLabels[alignMode]}><Icon size={15} /></button>)}<button onClick={() => setMultiSelection([])} title="Annulla selezione multipla" aria-label="Annulla selezione multipla"><X size={15} /></button></div></>}
            </div>}
          </div>

          <div className="topbar-menu">
            <button className={activeMenu === "view" ? "active" : ""} onClick={() => toggleMenu("view")} aria-expanded={activeMenu === "view"} aria-haspopup="menu">Visualizza <ChevronDown size={12} /></button>
            {activeMenu === "view" && <div className="topbar-dropdown topbar-dropdown-scroll" role="menu" aria-label="Visualizza">
              <small className="topbar-menu-heading">ANTEPRIMA E VITE</small>
              <button role="menuitem" disabled={previewBusy} onClick={() => runAndClose(refreshPreview)}><RefreshCw size={15} /><span><strong>Aggiorna anteprima</strong><small>{previewUrl ? "Ricarica la pagina senza riavviare Vite" : "Tenta l’avvio se l’anteprima non è disponibile"}</small></span></button>
              <button role="menuitem" disabled={previewBusy} onClick={() => runAndClose(() => void restartPreview())}><RefreshCw size={15} /><span><strong>{previewBusy ? "Avvio Vite in corso…" : "Riavvia Vite"}</strong><small>Conserva documento, modifiche e cronologia</small></span></button>
              <button role="menuitem" disabled={previewBusy} onClick={() => runAndClose(() => void restartPreview(true))}><RefreshCw size={15} /><span><strong>Ricostruisci cache Vite</strong><small>Riavvia e ricompila le dipendenze con --force</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setConsoleOpen(true))}><TerminalSquare size={15} /><span><strong>Log di avvio</strong><small>Mostra l’errore e l’output reale di Vite</small></span></button>
              <small className="topbar-menu-heading">CONTENUTO CENTRALE</small>
              {viewModes.map(({ id, label, description, icon: Icon }) => <button role="menuitemradio" aria-checked={mode === id} key={id} onClick={() => runAndClose(() => setMode(id))}><Icon size={15} /><span><strong>{label}</strong><small>{description}</small></span>{mode === id && <Check size={14} />}</button>)}
              <small className="topbar-menu-heading">AREA DI LAVORO</small>
              <label className="topbar-menu-select"><LayoutTemplate size={15} /><span><strong>Disposizione</strong><small>Imposta i pannelli per il lavoro corrente</small></span><select value={workLayout} onChange={(event) => applyWorkLayout(event.target.value as WorkLayout)} aria-label="Disposizione dei pannelli">{layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}</select></label>
              <label className="topbar-menu-select"><ZoomIn size={15} /><span><strong>Dimensione interfaccia</strong><small>Ingrandisce tutti gli strumenti dell’editor</small></span><select value={uiDensity} onChange={(event) => setUiDensity(event.target.value as UiDensity)} aria-label="Dimensione dell'interfaccia">{densities.map((density) => <option key={density.id} value={density.id}>{density.label}</option>)}</select></label>
              <small className="topbar-menu-heading">PANNELLO NEL CANVAS</small>
              <div className="topbar-zoom-grid" role="group" aria-label="Zoom pannello">
                <button onClick={() => zoomBy(-0.1)} aria-label="Riduci zoom" title="Riduci zoom"><Minus size={15} /></button>
                <button onClick={() => { setFitCanvas(false); setZoom(1); }} aria-label="Zoom cento per cento" title="Zoom 100%">{fitCanvas ? "Auto" : `${Math.round(zoom * 100)}%`}</button>
                <button onClick={() => zoomBy(0.1)} aria-label="Aumenta zoom" title="Aumenta zoom"><Plus size={15} /></button>
                <button className={fitCanvas ? "active" : ""} onClick={() => setFitCanvas(true)} aria-label="Adatta il pannello allo spazio" title="Adatta allo spazio"><Maximize size={15} /></button>
              </div>
              <label className="topbar-menu-select"><MonitorCog size={15} /><span><strong>Formato pannello</strong><small>Dispositivo di destinazione</small></span><select value={viewport} onChange={(event) => setViewport(event.target.value as Viewport)} aria-label="Formato pannello">{panelFormats.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.size}</option>)}</select></label>
            </div>}
          </div>

          <div className="topbar-menu">
            <button className={activeMenu === "panel" ? "active" : ""} onClick={() => toggleMenu("panel")} aria-expanded={activeMenu === "panel"} aria-haspopup="menu">Pannello <ChevronDown size={12} /></button>
            {activeMenu === "panel" && <div className="topbar-dropdown" role="menu" aria-label="Pannello">
              <button role="menuitem" disabled={!previewUrl} onClick={() => runAndClose(() => void openPreview())}><Play size={15} /><span><strong>Prova pannello</strong><small>Apri il Runtime senza strumenti di modifica</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => void checkProject())}><FileCheck2 size={15} /><span><strong>Controlla pannello</strong><small>Trova errori, tag mancanti e parti incomplete</small></span></button>
              <div className="topbar-menu-separator" />
              <button role="menuitem" onClick={() => runAndClose(() => setLeftPanel("plc"))}><Gauge size={15} /><span><strong>Variabili PLC e simulazione</strong><small>Catalogo, import, controllo e valori di prova</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setConnectionsOpen(true))}><Cable size={15} /><span><strong>Connessioni PLC</strong><small>Broker MQTT, mapping tag e gateway del pannello</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setLeftPanel("resources"))}><Languages size={15} /><span><strong>Testi e grafiche</strong><small>Lingue, risorse e asset del progetto</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setLeftPanel("scripts"))}><Braces size={15} /><span><strong>Moduli JavaScript</strong><small>Funzioni globali e definizioni locali compilate</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setLeftPanel("faceplates"))}><Blocks size={15} /><span><strong>Tipi faceplate</strong><small>Versioni, tag, proprietà, eventi e stato locale</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setLeftPanel("logs"))}><Database size={15} /><span><strong>Data Log e storico</strong><small>Acquisizione, conservazione, segmenti e sorgenti Trend</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setConsoleOpen(true))}><TerminalSquare size={15} /><span><strong>Diagnostica HMI{errors ? ` · ${errors} errori` : ""}</strong><small>Trace, eventi, scritture e navigazione</small></span></button>
            </div>}
          </div>

          <div className="topbar-menu topbar-menu-help">
            <button className={activeMenu === "help" ? "active" : ""} onClick={() => toggleMenu("help")} aria-expanded={activeMenu === "help"} aria-haspopup="menu">Aiuto <ChevronDown size={12} /></button>
            {activeMenu === "help" && <div className="topbar-dropdown topbar-dropdown-right" role="menu" aria-label="Aiuto">
              <button role="menuitem" onClick={() => runAndClose(() => setHelpOpen(true))}><HelpCircle size={15} /><span><strong>Guida rapida</strong><small>Modifica, collegamenti PLC e prova del pannello</small></span></button>
              <button role="menuitem" onClick={() => runAndClose(() => setHelpOpen(true))}><MousePointer2 size={15} /><span><strong>Scorciatoie e gesti</strong><small>Tastiera, selezione multipla e trascinamento</small></span></button>
            </div>}
          </div>
        </nav>
        <div className="topbar-actions">
          <div className="topbar-interaction-switch" role="group" aria-label="Interazione con il pannello">
            <button type="button" aria-pressed={interactionMode === "edit"} onClick={() => runAndClose(() => setInteractionMode("edit"))} title="Seleziona, sposta e ridimensiona gli oggetti del pannello">
              <Pencil size={16} aria-hidden="true" /><span>Modifica</span><Check className="interaction-mode-check" size={12} aria-hidden="true" />
            </button>
            <button type="button" aria-pressed={interactionMode === "navigate"} onClick={() => runAndClose(() => setInteractionMode("navigate"))} title="Usa pulsanti, campi e navigazione nel pannello dell'editor">
              <Compass size={16} aria-hidden="true" /><span>Usa il pannello</span><Check className="interaction-mode-check" size={12} aria-hidden="true" />
            </button>
          </div>
          {mode !== "visual" && <button className="topbar-visual-return" type="button" onClick={() => runAndClose(() => setMode("visual"))} title="Chiudi la vista codice e torna al pannello. Le modifiche non salvate restano nel documento."><Eye size={16} aria-hidden="true" /><span>Torna alla grafica</span></button>}
        </div>
      </div>
    </header>
    {connectionsOpen && <PlcConnectionsDialog key={project.root} onClose={() => setConnectionsOpen(false)} />}
    {helpOpen && <div className="help-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
      <section className="quick-help" role="dialog" aria-modal="true" aria-labelledby="quick-help-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>GUIDA RAPIDA</small><h2 id="quick-help-title">Come modificare un pannello</h2></div><button onClick={() => setHelpOpen(false)} aria-label="Chiudi guida"><X size={18} /></button></header>
        <div className="quick-help-steps">
          <article><span><b>1</b><MousePointer2 size={18} /></span><strong>Scegli e modifica</strong><p>Scegli <b>Modifica</b> nello switch della barra superiore e clicca l’oggetto. Con <b>Usa il pannello</b> puoi usare pulsanti, campi e navigazione. Tieni <b>Shift</b> mentre trascini per muoverlo perfettamente dritto.</p></article>
          <article><span><b>2</b><Blocks size={18} /></span><strong>Aggiungi elementi</strong><p>Apri <b>Aggiungi</b> a sinistra e trascina pulsanti, spie o componenti del progetto nel punto desiderato.</p></article>
          <article><span><b>3</b><Cable size={18} /></span><strong>Controlla il PLC</strong><p>Seleziona un oggetto e usa la sezione <b>Variabile PLC</b>. Il catalogo completo rimane nel pannello PLC.</p></article>
          <article><span><b>4</b><Play size={18} /></span><strong>Prova e salva</strong><p><b>Pannello → Prova pannello</b> mostra il risultato senza editor. Quando è corretto usa <b>File → Esporta copia</b>.</p></article>
        </div>
        <footer><span><kbd>Ctrl Z</kbd> annulla</span><span><kbd>Canc</kbd> elimina</span><span><kbd>Shift</kbd> trascina dritto</span><span><kbd>Alt</kbd> ignora le guide</span></footer>
      </section>
    </div>}
  </>;
}
