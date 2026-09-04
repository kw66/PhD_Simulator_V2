import type { LoverProgressState } from "./v2-types";

const LOVER_RELATION_MAX = 40;
export const LOVER_TASK_MAX = 100;
export const LOVER_DATE_MONEY_COST = 2;

export function createLoverProgressState(): LoverProgressState {
  return {
    active: false,
    research: 0,
    intimacy: 0,
    taskProgress: 0,
    taskMax: LOVER_TASK_MAX,
    relationProgress: 0,
    relationMax: LOVER_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
    completedTaskCount: 0,
  };
}
