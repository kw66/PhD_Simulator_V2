import { createAchievementFlags } from "./v2-achievements";
import { createConferenceCareerState } from "./v2-conference-career";
import { createEventCounters } from "./v2-event-counters";
import { createInitialRandomEventState } from "./v2-random-event-rules";
import type { GameState } from "./v2-types";
import { countPublishedPapers, isObject } from "./v2-persistence-normalize-shared";

export function normalizeEventSupportState(value: Record<string, unknown>): GameState["eventSupport"] {
  if (!isObject(value.eventSupport)) {
    return { hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, hasFinanceTalent: false };
  }

  return {
    hasGameController: value.eventSupport.hasGameController === true,
    hasParasol: value.eventSupport.hasParasol === true,
    hasDownJacket: value.eventSupport.hasDownJacket === true,
    hasBadmintonRacket: value.eventSupport.hasBadmintonRacket === true,
    hasStrongBodyTalent: value.eventSupport.hasStrongBodyTalent === true,
    hasFinanceTalent: value.eventSupport.hasFinanceTalent === true,
  };
}

export function normalizeEventCounters(value: Record<string, unknown>): GameState["eventCounters"] {
  const baseCounters = createEventCounters();
  if (!isObject(value.eventCounters)) {
    return baseCounters;
  }

  return {
    coldCount: typeof value.eventCounters.coldCount === "number" ? value.eventCounters.coldCount : baseCounters.coldCount,
    gamePlayCount: typeof value.eventCounters.gamePlayCount === "number" ? value.eventCounters.gamePlayCount : baseCounters.gamePlayCount,
    terrariaCount: typeof value.eventCounters.terrariaCount === "number" ? value.eventCounters.terrariaCount : baseCounters.terrariaCount,
    magicTowerCount: typeof value.eventCounters.magicTowerCount === "number" ? value.eventCounters.magicTowerCount : baseCounters.magicTowerCount,
    gradSimCount: typeof value.eventCounters.gradSimCount === "number" ? value.eventCounters.gradSimCount : baseCounters.gradSimCount,
    badmintonCount: typeof value.eventCounters.badmintonCount === "number" ? value.eventCounters.badmintonCount : baseCounters.badmintonCount,
    pokerWinCount: typeof value.eventCounters.pokerWinCount === "number" ? value.eventCounters.pokerWinCount : baseCounters.pokerWinCount,
    pokerTotalEarnings: typeof value.eventCounters.pokerTotalEarnings === "number" ? value.eventCounters.pokerTotalEarnings : baseCounters.pokerTotalEarnings,
    ktvCount: typeof value.eventCounters.ktvCount === "number" ? value.eventCounters.ktvCount : baseCounters.ktvCount,
    dinnerCount: typeof value.eventCounters.dinnerCount === "number" ? value.eventCounters.dinnerCount : baseCounters.dinnerCount,
    meetingCount: typeof value.eventCounters.meetingCount === "number" ? value.eventCounters.meetingCount : baseCounters.meetingCount,
    teaBreakCount: typeof value.eventCounters.teaBreakCount === "number" ? value.eventCounters.teaBreakCount : baseCounters.teaBreakCount,
    tourCount: typeof value.eventCounters.tourCount === "number" ? value.eventCounters.tourCount : baseCounters.tourCount,
    rejectedMentoringCount: typeof value.eventCounters.rejectedMentoringCount === "number" ? value.eventCounters.rejectedMentoringCount : baseCounters.rejectedMentoringCount,
    rejectedReviewCount: typeof value.eventCounters.rejectedReviewCount === "number" ? value.eventCounters.rejectedReviewCount : baseCounters.rejectedReviewCount,
    rejectedProjectCount: typeof value.eventCounters.rejectedProjectCount === "number" ? value.eventCounters.rejectedProjectCount : baseCounters.rejectedProjectCount,
    projectCompletedCount: typeof value.eventCounters.projectCompletedCount === "number" ? value.eventCounters.projectCompletedCount : baseCounters.projectCompletedCount,
    consecutiveStampGiftCount: typeof value.eventCounters.consecutiveStampGiftCount === "number" ? value.eventCounters.consecutiveStampGiftCount : baseCounters.consecutiveStampGiftCount,
  };
}

