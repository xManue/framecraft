import { RecipePlcError, type RecipePlcCapture } from "../../runtime/recipe-plc.mjs";
import type { RecipeRecord, RecipeScalar, RecipeSchema } from "../../runtime/recipe-catalog.mjs";
import type { RecipeSnapshot } from "../../runtime/recipe-store.mjs";
import { HmiRecipeError, type HmiRecipeClient } from "./hmiRecipeClient";
import { operatorSessionProfile } from "./hmiOperatorSession";

interface Options {
  document: Document; client: HmiRecipeClient; snapshot(): RecipeSnapshot | undefined; schema(): RecipeSchema | undefined; record(): RecipeRecord | undefined;
  blocked(): boolean; changed(): void; create(values: Record<string, RecipeScalar>, capturedAt: number): void;
}
const shown = (value: unknown) => value === undefined ? "Non disponibile" : typeof value === "boolean" ? value ? "Vero" : "Falso" : value === "" ? "(testo vuoto)" : String(value);
export function createHmiRecipePlc(options: Options) {
  const { document, client } = options;
  let active = true, generation = 0, key = "", reading = false, controller: AbortController | undefined;
  let capture: RecipePlcCapture | undefined, notice = "", error = false;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const permitted = (capability: "recipes.capture" | "recipes.create") => !!operatorSessionProfile()?.capabilities.includes(capability);
  const denied = () => !active || options.blocked() || client.busy || !!client.pending || reading;
  function reset() { generation++; controller?.abort(); controller = undefined; capture = undefined; notice = ""; error = false; reading = false; key = ""; }
  function sync() {
    const next = options.schema()?.id + ":" + options.snapshot()?.revision;
    if (key !== next) { reset(); key = next; }
  }
  const notify = () => { if (active) options.changed(); };
  function button(text: string, action: () => void, disabled = false) {
    const node = make("button", text); node.type = "button"; node.disabled = denied() || disabled; node.dataset.recipeFocus = text;
    node.addEventListener("click", () => { if (!node.disabled && !denied()) action(); }); return node;
  }
  async function read() {
    if (denied() || !permitted("recipes.capture")) return;
    sync(); const schema = options.schema(), snapshot = options.snapshot(); if (!schema || !snapshot) return;
    const current = ++generation; controller = new AbortController(); reading = true; capture = undefined; error = false; notice = "Lettura degli ultimi campioni ricevuti dal servizio…"; notify();
    try {
      const next = await client.capture(schema, snapshot.revision, controller.signal);
      if (!active || current !== generation) return;
      capture = next; notice = next.complete ? "Tutti i campi sono leggibili e nei limiti configurati. Controlla le differenze prima di creare una bozza." : new RecipePlcError(next.code!).message + ". Nessuna copia completa consentita.";
    } catch (reason) {
      if (!active || current !== generation) return;
      notice = reason instanceof HmiRecipeError ? reason.message + ". " + reason.remedy : "Lettura non completata. Controlla servizio, collegamenti e permessi; nessuna scrittura PLC."; error = true;
    } finally { if (active && current === generation) { reading = false; notify(); } }
  }
  function render() {
    sync(); const block = make("section"); block.className = "recipe-plc-runtime"; block.setAttribute("aria-label", "Confronto valori PLC");
    block.append(make("h2", "Valori della macchina"), make("p", "Lettura manuale degli ultimi campioni PLC in cache: non è una lettura simultanea dello stesso ciclo. Non applica la ricetta alla macchina."));
    block.append(button(reading ? "Lettura PLC in corso…" : "Leggi valori PLC", () => { void read(); }, !permitted("recipes.capture")));
    if (!permitted("recipes.capture")) block.append(make("p", "Accedi con un account operatore autorizzato a leggere i valori PLC delle ricette. Il PIN browser non basta."));
    if (notice) { const status = make("p", notice); status.setAttribute("role", error ? "alert" : "status"); block.append(status); }
    if (!capture) return block;
    const selected = options.schema(), record = options.record();
    block.append(make("p", "Acquisizione del servizio: " + new Date(capture.capturedAt).toLocaleString() + `. Età ammessa: ${capture.maxAgeMs} ms · distanza ammessa: ${capture.maxSkewMs} ms. I dati mostrati non si aggiornano da soli.`));
    const list = make("div"); list.className = "recipe-plc-comparison";
    for (const entry of capture.entries) {
      const field = selected?.fields.find(item => item.id === entry.fieldId); if (!field) continue;
      const row = make("article"); row.append(make("h3", field.name + (field.unit ? " · " + field.unit : "")), make("p", `Tag: ${entry.tag} · ${entry.dataType}`));
      const values = make("dl"); values.append(make("dt", record ? "Archivio · " + record.name : "Archivio"), make("dd", shown(record?.values[field.id])), make("dt", "PLC acquisito"), make("dd", shown(entry.value))); row.append(values);
      if (entry.ok) row.append(make("p", (record ? record.values[field.id] === entry.value ? "Uguale alla ricetta" : "Diverso dalla ricetta" : "Nessuna ricetta selezionata") + " · qualità buona"));
      else { const reason = new RecipePlcError(entry.code!); row.append(make("p", reason.message + ". " + reason.remedy)); }
      if (entry.receivedAt !== undefined) row.append(make("small", "Ricevuto dal servizio: " + new Date(entry.receivedAt).toLocaleString()));
      list.append(row);
    }
    block.append(list, button("Crea bozza dai valori letti", () => {
      if (capture?.complete && capture.values && permitted("recipes.create") && permitted("recipes.capture") && capture.revision === options.snapshot()?.revision && capture.schemaId === options.schema()?.id) options.create(structuredClone(capture.values), capture.capturedAt);
    }, !capture.complete || !permitted("recipes.create") || !permitted("recipes.capture")));
    block.append(make("p", "Crea una nuova bozza locale, con un nome da scegliere e una conferma di salvataggio. Non sovrascrive ricette né invia valori al PLC. L’applicazione richiederà una conferma del programma PLC; qui non è disponibile."));
    return block;
  }
  return { render, reset, dispose() { active = false; reset(); } };
}
