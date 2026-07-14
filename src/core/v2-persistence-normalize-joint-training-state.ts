import { createJointTrainingState } from "./v2-joint-training-system";
import {
  getLegacyJointTrainingCitationBonus,
  isObject,
} from "./v2-persistence-normalize-life-shared";
import type { GameState } from "./v2-types";

export function normalizeJointTrainingState(value: Record<string, unknown>): GameState["jointTrainingState"] {
  const baseState = createJointTrainingState();
  const legacyCitationBonus = getLegacyJointTrainingCitationBonus(value);
  if (!isObject(value.jointTrainingState)) {
    return {
      citationBonusApplied: legacyCitationBonus,
    };
  }

  const normalizedState = {
    citationBonusApplied:
      typeof value.jointTrainingState.citationBonusApplied === "number"
        ? Math.max(0, Math.floor(value.jointTrainingState.citationBonusApplied))
        : baseState.citationBonusApplied,
  };
  if (legacyCitationBonus <= 0 || normalizedState.citationBonusApplied > 0) {
    return normalizedState;
  }

  return {
    citationBonusApplied: legacyCitationBonus,
  };
}
