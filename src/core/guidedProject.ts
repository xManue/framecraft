import type { StandardProjectSectionId } from "./standardProject";
import { standardPageSource, type StandardPagePlan } from "./hmiPages";
import { emptyAlarmCatalog, parseAlarmCatalog, type AlarmCatalog } from "./hmiAlarms";
import { isPlcVariableName, type PlcVariableDefinition } from "./plcVariables";
import { defaultHmiTrendConfig, serializeHmiTrendConfig } from "./hmiTrend";
import { guidedCommandAttributes, guidedCommandIssues, type GuidedCommandItem } from "./guidedCommands";
import { panelRequirementsIssues, panelRequirementsPending, type PanelRequirements } from "./panelRequirements";

export const guidedPageKinds = [
  { id: "overview", label: "Vista macchina / pagina principale", section: "main", image: "Foto o rendering della macchina intera", items: "Stati o contatori da mostrare" },
  { id: "synoptic", label: "Sinottico di una parte macchina", section: "diagnostic", image: "Screen della parte macchina, senza targhette", items: "Targhette dei motori o dispositivi (es. M2400)" },
  { id: "values", label: "Valori, contatori e parametri", section: "settings", image: "Schema del gruppo, se utile", items: "Nomi dei valori da mostrare" },
  { id: "commands", label: "Comandi manuali", section: "manuals", image: "Screen della stazione comandata", items: "Comandi necessari (es. Avanti, Indietro)" },
  { id: "alarms", label: "Allarmi attivi", section: "alarms", image: "", items: "" },
  { id: "history", label: "Storico allarmi", section: "alarms", image: "", items: "" },
  { id: "trend", label: "Grafico dei valori nel tempo", section: "statistics", image: "", items: "Nomi delle curve da mostrare" },
  { id: "recipes", label: "Ricette e formati · struttura da configurare", section: "formats", image: "", items: "" },
  { id: "production", label: "Produzione e KPI · struttura da configurare", section: "statistics", image: "", items: "" },
  { id: "maintenance", label: "Manutenzione · struttura da configurare", section: "diagnostic", image: "Schema del gruppo da manutenere", items: "" },
  { id: "reports", label: "Report e documenti · struttura da configurare", section: "statistics", image: "", items: "" },
  { id: "empty", label: "Pagina personalizzata da completare", section: "main", image: "Grafica di sfondo, se desiderata", items: "" },
] as const;
export type GuidedPageKind = (typeof guidedPageKinds)[number]["id"];
export const guidedItemLimit = (kind: GuidedPageKind) => kind === "trend" ? 9 : 12;
export interface GuidedItem extends GuidedCommandItem {}
export interface GuidedPage {
  id: string; title: string; section: StandardProjectSectionId; kind: GuidedPageKind;
  imageNeed: "required" | "optional" | "none"; image?: string; imageDeferred: boolean;
  items: GuidedItem[]; itemsDeferred: boolean;
}
export interface GuidedProjectSpec {
  version: 1; purpose: string; pages: GuidedPage[];
  tagsMode: "import" | "later" | "none"; tags: PlcVariableDefinition[]; tagsFile?: string;
  alarmsMode: "import" | "later"; alarms?: AlarmCatalog; alarmsFile?: string;
  protocol: "later" | "mqtt" | "opcua" | "simulation"; language: "it" | "en";
  users: "everyone" | "roles-later" | "later";
  requirements?: PanelRequirements;
}
const kindOf = (page: GuidedPage) => guidedPageKinds.find(kind => kind.id === page.kind)!;
const plain = (value: unknown, max: number) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function guidedProjectIssues(spec: GuidedProjectSpec): string[] {
  const issues: string[] = [];
  if (spec.version !== 1 || !plain(spec.purpose, 500) || !spec.purpose.trim()) issues.push("Spiega quale macchina o processo deve gestire il pannello.");
  if (!Array.isArray(spec.pages) || !spec.pages.length || spec.pages.length > 28) return [...issues, "Scegli da 1 a 28 pagine."];
  if (!["import", "later", "none"].includes(spec.tagsMode) || !["import", "later"].includes(spec.alarmsMode) || !["later", "mqtt", "opcua", "simulation"].includes(spec.protocol) || !["it", "en"].includes(spec.language) || !["everyone", "roles-later", "later"].includes(spec.users)) issues.push("Completa le scelte sui dati e sull’uso del pannello.");
  if (!Array.isArray(spec.tags) || spec.tags.length > 5000 || spec.tags.some(tag => !isPlcVariableName(tag.name) || !tag.dataType.trim() || !["read", "write", "read-write"].includes(tag.access)) || new Set(spec.tags.map(tag => tag.name)).size !== spec.tags.length) issues.push("Il catalogo tag contiene nomi duplicati, tipi mancanti o tag non validi.");
  if (spec.tagsMode === "import" && !spec.tags.length) issues.push("Inserisci la lista tag oppure scegli di collegarla più tardi.");
  if (new Set(spec.pages.map(page => page.id)).size !== spec.pages.length) issues.push("Le pagine hanno identificativi duplicati.");
  if (spec.requirements) issues.push(...panelRequirementsIssues(spec.requirements, spec.pages));
  if (spec.requirements?.answers["operations.mode"] === "monitor" && spec.pages.some(page => page.items.some(item => item.command))) issues.push("Comandi e sequenze: hai scelto solo monitoraggio, ma ci sono comandi di scrittura configurati. Rimuovili o cambia il requisito.");
  if (spec.users === "roles-later" && spec.requirements?.answers["users.identity"] === "none") issues.push("Utenti, ruoli e audit: i ruoli richiesti non sono compatibili con la scelta senza accesso. Scegli come identificare gli utenti o rimanda la scelta.");
  const counts = new Map<string, number>();
  for (const page of spec.pages) {
    if (!/^page-\d{1,2}$/.test(page.id) || !plain(page.title, 80) || !page.title.trim() || !kindOf(page) || !["main", "settings", "alarms", "statistics", "manuals", "diagnostic", "formats"].includes(page.section)) { issues.push("Completa nome, categoria e funzione di ogni pagina."); continue; }
    counts.set(page.section, (counts.get(page.section) ?? 0) + 1);
    if (!["required", "optional", "none"].includes(page.imageNeed) || typeof page.imageDeferred !== "boolean" || typeof page.itemsDeferred !== "boolean") issues.push(`${page.title}: completa le scelte sui contenuti.`);
    if (page.imageNeed === "required" && !page.image && !page.imageDeferred) issues.push(`${page.title}: scegli ${kindOf(page).image.toLowerCase()} o indica che lo inserirai dopo.`);
    if (page.image && (!plain(page.image, 2048) || !/\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(page.image))) issues.push(`${page.title}: scegli un’immagine supportata.`);
    if (!Array.isArray(page.items) || page.items.length > guidedItemLimit(page.kind) || page.items.some(item => !plain(item.label, 80) || !item.label.trim() || !plain(item.tag, 200))) issues.push(`${page.title}: inserisci al massimo ${guidedItemLimit(page.kind)} nomi brevi, uno per elemento.`);
    else if (page.kind === "commands") {
      for (const item of page.items) {
        issues.push(...guidedCommandIssues(item, spec.tagsMode === "import" ? spec.tags : []).map(issue => `${page.title}: ${item.label} · ${issue}`));
        if (spec.users === "roles-later" && item.command && !item.command.permission) issues.push(`${page.title}: ${item.label} · hai richiesto ruoli separati: scegli il permesso che abilita il comando.`);
        if (spec.users === "later" && item.command && !item.command.permission) issues.push(`${page.title}: ${item.label} · accesso non ancora definito: scegli un permesso reale o lascia il comando disabilitato.`);
      }
    } else if (page.items.some(item => item.tag && (spec.tagsMode !== "import" || !spec.tags.some(tag => tag.name === item.tag && tag.access !== "write")))) issues.push(`${page.title}: un collegamento non identifica un tag leggibile del catalogo importato.`);
    if (kindOf(page).items && !page.items.length && !page.itemsDeferred) issues.push(`${page.title}: indica ${kindOf(page).items.toLowerCase()} oppure scegli di completarli dopo.`);
  }
  if ([...counts.values()].some(count => count > 14)) issues.push("Una categoria dello standard contiene al massimo 14 voci: distribuisci le pagine in più categorie.");
  if (spec.pages.some(page => ["alarms", "history"].includes(page.kind)) && spec.alarmsMode === "import") {
    if (!spec.alarms) issues.push("Inserisci il catalogo allarmi oppure scegli di configurarlo più tardi.");
    else try { parseAlarmCatalog(spec.alarms, spec.tagsMode === "import" ? spec.tags : []); } catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }
  }
  return issues;
}
export function guidedProjectPending(spec: GuidedProjectSpec): string[] {
  const pending = spec.pages.flatMap(page => [
    ...(page.imageNeed !== "none" && !page.image ? [`${page.title}: immagine da inserire.`] : []),
    ...(page.itemsDeferred && !page.items.length ? [`${page.title}: elementi da definire.`] : []),
    ...(["recipes", "production", "maintenance", "reports"].includes(page.kind) ? [`${page.title}: creata soltanto la struttura; dati, funzioni e collegamenti da implementare e collaudare.`] : []),
    ...page.items.filter(item => !item.tag && page.kind !== "commands").map(item => `${page.title} · ${item.label}: tag non collegato.`),
    ...(page.kind === "commands" ? page.items.length ? page.items.map(item => item.command && !guidedCommandIssues(item, spec.tagsMode === "import" ? spec.tags : []).length
      ? `${page.title} · ${item.label}: mapping configurato; collegamento, interlock e collaudo da verificare.${item.command.permission ? " Account e permesso richiesto da configurare; senza permesso il comando resta bloccato." : ""}`
      : `${page.title} · ${item.label}: comando disabilitato, da configurare e collaudare.`) : [`${page.title}: comandi disabilitati, da configurare e collaudare.`] : []),
  ]);
  if (spec.tagsMode !== "import") pending.push("Tag PLC e collegamenti da configurare: nessun tag inventato.");
  if (spec.pages.some(page => ["alarms", "history"].includes(page.kind)) && spec.alarmsMode !== "import") pending.push("Catalogo e condizioni di attivazione degli allarmi da configurare.");
  if (spec.pages.some(page => page.kind === "history")) pending.push("Lo storico allarmi è di sessione; archivio persistente da progettare prima del rilascio.");
  pending.push(`Connessione ${spec.protocol === "later" ? "PLC" : spec.protocol.toUpperCase()} da configurare: nessun collegamento avviato.`);
  if (spec.users === "roles-later") pending.push("Ruoli, permessi e autenticazione server da configurare.");
  if (spec.users === "later") pending.push("Accesso e autorizzazioni da definire: nessun permesso scelto dall’AI; comandi senza permesso reale disabilitati.");
  if (spec.language === "en") pending.push("Traduzioni inglesi dell’interfaccia e dei messaggi da completare.");
  if (spec.requirements) pending.push(...panelRequirementsPending(spec.requirements, spec.pages.map(page => page.kind)));
  return pending;
}
const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
function at(left: number, top: number, width: number, height: number) { return `position: "absolute", left: ${left}, top: ${top}, width: ${width}, height: ${height}`; }
export function guidedPageSource(page: GuidedPage, plan: StandardPagePlan, componentName: string, imageUrl?: string, tags: readonly PlcVariableDefinition[] = [], requirements?: PanelRequirements): string {
  let body = `      <h1 data-hmi-type="HmiTextBox" style={{ ${at(32, 20, 1150, 40)}, margin: 0, fontSize: 26 }}>{${literal(page.title)}}</h1>\n`;
  const image = page.imageNeed !== "none" && !["alarms", "history", "trend"].includes(page.kind);
  if (image) body += `      <img data-hmi-type="HmiGraphicView" data-image-role="part" src=${literal(imageUrl ?? "/placeholder.svg")} alt=${literal(kindOf(page).image)} style={{ ${at(32, 76, 790, 530)}, objectFit: "contain", border: "1px dashed #A8A8A8" }} />\n`;
  if (["alarms", "history"].includes(page.kind)) body += `      <div data-hmi-type="HmiAlarmControl" data-hmi-alarm-source=${literal(page.kind === "history" ? "history" : "active")} data-hmi-alarm-filter="" style={{ ${at(32, 76, 1140, 530)}, overflow: "auto", background: "white" }}>Nessun dato allarmi disponibile: configura catalogo e collegamento PLC.</div>\n`;
  else if (page.kind === "trend") {
    const config = defaultHmiTrendConfig();
    const range = requirements?.answers["trends.range"], sample = requirements?.answers["trends.sample"];
    if (["60000", "600000", "3600000", "28800000", "86400000"].includes(range ?? "")) config.timeRangeMs = Number(range);
    if (["1000", "5000", "10000", "60000"].includes(sample ?? "")) config.sampleIntervalMs = Number(sample);
    if (page.items.length) config.trends = page.items.map((item, index) => ({ ...config.trends[0], id: `curve-${index + 1}`, name: item.label, tag: item.tag, source: "online" as const, color: ["#2388CC", "#CC5623", "#26A269", "#9141AC"][index % 4] }));
    body += `      <div data-hmi-type="HmiTrendControl" data-hmi-trend={${literal(serializeHmiTrendConfig(config))}} style={{ ${at(32, 76, 1140, 530)}, background: "#F7F8F9" }}>Configura le curve e il collegamento PLC dall’Inspector.</div>\n`;
  } else if (["recipes", "production", "maintenance", "reports"].includes(page.kind)) {
    body += `      <p data-hmi-type="HmiTextBox" style={{ ${at(image ? 850 : 32, 92, image ? 320 : 1100, 160)}, padding: 16, background: "white", border: "1px dashed #A8A8A8" }}>Struttura da completare: questa funzione non è ancora configurata. Consulta i requisiti raccolti e aggiungi dati, controlli e collegamenti nell’editor. Nessun comando o dato macchina inventato.</p>\n`;
  } else {
    page.items.forEach((item, index) => {
      const left = image ? 850 : 32 + index % 3 * 380, top = image ? 76 + index * 44 : 76 + Math.floor(index / 3) * 112;
      if (page.kind === "commands") body += `      <button type="button"${guidedCommandAttributes(item, tags)} data-hmi-type="HmiButton" style={{ ${at(left, top, image ? 320 : 350, 44)}, border: "1px solid #A8A8A8", borderRadius: 5, background: "#DDD", color: "#555" }}>{${literal(item.label)}}</button>\n`;
      else {
        const width = image ? 320 : 350;
        body += `      <div data-hmi-type="HmiRectangle" style={{ ${at(left, top, width, 38)}, padding: 8, background: "white", border: "1px solid #A8A8A8" }}><span data-hmi-type="HmiTextBox">{${literal(item.label)}}</span>${item.tag ? `: <span data-hmi-type="HmiTextBox" data-plc-variable=${literal(item.tag)} data-hmi-dynamizations={${literal(JSON.stringify([{ kind: "Tag", property: "Text", tag: item.tag }]))}}>—</span>` : ""}</div>\n`;
      }
    });
  }
  const source = standardPageSource({ componentName, title: "Pagina guidata", plan, templateId: "blank" });
  return source.replace('data-hmi-template-id="standard:blank"', `data-hmi-template-id="guided:${page.kind}"`).replace(/^.*data-plc-variable="Folder_Vis".*\r?\n/gm, "").replace("    </section>", `${body}    </section>`);
}
export function guidedAlarmCatalog(spec: GuidedProjectSpec): AlarmCatalog {
  return spec.alarmsMode === "import" && spec.alarms ? parseAlarmCatalog(spec.alarms, spec.tagsMode === "import" ? spec.tags : []) : emptyAlarmCatalog();
}
