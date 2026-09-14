import { enqueuePendingEvents } from "./v2-event-enqueue";
import type { PaperCompetitionEventId } from "./v2-paper-competition";
import { createPaperCompetitionRandomEvent } from "./v2-random-events-paper-competition";
import type { GameState } from "./v2-types";

export function rememberPendingPaperCompetitionEvent(
  state: GameState,
  eventId: PaperCompetitionEventId,
  serial: number,
): GameState {
  const pending = state.pendingPaperCompetitionEvents ?? [];
  if (pending.some((event) => event.eventId === eventId)
    || state.eventQueue.some((event) => event.chainId === `random-${eventId}`)) return state;
  return {
    ...state,
    pendingPaperCompetitionEvents: [...pending, { eventId, serial }],
    availableRandomEvents: state.availableRandomEvents.filter((id) => id !== eventId),
    usedRandomEvents: [...new Set([...state.usedRandomEvents, eventId])],
  };
}

export function activatePendingPaperCompetitionEvents(
  state: GameState,
  getRoll: () => number = Math.random,
): GameState {
  if (state.phase !== "playing" || !state.pendingPaperCompetitionEvents?.length) return state;
  let nextState = state;
  for (const pending of state.pendingPaperCompetitionEvents) {
    if (nextState.eventQueue.some((event) => event.chainId === `random-${pending.eventId}`)) continue;
    const rolls: number[] = [];
    const event = createPaperCompetitionRandomEvent(
      pending.eventId,
      { ...nextState, totalRandomEventCount: pending.serial },
      () => {
        const roll = getRoll();
        rolls.push(roll);
        return roll;
      },
    );
    if (!event) continue;
    const enqueued = enqueuePendingEvents(nextState, [{
      ...event,
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
