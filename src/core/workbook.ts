/** Reads an .xlsx the way the panels are actually delivered: an export straight out of TIA Portal,
 * opened from the editor without a conversion step in between. A spreadsheet is a ZIP of XML, and
 * both halves are already in the platform — the archive is inflated by DecompressionStream and the
 * sheets are read by DOMParser — so no library sits between the file and the tag list. */

export interface WorkbookSheet {
  name: string;
  /** Rows of cells as text, first row included: an export puts its column titles there. */
  rows: string[][];
}

function view(data: ArrayBuffer) {
  return new DataView(data);
}

/** Where the central directory of the archive starts. It is at the end of the file, behind a comment
 * of unknown length, so it is found by scanning backwards for its signature. */
function directoryStart(data: ArrayBuffer): { offset: number; count: number } {
  const bytes = view(data);
  const first = Math.max(0, data.byteLength - 22 - 0xffff);
  for (let position = data.byteLength - 22; position >= first; position -= 1) {
    if (bytes.getUint32(position, true) !== 0x06054b50) continue;
    return { count: bytes.getUint16(position + 10, true), offset: bytes.getUint32(position + 16, true) };
  }
  throw new Error("Il file non è un foglio Excel (.xlsx) leggibile.");
}

async function inflate(data: ArrayBuffer, from: number, size: number, method: number): Promise<Uint8Array> {
  const slice = new Uint8Array(data, from, size);
  if (method === 0) return slice;
  if (method !== 8) throw new Error(`Il file usa una compressione non supportata (${method}).`);
  if (typeof DecompressionStream !== "function") throw new Error("Questo ambiente non sa decomprimere un file .xlsx.");
  // The bytes are handed over as a response body rather than a Blob: it is the one wrapper that is
  // a stream everywhere this runs, the panel's webview and the test runner alike.
  const body = new Response(slice).body;
  if (!body) throw new Error("Questo ambiente non sa decomprimere un file .xlsx.");
  return new Uint8Array(await new Response(body.pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
}

/** Every entry of the archive, by name. A spreadsheet holds a handful of small parts, so they are
 * all read at once rather than seeking twice through the same file. */
async function readArchive(data: ArrayBuffer): Promise<Map<string, string>> {
  const bytes = view(data);
  const { offset, count } = directoryStart(data);
  const decoder = new TextDecoder();
  const entries = new Map<string, string>();
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    if (bytes.getUint32(cursor, true) !== 0x02014b50) break;
    const method = bytes.getUint16(cursor + 10, true);
    const compressedSize = bytes.getUint32(cursor + 20, true);
    const nameLength = bytes.getUint16(cursor + 28, true);
    const extraLength = bytes.getUint16(cursor + 30, true);
    const commentLength = bytes.getUint16(cursor + 32, true);
    const localOffset = bytes.getUint32(cursor + 42, true);
    const name = decoder.decode(new Uint8Array(data, cursor + 46, nameLength));
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("Il file .xlsx usa il formato ZIP64, non supportato.");
    // The local header repeats the name and carries its own extra field, whose length is the only
    // way to know where the compressed bytes really begin.
    const localName = bytes.getUint16(localOffset + 26, true);
    const localExtra = bytes.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    if (/\.(xml|rels)$/i.test(name)) entries.set(name, decoder.decode(await inflate(data, start, compressedSize, method)));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseXml(source: string): Document {
  if (typeof DOMParser !== "function") throw new Error("Questo ambiente non sa leggere il contenuto di un file .xlsx.");
  return new DOMParser().parseFromString(source, "application/xml");
}

/** Elements by their local name, whatever prefix the file uses. A TIA export writes `<x:sheet>`
 * where Excel writes `<sheet>`, and asking for the plain name found nothing in half the files. */
function elements(node: Document | Element, name: string): Element[] {
  return [...node.getElementsByTagNameNS("*", name)];
}

/** Column letters to a zero-based index: `A` is 0, `AA` is 26. A row leaves out its empty cells, so
 * without this a missing value would shift every column after it. */
export function columnIndex(reference: string): number {
  let index = 0;
  for (const letter of reference.replace(/\d+/g, "").toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function sheetRows(document: Document, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of elements(document, "row")) {
    const cells: string[] = [];
    for (const cell of elements(row, "c")) {
      const type = cell.getAttribute("t");
      const value = elements(cell, "v")[0]?.textContent ?? "";
      const inline = elements(cell, "t").map((node) => node.textContent ?? "").join("");
      const text = type === "s" ? shared[Number(value)] ?? "" : type === "inlineStr" ? inline : value;
      const at = columnIndex(cell.getAttribute("r") ?? "");
      while (cells.length < at) cells.push("");
      cells[at] = text;
    }
    rows.push(cells);
  }
  return rows;
}

export async function readWorkbook(data: ArrayBuffer): Promise<WorkbookSheet[]> {
  const parts = await readArchive(data);
  const workbook = parts.get("xl/workbook.xml");
  if (!workbook) throw new Error("Il file non contiene un foglio di lavoro Excel.");
  const relationships = new Map<string, string>();
  const rels = parts.get("xl/_rels/workbook.xml.rels");
  if (rels) {
    for (const node of elements(parseXml(rels), "Relationship")) {
      const id = node.getAttribute("Id");
      const target = node.getAttribute("Target");
      if (id && target) relationships.set(id, target.replace(/^\/?(xl\/)?/, ""));
    }
  }
  const strings = parts.get("xl/sharedStrings.xml");
  const shared = strings
    ? elements(parseXml(strings), "si").map((node) => elements(node, "t").map((text) => text.textContent ?? "").join(""))
    : [];
  const sheets: WorkbookSheet[] = [];
  for (const node of elements(parseXml(workbook), "sheet")) {
    const id = node.getAttribute("r:id") ?? node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = id ? relationships.get(id) : undefined;
    const part = target ? `xl/${target}` : undefined;
    const source = part ? parts.get(part) : undefined;
    if (!source) continue;
    sheets.push({ name: node.getAttribute("name") ?? `Foglio ${sheets.length + 1}`, rows: sheetRows(parseXml(source), shared) });
  }
  if (!sheets.length) throw new Error("Il file Excel non contiene fogli leggibili.");
  return sheets;
}
