export interface EventCounters {
  coldCount: number;
  gamePlayCount: number;
  terrariaCount: number;
  magicTowerCount: number;
  gradSimCount: number;
  badmintonCount: number;
  pokerWinCount: number;
  pokerTotalEarnings: number;
  ktvCount: number;
  dinnerCount: number;
  meetingCount: number;
  teaBreakCount: number;
  tourCount: number;
  rejectedMentoringCount: number;
  rejectedReviewCount: number;
  rejectedProjectCount: number;
  projectCompletedCount: number;
  consecutiveStampGiftCount: number;
}

export type AchievementFlagId =
  | "sickly"
  | "nearDeath"
  | "terraria300"
  | "magicTowerMaster"
  | "thankYouPlaying"
  | "badmintonAvoidedCold"
  | "badmintonChampion"
  | "pokerGod"
  | "ktvKing"
  | "narrowEscape"
  | "learnToSayNo"
  | "projectKing"
  | "loveMyTeacher"
  | "highScorePaper"
  | "advancedEquipment"
  | "cyclingMaster"
  | "fullGear";

export type AchievementFlags = Record<AchievementFlagId, boolean>;
