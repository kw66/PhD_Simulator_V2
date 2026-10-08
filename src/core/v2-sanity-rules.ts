import { getAttributeTier } from "./v2-random-event-rules";
import { applyMultipliersThenAdditions, combineEffectMultipliers } from "./v2-numeric-modifiers";
import type { Buff, EventSupportState } from "./v2-types";

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export const DISEASE_MONTH_END_CHANGE_BY_SAN_TIER = [4, 2, 0, -2] as const;

export function getSeasonByMonth(month: number): SeasonId {
  if (month >= 7 && month <= 9) return "spring";
  if (month >= 10 && month <= 12) return "summer";
  if (month >= 1 && month <= 3) return "autumn";
  return "winter";
}

export function getSeasonSanModifier(month: number, eventSupport: Pick<EventSupportState, "hasParasol">): number {
  const season = getSeasonByMonth(month);
  if (season === "spring") return 1;
  if (season === "summer") {
    return eventSupport.hasParasol ? 0 : -1;
  }
  return 0;
}

export function getMonthlySeasonSanModifier(
  month: number,
  eventSupport: Pick<EventSupportState, "hasDownJacket">,
): number {
  const season = getSeasonByMonth(month);
  if (season === "autumn") return 1;
  if (season === "winter" && !eventSupport.hasDownJacket) return -1;
  return 0;
}

export function applySanCostModifiers(
  delta: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
  buffs: readonly Buff[] = [],
): number {
  if (delta >= 0) return delta;
  return 0 - getSanConsumptionCost(-delta, buffs, -getSeasonSanModifier(month, eventSupport));
}

export function getSanConsumptionCost(baseCost: number, buffs: readonly Buff[], fixedDelta = 0): number {
  if (!Number.isFinite(baseCost) || baseCost <= 0) return 0;
  const activeBuffs = buffs.filter((buff) => buff.remainingMonths === null || buff.remainingMonths > 0);
  const multiplier = combineEffectMultipliers(activeBuffs.flatMap((buff) => (
    Number.isFinite(buff.activeOperationSanMultiplier) && (buff.activeOperationSanMultiplier ?? -1) >= 0
      ? [buff.activeOperationSanMultiplier!] : []
  )));
  const additive = activeBuffs.reduce((total, buff) => total + (buff.activeOperationSanDelta ?? 0), fixedDelta);
  return Math.max(0, applyMultipliersThenAdditions(baseCost, [multiplier], [additive], "ceil"));
}

export function getActualSanChange(
  delta: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
  buffs: readonly Buff[] = [],
): number {
  return applySanCostModifiers(delta, month, eventSupport, buffs);
}

export function withoutIllnessSanBuffs(buffs: readonly Buff[]): Buff[] {
  return buffs.filter((buff) => !buff.id.startsWith("illness-work-penalty-") && buff.id !== "debug-buff-illness");
}

/** Isolate disease costs while preserving every other modifier and rounding rule. */
export function getIllnessSanIncrease(
  baseDelta: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
  buffs: readonly Buff[],
  research?: number,
): number {
  if (baseDelta >= 0) return 0;
  const change = (activeBuffs: readonly Buff[]): number => research === undefined
    ? getActualSanChange(baseDelta, month, eventSupport, activeBuffs)
    : getActualResearchMiscSanChange(baseDelta, research, month, eventSupport, activeBuffs);
  return Math.max(0, change(withoutIllnessSanBuffs(buffs)) - change(buffs));
}

function formatSignedEffectChange(finalDelta: number, originalDelta = finalDelta): string {
  // A fully resisted cost is still a loss; a net zero keeps the default +0.
  if (finalDelta === 0 && originalDelta < 0) return "-0";
  return finalDelta >= 0 ? `+${finalDelta}` : String(finalDelta);
}

export function formatEventSanChange(finalDelta: number, illnessIncrease = 0, researchDiscount = 0, originalDelta = finalDelta): string {
  const signedDelta = formatSignedEffectChange(finalDelta, originalDelta);
  const notes = [
    researchDiscount > 0 ? `（减免${researchDiscount}）` : "",
    finalDelta < 0 && illnessIncrease > 0 ? `（疾病增加${illnessIncrease}）` : "",
  ].join("");
  return `SAN ${signedDelta}${notes}`;
}

