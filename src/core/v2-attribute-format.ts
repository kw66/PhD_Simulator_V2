/** Remove floating-point noise without quantizing gameplay to its display precision. */
export function roundAttribute(value: number): number {
  const rounded = Number(value.toFixed(10));
  return rounded === 0 ? 0 : rounded;
}

const ATTRIBUTE_BOUNDARIES = [0, 2, 3, 5, 6, 12, 18, 20] as const;

function roundDisplay(value: number, digits: number): number {
  const [coefficient, exponent = "0"] = String(Math.abs(value)).split("e");
  const shifted = Math.round(Number(`${coefficient}e${Number(exponent) + digits}`));
  return Math.sign(value) * Number(`${shifted}e-${digits}`);
}

function format(value: number, precision: number, boundaries: readonly number[]): string {
  if (!Number.isFinite(value)) return "—";
  const actual = roundAttribute(value);
  // Preserve the side of a threshold and the sign of a small nonzero value.
  // E.g. 5.96 must not look like 6, nor -0.004 like a safe zero SAN balance.
  const thresholds = [0, ...boundaries];
  for (let digits = precision; digits <= 10; digits += 1) {
    const displayed = roundDisplay(actual, digits);
    if (thresholds.some(boundary => Math.sign(actual - boundary) !== Math.sign(displayed - boundary))) continue;
    return displayed.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  }
  return actual.toFixed(10).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

/** Compact character attributes; extra digits only when needed at a boundary. */
export function formatAttribute(value: number, boundaries: readonly number[] = ATTRIBUTE_BOUNDARIES): string {
  return format(value, 1, boundaries);
}

/** Detailed gains, costs and tooltips; never hide a nonzero change as zero. */
export function formatAttributeDetail(value: number, boundaries: readonly number[] = ATTRIBUTE_BOUNDARIES): string {
  return format(value, 2, boundaries);
}
