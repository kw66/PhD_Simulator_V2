import {
  buildCandidateEventIds as buildCandidateEventIdsFromContext,
  buildWeightedPool,
  type RandomEventCategory,
} from "./v2-random-event-pool-builder";
import { type PendingPaperCompetitionEvent } from "./v2-paper-competition";

export interface RandomEventState {
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  illnessProbability: number;
  totalRandomEventCount: number;
  pendingPaperCompetitionEvents?: PendingPaperCompetitionEvent[];
}

export interface RandomEventPoolContext extends RandomEventState {
  social: number;
  research?: number;
  publishedPaperCount?: number;
  hasRecoverableDraftPaper?: boolean;
  hasAuthorshipEligibleDraftPaper?: boolean;
  excludedCategories?: readonly RandomEventCategory[];
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

export const BASE_RANDOM_EVENT_IDS = [
  1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
] as const;
const BASE_WEIGHT_REPEAT = 10;

function cloneRandomEventState(state: RandomEventState): RandomEventState {
  return {
    availableRandomEvents: [...state.availableRandomEvents],
    usedRandomEvents: [...state.usedRandomEvents],
    ...(state.pendingPaperCompetitionEvents ? {
      pendingPaperCompetitionEvents: state.pendingPaperCompetitionEvents.map((event) => ({ ...event })),
    } : {}),
    illnessProbability: typeof state.illnessProbability === "number" && Number.isFinite(state.illnessProbability)
      ? Math.max(0, Math.min(100, Math.floor(state.illnessProbability)))
      : 0,
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

export interface RandomEventProtectionWindow {
  totalMonths: number;
  maxMonths: number;
}

export function isRandomEventProtectionWindow({ totalMonths, maxMonths }: RandomEventProtectionWindow): boolean {
  if (!Number.isFinite(totalMonths) || !Number.isFinite(maxMonths) || maxMonths <= 0) return false;
  return (totalMonths >= 1 && totalMonths <= 3)
    || (totalMonths >= maxMonths - 8 && totalMonths <= maxMonths);
}

export function calculateRandomEventCount(roll: number, protectionWindow?: RandomEventProtectionWindow): number {
  const normalizedRoll = Math.max(0, Math.min(0.999999999999, roll));
  if (protectionWindow && isRandomEventProtectionWindow(protectionWindow)) {
    return normalizedRoll < 0.70 ? 0 : 1;
  }
  if (normalizedRoll < 0.70) return 0;
  if (normalizedRoll < 0.85) return 1;
  if (normalizedRoll < 0.95) return 2;
  return 3;
}

export function createRandomEventPool(_publishedPaperCount = 0, _hasRecoverableDraftPaper = false): number[] {
  return [...BASE_RANDOM_EVENT_IDS];
}

export function createInitialRandomEventState(publishedPaperCount = 0): RandomEventState {
  return {
    availableRandomEvents: createRandomEventPool(publishedPaperCount),
    usedRandomEvents: [],
    illnessProbability: 0,
    totalRandomEventCount: 0,
  };
}

export function yearlyResetRandomEventState(
  state: RandomEventState,
  publishedPaperCount: number,
  hasRecoverableDraftPaper = false,
): RandomEventState {
  const nextState = cloneRandomEventState(state);
  const pendingIds = new Set<number>((nextState.pendingPaperCompetitionEvents ?? []).map((event) => event.eventId));
  nextState.availableRandomEvents = createRandomEventPool(publishedPaperCount, hasRecoverableDraftPaper)
    .filter((eventId) => !pendingIds.has(eventId));
  nextState.usedRandomEvents = [];
  return nextState;
}

export function buildWeightedRandomEventPool(context: RandomEventPoolContext): RandomEventPoolSnapshot {
  const { candidateEventIds } = buildCandidateEventIdsFromContext({
    context,
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
    usedRandomEvents: [...state.usedRandomEvents],
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
