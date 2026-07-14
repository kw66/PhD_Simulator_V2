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

export function applyResearchCapacityDeltas(
  state: ResearchCapacityState,
  deltas?: Partial<Record<keyof ResearchCapacityState, number>>,
): ResearchCapacityState {
  if (!deltas) {
    return {
      ...state,
    };
  }

  return {
    baseCap: Math.max(0, state.baseCap + (deltas.baseCap ?? 0)),
    jointTrainingCitationCapBonus: Math.max(0, state.jointTrainingCitationCapBonus + (deltas.jointTrainingCitationCapBonus ?? 0)),
    otherCapBonus: Math.max(0, state.otherCapBonus + (deltas.otherCapBonus ?? 0)),
  };
}
