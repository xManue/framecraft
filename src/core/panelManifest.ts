/** What a panel says the editor may change, page by page.
 *
 * The paletti non stanno in Framecraft: stanno nel `panel.json` del pannello, scritti da chi ha fatto
 * il template. L'editor non sa cos'è una zona di una macchina — sa solo che questa pagina dichiara una
 * lista di dati, quali campi ha e cosa si può farci. Un pannello senza `editor` nel manifesto si
 * comporta esattamente come prima: l'editor libero di sempre. */

export type FieldType = "text" | "number" | "point" | "path" | "choice" | "reference" | "tag";

export interface AffordanceField {
  /** Property of the item, `a.b` for a nested one. */
  path: string;
  label: string;
  type: FieldType;
  /** Choices for `type: "choice"`. */
  options?: { value: string; label: string }[];
  /** For `type: "reference"`: which declared source the value is picked from. */
  source?: string;
  /** A point or a path this field is drawn by pointing at the picture. */
  pickOnStage?: boolean;
  optional?: boolean;
}

export interface AffordanceList {
  file: string;
  list: string;
  /** Only the items whose properties match are shown and written by this affordance. */
  filter?: Record<string, string>;
}

/** Le forme di modifica dichiarabile che l'editor sa offrire. Una lista di righe (le impostazioni di
 * una macchina) e una lista di zone su una foto: la differenza sta nei campi, non nel meccanismo. */
export type AffordanceType = "image-zones" | "settings-list";

export interface Affordance {
  id: string;
  type: AffordanceType;
  label: string;
  description?: string;
  can: ("add" | "remove" | "rename" | "move" | "outline")[];
  data: AffordanceList;
  stage?: { file: string; object: string; selector: string };
  /** Another list the items point at — the machine parts a zone commands. */
  references?: Record<string, AffordanceList & { id: string; label: string }>;
  fields: AffordanceField[];
  /** Values every new item starts from. In `id`, `{pageId}`, `{partId}` and `{name}` are replaced
   * when the item is created. */
  defaults?: Record<string, unknown>;
}

export interface ManifestPage {
  id: string;
  name?: string;
  /** Nothing but the affordances may be edited on this page. */
  locked: boolean;
  affordances: Affordance[];
  /** Il numero della pagina secondo lo standard (`N000 + 1 + 40k`). Dichiararlo qui serve a due
   * cose: l'editor non riassegna un numero già preso, e chi genererà il progetto WinCC sa quale
   * pagina è. Un pannello che non lo dichiara continua a funzionare come prima. */
  pageNumber?: number;
  /** La sezione della barra laterale a cui la pagina appartiene (`main`, `settings`, …). */
  section?: string;
}

export interface PanelManifest {
  id?: string;
  name?: string;
  version?: string;
  pages: ManifestPage[];
}

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? value as Record<string, unknown> : {});
const asString = (value: unknown) => typeof value === "string" ? value : undefined;

function readList(value: unknown): AffordanceList | undefined {
  const raw = asRecord(value);
  const file = asString(raw.file);
  const list = asString(raw.list);
  if (!file || !list) return undefined;
  const filter: Record<string, string> = {};
  for (const [key, item] of Object.entries(asRecord(raw.filter))) if (typeof item === "string") filter[key] = item;
  return { file, list, filter: Object.keys(filter).length ? filter : undefined };
}

function readField(value: unknown): AffordanceField | undefined {
  const raw = asRecord(value);
  const path = asString(raw.path);
  const type = asString(raw.type);
  if (!path || !type || !["text", "number", "point", "path", "choice", "reference", "tag"].includes(type)) return undefined;
  const options = Array.isArray(raw.options)
    ? raw.options.flatMap((option) => {
      const entry = asRecord(option);
      const optionValue = asString(entry.value);
      return optionValue ? [{ value: optionValue, label: asString(entry.label) ?? optionValue }] : [];
    })
    : undefined;
  return {
    path,
    label: asString(raw.label) ?? path,
    type: type as FieldType,
    options,
    source: asString(raw.source),
    pickOnStage: raw.pickOn === "stage" || raw.drawOn === "stage",
    optional: raw.optional === true,
  };
}

function readAffordance(value: unknown): Affordance | undefined {
  const raw = asRecord(value);
  const id = asString(raw.id);
  const data = readList(raw.data);
  const type = asString(raw.type);
  // Only the kind of affordance the editor can actually offer is kept: an unknown one is a panel
  // written for a newer editor, and pretending to support it would be worse than ignoring it.
  if (!id || !data || (type !== "image-zones" && type !== "settings-list")) return undefined;
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).flatMap((field) => readField(field) ?? []);
  if (!fields.length) return undefined;
  const references: Record<string, AffordanceList & { id: string; label: string }> = {};
  for (const [name, entry] of Object.entries(asRecord(raw.references))) {
    const list = readList(entry);
    const source = asRecord(entry);
    if (list) references[name] = { ...list, id: asString(source.id) ?? "id", label: asString(source.label) ?? "label" };
  }
  const stageRaw = asRecord(raw.stage);
  const stageFile = asString(stageRaw.file);
  const stageObject = asString(stageRaw.object);
  const defaults: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(asRecord(raw.defaults))) defaults[key] = entry;
  return {
    id,
    type,
    label: asString(raw.label) ?? id,
    description: asString(raw.description),
    can: (Array.isArray(raw.can) ? raw.can : []).filter((item): item is Affordance["can"][number] =>
      typeof item === "string" && ["add", "remove", "rename", "move", "outline"].includes(item)),
    data,
    stage: stageFile && stageObject ? { file: stageFile, object: stageObject, selector: asString(stageRaw.selector) ?? ".machine-zone-map" } : undefined,
    references: Object.keys(references).length ? references : undefined,
    fields,
    defaults: Object.keys(defaults).length ? defaults : undefined,
  };
}

