import { createConferenceEncounterState } from "./v2-conference-encounters";
import { isObject } from "./v2-persistence-normalize-life-shared";
import type { GameState } from "./v2-types";

export function normalizeConferenceEncounterState(value: Record<string, unknown>): GameState["conferenceEncounterState"] {
  const baseState = createConferenceEncounterState();
  const source = isObject(value.conferenceEncounterState) ? { ...value.conferenceEncounterState, ...value } : value;

  return {
    metBigBull: source.metBigBull === true,
    metBigBullCoop: source.metBigBullCoop === true,
    bigBullCooperation: source.bigBullCooperation === true,
    bigBullCoopCount: typeof source.bigBullCoopCount === "number" ? source.bigBullCoopCount : baseState.bigBullCoopCount,
    bigBullDeepCount: typeof source.bigBullDeepCount === "number" ? source.bigBullDeepCount : baseState.bigBullDeepCount,
    rejectedBigBullCoopCount: typeof source.rejectedBigBullCoopCount === "number" ? source.rejectedBigBullCoopCount : baseState.rejectedBigBullCoopCount,
    permanentlyBlockedBigBullCoop: source.permanentlyBlockedBigBullCoop === true,
    metBeautiful: source.metBeautiful === true,
    beautifulCount: typeof source.beautifulCount === "number" ? source.beautifulCount : baseState.beautifulCount,
    rejectedBeautifulLoverCount: typeof source.rejectedBeautifulLoverCount === "number" ? source.rejectedBeautifulLoverCount : baseState.rejectedBeautifulLoverCount,
    permanentlyBlockedBeautifulLover: source.permanentlyBlockedBeautifulLover === true,
    metSmart: source.metSmart === true,
    smartCount: typeof source.smartCount === "number" ? source.smartCount : baseState.smartCount,
    rejectedSmartLoverCount: typeof source.rejectedSmartLoverCount === "number" ? source.rejectedSmartLoverCount : baseState.rejectedSmartLoverCount,
    permanentlyBlockedSmartLover: source.permanentlyBlockedSmartLover === true,
  };
}
