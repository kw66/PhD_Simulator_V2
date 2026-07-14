import type {
  FellowTaskType,
  FellowTypeId,
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
  metBigBull: boolean;
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
  startTotalMonths: number | null;
  experimentMultiplier: number;
}

export interface LoverState {
  active: boolean;
  type: LoverTypeId | null;
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
  taskMultiplier: number;
  relationProgress: number;
  relationMax: number;
  canInteract: boolean;
  taskUsedThisMonth: boolean;
  completedProjectCount: number;
  interactCount: number;
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
  interactCount: number;
}

export interface FellowProgressProfile {
  id: string;
  name?: string;
  type: FellowTypeId;
  research: number;
  affinity: number;
  taskType: FellowTaskType;
  taskProgress: number;
  taskMax: number;
  relationProgress: number;
  relationMax: number;
  canInteract: boolean;
  taskUsedThisMonth: boolean;
  completedTaskCount: number;
  interactCount: number;
  startTotalMonths: number;
}

export interface JointTrainingState {
  citationBonusApplied: number;
}

export interface EventSupportState {
  hasGameController: boolean;
  hasParasol: boolean;
  hasDownJacket: boolean;
  hasBadmintonRacket: boolean;
  hasStrongBodyTalent: boolean;
  hasFinanceTalent: boolean;
}
