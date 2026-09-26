import { enqueuePendingEvents } from "./v2-event-enqueue";
import { hasBlockingQueueEvent } from "./v2-event-queue";
import { collectFixedEventsForState } from "./v2-fixed-events";
import { createRandomEventById, isRandomEventEligible } from "./v2-random-event-router";
import {
  calculateRandomEventCount,
  drawRandomEvent,
} from "./v2-random-event-rules";
import { getRandomEventCategory, type RandomEventCategory } from "./v2-random-event-pool-builder";
import { createIllnessRandomEvent } from "./v2-random-events-core-health";
import { hasRecoverableDraftPaper } from "./v2-random-events-core-shared";
import { rememberPendingRandomEvent } from "./v2-paper-competition-waiting";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";
import type { RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export type { RandomRollProvider } from "./v2-random-events-core-shared";

export function collectIllnessEventForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent[] {
  if (state.phase !== "playing" || state.illnessProbability <= 0 || getRoll() >= state.illnessProbability / 100) {
    return [];
  }
  return [createIllnessRandomEvent(state, getRoll)];
}

export function collectFixedEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent[] {
  return collectFixedEventsForState(state, getRoll);
}

export function collectRandomEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): { nextState: GameState; events: PendingEvent[] } {
  if (state.phase !== "playing") {
    return { nextState: state, events: [] };
  }

  const randomEventCount = calculateRandomEventCount(getRoll(), {
    totalMonths: state.totalMonths,
    maxMonths: state.maxMonths,
  });
  if (randomEventCount <= 0) {
    return { nextState: state, events: [] };
  }

  let nextState = state;
  const events: PendingEvent[] = [];
  const selectedCategories = new Set<RandomEventCategory>();

  for (let index = 0; index < randomEventCount; index += 1) {
    const drawResult = drawRandomEvent(
      {
        availableRandomEvents: nextState.availableRandomEvents,
        usedRandomEvents: nextState.usedRandomEvents,
        illnessProbability: nextState.illnessProbability,
        totalRandomEventCount: nextState.totalRandomEventCount,
        pendingPaperCompetitionEvents: nextState.pendingPaperCompetitionEvents,
        social: nextState.player.social,
        research: nextState.player.research,
        publishedPaperCount: getPublishedPaperCount(nextState),
        hasRecoverableDraftPaper: hasRecoverableDraftPaper(nextState),
        hasAuthorshipEligibleDraftPaper: nextState.papers.some((paper) =>
          paper.status === "draft" && paper.idea + paper.experiment + paper.writing > 0
        ),
        excludedCategories: [...selectedCategories],
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

    const randomRolls: number[] = [];
    const recordRoll = (): number => {
      const roll = getRoll();
      randomRolls.push(roll);
      return roll;
    };
    const serial = nextState.totalRandomEventCount;
    const builtEvent = isRandomEventEligible(nextState, drawResult.eventId)
      ? createRandomEventById(drawResult.eventId, nextState, recordRoll)
      : { nextState, event: null };
    nextState = builtEvent.nextState;
    if (!builtEvent.event) {
      nextState = rememberPendingRandomEvent(nextState, drawResult.eventId, serial);
    }
    if (builtEvent.event) {
      const category = getRandomEventCategory(drawResult.eventId);
      if (category) selectedCategories.add(category);
      nextState = {
        ...nextState,
        usedRandomEvents: nextState.usedRandomEvents.includes(drawResult.eventId)
          ? nextState.usedRandomEvents
          : [...nextState.usedRandomEvents, drawResult.eventId],
      };
      events.push({
        ...builtEvent.event,
        randomReplay: {
          eventId: drawResult.eventId,
          serial,
          rolls: randomRolls,
        },
      });
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

  if (hasBlockingQueueEvent(state)) {
    return { nextState: state, queuedEvents: [] };
  }

  const fixedEvents = collectFixedEventsForMonth(state, getRoll);
  if (fixedEvents.length === 0) {
    return { nextState: state, queuedEvents: [] };
  }

  return enqueuePendingEvents(state, fixedEvents);
}

export function enqueueMonthlyEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): { nextState: GameState; queuedEvents: PendingEvent[] } {
  if (state.phase !== "playing") {
    return { nextState: state, queuedEvents: [] };
  }

  const illnessEvents = collectIllnessEventForMonth(state, getRoll);
  const illnessCollection = enqueuePendingEvents(state, illnessEvents);
  const fixedCollection = enqueuePendingEvents(
    illnessCollection.nextState,
    collectFixedEventsForMonth(illnessCollection.nextState, getRoll),
  );
  const randomCollection = collectRandomEventsForMonth(
    fixedCollection.nextState,
    getRoll,
  );
  const randomEnqueueCollection = enqueuePendingEvents(
    randomCollection.nextState,
    randomCollection.events,
  );

  return {
    nextState: randomEnqueueCollection.nextState,
    queuedEvents: [...illnessCollection.queuedEvents, ...fixedCollection.queuedEvents, ...randomEnqueueCollection.queuedEvents],
  };
}
