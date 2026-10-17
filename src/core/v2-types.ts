import type { CareerOffer, CareerType } from "./v2-career-rules";
import type { DebugRelationshipType, DebugStatId } from "./v2-action-ids";
import type { PaperCompetitionResolution } from "./v2-paper-competition";
import type { RandomEventState } from "./v2-random-event-rules";
import type { ThesisBlindReview, ThesisScoreHistoryEntry, ThesisState } from "./v2-thesis-rules";
import type { EventCounters } from "./v2-event-counters";
import type {
  AiShopState,
  AiSlotId,
  CoffeeState,
  MonthlyActionState,
  ReadingState,
  ShopEntitlementState,
  ShopState,
} from "./v2-types-economy";
import type { FixedEventResolution } from "./v2-types-fixed-events";
import type { TeachersDayGiftId } from "./v2-types-fixed-events";
import type { ConferenceEventContext } from "./v2-conference-events";
import type { ConferenceActivityContext } from "./v2-conference-activity-shared";
import type {
  AdvisorGrantApplication,
  AdvisorProgressState,
  ConferenceCareerState,
  ConferenceEncounterState,
  EventSupportState,
  FellowFinanceAccount,
  FellowProfileAddition,
  FellowProgressProfile,
  InternshipState,
  LoverProgressState,
  LoverState,
  RelationshipState,
  ResearchCapacityState,
} from "./v2-types-relationship";

export type { EventCounters } from "./v2-event-counters";
export * from "./v2-types-economy";
export * from "./v2-types-fixed-events";
export * from "./v2-types-relationship";
export type { DebugRelationshipType, DebugStatId, GameActionId } from "./v2-action-ids";

export type RoleMode = "upright" | "reversed";
export type Gender = "male" | "female";
export type RoleId =
  | "normal"
  | "genius"
  | "social"
  | "rich"
  | "teacher-child"
  | "chosen"
  | "rewinder"
  | "research-captain"
  | "normal-reversed"
  | "genius-reversed"
  | "social-reversed"
  | "rich-reversed"
  | "teacher-child-reversed"
  | "chosen-reversed"
  | "special-finite-life"
  | "special-fading-genius"
  | "cursed-frail"
  | "cursed-debt";
export type RoleGrowthStatId = DebugStatId;
export type GamePhase = "setup" | "playing" | "finished";
export type Degree = "master" | "phd";
export type DateDisplayMode = "academic" | "calendar";
export type EndingId = "master" | "phd" | "delay" | "burnout" | "poor" | "expelled" | "isolated" | "overthinking" | "lab-bankrupt" | "quit" | null;
export type PaperTarget = "C" | "B" | "A";
export type JournalTarget = "nature" | "nmi" | "pami";
export type PaperStatus = "draft" | "reviewing" | "journal-reviewing" | "published";
export type PaperReviewDecision = "Accept" | "Borderline" | "Reject";
export type PaperReviewerType = "novelty" | "experiment" | "normal" | "gpt" | "expert" | "kind" | "strict" | "hostile";
export type PaperReviewerFocus = "balanced" | "idea" | "experiment" | "weakness";
export type PaperAcceptType = "Poster" | "Spotlight" | "Oral" | "Best Paper Candidate" | "Best Paper";
export type SupportItemId = "badminton_racket" | "parasol";
export type ChairUpgradeId = "advanced" | "massage" | "torture" | "spike" | "hammock" | null;
export type ShopItemId = "gpu_buy" | "chair" | "keyboard" | "monitor" | "bike" | "ebike" | "down_jacket";
export type ShopUpgradeId =
  | "chair-advanced"
  | "chair-massage"
  | "chair-torture"
  | "chair-spike"
  | "chair-hammock";
export type CoffeeMachineUpgradeId = "manual" | "automatic" | "advanced" | "unlimited" | null;
export type EventSource = "fixed" | "random" | "system" | "review" | "thesis" | "career";
export type EventStage = "act1" | "act2" | "act3" | "act4" | "result";
export interface PlayerStats {
  san: number;
  research: number;
  social: number;
  favor: number;
  money: number;
}

export interface SanHistoryEntry {
  totalMonths: number;
  san: number;
  sanCap: number;
}

