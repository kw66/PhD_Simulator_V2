import type { ConferenceCareerState, ConferenceEncounterState } from "./v2-types";

/** Follow-up state created by conference activities: people met and enterprise contacts. */
export function createConferenceEncounterState(): ConferenceEncounterState {
  return {
    metBigBullCoop: false,
    bigBullCooperation: false,
    bigBullCoopCount: 0,
    bigBullDeepCount: 0,
    rejectedBigBullCoopCount: 0,
    permanentlyBlockedBigBullCoop: false,
    metBeautiful: false,
    beautifulCount: 0,
    rejectedBeautifulLoverCount: 0,
    permanentlyBlockedBeautifulLover: false,
    metSmart: false,
    smartCount: 0,
    rejectedSmartLoverCount: 0,
    permanentlyBlockedSmartLover: false,
  };
}

export function createConferenceCareerState(): ConferenceCareerState {
  return {
    enterpriseCount: 0,
    rejectedInternshipCount: 0,
    permanentlyBlockedInternship: false,
  };
}
