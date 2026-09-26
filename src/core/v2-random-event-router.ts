import { createCampusRandomEventById } from "./v2-random-events-campus";
import {
  createCoreRandomEventById,
  createRandomEventSkeleton,
} from "./v2-random-events-core";
import { createLabRandomEventById } from "./v2-random-events-lab";
import { createRelationshipRandomEventById } from "./v2-random-events-relationships";
import { isPaperCompetitionEventId } from "./v2-paper-competition";
import { createPaperCompetitionRandomEvent } from "./v2-random-events-paper-competition";
import { hasRecoverableDraftPaper } from "./v2-random-events-core-shared";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";
import { getPaperCompetitionCandidates } from "./v2-paper-competition";
import type { RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } {
  if (isPaperCompetitionEventId(eventId)) {
    return { nextState: state, event: createPaperCompetitionRandomEvent(eventId, state, getRoll) };
  }

  const labEvent = createLabRandomEventById(eventId, state, getRoll);
  if (labEvent) {
    return { nextState: state, event: labEvent };
  }

  const relationshipEvent = createRelationshipRandomEventById(eventId, state, getRoll);
  if (relationshipEvent) {
    return { nextState: state, event: relationshipEvent };
  }

  const campusEvent = createCampusRandomEventById(eventId, state, getRoll);
  if (campusEvent) {
    return { nextState: state, event: campusEvent };
  }

  const coreEvent = createCoreRandomEventById(eventId, state, getRoll);
  if (coreEvent) {
    return coreEvent;
  }

  return { nextState: state, event: createRandomEventSkeleton(eventId, state) };
}

export function isRandomEventEligible(state: GameState, eventId: number): boolean {
  switch (eventId) {
    case 11:
      return state.player.research >= 6 || state.player.social >= 6;
    case 12:
      return state.papers.some((paper) => paper.status === "draft" && paper.idea + paper.experiment + paper.writing > 0);
    case 14:
      return getPublishedPaperCount(state) > 0;
    case 16:
      return hasRecoverableDraftPaper(state);
    case 17:
    case 18:
      return getPaperCompetitionCandidates(state, eventId).length > 0;
    default:
      return true;
  }
}
