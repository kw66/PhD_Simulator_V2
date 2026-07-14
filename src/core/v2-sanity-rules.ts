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

export function getMonthlySeasonSanModifier(
  month: number,
  eventSupport: Pick<EventSupportState, "hasDownJacket">,
): number {
  const season = getSeasonByMonth(month);
  if (season === "autumn") return 1;
  if (season === "winter") {
    return eventSupport.hasDownJacket ? 0 : -1;
  }
  return 0;
}


export function applyTierResist(
  rawChange: number,
  currentValue: number,
  getRoll: () => number = Math.random,
): { effectiveChange: number; resistedCount: number } {
  if (rawChange === 0) {
    return { effectiveChange: 0, resistedCount: 0 };
  }

  const resistChanceByTier = [0, 0.25, 0.5, 0.75] as const;
  const tier = getAttributeTier(currentValue);
  const resistChance = resistChanceByTier[tier];
  if (resistChance === 0) {
    return { effectiveChange: rawChange, resistedCount: 0 };
  }

  const absChange = Math.abs(rawChange);
  const sign = rawChange > 0 ? 1 : -1;
  let effectiveCount = 0;
  for (let index = 0; index < absChange; index += 1) {
    if (getRoll() >= resistChance) {
      effectiveCount += 1;
    }
  }

  return {
    effectiveChange: effectiveCount === 0 ? 0 : effectiveCount * sign,
    resistedCount: absChange - effectiveCount,
  };
}