export type PaperActionType = "idea" | "experiment" | "writing";
export type ActiveOperationType =
  | "rest"
  | "read"
  | "work"
  | PaperActionType
  | "relationship-task";

export type PersistentExtraActions = Record<PaperActionType, number>;

/** A single action contribution supplied by one or more Buffs. */
export interface TemporaryActionEffect {
  bonus?: number;
  multiplier?: number;
  extraActions?: number;
  /** Additive SAN cost adjustment for this specific paper action. Negative values reduce cost. */
  sanDelta?: number;
}

export type TemporaryActionEffectUpdates = Partial<Record<PaperActionType, Partial<TemporaryActionEffect>>>;

export interface PaperPublicationState {
  citations: number;
  effectiveScore: number;
  /** Paper-bound multiplier in the citation-debuff zone. */
  citationDebuffMultiplier: number;
  /** One-off publication bonus in the promotion zone. */
  promotionMultiplier?: number;
  /** Fixed venue visibility captured when the paper is published. */
  influence?: number;
  journalTarget?: JournalTarget;
  acceptType?: PaperAcceptType;
  /** Number of elapsed game months since publication. */
  monthsSincePublish?: number;
  /** Citation threshold frozen from the paper heat at publication time. */
  highlyCitedThreshold?: number;
  /** Permanently awarded after reaching the first-year highly cited threshold. */
  highlyCited?: boolean;
  /** Fractional citation growth carried into the next settlement. */
  pendingCitationFraction?: number;
  /** arXiv makes the paper visible before the conference attendance flow ends. */
  preprintExposed?: boolean;
  posterExposed?: boolean;
  promotions?: PaperPromotionState;
}

export interface PaperReviewerReport {
  reviewer: string;
  reviewCode?: string;
  weightInfo?: string;
  reviewerType?: PaperReviewerType;
  focus: PaperReviewerFocus;
  effectiveScore: number;
  decision: PaperReviewDecision;
  reviewScore: -1 | 0 | 1;
  comment?: string;
  improvementAction?: PaperActionType;
  improvementAmount?: number;
  improvements?: Partial<Record<PaperActionType, number>>;
  /** SAN change applied when the player confirms the review result. */
  sanChange?: number;
  baseSanChange?: number;
  /** Extra SAN spent because of illness at the time of settlement. */
  illnessSanIncrease?: number;
}

export interface PaperReviewResult {
  reports: PaperReviewerReport[];
  totalReviewScore: number;
  accepted: boolean;
  borderlineChance: number | null;
}

export interface PaperReviewSettlement {
  paperId: string;
  target: PaperTarget;
  accepted: boolean;
  acceptType: PaperAcceptType | null;
  submittedScore: number;
  totalReviewScore: number;
  borderlineChance: number | null;
  venueInfluence: number;
  reviewStrictnessMultiplier: number;
  scoreGain: number;
  reviewerSanChange: number;
  reports: PaperReviewerReport[];
}

export type PaperReviewScores = Pick<Paper, "idea" | "experiment" | "writing">;

export type PaperReviewScoreSnapshot = PaperReviewScores & { total: number };

export interface PaperReviewScoreChange {
  submitted: PaperReviewScoreSnapshot;
  beforeSettlement: PaperReviewScoreSnapshot;
  afterSettlement: PaperReviewScoreSnapshot;
  duringReviewChange: PaperReviewScoreSnapshot;
  reviewerImprovement: PaperReviewScoreSnapshot;
  settlementChange: PaperReviewScoreSnapshot;
  totalChange: PaperReviewScoreSnapshot;
}

export type PaperReviewEventPresentation =
  | {
      kind: "overview";
      paperTitle: string;
      target: PaperTarget;
      conferenceName: string;
      conferenceYear: number;
      conferenceFullName: string;
      field: string;
      referenceScore: number;
      venueInfluence: number;
      reviewStrictnessMultiplier: number;
      submittedScore: number;
    }
  | {
      kind: "reviewers";
      paperTitle: string;
      target: PaperTarget;
      venueInfluence: number;
      submittedScore: number;
      submittedScores: PaperReviewScores;
      reviewedScores: PaperReviewScores;
      reviewDurationMonths?: number;
      reports: PaperReviewerReport[];
      conferenceName?: string;
      conferenceYear?: number;
    }
  | {
      kind: "decision";
      paperTitle: string;
      target: PaperTarget;
      accepted: boolean;
      acceptType: PaperAcceptType | null;
      resultText: string;
      totalReviewScore: number;
      borderlineChance: number | null;
      rewardText: string;
      scoreChange: PaperReviewScoreChange;
      conferenceName?: string;
      conferenceYear?: number;
      reports?: PaperReviewerReport[];
    };

