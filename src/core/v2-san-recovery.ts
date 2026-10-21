import { roundAttribute } from "./v2-attribute-format";
import { usesGameplayRulesFrom } from "./v2-rule-context";

/** Recovery fills free capacity without discarding SAN retained above the cap. */
export function getRecoveredSan(current: number, cap: number, gain: number, roleId?: string): number {
  if (gain > 0 && roleId === "special-finite-life") return current;
  const result = gain > 0 ? Math.max(current, Math.min(cap, current + gain)) : current + gain;
  return usesGameplayRulesFrom("20261021-r13") ? roundAttribute(result) || 0 : result;
}
