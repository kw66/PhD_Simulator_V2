import type { RandomRollProvider } from "./v2-random-events-lab-shared";
import { createAdvisorAuthorshipRandomEvent } from "./v2-random-events-lab-advisor-authorship";
import { createAdvisorMeetingRandomEvent } from "./v2-random-events-lab-advisor-meeting";
import { createAdvisorProjectRandomEvent } from "./v2-random-events-lab-advisor-project";
import { createAdvisorTalkRandomEvent } from "./v2-random-events-lab-advisor-talk";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorLabRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  if (eventId === 4) {
    return createAdvisorProjectRandomEvent(state, getRoll);
  }
  if (eventId === 5) {
    return createAdvisorTalkRandomEvent(state);
  }
  if (eventId === 6) {
    return createAdvisorMeetingRandomEvent(state, getRoll);
  }
  if (eventId === 12) {
    return createAdvisorAuthorshipRandomEvent(state);
  }
  return null;
}
