import { usesGameplayRulesFrom } from "./v2-rule-context";

export function getPartTimeGrowthInterval(): number {
  return usesGameplayRulesFrom("20261022-r15") ? 5 : 8;
}

export function getPartTimeGrowthReward(): number {
  return usesGameplayRulesFrom("20261022-r15") ? 0.5 : 1;
}

export const MEETING_EXPERIENCE_INTERVAL = 4;
export const ACTIVITY_WIN_RATE_CAP = 100;
export const BADMINTON_VICTORY_THRESHOLD = 100;

export function getBadmintonStrength(san: number, participationCount: number, hasRacket: boolean): number {
  return Math.max(0, san) * (Math.max(0, Math.floor(participationCount)) + 3) + (hasRacket ? 40 : 0);
}

export function getPokerWinRate(participationCount: number): number {
  return Math.min(ACTIVITY_WIN_RATE_CAP, 40 + Math.max(0, Math.floor(participationCount)) * 10);
}

export function getMeetingExperienceLevel(attendedMeetingCount: number): number {
  return Math.max(0, Math.floor(Math.max(0, attendedMeetingCount) / MEETING_EXPERIENCE_INTERVAL));
}

export function getMeetingExperienceDiscount(_attendedMeetingCount: number, _selfPayCost: number): number {
  return 0;
}

export function getReadingGrowthProgress(readCount: number): { completed: number; nextAt: number } {
  const completed = Math.max(0, Math.floor(Math.max(0, readCount) / 10));
  return { completed, nextAt: (completed + 1) * 10 };
}

export function getPartTimeGrowthProgress(workCount: number): { tier: number; nextAt: number } {
  const normalized = Math.max(0, Math.floor(workCount));
  const interval = getPartTimeGrowthInterval();
  const tier = Math.floor(normalized / interval);
  return { tier, nextAt: (tier + 1) * interval };
}
