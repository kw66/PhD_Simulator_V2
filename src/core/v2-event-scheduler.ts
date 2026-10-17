import { gameRandom } from "./v2-game-random";
import { getEffectiveResearch, getEffectiveSocial } from "./v2-effective-attributes";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { hasBlockingQueueEvent } from "./v2-event-queue";
import { collectFixedEventsForState } from "./v2-fixed-events";
import { createRandomEventById, isRandomEventEligible } from "./v2-random-event-router";
import {
  calculateRandomEventCount,
  drawRandomEvent,
  consumeRandomEventTicket,
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
import { isCaptain } from "./v2-captain-state";

/** 统御者每学年首月固定见到的三件组内人际事件。 */
export const CAPTAIN_ANNUAL_RELATIONSHIP_EVENT_IDS = [14, 10, 11] as const;

function isCaptainAnnualOpeningMonth(state: Pick<GameState, "selectedRoleId" | "month" | "totalMonths">): boolean {
  return state.selectedRoleId === "research-captain" && state.month === 1 && state.totalMonths >= 1;
}

function collectCaptainAnnualRelationshipEvents(
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; events: PendingEvent[] } {
  if (!isCaptainAnnualOpeningMonth(state)) return { nextState: state, events: [] };
  let nextState = state;
  const events: PendingEvent[] = [];
  for (const eventId of CAPTAIN_ANNUAL_RELATIONSHIP_EVENT_IDS) {
    // Consume only one annual ticket, even if a previous year's deferred scene
    // is already present. Resolving that scene must not expose a duplicate.
    if (nextState.usedRandomEvents.includes(eventId)) continue;
    if (nextState.eventQueue.some((event) => event.randomReplay?.eventId === eventId)) {
      nextState = { ...nextState,
        availableRandomEvents: consumeRandomEventTicket(nextState.availableRandomEvents, eventId),
        usedRandomEvents: [...nextState.usedRandomEvents, eventId],
        pendingRandomEvents: nextState.pendingRandomEvents?.filter((pending) => pending.eventId !== eventId),
      };
      continue;
    }
    const serial = nextState.totalRandomEventCount + 1;
    const rolls: number[] = [];
    const recordRoll = (): number => {
      const roll = getRoll();
      rolls.push(roll);
      return roll;
    };
    const built = createRandomEventById(eventId, { ...nextState, totalRandomEventCount: serial }, recordRoll, nextState);
    if (!built.event) continue;
    nextState = {
      ...built.nextState,
      availableRandomEvents: consumeRandomEventTicket(nextState.availableRandomEvents, eventId),
      usedRandomEvents: [...nextState.usedRandomEvents, eventId],
      pendingRandomEvents: nextState.pendingRandomEvents?.filter((pending) => pending.eventId !== eventId),
      totalRandomEventCount: serial,
    };
    events.push({ ...built.event, randomReplay: { eventId, serial, rolls } });
  }
  return { nextState, events };
}

export type { RandomRollProvider } from "./v2-random-events-core-shared";

export function collectIllnessEventForMonth(
  state: GameState,
  getRoll: RandomRollProvider = gameRandom,
): PendingEvent[] {
  if (state.phase !== "playing" || state.illnessProbability <= 0 || getRoll() >= state.illnessProbability / 100) {
    return [];
  }
  return [createIllnessRandomEvent(state, getRoll)];
}

export function collectFixedEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = gameRandom,
): PendingEvent[] {
  return collectFixedEventsForState(state, getRoll);
}

export function collectRandomEventsForMonth(
  state: GameState,
  getRoll: RandomRollProvider = gameRandom,
  excludedEventIds: readonly number[] = [],
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
        excludedEventIds: [...unavailableEventIds, ...excludedEventIds, ...(nextState.year >= 6 && !isCaptain(nextState) ? [11] : [])],
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
  getRoll: RandomRollProvider = gameRandom,
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
  getRoll: RandomRollProvider = gameRandom,
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
  const captainEvents = collectCaptainAnnualRelationshipEvents(fixedCollection.nextState, getRoll);
  const captainCollection = enqueuePendingEvents(captainEvents.nextState, captainEvents.events);
  const randomCollection = collectRandomEventsForMonth(
    captainCollection.nextState,
    getRoll,
    isCaptainAnnualOpeningMonth(state) ? CAPTAIN_ANNUAL_RELATIONSHIP_EVENT_IDS : [],
  );
  const randomEnqueueCollection = enqueuePendingEvents(
    randomCollection.nextState,
    randomCollection.events,
  );

  return {
    nextState: randomEnqueueCollection.nextState,
    queuedEvents: [...thesisCollection.queuedEvents, ...illnessCollection.queuedEvents, ...fixedCollection.queuedEvents,
      ...captainCollection.queuedEvents, ...randomEnqueueCollection.queuedEvents],
  };
}
