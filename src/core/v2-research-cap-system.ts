import type { ResearchCapacityState } from "./v2-types";

export const BASE_RESEARCH_CAP = 20;

export function createResearchCapacityState(): ResearchCapacityState {
  return {
    baseCap: BASE_RESEARCH_CAP,
    jointTrainingCitationCapBonus: 0,
    otherCapBonus: 0,
  };
}

export function getResearchCap(state: ResearchCapacityState): number {
  return Math.max(0, state.baseCap + state.jointTrainingCitationCapBonus + state.otherCapBonus);
}

export function clampResearchToCap(value: number, state: ResearchCapacityState): number {
  return Math.max(0, Math.min(getResearchCap(state), value));
}