export function normalizeConferenceCareerState(value: Record<string, unknown>): GameState["conferenceCareerState"] {
  const baseState = createConferenceCareerState();
  if (!isObject(value.conferenceCareerState)) {
    return baseState;
  }

  return {
    enterpriseCount: typeof value.conferenceCareerState.enterpriseCount === "number" ? value.conferenceCareerState.enterpriseCount : baseState.enterpriseCount,
    rejectedInternshipCount: typeof value.conferenceCareerState.rejectedInternshipCount === "number" ? value.conferenceCareerState.rejectedInternshipCount : baseState.rejectedInternshipCount,
    permanentlyBlockedInternship: value.conferenceCareerState.permanentlyBlockedInternship === true,
  };
}

export function normalizeAchievementFlags(value: Record<string, unknown>): GameState["achievementFlags"] {
  const baseFlags = createAchievementFlags();
  if (!isObject(value.achievementFlags)) {
    return baseFlags;
  }

  return {
    ...baseFlags,
    sickly: value.achievementFlags.sickly === true,
    nearDeath: value.achievementFlags.nearDeath === true,
    terraria300: value.achievementFlags.terraria300 === true,
    magicTowerMaster: value.achievementFlags.magicTowerMaster === true,
    thankYouPlaying: value.achievementFlags.thankYouPlaying === true,
    badmintonAvoidedCold: value.achievementFlags.badmintonAvoidedCold === true,
    badmintonChampion: value.achievementFlags.badmintonChampion === true,
    pokerGod: value.achievementFlags.pokerGod === true,
    ktvKing: value.achievementFlags.ktvKing === true,
    narrowEscape: value.achievementFlags.narrowEscape === true,
    learnToSayNo: value.achievementFlags.learnToSayNo === true,
    projectKing: value.achievementFlags.projectKing === true,
    loveMyTeacher: value.achievementFlags.loveMyTeacher === true,
    highScorePaper: value.achievementFlags.highScorePaper === true,
    advancedEquipment: value.achievementFlags.advancedEquipment === true,
    cyclingMaster: value.achievementFlags.cyclingMaster === true,
    fullGear: value.achievementFlags.fullGear === true,
  };
}

export function normalizeRandomEventState(
  value: Record<string, unknown>,
): Pick<GameState, "availableRandomEvents" | "usedRandomEvents" | "coldWeight" | "badmintonYear" | "totalRandomEventCount"> {
  const fallback = createInitialRandomEventState(countPublishedPapers(value));
  return {
    availableRandomEvents: Array.isArray(value.availableRandomEvents)
      ? value.availableRandomEvents.filter((eventId): eventId is number => typeof eventId === "number")
      : fallback.availableRandomEvents,
    usedRandomEvents: Array.isArray(value.usedRandomEvents)
      ? value.usedRandomEvents.filter((eventId): eventId is number => typeof eventId === "number")
      : fallback.usedRandomEvents,
    coldWeight: typeof value.coldWeight === "number" && Number.isFinite(value.coldWeight) && value.coldWeight > 0
      ? value.coldWeight
      : fallback.coldWeight,
    badmintonYear: typeof value.badmintonYear === "number" && Number.isFinite(value.badmintonYear)
      ? value.badmintonYear
      : fallback.badmintonYear,
    totalRandomEventCount: typeof value.totalRandomEventCount === "number" && Number.isFinite(value.totalRandomEventCount)
      ? Math.max(0, Math.floor(value.totalRandomEventCount))
      : fallback.totalRandomEventCount,
  };
}
