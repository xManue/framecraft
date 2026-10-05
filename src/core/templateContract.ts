/** What a template of the shared library lets a panel change inside it.
 *
 * Ogni template del catalogo porta un `template.json` con `editableFiles`: i file che un pannello può
 * toccare — di solito i dati, lo stile e l'anteprima — mentre il componente resta del template. La
 * regola era già scritta lì; l'editor la ignorava, e bastava cancellare un elemento sul canvas per
 * svuotare un componente usato da tutte le macchine. */

export interface TemplateContract {
  id: string;
  name: string;
  /** Directory that owns the template.json, with forward slashes and no trailing slash. */
  dir: string;
  /** Paths relative to `dir`, exactly as the template declares them. */
  editableFiles: string[];
  entry?: string;
}

const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

export function parseTemplateContract(dir: string, text: string): TemplateContract | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return undefined; }
  const raw = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : undefined;
  if (!id) return undefined;
  // A template that declares nothing editable is not a template that forbids everything: it simply
  // has not been written with the editor in mind, and the old free behaviour is what it expects.
  if (!Array.isArray(raw.editableFiles)) return undefined;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : id,
    dir: normalize(dir),
    editableFiles: raw.editableFiles.filter((file): file is string => typeof file === "string").map(normalize),
    entry: typeof raw.entry === "string" ? normalize(raw.entry) : undefined,
  };
}

/** Where a file sits inside the template that owns it, or undefined when it is somewhere else. */
export function relativeToTemplate(contract: TemplateContract, file: string) {
  const path = normalize(file);
  const base = `${contract.dir}/`;
  if (!path.toLowerCase().startsWith(base.toLowerCase())) return undefined;
  return path.slice(base.length);
}

export function isEditableFile(contract: TemplateContract, file: string) {
  const relative = relativeToTemplate(contract, file);
  if (relative === undefined) return true;
  return contract.editableFiles.some((editable) => editable.toLowerCase() === relative.toLowerCase());
}

/** The directories to look in for the template.json that owns a file, nearest first. */
export function templateDirectories(file: string, levels = 6) {
  const parts = normalize(file).split("/");
  const directories: string[] = [];
  for (let index = parts.length - 1; index > 0 && directories.length < levels; index -= 1) {
    directories.push(parts.slice(0, index).join("/"));
  }
  return directories;
}

/** The editable files, said in a line: two names and a count. Eleven paths in a message is a wall
 * nobody reads, and the two that matter are always the data and the style. */
export function editableSummary(contract: TemplateContract, shown = 2) {
  const first = contract.editableFiles.slice(0, shown);
  const rest = contract.editableFiles.length - first.length;
  return rest > 0 ? `${first.join(", ")} e altri ${rest}` : first.join(", ") || "nessun file";
}
