export interface EventCounters {
  badmintonCount: number;
  pokerCount: number;
  pokerProfit: number;
  meetingCount: number;
}

export function createEventCounters(): EventCounters {
  return {
    badmintonCount: 0,
    pokerCount: 0,
    pokerProfit: 0,
    meetingCount: 0,
  };
}
