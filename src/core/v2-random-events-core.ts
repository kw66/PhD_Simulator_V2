import { createRandomEventSkeleton } from "./v2-random-events-core-shared";
import { createCoreProgressRandomEventById } from "./v2-random-events-core-progress";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-core-shared";

export function createCoreRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } | null {
  return createCoreProgressRandomEventById(eventId, state, getRoll);
}
export { createRandomEventSkeleton };
