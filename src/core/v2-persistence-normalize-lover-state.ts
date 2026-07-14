import { createLoverState } from "./v2-lover-system";
import { isObject } from "./v2-persistence-normalize-life-shared";
import type { GameState } from "./v2-types";

export function normalizeLoverState(value: Record<string, unknown>): GameState["loverState"] {
  const baseState = createLoverState();
  const hasLegacyActiveLover = value.hasLover === true;

  if (isObject(value.loverState)) {
    const normalizedState: GameState["loverState"] = {
      active: value.loverState.active === true,
      type: value.loverState.type === "beautiful" || value.loverState.type === "smart" ? value.loverState.type : null,
      startTotalMonths: typeof value.loverState.startTotalMonths === "number" ? value.loverState.startTotalMonths : null,
      beautifulExtraRecoveryRate:
        typeof value.loverState.beautifulExtraRecoveryRate === "number"
          ? value.loverState.beautifulExtraRecoveryRate
          : 0,
    };

    if (!hasLegacyActiveLover || normalizedState.active) {
      return normalizedState;
    }
  }

  if (!hasLegacyActiveLover) {
    return baseState;
  }

  return {
    active: true,
    type: value.loverType === "beautiful" || value.loverType === "smart" ? value.loverType : null,
    startTotalMonths: typeof value.firstLoverMonth === "number" ? value.firstLoverMonth : null,
    beautifulExtraRecoveryRate: typeof value.beautifulLoverExtraRecoveryRate === "number" ? value.beautifulLoverExtraRecoveryRate : 0,
  };
}