export function formatActualSanChange(
  baseDelta: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
  buffs: readonly Buff[] = [],
): string {
  return formatEventSanChange(
    getActualSanChange(baseDelta, month, eventSupport, buffs),
    getIllnessSanIncrease(baseDelta, month, eventSupport, buffs),
    0,
    baseDelta,
  );
}

function getResearchMiscTierDiscount(baseDelta: number, research: number): number {
  return Math.min(getAttributeTier(research), Math.max(0, Math.abs(baseDelta)));
}

export function getResearchMiscSanChange(baseDelta: number, research: number): number {
  if (baseDelta >= 0) return baseDelta;
  return baseDelta + getResearchMiscTierDiscount(baseDelta, research);
}

export function getActualResearchMiscSanChange(
  baseDelta: number,
  research: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
  buffs: readonly Buff[] = [],
): number {
  if (baseDelta >= 0) return baseDelta;
  return 0 - getSanConsumptionCost(-baseDelta, buffs,
    -getResearchMiscTierDiscount(baseDelta, research) - getSeasonSanModifier(month, eventSupport));
}

/**
 * Formats only the SAN change applied by a fixed research chore. The result
 * keeps the research discount and illness surcharge visible without listing
 * the other modifiers already included in the final SAN change.
 */
export function formatResearchMiscSanChange(
  baseDelta: number,
  research: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
  buffs: readonly Buff[] = [],
): string {
  const finalDelta = getActualResearchMiscSanChange(baseDelta, research, month, eventSupport, buffs);
  const tierDiscount = getResearchMiscTierDiscount(baseDelta, research);
  return formatEventSanChange(finalDelta, getIllnessSanIncrease(baseDelta, month, eventSupport, buffs, research), tierDiscount, baseDelta);
}

/**
 * Formats the compact result shown in event settlement rows. Narrative about
 * why a point was resisted belongs in the event copy, not beside the result.
 */
export function formatTierResistedOutcome(
  label: string,
  rawChange: number,
  result: Pick<ReturnType<typeof applyTierResist>, "effectiveChange" | "resistedCount" | "cappedCount">,
): string {
  const actual = result.effectiveChange;
  const signedActual = formatSignedEffectChange(actual, rawChange);
  const detailText = result.cappedCount && rawChange > 0 ? "（上限）" : "";
  return `${label} ${signedActual}${detailText}`;
}

export function applyTierResist(
  rawChange: number,
  currentValue: number,
  _getRoll: () => number = Math.random,
  maximumValue = 20,
): { effectiveChange: number; resistedCount: number; cappedCount?: number } {
  if (rawChange === 0) {
    return { effectiveChange: 0, resistedCount: 0 };
  }

  const round = (amount: number): number => Number(amount.toFixed(10));
  const absChange = round(Math.abs(rawChange));
  const sign = rawChange > 0 ? 1 : -1;
  let value = currentValue;
  let effectiveChange = 0;
  let resistedCount = 0;
  let cappedCount = 0;
  for (let index = 0; index < absChange; index += 1) {
    const rawStep = round(Math.min(1, absChange - index));
    const resisted = round(rawStep * getTierResistChance(value));
    const retained = round(rawStep - resisted);
    const applied = sign > 0 ? round(Math.min(retained, Math.max(0, maximumValue - value))) : retained;
    resistedCount = round(resistedCount + resisted);
    cappedCount = round(cappedCount + retained - applied);
    effectiveChange = round(effectiveChange + sign * applied);
    value = round(currentValue + effectiveChange);
  }

  return {
    effectiveChange: effectiveChange === 0 ? 0 : effectiveChange,
    resistedCount,
    ...(cappedCount > 0 ? { cappedCount } : {}),
  };
}

export function getTierResistChance(currentValue: number): number {
  const resistChanceByTier = [0, 0.25, 0.5, 0.75] as const;
  return resistChanceByTier[getAttributeTier(currentValue)];
}

export function formatTierResistedChange(
  label: string,
  _rawChange: number,
  result: Pick<ReturnType<typeof applyTierResist>, "effectiveChange" | "resistedCount">,
  _currentValue?: number,
): string {
  const actual = result.effectiveChange;
  if (actual === 0) return `${label} 未变化`;
  return `${label} ${actual > 0 ? "+" : ""}${actual}`;
}

export function getTierResistedNarrative(
  label: string,
  rawChange: number,
  result: Pick<ReturnType<typeof applyTierResist>, "effectiveChange" | "resistedCount" | "cappedCount">,
): string {
  void label;
  void rawChange;
  void result;
  return "";
}
