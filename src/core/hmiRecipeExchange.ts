import { exportRecipeFile, parseRecipeFile, previewRecipeImport, previewRecipeRecords, recipeFileMaxBytes, type RecipeFile, type RecipeImportPreview } from "../../runtime/recipe-exchange.mjs";
import { exportRecipeTable, mapRecipeTable, parseRecipeTable, RecipeTableError, suggestRecipeTableMapping, type RecipeTable, type RecipeTableMapping } from "../../runtime/recipe-table.mjs";
import { RecipeStoreError, type RecipeCommand, type RecipeSchema } from "../../runtime/recipe-catalog.mjs";
import type { RecipeSnapshot } from "../../runtime/recipe-store.mjs";
import { HmiRecipeError, type HmiRecipeClient } from "./hmiRecipeClient";
import { operatorSessionProfile } from "./hmiOperatorSession";

interface Options {
  document: Document; client: HmiRecipeClient; snapshot: () => RecipeSnapshot | undefined; schema: () => RecipeSchema | undefined;
  blocked: () => boolean; changed: () => void; saved: (snapshot: RecipeSnapshot) => void;
}
const shown = (value: unknown) => value === undefined ? "Non presente" : typeof value === "boolean" ? value ? "Vero" : "Falso" : value === "" ? "(testo vuoto)" : String(value);

