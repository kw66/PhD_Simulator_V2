import type { FixedPaperTopic } from "./v2-paper-topics";
import type {
  Degree,
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
  kind?: "remote3" | "conference6";
  startTotalMonths?: number;
  endTotalMonths?: number;
  remainingMonths: number;
  experimentMultiplier: number;
  experimentBonus?: number;
  experimentMoneyDiscount?: number;
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
  resultRoll: number;
}

export interface AdvisorProgressState {
  horizontalContributorIds?: string[];
  researchAccumulation: number;
  funding: number;
  horizontalProgress?: number;
  verticalProgress?: number;
  nextProject?: "horizontal" | "vertical";
  awards: AdvisorGrantAward[];
  pendingApplication: AdvisorGrantApplication | null;
  countedPaperIds: string[];
  lastSettledTotalMonths: number | null;
  lastHorizontalTotalMonths?: number | null;
  lastProjectTotalMonths?: number | null;
  lastAdvisorProjectTotalMonths?: number | null;
  lastPlayerProjectTotalMonths?: number | null;
  pendingGuidanceToPlayer?: number | null;
  monthlyActivity?: string;
  paidJournalPaperIds?: string[];
  paidConferenceRegistrationPaperIds?: string[];
  paidFellowConferencePaperIds?: string[];
  paidFellowConferenceTrips?: string[];
  paidPlayerConferenceTrips?: string[];
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
  lastAnnualGrowthTotalMonths?: number;
  annualResearchActivity?: string;
  sanDiscountMonths?: number[];
  monthlyActivity?: string;
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
  academicYear?: number;
  academicStartTotalMonths?: number;
  degree?: Degree;
  initialResearchScore?: number;
  monthlySalaryPaid?: number;
  lastSalaryTotalMonths?: number;
  pendingHelpToPlayer?: number | null;
  pendingHelpToFellow?: number | null;
  lastAdvancedTotalMonths?: number;
  nextMonthlyAction?: "research" | "project";
  lastAnnualGrowthTotalMonths?: number;
  annualResearchActivity?: string;
  lastProjectTotalMonths?: number;
  monthlyActivity?: string;
  pendingGuidanceFromAdvisor?: number | null;
  monthlyPublicationCosts?: { totalMonths: number; registration: number; journal: number; sharedTravel: number };
  affinityRewardedPaperIds?: string[];
  helpedPlayerCount?: number;
  monthlySupportActivity?: string;
  lastSupportTotalMonths?: number;
  helpedFellowCount?: number;
  annualResearchGrowthTotal?: number;
  longTermMentoring?: boolean;
}

export interface FellowFinanceAccount {
  name: string;
  money: number;
  aiSlot?: "gpt" | "deepseek" | "doubao" | "claude";
  aiSubscribedTotalMonths?: number;
}

export interface FellowProfileAddition {
  type: FellowTypeId;
  gender: Gender;
  research: number;
  affinity: number;
  name?: string;
  taskType?: FellowTaskType;
  academicYear?: number;
  academicStartTotalMonths?: number;
  degree?: Degree;
  initialResearchScore?: number;
  longTermMentoring?: boolean;
}

export interface EventSupportState {
  hasParasol: boolean;
  hasDownJacket: boolean;
  hasBadmintonRacket: boolean;
  hasStrongBodyTalent: boolean;
  aiCostsCoveredUntilTotalMonths?: number | null;
}
