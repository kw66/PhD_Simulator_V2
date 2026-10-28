import { getEffectiveSocial } from "./v2-effective-attributes";
import { getAttributeTier } from "./v2-random-event-rules";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { GameState } from "./v2-types";

/** A fixed initial bonus, applied once when a person actually joins. */
export function getInitialRelationshipSocialBonus(state: GameState): number {
  return usesGameplayRulesFrom("20261028-r59") ? getAttributeTier(getEffectiveSocial(state)) : 0;
}
