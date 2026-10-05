import type { Viewport } from "../core/types";

export interface PanelFormat {
  id: Viewport;
  label: string;
  size: string;
  width: number;
  height: number;
}

/** The screens an HMI actually runs on. A panel is a fixed piece of glass bolted to a machine, not a
 * window someone resizes, so the canvas offers the real formats instead of phones and tablets: what
 * matters here is whether the page fits the panel that was bought, and that is a yes or a no. */
export const panelFormats: PanelFormat[] = [
  { id: "panel-1920", label: "21\" Full HD", size: "1920 × 1080", width: 1920, height: 1080 },
  { id: "panel-1280", label: "15\" wide", size: "1280 × 800", width: 1280, height: 800 },
  { id: "panel-1024", label: "12\" 4:3", size: "1024 × 768", width: 1024, height: 768 },
  { id: "panel-800", label: "7\" wide", size: "800 × 480", width: 800, height: 480 },
  { id: "libero", label: "Libero", size: "segue il contenuto", width: 1440, height: 760 },
];

export function panelFormat(id: Viewport): PanelFormat {
  return panelFormats.find((format) => format.id === id) ?? panelFormats[panelFormats.length - 1];
}

export const isPanelFormat = (value: unknown): value is Viewport =>
  typeof value === "string" && panelFormats.some((format) => format.id === value);
