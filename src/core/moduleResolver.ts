export type ReadSource = (file: string) => Promise<string>;

export interface LoadedModule {
  file: string;
  source: string;
}

function normalize(path: string) {
  return path.replaceAll("\\", "/");
}

/** Where a relative import points, without its extension. Bare specifiers are packages: the editor
 * never follows those, because a project's own data never lives in node_modules. */
export function resolveRelative(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const parts = normalize(fromFile).split("/");
  parts.pop();
  for (const part of specifier.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.length ? parts.join("/") : undefined;
}

function candidates(base: string) {
  if (/\.(jsx?|tsx?|mjs|cjs)$/.test(base)) return [base];
  return ["jsx", "tsx", "js", "ts", "mjs"].flatMap((extension) => [`${base}.${extension}`, `${base}/index.${extension}`]);
}

// Which candidate answered for a given base path. Only the path is remembered: the content is read
// again every time, or an edit made minutes ago would be invisible.
const resolvedPaths = new Map<string, string | null>();

export function clearModuleCache() {
  resolvedPaths.clear();
}

/** Follows one import and hands back the file it names together with its current content. */
export async function loadModule(fromFile: string, specifier: string, read: ReadSource): Promise<LoadedModule | undefined> {
  const base = resolveRelative(fromFile, specifier);
  if (!base) return undefined;
  const known = resolvedPaths.get(base);
  if (known === null) return undefined;
  if (known) {
    try { return { file: known, source: await read(known) }; } catch { resolvedPaths.delete(base); }
  }
  for (const candidate of candidates(base)) {
    try {
      const source = await read(candidate);
      resolvedPaths.set(base, candidate);
      return { file: candidate, source };
    } catch { /* The next extension is tried: a miss here is how resolution works, not a failure. */ }
  }
  resolvedPaths.set(base, null);
  return undefined;
}
