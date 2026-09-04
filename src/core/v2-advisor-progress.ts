import type { AdvisorProgressState } from "./v2-types";

export const MAX_ADVISOR_RESEARCH_RESOURCE = 20;
const ADVISOR_RELATION_MAX = 40;
export const ADVISOR_TASK_SAN_COST = 5;
export const LECTURER_RESEARCH_RESOURCE_RANGE: [number, number] = [3, 6];
export const LECTURER_AFFINITY_RANGE: [number, number] = [3, 5];
export const LECTURER_TASK_MULTIPLIER_RANGE: [number, number] = [6, 10];

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
    relationProgress: 0,
    relationMax: ADVISOR_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
  };
}

export function clampAdvisorResearchResource(value: number): number {
  return Math.max(0, Math.min(MAX_ADVISOR_RESEARCH_RESOURCE, Math.floor(value)));
}

export function createAdvisorProgressState(hasAdvisor = false, getRoll: () => number = Math.random): AdvisorProgressState {
  if (!hasAdvisor) {
    return createAdvisorProgressSnapshot(0, 0, 8);
  }

  const researchResource = randomIntInRange(LECTURER_RESEARCH_RESOURCE_RANGE, getRoll);
  const affinity = randomIntInRange(LECTURER_AFFINITY_RANGE, getRoll);
  const taskMultiplier = randomIntInRange(LECTURER_TASK_MULTIPLIER_RANGE, getRoll);
  return createAdvisorProgressSnapshot(researchResource, affinity, taskMultiplier);
}

export function createAdvisorProgressStateFromValues(
  researchResource: number,
  affinity: number,
  taskMultiplier = 8,
): AdvisorProgressState {
  return createAdvisorProgressSnapshot(researchResource, affinity, taskMultiplier);
}
