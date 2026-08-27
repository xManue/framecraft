/** Project roots arrive from the host in native form, so joins follow the separator the root uses. */
export function joinProjectPath(root: string, relative: string): string {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]$/, "")}${separator}${relative.replace(/^[\\/]+/, "").replaceAll("/", separator)}`;
}
