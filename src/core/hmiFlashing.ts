import type { Dynamization } from "./hmiStandard";
import { createHmiPropertyFlashing, createHmiPropertyFlashingDomSurface } from "../../scripts/hmi-property-flashing.mjs";

export const hmiFlashingProperties = ["BackColor", "ForeColor", "BorderColor"] as const;
export type HmiFlashingProperty = (typeof hmiFlashingProperties)[number];

export interface HmiFlashingVisual {
  property: HmiFlashingProperty;
  color: string;
  alternateColor: string;
  periodMs: number;
}

const flashingRates = { Slow: 2000, Medium: 1000, Fast: 500 } as const;

function flashingNumber(value: string | undefined): number | undefined {
  if (value == null || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function flashingProperty(value: string): HmiFlashingProperty | undefined {
  return hmiFlashingProperties.includes(value as HmiFlashingProperty) ? value as HmiFlashingProperty : undefined;
}

function flashingCssColor(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 8) return color;
  const alpha = Number.parseInt(hex.slice(0, 2), 16);
  const rgb = hex.slice(2);
  if (alpha === 255) return `#${rgb}`;
  const [red, green, blue] = [rgb.slice(0, 2), rgb.slice(2, 4), rgb.slice(4, 6)].map((part) => Number.parseInt(part, 16));
  return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")})`;
}

/** Risolve la condizione senza toccare il valore base della proprietà, come fa Unified. */
export function resolveHmiFlashing(item: Dynamization, values: Readonly<Record<string, string>>): { active: false } | { active: true; visual: HmiFlashingVisual } | { reason: string } {
  if (item.kind !== "Flashing") return { reason: "La dinamizzazione non e' di tipo lampeggio." };
  const property = flashingProperty(item.property);
  if (!property) return { reason: `${item.property} non e' una proprieta' colore compatibile col lampeggio.` };
  const condition = item.flashingCondition ?? "Always";
  if (condition === "Never") return { active: false };
  let active = condition === "Always";
  if (condition === "RangeViolation") {
    if (!item.tag?.trim()) return { reason: "Il superamento limiti richiede una variabile PLC." };
    const value = flashingNumber(values[item.tag]);
    if (value === undefined) return { reason: `Il tag ${item.tag} non ha un valore numerico di prova.` };
    if (item.minimum === undefined && item.maximum === undefined) return { reason: "Il superamento limiti richiede almeno un limite minimo o massimo." };
    active = (item.minimum !== undefined && value < item.minimum) || (item.maximum !== undefined && value > item.maximum);
  }
  if (!active) return { active: false };
  if (!item.color?.trim() || !item.alternateColor?.trim()) return { reason: "Il lampeggio richiede due colori." };
  const color = flashingCssColor(item.color);
  const alternateColor = flashingCssColor(item.alternateColor);
  if (color.toLocaleLowerCase() === alternateColor.toLocaleLowerCase()) return { reason: "I due colori del lampeggio devono essere diversi." };
  return { active: true, visual: { property, color, alternateColor, periodMs: flashingRates[item.flashingRate ?? "Medium"] } };
}

const animationNames: Record<HmiFlashingProperty, string> = {
  BackColor: "framecraft-hmi-flash-background",
  ForeColor: "framecraft-hmi-flash-foreground",
  BorderColor: "framecraft-hmi-flash-border",
};

const variableStem: Record<HmiFlashingProperty, string> = {
  BackColor: "background",
  ForeColor: "foreground",
  BorderColor: "border",
};

export function hmiFlashingInlineStyle(visuals: readonly HmiFlashingVisual[]): Record<string, string> {
  const style: Record<string, string> = {};
  for (const visual of visuals) {
    const stem = variableStem[visual.property];
    style[`--framecraft-hmi-flash-${stem}-color`] = visual.color;
    style[`--framecraft-hmi-flash-${stem}-alternate`] = visual.alternateColor;
  }
  if (visuals.length) style.animation = visuals.map((visual) => `${animationNames[visual.property]} ${visual.periodMs}ms steps(1, end) infinite`).join(", ");
  return style;
}

export const hmiFlashingCss = `
@keyframes framecraft-hmi-flash-background { 0%,49.999% { background-color: var(--framecraft-hmi-flash-background-color) } 50%,100% { background-color: var(--framecraft-hmi-flash-background-alternate) } }
@keyframes framecraft-hmi-flash-foreground { 0%,49.999% { color: var(--framecraft-hmi-flash-foreground-color) } 50%,100% { color: var(--framecraft-hmi-flash-foreground-alternate) } }
@keyframes framecraft-hmi-flash-border { 0%,49.999% { border-color: var(--framecraft-hmi-flash-border-color) } 50%,100% { border-color: var(--framecraft-hmi-flash-border-alternate) } }
@media (prefers-reduced-motion: reduce) {
  [style*="framecraft-hmi-flash-"] { animation: none !important; outline: 3px double var(--framecraft-hmi-flash-background-color, var(--framecraft-hmi-flash-foreground-color, var(--framecraft-hmi-flash-border-color, currentColor))) !important; outline-offset: 2px; }
  [style*="framecraft-hmi-flash-background"] { background-color: var(--framecraft-hmi-flash-background-alternate) !important; background-image: repeating-linear-gradient(135deg, var(--framecraft-hmi-flash-background-color) 0 5px, var(--framecraft-hmi-flash-background-alternate) 5px 10px) !important; }
  [style*="framecraft-hmi-flash-foreground"] { color: var(--framecraft-hmi-flash-foreground-alternate) !important; text-decoration: underline double; }
  [style*="framecraft-hmi-flash-border"] { border-color: var(--framecraft-hmi-flash-border-alternate) !important; border-style: double !important; }
}`;

function rgbChannels(color: string): [number, number, number] | undefined {
  const raw = color.replace("#", "");
  const hex = raw.length === 8 ? raw.slice(2) : raw;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

export function hmiFlashingContrast(left: string, right: string): number | undefined {
  const luminance = (color: string) => {
    const channels = rgbChannels(color);
    if (!channels) return undefined;
    const values = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  const first = luminance(left);
  const second = luminance(right);
  if (first === undefined || second === undefined) return undefined;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function hmiFlashingRuntimeSource(): string {
  return `// @ts-nocheck\nconst hmiFlashingProperties = ${JSON.stringify(hmiFlashingProperties)};\nconst flashingRates = ${JSON.stringify(flashingRates)};\n${String(flashingNumber)}\n${String(flashingProperty)}\n${String(flashingCssColor)}\nexport ${String(resolveHmiFlashing)}\nconst animationNames = ${JSON.stringify(animationNames)};\nconst variableStem = ${JSON.stringify(variableStem)};\nexport ${String(hmiFlashingInlineStyle)}\nexport const hmiFlashingCss = ${JSON.stringify(hmiFlashingCss)};\nexport ${String(createHmiPropertyFlashing)}\nexport ${String(createHmiPropertyFlashingDomSurface)}\n`;
}
