import { type FixedResolutionResult, type RandomRollProvider } from "./v2-fixed-events-shared";
import { createSummerVacationEvent, resolveSummerVacationFixedEvent } from "./v2-fixed-events-summer";
import { createWinterVacationEvent, resolveWinterVacationFixedEvent } from "./v2-fixed-events-winter";
import { createYearSummaryEvent, resolveYearSummaryFixedEvent } from "./v2-fixed-events-year-summary";
import type { FixedEventResolution, GameState } from "./v2-types";

export { createWinterVacationEvent, createSummerVacationEvent, createYearSummaryEvent };

export function resolveSeasonalFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult {
  return resolveWinterVacationFixedEvent(state, resolution, getRoll)
    ?? resolveSummerVacationFixedEvent(state, resolution, getRoll)
    ?? resolveYearSummaryFixedEvent(state, resolution, getRoll)
    ?? {
      nextState: state,
      outcome: "季节与学年固定事件结算完成。",
    };
}
