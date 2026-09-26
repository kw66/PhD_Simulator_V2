import { enqueuePendingEvents } from "./v2-event-enqueue";
import { createRandomEventById, isRandomEventEligible } from "./v2-random-event-router";
import type { GameState } from "./v2-types";

export function rememberPendingRandomEvent(
  state: GameState,
  eventId: number,
  serial: number,
): GameState {
  const pending = state.pendingPaperCompetitionEvents ?? [];
  if (pending.some((event) => event.eventId === eventId)
    || state.eventQueue.some((event) => event.chainId === `random-${eventId}`)) return state;
  return {
    ...state,
    pendingPaperCompetitionEvents: [...pending, { eventId, serial }],
    availableRandomEvents: state.availableRandomEvents.filter((id) => id !== eventId),
    usedRandomEvents: state.usedRandomEvents.filter((id) => id !== eventId),
  };
}

/** Compatibility export for older callers and saved test fixtures. */
export const rememberPendingPaperCompetitionEvent = rememberPendingRandomEvent;

export function activatePendingRandomEvents(
  state: GameState,
  getRoll: () => number = Math.random,
): GameState {
  if (state.phase !== "playing" || !state.pendingPaperCompetitionEvents?.length) return state;
  let nextState = state;
  for (const pending of state.pendingPaperCompetitionEvents) {
    if (nextState.eventQueue.some((event) => event.chainId === `random-${pending.eventId}`)) continue;
    if (!isRandomEventEligible(nextState, pending.eventId)) continue;
    const rolls: number[] = [];
    const built = createRandomEventById(
      pending.eventId,
      { ...nextState, totalRandomEventCount: pending.serial },
      () => {
        const roll = getRoll();
        rolls.push(roll);
        return roll;
      },
    );
    if (!built.event) continue;
    const enqueued = enqueuePendingEvents(nextState, [{
      ...built.event,
      randomReplay: { eventId: pending.eventId, serial: pending.serial, rolls },
    }]);
    if (enqueued.queuedEvents.length === 0) continue;
    nextState = {
      ...enqueued.nextState,
      pendingPaperCompetitionEvents: (nextState.pendingPaperCompetitionEvents ?? [])
        .filter((item) => item.eventId !== pending.eventId),
      availableRandomEvents: nextState.availableRandomEvents.filter((id) => id !== pending.eventId),
      usedRandomEvents: [...new Set([...nextState.usedRandomEvents, pending.eventId])],
    };
  }
  return nextState;
}

/** Compatibility export for callers that still use the old paper-specific name. */
export const activatePendingPaperCompetitionEvents = activatePendingRandomEvents;
