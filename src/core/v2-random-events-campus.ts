import { createEntertainmentCampusRandomEvent } from "./v2-random-events-campus-entertainment";
import { createOpsCampusRandomEvent } from "./v2-random-events-campus-ops";
import {
  createFundingCampusRandomEvent,
  createSocialCampusRandomEvent,
} from "./v2-random-events-campus-social";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-campus-shared";

export function createCampusRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  if (eventId === 7) {
    return createSocialCampusRandomEvent(state, getRoll);
  }
  if (eventId === 8) {
    return createFundingCampusRandomEvent(state, getRoll);
  }
  if (eventId === 13) {
    return createOpsCampusRandomEvent(state, getRoll);
  }
  if (eventId === 15) {
    return createEntertainmentCampusRandomEvent(state);
  }
  return null;
}
