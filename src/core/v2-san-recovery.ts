/** Recovery fills free capacity without discarding SAN retained above the cap. */
export function getRecoveredSan(current: number, cap: number, gain: number): number {
  return gain > 0 ? Math.max(current, Math.min(cap, current + gain)) : current + gain;
}
