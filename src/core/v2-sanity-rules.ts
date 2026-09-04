import { getAttributeTier } from "./v2-random-event-rules";
import type { EventSupportState } from "./v2-types";

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

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
): number {
  if (delta >= 0) return delta;
  const nextDelta = delta + getSeasonSanModifier(month, eventSupport);
  return nextDelta > 0 ? 0 : nextDelta;
}

export function getActualSanChange(
  delta: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
): number {
  return applySanCostModifiers(delta, month, eventSupport);
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
): number {
  const discountedDelta = getResearchMiscSanChange(baseDelta, research);
  if (baseDelta >= 0) return discountedDelta;
  const seasonalDelta = getSeasonSanModifier(month, eventSupport);
  return Math.min(0, discountedDelta + seasonalDelta);
}

const RESEARCH_MISC_TIER_NAMES = ["小白", "入门", "熟练", "大佬"] as const;

/**
 * Formats only the SAN change applied by a fixed research chore. The result
 * keeps the research-tier discount visible without repeating its calculation.
 */
export function formatResearchMiscSanChange(
  baseDelta: number,
  research: number,
  month: number,
  eventSupport: Pick<EventSupportState, "hasParasol">,
): string {
  const finalDelta = getActualResearchMiscSanChange(baseDelta, research, month, eventSupport);
  const tierDiscount = getResearchMiscTierDiscount(baseDelta, research);
  const signedDelta = finalDelta >= 0 ? `+${finalDelta}` : String(finalDelta);
  const discountText = tierDiscount > 0 ? `（减免${tierDiscount}）` : "";
  return `SAN ${signedDelta}${discountText}`;
}

export function getResearchMiscSanNarrative(baseDelta: number, research: number): string {
  const tierDiscount = getResearchMiscTierDiscount(baseDelta, research);
  return tierDiscount > 0
    ? `你已经是“${RESEARCH_MISC_TIER_NAMES[getAttributeTier(research)]}”档，处理这类杂活少费些力气，SAN 少耗 ${tierDiscount} 点`
    : "";
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
  const signedActual = actual >= 0 ? `+${actual}` : String(actual);
  const details: string[] = [];
  if (result.resistedCount > 0) details.push(`抵抗${result.resistedCount}`);
  if (result.cappedCount && rawChange > 0) details.push("上限");
  const detailText = details.length > 0 ? `（${details.join("；")}）` : "";
  return `${label}${signedActual}${detailText}`;
}

export function applyTierResist(
  rawChange: number,
  currentValue: number,
  getRoll: () => number = Math.random,
  maximumValue = 20,
): { effectiveChange: number; resistedCount: number; cappedCount?: number } {
  if (rawChange === 0) {
    return { effectiveChange: 0, resistedCount: 0 };
  }

  const resistChance = getTierResistChance(currentValue);
  if (resistChance === 0) {
    const cappedCount = rawChange > 0
      ? Math.max(0, rawChange - Math.max(0, Math.floor(maximumValue - currentValue)))
      : 0;
    return {
      effectiveChange: rawChange - cappedCount,
      resistedCount: 0,
      ...(cappedCount > 0 ? { cappedCount } : {}),
    };
  }

  const absChange = Math.abs(rawChange);
  const sign = rawChange > 0 ? 1 : -1;
  let effectiveCount = 0;
  for (let index = 0; index < absChange; index += 1) {
    if (getRoll() >= resistChance) {
      effectiveCount += 1;
    }
  }

  const cappedCount = sign > 0
    ? Math.max(0, effectiveCount - Math.max(0, Math.floor(maximumValue - currentValue)))
    : 0;
  const finalCount = effectiveCount - cappedCount;

  return {
    effectiveChange: finalCount === 0 ? 0 : finalCount * sign,
    resistedCount: absChange - effectiveCount,
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
  if (result.cappedCount && rawChange > 0) {
    return `${label}已经到达上限，这次积累没有再转成新的数值。`;
  }
  if (result.resistedCount === 0) return "";
  if (label === "导师好感") {
    if (rawChange < 0) {
      return result.effectiveChange === 0
        ? "你和导师已经有些熟悉，这点不愉快没有继续扩大。"
        : "你和导师已经有些熟悉，这次不愉快只让关系稍微冷了一点。";
    }
    return result.effectiveChange === 0
      ? "导师对你的态度已经比较稳定，想再进一步也没那么容易。"
      : "导师认可了你的心意，不过关系只拉近了一点。";
  }
  if (label === "社交") {
    return rawChange < 0
      ? "你在组里已经有自己的熟人，这点摩擦没有影响现有关系。"
      : "认识的人已经不少，再扩展人脉没有那么容易。";
  }
  return rawChange < 0
    ? "原本稳住的基础没有被这次波动打破。"
    : "基础已经比较扎实，这次积累没有立刻转成新的数值。";
}
