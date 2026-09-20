import type { FixedPaperTopic } from "./v2-paper-topics";
import type {
  FellowTaskType,
  FellowTypeId,
  Gender,
  LoverTypeId,
} from "./v2-types";

export interface RelationshipState {
  unlockedSlots: number;
  occupiedSlots: number;
  advisorCount: number;
  seniorCount: number;
  juniorCount: number;
  peerCount: number;
  loverCount: number;
  mentorshipStacks: number;
}

export interface ConferenceEncounterState {
  metBigBullCoop: boolean;
  bigBullCooperation: boolean;
  bigBullCoopCount: number;
  bigBullDeepCount: number;
  rejectedBigBullCoopCount: number;
  permanentlyBlockedBigBullCoop: boolean;
  metBeautiful: boolean;
  beautifulCount: number;
  rejectedBeautifulLoverCount: number;
  permanentlyBlockedBeautifulLover: boolean;
  metSmart: boolean;
  smartCount: number;
  rejectedSmartLoverCount: number;
  permanentlyBlockedSmartLover: boolean;
}

export interface ConferenceCareerState {
  enterpriseCount: number;
  rejectedInternshipCount: number;
  permanentlyBlockedInternship: boolean;
}

export interface InternshipState {
  active: boolean;
  remainingMonths: number;
  experimentMultiplier: number;
}

export interface LoverState {
  active: boolean;
  name?: string;
  type: LoverTypeId | null;
  gender: Gender | null;
  startTotalMonths: number | null;
  beautifulExtraRecoveryRate: number;
}

export interface ResearchCapacityState {
  baseCap: number;
  jointTrainingCitationCapBonus: number;
  otherCapBonus: number;
}

export type AdvisorGrantId = "youth" | "general" | "excellent" | "distinguished" | "academician";

export interface AdvisorGrantAward {
  id: AdvisorGrantId;
  awardedYear: number;
  startYear: number | null;
  endYear: number | null;
}

export interface AdvisorGrantApplication {
  id: AdvisorGrantId;
  calendarYear: number;
  researchSnapshot: number;
}

export interface AdvisorProgressState {
  researchAccumulation: number;
  funding: number;
  awards: AdvisorGrantAward[];
  pendingApplication: AdvisorGrantApplication | null;
  countedPaperIds: string[];
  lastSettledTotalMonths: number | null;
  lastHorizontalTotalMonths?: number | null;
  salaryRemainder?: number;
  monthlyResearchGrowth?: {
    totalMonths: number;
    funding: number | null;
    papers: number;
  };
}

export interface LoverProgressState {
  active: boolean;
  research: number;
  intimacy: number;
  taskProgress: number;
  taskMax: number;
  relationProgress: number;
  relationMax: number;
  canInteract: boolean;
  taskUsedThisMonth: boolean;
  completedTaskCount: number;
  routes?: Record<"play" | "study" | "shopping", { progress: number; completed: number }>;
  giftCoupons?: number;
  pendingPaperHelp?: { amount: number; collaboratorId: string; name: string } | null;
  lastDateTotalMonths?: number;
  lastAdvancedTotalMonths?: number;
  sanDiscountMonths?: number[];
}

export interface FellowProgressProfile {
  id: string;
  name?: string;
  researchTopic?: FixedPaperTopic;
  type: FellowTypeId;
  gender: Gender;
  research: number;
  affinity: number;
  taskType: FellowTaskType;
  taskProgress: number;
  taskMax: number;
  taskUsedThisMonth: boolean;
  startTotalMonths: number;
  pendingHelpToPlayer?: number | null;
  pendingHelpToFellow?: number | null;
  lastAdvancedTotalMonths?: number;
  lastAnnualGrowthTotalMonths?: number;
  affinityRewardedPaperIds?: string[];
}

export interface FellowProfileAddition {
  type: FellowTypeId;
  gender: Gender;
  research: number;
  affinity: number;
  name?: string;
  taskType?: FellowTaskType;
}

export interface EventSupportState {
  hasParasol: boolean;
  hasDownJacket: boolean;
  hasBadmintonRacket: boolean;
  hasStrongBodyTalent: boolean;
  aiCostsCoveredUntilTotalMonths?: number | null;
}
