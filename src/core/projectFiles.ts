import { insideProject } from "./paths";
import type { FileEntry } from "./types";

export type ProjectFileKind = "source" | "image" | "text" | "unsupported";
export function projectFileKind(path: string): ProjectFileKind {
  if (/\.[jt]sx?$/i.test(path)) return "source";
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(path)) return "image";
  if (/\.(css|scss|sass|less|json|md|txt|html?|xml|ya?ml|toml|csv|mjs|cjs|mts|cts)$/i.test(path)) return "text";
  return "unsupported";
}

export function filterProjectFiles(entries: FileEntry[], query: string): FileEntry[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return entries;
  return entries.flatMap((entry) => {
    if (entry.name.toLocaleLowerCase().includes(search)) return [entry];
    const children = entry.children && filterProjectFiles(entry.children, search);
    return children?.length ? [{ ...entry, children }] : [];
  });
}

export function projectImageUrl(root: string, path: string, previewUrl?: string): string | undefined {
  if (!previewUrl || !insideProject(root, path) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)) return;
  try {
    const url = new URL(previewUrl);
    if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return;
    url.pathname = "/@fs/" + path.replaceAll("\\", "/").split("/").map((part, index) => index === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)).join("/");
    url.search = ""; url.hash = "";
    return url.toString();
  } catch { return; }
}
