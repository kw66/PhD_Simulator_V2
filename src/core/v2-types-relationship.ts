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

export interface AdvisorProgressState {
  researchResource: number;
  affinity: number;
  taskProgress: number;
  taskMax: number;
  relationProgress: number;
  relationMax: number;
  canInteract: boolean;
  taskUsedThisMonth: boolean;
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
}

export interface FellowProgressProfile {
  id: string;
  name?: string;
  type: FellowTypeId;
  gender: Gender;
  research: number;
  affinity: number;
  taskType: FellowTaskType;
  taskProgress: number;
  taskMax: number;
  relationProgress: number;
  relationMax: number;
  canInteract: boolean;
  taskUsedThisMonth: boolean;
  startTotalMonths: number;
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
