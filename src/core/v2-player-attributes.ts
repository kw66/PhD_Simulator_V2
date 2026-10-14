import { applyTierResist } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { recordPersonalSpending, roundMoney } from "./v2-money";
import { getRoleTalentLevel, type AttributeChangeSource, type PlayerAttribute } from "./v2-role-talent-state";
import type { GameState } from "./v2-types";
import { applyRoleAttributeReactions, ensureResearchCurseBroken } from "./v2-role-talent-reactions";

const round = (value: number): number => Number(value.toFixed(10));

export interface PlayerAttributeChangeResult {
  stat: PlayerAttribute;
  rawChange: number;
  effectiveChange: number;
  resistedCount: number;
  cappedCount?: number;
  capIncrease: number;
  moneyCost: number;
  adjustedRawChange?: number;
}

export function getPlayerAttributeCap(state: GameState, stat: PlayerAttribute): number {
  return stat === "research" ? getResearchCap(state.researchCapacityState)
    : Math.max(stat === "favor" && state.selectedRoleId === "teacher-child-reversed" ? 6 : 0,
      20 + (state.roleTalents?.capBonuses?.[stat] ?? 0));
}

export function getPlayerResistanceReduction(state: GameState, stat: PlayerAttribute, rawChange: number): number {
  if (rawChange > 0 && state.selectedRoleId === "genius" && stat === "research") return state.roleTalents?.researchGrowthResistanceReduction ?? 0;
  if (rawChange > 0 && state.selectedRoleId === "teacher-child" && stat === "favor") return getRoleTalentLevel(state, "mentor-expectations") * 0.1;
  if (state.selectedRoleId === "chosen" && rawChange > 0) return getRoleTalentLevel(state, "lasting-fortune") * 0.2;
  if (state.selectedRoleId !== "chosen-reversed") return 0;
  return getRoleTalentLevel(state, { research: "reverse-meter-alpha", social: "reverse-meter-beta", favor: "reverse-meter-gamma" }[stat]) * 0.1;
}

/** Pure quote. The caller retains the original request and requotes when committing an event. */
export function previewPlayerAttributeChange(
  state: GameState, stat: PlayerAttribute, rawChange: number, source: AttributeChangeSource = "ordinary",
): PlayerAttributeChangeResult {
  const current = state.player[stat];
  const maximum = getPlayerAttributeCap(state, stat);
  const canOverflow = source === "swap" && state.selectedRoleId === "chosen-reversed" && getRoleTalentLevel(state, "swap-breaks-cap") > 0;
  const delta = Number.isFinite(rawChange) ? rawChange : 0;
  const adjusted = delta < 0 && source === "ordinary" && stat === "favor" && state.selectedRoleId === "teacher-child-reversed"
    ? delta - getRoleTalentLevel(state, "lower-favor-reset") : delta;
  const uncappedResearch = stat === "research" && state.selectedRoleId === "genius-reversed"
    && (state.roleTalents?.researchCurseBroken || (current >= 20 && getRoleTalentLevel(state, "break-research-curse") > 0));
  let resolved = source === "reset"
    ? { effectiveChange: round(delta), resistedCount: 0, cappedCount: 0 }
    : applyTierResist(adjusted, current, undefined, source === "swap" || uncappedResearch ? Infinity : maximum,
      getPlayerResistanceReduction(state, stat, adjusted));
  let effectiveChange = resolved.effectiveChange;
  let cappedCount = resolved.cappedCount ?? 0;
  if (source === "swap" && !canOverflow) {
    const excess = Math.max(0, current + effectiveChange - maximum);
    effectiveChange = round(effectiveChange - excess);
    cappedCount = round(cappedCount + excess);
  }
  const capIncrease = source === "ordinary" && delta > 0 && cappedCount > 0
    && state.selectedRoleId === "normal" && getRoleTalentLevel(state, "breakthrough") > 0 ? 1 : 0;
  if (capIncrease) {
    const expanded = applyTierResist(adjusted, current, undefined, maximum + capIncrease,
      getPlayerResistanceReduction(state, stat, adjusted));
    resolved = expanded;
    effectiveChange = expanded.effectiveChange;
    cappedCount = expanded.cappedCount ?? 0;
  }
  const replacement = stat === "favor" ? "gold-power-beta" : stat === "social" ? "gold-power-gamma" : null;
  const quotedMoney = roundMoney(Math.abs(effectiveChange) * 2);
  const moneyCost = source === "ordinary" && effectiveChange < 0 && replacement !== null
    && state.selectedRoleId === "rich" && getRoleTalentLevel(state, replacement) > 0
    && state.player.money >= 50 && state.player.money >= quotedMoney ? quotedMoney : 0;
  if (moneyCost > 0) effectiveChange = 0;
  return { stat, rawChange: delta, adjustedRawChange: adjusted, ...resolved, effectiveChange, cappedCount, capIncrease, moneyCost };
}

export function applyPlayerAttributeChange(
  state: GameState, stat: PlayerAttribute, rawChange: number, source: AttributeChangeSource = "ordinary",
  getRoll: () => number = Math.random,
  options: { suppressReactions?: boolean } = {},
): { state: GameState; result: PlayerAttributeChangeResult } {
  const result = previewPlayerAttributeChange(state, stat, rawChange, source);
  let next: GameState = { ...state, player: {
    ...state.player, [stat]: round(state.player[stat] + result.effectiveChange),
    money: roundMoney(state.player.money - result.moneyCost),
  } };
  if (state.roleTalents && source === "ordinary") {
    const talents = state.roleTalents;
    next.roleTalents = {
      ...talents,
      growthTotals: { ...talents.growthTotals, [stat]: round((talents.growthTotals?.[stat] ?? 0) + Math.max(0, result.effectiveChange)) },
      lossTotals: { ...talents.lossTotals, [stat]: round((talents.lossTotals?.[stat] ?? 0) + Math.max(0, -result.effectiveChange)) },
    };
    if (result.capIncrease > 0) {
      next.roleTalents.breakthroughCounts = { ...talents.breakthroughCounts, [stat]: (talents.breakthroughCounts?.[stat] ?? 0) + 1 };
      if (stat === "research") next.researchCapacityState = { ...state.researchCapacityState, otherCapBonus: state.researchCapacityState.otherCapBonus + 1 };
      else next.roleTalents.capBonuses = { ...talents.capBonuses, [stat]: (talents.capBonuses?.[stat] ?? 0) + 1 };
    }
  }
  if (result.moneyCost > 0) next = recordPersonalSpending(next, result.moneyCost);
  next = ensureResearchCurseBroken(next);
  if (source === "ordinary" && !options.suppressReactions) next = applyRoleAttributeReactions(next, stat, result.effectiveChange, getRoll);
  return { state: next, result };
}
