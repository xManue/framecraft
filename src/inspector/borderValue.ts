export interface BorderParts {
  width: number;
  style: string;
  color: string;
}

export const borderStyles = ["solid", "dashed", "dotted", "double", "none"];

/** Reads the three decisions hidden inside one CSS border. Whatever is missing gets a sane answer
 * rather than an empty control: an element with no border still has to show a thickness of zero. */
export function parseBorder(value: string | number | undefined): BorderParts {
  const current = String(value ?? "").trim();
  const tokens = current.toLowerCase().split(/\s+/);
  const width = Number.parseFloat(current.match(/(-?[\d.]+)px/)?.[1] ?? "") || 0;
  const style = borderStyles.find((candidate) => tokens.includes(candidate)) ?? (current && width ? "solid" : "none");
  const color = current.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i)?.[0] ?? "#8b8b8b";
  return { width, style, color };
}

/** Writes them back as the one property CSS understands. A border of no thickness is `none`, not
 * `0px solid`, so removing a line really removes it. */
export function formatBorder(parts: BorderParts): string {
  if (parts.style === "none" || parts.width <= 0) return "none";
  return `${parts.width}px ${parts.style} ${parts.color}`;
}
