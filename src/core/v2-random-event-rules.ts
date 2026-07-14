import {
  buildCandidateEventIds as buildCandidateEventIdsFromContext,
  buildWeightedPool,
} from "./v2-random-event-pool-builder";

export interface RandomEventState {
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  coldWeight: number;
  badmintonYear: number;
  totalRandomEventCount: number;
}

export interface RandomEventPoolContext extends RandomEventState {
  social: number;
  san: number;
  year: number;
  month: number;
}

export interface RandomEventPoolSnapshot {
  candidateEventIds: number[];
  weightedPool: number[];
  coldActualWeight: number;
  isFirstSemester: boolean;
  isCooperationMonth: boolean;
}

export interface RandomEventDrawResult {
  eventId: number | null;
  outcome: "none" | "event" | "immune-cold";
  snapshot: RandomEventPoolSnapshot;
  nextState: RandomEventState;
}

export const BASE_RANDOM_EVENT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16] as const;
export const NEGATIVE_RANDOM_EVENT_IDS = [3, 12, 13, 16] as const;
export const COOPERATION_RANDOM_EVENT_IDS = [1, 10, 11, 14] as const;

const COLD_EVENT_ID = 3;
const SOCIAL_UNLOCK_EVENT_ID = 11;
const MENTORING_EVENT_ID = 14;
const BASE_WEIGHT_REPEAT = 10;
const DEFAULT_COLD_WEIGHT = 1;
const MAX_COLD_WEIGHT = 8;
const COLD_TIER_MULTIPLIERS = [4, 2, 0.5, 0] as const;
const NEGATIVE_RANDOM_EVENT_ID_SET = new Set<number>(NEGATIVE_RANDOM_EVENT_IDS);
const COOPERATION_RANDOM_EVENT_ID_SET = new Set<number>(COOPERATION_RANDOM_EVENT_IDS);

function cloneRandomEventState(state: RandomEventState): RandomEventState {
  return {
    availableRandomEvents: [...state.availableRandomEvents],
    usedRandomEvents: [...state.usedRandomEvents],
    coldWeight: Number.isFinite(state.coldWeight) && state.coldWeight > 0 ? state.coldWeight : DEFAULT_COLD_WEIGHT,
    badmintonYear: Number.isFinite(state.badmintonYear) ? state.badmintonYear : -1,
    totalRandomEventCount: Number.isFinite(state.totalRandomEventCount)
      ? Math.max(0, Math.floor(state.totalRandomEventCount))
      : 0,
  };
}

export function getAttributeTier(value: number): 0 | 1 | 2 | 3 {
  if (value >= 18) return 3;
  if (value >= 12) return 2;
  if (value >= 6) return 1;
  return 0;
}

export function calculateRandomEventCount(roll: number, _fixedEventCount = 0): number {
  const normalizedRoll = Math.max(0, Math.min(0.999999999999, roll));
  if (normalizedRoll < 0.70) return 0;
  if (normalizedRoll < 0.85) return 1;
  if (normalizedRoll < 0.95) return 2;
  return 3;
}

export function createRandomEventPool(publishedPaperCount: number): number[] {
  const nextPool: number[] = [...BASE_RANDOM_EVENT_IDS];
  if (publishedPaperCount > 0) {
    nextPool.push(MENTORING_EVENT_ID);
  }
  return nextPool;
}

export function createInitialRandomEventState(publishedPaperCount = 0): RandomEventState {
  return {
    availableRandomEvents: createRandomEventPool(publishedPaperCount),
    usedRandomEvents: [],
    coldWeight: DEFAULT_COLD_WEIGHT,
    badmintonYear: -1,
    totalRandomEventCount: 0,
  };
}

export function yearlyResetRandomEventState(state: RandomEventState, publishedPaperCount: number): RandomEventState {
  const nextState = cloneRandomEventState(state);
  nextState.availableRandomEvents = createRandomEventPool(publishedPaperCount);
  nextState.usedRandomEvents = [];
  return nextState;
}

