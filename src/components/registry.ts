import type { LucideIcon } from "lucide-react";
import { hmiObjectJsx } from "../core/hmiObjects";
import { hmiPopupJsx } from "../core/hmiPopups";
import { hmiShellJsx } from "../core/hmiShells";
import { hmiTrendJsx } from "../core/hmiTrend";
import { hmiFunctionTrendJsx } from "../core/hmiFunctionTrend";
import {
  Activity, AlertTriangle, AlignLeft, BarChart3, Bell, Box, CheckSquare, CircleDot,
  CircleGauge, Clock3, Columns3, Database, FileText, Folder, Gauge, Grid3X3, Heading, Image,
  LayoutPanelTop, Link, List, ListTree, Minus, MousePointerClick, Navigation, PanelLeft,
  PanelTop, Play, Power, RectangleHorizontal, Rows3, Search, Settings, SlidersHorizontal, Square, SquareMousePointer,
  Table2, TextCursorInput, ToggleLeft, Type, Wrench, Zap,
} from "lucide-react";

/** "Standard HMI" sono i pezzi del pannello vero: le misure e i colori vengono dallo standard
 * aziendale (`src/core/hmiStandard.ts`), e ogni pezzo dichiara con `data-hmi-type` quale oggetto
 * WinCC diventerà. "HMI e PLC" invece è la roba generica di prima, che va bene per una pagina web ma
 * non è conforme: quando lo standard copre tutto, quella categoria si può togliere. */
export type ComponentCategory = "Standard HMI" | "HMI e PLC" | "Base" | "Layout" | "Moduli" | "Dati" | "Web";

export interface EditorComponentDefinition {
  type: string;
  name: string;
  description: string;
  keywords?: string;
  category: ComponentCategory;
  icon: LucideIcon;
  defaultProps: Record<string, unknown>;
  createJsx: () => string;
}

const component = (
  type: string,
  name: string,
  description: string,
  category: ComponentCategory,
  icon: LucideIcon,
  jsx: string,
  keywords = "",
): EditorComponentDefinition => ({ type, name, description, category, icon, keywords, defaultProps: {}, createJsx: () => `  ${jsx}` });

