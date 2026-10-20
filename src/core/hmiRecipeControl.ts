import { parseRecipeCommand, parseRecipeValues, recipeText, RecipeStoreError, type RecipeCommand, type RecipeField, type RecipeRecord, type RecipeSchema } from "../../runtime/recipe-catalog.mjs";
import type { RecipeSnapshot } from "../../runtime/recipe-store.mjs";
import { HmiRecipeError, type HmiRecipeClient } from "./hmiRecipeClient";
import { hmiAlarmElementBlocked } from "./hmiAlarmControl";

const navigationGuards = new Set<() => boolean>();
export function allowHmiRecipeNavigation() { for (const guard of navigationGuards) if (!guard()) return false; return true; }
type Mode = RecipeCommand["action"];
interface Draft { mode: Mode; schema: RecipeSchema; record?: RecipeRecord; name: string; raw: Record<string, string | undefined>; revision: string; targetId: string }
export interface HmiRecipeControlOptions { client?: HmiRecipeClient; confirm?: (message: string) => boolean }

const css = `
[data-hmi-recipe-root] { box-sizing:border-box; background:#f7f8fa; color:#172331; font:16px/1.5 "Segoe UI",sans-serif; padding:16px; overflow:auto; }
[data-hmi-recipe-root] * { box-sizing:border-box; }
[data-hmi-recipe-root] p { margin:0 0 12px; overflow-wrap:anywhere; }
[data-hmi-recipe-root] button,[data-hmi-recipe-root] input,[data-hmi-recipe-root] select { font:inherit; min-height:48px; max-width:100%; border:1px solid #66788b; border-radius:4px; padding:8px 12px; color:#172331; background:#fff; }
[data-hmi-recipe-root] button { cursor:pointer; white-space:normal; }
[data-hmi-recipe-root] button:hover:not(:disabled) { background:#e2edf7; }
[data-hmi-recipe-root] :focus-visible { outline:3px solid #1261a0; outline-offset:2px; }
[data-hmi-recipe-root] :disabled { cursor:default; opacity:.6; }
[data-hmi-recipe-root] label { display:grid; gap:4px; min-width:0; }
[data-hmi-recipe-root] label input,[data-hmi-recipe-root] label select { width:100%; min-width:0; }
[data-hmi-recipe-root] .recipe-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
[data-hmi-recipe-root] .recipe-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr)); gap:16px; margin:16px 0; }
[data-hmi-recipe-root] [role=alert] { border-left:4px solid #a32626; padding:12px; background:#fff0f0; }
[data-hmi-recipe-root] .recipe-review { border:2px solid #1261a0; padding:16px; margin-top:16px; }
[data-hmi-recipe-root] dl { margin:8px 0; } [data-hmi-recipe-root] dt { font-weight:600; } [data-hmi-recipe-root] dd { margin:0 0 10px; white-space:pre-wrap; overflow-wrap:anywhere; }
.hmi-shell.mobile .hmi-page[data-hmi-template-id="guided:recipes"]:has([data-hmi-recipe-root]) { width:100% !important; height:auto !important; min-height:100%; zoom:1 !important; transform:none !important; padding-top:76px; }
.hmi-shell.mobile .hmi-page[data-hmi-template-id="guided:recipes"]:has([data-hmi-recipe-root]) > h1 { left:16px !important; width:calc(100% - 32px) !important; }
.hmi-shell.mobile .hmi-page[data-hmi-template-id="guided:recipes"] > img[data-image-role="part"] { position:relative !important; left:16px !important; top:0 !important; width:calc(100% - 32px) !important; height:auto !important; max-height:320px; margin-bottom:16px; }
.hmi-shell.mobile .hmi-page[data-hmi-template-id="guided:recipes"] [data-hmi-recipe-root] { position:relative !important; left:16px !important; top:0 !important; width:calc(100% - 32px) !important; height:auto !important; min-height:440px; overflow:visible !important; }
`;
const shown = (value: unknown) => value === undefined ? "Non disponibile" : typeof value === "boolean" ? value ? "Vero" : "Falso" : typeof value === "string" && !value.length ? "(testo vuoto)" : String(value);
const actionNames: Record<Mode, string> = { create: "Nuova ricetta", update: "Modifica ricetta", copy: "Copia ricetta", rename: "Rinomina ricetta", delete: "Elimina ricetta" };