export interface JournalScoreHistoryEntry {
  totalMonths: number;
  score: number;
}

export interface JournalAcceptancePresentation {
  stage: "overview" | "timeline";
  paperTitle: string;
  journalName: string;
  journalTarget: JournalTarget;
  submissionScore: number;
  acceptanceScore: number;
  submissionThreshold: number;
  acceptanceThreshold: number;
  scoreHistory: JournalScoreHistoryEntry[];
}

export interface ThesisReviewPresentation {
  stage: "overview" | "reports" | "decision";
  degree: Degree;
  title: string;
  pointScores: number[];
  scoreHistory: ThesisScoreHistoryEntry[];
  review: ThesisBlindReview;
}

export interface PaperPromotionState {
  arxiv: boolean;
  github: boolean;
  xiaohongshu: boolean;
  quantum?: boolean;
}

export type PaperPromotionId = keyof PaperPromotionState;

export type RelationshipKind = "advisor" | "senior" | "junior" | "peer" | "lover";
export type FellowTypeId = "senior" | "peer" | "junior";
export type FellowTaskType = "idea" | "experiment" | "writing";
export type LoverTypeId = "beautiful" | "smart";

export interface RoleDefinition {
  id: RoleId;
  mode: RoleMode;
  gender: Gender;
  name: string;
  icon: string;
  startingStats: PlayerStats;
}

export type BuffTiming = "permanent" | "monthly" | "next-action";

export interface ReadingEffect {
  sanDelta?: number;
  manualExtraReads?: number;
  automaticReads?: number;
}

export interface Buff {
  id: string;
  relationshipId?: string;
  name: string;
  source: string;
  timing: BuffTiming;
  remainingMonths: number | null;
  monthlyStats?: Partial<PlayerStats>;
  /** A one-month ordinary-action adjustment, scheduled by an event. AI allowance is unaffected. */
  monthlyActionLimitDelta?: number;
  actionLimitAtTotalMonths?: number;
  /** The clamped adjustment actually applied; restored once when the scheduled month ends. */
  appliedActionLimitDelta?: number;
  /** Multiplies immediate SAN costs, excluding fixed drains and recovery. */
  activeOperationSanMultiplier?: number;
  activeOperationSanDelta?: number;
  /** Fixed SAN adjustment for relationship operations. */
  relationshipOperationSanDelta?: number;
  labExperimentMoneyDelta?: number;
  scholarshipDisqualified?: boolean;
  /** Structured effects for the three paper actions. */
  actionEffects?: TemporaryActionEffectUpdates;
  /** Automatic score polishing applied to editable drafts and journal revisions. */
  paperPolishEffects?: Partial<Record<PaperActionType, number>>;
  /** Reading modifiers used by AI models and future reading equipment. */
  readingEffect?: ReadingEffect;
  /** Shop cost exemptions supplied by temporary events. */
  shopEffects?: {
    aiCostsCovered?: boolean;
    aiCostsCoveredAtTotalMonths?: number;
    /** Number of AI purchases or renewals covered when the reimbursement is consumed one use at a time. */
    aiCostsCoveredUses?: number;
  };
  /** Publication multipliers consumed by publication and citation settlement. */
  publicationEffects?: {
    nextPromotionMultiplier?: number;
    citationDebuffMultiplier?: number;
  };
  description?: string;
}

export interface RoleLobbyDefinition {
  summary: string;
  growthStatIds: RoleGrowthStatId[];
}

export interface RoleUnlockState {
  owned: boolean;
}

export interface RoleMetaProgress {
  level: number;
  exp: number;
  completedRuns: number;
  playedRuns: number;
  startedRuns: number;
  unlockedAchievementIds: string[];
  historyBest: RoleHistoryBest;
  unlocked: boolean;
}

export interface RoleExperienceAward {
  roleId: RoleId;
  gained: number;
  previousLevel: number;
  level: number;
  exp: number;
  disqualifiedByDebug?: boolean;
  disqualifiedByIntegrity?: boolean;
}

