import { panelSize } from "./hmiStandard";
import { defaultHmiTrendConfig } from "./hmiTrend";
import { defaultHmiFunctionTrendConfig } from "./hmiFunctionTrend";

export interface TemplateInput { kind: "image" | "tags" | "alarms" | "commands" | "permissions" | "content" | "routing" | "service" | "recipes"; label: string }
export interface TemplateBehavior {
  version: 1; id: string; purpose: string; implementation: "configured-inputs" | "structure-only" | "standard-reference";
  known: readonly string[]; inputs: readonly TemplateInput[]; limits: readonly string[];
  defaults: Readonly<Record<string, string>>;
}
const input = (kind: TemplateInput["kind"], label: string): TemplateInput => ({ kind, label });
const tags = input("tags", "Catalogo reale e scelta del tag per ciascun valore; unità, limiti e significato non si deducono dal nome.");
const image = input("image", "Immagine reale della macchina o della parte, se richiesta; nessuna foto inventata.");
const noPlc = "Creare o aprire la pagina non collega un PLC e non invia comandi.";
const unsupported = "È una struttura da completare, non una funzione operativa già implementata.";
function guided(id: string, purpose: string, known: readonly string[], inputs: readonly TemplateInput[], limits: readonly string[], defaults: Readonly<Record<string, string>> = {}, structure = false): TemplateBehavior {
  return { version: 1, id: `guided:${id}`, purpose, implementation: structure ? "structure-only" : "configured-inputs", known, inputs, limits: [...limits, noPlc], defaults };
}
function buildGuidedTemplateBehaviors(): Record<string, TemplateBehavior> {
  const trend = defaultHmiTrendConfig();
  const xy = defaultHmiFunctionTrendConfig();
  return {
    overview: guided("overview", "Vista generale della macchina con stati e contatori scelti.", ["Titolo, immagine richiesta/facoltativa e valori leggibili sono elementi separati e modificabili."], [image, tags], ["Nessuno stato di produzione o contatore viene dedotto o inventato."]),
    synoptic: guided("synoptic", "Vista di una parte macchina con targhette dei motori o dispositivi.", ["Le targhette non fanno parte della foto: si possono spostare nell’editor.", "Il posizionamento iniziale è affiancato all’immagine; non vengono creati hotspot o popup automatici."], [image, input("content", "Nomi reali dei motori/dispositivi da etichettare."), tags], ["Nessuna azione viene associata a una targhetta dal solo nome."]),
    values: guided("values", "Mostrare valori, contatori o parametri di macchina.", ["Valori inizialmente non disponibili (—), letti dai tag esplicitamente scelti.", "Questa base mostra letture, non campi che scrivono parametri nel PLC."], [tags, image], ["Per modificare un parametro serve un comando di scrittura configurato separatamente."]),
    commands: guided("commands", "Pulsanti per comandi manuali con mapping esplicito.", ["I pulsanti non configurati sono disabilitati.", "Una scrittura singola richiede evento operatore, tag scrivibile, valore compatibile, permesso e conferma del mapping."], [input("content", "Nomi dei comandi realmente necessari."), tags, input("commands", "Evento, tag, valore e conferma per ciascuna scrittura."), input("permissions", "Permesso e consensi previsti dalla macchina."), image], ["Pressione/rilascio, uomo presente e sequenze non sono generati.", "Ricevuta del trasporto non significa conferma PLC; interlock, watchdog e autorizzazioni server restano separati."]),
    alarms: guided("alarms", "Mostrare gli allarmi attivi usando il controllo allarmi del Runtime.", ["La sorgente è allarmi attivi, non lo storico.", "Messaggi, classi e trigger provengono dal catalogo importato, non dall’AI."], [tags, input("alarms", "Catalogo allarmi con segnali e condizioni reali, oppure rinvio esplicito.")], ["Conferme, priorità e istruzioni dipendono dal catalogo; non si inventano condizioni di attivazione."]),
    history: guided("history", "Consultare gli eventi dello storico allarmi.", ["La sorgente del controllo è lo storico, non gli allarmi attivi.", "La conservazione iniziale è di sessione."], [tags, input("alarms", "Catalogo reale e requisiti di archiviazione oltre la sessione.")], ["La pagina non crea un archivio industriale persistente."], { "alarms.history": "session" }),
    trend: guided("trend", "Mostrare l’andamento nel tempo dei valori scelti.", ["Curve online o da Data Log importati, collegate alle sorgenti selezionate; nomi e colori restano modificabili.", "Intervallo e campionamento sono configurati dalla procedura; il campionamento del grafico non è il polling del gateway."], [tags, input("content", "Nomi delle curve e tag leggibili da mostrare.")], ["Il catalogo Data Log importato conserva i propri limiti; database industriali, retention e curve X/Y non sono creati automaticamente."], { "trends.range": String(trend.timeRangeMs), "trends.sample": String(trend.sampleIntervalMs), "trends.source": "online", "trends.retention": "session" }),
    "function-trend": guided("function-trend", "Mostrare una misura Y in funzione di una misura X, non del tempo.", ["Fino a nove curve, ognuna con tag X e Y scelti separatamente e sorgenti online o Data Log importati.", "Assi lineari con intervallo automatico; campionamento e finestra temporale dei campioni sono configurati dalla procedura.", `Tolleranza di abbinamento iniziale del controllo: ${xy.trends[0].pairToleranceMs} ms, modificabile nell’Inspector; non è una garanzia di sincronismo PLC.`], [tags, input("content", "Nome delle curve e due tag numerici scalari leggibili per ognuna.")], ["Array, UDT, scale, unità, soglie e database industriali non sono configurati dalla procedura.", "Acquisizione, timestamp, qualità e abbinamento vanno collaudati sulle sorgenti reali."], { "trends.range": String(xy.trends[0].range.durationMs), "trends.sample": String(xy.sampleIntervalMs), "trends.source": "online", "trends.retention": "session" }),
    recipes: guided("recipes", "Predisporre una pagina per ricette e formati.", ["Titolo e avviso esplicito che la funzione va completata."], [input("recipes", "Schema, valori reali, limiti, permessi e handshake PLC della ricetta.")], [unsupported], {}, true),
    production: guided("production", "Predisporre una pagina per produzione e KPI.", ["Non vengono calcolati o mostrati indicatori fittizi."], [input("content", "Segnali, formule, finestre temporali e reset degli indicatori.")], [unsupported], {}, true),
    maintenance: guided("maintenance", "Predisporre una pagina per manutenzione.", ["Immagine del gruppo facoltativa e area da completare."], [image, input("content", "Parti, scadenze, contatori, consensi e reset reali.")], [unsupported], {}, true),
    reports: guided("reports", "Predisporre una pagina per report e documenti.", ["Nessun PDF, database o invio programmato viene attivato."], [input("content", "Dati, formati, destinatari e documenti disponibili.")], [unsupported], {}, true),
    empty: guided("empty", "Pagina personalizzata da costruire nell’editor.", ["Cornice e titolo, con eventuale immagine scelta."], [input("content", "Contenuti e comportamenti aggiuntivi desiderati."), image], ["Non contiene una funzione macchina già definita."], {}, true),
  };
}
const guidedBehaviors = buildGuidedTemplateBehaviors();
export function guidedTemplateBehaviors(): Readonly<Record<string, TemplateBehavior>> { return guidedBehaviors; }
export function guidedTemplateBehavior(kind: string): TemplateBehavior | undefined { return Object.hasOwn(guidedBehaviors, kind) ? guidedBehaviors[kind] : undefined; }
export function inheritedTemplateAnswers(pageKinds: readonly string[]): Record<string, string> {
  if (!pageKinds.length) return {};
  return { "device.resolution": `${panelSize.width}x${panelSize.height}`, "device.theme": "standard", "navigation.menu": "categories", ...Object.assign({}, ...pageKinds.map(kind => guidedTemplateBehavior(kind)?.defaults ?? {})) };
}

