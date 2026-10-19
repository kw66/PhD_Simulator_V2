import { gameRandom } from "./v2-game-random";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { createRandomEventById, isRandomEventEligible } from "./v2-random-event-router";
import type { GameState } from "./v2-types";
import { consumeRandomEventTicket } from "./v2-random-event-rules";
import { hasStartedPaperResearch, isPaperCompetitionEventId } from "./v2-paper-competition";
import { usesGameplayRulesFrom } from "./v2-rule-context";

/** Release hidden draws from preparation in saves created before the research gate. */
export function releasePrematurePaperCompetitions(state: GameState): GameState {
  if (!usesGameplayRulesFrom("20261019-r11") || state.phase !== "playing"
    || !state.pendingRandomEvents?.length || hasStartedPaperResearch(state)) return state;
  const released = new Set(state.pendingRandomEvents.filter(({ eventId }) =>
    isPaperCompetitionEventId(eventId) && !state.eventQueue.some(event =>
      event.chainId === `random-${eventId}` || event.randomReplay?.eventId === eventId))
    .map(({ eventId }) => eventId));
  if (released.size === 0) return state;
  return {
    ...state,
    pendingRandomEvents: state.pendingRandomEvents.filter(({ eventId }) => !released.has(eventId)),
    availableRandomEvents: [...state.availableRandomEvents, ...[...released].filter(eventId =>
      !state.availableRandomEvents.includes(eventId) && !state.usedRandomEvents.includes(eventId))],
  };
}

export function rememberPendingRandomEvent(
  state: GameState,
  eventId: number,
  serial: number,
  ticketAlreadyReserved = false,
): GameState {
  const pending = state.pendingRandomEvents ?? [];
  if (pending.some((event) => event.eventId === eventId)
    || state.eventQueue.some((event) => event.chainId === `random-${eventId}`)) return state;
  return {
    ...state,
    pendingRandomEvents: [...pending, { eventId, serial }],
    availableRandomEvents: ticketAlreadyReserved
      ? state.availableRandomEvents
      : consumeRandomEventTicket(state.availableRandomEvents, eventId),
  };
}

export function activatePendingRandomEvents(
  state: GameState,
  getRoll: () => number = gameRandom,
): GameState {
  if (state.phase !== "playing" || !state.pendingRandomEvents?.length) return state;
  let nextState = state;
  for (const pending of state.pendingRandomEvents) {
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
      pendingRandomEvents: (nextState.pendingRandomEvents ?? [])
        .filter((item) => item.eventId !== pending.eventId),
      usedRandomEvents: [...nextState.usedRandomEvents, pending.eventId],
    };
  }
  return nextState;
}