export interface RoleHistoryBest {
  researchScore: number;
  totalCitations: number;
  hIndex: number;
  natureCount: number;
  representativeCitations: number;
  representativeScore: number;
}

export interface ScholarshipState {
  lastAwardYear: number | null;
  awardCount?: number;
  scoreBaseline: number;
  claimedPaperIds: string[];
}

export interface PublicationTalentState {
  claimedIds: string[];
}

export interface AccountProfile {
  /** Highest unlocked challenge per cursed character. Difficulty numbers are 1..4. */
  curseDifficultyUnlocked?: Partial<Record<RoleId, import("./v2-curse-system").CurseDifficulty>>;
  /** Last lobby selection per cursed character, clamped to the unlocked challenge. */
  curseDifficultyByRole?: Partial<Record<RoleId, import("./v2-curse-system").CurseDifficulty>>;
  talentAllocation?: Partial<Record<RoleId, Record<string, number>>>;
  dateDisplayMode: DateDisplayMode;
  selectedLobbyRoleId: RoleId;
  lobbyRolePage: number;
  lobbyRoleAchievementPage: number;
  achievementUnlockedAt: Record<string, string>;
  /** First completion date for each achievement by role. Shared achievements may have many entries. */
  achievementUnlockedByRole?: Record<string, Partial<Record<RoleId, string>>>;
  /** IDs whose one-time reward has already been granted. */
  achievementRewardedIds?: string[];
  /** Cross-run collection sets used by collector achievements. */
  achievementCollectionProgress?: AchievementCollectionProgress;
  /** Per-role experience multiplier earned from achievements. */
  achievementExperienceMultipliers?: Partial<Record<RoleId, number>>;
  /** Per-role bonus talent points earned from achievements. */
  achievementTalentPoints?: Partial<Record<RoleId, number>>;
  roleProgress: Record<RoleId, RoleMetaProgress>;
  lastRunExperience?: RoleExperienceAward;
}

export interface AchievementCollectionProgress {
  buffs: string[];
  products: string[];
  conferences: string[];
  locations: string[];
  directions: string[];
}

export interface LobbySelectedRoleStatViewModel {
  id: RoleGrowthStatId;
  label: string;
  total: number;
}

export interface LobbySelectedRoleHistoryStatViewModel {
  id: "research-score" | "total-citations" | "h-index" | "nature-count" | "representative";
  label: string;
  value: string;
}

export interface LobbySelectedRoleStatisticsViewModel {
  id: "completed-runs" | "played-runs" | "global-completed-runs" | "global-played-runs" | "phd-rate";
  label: string;
  value: string;
  tooltip: string;
}

export type AchievementAudience = "all" | "upright" | "reversed" | "special" | "cursed";

/** Achievement eligibility and reward recipients share this scope; all means every role. */
export interface AchievementScope {
  audiences?: AchievementAudience[];
  roleIds?: RoleId[];
}

export interface RoleAchievementDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
  rewardText?: string;
  unlocksRoleId?: RoleId;
  unlocksRoleIds?: readonly RoleId[];
  scope?: AchievementScope;
  rewardScope?: AchievementScope;
}

export interface LobbySelectedRoleAchievementViewModel {
  definition: RoleAchievementDefinition;
  unlocked: boolean;
}

export interface LobbySelectedRoleViewModel {
  role: RoleDefinition;
  lobby: RoleLobbyDefinition;
  progress: RoleMetaProgress;
  unlockState: RoleUnlockState;
  stats: LobbySelectedRoleStatViewModel[];
  historyStats: LobbySelectedRoleHistoryStatViewModel[];
  statistics: LobbySelectedRoleStatisticsViewModel[];
  roleAchievements: LobbySelectedRoleAchievementViewModel[];
}

export interface AdvisorRequirements {
  phdYear2: number;
  phdYear3: number;
  masterGrad: number;
  phdGrad: number;
}

