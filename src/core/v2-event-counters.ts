import type { EventCounters } from "./v2-types";

export function createEventCounters(): EventCounters {
  return {
    coldCount: 0,
    gamePlayCount: 0,
    terrariaCount: 0,
    magicTowerCount: 0,
    gradSimCount: 0,
    badmintonCount: 0,
    pokerWinCount: 0,
    pokerTotalEarnings: 0,
    ktvCount: 0,
    dinnerCount: 0,
    meetingCount: 0,
    teaBreakCount: 0,
    tourCount: 0,
    rejectedMentoringCount: 0,
    rejectedReviewCount: 0,
    rejectedProjectCount: 0,
    projectCompletedCount: 0,
    consecutiveStampGiftCount: 0,
  };
}