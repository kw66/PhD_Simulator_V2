import { getEffectiveResearch, getEffectiveSocial } from "./v2-effective-attributes";
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
import { getPublishedPaperCount } from "./v2-publication-rules";
import { collectThesisEventForMonth } from "./v2-monthly-thesis-events";
import { syncThesisState } from "./v2-thesis-rules";
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
  const unavailableEventIds = new Set(state.eventQueue.flatMap((event) => (
    event.source === "random" && event.randomReplay ? [event.randomReplay.eventId] : []
  )));

  for (let index = 0; index < randomEventCount; index += 1) {
    const drawResult = drawRandomEvent(
      {
        selectedRoleId: nextState.selectedRoleId,
        roleTalents: nextState.roleTalents,
        availableRandomEvents: nextState.availableRandomEvents,
        usedRandomEvents: nextState.usedRandomEvents,
        illnessProbability: nextState.illnessProbability,
        totalRandomEventCount: nextState.totalRandomEventCount,
        pendingRandomEvents: nextState.pendingRandomEvents,
        social: getEffectiveSocial(nextState),
        research: getEffectiveResearch(nextState),
        publishedPaperCount: getPublishedPaperCount(nextState),
        hasRecoverableDraftPaper: hasRecoverableDraftPaper(nextState),
        hasAuthorshipEligibleDraftPaper: nextState.papers.some((paper) =>
          paper.status === "draft" && paper.idea + paper.experiment + paper.writing > 0
        ),
        excludedCategories: [...selectedCategories],
        excludedEventIds: [...unavailableEventIds, ...(nextState.year >= 6 ? [11] : [])],
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
      nextState = rememberPendingRandomEvent(nextState, drawResult.eventId, serial, true);
    }
    if (builtEvent.event) {
      const category = getRandomEventCategory(drawResult.eventId);
      if (category) selectedCategories.add(category);
      nextState = {
        ...nextState,
        usedRandomEvents: [...nextState.usedRandomEvents, drawResult.eventId],
      };
      unavailableEventIds.add(drawResult.eventId);
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

  state = syncThesisState(state, getRoll);
  const thesis = collectThesisEventForMonth(state, getRoll);
  const thesisCollection = enqueuePendingEvents(thesis.nextState, thesis.event ? [thesis.event] : []);
  state = thesisCollection.nextState;
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
    queuedEvents: [...thesisCollection.queuedEvents, ...illnessCollection.queuedEvents, ...fixedCollection.queuedEvents, ...randomEnqueueCollection.queuedEvents],
  };
}
