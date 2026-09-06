export const MEETING_EXPERIENCE_INTERVAL = 4;
export const ACTIVITY_WIN_RATE_CAP = 100;
export const BADMINTON_VICTORY_THRESHOLD = 100;

export function getBadmintonStrength(san: number, participationCount: number, hasRacket: boolean): number {
  return Math.max(0, san) * (Math.max(0, Math.floor(participationCount)) + 3) + (hasRacket ? 40 : 0);
}

export function getBadmintonWinRate(participationCount: number, hasRacket: boolean): number {
  return Math.min(
    ACTIVITY_WIN_RATE_CAP,
    40 + Math.max(0, Math.floor(participationCount)) * 10 + (hasRacket ? 30 : 0),
  );
}

export function getPokerWinRate(participationCount: number): number {
  return Math.min(ACTIVITY_WIN_RATE_CAP, 40 + Math.max(0, Math.floor(participationCount)) * 10);
}

export function getMeetingExperienceLevel(attendedMeetingCount: number): number {
  return Math.max(0, Math.floor(Math.max(0, attendedMeetingCount) / MEETING_EXPERIENCE_INTERVAL));
}

export function getMeetingExperienceDiscount(attendedMeetingCount: number, selfPayCost: number): number {
  const halfCost = Math.floor(Math.max(0, selfPayCost) * 0.5);
  return Math.min(halfCost, getMeetingExperienceLevel(attendedMeetingCount));
}

export function getReadingGrowthProgress(readCount: number): { completed: number; nextAt: number } {
  const completed = Math.max(0, Math.floor(Math.max(0, readCount) / 10));
  return { completed, nextAt: (completed + 1) * 10 };
}

export function getPartTimeGrowthProgress(workCount: number): { tier: number; nextAt: number } {
  const normalized = Math.max(0, Math.floor(workCount));
  const tier = Math.floor(normalized / 8);
  return { tier, nextAt: (tier + 1) * 8 };
}
