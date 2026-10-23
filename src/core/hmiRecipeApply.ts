import type { RecipeSnapshot } from "../../runtime/recipe-store.mjs";
import type { RecipeRecord, RecipeSchema } from "../../runtime/recipe-catalog.mjs";
import type { RecipeApplyCommand } from "../../runtime/recipe-apply.mjs";
import { HmiRecipeApplyError, type HmiRecipeApplyClient } from "./hmiRecipeApplyClient";
import { operatorSessionProfile } from "./hmiOperatorSession";
interface Options { host: HTMLElement; client: HmiRecipeApplyClient; snapshot(): RecipeSnapshot | undefined; schema(): RecipeSchema | undefined; record(): RecipeRecord | undefined; blocked(): boolean; changed(): void; confirm(message: string): boolean }
const shown = (value: unknown) => value === "" ? "(testo vuoto)" : typeof value === "boolean" ? value ? "Vero" : "Falso" : String(value);
const plcReasons: Record<number, string> = { 1: "Interblocco macchina non soddisfatto", 2: "Schema diverso da quello previsto dal PLC", 3: "Valori non validi per il programma PLC", 4: "Canale PLC occupato", 5: "Preparazione scaduta", 6: "Riavvio del PLC durante la richiesta", 7: "Richiesta non vista e bloccata dal PLC", 8: "Sequenza non ricostruibile dal PLC", 9: "Applicazione macchina con esito non dimostrato", 10: "Memoria ritentiva del PLC non disponibile" };
export function createHmiRecipeApply(options: Options) {
  const { client, host } = options, document = host.ownerDocument;
  let active = true, epoch = 0, key = "", reviewing = false, acknowledged = false, error: HmiRecipeApplyError | undefined;
  let review: { command: RecipeApplyCommand; schema: RecipeSchema; record: RecipeRecord } | undefined;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const permitted = () => !!operatorSessionProfile()?.capabilities.includes("recipes.apply");
  const blocked = () => !active || options.blocked() || client.busy || !permitted();
  const notify = () => { if (active) options.changed(); };
  const button = (text: string, action: () => void, disabled = false) => { const node = make("button", text); node.type = "button"; node.dataset.recipeFocus = text; node.disabled = blocked() || disabled; node.addEventListener("click", () => { if (!node.disabled && !blocked()) action(); }); return node; };
  function reset() { epoch++; review = undefined; reviewing = false; acknowledged = false; error = undefined; key = ""; }
  function sync() { const next = options.schema()?.id + ":" + options.record()?.id + ":" + options.snapshot()?.revision; if (next !== key) { reset(); key = next; } }
  function fail(reason: unknown) { error = reason instanceof HmiRecipeApplyError ? reason : new HmiRecipeApplyError("RECIPE_APPLY_CLIENT_RESPONSE", "Applicazione ricetta non completata", "Verifica il servizio e l’esito precedente. Non ripetere il comando con un nuovo ID.", !!client.pending); review = undefined; acknowledged = false; }
  async function prepare() {
    if (blocked() || client.pending || client.damaged) return; const snapshot = options.snapshot(), schema = options.schema(), record = options.record(); if (!snapshot || !schema || !record) return;
    const generation = epoch; reviewing = true; error = undefined; notify();
    try {
      await client.current(schema.id); if (!active || generation !== epoch) return;
      if (client.pending || client.damaged) throw new HmiRecipeApplyError("RECIPE_APPLY_CLIENT_PENDING", "Il canale ha una richiesta da verificare", "Usa Verifica esito prima di inviare un’altra ricetta.", true);
      if (options.snapshot()?.revision !== snapshot.revision || options.record()?.id !== record.id) throw Error();
      if (!client.identity) throw Error();
      review = { command: { id: crypto.randomUUID().replaceAll("-", ""), schemaId: schema.id, recordId: record.id, expectedRevision: snapshot.revision, ledgerId: client.identity }, schema: structuredClone(schema), record: structuredClone(record) }; acknowledged = false;
    } catch (reason) { if (active && generation === epoch) fail(reason); }
    finally { if (active && generation === epoch) { reviewing = false; notify(); if (review) host.querySelector<HTMLInputElement>('[data-recipe-apply-ack]')?.focus(); } }
  }
  async function send() {
    if (blocked() || !review || !acknowledged || client.pending || client.damaged || review.command.expectedRevision !== options.snapshot()?.revision || review.command.recordId !== options.record()?.id) return;
    const command = review.command, generation = epoch; review = undefined; acknowledged = false; error = undefined;
    try { await client.send(command); } catch (reason) { if (active && generation === epoch) fail(reason); }
    finally { if (active && generation === epoch) notify(); }
  }
  async function verify(fence = false) {
    if (blocked() || !client.pending || client.damaged) return;
    if (fence && !options.confirm("Chiudere in modo protetto questa richiesta? Il servizio bloccherà un invio originale ritardato solo se non l’ha già avviato. Nessuna ricetta verrà inviata o riapplicata; se la richiesta esiste già, verrà mostrato il suo stato reale.")) return;
    const generation = epoch; error = undefined;
    try { await (fence ? client.fence() : client.verify()); } catch (reason) { if (active && generation === epoch) fail(reason); }
    finally { if (active && generation === epoch) notify(); }
  }
  function render() {
    sync(); const block = make("section"); block.className = "recipe-plc-runtime recipe-apply-runtime"; block.setAttribute("aria-label", "Applicazione ricette al PLC");
    block.append(make("h2", "Applicazione al PLC"), make("p", "Questo comando cambia i parametri della macchina. Salvare o importare nell’archivio, invece, non applica la ricetta."));
    if (!permitted()) { block.append(make("p", "Accedi con un account autorizzato ad applicare le ricette a questo schema. Il PIN browser non concede questo permesso.")); return block; }
    const toolbar = make("div"); toolbar.className = "recipe-toolbar";
    toolbar.append(button(reviewing ? "Verifica canale in corso…" : "Rivedi applicazione al PLC", () => { void prepare(); }, reviewing || !!client.pending || client.damaged || !options.record() || !!review)); block.append(toolbar);
    if (client.busy) { const status = make("p", "Richiesta in corso: attendo il servizio e la conferma del programma PLC. Non chiudere o ripetere il comando."); status.setAttribute("role", "status"); block.append(status); }
    if (error) { const status = make("p", error.message + ". " + error.remedy); status.setAttribute("role", "alert"); block.append(status); }
    if (client.damaged) { const status = make("p", "Checkpoint della richiesta non leggibile. Non cancellarlo per riprovare: fai verificare il registro del servizio con chi ti assiste. Nessun nuovo comando è abilitato."); status.setAttribute("role", "alert"); block.append(status); }
    const pending = client.pending;
    if (pending) {
      const recovery = make("section"); recovery.className = "recipe-review";
      recovery.append(make("h3", "Applicazione da verificare"), make("p", "ID: " + pending.id + " · schema: " + pending.schemaId + ". Il checkpoint contiene solo riferimenti, non i valori della ricetta. Non viene reinviato automaticamente."), button("Verifica esito applicazione", () => { void verify(); }, client.damaged));
      if (error?.code === "RECIPE_APPLY_MISSING") recovery.append(button("Chiudi richiesta non avviata", () => { void verify(true); }, client.damaged)); block.append(recovery);
    }
    const latest = client.latest;
    if (latest && latest.schemaId === options.schema()?.id) {
      const status = make("section"); status.className = "recipe-review"; status.setAttribute("role", "status");
      status.append(make("h3", latest.plcConfirmed ? "Applicazione confermata dal programma PLC" : latest.outcome === "rejected" ? latest.writePhase === "none" ? "Richiesta non inviata al PLC" : "Richiesta rifiutata" : "Esito dell’applicazione da verificare"));
      status.append(make("p", "ID: " + latest.id + " · canale: " + latest.channelId + " · aggiornamento: " + new Date(latest.updatedAt).toLocaleString()));
      status.append(make("p", "Ricetta della richiesta: " + (options.schema()?.records.find(record => record.id === latest.recordId)?.name ?? latest.recordId) + " · ID ricetta: " + latest.recordId));
      if (latest.recordId !== options.record()?.id) status.append(make("p", "Questa ricevuta riguarda un’altra ricetta, non quella selezionata adesso."));
      if (latest.plcConfirmed) status.append(make("p", "È la conferma storica di questa richiesta, non una lettura dei parametri attuali della macchina. Nessun comando è stato ripetuto per consultarla."));
      else if (latest.code === "RECIPE_APPLY_NOT_SENT") status.append(make("p", "Il servizio ha chiuso questo ID prima di qualsiasi preparazione PLC. Un invio originale tardivo non potrà applicare la ricetta."));
      else status.append(make("p", (latest.plcCode !== null ? (plcReasons[latest.plcCode] ?? "Codice del programma PLC non riconosciuto") + " · codice PLC " + latest.plcCode + ". " : "") + "Dettaglio: " + latest.code + ". Verifica la causa; un esito incerto non autorizza un’altra applicazione."));
      block.append(status);
    }
    if (review) {
      const checked = review, box = make("section"); box.className = "recipe-review";
      box.append(make("h3", "Controlla i valori prima di applicare"), make("p", checked.schema.name + " · " + checked.record.name + ". Verranno usati esattamente i valori archiviati di questa revisione, non la bozza o i campioni PLC."));
      const values = make("dl"); for (const field of checked.schema.fields) values.append(make("dt", field.name), make("dd", shown(checked.record.values[field.id]) + (field.unit ? " " + field.unit : ""))); box.append(values);
      const label = make("label"); label.className = "recipe-apply-ack"; const ack = make("input"); ack.type = "checkbox"; ack.checked = acknowledged; ack.disabled = blocked(); ack.dataset.recipeApplyAck = ""; ack.dataset.recipeFocus = "recipe-apply-ack"; ack.addEventListener("change", () => { acknowledged = ack.checked; notify(); }); label.append(ack, make("span", "Ho controllato i valori e autorizzo la richiesta di applicazione al PLC")); box.append(label);
      const actions = make("div"); actions.className = "recipe-toolbar"; actions.append(button("Torna ai valori archiviati", () => { review = undefined; acknowledged = false; notify(); }), button("Conferma applicazione al PLC", () => { void send(); }, !acknowledged)); box.append(actions); block.append(box);
    }
    return block;
  }
  return { render, reset, get dirty() { return !!review || reviewing; }, dispose() { active = false; reset(); } };
}
