import type { AdvisorProgressState, AdvisorTierId } from "./v2-types";

export const MAX_ADVISOR_RESEARCH_RESOURCE = 20;
const ADVISOR_RELATION_MAX = 40;
export const ADVISOR_TASK_SAN_COST = 5;

const ADVISOR_PROGRESS_RANGES: Record<AdvisorTierId, { researchResourceRange: [number, number]; affinityRange: [number, number] }> = {
  level1: { researchResourceRange: [11, 14], affinityRange: [1, 3] },
  level2: { researchResourceRange: [9, 12], affinityRange: [2, 3] },
  level3: { researchResourceRange: [7, 10], affinityRange: [2, 4] },
  level4: { researchResourceRange: [5, 8], affinityRange: [3, 4] },
  level5: { researchResourceRange: [3, 6], affinityRange: [3, 5] },
};

export interface AdvisorTaskAdvanceResult {
  advisorProgressState: AdvisorProgressState;
  sanCost: number;
  growth: number;
  completed: boolean;
  moneyDelta: number;
  researchDelta: number;
  paperBonus: number;
}

function getSafeRoll(getRoll: () => number): number {
  const rawRoll = getRoll();
  if (!Number.isFinite(rawRoll)) {
    return 0;
  }
  return Math.min(0.999999, Math.max(0, rawRoll));
}

function randomIntInRange(range: [number, number], getRoll: () => number): number {
  const [minValue, maxValue] = range;
  return minValue + Math.floor(getSafeRoll(getRoll) * (maxValue - minValue + 1));
}

function createAdvisorProgressSnapshot(researchResource: number, affinity: number, taskMultiplier: number): AdvisorProgressState {
  const safeResearchResource = clampAdvisorResearchResource(researchResource);
  const safeTaskMultiplier = Math.max(0, Math.floor(taskMultiplier));
  return {
    researchResource: safeResearchResource,
    affinity: Math.max(0, Math.min(20, Math.floor(affinity))),
    taskProgress: 0,
    taskMax: safeResearchResource * safeTaskMultiplier + 20,
    taskMultiplier: safeTaskMultiplier,
    relationProgress: 0,
    relationMax: ADVISOR_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
    completedProjectCount: 0,
    interactCount: 0,
  };
}

export function clampAdvisorResearchResource(value: number): number {
  return Math.max(0, Math.min(MAX_ADVISOR_RESEARCH_RESOURCE, Math.floor(value)));
}

export function createAdvisorProgressState(advisorId?: AdvisorTierId, getRoll: () => number = Math.random): AdvisorProgressState {
  if (!advisorId) {
    return createAdvisorProgressSnapshot(0, 0, 8);
  }

  const config = ADVISOR_PROGRESS_RANGES[advisorId];
  const researchResource = randomIntInRange(config.researchResourceRange, getRoll);
  const affinity = randomIntInRange(config.affinityRange, getRoll);
  const taskMultiplier = 6 + Math.floor(getSafeRoll(getRoll) * 5);
  return createAdvisorProgressSnapshot(researchResource, affinity, taskMultiplier);
}

export function createAdvisorProgressStateFromValues(
  researchResource: number,
  affinity: number,
  taskMultiplier = 8,
): AdvisorProgressState {
  return createAdvisorProgressSnapshot(researchResource, affinity, taskMultiplier);
}

export function applyAdvisorProgressDeltas(
  state: AdvisorProgressState,
  deltas?: Partial<Record<keyof AdvisorProgressState, number>>,
): AdvisorProgressState {
  if (!deltas) {
    return {
      ...state,
    };
  }

  const nextResearchResource = clampAdvisorResearchResource(state.researchResource + (deltas.researchResource ?? 0));
  const nextTaskMultiplier = Math.max(0, Math.floor(state.taskMultiplier + (deltas.taskMultiplier ?? 0)));
  const nextTaskMax = Math.max(0, Math.floor(state.taskMax + (deltas.taskMax ?? 0)));
  return {
    ...state,
    researchResource: nextResearchResource,
    affinity: Math.max(0, Math.min(20, Math.floor(state.affinity + (deltas.affinity ?? 0)))),
    taskProgress: Math.max(0, Math.floor(state.taskProgress + (deltas.taskProgress ?? 0))),
    taskMax: nextTaskMax,
    taskMultiplier: nextTaskMultiplier,
    relationProgress: Math.max(0, Math.floor(state.relationProgress + (deltas.relationProgress ?? 0))),
    relationMax: Math.max(0, Math.floor(state.relationMax + (deltas.relationMax ?? 0))),
    completedProjectCount: Math.max(0, Math.floor(state.completedProjectCount + (deltas.completedProjectCount ?? 0))),
    interactCount: Math.max(0, Math.floor(state.interactCount + (deltas.interactCount ?? 0))),
  };
}

export function tickAdvisorProgressForMonth(state: AdvisorProgressState, favor: number): AdvisorProgressState {
  const relationGrowth = Math.max(0, favor + state.affinity);
  if (relationGrowth <= 0) {
    return {
      ...state,
      taskUsedThisMonth: false,
    };
  }

  const nextRelationProgress = state.relationProgress + relationGrowth;
  if (nextRelationProgress < state.relationMax) {
    return {
      ...state,
      taskUsedThisMonth: false,
      relationProgress: nextRelationProgress,
    };
  }

  return {
    ...state,
    taskUsedThisMonth: false,
    relationProgress: nextRelationProgress - state.relationMax,
    canInteract: true,
  };
}

export function resolveAdvisorTaskAdvance(
  state: AdvisorProgressState,
  playerResearch: number,
  input: {
    isFree: boolean;
    consumeInteraction: boolean;
    getRoll?: () => number;
  },
): AdvisorTaskAdvanceResult {
  const getRoll = input.getRoll ?? Math.random;
  const growth = Math.floor(playerResearch * (0.5 + getSafeRoll(getRoll))) + Math.floor(getSafeRoll(getRoll) * 6) + (input.isFree ? 5 : 0);
  const nextTaskProgress = state.taskProgress + growth;
  let nextState: AdvisorProgressState = {
    ...state,
    taskProgress: nextTaskProgress,
    canInteract: input.consumeInteraction ? false : state.canInteract,
    taskUsedThisMonth: input.isFree ? state.taskUsedThisMonth : true,
    interactCount: input.consumeInteraction ? state.interactCount + 1 : state.interactCount,
  };

  if (nextTaskProgress < state.taskMax) {
    return {
      advisorProgressState: nextState,
      sanCost: input.isFree ? 0 : ADVISOR_TASK_SAN_COST,
      growth,
      completed: false,
      moneyDelta: 0,
      researchDelta: 0,
      paperBonus: 0,
    };
  }

  const nextCompletedProjectCount = state.completedProjectCount + 1;
  const rewardPhase = (nextCompletedProjectCount - 1) % 2;
  const nextResearchResource = clampAdvisorResearchResource(state.researchResource + 1);
  nextState = {
    ...nextState,
    affinity: Math.min(20, state.affinity + 1),
    researchResource: nextResearchResource,
    taskProgress: nextTaskProgress - state.taskMax,
    taskMax: nextResearchResource * state.taskMultiplier + 20,
    completedProjectCount: nextCompletedProjectCount,
  };

  return {
    advisorProgressState: nextState,
    sanCost: input.isFree ? 0 : ADVISOR_TASK_SAN_COST,
    growth,
    completed: true,
    moneyDelta: rewardPhase === 0 ? 5 : 0,
    researchDelta: rewardPhase === 1 ? 1 : 0,
    paperBonus: nextResearchResource,
  };
}
