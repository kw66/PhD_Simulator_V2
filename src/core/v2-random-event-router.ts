import { createCampusRandomEventById } from "./v2-random-events-campus";
import {
  createCoreRandomEventById,
  createRandomEventSkeleton,
} from "./v2-random-events-core";
import { createLabRandomEventById } from "./v2-random-events-lab";
import { createRelationshipRandomEventById } from "./v2-random-events-relationships";
import type { GameState, PendingEvent } from "./v2-types";

type RandomRollProvider = () => number;

export function createRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } {
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