const definitions: EditorComponentDefinition[] = [
  component("text", "Testo", "Scritta breve", "Base", Type, "<span>Nuovo testo</span>"),
  component("paragraph", "Paragrafo", "Blocco di testo", "Base", AlignLeft, "<p>Inserisci qui il testo.</p>"),
  component("heading", "Titolo", "Titolo di sezione", "Base", Heading, "<h2>Nuovo titolo</h2>"),
  component("button", "Pulsante", "Azione principale", "Base", MousePointerClick, "<button type=\"button\">Pulsante</button>"),
  component("secondary-button", "Pulsante secondario", "Azione meno importante", "Base", MousePointerClick, "<button type=\"button\" style={{ background: \"transparent\", color: \"#334155\", border: \"1px solid #94a3b8\", borderRadius: 8, padding: \"10px 16px\" }}>Azione</button>"),
  component("link", "Collegamento", "Apre una pagina o indirizzo", "Base", Link, "<a href=\"/pagina\">Apri pagina</a>", "pagina route"),
  component("image", "Immagine", "Immagine sostituibile", "Base", Image, "<img src=\"/placeholder.svg\" alt=\"Descrizione immagine\" style={{ width: 240, height: 160, objectFit: \"contain\" }} />"),
  component("badge", "Etichetta", "Stato o categoria", "Base", Bell, "<span style={{ display: \"inline-flex\", padding: \"4px 9px\", borderRadius: 999, background: \"#e0e7ff\", color: \"#3730a3\", fontSize: 12, fontWeight: 700 }}>ETICHETTA</span>", "badge pill"),
  component("divider", "Separatore", "Linea divisoria", "Base", Minus, "<hr style={{ width: \"100%\", border: 0, borderTop: \"1px solid #d8dee9\" }} />"),
  component("spacer", "Spazio", "Area vuota ridimensionabile", "Base", Box, "<div aria-hidden=\"true\" style={{ width: 80, height: 40 }}></div>"),

  component("container", "Contenitore", "Raggruppa elementi", "Layout", Box, "<div style={{ minWidth: 240, minHeight: 140, padding: 16, border: \"1px dashed #94a3b8\", borderRadius: 8 }}>Contenitore</div>"),
  component("section", "Sezione", "Area completa della pagina", "Layout", PanelTop, "<section style={{ width: \"100%\", minHeight: 220, padding: 24 }}><h2>Sezione</h2><p>Contenuto della sezione</p></section>"),
  component("row", "Riga", "Elementi affiancati", "Layout", List, "<div style={{ display: \"flex\", alignItems: \"center\", gap: 16 }}><div>Elemento 1</div><div>Elemento 2</div></div>"),
  component("stack", "Colonna", "Elementi uno sotto l'altro", "Layout", ListTree, "<div style={{ display: \"flex\", flexDirection: \"column\", gap: 12 }}><div>Elemento 1</div><div>Elemento 2</div></div>"),
  component("two-columns", "2 colonne", "Griglia a due colonne", "Layout", Columns3, "<div style={{ display: \"grid\", gridTemplateColumns: \"repeat(2, minmax(0, 1fr))\", gap: 16 }}><div>Colonna 1</div><div>Colonna 2</div></div>"),
  component("three-columns", "3 colonne", "Griglia a tre colonne", "Layout", Columns3, "<div style={{ display: \"grid\", gridTemplateColumns: \"repeat(3, minmax(0, 1fr))\", gap: 16 }}><div>Colonna 1</div><div>Colonna 2</div><div>Colonna 3</div></div>"),
  component("responsive-grid", "Griglia", "Griglia automatica di schede", "Layout", Grid3X3, "<div style={{ display: \"grid\", gridTemplateColumns: \"repeat(auto-fit, minmax(180px, 1fr))\", gap: 16 }}><article>Scheda 1</article><article>Scheda 2</article><article>Scheda 3</article></div>"),
  component("sidebar-layout", "Layout laterale", "Menu e contenuto", "Layout", PanelLeft, "<div style={{ display: \"grid\", gridTemplateColumns: \"220px 1fr\", minHeight: 360 }}><aside style={{ padding: 16, background: \"#172033\", color: \"white\" }}>Menu</aside><main style={{ padding: 24 }}>Contenuto</main></div>"),
  component("toolbar", "Barra strumenti", "Riga di comandi", "Layout", Wrench, "<div role=\"toolbar\" style={{ display: \"flex\", alignItems: \"center\", gap: 8, padding: 10, borderBottom: \"1px solid #d8dee9\" }}><button type=\"button\">Azione 1</button><button type=\"button\">Azione 2</button></div>"),
  component("dialog", "Finestra", "Pannello modale", "Layout", LayoutPanelTop, "<div role=\"dialog\" aria-modal=\"true\" aria-label=\"Finestra\" style={{ width: 360, padding: 20, borderRadius: 12, background: \"white\", boxShadow: \"0 18px 50px rgba(15,23,42,.25)\" }}><h3>Finestra</h3><p>Contenuto della finestra.</p><button type=\"button\">Conferma</button></div>"),

  component("input", "Campo testo", "Inserimento testo", "Moduli", TextCursorInput, "<input type=\"text\" placeholder=\"Inserisci valore\" />"),
  component("number-input", "Campo numero", "Inserimento numerico", "Moduli", TextCursorInput, "<input type=\"number\" defaultValue={0} />", "numero"),
  component("textarea", "Testo lungo", "Inserimento multilinea", "Moduli", AlignLeft, "<textarea placeholder=\"Inserisci testo\" rows={4}></textarea>"),
  component("select", "Menu a scelta", "Selezione da elenco", "Moduli", ListTree, "<select defaultValue=\"opzione-1\"><option value=\"opzione-1\">Opzione 1</option><option value=\"opzione-2\">Opzione 2</option></select>"),
  component("checkbox", "Casella", "Scelta sì o no", "Moduli", CheckSquare, "<label style={{ display: \"flex\", alignItems: \"center\", gap: 8 }}><input type=\"checkbox\" /> Opzione</label>"),
  component("radio", "Scelta singola", "Una scelta nel gruppo", "Moduli", CircleDot, "<label style={{ display: \"flex\", alignItems: \"center\", gap: 8 }}><input type=\"radio\" name=\"scelta\" /> Opzione</label>"),
  component("switch", "Interruttore", "Controllo acceso o spento", "Moduli", ToggleLeft, "<label style={{ display: \"flex\", alignItems: \"center\", gap: 8 }}><input type=\"checkbox\" role=\"switch\" /> Abilitato</label>", "toggle"),
  component("slider", "Cursore", "Valore regolabile", "Moduli", SlidersHorizontal, "<label style={{ display: \"grid\", gap: 6 }}>Valore<input type=\"range\" min=\"0\" max=\"100\" defaultValue=\"50\" /></label>", "range"),
  component("search", "Ricerca", "Campo per filtrare", "Moduli", Search, "<label style={{ display: \"flex\", alignItems: \"center\", gap: 8 }}><span>Ricerca</span><input type=\"search\" placeholder=\"Cerca...\" /></label>"),
  component("form-row", "Campo con etichetta", "Etichetta e input", "Moduli", FileText, "<label style={{ display: \"grid\", gap: 6 }}><span>Etichetta</span><input type=\"text\" placeholder=\"Valore\" /></label>"),

  component("nav-bar", "Barra navigazione", "Collegamenti principali", "Web", Navigation, "<nav aria-label=\"Navigazione principale\" style={{ display: \"flex\", gap: 18, padding: \"12px 18px\" }}><a href=\"/\">Home</a><a href=\"/pagina\">Pagina</a></nav>"),
  component("breadcrumbs", "Percorso", "Posizione nella navigazione", "Web", Navigation, "<nav aria-label=\"Percorso\"><ol style={{ display: \"flex\", gap: 8, listStyle: \"none\", padding: 0 }}><li><a href=\"/\">Home</a></li><li>/</li><li>Pagina</li></ol></nav>", "breadcrumb"),
  component("tabs", "Schede", "Navigazione tra pannelli", "Web", PanelTop, "<div role=\"tablist\" style={{ display: \"flex\", gap: 4, borderBottom: \"1px solid #cbd5e1\" }}><button type=\"button\" role=\"tab\" aria-selected=\"true\">Generale</button><button type=\"button\" role=\"tab\">Dettagli</button></div>"),
  component("back-button", "Torna indietro", "Ritorno alla pagina precedente", "Web", Navigation, "<button type=\"button\" onClick={() => history.back()}>← Torna indietro</button>"),
  component("pagination", "Paginazione", "Passa tra più pagine", "Web", Navigation, "<nav aria-label=\"Pagine\" style={{ display: \"flex\", gap: 6 }}><button type=\"button\">←</button><button type=\"button\">1</button><button type=\"button\">2</button><button type=\"button\">→</button></nav>"),

  component("card", "Scheda", "Contenitore con titolo", "Dati", LayoutPanelTop, "<article style={{ padding: 18, border: \"1px solid #d8dee9\", borderRadius: 10, background: \"white\" }}><h3>Scheda</h3><p>Contenuto della scheda.</p></article>"),
  component("stat-card", "Indicatore", "Numero con descrizione", "Dati", BarChart3, "<article style={{ minWidth: 180, padding: 16, borderRadius: 10, background: \"#f8fafc\" }}><small>Produzione</small><strong style={{ display: \"block\", fontSize: 28 }}>1.248</strong><span>pezzi</span></article>", "kpi valore"),
  component("table", "Tabella", "Dati in righe e colonne", "Dati", Table2, "<table style={{ width: \"100%\", borderCollapse: \"collapse\" }}><thead><tr><th>Nome</th><th>Valore</th><th>Stato</th></tr></thead><tbody><tr><td>Elemento</td><td>42</td><td>Attivo</td></tr></tbody></table>"),
  component("data-list", "Lista dati", "Elenco di valori", "Dati", List, "<ul><li>Elemento 1</li><li>Elemento 2</li><li>Elemento 3</li></ul>"),
  component("key-value", "Proprietà", "Nome e valore", "Dati", Database, "<dl style={{ display: \"grid\", gridTemplateColumns: \"1fr auto\", gap: \"8px 20px\" }}><dt>Velocità</dt><dd>1200 rpm</dd><dt>Temperatura</dt><dd>38 °C</dd></dl>"),
  component("alert", "Avviso", "Messaggio importante", "Dati", AlertTriangle, "<div role=\"alert\" style={{ padding: 14, border: \"1px solid #f59e0b\", borderRadius: 8, background: \"#fffbeb\", color: \"#92400e\" }}><strong>Attenzione</strong><p style={{ marginBottom: 0 }}>Controlla questa condizione.</p></div>"),
  component("empty-state", "Stato vuoto", "Messaggio senza dati", "Dati", FileText, "<div style={{ display: \"grid\", placeItems: \"center\", minHeight: 180, textAlign: \"center\" }}><strong>Nessun dato</strong><p>Qui compariranno i dati disponibili.</p></div>"),
  component("progress", "Avanzamento", "Percentuale completata", "Dati", Activity, "<label style={{ display: \"grid\", gap: 6 }}>Avanzamento<progress max=\"100\" value=\"64\" style={{ width: 240 }}>64%</progress></label>"),
  component("trend", "Grafico andamento", "Segnaposto per un trend", "Dati", Activity, "<figure style={{ margin: 0, width: 320 }}><svg viewBox=\"0 0 320 120\" role=\"img\" aria-label=\"Grafico andamento\" style={{ width: \"100%\", background: \"#f8fafc\", borderRadius: 8 }}><polyline points=\"10,95 60,72 110,80 165,38 220,55 310,18\" fill=\"none\" stroke=\"#4f46e5\" strokeWidth=\"4\" /></svg><figcaption>Andamento</figcaption></figure>", "chart"),

  component("plc-value", "Valore PLC", "Valore collegabile a una variabile", "HMI e PLC", Database, "<div data-hmi-type=\"HmiRectangle\" style={{ position: \"relative\", width: 220, height: 75, padding: 12, border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><span data-hmi-type=\"HmiTextBox\">Valore</span><output data-hmi-type=\"HmiIOField\" data-plc-variable=\"\" style={{ position: \"absolute\", right: 12, bottom: 10, fontSize: 24, fontWeight: 700 }}>0</output></div>", "tag segnale"),
  component("status-lamp", "Spia stato", "Indicatore colorato", "HMI e PLC", Zap, "<div data-hmi-type=\"HmiRectangle\" style={{ width: 220, height: 50, display: \"flex\", alignItems: \"center\", gap: 10, padding: \"0 12px\", border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><span data-hmi-type=\"HmiCircle\" data-plc-variable=\"\" aria-hidden=\"true\" style={{ width: 18, height: 18, borderRadius: \"50%\", background: \"#808080\", border: \"1px solid #91939A\" }} /><strong data-hmi-type=\"HmiTextBox\">Stato</strong></div>", "led semaforo"),
  component("machine-status", "Stato macchina", "Scheda riepilogo macchina", "HMI e PLC", Settings, "<article data-hmi-type=\"HmiRectangle\" style={{ width: 280, height: 150, padding: 16, border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><small data-hmi-type=\"HmiTextBox\" style={{ color: \"#B5BEC5\" }}>STATO MACCHINA</small><h3 data-hmi-type=\"HmiTextBox\" data-plc-variable=\"\" style={{ margin: \"14px 0 8px\", color: \"#F2F4FF\" }}>NON COLLEGATO</h3><p data-hmi-type=\"HmiTextBox\" style={{ margin: 0 }}>Modalità e velocità</p></article>"),
  component("command-button", "Comando PLC", "Pulsante per un comando", "HMI e PLC", Power, "<button type=\"button\" data-hmi-type=\"HmiButton\" data-plc-variable=\"\" style={{ minWidth: 148, height: 52, border: \"1px solid #7D7D85\", background: \"#404D53\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\", fontSize: 14, fontWeight: 700 }}>COMANDO</button>", "start stop"),
  component("alarm-banner", "Allarme", "Banner di allarme macchina", "HMI e PLC", AlertTriangle, "<div role=\"alert\" data-hmi-type=\"HmiRectangle\" data-plc-variable=\"\" style={{ width: 520, minHeight: 58, display: \"flex\", alignItems: \"center\", gap: 12, padding: \"10px 14px\", border: \"2px solid #7D7D85\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><strong data-hmi-type=\"HmiTextBox\">ALLARME</strong><span data-hmi-type=\"HmiTextBox\">Messaggio ricevuto dal PLC</span></div>"),
  component("gauge", "Indicatore analogico", "Valore entro un intervallo", "HMI e PLC", Gauge, "<label data-hmi-type=\"HmiGauge\" style={{ width: 240, height: 120, display: \"grid\", gap: 8, padding: 12, border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}>Valore<meter data-plc-variable=\"\" min=\"0\" max=\"100\" value=\"0\" style={{ width: \"100%\", accentColor: \"#00A1D1\" }}>0</meter><strong data-hmi-type=\"HmiTextBox\">0 unità</strong></label>", "meter"),
  component("circular-value", "Valore circolare", "Indicatore compatto", "HMI e PLC", CircleGauge, "<div data-hmi-type=\"HmiGauge\" data-plc-variable=\"\" style={{ width: 150, height: 150, display: \"grid\", placeContent: \"center\", textAlign: \"center\", border: \"12px solid #00A1D1\", borderRadius: \"50%\", background: \"#333333\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><strong data-hmi-type=\"HmiTextBox\" style={{ fontSize: 28 }}>0</strong><small data-hmi-type=\"HmiTextBox\">unità</small></div>", "gauge speed"),
  component("timer", "Tempo ciclo", "Tempo o durata", "HMI e PLC", Clock3, "<div data-hmi-type=\"HmiRectangle\" style={{ width: 220, height: 88, display: \"grid\", gap: 4, padding: 12, border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><small data-hmi-type=\"HmiTextBox\" style={{ color: \"#B5BEC5\" }}>TEMPO CICLO</small><strong data-hmi-type=\"HmiTextBox\" data-plc-variable=\"\" style={{ fontSize: 26 }}>00:00.0</strong></div>"),
  component("hmi-trend-control", "Trend Control Unified", "Fino a nove curve online o archiviate, organizzate in più aree con assi, soglie, zoom, righello ed export CSV.", "HMI e PLC", Activity, hmiTrendJsx(), "trend grafico andamento storico data log curve penne aree"),
  component("hmi-function-trend-control", "Function Trend X/Y", "Confronta due variabili o array: nove curve X/Y online o storiche, assi, soglie, zoom, righello e CSV.", "HMI e PLC", Activity, hmiFunctionTrendJsx(), "function trend xy funzione curve array confronto setpoint"),
  component("motor-control", "Controllo motore", "Stato e comandi motore", "HMI e PLC", Play, "<article data-hmi-type=\"HmiRectangle\" style={{ width: 300, padding: 16, border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><h3 data-hmi-type=\"HmiTextBox\">Motore</h3><p data-hmi-type=\"HmiTextBox\">Velocità: <strong data-hmi-type=\"HmiIOField\" data-plc-variable=\"\">0 rpm</strong></p><div style={{ display: \"flex\", gap: 8 }}><button type=\"button\" data-hmi-type=\"HmiButton\" data-plc-variable=\"\" style={{ width: 128, height: 50, border: \"1px solid #7D7D85\", background: \"#404D53\", color: \"#F2F4FF\" }}>Avvia</button><button type=\"button\" data-hmi-type=\"HmiButton\" data-plc-variable=\"\" style={{ width: 128, height: 50, border: \"1px solid #7D7D85\", background: \"#404D53\", color: \"#F2F4FF\" }}>Arresta</button></div></article>"),
  component("setpoint", "Setpoint", "Valore richiesto e reale", "HMI e PLC", SlidersHorizontal, "<label data-hmi-type=\"HmiRectangle\" style={{ width: 260, height: 112, display: \"grid\", gap: 7, padding: 12, border: \"1px solid #64646A\", background: \"#48494E\", color: \"#F2F4FF\", fontFamily: \"Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif\" }}><span data-hmi-type=\"HmiTextBox\">Setpoint</span><input data-hmi-type=\"HmiIOField\" data-plc-variable=\"\" type=\"number\" defaultValue=\"0\" style={{ height: 33, border: \"1px solid #7D7D85\", background: \"#333333\", color: \"#F2F4FF\", textAlign: \"right\" }} /><small data-hmi-type=\"HmiTextBox\">Valore reale: --</small></label>"),

  // I pezzi del pannello vero. Le misure sono quelle dello standard (`src/core/hmiStandard.ts`), non
  // arrotondamenti comodi: una riga di impostazione è 403x75 perché lo è nel progetto WinCC, e
  // `data-hmi-type` dice in quale oggetto `Hmi*` andrà tradotta.
  component("hmi-line", "Linea", "La HmiLine dello standard: nell'export e' larga 197 e alta 0, un filo. Qui e' alta 2 per poterla prendere.", "Standard HMI", Minus, hmiObjectJsx("hmi-line"), "linea separatore filo"),
  component("hmi-polygon", "Poligono", "Il quadrilatero 203x89 dei Pad delle pagine programma (2003). I punti si spostano dall'Inspector.", "Standard HMI", Square, hmiObjectJsx("hmi-polygon"), "poligono area pad"),
  component("hmi-circle", "Cerchio", "Il cerchio dello standard ha un raggio, non due lati: raggio 5, il punto che segna i riferimenti negli encoder.", "Standard HMI", CircleDot, hmiObjectJsx("hmi-circle"), "cerchio punto riferimento"),
  component("hmi-ellipse", "Ellisse", "L'ellisse ha due raggi: 159 e 45, come quella della 2042. Larga il doppio dei raggi.", "Standard HMI", CircleDot, hmiObjectJsx("hmi-ellipse"), "ellisse ovale"),
  component("hmi-touch-area", "Area touch", "L'area touch dello standard e' grande quanto la pagina, 1215x689: e' il tappeto che prende il tocco.", "Standard HMI", SquareMousePointer, hmiObjectJsx("hmi-touch-area"), "touch hotspot gesto tappeto"),
  component("hmi-faceplate", "Faceplate", "Il contenitore 80x80 dei trenta pacchi della 2002: si sceglie il faceplate e si collega l'interfaccia.", "Standard HMI", Box, hmiObjectJsx("hmi-faceplate"), "faceplate pack modulo"),
  component("hmi-symbolic-io", "Campo simbolico", "Il campo a scelta 187x45 delle pagine programma: un elenco di testi legato a un valore PLC.", "Standard HMI", ListTree, hmiObjectJsx("hmi-symbolic-io"), "symbolic io elenco scelta"),
  component("hmi-custom-widget", "Widget SVG", "Il DynamicSVG 151x47 della 2001: un disegno che cambia col valore.", "Standard HMI", Zap, hmiObjectJsx("hmi-custom-widget"), "custom widget svg dinamico"),
  component("hmi-web-control", "Contenuto web", "Il web control 1187x681 della 4041: nello standard punta alle dashboard Node-RED.", "Standard HMI", LayoutPanelTop, hmiObjectJsx("hmi-web-control"), "web control url node red"),
  component("hmi-data-grid", "Griglia statistiche allarmi", "Da solo il DataGrid non esiste: le uniche griglie sono dentro il controllo allarmi. Questa e' quella delle statistiche, con le sue otto colonne.", "Standard HMI", Table2, hmiObjectJsx("hmi-data-grid"), "data grid tabella statistiche"),
  component("hmi-bar", "Barra", "La HmiBar 171x58 della barra in alto.", "Standard HMI", BarChart3, hmiObjectJsx("hmi-bar"), "bar livello progress"),
  component("hmi-gauge", "Gauge", "Il gauge 130x184 della barra grande mobile.", "Standard HMI", Gauge, hmiObjectJsx("hmi-gauge"), "gauge analogico"),
  component("hmi-radio-group", "Scelta", "Il gruppo 154x69 della 2001: e' sempre di questa misura, tutte e tre le volte che compare.", "Standard HMI", CircleDot, hmiObjectJsx("hmi-radio-group"), "radio button group scelta"),
  component("hmi-alarm-control", "Lista allarmi", "Il controllo allarmi 1197x624, sempre a (16,55): sei colonne con le larghezze del JSON.", "Standard HMI", AlertTriangle, hmiObjectJsx("hmi-alarm-control"), "alarm control lista allarmi"),
  component("hmi-machine-callout", "Targhetta motore", "Mettila accanto allo screen della macchina, cambia M0000 col nome vero e collega azione e variabile PLC dall'Inspector.", "Standard HMI", Wrench, hmiObjectJsx("hmi-machine-callout"), "motore targhetta richiamo m2400 dispositivo organo"),
  component("hmi-callout-line", "Linea richiamo", "La linea tratteggiata 156x55 della 2081: collega la targhetta al punto giusto dello screen.", "Standard HMI", Minus, hmiObjectJsx("hmi-callout-line"), "linea tratteggiata targhetta motore richiamo"),
  component("hmi-layout-choice", "Scelta sessione", "La 0001_Choice: i due quadrati 170x170 che scelgono desktop o mobile, col logo e la riga di avviso. 1280x800.", "Standard HMI", Columns3, hmiShellJsx("hmi-layout-choice"), "guscio avvio scelta sessione"),
  component("hmi-desktop-shell", "Guscio desktop", "La 0000_Layout_PC: le quattro finestre (TopBar 1280x151, menu 80x649, pagina 1200x649, sottomenu).", "Standard HMI", LayoutPanelTop, hmiShellJsx("hmi-desktop-shell"), "layout shell pc finestre"),
  component("hmi-mobile-shell", "Guscio mobile", "La 0000_Layout_Mobile: barra piccola e barra grande sovrapposte, navigatore, pagina 1280x694 e low bar.", "Standard HMI", LayoutPanelTop, hmiShellJsx("hmi-mobile-shell"), "layout shell mobile finestre"),
  component("hmi-top-bar", "Top bar desktop", "La TopBar 1280x151: utente e orologio, l'ultimo allarme, le quattro linee col programma, modo e stato, e il logo che porta alle CLV.", "Standard HMI", PanelTop, hmiShellJsx("hmi-top-bar"), "barra intestazione desktop allarme programma"),
  component("hmi-lateral-bar", "Barra laterale", "La Lateral Bar 80x649: sette tessere 60x60 a passo 94, coi colori veri delle sezioni; ognuna apre il suo sottomenu.", "Standard HMI", PanelLeft, hmiShellJsx("hmi-lateral-bar"), "menu sezioni pc barra laterale"),
  component("hmi-mobile-top-bar", "Top bar mobile", "La TopBar_Light 1280x70: orologio, nome macchina, utente e il logo delle CLV.", "Standard HMI", PanelTop, hmiShellJsx("hmi-mobile-top-bar"), "mobile topbar"),
  component("hmi-mobile-bottom-bar", "Low bar mobile", "La LowBar 1280x50: tre pulsanti, quello in mezzo torna a Main_Mobile.", "Standard HMI", PanelTop, hmiShellJsx("hmi-mobile-bottom-bar"), "mobile lowbar footer"),
  component("hmi-info-point", "Linguetta comandi zona", "L'Info_Point 65x70: non e' un punto informativo, e' la linguetta che apre il popup dei comandi zona.", "Standard HMI", CircleDot, hmiShellJsx("hmi-info-point"), "mobile info comandi zona popup"),
  component("hmi-section-menu", "Sottomenu desktop", "Il 2xxxx_Settings_Template: pannello 210x290 con sette voci a passo 40, il triangolino e il velo che lo chiude.", "Standard HMI", ListTree, hmiShellJsx("hmi-section-menu"), "menu popup sezione sottomenu"),
  component("hmi-mobile-section-menu", "Menu sezione mobile", "Il 2xxxx_Settings_Template_1: le sezioni come nove quadrati 80x80 e lo stesso pannello 210x290 accanto.", "Standard HMI", Rows3, hmiShellJsx("hmi-mobile-section-menu"), "menu mobile sezione"),
  component("hmi-mobile-navigator", "Navigatore mobile", "Il 2xxxx_Settings_Template_Navigator 1280x64: tab 157x43 con la barretta 158x5 sotto quella attiva.", "Standard HMI", Navigation, hmiShellJsx("hmi-mobile-navigator"), "tab navigator mobile"),
  component("hmi-control-popup", "Popup comandi zona", "La 9001: scelta della zona, Start/Stop/Reset, selettore, avanti e indietro. 343x500 come nell'export.", "Standard HMI", SlidersHorizontal, hmiPopupJsx("hmi-control-popup"), "popup control panel zona start stop reset"),
  component("hmi-device-diagnostic-popup", "Popup diagnostica dispositivo", "La 9002: sei righe etichetta-valore, 670x250, quella che apre la diagnostica per dispositivo.", "Standard HMI", Wrench, hmiPopupJsx("hmi-device-diagnostic-popup"), "popup device diagnostic scheda"),
  component("hmi-document-viewer-popup", "Popup documento", "La 9003: un solo web control a tutta finestra, 1062x637, legato a PDF_Name o a un indirizzo.", "Standard HMI", FileText, hmiPopupJsx("hmi-document-viewer-popup"), "popup pdf web troubleshooting node red"),
  component("hmi-manual-popup", "Popup comandi manuali", "La 9004: il disegno del nastro e i due pulsanti che scelgono quale comandare. 426x300.", "Standard HMI", MousePointerClick, hmiPopupJsx("hmi-manual-popup"), "popup manuale nastro scelta"),
  component("hmi-alarm-loading-popup", "Caricamento allarmi", "La 9010: la schermata d'attesa intera, 1280x800, col logo in mezzo e il pulsante che rilancia la copia.", "Standard HMI", AlertTriangle, hmiPopupJsx("hmi-alarm-loading-popup"), "popup loading allarmi velo"),
  component("hmi-page-frame", "Cornice pagina", "La cornice 1214x681 con la fascia del titolo: bianca sul grigio, come le pagine vere.", "Standard HMI", Square, hmiObjectJsx("hmi-page-frame"), "pagina schermata contenuto cornice"),
  component("hmi-page-title", "Intestazione pagina", "La fascia bianca del titolo 1192x34 e i 3 px di grigio che la staccano dal corpo.", "Standard HMI", Heading, hmiObjectJsx("hmi-page-title"), "titolo header intestazione"),
  component("hmi-settings-row", "Riga impostazione", "La riga 403x75 della sezione Settings: etichetta a sinistra, campo a 348.", "Standard HMI", RectangleHorizontal, hmiObjectJsx("hmi-settings-row"), "settings impostazioni valore riga"),
  component("hmi-settings-toggle", "Riga interruttore", "La stessa riga 403x75 con l'interruttore al posto del campo: spento e' magenta, acceso verde.", "Standard HMI", ToggleLeft, hmiObjectJsx("hmi-settings-toggle"), "settings impostazioni on off interruttore"),
  component("hmi-settings-list", "Lista impostazioni", "Le sette righe a passo 78 della sezione Settings, gia' impaginate.", "Standard HMI", Rows3, hmiObjectJsx("hmi-settings-list"), "settings impostazioni elenco lista"),
  component("hmi-right-board", "Lastra destra", "La lastra 784x618 a (428,60) dove va il disegno della macchina.", "Standard HMI", LayoutPanelTop, hmiObjectJsx("hmi-right-board"), "sinottico zona lastra disegno"),
  component("hmi-folder-tabs", "Linguette", "Le linguette pilotate da Folder_Vis: stanno all'estremo destro, e il riquadro le porta gia' al posto giusto.", "Standard HMI", Folder, hmiObjectJsx("hmi-folder-tabs"), "cartelle tab folder linguette"),
  component("hmi-io-field", "Campo I/O", "Il campo numerico su una variabile: 186x32, la misura piu' comune dell'export.", "Standard HMI", TextCursorInput, hmiObjectJsx("hmi-io-field"), "iofield valore tag campo"),
  component("hmi-text-box", "Testo", "L'etichetta grigia sopra un controllo: nelle foto sta sempre sopra, mai a fianco.", "Standard HMI", Type, hmiObjectJsx("hmi-text-box"), "etichetta scritta testo"),
  component("hmi-button", "Pulsante", "Il pulsante scuro delle pagine, alto 44.", "Standard HMI", MousePointerClick, hmiObjectJsx("hmi-button"), "comando tasto pulsante"),
];

export const componentRegistry = {
  all: () => definitions,
  categories: (): ComponentCategory[] => ["Standard HMI", "HMI e PLC", "Base", "Layout", "Moduli", "Dati", "Web"],
  get: (type: string) => definitions.find((item) => item.type === type),
};
