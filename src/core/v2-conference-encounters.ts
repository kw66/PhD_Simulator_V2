import type { ConferenceEncounterState } from "./v2-types";

export function createConferenceEncounterState(): ConferenceEncounterState {
  return {
    metBigBull: false,
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