/** Reads `panel.json`. Anything it does not understand is dropped instead of failing: a manifest is
 * written by hand, and a typo in one page must not take the whole panel down with it. */
export function parsePanelManifest(text: string): PanelManifest | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return undefined; }
  const raw = asRecord(parsed);
  const editor = asRecord(raw.editor);
  const pages = (Array.isArray(editor.pages) ? editor.pages : []).flatMap((value) => {
    const page = asRecord(value);
    const id = asString(page.id);
    if (!id) return [];
    const affordances = (Array.isArray(page.affordances) ? page.affordances : []).flatMap((item) => readAffordance(item) ?? []);
    const pageNumber = typeof page.pageNumber === "number" && Number.isInteger(page.pageNumber) ? page.pageNumber : undefined;
    return [{ id, name: asString(page.name), locked: page.locked === true, affordances, pageNumber, section: asString(page.section) }];
  });
  // Una pagina dichiarata solo per il suo numero non ha affordance, ma vale lo stesso: il manifesto
  // resta l'elenco di quello che il pannello dichiara.
  if (!pages.length) return undefined;
  return { id: asString(raw.id), name: asString(raw.name), version: asString(raw.version), pages };
}

/** The affordances a page declares. The page is matched on the id the panel uses for it. */
export function pageAffordances(manifest: PanelManifest | undefined, pageId: string | undefined): Affordance[] {
  return manifestPage(manifest, pageId)?.affordances ?? [];
}

export function manifestPage(manifest: PanelManifest | undefined, pageId: string | undefined): ManifestPage | undefined {
  if (!manifest || !pageId) return undefined;
  return manifest.pages.find((page) => page.id === pageId)
    ?? manifest.pages.find((page) => page.id.startsWith("/") && pageId.endsWith(`:${page.id}`));
}

/** Reads and writes `a.b` inside one item, so a field of the manifest can point at a nested value. */
export function fieldValue(item: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), item);
}

export function withFieldValue<T extends Record<string, unknown>>(item: T, path: string, value: unknown): T {
  const [key, ...rest] = path.split(".");
  if (!rest.length) return { ...item, [key]: value };
  const nested = item[key] && typeof item[key] === "object" ? item[key] as Record<string, unknown> : {};
  return { ...item, [key]: withFieldValue(nested, rest.join("."), value) };
}

/** Scrive nel `panel.json` il numero di una pagina, senza toccare nient'altro.
 *
 * Torna il testo nuovo, o `undefined` se non c'era niente da cambiare (numero già scritto uguale) o
 * se il file non è un JSON leggibile. È una funzione pura apposta: la scrittura su disco la fa lo
 * store, e qui si può provare che il resto del manifesto rimane com'era. */
export function manifestWithPageNumber(
  text: string,
  page: { id: string; name?: string; pageNumber: number; section?: string },
): string | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return undefined; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const root = parsed as Record<string, unknown>;

  const editor: Record<string, unknown> = root.editor && typeof root.editor === "object" && !Array.isArray(root.editor)
    ? { ...(root.editor as Record<string, unknown>) }
    : { version: 1 };
  const pages = Array.isArray(editor.pages) ? [...editor.pages as unknown[]] : [];
  const at = pages.findIndex((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === page.id);
  const existing: Record<string, unknown> = at >= 0
    ? { ...(pages[at] as Record<string, unknown>) }
    : { id: page.id, locked: false, affordances: [] };
  if (at >= 0 && existing.pageNumber === page.pageNumber && (!page.section || existing.section === page.section)) return undefined;

  existing.pageNumber = page.pageNumber;
  if (page.section) existing.section = page.section;
  if (page.name && !existing.name) existing.name = page.name;
  if (at >= 0) pages[at] = existing; else pages.push(existing);
  editor.pages = pages;

  const indent = /\n(\s+)"/.exec(text)?.[1]?.length ?? 2;
  return `${JSON.stringify({ ...root, editor }, undefined, indent)}\n`;
}

/** Tutti i numeri che il manifesto dichiara: sono presi, l'editor non li riusa. */
export function manifestPageNumbers(manifest: PanelManifest | undefined): number[] {
  if (!manifest) return [];
  return manifest.pages.flatMap((page) => page.pageNumber === undefined ? [] : [page.pageNumber]);
}
