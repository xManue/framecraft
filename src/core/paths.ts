/** Project roots arrive from the host in native form, so joins follow the separator the root uses. */
export function joinProjectPath(root: string, relative: string): string {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]$/, "")}${separator}${relative.replace(/^[\\/]+/, "").replaceAll("/", separator)}`;
}

/** Paths reach the editor from Vite with forward slashes and from the host in native form, so the
 * comparison is separator- and case-insensitive. */
export function insideProject(root: string | undefined, file: string): boolean {
  if (!root) return true;
  const normalize = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  return `${normalize(file)}/`.startsWith(`${normalize(root)}/`);
}
