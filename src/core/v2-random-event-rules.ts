import {
  buildCandidateEventIds as buildCandidateEventIdsFromContext,
  buildWeightedPool,
} from "./v2-random-event-pool-builder";

export interface RandomEventState {
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  illnessProbability: number;
  totalRandomEventCount: number;
}

export interface RandomEventPoolContext extends RandomEventState {
  social: number;
  research?: number;
  publishedPaperCount?: number;
  hasRecoverableDraftPaper?: boolean;
}

export interface RandomEventPoolSnapshot {
  candidateEventIds: number[];
  weightedPool: number[];
}

export interface RandomEventDrawResult {
  eventId: number | null;
  outcome: "none" | "event";
  nextState: RandomEventState;
}

export const BASE_RANDOM_EVENT_IDS = [1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15] as const;

const SOCIAL_UNLOCK_EVENT_ID = 11;
const MENTORING_EVENT_ID = 14;
const BASE_WEIGHT_REPEAT = 10;

function cloneRandomEventState(state: RandomEventState): RandomEventState {
  return {
    availableRandomEvents: [...state.availableRandomEvents],
    usedRandomEvents: [...state.usedRandomEvents],
    illnessProbability: typeof state.illnessProbability === "number" && Number.isFinite(state.illnessProbability)
      ? Math.max(0, Math.min(100, Math.floor(state.illnessProbability)))
      : 4,
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

export function calculateRandomEventCount(roll: number): number {
  const normalizedRoll = Math.max(0, Math.min(0.999999999999, roll));
  if (normalizedRoll < 0.70) return 0;
  if (normalizedRoll < 0.85) return 1;
  if (normalizedRoll < 0.95) return 2;
  return 3;
}

export function createRandomEventPool(publishedPaperCount: number, hasRecoverableDraftPaper = false): number[] {
  const nextPool: number[] = [...BASE_RANDOM_EVENT_IDS];
  if (publishedPaperCount > 0) {
    nextPool.push(MENTORING_EVENT_ID);
  }
  if (hasRecoverableDraftPaper) {
    nextPool.push(16);
  }
  return nextPool;
}

export function createInitialRandomEventState(publishedPaperCount = 0): RandomEventState {
  return {
    availableRandomEvents: createRandomEventPool(publishedPaperCount),
    usedRandomEvents: [],
    illnessProbability: 4,
    totalRandomEventCount: 0,
  };
}

export function yearlyResetRandomEventState(
  state: RandomEventState,
  publishedPaperCount: number,
  hasRecoverableDraftPaper = false,
): RandomEventState {
  const nextState = cloneRandomEventState(state);
  nextState.availableRandomEvents = createRandomEventPool(publishedPaperCount, hasRecoverableDraftPaper);
  nextState.usedRandomEvents = [];
  return nextState;
}

export function buildWeightedRandomEventPool(context: RandomEventPoolContext): RandomEventPoolSnapshot {
  const { candidateEventIds } = buildCandidateEventIdsFromContext({
    context,
    socialUnlockEventId: SOCIAL_UNLOCK_EVENT_ID,
  });

  const weightedPool = buildWeightedPool({
    candidateEventIds,
    baseWeightRepeat: BASE_WEIGHT_REPEAT,
  });

  return {
    candidateEventIds,
    weightedPool,
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
      nextState: cloneRandomEventState(context),
    };
  }

  const normalizedRoll = Math.max(0, Math.min(0.999999999999, roll));
  const eventId = snapshot.weightedPool[Math.floor(normalizedRoll * snapshot.weightedPool.length)] ?? null;
  if (eventId === null) {
    return {
      eventId: null,
      outcome: "none",
      nextState: cloneRandomEventState(context),
    };
  }

  const currentState = cloneRandomEventState(context);
  let nextState: RandomEventState = {
    ...currentState,
    totalRandomEventCount: currentState.totalRandomEventCount + 1,
  };

  nextState = consumeRandomEvent(nextState, eventId);

  return {
    eventId,
    outcome: "event",
    nextState,
  };
}