export interface Paper {
  id: string;
  acceptedTotalMonths?: number;
  acceptedOrder?: number;
  /** Workstation slot chosen at creation; drafts added by debug tools omit it and fill free slots in order. */
  paperSlotIndex?: number;
  title: string;
  topicId: string;
  topicLabel: string;
  heatMultiplier: number;
  prepublicationDecayRate: number;
  idea: number;
  experiment: number;
  writing: number;
  collaborationScores?: Partial<Record<PaperActionType, number>>;
  researchDiagnostics?: import("./v2-paper-diagnostics").PaperResearchDiagnostics;
  collaborators?: PaperCollaborator[];
  submittedCollaborationScores?: Partial<Record<PaperActionType, number>> | null;
  status: PaperStatus;
  target: PaperTarget | null;
  journalTarget?: JournalTarget | null;
  reviewMonthsLeft: number;
  submittedIdea: number | null;
  submittedExperiment: number | null;
  submittedWriting: number | null;
  submittedMonth?: number | null;
  submittedYear?: number | null;
  journalScoreHistory?: JournalScoreHistoryEntry[];
  conferenceHandled?: boolean;
  conferenceHandledAtTotalMonths?: number;
  /** Earliest month in which the post-acceptance conference event may appear. */
  conferenceAvailableAtTotalMonths?: number;
  publication?: PaperPublicationState | null;
  /** Paper-bound citation debuff captured before submission. */
  citationDebuffMultiplierOnPublish?: number;
  imageMisusePending?: boolean;
  lastReview?: PaperReviewResult | null;
  rejectionCount?: number;
  nonFirstAuthor?: boolean;
  /** Optional relationship author used for non-first-author publications. */
  leadAuthorName?: string;
  leadAuthorId?: string;
  createdTotalMonths?: number;
}

export interface GameLogEntry {
  id: string;
  month: number;
  text: string;
  /** Set for the compact log entry created when an event chain completes. */
  eventHistoryId?: string;
}

export interface GrantedPublicationEffect {
  title?: string;
  target: PaperTarget;
  acceptedScore: number;
  citationDebuffMultiplier?: number;
  nonFirstAuthor?: boolean;
  leadAuthorName?: string;
}

export type PaperEffectUpdate = { id: string } & Partial<Omit<Paper, "id">>;

export interface PaperCollaborator {
  id: string;
  name: string;
  contributionScores?: Partial<Record<PaperActionType, number>>;
}

export interface PaperCollaborationEffect {
  paperId: string;
  collaborator: PaperCollaborator;
  scores: Partial<Record<PaperActionType, number>>;
}