export function createHmiRecipeControl(host: HTMLElement, options: HmiRecipeControlOptions) {
  const document = host.ownerDocument, view = document.defaultView!, original = [...host.childNodes];
  const oldRole = host.getAttribute("role"), oldLabel = host.getAttribute("aria-label");
  const client = options.client, confirm = options.confirm ?? (message => view.confirm(message));
  host.dataset.hmiRecipeRoot = ""; host.setAttribute("role", "region"); host.setAttribute("aria-label", "Archivio ricette");
  let active = true, snapshot: RecipeSnapshot | undefined, schemaId = "", recordId = "", draft: Draft | undefined, review: RecipeCommand | undefined;
  let message = "Carica l’archivio per vedere le ricette autorizzate. Nessuna lettura automatica.", error: HmiRecipeError | RecipeStoreError | undefined;
  const controller = new AbortController();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const button = (text: string, action: () => void, disabled = false) => { const node = make("button", text); node.type = "button"; node.disabled = disabled || !!client?.busy || hmiAlarmElementBlocked(host); node.addEventListener("click", () => { if (active && !node.disabled && !hmiAlarmElementBlocked(host)) action(); }); return node; };
  const group = () => { const node = make("div"); node.className = "recipe-toolbar"; return node; };
  const schema = () => snapshot?.schemas.find(item => item.id === schemaId);
  const record = () => schema()?.records.find(item => item.id === recordId);
  const canLeave = () => {
    if (client?.busy) { message = "Attendi il termine dell’operazione prima di cambiare pagina."; render(); return false; }
    if (client?.pending) return confirm("L’esito del salvataggio non è verificato. L’ID resterà nella sessione del browser; uscendo la bozza non sarà conservata. Vuoi uscire comunque?");
    return !draft || confirm("La bozza ricetta non è salvata. Vuoi uscire e scartarla?");
  };
  navigationGuards.add(canLeave);
  const unload = (event: BeforeUnloadEvent) => { if (draft || client?.pending || client?.busy) { event.preventDefault(); event.returnValue = ""; } };
  view.addEventListener("beforeunload", unload);
  function fail(reason: unknown) {
    error = reason instanceof HmiRecipeError || reason instanceof RecipeStoreError ? reason : new HmiRecipeError("RECIPE_CLIENT_RESPONSE", "Operazione ricette non completata", "Rileggi l’archivio e controlla il servizio. La bozza non è stata eliminata.");
    review = undefined; render();
    if (error.fieldId) host.querySelector<HTMLElement>('[data-recipe-field="' + error.fieldId + '"]')?.focus();
  }
  async function load() {
    if (!client || hmiAlarmElementBlocked(host)) return;
    try {
      const next = await client.read(controller.signal); if (!active) return;
      snapshot = next; schemaId = next.schemas.find(item => item.id === schemaId)?.id ?? next.schemas[0]?.id ?? "";
      recordId = schema()?.records.find(item => item.id === recordId)?.id ?? schema()?.records[0]?.id ?? "";
      error = undefined; message = draft ? "Archivio riletto. La bozza è conservata sulla revisione precedente: confronta i valori prima di aggiornarne la base." : "Archivio letto dal servizio. Nessun valore è stato inviato al PLC."; render();
    } catch (reason) { if (active) fail(reason); }
  }
  function start(mode: Mode) {
    const selected = schema(), current = record(); if (!snapshot || !selected || mode !== "create" && !current || client?.pending) return;
    if (draft && !confirm("Scartare la bozza ricetta non salvata?")) return;
    draft = { mode, schema: structuredClone(selected), record: current && structuredClone(current), revision: snapshot.revision, targetId: "r_" + crypto.randomUUID().replaceAll("-", ""), name: mode === "create" || mode === "copy" ? "" : current!.name, raw: mode === "create" ? {} : Object.fromEntries(selected.fields.map(field => [field.id, String(current!.values[field.id])])) };
    review = undefined; error = undefined; message = "Bozza non salvata. Controlla i valori, poi verifica l’operazione."; render();
    host.querySelector<HTMLInputElement>('[data-recipe-focus="name"]')?.focus();
  }
  function valuesFor(current: Draft) {
    return parseRecipeValues(Object.fromEntries(current.schema.fields.map(field => {
      const raw = current.raw[field.id]; if (raw === undefined || field.type !== "string" && !raw.length) throw new RecipeStoreError("RECIPE_VALUE", field.id);
      if (["number", "integer"].includes(field.type) && !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(raw)) throw new RecipeStoreError("RECIPE_VALUE", field.id);
      return [field.id, field.type === "boolean" ? raw === "true" ? true : raw === "false" ? false : undefined : field.type === "string" ? raw : Number(raw.replace(",", "."))];
    })), current.schema.fields);
  }
  function prepare() {
    if (!draft) return;
    try {
      const current = draft;
      if (current.mode !== "delete" && !recipeText(current.name)) throw new HmiRecipeError("RECIPE_CLIENT_NAME", "Inserisci un nome valido per la ricetta", "Usa da 1 a 160 caratteri, senza spazi iniziali o finali né caratteri di controllo.");
      review = parseRecipeCommand({ id: crypto.randomUUID().replaceAll("-", ""), expectedRevision: current.revision, action: current.mode, schemaId: current.schema.id, recordId: current.mode === "create" ? current.targetId : current.record!.id,
        ...(current.mode !== "delete" ? { name: current.name } : {}), ...(current.mode === "copy" ? { targetId: current.targetId } : {}), ...(["create", "update"].includes(current.mode) ? { values: valuesFor(current) } : {}) });
      error = undefined; render(); host.querySelector<HTMLElement>('[data-recipe-focus="confirm"]')?.focus();
    } catch (reason) { fail(reason); if (reason instanceof HmiRecipeError && reason.code === "RECIPE_CLIENT_NAME") host.querySelector<HTMLElement>('[data-recipe-focus="name"]')?.focus(); }
  }
  async function save(retry = false) {
    if (!client || hmiAlarmElementBlocked(host) || !retry && !review) return;
    const command = review, targetSchema = command?.schemaId ?? draft?.schema.id ?? schemaId;
    const targetRecord = command?.targetId ?? command?.recordId ?? (draft ? ["create", "copy"].includes(draft.mode) ? draft.targetId : draft.record!.id : recordId);
    try {
      const result = await (retry ? client.retry(controller.signal) : client.send(command!, controller.signal)); if (!active) return;
      snapshot = result.snapshot; schemaId = targetSchema; recordId = targetRecord;
      if (!record()) recordId = schema()?.records[0]?.id ?? "";
      draft = undefined; review = undefined; error = undefined;
      message = result.duplicate ? `Richiesta già registrata (sequenza ${result.appliedSequence}). I valori mostrati sono quelli attuali dell’archivio, non una conferma PLC.` : "Salvato nell’archivio del servizio. Nessun trasferimento al PLC."; render();
    } catch (reason) { if (active) fail(reason); }
  }
  function selector(label: string, value: string, entries: { id: string; name: string }[], select: (id: string) => void) {
    const wrap = make("label", label), node = make("select"); node.setAttribute("aria-label", label);
    for (const item of entries) { const option = make("option", item.name); option.value = item.id; node.append(option); }
    node.value = value; node.disabled = !!client?.busy || !!draft || hmiAlarmElementBlocked(host);
    node.addEventListener("change", () => { select(node.value); review = undefined; error = undefined; render(); }); wrap.append(node); return wrap;
  }
  function fieldInput(field: RecipeField, current: Draft) {
    const wrap = make("label", field.name + (field.unit ? " · " + field.unit : ""));
    const input = field.type === "boolean" ? make("select") : make("input");
    input.dataset.recipeField = field.id; input.dataset.recipeFocus = field.id; input.setAttribute("aria-label", field.name);
    if (input instanceof view.HTMLSelectElement) for (const [value, label] of [["", "Scegli"], ["true", "Vero"], ["false", "Falso"]]) { const option = make("option", label); option.value = value; input.append(option); }
    if (input instanceof view.HTMLInputElement) { input.type = "text"; input.autocomplete = "off"; if (["number", "integer"].includes(field.type)) input.inputMode = "decimal"; if (field.type === "string") input.maxLength = field.maxLength ?? 1024; }
    input.value = current.raw[field.id] ?? ""; input.disabled = !!client?.busy || !!client?.pending || !!review || hmiAlarmElementBlocked(host);
    if (error?.fieldId === field.id) input.setAttribute("aria-invalid", "true");
    input.addEventListener("input", () => { current.raw[field.id] = input.value; review = undefined; });
    input.addEventListener("change", () => { current.raw[field.id] = input.value; review = undefined; }); wrap.append(input);
    if (field.type === "string" && current.raw[field.id] === undefined) wrap.append(button("Usa testo vuoto", () => { current.raw[field.id] = ""; render(); }, !!client?.pending));
    const hint = make("small", field.type === "string" ? `Massimo ${field.maxLength ?? 1024} caratteri` : field.type === "boolean" ? "Nessun valore preselezionato per una nuova ricetta" : `${field.type === "integer" ? "Numero intero" : "Numero · decimali con punto o virgola, senza separatori delle migliaia"} · minimo ${field.minimum ?? "non definito"} · massimo ${field.maximum ?? "non definito"}`); wrap.append(hint); return wrap;
  }
  function details(title: string, selected: RecipeSchema, selectedRecord?: RecipeRecord) {
    const block = make("details"), summary = make("summary", title), list = make("dl"); block.open = !!draft && draft.revision !== snapshot?.revision;
    for (const field of selected.fields) list.append(make("dt", field.name), make("dd", shown(selectedRecord?.values[field.id]) + (field.unit ? " " + field.unit : "")));
    block.append(summary, list); return block;
  }
  function render() {
    if (!active) return;
    const focus = (document.activeElement as HTMLElement | null)?.dataset.recipeFocus;
    const style = make("style"); style.textContent = css;
    const notice = make("p", "Archivio ricette · salvare qui non applica la ricetta alla macchina e non scrive al PLC.");
    const status = make("p", client?.busy ? "Operazione in corso… Attendi il termine prima di uscire." : error ? error.message + ". " + error.remedy : message); status.setAttribute("role", error && !client?.busy ? "alert" : "status");
    const toolbar = group(); toolbar.append(button(client?.busy ? "Operazione in corso…" : "Rileggi archivio", () => { void load(); }, !client));
    host.replaceChildren(style, notice, toolbar, status); host.setAttribute("aria-busy", String(!!client?.busy));
    if (!client) { host.append(make("p", "Servizio ricette non configurato. Controlla gateway e namespace in framecraft.recipes-ui.json, poi configura un’identità operatore con permessi verificati sul server. Il PIN browser non abilita l’archivio.")); return; }
    const pending = client.pending;
    if (pending && !client.busy) {
      const recovery = make("section"); recovery.className = "recipe-review";
      recovery.append(make("h2", "Salvataggio da verificare"), make("p", "ID richiesta: " + (pending.id ?? "non leggibile") + ". Nessun nuovo salvataggio viene inviato finché l’esito non è verificato."));
      if (pending.canRetry) recovery.append(button("Verifica ripetendo la stessa richiesta", () => { if (confirm("Ripetere la stessa richiesta, con lo stesso ID e gli stessi valori? Il servizio riconosce una richiesta già registrata; se prima non è arrivata potrebbe salvarla adesso.")) void save(true); }));
      recovery.append(button("Ho confrontato l’archivio: continua", () => { if (confirm("Hai confrontato l’archivio riletto con la bozza e verificato l’esito? Questa scelta chiude solo l’avviso e non certifica il salvataggio né l’esecuzione PLC.")) { try { client.acknowledgeReviewed(); error = undefined; message = "Verifica chiusa dall’operatore. Nessuna richiesta ripetuta e nessuna conferma PLC."; render(); } catch (reason) { fail(reason); } } }, !pending.reviewed)); host.append(recovery);
    }
    if (!snapshot) return;
    host.append(make("p", `Archivio del servizio · sequenza ${snapshot.sequence}. Le autorizzazioni vengono verificate a ogni richiesta.`));
    if (!snapshot.schemas.length) { host.append(make("p", "Nessuno schema disponibile. Prepara gli schemi nell’editor e configura il servizio prima di usare le ricette.")); return; }
    const selectors = make("div"); selectors.className = "recipe-fields";
    selectors.append(selector("Schema ricetta", schemaId, snapshot.schemas, id => { schemaId = id; recordId = schema()?.records[0]?.id ?? ""; }));
    const selected = schema(); if (!selected) return;
    if (selected.records.length) selectors.append(selector("Ricetta archiviata", recordId, selected.records, id => { recordId = id; })); host.append(selectors);
    const actions = group();
    for (const mode of ["create", "update", "copy", "rename", "delete"] as const) actions.append(button(actionNames[mode], () => start(mode), !!pending || mode !== "create" && !record()));
    host.append(actions);
    if (record()) host.append(details("Valori attuali nell’archivio · " + record()!.name, selected, record()));
    if (!draft) return;
    const current = draft, form = make("form"); form.noValidate = true;
    form.addEventListener("submit", event => { event.preventDefault(); if (!client.busy && !client.pending) prepare(); });
    form.append(make("h2", actionNames[current.mode]), make("p", "Bozza locale: non cambia l’archivio finché non confermi. Non sopravvive alla chiusura della pagina."));
    if (current.mode !== "delete") {
      const nameLabel = make("label", "Nome ricetta"), name = make("input"); name.type = "text"; name.maxLength = 160; name.value = current.name; name.dataset.recipeFocus = "name"; name.setAttribute("aria-label", "Nome ricetta"); name.disabled = client.busy || !!pending;
      name.disabled ||= !!review || hmiAlarmElementBlocked(host);
      name.addEventListener("input", () => { current.name = name.value; review = undefined; }); nameLabel.append(name); form.append(nameLabel);
    }
    if (["create", "update"].includes(current.mode)) { const fields = make("div"); fields.className = "recipe-fields"; for (const field of current.schema.fields) fields.append(fieldInput(field, current)); form.append(fields); }
    if (snapshot.revision !== current.revision) {
      const compatible = selected.id === current.schema.id && JSON.stringify(selected.fields) === JSON.stringify(current.schema.fields) && (current.mode === "create" || selected.records.some(item => item.id === current.record?.id));
      form.append(make("p", "L’archivio riletto ha una revisione diversa. La bozza non viene sovrascritta né aggiornata automaticamente."), button("Confrontato: usa la revisione riletta", () => { if (confirm("Hai confrontato i valori attuali con la bozza? Salvando sulla revisione riletta sostituirai i dati attuali con quelli della bozza. Una copia userà i valori attuali della ricetta sorgente.")) { current.revision = snapshot!.revision; if (current.record) current.record = structuredClone(selected.records.find(item => item.id === current.record!.id)!); review = undefined; error = undefined; render(); } }, !compatible || !!pending));
    }
    const buttons = group(); buttons.append(button("Verifica operazione", prepare, !!pending || current.revision !== snapshot.revision), button("Scarta bozza", () => { if (confirm("Scartare questa bozza ricetta non salvata?")) { draft = undefined; review = undefined; error = undefined; render(); } }, !!pending)); form.append(buttons); host.append(form);
    if (review) {
      const checked = review, box = make("section"); box.className = "recipe-review";
      box.append(make("h2", "Conferma nell’archivio"), make("p", `${actionNames[checked.action]} · ${current.record?.name ?? "nuova"}${checked.name ? " → " + checked.name : ""}. Nessun trasferimento al PLC.`));
      const list = make("dl");
      if (["create", "update", "copy"].includes(checked.action)) for (const field of current.schema.fields) list.append(make("dt", field.name), make("dd", shown(current.record?.values[field.id]) + " → " + shown(checked.values?.[field.id] ?? current.record?.values[field.id])));
      box.append(list); const saveButton = button("Conferma salvataggio", () => { void save(); }, !!pending || checked.expectedRevision !== snapshot.revision); saveButton.dataset.recipeFocus = "confirm";
      const confirmationButtons = group(); confirmationButtons.append(saveButton, button("Torna alla bozza", () => { review = undefined; render(); }, !!pending)); box.append(confirmationButtons); host.append(box);
    }
    if (focus) [...host.querySelectorAll<HTMLElement>("[data-recipe-focus]")].find(node => node.dataset.recipeFocus === focus)?.focus();
  }
  const unsubscribe = client?.subscribe(render); render();
  return { canLeave, refresh: render, dispose() { if (!active) return; active = false; unsubscribe?.(); controller.abort(); navigationGuards.delete(canLeave); view.removeEventListener("beforeunload", unload); delete host.dataset.hmiRecipeRoot; host.removeAttribute("aria-busy"); if (oldRole === null) host.removeAttribute("role"); else host.setAttribute("role", oldRole); if (oldLabel === null) host.removeAttribute("aria-label"); else host.setAttribute("aria-label", oldLabel); host.replaceChildren(...original); } };
}
