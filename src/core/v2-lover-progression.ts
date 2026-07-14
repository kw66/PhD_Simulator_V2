import type { LoverProgressState, LoverTypeId, Paper, PersistentExtraActions } from "./v2-types";

const LOVER_RELATION_MAX = 40;
export const LOVER_TASK_MAX = 100;
export const LOVER_DATE_MONEY_COST = 2;

export interface LoverTaskAdvanceResult {
  loverProgressState: LoverProgressState;
  growth: number;
  moneyCost: number;
  completed: boolean;
  sanDelta: number;
  sanCapDelta: number;
  beautifulExtraRecoveryRateDelta: number;
  persistentExtraActionDeltas: Partial<PersistentExtraActions>;
  paperBonusTotal: number;
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
    interactCount: 0,
  };
}

export function activateLoverProgress(type: LoverTypeId, playerResearch: number, getRoll: () => number = Math.random): LoverProgressState {
  return {
    active: true,
    research: type === "smart" ? Math.min(16, playerResearch + 1) : Math.max(3, playerResearch - 3),
    intimacy: type === "smart" ? randomIntInRange([9, 12], getRoll) : randomIntInRange([12, 15], getRoll),
    taskProgress: 0,
    taskMax: LOVER_TASK_MAX,
    relationProgress: 0,
    relationMax: LOVER_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
    completedTaskCount: 0,
    interactCount: 0,
  };
}

export function tickLoverProgressForMonth(state: LoverProgressState): LoverProgressState {
  if (!state.active) {
    return {
      ...state,
      taskUsedThisMonth: false,
    };
  }

  const relationGrowth = Math.max(0, state.intimacy);
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

export function resolveLoverTaskAdvance(
  state: LoverProgressState,
  input: {
    type: LoverTypeId;
    currentSan: number;
    sanCap: number;
    persistentExtraActions: PersistentExtraActions;
    isFree: boolean;
    consumeInteraction: boolean;
    getRoll?: () => number;
  },
): LoverTaskAdvanceResult {
  const getRoll = input.getRoll ?? Math.random;
  const growth = Math.floor(state.intimacy * (0.5 + getSafeRoll(getRoll))) + Math.floor(getSafeRoll(getRoll) * 6) + (input.isFree ? 5 : 0);
  const nextTaskProgress = state.taskProgress + growth;
  let nextState: LoverProgressState = {
    ...state,
    taskProgress: nextTaskProgress,
    canInteract: input.consumeInteraction ? false : state.canInteract,
    taskUsedThisMonth: input.isFree ? state.taskUsedThisMonth : true,
    interactCount: input.consumeInteraction ? state.interactCount + 1 : state.interactCount,
  };

  if (nextTaskProgress < state.taskMax) {
    return {
      loverProgressState: nextState,
      growth,
      moneyCost: input.isFree ? 0 : LOVER_DATE_MONEY_COST,
      completed: false,
      sanDelta: 0,
      sanCapDelta: 0,
      beautifulExtraRecoveryRateDelta: 0,
      persistentExtraActionDeltas: {},
      paperBonusTotal: 0,
    };
  }

  const nextCompletedTaskCount = state.completedTaskCount + 1;
  nextState = {
    ...nextState,
    intimacy: Math.min(40, state.intimacy + 1),
    taskProgress: nextTaskProgress - state.taskMax,
    completedTaskCount: nextCompletedTaskCount,
  };

  let sanDelta = 0;
  let sanCapDelta = 0;
  let beautifulExtraRecoveryRateDelta = 0;
  let persistentExtraActionDeltas: Partial<PersistentExtraActions> = {};
  const cycle = (nextCompletedTaskCount - 1) % 3;

  if (input.type === "smart") {
    if (cycle == 0 && input.persistentExtraActions.idea <= 0) {
      persistentExtraActionDeltas = { idea: 1 };
    } else if (cycle == 1 && input.persistentExtraActions.experiment <= 0) {
      persistentExtraActionDeltas = { experiment: 1 };
    } else if (cycle == 2 && input.persistentExtraActions.writing <= 0) {
      persistentExtraActionDeltas = { writing: 1 };
    }
  } else {
    if (cycle == 0) {
      sanDelta = Math.ceil(Math.max(0, input.sanCap - input.currentSan) * 0.1);
    } else if (cycle == 1) {
      sanCapDelta = 1;
    } else {
      beautifulExtraRecoveryRateDelta = 2;
    }
  }

  return {
    loverProgressState: nextState,
    growth,
    moneyCost: input.isFree ? 0 : LOVER_DATE_MONEY_COST,
    completed: true,
    sanDelta,
    sanCapDelta,
    beautifulExtraRecoveryRateDelta,
    persistentExtraActionDeltas,
    paperBonusTotal: Math.floor(nextState.research * 1.5),
  };
}

export function buildLoverPaperBonusUpdate(paper: Paper, totalBonus: number): { idea: number; experiment: number; writing: number } {
  const bonusApplied = { idea: 0, experiment: 0, writing: 0 };
  let remainingBonus = totalBonus;

  while (remainingBonus > 0) {
    const currentScores = [
      { key: "idea", value: paper.idea + bonusApplied.idea },
      { key: "experiment", value: paper.experiment + bonusApplied.experiment },
      { key: "writing", value: paper.writing + bonusApplied.writing },
    ].sort((left, right) => left.value - right.value);
    const lowestKey = currentScores[0]?.key;
    if (lowestKey === "idea") {
      bonusApplied.idea += 1;
    } else if (lowestKey === "experiment") {
      bonusApplied.experiment += 1;
    } else {
      bonusApplied.writing += 1;
    }
    remainingBonus -= 1;
  }

  return bonusApplied;
}