export interface EventChoice {
  id: string;
  label: string;
  outcome: string;
  disabledReason?: string;
  cosmetic?: boolean;
  effects: {
    /** Stable gameplay facts; credited only when the choice is settled. */
    achievementFacts?: string[];
    san?: number;
    research?: number;
    social?: number;
    favor?: number;
    money?: number;
    /** Original requests retained beside presentation deltas; settle against the current state once. */
    rawResearch?: number;
    rawSocial?: number;
    rawFavor?: number;
    fixedEventResolutionRolls?: number[];
    illnessProbabilityMultiplier?: number;
    illnessProbabilityDelta?: number;
    score?: number;
    transferToPhd?: boolean;
    stayOnEvent?: boolean;
    sanCapDelta?: number;
    resolveThesisReview?: boolean;
    careerRecruitment?: {
      totalMonths: number;
      type?: CareerType;
      experienceGain?: number;
      offer?: CareerOffer;
    };
    ideaBonus?: number;
    experimentBonus?: number;
    writingBonus?: number;
    temporaryActionEffectUpdates?: TemporaryActionEffectUpdates;
    nextPublicationPromotionMultiplier?: number;
    citationDebuffMultiplier?: number;
    draftCitationDebuffMultiplier?: number;
    markDraftImageMisuse?: boolean;
    clearDraftProgress?: boolean;
    grantedPublication?: GrantedPublicationEffect;
    eventSupportUpdates?: Partial<EventSupportState>;
    shopEntitlementDeltas?: Partial<ShopEntitlementState>;
    labReimbursement?: keyof ShopEntitlementState;
    persistentExtraActionDeltas?: Partial<PersistentExtraActions>;
    relationshipAdditions?: RelationshipKind[];
    fellowAdditions?: FellowProfileAddition[];
    /** Frozen random selector for the social talent's delegation reward. */
    juniorDelegationRoll?: number;
    /** Genuine recruitment attempts rejected because the fellow slots are full. */
    fellowOverflowAttempts?: number;
    /** Keep rejected recruits identifiable so graduation cancels a pending overflow reward. */
    fellowOverflowCandidates?: FellowProfileAddition[];
    mentorshipStacks?: number;
    conferenceEncounterUpdates?: Partial<ConferenceEncounterState>;
    conferenceCareerUpdates?: Partial<ConferenceCareerState>;
    internshipStateUpdates?: Partial<InternshipState>;
    loverStateUpdates?: Partial<LoverState>;
    loverProgressStateUpdates?: Partial<LoverProgressState>;
    loverIntimacyDelta?: number;
    loverProgressRolls?: number[];
    activateLoverProgress?: LoverTypeId;
    researchCapacityStateDeltas?: Partial<Record<keyof ResearchCapacityState, number>>;
    advisorProgressStateDeltas?: Partial<Pick<AdvisorProgressState, "researchAccumulation" | "funding">>;
    labFinanceCategory?: LabFinanceCategory;
    recordPlayerConferenceTrip?: string;
    scheduleConferenceAttendance?: ConferenceAttendancePlan;
    recordConferenceRegistrationPayment?: string[];
    recordJournalFeePayment?: string;
    advisorGrantResult?: AdvisorGrantApplication;
    labProjectProgress?: {
      type: "horizontal" | "vertical";
      amount: number;
      guidanceRolls?: number[];
    };
    restoreSanToCap?: boolean;
    roleTalentRest?: "year-summary";
    triggerInternshipInvite?: boolean;
    triggerJointTrainingInvite?: boolean;
    triggerLoverDevelopment?: LoverTypeId;
    /** Human-readable source used when a conference activity opens a follow-up event. */
    followUpContext?: string;
    counterDeltas?: Partial<EventCounters>;
    scholarshipAward?: {
      year: number;
      scoreBaseline: number;
      paperIds: string[];
    };
    fixedEventResolution?: FixedEventResolution;
    enqueueEvents?: PendingEvent[];
    paperUpdates?: PaperEffectUpdate[];
    paperCollaborations?: PaperCollaborationEffect[];
    paperCompetitionResolution?: PaperCompetitionResolution;
    /** Execute shared reading actions without consuming this month's action points. */
    readPaperActions?: number;
    /** Rolls drawn when the event previewed `readPaperActions`, replayed so the research resist matches the shown result. */
    readPaperRolls?: number[];
    /** Execute one normal rest action, including its SAN gain and action-point cost. */
    restAction?: boolean;
    readingCount?: number;
    paperReviewSettlement?: PaperReviewSettlement;
    addBuffs?: Buff[];
    removeBuffIds?: string[];
  };
}

export interface ResolvedEventStage {
  thesisReviewPresentation?: ThesisReviewPresentation;
  title: string;
  description: string;
  narrativeNames?: string[];
  paperReviewPresentation?: PaperReviewEventPresentation;
  journalAcceptancePresentation?: JournalAcceptancePresentation;
  talentTrigger?: import("./v2-talent-history").TalentTriggerRecord;
  choices: Pick<EventChoice, "id" | "label" | "outcome" | "disabledReason">[];
  selectedChoiceId: string;
  /** Scene source retained only while its chain is pending. */
  replayEvent?: PendingEvent;
}

export interface ResolvedEventRecord {
  id: string;
  chainId: string;
  source: EventSource;
  completedAtTotalMonths: number;
  completedAtYear: number;
  completedAtMonth: number;
  stages: ResolvedEventStage[];
  debugReplayable?: boolean;
  debugRootEventId?: string;
}

