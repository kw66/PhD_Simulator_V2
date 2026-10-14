import { getRoleTalentLevel } from "./v2-role-talent-state";
import { getPlayerAttributeCap } from "./v2-player-attributes";
import type { GameState } from "./v2-types";

/**
 * Values used by gameplay decisions. These are deliberately separate from
 * player.research/social: the latter are the real values used by resistance,
 * attribute changes, caps and ending checks.
 */
type EffectiveAttributeState = GameState;

export function getEffectiveResearch(
  state: EffectiveAttributeState,
  operationStartState: EffectiveAttributeState = state,
): number {
  const real = state.player.research;
  if (state.selectedRoleId === "genius-reversed" && state.roleTalents
    && !state.roleTalents.researchCurseBroken) return 0;

  let effective = real;
  if (state.selectedRoleId === "teacher-child" && state.degree === "phd"
    && getRoleTalentLevel(state, "learning-by-osmosis") > 0) {
    effective = Math.max(real, state.player.favor);
  }
  if (state.selectedRoleId === "teacher-child-reversed" && state.roleTalents) {
    effective = Math.max(0, real - getPlayerAttributeCap(state, "favor"));
  }
  if (state.selectedRoleId === "normal-reversed"
    && getRoleTalentLevel(state, "full-san-research") > 0
    && operationStartState.player.san >= operationStartState.sanCap) {
    effective += operationStartState.player.san / 5;
  }
  return effective;
}

export function getEffectiveSocial(state: EffectiveAttributeState): number {
  const real = state.player.social;
  if (state.selectedRoleId === "teacher-child-reversed" && state.roleTalents) {
    return Math.max(0, real - getPlayerAttributeCap(state, "favor"));
  }
  return real;
}
