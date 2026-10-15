import { gameRandom } from "./v2-game-random";
import { recordPersonalIncome } from "./v2-money";
import { recordAchievementSanCapGain } from "./v2-achievement-runtime-types";
import { applyPlayerAttributeChange, getPlayerAttributeCap } from "./v2-player-attributes";
import { applyGreedAttributeLoss } from "./v2-role-talent-greed";
import { getRoleTalentLevel, type PlayerAttribute } from "./v2-role-talent-state";
import { roundMoney } from "./v2-money";
import { getRecoveredSan } from "./v2-san-recovery";
import { describeTalentChange, recordTalentTrigger } from "./v2-talent-history";
import type { GameState } from "./v2-types";

const precise = (value: number) => Number(value.toFixed(10));
const level = getRoleTalentLevel;

function logReaction(before: GameState, after: GameState, name: string, reason: string): GameState {
  const labels = { research: "科研", social: "社交", favor: "导师好感", san: "SAN", money: "金币" } as const;
  const effects = (Object.keys(labels) as Array<keyof typeof labels>)
    .filter((stat) => before.player[stat] !== after.player[stat])
    .map((stat) => describeTalentChange(labels[stat], before.player[stat], after.player[stat]));
  if (before.sanCap !== after.sanCap) effects.push(describeTalentChange("SAN上限", before.sanCap, after.sanCap));
  for (const stat of ["research", "social", "favor"] as const) {
    const oldCap = getPlayerAttributeCap(before, stat), newCap = getPlayerAttributeCap(after, stat);
    if (oldCap !== newCap) effects.push(describeTalentChange(`${labels[stat]}上限`, oldCap, newCap));
  }
  if (!effects.length) return after;
  const sequence = (after.roleTalents?.attributeReactionSequence ?? 0) + 1;
  return recordTalentTrigger({ ...after, roleTalents: { ...after.roleTalents!, attributeReactionSequence: sequence } },
    `role-reaction:${after.totalMonths}:${sequence}`, { name, recipient: after.playerName ? `你·${after.playerName}` : "你", reason, effects });
}

function increaseCap(state: GameState, stat: PlayerAttribute, amount: number): GameState {
  if (!amount) return state;
  return stat === "research" ? { ...state, researchCapacityState: { ...state.researchCapacityState,
    otherCapBonus: state.researchCapacityState.otherCapBonus + amount } }
    : { ...state, roleTalents: { ...state.roleTalents!, capBonuses: { ...state.roleTalents?.capBonuses,
      [stat]: (state.roleTalents?.capBonuses?.[stat] ?? 0) + amount } } };
}

/** Permanent unlock, even if research subsequently falls below twenty. */
export function ensureResearchCurseBroken(state: GameState): GameState {
  if (state.selectedRoleId !== "genius-reversed" || !state.roleTalents || !level(state, "break-research-curse")) return state;
  if (!state.roleTalents.researchCurseBroken && state.player.research < 20) return state;
  let next = state;
  if (!state.roleTalents.researchCurseBroken) {
    next = { ...state, roleTalents: { ...state.roleTalents, researchCurseBroken: true } };
    next = recordTalentTrigger(next, "role-break-research-curse", {
      name: "拨云见日", recipient: state.playerName ? `你·${state.playerName}` : "你", reason: "真实科研达到20",
      effects: ["破除学术失语，科研成长不再受上限限制"],
    });
  }
  const extra = Math.max(0, next.player.research - getPlayerAttributeCap(next, "research"));
  return increaseCap(next, "research", extra);
}

