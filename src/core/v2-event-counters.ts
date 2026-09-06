import type { EventCounters } from "./v2-types";

export function createEventCounters(): EventCounters {
  return {
    badmintonCount: 0,
    pokerCount: 0,
    pokerProfit: 0,
    meetingCount: 0,
  };
}
