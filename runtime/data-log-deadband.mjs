/** Shared by the service, editor preview and standalone browser logs. */
export function dataLogDeadbandValid(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "mode,value"
    && ["none", "absolute", "percentage"].includes(value.mode)
    && typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0;
}

export function effectiveDataLogDeadband(log, tag) {
  const policy = tag.deadband ?? log.deadband;
  return tag.mode === "on-change" && dataLogDeadbandValid(policy) && policy.mode !== "none" ? policy : undefined;
}

// Decimal strings retain Int64/UInt64 precision and exact decimal boundaries.
// Input and exponent budgets also bound BigInt work for untrusted browser data.
function decimal(value) {
  if (typeof value !== "string" || value.length > 4096 || !Number.isFinite(Number(value))) return;
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d{1,3}))?$/i.exec(value);
  if (!match) return;
  const exponent = Number(match[3] ?? 0);
  if (Math.abs(exponent) > 400) return;
  const [whole, fraction = ""] = match[2].split(".");
  const digits = (whole + fraction).replace(/^0+/, "") || "0";
  return { coefficient: BigInt((match[1] === "-" ? "-" : "") + digits), exponent: exponent - fraction.length };
}

const absolute = value => value < 0n ? -value : value;
const power = exponent => 10n ** BigInt(exponent);

/** Compare against the last admitted raw value; quality is handled by the caller. */
export function dataLogDeadbandAllows(previous, current, policy) {
  if (!policy || policy.mode === "none") return previous !== current;
  if (!dataLogDeadbandValid(policy)) return false;
  const next = decimal(current), threshold = decimal(String(policy.value));
  if (!next || !threshold) return false;
  if (previous === undefined) return true;
  const before = decimal(previous);
  if (!before) return false;
  const exponent = Math.min(before.exponent, next.exponent);
  const baseline = before.coefficient * power(before.exponent - exponent);
  const difference = absolute(next.coefficient * power(next.exponent - exponent) - baseline);
  if (difference === 0n) return false;
  if (policy.mode === "absolute") {
    const common = Math.min(exponent, threshold.exponent);
    return difference * power(exponent - common) >= threshold.coefficient * power(threshold.exponent - common);
  }
  // Percentage of |previous|, not engineering range. Leaving zero always qualifies.
  return threshold.exponent >= 0
    ? difference * 100n >= absolute(baseline) * threshold.coefficient * power(threshold.exponent)
    : difference * 100n * power(-threshold.exponent) >= absolute(baseline) * threshold.coefficient;
}
