function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function translatedCoordinate(current: number, next: number, translate: string | number | undefined, axis: "x" | "y") {
  const parts = String(translate ?? "").match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const x = parts[0] ?? 0;
  const y = parts[1] ?? 0;
  return axis === "x" ? `${rounded(x + next - current)}px ${rounded(y)}px` : `${rounded(x)}px ${rounded(y + next - current)}px`;
}