/** A rescue establishes the reset value exactly, then grants one independent reward batch. */
export function settleRoleTalentRescues(state: GameState, getRoll: () => number = gameRandom): GameState {
  state = ensureResearchCurseBroken(state);
  if (state.selectedRoleId !== "teacher-child-reversed" || !state.roleTalents || !level(state, "favor-reset") || state.player.favor >= 0) return state;
  const before = state;
  const favorCap = Math.max(6, getPlayerAttributeCap(state, "favor") - 1 - level(state, "end-of-grace"));
  state = { ...state, player: { ...state.player, favor: favorCap }, roleTalents: { ...state.roleTalents,
    favorResetCount: (state.roleTalents.favorResetCount ?? 0) + 1,
    capBonuses: { ...state.roleTalents.capBonuses, favor: favorCap - 20 } } };
  state = increaseCap(state, "research", level(state, "reset-research-cap"));
  state = increaseCap(state, "social", level(state, "reset-social-cap"));
  if (level(state, "reset-research")) state = applyPlayerAttributeChange(state, "research", 1, "ordinary", getRoll).state;
  if (level(state, "reset-social")) state = applyPlayerAttributeChange(state, "social", 1, "ordinary", getRoll).state;
  const minimumMoney = 2 * level(state, "reset-coins");
  if (minimumMoney > 0 && state.player.money < minimumMoney) state = { ...state, player: { ...state.player, money: minimumMoney } };
  return logReaction(before, state, "无限包容", "导师好感低于0，降低上限后重置并发放奖励");
}

/** Receive one completed ordinary request; multi-point research gains trigger just once. */
export function applyRoleAttributeReactions(state: GameState, stat: PlayerAttribute, actual: number, getRoll: () => number = gameRandom): GameState {
  if (!state.roleTalents || actual === 0) return state;
  if (actual < 0) state = applyGreedAttributeLoss(state, -actual, getRoll);
  if (state.selectedRoleId === "teacher-child-reversed" && stat === "favor" && actual < 0) return settleRoleTalentRescues(state, getRoll);
  if (state.selectedRoleId === "genius-reversed" && stat === "research" && actual > 0) {
    const before = state;
    // Caps precede rewards, so a near-full bar can use its new capacity in this batch.
    if (state.degree === "phd") {
      state = recordAchievementSanCapGain({ ...state, sanCap: state.sanCap + level(state, "research-wellness") }, level(state, "research-wellness"));
      state = increaseCap(state, "favor", level(state, "reputation-growth"));
      state = increaseCap(state, "social", level(state, "social-growth"));
    }
    state = { ...state, player: { ...state.player,
      money: roundMoney(state.player.money + 2 * level(state, "knowledge-monetization")),
      san: getRecoveredSan(state.player.san, state.sanCap, 2 * level(state, "work-life-balance")) } };
    state = recordPersonalIncome(state, 2 * level(state, "knowledge-monetization"));
    if (level(state, "research-network")) {
      state = applyPlayerAttributeChange(state, "social", 1, "ordinary", getRoll).state;
      state = applyPlayerAttributeChange(state, "favor", 1, "ordinary", getRoll).state;
    }
    return logReaction(before, state, "科研成长", "真实科研提升，结算已激活的成长天赋");
  }
  if (state.selectedRoleId === "social-reversed" && stat === "social") {
    const before = state;
    const key = actual > 0 ? "socialGainRemainder" : "socialLossRemainder";
    const talent = actual > 0 ? "social-to-san" : "social-loss-coins";
    const accumulated = level(state, talent) > 0 ? precise((state.roleTalents?.[key] ?? 0) + Math.abs(actual)) : 0;
    const whole = Math.floor(accumulated);
    state = { ...state, roleTalents: { ...state.roleTalents!, socialChangedMonth: state.totalMonths,
      [key]: precise(accumulated - whole) } };
    const reward = whole * level(state, talent);
    if (reward > 0) state = { ...state, player: { ...state.player,
      ...(actual > 0 ? { san: getRecoveredSan(state.player.san, state.sanCap, reward) }
        : { money: roundMoney(state.player.money + reward) }) } };
    if (actual < 0) state = recordPersonalIncome(state, reward);
    return logReaction(before, state, actual > 0 ? "人前春风" : "人走茶凉", "实际社交变化累计满1点");
  }
  return state;
}