export function unlockMentoringRandomEvent(state: RandomEventState): RandomEventState {
  if (state.availableRandomEvents.includes(MENTORING_EVENT_ID) || state.usedRandomEvents.includes(MENTORING_EVENT_ID)) {
    return state;
  }

  return {
    ...cloneRandomEventState(state),
    availableRandomEvents: [...state.availableRandomEvents, MENTORING_EVENT_ID],
  };
}

export function advanceColdWeight(coldWeight: number): number {
  const normalizedWeight = Number.isFinite(coldWeight) && coldWeight > 0 ? coldWeight : DEFAULT_COLD_WEIGHT;
  return Math.min(MAX_COLD_WEIGHT, normalizedWeight * 1.2);
}

export function buildWeightedRandomEventPool(context: RandomEventPoolContext): RandomEventPoolSnapshot {
  const { candidateEventIds, isFirstSemester, isCooperationMonth } = buildCandidateEventIdsFromContext({
    context,
    socialUnlockEventId: SOCIAL_UNLOCK_EVENT_ID,
    cooperationEventIdSet: COOPERATION_RANDOM_EVENT_ID_SET,
    negativeEventIdSet: NEGATIVE_RANDOM_EVENT_ID_SET,
  });
  let coldActualWeight = 0;

  if (!isFirstSemester && candidateEventIds.includes(COLD_EVENT_ID)) {
    coldActualWeight = cloneRandomEventState(context).coldWeight * COLD_TIER_MULTIPLIERS[getAttributeTier(context.san)];
  }

  const weightedPool = buildWeightedPool({
    candidateEventIds,
    coldEventId: COLD_EVENT_ID,
    coldActualWeight,
    baseWeightRepeat: BASE_WEIGHT_REPEAT,
  });

  return {
    candidateEventIds,
    weightedPool,
    coldActualWeight,
    isFirstSemester,
    isCooperationMonth,
  };
}

function consumeRandomEvent(state: RandomEventState, eventId: number): RandomEventState {
  return {
    ...cloneRandomEventState(state),
    availableRandomEvents: state.availableRandomEvents.filter((currentEventId) => currentEventId !== eventId),
    usedRandomEvents: state.usedRandomEvents.includes(eventId)
      ? [...state.usedRandomEvents]
      : [...state.usedRandomEvents, eventId],
  };
}

export function drawRandomEvent(context: RandomEventPoolContext, roll: number): RandomEventDrawResult {
  const snapshot = buildWeightedRandomEventPool(context);
  if (snapshot.weightedPool.length === 0) {
    return {
      eventId: null,
      outcome: "none",
      snapshot,
      nextState: cloneRandomEventState(context),
    };
  }

  const normalizedRoll = Math.max(0, Math.min(0.999999999999, roll));
  const eventId = snapshot.weightedPool[Math.floor(normalizedRoll * snapshot.weightedPool.length)] ?? null;
  if (eventId === null) {
    return {
      eventId: null,
      outcome: "none",
      snapshot,
      nextState: cloneRandomEventState(context),
    };
  }

  const currentState = cloneRandomEventState(context);
  let nextState: RandomEventState = {
    ...currentState,
    totalRandomEventCount: currentState.totalRandomEventCount + 1,
  };

  if (eventId === COLD_EVENT_ID && context.badmintonYear === context.year) {
    nextState = consumeRandomEvent(nextState, eventId);
    return {
      eventId,
      outcome: "immune-cold",
      snapshot,
      nextState,
    };
  }

  nextState = consumeRandomEvent(nextState, eventId);
  if (eventId === COLD_EVENT_ID) {
    nextState = {
      ...nextState,
      coldWeight: DEFAULT_COLD_WEIGHT,
    };
  }

  return {
    eventId,
    outcome: "event",
    snapshot,
    nextState,
  };
}
