export interface EventCounters {
  badmintonCount: number;
  pokerCount: number;
  pokerProfit: number;
  meetingCount: number;
  domesticMeetingCount: number;
  asiaMeetingCount: number;
  westMeetingCount: number;
  teachersDayErrandCount: number;
  terrariaCount: number;
  magicTowerCount: number;
  rocoCount: number;
}

export function createEventCounters(): EventCounters {
  return {
    badmintonCount: 0,
    pokerCount: 0,
    pokerProfit: 0,
    meetingCount: 0,
    domesticMeetingCount: 0,
    asiaMeetingCount: 0,
    westMeetingCount: 0,
    teachersDayErrandCount: 0,
    terrariaCount: 0,
    magicTowerCount: 0,
    rocoCount: 0,
  };
}
