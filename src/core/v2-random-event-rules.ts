import {
  buildCandidateEventIds as buildCandidateEventIdsFromContext,
  buildWeightedPool,
  type RandomEventCategory,
} from "./v2-random-event-pool-builder";
import { type PendingRandomEvent } from "./v2-paper-competition";
import { getRoleTalentLevel, type RoleTalentRunState } from "./v2-role-talent-state";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { RoleId } from "./v2-types";

export interface RandomEventState {
  selectedRoleId?: RoleId;
  roleTalents?: RoleTalentRunState;
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  illnessProbability: number;
  totalRandomEventCount: number;
  pendingRandomEvents?: PendingRandomEvent[];
}

export interface RandomEventPoolContext extends RandomEventState {
  social: number;
  research?: number;
  publishedPaperCount?: number;
  hasRecoverableDraftPaper?: boolean;
  hasAuthorshipEligibleDraftPaper?: boolean;
  hasStartedPaperResearch?: boolean;
  excludedCategories?: readonly RandomEventCategory[];
  excludedEventIds?: readonly number[];
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
  1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
] as const;
const BASE_WEIGHT_REPEAT = 10;

function cloneRandomEventState(state: RandomEventState): RandomEventState {
  return {
    ...(state.selectedRoleId ? { selectedRoleId: state.selectedRoleId } : {}),
    ...(state.roleTalents ? { roleTalents: state.roleTalents } : {}),
    availableRandomEvents: [...state.availableRandomEvents],
    usedRandomEvents: [...state.usedRandomEvents],
    ...(state.pendingRandomEvents ? {
      pendingRandomEvents: state.pendingRandomEvents.map((event) => ({ ...event })),
    } : {}),
    illnessProbability: normalizeRoleTalentIllnessProbability(state, state.illnessProbability),
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

export function normalizeRoleTalentIllnessProbability(
  state: Pick<RandomEventState, "selectedRoleId" | "roleTalents">,
  value: number,
): number {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const allowsNegative = state.selectedRoleId === "chosen" && (getRoleTalentLevel(state, "misfortune-to-fortune") > 0
    || (usesGameplayRulesFrom("20261023-r39") && getRoleTalentLevel(state, "healthy-mind") > 0));
  return Math.min(100, allowsNegative ? finiteValue : Math.max(0, finiteValue));
}

/** Tickets are a multiset: presenting an event spends one copy, never all copies. */
export function consumeRandomEventTicket(tickets: readonly number[], eventId: number): number[] {
  const index = tickets.indexOf(eventId);
  return index < 0 ? [...tickets] : [...tickets.slice(0, index), ...tickets.slice(index + 1)];
}

export function createRandomEventPool(state?: Pick<RandomEventState, "selectedRoleId" | "roleTalents">): number[] {
  const pool: number[] = [...BASE_RANDOM_EVENT_IDS];
  if (state?.selectedRoleId === "genius") {
    pool.push(...Array(getRoleTalentLevel(state, "thirst-for-knowledge")).fill(9));
  }
  if (state?.selectedRoleId === "teacher-child" && usesGameplayRulesFrom("20261023-r28") && !usesGameplayRulesFrom("20261023-r38")) {
    pool.push(...Array(getRoleTalentLevel(state, "family-host")).fill(7));
  }
  if (state?.selectedRoleId === "chosen-reversed") {
    pool.push(...Array(getRoleTalentLevel(state, "group-event-focus")).fill(7));
    pool.push(...Array(getRoleTalentLevel(state, "game-event-focus")).fill(15));
  }
  const extraTickets = state?.selectedRoleId === "social"
    ? [["supporting-juniors", 14], ["peer-camaraderie", 10], ["senior-mentorship", 11]] as const
    : state?.selectedRoleId === "social-reversed"
      ? [["junior-event-focus", 14], ["peer-event-focus", 10], ["senior-event-focus", 11]] as const
      : state?.selectedRoleId === "teacher-child-reversed"
        ? [["advisor-meeting-focus", 5], ["group-meeting-focus", 6]] as const : [];
  if (state) for (const [id, eventId] of extraTickets) pool.push(...Array(getRoleTalentLevel(state, id)).fill(eventId));
  return pool;
}

export function createInitialRandomEventState(): RandomEventState {
  return {
    availableRandomEvents: createRandomEventPool(),
    usedRandomEvents: [],
    illnessProbability: 0,
    totalRandomEventCount: 0,
  };
}

/** Each academic year refills the whole pool; conditional events are checked when drawn. */
export function yearlyResetRandomEventState(state: RandomEventState): RandomEventState {
  const nextState = cloneRandomEventState(state);
  nextState.availableRandomEvents = createRandomEventPool(state);
  for (const pending of nextState.pendingRandomEvents ?? []) {
    nextState.availableRandomEvents = consumeRandomEventTicket(nextState.availableRandomEvents, pending.eventId);
  }
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
    availableRandomEvents: consumeRandomEventTicket(state.availableRandomEvents, eventId),
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