interface StandardTemplateDescription { id: string; name: string; description: string; setupHint?: string }
const emptyStandard = new Set(["blank", "machine-downstair", "main-counters", "main-collector-counters", "main-free", "main-maintenance", "diagnostic-robot", "diagnostic-maintenance", "diagnostic-profinet", "diagnostic-free"]);
export function standardTemplateBehavior(template: StandardTemplateDescription): TemplateBehavior {
  const id = template.id;
  const base = { version: 1 as const, id: `standard:${id}`, purpose: `${template.name}: ${template.description}`, defaults: {} };
  const limits = ["Questa scheda descrive la base dello standard, non un collaudo della macchina o del codice modificato.", "Binding, eventi, indirizzi e dati del progetto di riferimento devono essere verificati/adattati alla propria macchina; nessuna autorizzazione PLC deriva dalla scelta del template."];
  if (emptyStandard.has(id)) return { ...base, implementation: "structure-only", known: ["Cornice vuota e sola navigazione eventualmente prevista dalla variante."], inputs: [input("content", "Elementi e comportamenti da aggiungere, senza presumere contatori o diagnostica già presenti.")], limits: [unsupported, ...limits] };
  let known: string[], inputs: TemplateInput[];
  if (id === "data-board") { known = ["Lastra bianca e titolo, da riempire manualmente."]; inputs = [input("content", "Campi e funzioni da inserire.")]; }
  else if (/^(web-content|media|statistics)/.test(id)) { known = ["Contenuto web incorporato: il template non implementa da solo il servizio esterno né calcola KPI."]; inputs = [input("service", "Servizio web reale, raggiungibilità, contenuti e accessi da configurare."), image]; }
  else if (/^alarm/.test(id)) { known = [id === "alarm-history" ? "Controllo storico con filtro e comandi del log." : "Controllo allarmi attivi con filtri e comandi della variante."]; inputs = [tags, input("alarms", "Catalogo e condizioni reali, conferme e archivio richiesti.")]; }
  else if (id === "encoder-index" || id === "clv-index" || id === "machine-map" || id === "command-grid") { known = ["Scelta di una pagina o stazione mediante piastrelle, aree o linguette."]; inputs = [input("routing", "Destinazioni effettive delle pagine e stazioni da configurare."), image]; }
  else if (id.startsWith("program-") || id.startsWith("clv-")) { known = ["Schede e campi del programma o gruppo indicato, con i binding/eventi presenti nella variante esportata."]; inputs = [tags, input("content", "Parametri, unità, limiti e programma reale da modificare."), input("permissions", "Permessi e condizioni per modificare i parametri.")]; }
  else if (/^(manual-|motor-speed|robot-function|special-function)/.test(id)) { known = ["Screen della parte macchina; soltanto i controlli effettivamente predisposti dalla variante.", "Targhette, popup e comandi mancanti vanno aggiunti/configurati: non si deducono dai nomi."]; inputs = [image, tags, input("commands", "Organi e azioni realmente necessari, con mapping e consensi.")]; }
  else if (/^(synoptic|diagnostic-zone|device-diagnostic)/.test(id)) { known = ["Rendering con i collegamenti diagnostici/faceplate presenti nel riferimento."]; inputs = [image, tags, input("routing", "Destinazioni diagnostiche e interfacce dei faceplate da adattare.")]; }
  else if (/^(format-|pallet-selection)/.test(id)) { known = ["Schede di selezione, gestione o copia di formati/pallet della variante."]; inputs = [input("recipes", "Dati formato/pallet, sorgente/destinazione, regole e conferme reali."), tags, input("permissions", "Permessi di copia/modifica.")]; }
  else if (/^(encoder-|device-control|motor-box-control|motor-control|lubrification)/.test(id)) { known = ["Stati, parametri, selezioni e comandi dichiarati dalla pagina di riferimento."]; inputs = [tags, image, input("commands", "Comandi/interlock e conferme reali; verificare anche pressione/rilascio ove presenti.")]; }
  else if (id === "system-function") { known = ["Scelte di lingua e comandi sistema presenti nella variante."]; inputs = [input("content", "Lingue, risorse e adattamento dei comandi al Runtime React.")]; limits.push("Le funzioni native WinCC non diventano automaticamente funzioni del browser."); }
  else if (id === "production-overview") { known = ["Diagramma e indicazione dei modi/stati OMAC/PackML, non esecuzione automatica delle transizioni."]; inputs = [tags, input("content", "Contratto dei codici stato/modo della macchina.")]; }
  else { known = ["Contenuto descritto dalla variante; eventuali comandi non implicano un mapping pronto per un’altra macchina."]; inputs = [image, tags, input("content", "Configurazione specifica della macchina.")]; }
  if (template.setupHint) inputs.push(input("content", template.setupHint));
  return { ...base, implementation: "standard-reference", known, inputs, limits };
}
