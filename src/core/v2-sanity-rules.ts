import { gameRandom } from "./v2-game-random";
import { getAttributeTier } from "./v2-random-event-rules";
import { applyMultipliersThenAdditions, combineEffectMultipliers } from "./v2-numeric-modifiers";
import { formatMoney } from "./v2-money";
import { formatAttributeDetail, roundAttribute } from "./v2-attribute-format";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { Buff, EventSupportState, GameState } from "./v2-types";

export const SLOTH_SAN_BUFF_ID = "role-sloth-san";

const formatEffectAttribute = (value: number): string => usesGameplayRulesFrom("20261021-r13")
  ? formatAttributeDetail(value) : formatMoney(value);

/** Fixed monthly drains do not inherit illness, season-action or lover modifiers. */
export function getRoleMonthlySanCost(state: Pick<GameState, "selectedRoleId" | "degree">, baseCost: number): number {
  if (!Number.isFinite(baseCost) || baseCost <= 0) return 0;
  return baseCost * (state.selectedRoleId === "normal-reversed" ? state.degree === "phd" ? 3 : 2 : 1);
}

/** Keep the curse in the ordinary multiplier pool, before fixed discounts. */
export function createSlothSanBuff(state: Pick<GameState, "selectedRoleId" | "degree">): Buff | null {
  if (state.selectedRoleId !== "normal-reversed") return null;
  const multiplier = state.degree === "phd" ? 3 : 2;
  return { id: SLOTH_SAN_BUFF_ID, name: "极致怠惰", source: "角色天赋", timing: "permanent", remainingMonths: null,
    activeOperationSanMultiplier: multiplier, description: `SAN消耗×${multiplier}` };
}

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
  if (!usesGameplayRulesFrom("20261021-r13")) {
    return Math.max(0, applyMultipliersThenAdditions(baseCost, [multiplier], [additive], "ceil"));
  }
  return roundAttribute(Math.max(0, applyMultipliersThenAdditions(baseCost, [multiplier], [additive])));
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
  return `${finalDelta >= 0 ? "+" : "-"}${formatEffectAttribute(Math.abs(finalDelta))}`;
}

export function formatEventSanChange(finalDelta: number, illnessIncrease = 0, researchDiscount = 0, originalDelta = finalDelta): string {
  const signedDelta = formatSignedEffectChange(finalDelta, originalDelta);
  const notes = [
    researchDiscount > 0 ? `（减免${formatEffectAttribute(researchDiscount)}）` : "",
    finalDelta < 0 && illnessIncrease > 0 ? `（疾病增加${formatEffectAttribute(illnessIncrease)}）` : "",
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

export function formatTierResistedOutcome(
  label: string,
  rawChange: number,
  result: Pick<ReturnType<typeof applyTierResist>, "effectiveChange" | "resistedCount" | "cappedCount"> & { moneyCost?: number; capIncrease?: number },
): string {
  const actual = usesGameplayRulesFrom("20261021-r13") ? result.effectiveChange : Number(formatMoney(result.effectiveChange));
  const signedActual = formatSignedEffectChange(actual, rawChange);
  const detailText = [
    result.resistedCount > 0 ? `抵抗${formatEffectAttribute(result.resistedCount)}` : "",
    result.cappedCount && rawChange > 0 ? "上限" : "",
    result.moneyCost ? `金币 -${formatMoney(result.moneyCost)}` : "",
    result.capIncrease ? `${label}上限 +${formatEffectAttribute(result.capIncrease)}` : "",
  ].filter(Boolean).join("；");
  return `${label} ${signedActual}${detailText ? `（${detailText}）` : ""}`;
}

export function applyTierResist(
  rawChange: number,
  currentValue: number,
  _getRoll: () => number = gameRandom,
  maximumValue = 20,
  resistanceReduction = 0,
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
    const resisted = round(rawStep * Math.max(0, getTierResistChance(value) - resistanceReduction));
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
  const resistChanceByTier = [0, 0.2, 0.4, 0.6] as const;
  return resistChanceByTier[getAttributeTier(currentValue)];
}

export function formatTierResistedChange(
  label: string,
  rawChange: number,
  result: Pick<ReturnType<typeof applyTierResist>, "effectiveChange" | "resistedCount" | "cappedCount">,
  _currentValue?: number,
): string {
  return formatTierResistedOutcome(label, rawChange, result);
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