export interface PendingEvent {
  thesisReviewPresentation?: ThesisReviewPresentation;
  id: string;
  continuationSourceId?: string;
  title: string;
  description: string;
  narrativeNames?: string[];
  source: EventSource;
  blocking: boolean;
  deadlineMonths: number;
  chainId: string;
  stage: EventStage;
  paperReviewPresentation?: PaperReviewEventPresentation;
  journalAcceptancePresentation?: JournalAcceptancePresentation;
  choices: EventChoice[];
  completionLog?: string;
  history?: ResolvedEventStage[];
  deferredStatePatch?: DeferredEventStatePatch;
  /** Semantic intermediate choices, replayed purely at final confirmation instead of rebasing numeric rewards. */
  deferredChoices?: Array<{ choice: EventChoice; source: string; event: Pick<PendingEvent, "id" | "source" | "chainId" | "stage" | "randomReplay" | "fixedTreePreview" | "replayContext"> }>;
  fixedResultPreview?: {
    resolution: FixedEventResolution;
    rolls: number[];
  };
  ccigActivityPreview?: {
    year: number;
    month: number;
    participationMode: "advisor" | "self";
    attendanceSettlementItems: string[];
  };
  teachersDayPreview?: {
    giftId: TeachersDayGiftId;
  };
  internshipInvitePreview?: {
    context: import("./v2-internship-events").InternshipInviteContext;
    decision?: "accept" | "decline";
  };
  jointTrainingPreview?: {
    context: import("./v2-joint-training-events").JointTrainingContext;
    decision?: "accept" | "decline";
  };
  loverDevelopmentPreview?: {
    context: import("./v2-lover-events").LoverDevelopmentContext;
    decision?: "accept" | "decline";
  };
  conferenceActivityPreview?: {
    context: ConferenceActivityContext;
    attendanceSummary: string;
    rolls: number[];
    contacts?: Pick<ConferenceEncounterState, "bigBull" | "scholars">;
    selectedOptionId?: string;
  };
  fixedTreePreview?: {
    kind: "mentor-assign" | "phd-decision";
    year: number;
    month: number;
    totalMonths: number;
    rolls: number[];
  };
  conferencePreview?: {
    context: ConferenceEventContext;
    rolls: number[];
    mode?: "self" | "advisor" | "proxy";
  };
  journalFeePreview?: {
    paperId: string;
    stage: "act1" | "act2" | "act3";
    paymentMode?: "self" | "advisor";
  };
  randomReplay?: {
    eventId: number;
    serial: number;
    rolls: number[];
  };
  paperCompetitionTargetId?: string;
  paperCompetitionResult?: { description: string; choiceLabel: string; paperTitle: string };
  scholarshipContext?: {
    year: number;
    month: number;
    score: number;
    requirement: number | null;
    reward: number;
    scoreBaseline: number;
    eligiblePaperIds: string[];
    success: boolean;
  };
  /** Buffs that exist only while this event chain remains unresolved. */
  pendingBuffs?: Buff[];
  removeBuffIdsOnCompletion?: string[];
  /** Bookkeeping-only paper updates applied when a debug action discards this event. */
  discardPaperUpdates?: PaperEffectUpdate[];
  /** Debug-marked event chains can replay an earlier scene while pending. */
  debugReplayable?: boolean;
  debugRootEventId?: string;
  /** Root description for replaying this pending chain; never a full game snapshot. */
  replayContext?: { rootEvent: PendingEvent; debugEventId?: string };
}

export interface EventQueueItem extends PendingEvent {
  queueOrder: number;
}

export interface ConferenceAttendancePlan {
  context: ConferenceEventContext;
  mode: "self" | "advisor" | "proxy";
  rolls: number[];
}

export type LabFinanceCategory = "conference-registration" | "conference-travel" | "journal-fee"
  | "labor" | "student-wages" | "student-experiment" | "player-experiment"
  | "student-reimbursement" | "horizontal-income" | "grant-income" | "initial-funding" | "other";

