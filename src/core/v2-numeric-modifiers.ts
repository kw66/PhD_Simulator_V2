export type NumericRounding = "none" | "ceil" | "floor" | "round";

function getFiniteValues(values: Iterable<number | null | undefined>): number[] {
  return [...values].filter((value): value is number => Number.isFinite(value));
}

/**
 * Multipliers share one additive percentage pool: x1.5 + x1.5 = x2,
 * while x0.5 + x0.5 bottoms out at x0.
 */
export function combineEffectMultipliers(
  multipliers: Iterable<number | null | undefined>,
): number {
  const combined = getFiniteValues(multipliers)
    .filter((value) => value >= 0)
    .reduce((total, value) => total + (value - 1), 1);
  return Math.max(0, combined);
}

export function applyMultipliersThenAdditions(
  baseValue: number,
  multipliers: Iterable<number | null | undefined>,
  additions: Iterable<number | null | undefined> = [],
  rounding: NumericRounding = "none",
): number {
  const normalizedBase = Number.isFinite(baseValue) ? baseValue : 0;
  const additiveTotal = getFiniteValues(additions).reduce((total, value) => total + value, 0);
  const multipliedValue = normalizedBase * combineEffectMultipliers(multipliers);

  if (rounding === "ceil") return Math.ceil(multipliedValue) + additiveTotal;
  if (rounding === "floor") return Math.floor(multipliedValue) + additiveTotal;
  if (rounding === "round") return Math.round(multipliedValue) + additiveTotal;
  return multipliedValue + additiveTotal;
}
