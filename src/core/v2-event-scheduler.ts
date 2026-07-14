import { enqueuePendingEvents } from "./v2-event-enqueue";
import { hasBlockingQueueEvent } from "./v2-event-queue";
import { collectFixedEventsForState } from "./v2-fixed-events";
import { collectCareerEventsForMonth } from "./v2-monthly-career-events";
import { collectThesisEventForMonth } from "./v2-monthly-thesis-events";
import { createRandomEventById } from "./v2-random-event-router";
import {
  calculateRandomEventCount,
  drawRandomEvent,
} from "./v2-random-event-rules";
import { createImmuneColdEvent } from "./v2-random-events-core";
import type { GameState, PendingEvent } from "./v2-types";

export type RandomRollProvider = () => number;

export function collectFixedEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent[] {
  return collectFixedEventsForState(state, getRoll);
}

export { collectThesisEventForMonth, collectCareerEventsForMonth };

export function collectRandomEventsForMonth(
  state: GameState,
  fixedEventCount: number,
  getRoll: RandomRollProvider = Math.random,
): { nextState: GameState; events: PendingEvent[] } {
  if (state.phase !== "playing") {
    return { nextState: state, events: [] };
  }

  const randomEventCount = calculateRandomEventCount(getRoll(), fixedEventCount);
  if (randomEventCount <= 0) {
    return { nextState: state, events: [] };
  }

  let nextState = state;
  const events: PendingEvent[] = [];

  for (let index = 0; index < randomEventCount; index += 1) {
    const drawResult = drawRandomEvent(
      {
        availableRandomEvents: nextState.availableRandomEvents,
        usedRandomEvents: nextState.usedRandomEvents,
        coldWeight: nextState.coldWeight,
        badmintonYear: nextState.badmintonYear,
        totalRandomEventCount: nextState.totalRandomEventCount,
        social: nextState.player.social,
        san: nextState.player.san,
        year: nextState.year,
        month: nextState.month,
      },
      getRoll(),
    );

    nextState = {
      ...nextState,
      ...drawResult.nextState,
    };

    if (drawResult.outcome === "none" || drawResult.eventId === null) {
      break;
    }

    if (drawResult.outcome === "immune-cold") {
      nextState = {
        ...nextState,
        achievementFlags: {
          ...nextState.achievementFlags,
          badmintonAvoidedCold: true,
        },
      };
      events.push(createImmuneColdEvent(nextState));
      continue;
    }

    const builtEvent = createRandomEventById(drawResult.eventId, nextState, getRoll);
    nextState = builtEvent.nextState;
    if (builtEvent.event) {
      events.push(builtEvent.event);
    }
  }

  return { nextState, events };
}

export function enqueueFixedEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): { nextState: GameState; queuedEvents: PendingEvent[] } {
  if (state.phase !== "playing") {
    return { nextState: state, queuedEvents: [] };
  }

  if (hasBlockingQueueEvent(state) || state.pendingDecision) {
    return { nextState: state, queuedEvents: [] };
  }

  const fixedEvents = collectFixedEventsForMonth(state, getRoll);
  const thesisCollection = collectThesisEventForMonth(state);
  const careerEvents = collectCareerEventsForMonth(thesisCollection.nextState);
  const allEvents = [
    ...fixedEvents,
    ...(thesisCollection.event ? [thesisCollection.event] : []),
    ...careerEvents,
  ];

  if (allEvents.length === 0) {
    return { nextState: thesisCollection.nextState, queuedEvents: [] };
  }

  return enqueuePendingEvents(thesisCollection.nextState, allEvents);
}

export function enqueueMonthlyEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): { nextState: GameState; queuedEvents: PendingEvent[] } {
  if (state.phase !== "playing") {
    return { nextState: state, queuedEvents: [] };
  }

  if (hasBlockingQueueEvent(state) || state.pendingDecision) {
    return { nextState: state, queuedEvents: [] };
  }

  const fixedCollection = enqueueFixedEventsForMonth(state, getRoll);
  const randomCollection = collectRandomEventsForMonth(
    fixedCollection.nextState,
    fixedCollection.queuedEvents.length,
    getRoll,
  );
  const randomEnqueueCollection = enqueuePendingEvents(
    randomCollection.nextState,
    randomCollection.events,
  );

  return {
    nextState: randomEnqueueCollection.nextState,
    queuedEvents: [...fixedCollection.queuedEvents, ...randomEnqueueCollection.queuedEvents],
  };
}
