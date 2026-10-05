/** Keeps a file's line endings the way its author wrote them.
 *
 * The editor patches ranges of a file it read from disk, so the untouched lines keep whatever endings
 * they had. What it inserts, though, is written here with `\n`: a component from the palette, a
 * generated click, a new data row. Dropped into a file saved with CRLF — which is every file of a
 * catalog written on Windows — that turns one small edit into a diff of the whole file, and a shared
 * template becomes impossible to review. */
export function matchLineEndings(text: string) {
  if (!text.includes("\r\n")) return text;
  return text.replace(/\r?\n/g, "\r\n");
}

/** What a file uses now, so a new file written beside it can be written the same way. */
export function dominantLineEnding(text: string) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
