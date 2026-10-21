import { create } from "zustand";

export function safeThumbnail(image: unknown): image is string {
  if (typeof image !== "string" || image.length > 180000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return false;
  try {
    const bytes = atob(image.slice(22));
    if (!bytes.startsWith("\x89PNG\r\n\x1a\n") || bytes.slice(12, 16) !== "IHDR") return false;
    const number = (offset: number) => ((bytes.charCodeAt(offset) * 0x1000000) + (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3));
    const width = number(16), height = number(20);
    if (width < 1 || width > 240 || height < 1 || height > 160) return false;
    let position = 8, chunks = 0, data = false;
    while (position + 12 <= bytes.length && ++chunks <= 64) {
      const length = number(position), type = bytes.slice(position + 4, position + 8);
      if (length < 0 || position + 12 + length > bytes.length || !["IHDR", "IDAT", "IEND", "sRGB", "gAMA", "pHYs", "bKGD", "sBIT"].includes(type)) return false;
      if (position === 8 && type !== "IHDR" || type === "IHDR" && (position !== 8 || length !== 13) || type === "IEND" && length !== 0) return false;
      if (type === "IDAT") data = true;
      position += length + 12;
      if (type === "IEND") return data && position === bytes.length;
    }
  } catch { return false; }
  return false;
}

export const usePageThumbnails = create<{
  project?: string;
  entries: Record<string, string>;
  reset(project?: string): void;
  put(project: string, page: string, image: unknown): void;
}>((set, get) => ({
  entries: {},
  reset(project) { if (get().project !== project) set({ project, entries: {} }); },
  put(project, page, image) {
    if (get().project !== project || !page || !safeThumbnail(image) || get().entries[page] === image) return;
    const entries = { ...get().entries }; delete entries[page]; entries[page] = image;
    let total = Object.values(entries).reduce((sum, value) => sum + value.length, 0);
    for (const key of Object.keys(entries)) {
      if (Object.keys(entries).length <= 64 && total <= 4000000) break;
      total -= entries[key].length; delete entries[key];
    }
    set({ entries });
  },
}));
