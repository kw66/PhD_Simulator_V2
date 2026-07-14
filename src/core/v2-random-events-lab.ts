import { createAdvisorLabRandomEventById } from "./v2-random-events-lab-advisor";
import { createMentoringLabRandomEventById } from "./v2-random-events-lab-mentoring";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-lab-shared";

export function createLabRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  return createMentoringLabRandomEventById(eventId, state, getRoll)
    ?? createAdvisorLabRandomEventById(eventId, state, getRoll)
    ?? null;
}
