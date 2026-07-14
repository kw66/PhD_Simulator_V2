import type { ConferenceCareerState } from "./v2-types";

export function createConferenceCareerState(): ConferenceCareerState {
  return {
    enterpriseCount: 0,
    rejectedInternshipCount: 0,
    permanentlyBlockedInternship: false,
  };
}