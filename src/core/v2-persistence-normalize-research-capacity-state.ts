import { createResearchCapacityState } from "./v2-research-cap-system";
import {
  getLegacyJointTrainingCitationBonus,
  isObject,
} from "./v2-persistence-normalize-life-shared";
import type { GameState } from "./v2-types";

export function normalizeResearchCapacityState(value: Record<string, unknown>): GameState["researchCapacityState"] {
  const baseState = createResearchCapacityState();
  const legacyResearchMax = typeof value.researchMax === "number" && Number.isFinite(value.researchMax)
    ? Math.max(baseState.baseCap, Math.floor(value.researchMax))
    : baseState.baseCap;
  const legacyCitationBonus = getLegacyJointTrainingCitationBonus(value);
  const legacyState = {
    baseCap: baseState.baseCap,
    jointTrainingCitationCapBonus: legacyCitationBonus,
    otherCapBonus: Math.max(0, legacyResearchMax - baseState.baseCap - legacyCitationBonus),
  };

  if (isObject(value.researchCapacityState)) {
    const normalizedState: GameState["researchCapacityState"] = {
      baseCap: typeof value.researchCapacityState.baseCap === "number" ? Math.max(0, Math.floor(value.researchCapacityState.baseCap)) : baseState.baseCap,
      jointTrainingCitationCapBonus:
        typeof value.researchCapacityState.jointTrainingCitationCapBonus === "number"
          ? Math.max(0, Math.floor(value.researchCapacityState.jointTrainingCitationCapBonus))
          : baseState.jointTrainingCitationCapBonus,
      otherCapBonus:
        typeof value.researchCapacityState.otherCapBonus === "number"
          ? Math.max(0, Math.floor(value.researchCapacityState.otherCapBonus))
          : baseState.otherCapBonus,
    };

    const hasLegacyCapData = legacyState.jointTrainingCitationCapBonus > 0 || legacyState.otherCapBonus > 0;
    if (!hasLegacyCapData || normalizedState.jointTrainingCitationCapBonus > 0 || normalizedState.otherCapBonus > 0) {
      return normalizedState;
    }
  }

  return legacyState;
}
