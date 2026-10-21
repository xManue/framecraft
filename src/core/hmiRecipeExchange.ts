import { exportRecipeFile, parseRecipeFile, previewRecipeImport, recipeFileMaxBytes, type RecipeFile, type RecipeImportPreview } from "../../runtime/recipe-exchange.mjs";
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
  let staged: { file: RecipeFile; name: string; preview: RecipeImportPreview; revision: string } | undefined;
  let notice = "Esporta lo schema selezionato o scegli un file Framecraft da confrontare. Nessuna lettura PLC.", error = false;
  const urls = new Map<string, number>();
  const releaseDownloads = () => { for (const [url, timer] of urls) { view.clearTimeout(timer); view.URL.revokeObjectURL(url); } urls.clear(); };
  const openRecords = new Set<string>();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const fileInput = make("input"); fileInput.type = "file"; fileInput.accept = ".json,application/json"; fileInput.setAttribute("aria-label", "File ricette Framecraft"); fileInput.dataset.recipeFocus = "file";
  fileInput.addEventListener("change", () => { if (fileInput.files?.[0]) void choose(fileInput.files[0]); });
  const denied = () => !active || options.blocked() || client.busy || !!client.pending || reading;
  const permitted = () => !!operatorSessionProfile()?.capabilities.includes("recipes.import");
  const notify = () => { if (active) options.changed(); };
  function fail(reason: unknown) {
    const known = reason instanceof RecipeStoreError || reason instanceof HmiRecipeError;
    notice = known ? reason.message + ". " + reason.remedy : "Operazione file non completata. Controlla il file e i permessi del browser; nessun nuovo comando viene ripetuto automaticamente.";
    error = true; notify();
  }
  function button(text: string, action: () => void, disabled = false) {
    const node = make("button", text); node.type = "button"; node.disabled = denied() || disabled; node.dataset.recipeFocus = text;
    node.addEventListener("click", () => { if (!node.disabled && !denied()) action(); }); return node;
  }
  function download(link: HTMLAnchorElement, event: MouseEvent, status: HTMLElement) {
    const snapshot = options.snapshot(), schema = options.schema(); if (!snapshot || !schema || denied()) { event.preventDefault(); return; }
    try {
      const source = exportRecipeFile(schema, { revision: snapshot.revision, sequence: snapshot.sequence, exportedAt: new Date().toISOString() });
      const url = view.URL.createObjectURL(new Blob([source], { type: "application/json;charset=utf-8" }));
      urls.set(url, view.setTimeout(() => { view.URL.revokeObjectURL(url); urls.delete(url); }, 30_000));
      link.href = url; link.download = "ricette-" + schema.id + "-s" + snapshot.sequence + ".framecraft.json";
      notice = `Download richiesto · ${schema.records.length} ricette, sequenza ${snapshot.sequence}. È la copia letta, non una nuova lettura del servizio. Il file contiene i valori: conservalo in un luogo protetto.`; error = false;
      // Keep the trusted anchor connected until its native download activation has completed.
      status.textContent = notice; status.setAttribute("role", "status");
    } catch (reason) { event.preventDefault(); fail(reason); }
  }
  async function choose(file: File) {
    if (denied() || !options.snapshot() || !options.schema()) return;
    const current = ++generation, schema = structuredClone(options.schema()!), revision = options.snapshot()!.revision;
    staged = undefined; openRecords.clear(); reading = true; error = false; notice = "Lettura locale del file… Nessun invio al servizio."; notify();
    try {
      if (file.size > recipeFileMaxBytes || file.size === 0) throw new RecipeStoreError("RECIPE_FILE");
      const bytes = await file.arrayBuffer(); let source: string;
      try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new RecipeStoreError("RECIPE_FILE"); }
      const parsed = parseRecipeFile(source), preview = previewRecipeImport(schema, parsed);
      if (!active || current !== generation) return;
      staged = { file: parsed, name: file.name, preview, revision };
      notice = "File letto soltanto nel browser. Controlla ogni differenza; il servizio verificherà di nuovo schema, valori, permessi e revisione."; error = false;
    } catch (reason) { if (active && current === generation) fail(reason); }
    finally { if (active && current === generation) { reading = false; notify(); } }
  }
  async function apply() {
    if (!staged || denied() || !permitted() || options.snapshot()?.revision !== staged.revision) return;
    const current = staged, epoch = generation;
    const command: RecipeCommand = { id: crypto.randomUUID().replaceAll("-", ""), expectedRevision: current.revision, action: "import", schemaId: current.file.schema.id, recordId: "batch", fields: current.file.schema.fields, records: current.preview.records };
    controller = new AbortController();
    try {
      const result = await client.send(command, controller.signal);
      if (!active || epoch !== generation) return;
      staged = undefined; fileInput.value = ""; notice = "Importazione salvata in un’unica operazione nell’archivio. Nessuna ricetta eliminata e nessun trasferimento al PLC."; error = false;
      options.saved(result.snapshot); notify();
    } catch (reason) { if (active && epoch === generation) fail(reason); }
    finally { controller = undefined; }
  }
  function render() {
    const section = make("section"); section.dataset.recipeExchange = "";
    section.append(make("h2", "Scambio ricette con file"));
    const status = make("p", notice); status.setAttribute("role", error ? "alert" : "status"); section.append(status);
    const actions = make("div"); actions.className = "recipe-toolbar recipe-file-toolbar";
    const exportLink = make("a", "Esporta schema JSON"); exportLink.href = "#"; exportLink.download = "ricette.framecraft.json"; exportLink.setAttribute("role", "button"); exportLink.setAttribute("aria-disabled", String(denied())); exportLink.tabIndex = denied() ? -1 : 0; exportLink.dataset.recipeFocus = "export";
    exportLink.addEventListener("click", event => download(exportLink, event, status)); exportLink.addEventListener("keydown", event => { if (event.key === " ") { event.preventDefault(); if (!denied()) exportLink.click(); } }); actions.append(exportLink);
    const label = make("label", "Importa file Framecraft · JSON, massimo 2 MB"); fileInput.disabled = denied(); label.append(fileInput); actions.append(label); section.append(actions);
    section.append(make("p", "Un file riguarda un solo schema. Gli ID già presenti vengono sostituiti; gli altri aggiunti. Le ricette assenti dal file restano invariate. Non è un backup dell’intero progetto né un formato CSV/TSV vendor."));
    if (!permitted()) section.append(make("p", "Per confermare serve il permesso server “Importare più ricette da file”. Creare o modificare singole ricette non lo abilita."));
    if (!staged) return section;
    const current = staged, { preview } = current, changed = preview.changes.filter(item => item.kind !== "unchanged");
    const review = make("section"); review.className = "recipe-review"; review.setAttribute("aria-label", "Confronto importazione ricette");
    review.append(make("h3", "Confronto prima dell’importazione"), make("p", current.name), make("p", `Origine: sequenza ${current.file.source.sequence}, esportata ${current.file.source.exportedAt}. La revisione del file non sostituisce quella attuale.`));
    review.append(make("p", `${preview.changes.filter(item => item.kind === "create").length} nuove · ${preview.changes.filter(item => item.kind === "update").length} da sostituire · ${preview.changes.filter(item => item.kind === "unchanged").length} identiche · ${preview.kept} conservate · ${preview.total} totali.`));
    // Details keep large imports readable and keyboard-operable without wide tables on touch panels.
    for (const item of preview.changes) {
      const details = make("details"), summary = make("summary", `${item.kind === "create" ? "Nuova" : item.kind === "update" ? "Sostituisce" : "Identica"}: ${item.after.name} · ID ${item.id}`);
      summary.dataset.recipeFocus = "import-" + item.id; details.append(summary);
      const populate = () => {
        if (details.querySelector("dl")) return;
        const values = make("dl"); if (item.before?.name !== item.after.name) values.append(make("dt", "Nome"), make("dd", shown(item.before?.name) + " → " + shown(item.after.name)));
        for (const field of current.file.schema.fields) if (!item.before || item.before.values[field.id] !== item.after.values[field.id]) values.append(make("dt", field.name + (field.unit ? " · " + field.unit : "")), make("dd", shown(item.before?.values[field.id]) + " → " + shown(item.after.values[field.id])));
        if (!values.childNodes.length) values.append(make("dt", "Valori"), make("dd", "Nessuna differenza")); details.append(values);
      };
      details.open = openRecords.has(item.id); if (details.open) populate();
      details.addEventListener("toggle", () => { if (details.open) { openRecords.add(item.id); populate(); } else openRecords.delete(item.id); }); review.append(details);
    }
    const stale = current.revision !== options.snapshot()?.revision;
    if (stale) {
      review.append(make("p", "L’archivio è cambiato. Rileggilo, poi rigenera e ricontrolla il confronto. Non viene forzata una sovrascrittura."));
      review.append(button("Rigenera confronto sulla copia riletta", () => {
        try { const schema = options.schema(), snapshot = options.snapshot(); if (!schema || !snapshot) return; current.preview = previewRecipeImport(schema, current.file); current.revision = snapshot.revision; error = false; notice = "Confronto aggiornato. Ricontrolla i valori prima della conferma."; notify(); }
        catch (reason) { fail(reason); }
      }));
    }
    const controls = make("div"); controls.className = "recipe-toolbar";
    controls.append(button("Conferma importazione nell’archivio", () => { void apply(); }, stale || !changed.length || !permitted()), button("Scarta importazione", () => { staged = undefined; error = false; notice = "Importazione scartata. Nessun valore salvato."; notify(); })); review.append(controls); section.append(review); return section;
  }
  return {
    render, get dirty() { return !!staged || reading; },
    clear() { generation++; staged = undefined; fileInput.value = ""; reading = false; openRecords.clear(); error = false; notice = "Confronto chiuso. Puoi esportare la copia letta o scegliere un altro file."; },
    reset() { generation++; controller?.abort(); staged = undefined; fileInput.value = ""; reading = false; openRecords.clear(); releaseDownloads(); error = false; notice = "Accesso cambiato. Rileggi l’archivio prima di usare i file."; },
    dispose() { active = false; generation++; controller?.abort(); staged = undefined; fileInput.value = ""; releaseDownloads(); },
  };
}
