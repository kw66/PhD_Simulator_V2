import { recordAchievementCounter } from "./v2-achievement-runtime-types";
import { addOrReplaceBuffs } from "./v2-buffs";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { getShopRestSanGain } from "./v2-shop-items-effects";
import { getRecoveredSan } from "./v2-san-recovery";
import type { Buff, GameState } from "./v2-types";

export function getRoleRestSanGain(state: GameState): number {
  if (state.selectedRoleId === "special-finite-life") return 0;
  return getShopRestSanGain(state.shopState)
    + (state.selectedRoleId === "normal-reversed" ? getRoleTalentLevel(state, "restful-idle") : 0);
}

/** Call once after a rest has been accepted and its action cost paid. No action is consumed here. */
export function applyRoleTalentRest(state: GameState, options: { yearSummary?: boolean } = {}): GameState {
  const sloth = state.selectedRoleId === "normal-reversed";
  const fullRecovery = options.yearSummary && sloth && getRoleTalentLevel(state, "year-summary-recovery") > 0;
  const gain = options.yearSummary ? (fullRecovery ? Math.max(0, state.sanCap - state.player.san)
    : sloth ? getRoleTalentLevel(state, "restful-idle") : 0) : getRoleRestSanGain(state);
  const san = getRecoveredSan(state.player.san, state.sanCap, gain, state.selectedRoleId);
  const appliedGain = san - state.player.san;
  const bonus = sloth ? getRoleTalentLevel(state, "coffee-lifeline") : 0;
  const buffs: Buff[] = [];
  if (bonus > 0) {
    for (const action of ["idea", "experiment", "writing"] as const) {
      const id = `role-rest-${action}`;
      const previous = state.buffs.find((buff) => buff.id === id)?.actionEffects?.[action]?.bonus ?? 0;
      buffs.push({ id, name: "困睡醒科", source: "休息", timing: "next-action", remainingMonths: null,
        actionEffects: { [action]: { bonus: previous + bonus } } });
    }
  }
  return recordAchievementCounter({
    ...state, player: { ...state.player, san },
    buffs: buffs.length > 0 ? addOrReplaceBuffs(state.buffs, buffs) : state.buffs,
    shopState: state.shopState.chairUpgrade === "hammock" && appliedGain > 0
      ? { ...state.shopState, chairSanRecovered: Math.max(0, state.shopState.chairSanRecovered ?? 0) + appliedGain }
      : state.shopState,
  }, "rest-san", options.yearSummary ? 0 : appliedGain);
}