export interface GameState extends RandomEventState {
  captainState?: import("./v2-captain-state").CaptainRunState;
  curseState?: import("./v2-curse-system").CurseRunState;
  /** Unsubmitted statistics belong to the saved branch and are discarded on rewind. */
  pendingRunStatistics?: import("./v2-run-statistics").PendingRunStatistic[];
  randomState?: import("./v2-game-random").GameRandomState;
  achievementProgress?: import("./v2-achievement-runtime-types").AchievementRunProgress;
  roleTalents?: import("./v2-role-talent-state").RoleTalentRunState;
  labFinanceLedger?: { totalMonths: number; amounts: Partial<Record<LabFinanceCategory, number>> };
  blockLinearEvents: boolean;
  debugEventReplayEnabled?: boolean;
  debugSkippedJournalFeePaperIds?: string[];
  phase: GamePhase;
  selectedRoleId: RoleId;
  setupSelectedRoleId?: RoleId | null;
  /** Name confirmed during the opening scene and used in publication author lists. */
  playerName: string | null;
  selectedAdvisorName: string | null;
  degree: Degree;
  phdStartYear: number | null;
  year: number;
  month: number;
  totalMonths: number;
  maxMonths: number;
  sanCap: number;
  sanHistory?: SanHistoryEntry[];
  paperSlotsUnlocked: number;
  graduationScoreTarget: number | null;
  totalResearchScore: number;
  totalCitations: number;
  /** Citations received in each calendar year. */
  citationHistoryByYear: Record<number, number>;
  papers: Paper[];
  externalPublications: Paper[];
  thesis: ThesisState;
  careerProgress: Record<CareerType, number>;
  careerInterviewExperience: Record<CareerType, number>;
  careerPreparedMonths: Partial<Record<CareerType, number>>;
  careerLastRecruitmentTotalMonths: number | null;
  careerOffers: Partial<Record<CareerType, CareerOffer>>;
  personalSpending: number;
  internshipCount: number;
  selectedPaperId: string | null;
  shopState: ShopState;
  aiShopState: AiShopState;
  coffeeState: CoffeeState;
  readingState: ReadingState;
  partTimeWorkCount: number;
  actionState: MonthlyActionState;
  relationshipState: RelationshipState;
  conferenceEncounterState: ConferenceEncounterState;
  conferenceAttendancePlans?: ConferenceAttendancePlan[];
  /** Seed chosen once at run start; keeps all conference locations stable within this run. */
  conferenceLocationSeed?: number | null;
  conferenceCareerState: ConferenceCareerState;
  internshipState: InternshipState;
  loverState: LoverState;
  loverProgressState: LoverProgressState;
  fellowProgressState: FellowProgressProfile[];
  fellowFinanceAccounts?: Record<string, FellowFinanceAccount>;
  fellowPapers?: Paper[];
  fellowResearchLastTotalMonths?: number;
  researchCapacityState: ResearchCapacityState;
  advisorProgressState: AdvisorProgressState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
  scholarshipState: ScholarshipState;
  publicationTalentState?: PublicationTalentState;
  buffs: Buff[];
  player: PlayerStats;
  log: GameLogEntry[];
  ending: EndingId;
  endingCause?: { text: string; totalMonths: number };
  eventQueue: EventQueueItem[];
  eventHistory: ResolvedEventRecord[];
  /** Achievements completed during the current run, supplied by the store at ending time. */
  runAchievementIds?: string[];
}

export interface DeferredEventStateChange {
  path: string[];
  previousValue: unknown;
  value: unknown;
}

export type DeferredEventStatePatch = DeferredEventStateChange[];

export interface DispatchPayload {
  captainTagLevels?: Partial<Record<RoleId, number>>;
  curseDifficulty?: import("./v2-curse-system").CurseDifficulty;
  debtRepayment?: number;
  bonusTalentPoints?: number;
  talentAllocation?: Record<string, number> | undefined;
  blockLinearEvents?: boolean | undefined;
  roleId?: RoleId | undefined;
  paperId?: string | undefined;
  paperSlotIndex?: number | undefined;
  thesisPointIndex?: number | undefined;
  careerType?: CareerType | undefined;
  paperActionType?: PaperActionType | undefined;
  paperTarget?: PaperTarget | undefined;
  journalTarget?: JournalTarget | undefined;
  promotionId?: PaperPromotionId | undefined;
  eventId?: string | undefined;
  eventChoiceId?: string | undefined;
  eventHistoryIndex?: number | undefined;
  relationshipId?: string | undefined;
  projectType?: "horizontal" | "vertical" | undefined;
  debugStatId?: DebugStatId | undefined;
  debugPaperTarget?: PaperTarget | undefined;
  debugJournalTarget?: JournalTarget | undefined;
  debugPaperAuthorship?: "first" | "coauthor" | undefined;
  debugRelationshipType?: DebugRelationshipType | undefined;
  debugEventReplayEnabled?: boolean | undefined;
  delta?: number | undefined;
  dateDisplayMode?: DateDisplayMode | undefined;
  shopItemId?: ShopItemId | undefined;
  shopUpgradeId?: ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null> | undefined;
  aiSlotId?: AiSlotId | undefined;
  supportItemId?: SupportItemId | undefined;
}
