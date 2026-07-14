import {
  createIllnessRandomEvent,
  createImmuneColdEvent,
} from "./v2-random-events-core-health";
import { createRandomEventSkeleton } from "./v2-random-events-core-shared";
import { createCoreProgressRandomEventById } from "./v2-random-events-core-progress";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-core-shared";

export function createCoreRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } | null {
  if (eventId === 3) {
    return createIllnessRandomEvent(state, getRoll);
  }
  return createCoreProgressRandomEventById(eventId, state, getRoll);
}

export { createImmuneColdEvent };
export { createRandomEventSkeleton };
