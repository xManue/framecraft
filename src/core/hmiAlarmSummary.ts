import { alarmStateLabel, type AlarmCommand, type AlarmRow, type AlarmSnapshot } from "../../runtime/alarm-engine.mjs";
import { createHmiAlarmControl, hmiAlarmElementBlocked } from "./hmiAlarmControl";

export const hmiAlarmSummaryAttribute = "data-hmi-alarm-summary";
export type HmiAlarmSummaryKind = "indicator" | "line";
export interface HmiAlarmSummaryConfig {
  version: 1; caption: string; classes: string[]; areas: string[]; minPriority: number;
  mode: "pending" | "active" | "unacknowledged"; order: "latest" | "priority"; rows: number;
  display: "icon-text" | "icon" | "text"; showAlways: boolean; flash: boolean; openDetails: boolean;
  alarmColor: string; normalColor: string; timeZone: "local" | "UTC"; pageRoute?: string;
}
export function defaultHmiAlarmSummaryConfig(kind: HmiAlarmSummaryKind = "indicator"): HmiAlarmSummaryConfig {
  return { version: 1, caption: kind === "line" ? "Allarmi in evidenza" : "Allarmi", classes: [], areas: [], minPriority: 0,
    mode: kind === "line" ? "active" : "pending", order: "latest", rows: 1, display: "icon-text", showAlways: true, flash: false,
    openDetails: kind === "indicator", alarmColor: "#FACC15", normalColor: "#86EFAC", timeZone: "local" };
}
export function hmiAlarmSummaryIssues(value: unknown, routes?: readonly string[]): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Il riepilogo allarmi deve essere una configurazione JSON valida."];
  const c = value as HmiAlarmSummaryConfig, issues: string[] = [];
  const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && v.length <= max && !/[\x00-\x1f]/.test(v);
  if (Object.keys(c).some((key) => !["version", "caption", "classes", "areas", "minPriority", "mode", "order", "rows", "display", "showAlways", "flash", "openDetails", "alarmColor", "normalColor", "timeZone", "pageRoute"].includes(key))) issues.push("Proprietà del riepilogo non supportata.");
  if (c.version !== 1 || !text(c.caption, 120)) issues.push("Compila un titolo di massimo 120 caratteri e usa la versione 1.");
  for (const key of ["classes", "areas"] as const) if (!Array.isArray(c[key]) || c[key].length > 100 || c[key].some((v) => !text(v, 200)) || new Set(c[key]).size !== c[key].length) issues.push("Classi e zone devono essere nomi unici; una lista vuota include tutte.");
  if (!Number.isInteger(c.minPriority) || c.minPriority < 0 || c.minPriority > 255) issues.push("Priorità minima: intero da 0 a 255.");
  if (!["pending", "active", "unacknowledged"].includes(c.mode) || !["latest", "priority"].includes(c.order) || !["icon-text", "icon", "text"].includes(c.display) || !["local", "UTC"].includes(c.timeZone)) issues.push("Scegli modalità, ordine, contenuto e fuso orario supportati.");
  if (!Number.isInteger(c.rows) || c.rows < 1 || c.rows > 3) issues.push("La riga allarmi mostra da uno a tre allarmi.");
  if ([c.showAlways, c.flash, c.openDetails].some((v) => typeof v !== "boolean")) issues.push("Visibilità, lampeggio e dettagli devono essere espliciti.");
  if ([c.alarmColor, c.normalColor].some((v) => typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v))) issues.push("Colori: usa un valore esadecimale #RRGGBB.");
  if (c.pageRoute !== undefined && (typeof c.pageRoute !== "string" || !/^\/[A-Za-z0-9/_-]*$/.test(c.pageRoute) || c.pageRoute.startsWith("//") || routes && !routes.includes(c.pageRoute))) issues.push("La pagina collegata deve essere una destinazione interna presente nel progetto.");
  return issues;
}
export function parseHmiAlarmSummaryConfig(value: unknown): HmiAlarmSummaryConfig | undefined {
  try { const c = typeof value === "string" ? JSON.parse(value) : value; return hmiAlarmSummaryIssues(c).length ? undefined : structuredClone(c); } catch { return undefined; }
}
export function serializeHmiAlarmSummaryConfig(config: HmiAlarmSummaryConfig): string { return JSON.stringify(config); }
export const alarmSummaryFilter = (row: AlarmRow, c: HmiAlarmSummaryConfig) => (!c.classes.length || c.classes.includes(row.className)) && (!c.areas.length || c.areas.includes(row.area ?? "")) && row.priority >= c.minPriority;
export const alarmSummaryMode = (row: AlarmRow, c: HmiAlarmSummaryConfig) => c.mode === "active" ? row.active === true : c.mode === "unacknowledged" ? row.pending && row.acknowledgment !== "none" && !row.acknowledged : row.pending;
export function hmiAlarmSummaryView(snapshot: AlarmSnapshot | undefined, config: HmiAlarmSummaryConfig, available = true) {
  const rows = (snapshot?.rows ?? []).filter((row) => alarmSummaryFilter(row, config));
  const pending = rows.filter((r) => r.pending).length, active = rows.filter((r) => r.active === true).length;
  const unacknowledged = rows.filter((r) => r.pending && r.acknowledgment !== "none" && !r.acknowledged).length;
  const unconfirmed = rows.filter((r) => r.pending && r.acknowledgment === "reset" && r.active === false && r.acknowledged && !r.confirmed).length;
  const invalid = rows.filter((r) => r.quality !== "good" || r.active === null).length;
  const selected = rows.filter((row) => alarmSummaryMode(row, config)).sort((a, b) => (config.order === "priority" ? b.priority - a.priority : 0) || (b.activatedAt ?? 0) - (a.activatedAt ?? 0) || a.id.localeCompare(b.id)).slice(0, config.rows);
  const count = config.mode === "active" ? active : config.mode === "unacknowledged" ? unacknowledged : pending;
  const known = available && !!snapshot && rows.length > 0 && invalid === 0;
  const message = !available || !snapshot ? "Servizio non disponibile · dati non aggiornati" : !rows.length ? "Nessun allarme configurato per questi filtri" : invalid ? invalid + " segnali non validi o sconosciuti" : pending ? pending + " allarmi da gestire" : "Nessun allarme pendente · segnali validi";
  return { rows, selected, pending, active, unacknowledged, unconfirmed, invalid, count, known, message,
    state: !available || !snapshot || !rows.length ? "unknown" : pending ? "alarm" : invalid ? "unknown" : "normal",
    hidden: !config.showAlways && known && pending === 0 };
}

