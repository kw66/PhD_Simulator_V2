/** Exactly Number(value.toFixed(10)), with proved binary64 fast paths. */
export function roundGreedConversion(value: number): number {
  // A ten-place decimal lies within half an ULP here, so parsing returns value.
  // At 2^19 itself the value is an integer; at >=1e21 toFixed round-trips too.
  if (value >= 524288 && value < Infinity) return value;
  if (value >= 0 && value < 524288) {
    const integer = Math.floor(value);
    // Subtraction is exact. This product is <1e10, with error <=2^-20.
    const scaled = (value - integer) * 1e10;
    const nearest = Math.round(scaled);
    // Keep the original conversion for any potentially ambiguous decimal tie.
    if (Math.abs(Math.abs(scaled - nearest) - 0.5) > 0.000002) {
      // The numerator is an exact integer below 2^53. Division and decimal
      // parsing both correctly round the same rational to binary64.
      return (integer * 1e10 + nearest) / 1e10;
    }
  }
  return Number(value.toFixed(10));
}