/** Local file preview followed by one revision-checked server transaction. */
export function createHmiRecipeExchange(options: Options) {
  const { document, client } = options, view = document.defaultView!;
  let active = true, reading = false, generation = 0, controller: AbortController | undefined;
  let staged: { schema: RecipeSchema; source?: RecipeFile["source"]; name: string; preview: RecipeImportPreview; revision: string } | undefined;
  let tableDraft: { table: RecipeTable; mapping: RecipeTableMapping; schema: RecipeSchema; name: string } | undefined;
  let notice = "Esporta lo schema selezionato o scegli un file Framecraft da confrontare. Nessuna lettura PLC.", error = false;
  const urls = new Map<string, number>();
  const releaseDownloads = () => { for (const [url, timer] of urls) { view.clearTimeout(timer); view.URL.revokeObjectURL(url); } urls.clear(); };
  const openRecords = new Set<string>();
  let rendered: HTMLElement | undefined;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const fileInput = make("input"); fileInput.type = "file"; fileInput.accept = ".json,.tsv,application/json,text/tab-separated-values"; fileInput.setAttribute("aria-label", "File ricette Framecraft"); fileInput.dataset.recipeFocus = "file";
  fileInput.addEventListener("change", () => { if (fileInput.files?.[0]) void choose(fileInput.files[0]); });
  const denied = () => !active || options.blocked() || client.busy || !!client.pending || reading;
  const permitted = () => !!operatorSessionProfile()?.capabilities.includes("recipes.import");
  const notify = () => { if (active) options.changed(); };
  function fail(reason: unknown) {
    const known = reason instanceof RecipeStoreError || reason instanceof HmiRecipeError || reason instanceof RecipeTableError;
    const location = reason instanceof RecipeTableError && reason.row !== undefined ? ` Riga dati ${reason.row} · colonna “${reason.column}”.` : "";
    notice = known ? reason.message + "." + location + " " + reason.remedy : "Operazione file non completata. Controlla il file e i permessi del browser; nessun nuovo comando viene ripetuto automaticamente.";
    error = true; notify(); rendered?.querySelector<HTMLElement>("[data-recipe-file-status]")?.focus();
  }
  function button(text: string, action: () => void, disabled = false) {
    const node = make("button", text); node.type = "button"; node.disabled = denied() || disabled; node.dataset.recipeFocus = text;
    node.addEventListener("click", () => { if (!node.disabled && !denied()) action(); }); return node;
  }
  function download(link: HTMLAnchorElement, event: MouseEvent, status: HTMLElement, format: "json" | "tsv") {
    const snapshot = options.snapshot(), schema = options.schema(); if (!snapshot || !schema || denied()) { event.preventDefault(); return; }
    try {
      const source = format === "tsv" ? exportRecipeTable(schema) : exportRecipeFile(schema, { revision: snapshot.revision, sequence: snapshot.sequence, exportedAt: new Date().toISOString() });
      const url = view.URL.createObjectURL(new Blob([source], { type: format === "tsv" ? "text/tab-separated-values;charset=utf-8" : "application/json;charset=utf-8" }));
      urls.set(url, view.setTimeout(() => { view.URL.revokeObjectURL(url); urls.delete(url); }, 30_000));
      link.href = url; link.download = "ricette-" + schema.id + "-s" + snapshot.sequence + ".framecraft." + format;
      notice = `Download richiesto · ${schema.records.length} ricette, sequenza ${snapshot.sequence}. È la copia letta, non una nuova lettura del servizio. Il file contiene i valori: conservalo in un luogo protetto.`; error = false;
      // Keep the trusted anchor connected until its native download activation has completed.
      status.textContent = notice; status.setAttribute("role", "status");
    } catch (reason) { event.preventDefault(); fail(reason); }
  }
  async function choose(file: File) {
    if (denied() || !options.snapshot() || !options.schema()) return;
    const current = ++generation, schema = structuredClone(options.schema()!), revision = options.snapshot()!.revision;
    staged = undefined; tableDraft = undefined; fileInput.value = ""; openRecords.clear(); reading = true; error = false; notice = "Lettura locale del file… Nessun invio al servizio."; notify();
    try {
      const invalidFile = () => /\.tsv$/i.test(file.name) ? new RecipeTableError("RECIPE_TABLE_FORMAT") : new RecipeStoreError("RECIPE_FILE");
      if (file.size > recipeFileMaxBytes || file.size === 0) throw invalidFile();
      const bytes = await file.arrayBuffer(); let source: string;
      try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw invalidFile(); }
      if (!active || current !== generation) return;
      if (/\.tsv$/i.test(file.name)) {
        const table = parseRecipeTable(source);
        if (table.schemaId !== undefined && table.schemaId !== schema.id) throw new RecipeStoreError("RECIPE_FILE_SCHEMA");
        tableDraft = { table, mapping: suggestRecipeTableMapping(schema, table), schema, name: file.name };
        notice = "Tabella letta soltanto nel browser. Abbina le colonne, poi genera il confronto. Nessun dato inviato al servizio.";
      } else {
        const parsed = parseRecipeFile(source), preview = previewRecipeImport(schema, parsed);
        staged = { schema: parsed.schema, source: parsed.source, name: file.name, preview, revision };
        notice = "File letto soltanto nel browser. Controlla ogni differenza; il servizio verificherà di nuovo schema, valori, permessi e revisione.";
      }
      error = false;
    } catch (reason) { if (active && current === generation) fail(reason); }
    finally { if (active && current === generation) { reading = false; notify(); if (!error) { if (tableDraft) focusMapping(); else if (staged) focusReview(); } } }
  }
  async function apply() {
    if (!staged || denied() || !permitted() || options.snapshot()?.revision !== staged.revision) return;
    const current = staged, epoch = generation;
    const command: RecipeCommand = { id: crypto.randomUUID().replaceAll("-", ""), expectedRevision: current.revision, action: "import", schemaId: current.schema.id, recordId: "batch", fields: current.schema.fields, records: current.preview.records };
    controller = new AbortController();
    try {
      const result = await client.send(command, controller.signal);
      if (!active || epoch !== generation) return;
      staged = undefined; tableDraft = undefined; fileInput.value = ""; notice = "Importazione salvata in un’unica operazione nell’archivio. Nessuna ricetta eliminata e nessun trasferimento al PLC."; error = false;
      options.saved(result.snapshot); notify();
    } catch (reason) { if (active && epoch === generation) fail(reason); }
    finally { controller = undefined; }
  }
  function focusReview() { rendered?.querySelector<HTMLElement>('[aria-label="Confronto importazione ricette"]')?.focus(); }
  function focusMapping() { rendered?.querySelector<HTMLElement>('[aria-label="Abbinamento colonne ricette"]')?.focus(); }
  function renderMapping() {
    const current = tableDraft!, section = make("section"); section.className = "recipe-review"; section.style.overflowWrap = "anywhere"; section.tabIndex = -1; section.setAttribute("aria-label", "Abbinamento colonne ricette");
    section.append(make("h3", "1. Abbina le colonne"), make("p", `${current.name} · ${current.table.rows.length} righe dati · ${current.table.columns.length} colonne · schema ${current.schema.name}.`));
    section.append(make("p", current.table.format === "framecraft" ? 'TSV Framecraft v1: i testi sono codificati come text:"..." per conservare tabulazioni, ritorni a capo e formule come testo. Non rimuovere il prefisso.' : "TSV con intestazioni: i testi restano esattamente come nel file; booleani true/false. Scegli il separatore decimale, senza separatori delle migliaia."));
    const fields = make("div"); fields.className = "recipe-fields"; fields.style.alignItems = "start";
    const mappingChanged = () => { error = false; notice = "Abbinamento modificato. Genera e controlla il confronto prima di confermare."; notify(); };
    function column(label: string, key: string, value: number, set: (value: number) => void) {
      const wrap = make("label", label), select = make("select"); select.setAttribute("aria-label", "Colonna per " + label); select.dataset.recipeFocus = "column-" + key; select.disabled = denied();
      const empty = make("option", "Scegli una colonna…"); empty.value = "-1"; select.append(empty);
      current.table.columns.forEach((name, index) => { const option = make("option", `${index + 1}. ${name}`); option.value = String(index); select.append(option); }); select.value = String(value);
      select.addEventListener("change", () => { if (denied()) return; set(Number(select.value)); mappingChanged(); }); wrap.append(select);
      if (value >= 0) wrap.append(make("small", "Esempio prima riga: " + (current.table.rows[0]?.[value]?.slice(0, 180) || "(vuoto)"))); fields.append(wrap);
    }
    column("ID ricetta", "id", current.mapping.idColumn, value => { current.mapping.idColumn = value; });
    column("Nome ricetta", "name", current.mapping.nameColumn, value => { current.mapping.nameColumn = value; });
    for (const field of current.schema.fields) column(`${field.name} · ${field.type}${field.unit ? " · " + field.unit : ""}`, "field-" + field.id, current.mapping.fields[field.id], value => { current.mapping.fields[field.id] = value; });
    const decimalLabel = make("label", "Separatore decimale"), decimal = make("select"); decimal.setAttribute("aria-label", "Separatore decimale"); decimal.dataset.recipeFocus = "decimal"; decimal.disabled = denied() || current.table.format === "framecraft";
    for (const [value, label] of [[".", "Punto · 12.5"], [",", "Virgola · 12,5"]]) { const option = make("option", label); option.value = value; decimal.append(option); } decimal.value = current.mapping.decimal;
    decimal.addEventListener("change", () => { if (denied()) return; current.mapping.decimal = decimal.value as "." | ","; mappingChanged(); }); decimalLabel.append(decimal); fields.append(decimalLabel); section.append(fields);
    const extra = make("label"), ignore = make("input"); extra.className = "recipe-apply-ack"; ignore.type = "checkbox"; ignore.checked = current.mapping.ignoreExtraColumns; ignore.disabled = denied(); ignore.dataset.recipeFocus = "ignore-columns";
    ignore.addEventListener("change", () => { if (denied()) return; current.mapping.ignoreExtraColumns = ignore.checked; mappingChanged(); }); extra.append(ignore, make("span", "Ignora le colonne che non ho abbinato. Nessun valore di queste colonne sarà importato.")); section.append(extra);
    const controls = make("div"); controls.className = "recipe-toolbar";
    controls.append(button("Genera confronto", () => {
      try {
        const records = mapRecipeTable(current.schema, current.table, current.mapping), target = options.schema();
        if (!target || target.id !== current.schema.id) throw new RecipeStoreError("RECIPE_FILE_SCHEMA");
        const preview = previewRecipeRecords(target, current.schema.fields, records);
        staged = { schema: { ...current.schema, records }, name: current.name, preview, revision: options.snapshot()!.revision }; openRecords.clear();
        error = false; notice = "Colonne abbinate. Controlla ogni differenza prima della conferma nell’archivio."; notify(); focusReview();
      } catch (reason) { fail(reason); }
    }, !current.table.rows.length), button("Scarta importazione", discard)); section.append(controls); return section;
  }
  function discard() { staged = undefined; tableDraft = undefined; fileInput.value = ""; openRecords.clear(); error = false; notice = "Importazione scartata. Nessun valore salvato."; notify(); fileInput.focus(); }
  function render() {
    const section = make("section"); section.dataset.recipeExchange = ""; rendered = section;
    section.append(make("h2", "Scambio ricette con file"));
    const status = make("p", notice); status.setAttribute("role", error ? "alert" : "status"); status.tabIndex = -1; status.dataset.recipeFileStatus = ""; status.dataset.recipeFocus = "file-status"; section.append(status);
    const actions = make("div"); actions.className = "recipe-toolbar recipe-file-toolbar";
    for (const format of ["json", "tsv"] as const) {
      const exportLink = make("a", "Esporta schema " + format.toUpperCase()); exportLink.href = "#"; exportLink.download = "ricette.framecraft." + format; exportLink.setAttribute("role", "button"); exportLink.setAttribute("aria-disabled", String(denied())); exportLink.tabIndex = denied() ? -1 : 0; exportLink.dataset.recipeFocus = "export-" + format;
      exportLink.addEventListener("click", event => download(exportLink, event, status, format)); exportLink.addEventListener("keydown", event => { if (event.key === " ") { event.preventDefault(); if (!denied()) exportLink.click(); } }); actions.append(exportLink);
    }
    const label = make("label", "Importa ricette · JSON o TSV, massimo 2 MB"); fileInput.disabled = denied(); label.append(fileInput); actions.append(label); section.append(actions);
    section.append(make("p", "Un file riguarda un solo schema. Gli ID già presenti vengono sostituiti; gli altri aggiunti. Le ricette assenti dal file restano invariate. TSV Framecraft o tabella con intestazioni: le strutture vendor, le unità e gli schemi non vengono convertiti automaticamente."));
    if (!permitted()) section.append(make("p", "Per confermare serve il permesso server “Importare più ricette da file”. Creare o modificare singole ricette non lo abilita."));
    if (!staged) { if (tableDraft) section.append(renderMapping()); return section; }
    const current = staged, { preview } = current, changed = preview.changes.filter(item => item.kind !== "unchanged");
    const review = make("section"); review.className = "recipe-review"; review.tabIndex = -1; review.setAttribute("aria-label", "Confronto importazione ricette");
    review.append(make("h3", "Confronto prima dell’importazione"), make("p", current.name), make("p", current.source ? `Origine: sequenza ${current.source.sequence}, esportata ${current.source.exportedAt}. La revisione del file non sostituisce quella attuale.` : "Tabella abbinata allo schema selezionato. Il file TSV non certifica una revisione del servizio né una conferma PLC."));
    review.append(make("p", `${preview.changes.filter(item => item.kind === "create").length} nuove · ${preview.changes.filter(item => item.kind === "update").length} da sostituire · ${preview.changes.filter(item => item.kind === "unchanged").length} identiche · ${preview.kept} conservate · ${preview.total} totali.`));
    // Details keep large imports readable and keyboard-operable without wide tables on touch panels.
    for (const item of preview.changes) {
      const details = make("details"), summary = make("summary", `${item.kind === "create" ? "Nuova" : item.kind === "update" ? "Sostituisce" : "Identica"}: ${item.after.name} · ID ${item.id}`);
      summary.dataset.recipeFocus = "import-" + item.id; details.append(summary);
      const populate = () => {
        if (details.querySelector("dl")) return;
        const values = make("dl"); if (item.before?.name !== item.after.name) values.append(make("dt", "Nome"), make("dd", shown(item.before?.name) + " → " + shown(item.after.name)));
        for (const field of current.schema.fields) if (!item.before || item.before.values[field.id] !== item.after.values[field.id]) values.append(make("dt", field.name + (field.unit ? " · " + field.unit : "")), make("dd", shown(item.before?.values[field.id]) + " → " + shown(item.after.values[field.id])));
        if (!values.childNodes.length) values.append(make("dt", "Valori"), make("dd", "Nessuna differenza")); details.append(values);
      };
      details.open = openRecords.has(item.id); if (details.open) populate();
      details.addEventListener("toggle", () => { if (details.open) { openRecords.add(item.id); populate(); } else openRecords.delete(item.id); }); review.append(details);
    }
    const stale = current.revision !== options.snapshot()?.revision;
    if (stale) {
      review.append(make("p", "L’archivio è cambiato. Rileggilo, poi rigenera e ricontrolla il confronto. Non viene forzata una sovrascrittura."));
      review.append(button("Rigenera confronto sulla copia riletta", () => {
        try { const schema = options.schema(), snapshot = options.snapshot(); if (!schema || !snapshot) return; if (schema.id !== current.schema.id) throw new RecipeStoreError("RECIPE_FILE_SCHEMA"); current.preview = previewRecipeRecords(schema, current.schema.fields, current.schema.records); current.revision = snapshot.revision; error = false; notice = "Confronto aggiornato. Ricontrolla i valori prima della conferma."; notify(); focusReview(); }
        catch (reason) { fail(reason); }
      }));
    }
    const controls = make("div"); controls.className = "recipe-toolbar";
    controls.append(button("Conferma importazione nell’archivio", () => { void apply(); }, stale || !changed.length || !permitted()));
    if (tableDraft) controls.append(button("Rivedi colonne", () => { staged = undefined; error = false; notice = "Rivedi le colonne, poi rigenera il confronto."; notify(); focusMapping(); }));
    controls.append(button("Scarta importazione", discard)); review.append(controls); section.append(review); return section;
  }
  return {
    render, get dirty() { return !!staged || !!tableDraft || reading; },
    clear() { generation++; staged = undefined; tableDraft = undefined; fileInput.value = ""; reading = false; openRecords.clear(); error = false; notice = "Confronto chiuso. Puoi esportare la copia letta o scegliere un altro file."; },
    reset() { generation++; controller?.abort(); staged = undefined; tableDraft = undefined; fileInput.value = ""; reading = false; openRecords.clear(); releaseDownloads(); error = false; notice = "Accesso cambiato. Rileggi l’archivio prima di usare i file."; },
    dispose() { active = false; generation++; controller?.abort(); staged = undefined; tableDraft = undefined; fileInput.value = ""; releaseDownloads(); },
  };
}