export function hmiAlarmSummaryJsx(kind: HmiAlarmSummaryKind): string {
  const config = serializeHmiAlarmSummaryConfig(defaultHmiAlarmSummaryConfig(kind));
  return `<div data-hmi-type="${kind === "line" ? "HmiAlarmLine" : "HmiAlarmIndicator"}" ${hmiAlarmSummaryAttribute}='${config}' style={{ width: ${kind === "line" ? 640 : 300}, height: ${kind === "line" ? 160 : 180}, padding: 12, border: "1px solid #64646A", borderRadius: 6, background: "#333333", color: "#F2F4FF", fontFamily: "Siemens Sans, SiemensSans, Segoe UI, Arial, sans-serif", fontSize: 16 }}>Configura ${kind === "line" ? "la riga" : "l'indicatore"} in PLC e dati. In attesa dei segnali allarme.</div>`;
}

const css = `[data-hmi-alarm-summary-content][hidden]{display:none}[data-hmi-alarm-summary-content]{height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;overflow:auto;line-height:1.4}[data-hmi-alarm-summary-content] button{min-height:44px;padding:6px 10px;font:inherit;background:#252d39;color:#fff;border:1px solid #8894a4;border-radius:4px;cursor:pointer}[data-hmi-alarm-summary-content] button:focus-visible,[data-hmi-alarm-popup] :focus-visible{outline:2px solid #6bc6ff;outline-offset:2px}[data-hmi-alarm-summary-content] svg{width:28px;height:28px;flex-shrink:0}[data-hmi-alarm-flash]{animation:framecraft-alarm-attention 1s steps(2,jump-none) infinite}@keyframes framecraft-alarm-attention{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){[data-hmi-alarm-flash]{animation:none}}[data-hmi-alarm-popup]{position:fixed;inset:0;z-index:1600;display:grid;place-items:center;padding:12px;background:#000a}[data-hmi-alarm-popup] section{box-sizing:border-box;width:min(1000px,100%);height:min(650px,calc(100dvh - 24px));display:flex;flex-direction:column;gap:12px;padding:16px;background:#181e28;color:#edf3fb;border:1px solid #64748b;border-radius:8px;font:16px Segoe UI,Arial,sans-serif}[data-hmi-alarm-popup] header{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}[data-hmi-alarm-popup] h2{font-size:20px;margin:0}[data-hmi-alarm-popup] button{min-height:44px;padding:6px 12px;font:inherit;cursor:pointer}[data-hmi-alarm-popup] button:disabled{cursor:not-allowed;opacity:.55}`;
export function createHmiAlarmSummary(host: HTMLElement, options: { action(command: AlarmCommand): Promise<void>; navigate?(route: string): void; routes?: readonly string[] }) {
  const doc = host.ownerDocument, original = [...host.childNodes], marker = host.getAttribute("data-hmi-alarm-summary-root");
  host.dataset.hmiAlarmSummaryRoot = "";
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, value?: string) => { const node = doc.createElement(tag); if (value !== undefined) node.textContent = value; return node; };
  const root = make("div"), style = make("style", css), content = make("div"), status = make("div"), body = make("div"), details = make("button", "Mostra allarmi");
  root.dataset.hmiAlarmSummaryContent = ""; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); details.type = "button"; root.append(style, content, status, body, details); host.replaceChildren(root);
  let snapshot: AlarmSnapshot | undefined, available = false, disposed = false, signature = "", configKey: string | null | undefined;
  let config: HmiAlarmSummaryConfig | undefined, popup: { overlay: HTMLDivElement; control: ReturnType<typeof createHmiAlarmControl>; close(): void } | undefined;
  const blocked = () => hmiAlarmElementBlocked(host);
  const closePopup = () => popup?.close();
  const filtered = (row: AlarmRow) => !!config && alarmSummaryFilter(row, config) && (alarmSummaryMode(row, config) || row.quality !== "good");
  const openPopup = () => {
    if (popup || disposed || blocked() || !config || !snapshot || !config.openDetails) return;
    const before = doc.activeElement as HTMLElement | null, overlay = make("div"), panel = make("section"), header = make("header"), title = make("h2", config.caption), close = make("button", "Chiudi allarmi"), view = make("div");
    const titleId = "framecraft-alarm-popup-" + crypto.randomUUID(); title.id = titleId;
    overlay.dataset.hmiAlarmPopup = ""; overlay.dataset.hmiAlarmRoot = ""; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", titleId); panel.tabIndex = -1;
    close.type = "button"; header.append(title, close); panel.append(header, view); overlay.append(panel); Object.assign(view.style, { flex: "1", minHeight: "0" }); doc.body.append(overlay);
    const control = createHmiAlarmControl(view, async (command) => { if (disposed || blocked()) throw new Error("Elemento non utilizzabile dall'utente attivo."); await options.action(command); }, filtered);
    const dismiss = () => { doc.removeEventListener("keydown", keys, true); control.dispose(); overlay.remove(); popup = undefined; if (before && !hmiAlarmElementBlocked(before)) before.focus(); };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
      if (event.key !== "Tab") return;
      const nodes = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter((n) => !n.hidden);
      if (!nodes.length) { event.preventDefault(); panel.focus(); return; }
      const index = nodes.indexOf(doc.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
    };
    if (config.pageRoute) {
      const route = config.pageRoute, navigate = make("button", "Apri pagina collegata"); navigate.type = "button";
      navigate.disabled = !options.navigate || !options.routes?.includes(route);
      navigate.title = navigate.disabled ? "Destinazione da verificare nel progetto." : route;
      navigate.onclick = () => { if (!blocked() && options.routes?.includes(route) && options.navigate) { dismiss(); try { options.navigate(route); } catch { status.textContent = "Pagina non aperta. Controlla la destinazione in PLC e dati e riprova."; } } }; header.insertBefore(navigate, close);
    }
    close.onclick = dismiss; overlay.onmousedown = (event) => { if (event.target === overlay) dismiss(); };
    doc.addEventListener("keydown", keys, true); popup = { overlay, control, close: dismiss }; control.update(snapshot, available); close.focus();
  };
  details.onclick = openPopup;
  return {
    update(next: AlarmSnapshot | undefined, connected = true) {
      if (disposed) return;
      if (next) snapshot = next; available = connected && !!next;
      const raw = host.getAttribute(hmiAlarmSummaryAttribute);
      if (raw !== configKey) { configKey = raw; closePopup(); config = raw === null ? defaultHmiAlarmSummaryConfig(host.dataset.hmiType === "HmiAlarmLine" ? "line" : "indicator") : parseHmiAlarmSummaryConfig(raw); signature = ""; }
      if (!config) { root.hidden = false; root.dataset.hmiAlarmSummaryState = "unknown"; root.style.borderLeft = "4px solid #B5C4D8"; root.setAttribute("aria-label", "Configurazione allarmi non valida. Correggi il riepilogo in PLC e dati."); content.textContent = "Configurazione allarmi non valida"; status.textContent = "Correggi il riepilogo in PLC e dati. Nessun filtro viene ignorato."; body.replaceChildren(); details.hidden = true; details.disabled = true; return; }
      if (blocked()) closePopup();
      popup?.control.update(snapshot, available);
      const view = hmiAlarmSummaryView(snapshot, config, available), key = JSON.stringify([view, config, blocked()]);
      if (signature === key) return; signature = key; root.hidden = view.hidden; root.dataset.hmiAlarmSummaryState = view.state;
      const caption = make("strong", config.caption), line = host.dataset.hmiType === "HmiAlarmLine";
      content.replaceChildren(caption); Object.assign(content.style, { display: "flex", gap: "8px", alignItems: "center" });
      const colour = view.state === "alarm" ? config.alarmColor : view.state === "normal" ? config.normalColor : "#B5C4D8";
      root.style.borderLeft = "4px solid " + colour; root.style.paddingLeft = "8px";
      if (!line && config.display !== "text") {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"), path = doc.createElementNS(svg.namespaceURI, "path"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
        path.setAttribute("d", view.state === "normal" ? "M5 12l4 4L19 6" : "M12 3L2 21h20L12 3zm0 6v5m0 3v1"); path.setAttribute("fill", "none"); path.setAttribute("stroke", colour); path.setAttribute("stroke-width", "2"); svg.append(path); if (config.flash && view.pending) svg.dataset.hmiAlarmFlash = ""; content.prepend(svg);
      }
      const counts = view.active + " attivi · " + view.unacknowledged + " da prendere in visione · " + view.unconfirmed + " da confermare";
      status.textContent = view.message; root.setAttribute("aria-label", config.caption + ": " + (available ? "" : "Ultimo stato: ") + counts + ". " + view.message);
      body.replaceChildren();
      if (!line && config.display !== "icon") body.append(make("div", (available && snapshot ? String(view.count) : "—") + " · " + ({ pending: "pendenti", active: "attivi", unacknowledged: "da prendere in visione" }[config.mode])), make("small", counts));
      if (line) for (const row of view.selected) {
        const time = row.activatedAt === undefined ? "—" : new Date(row.activatedAt).toLocaleString(undefined, { ...(config.timeZone === "UTC" ? { timeZone: "UTC", timeZoneName: "short" } : {}) });
        const entry = make("div", row.id + " · " + row.className + " · " + row.text + " · " + alarmStateLabel(row) + " · " + time); entry.style.overflowWrap = "anywhere"; body.append(entry);
      }
      details.hidden = !config.openDetails; details.disabled = blocked() || !snapshot || !view.rows.length;
    },
    dispose() { disposed = true; closePopup(); host.replaceChildren(...original); if (marker === null) delete host.dataset.hmiAlarmSummaryRoot; else host.setAttribute("data-hmi-alarm-summary-root", marker); },
  };
}
