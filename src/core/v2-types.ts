import type { CareerType } from "./v2-career-rules";
import type { DebugStatId } from "./v2-action-ids";
import type { RandomEventState } from "./v2-random-event-rules";
import type { ThesisState } from "./v2-thesis-rules";
import type { EventCounters } from "./v2-event-state";
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
import type {
  AdvisorProgressState,
  ConferenceCareerState,
  ConferenceEncounterState,
  EventSupportState,
  FellowProfileAddition,
  FellowProgressProfile,
  InternshipState,
  LoverProgressState,
  LoverState,
  RelationshipState,
  ResearchCapacityState,
} from "./v2-types-relationship";

export * from "./v2-event-state";
export * from "./v2-types-economy";
export * from "./v2-types-fixed-events";
export * from "./v2-types-relationship";
export type { DebugStatId, GameActionId } from "./v2-action-ids";

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
  | "chosen-reversed";
export type RoleGrowthStatId = DebugStatId;
export type GamePhase = "setup" | "playing" | "finished";
export type Degree = "master" | "phd";
export type DateDisplayMode = "academic" | "calendar";
export type EndingId = "master" | "phd" | "delay" | "burnout" | "poor" | "expelled" | "isolated" | null;
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

export type PaperActionType = "idea" | "experiment" | "writing";
export type ActiveOperationType =
  | "read"
  | "work"
  | PaperActionType
  | "relationship-task"
  | "relationship-chat";

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
  promotions?: PaperPromotionState;
}

export interface PaperReviewerReport {
  reviewer: string;
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
  baseSanReward: number;
  baseFavorReward: number;
  rewardReductionCount: number;
  sanReward: number;
  favorReward: number;
  reviewerSanChange: number;
  reports: PaperReviewerReport[];
}

export type PaperReviewEventPresentation =
  | {
      kind: "overview";
      paperTitle: string;
      target: PaperTarget;
      conferenceName: string;
      conferenceYear: number;
      venueInfluence: number;
      reviewStrictnessMultiplier: number;
      submittedScore: number;
    }
  | {
      kind: "reviewers";
      paperTitle: string;
      reports: PaperReviewerReport[];
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
      rewardReductionCount: number;
      rewardText: string;
    };

export interface PaperPromotionState {
  arxiv: boolean;
  github: boolean;
  xiaohongshu: boolean;
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
  bonus: string;
  awakenIcon: string;
  awakenName: string;
  awakenDesc: string;
  hiddenAwakenName?: string;
  hiddenAwakenIcon?: string;
  hiddenAwakenDesc?: string;
  initialPaperSlots?: number;
}

export type BuffTiming = "permanent" | "monthly" | "next-action";

export interface ReadingEffect {
  sanDelta?: number;
  manualExtraReads?: number;
  automaticReads?: number;
}

export interface Buff {
  id: string;
  name: string;
  source: string;
  timing: BuffTiming;
  remainingMonths: number | null;
  monthlyStats?: Partial<PlayerStats>;
  /** Multiplies SAN costs for player-initiated work while this Buff is active. */
  activeOperationSanMultiplier?: number;
  /** Fixed SAN adjustment for relationship operations. */
  relationshipOperationSanDelta?: number;
  /** Structured effects for the three paper actions. */
  actionEffects?: TemporaryActionEffectUpdates;
  /** Automatic score polishing applied to editable drafts and journal revisions. */
  paperPolishEffects?: Partial<Record<PaperActionType, number>>;
  /** Reading modifiers used by AI models and future reading equipment. */
  readingEffect?: ReadingEffect;
  /** Publication multipliers consumed by publication and citation settlement. */
  publicationEffects?: {
    nextPromotionMultiplier?: number;
    citationDebuffMultiplier?: number;
  };
  /** Background publication schedule owned by the relationship progression UI. */
  scheduledPublication?: {
    intervalMonths: number;
    nonFirstAuthor: boolean;
    targetWeights: { A: number; B: number; C: number };
    elapsedMonths?: number;
  };
  description?: string;
}

export interface RolePassiveDefinition {
  id: string;
  name: string;
  description: string;
}

export interface RoleLobbyDefinition {
  summary: string;
  growthStatIds: RoleGrowthStatId[];
  passiveDefinitions: RolePassiveDefinition[];
}

export interface RoleUnlockState {
  owned: boolean;
}

export interface RoleMetaProgress {
  level: number;
  exp: number;
  completedRuns: number;
  unlockedAchievementIds: string[];
  passiveLevels: Record<string, number>;
  historyBest: RoleHistoryBest;
  unlocked: boolean;
}

export interface RoleHistoryBest {
  researchScore: number;
  totalCitations: number;
  natureCount: number;
  representativeCitations: number;
  representativeScore: number;
}

export interface ScholarshipState {
  lastAwardYear: number | null;
  scoreBaseline: number;
  claimedPaperIds: string[];
}

export interface PublicationTalentState {
  claimedIds: string[];
}

export interface AccountProfile {
  dateDisplayMode: DateDisplayMode;
  selectedLobbyRoleId: RoleId;
  lobbyRolePage: number;
  lobbyRoleAchievementPage: number;
  roleProgress: Record<RoleId, RoleMetaProgress>;
}

export interface LobbySelectedRoleStatViewModel {
  id: RoleGrowthStatId;
  label: string;
  total: number;
}

export interface LobbySelectedRoleHistoryStatViewModel {
  id: "research-score" | "total-citations" | "nature-count" | "representative" | "completed-runs";
  label: string;
  value: string;
}

export interface LobbySelectedRolePassiveViewModel {
  definition: RolePassiveDefinition;
  level: number;
}

export interface RoleAchievementDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
  rewardText?: string;
  unlocksRoleId?: RoleId;
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
  passives: LobbySelectedRolePassiveViewModel[];
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
  /** Workstation slot identity; omitted on legacy papers and assigned by fallback order. */
  paperSlotIndex?: number;
  title: string;
  topicId: string;
  topicLabel: string;
  heatMultiplier: number;
  prepublicationDecayRate: number;
  idea: number;
  experiment: number;
  writing: number;
  status: PaperStatus;
  target: PaperTarget | null;
  journalTarget?: JournalTarget | null;
  reviewMonthsLeft: number;
  submittedIdea: number | null;
  submittedExperiment: number | null;
  submittedWriting: number | null;
  submittedMonth?: number | null;
  submittedYear?: number | null;
  conferenceHandled?: boolean;
  /** Earliest month in which the post-acceptance conference event may appear. */
  conferenceAvailableAtTotalMonths?: number;
  publication?: PaperPublicationState | null;
  /** Paper-bound citation debuff captured before submission. */
  citationDebuffMultiplierOnPublish?: number;
  lastReview?: PaperReviewResult | null;
  nonFirstAuthor?: boolean;
  /** Optional relationship author used for non-first-author publications. */
  leadAuthorName?: string;
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

export interface EventChoice {
  id: string;
  label: string;
  outcome: string;
  disabledReason?: string;
  effects: {
    san?: number;
    research?: number;
    social?: number;
    favor?: number;
    money?: number;
    illnessProbabilityMultiplier?: number;
    illnessProbabilityDelta?: number;
    score?: number;
    transferToPhd?: boolean;
    stayOnEvent?: boolean;
    sanCapDelta?: number;
    thesisProgress?: number;
    abandonThesis?: boolean;
    careerType?: CareerType;
    careerProgress?: number;
    abandonCareer?: boolean;
    ideaBonus?: number;
    experimentBonus?: number;
    writingBonus?: number;
    temporaryActionEffectUpdates?: TemporaryActionEffectUpdates;
    nextPublicationPromotionMultiplier?: number;
    citationDebuffMultiplier?: number;
    draftCitationDebuffMultiplier?: number;
    clearDraftProgress?: boolean;
    grantedPublication?: GrantedPublicationEffect;
    eventSupportUpdates?: Partial<EventSupportState>;
    shopEntitlementDeltas?: Partial<ShopEntitlementState>;
    persistentExtraActionDeltas?: Partial<PersistentExtraActions>;
    relationshipAdditions?: RelationshipKind[];
    fellowAdditions?: FellowProfileAddition[];
    mentorshipStacks?: number;
    conferenceEncounterUpdates?: Partial<ConferenceEncounterState>;
    conferenceCareerUpdates?: Partial<ConferenceCareerState>;
    internshipStateUpdates?: Partial<InternshipState>;
    loverStateUpdates?: Partial<LoverState>;
    loverProgressStateUpdates?: Partial<LoverProgressState>;
    activateLoverProgress?: LoverTypeId;
    researchCapacityStateDeltas?: Partial<Record<keyof ResearchCapacityState, number>>;
    advisorProgressStateDeltas?: Partial<Record<keyof AdvisorProgressState, number>>;
    restoreSanToCap?: boolean;
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
    /** Execute shared reading actions without consuming this month's action points. */
    readPaperActions?: number;
    /** Execute one normal rest action, including its SAN gain and action-point cost. */
    restAction?: boolean;
    readingCount?: number;
    paperReviewSettlement?: PaperReviewSettlement;
    addBuffs?: Buff[];
    removeBuffIds?: string[];
  };
}

export interface ResolvedEventStage {
  title: string;
  description: string;
  paperReviewPresentation?: PaperReviewEventPresentation;
  choices: Pick<EventChoice, "id" | "label" | "outcome" | "disabledReason">[];
  selectedChoiceId: string;
}

export interface ResolvedEventRecord {
  id: string;
  chainId: string;
  source: EventSource;
  completedAtTotalMonths: number;
  completedAtYear: number;
  completedAtMonth: number;
  stages: ResolvedEventStage[];
}

export interface PendingEvent {
  id: string;
  title: string;
  description: string;
  source: EventSource;
  blocking: boolean;
  deadlineMonths: number;
  chainId: string;
  stage: EventStage;
  paperReviewPresentation?: PaperReviewEventPresentation;
  choices: EventChoice[];
  completionLog?: string;
  history?: ResolvedEventStage[];
  deferredStatePatch?: DeferredEventStatePatch;
  randomReplay?: {
    eventId: number;
    serial: number;
    rolls: number[];
  };
  /** Buffs that exist only while this event chain remains unresolved. */
  pendingBuffs?: Buff[];
  removeBuffIdsOnCompletion?: string[];
  /** Bookkeeping-only paper updates applied when a debug action discards this event. */
  discardPaperUpdates?: PaperEffectUpdate[];
}

export interface EventQueueItem extends PendingEvent {
  queueOrder: number;
}

export interface GameState extends RandomEventState {
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
  /** Seed chosen once at run start; keeps all conference locations stable within this run. */
  conferenceLocationSeed?: number | null;
  conferenceCareerState: ConferenceCareerState;
  internshipState: InternshipState;
  loverState: LoverState;
  loverProgressState: LoverProgressState;
  fellowProgressState: FellowProgressProfile[];
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
  eventQueue: EventQueueItem[];
  eventHistory: ResolvedEventRecord[];
}

export interface DeferredEventStateChange {
  path: string[];
  previousValue: unknown;
  value: unknown;
}

export type DeferredEventStatePatch = DeferredEventStateChange[];

export interface DispatchPayload {
  roleId?: RoleId | undefined;
  paperId?: string | undefined;
  paperSlotIndex?: number | undefined;
  paperActionType?: PaperActionType | undefined;
  paperTarget?: PaperTarget | undefined;
  journalTarget?: JournalTarget | undefined;
  promotionId?: PaperPromotionId | undefined;
  eventId?: string | undefined;
  eventChoiceId?: string | undefined;
  debugStatId?: DebugStatId | undefined;
  debugPaperTarget?: PaperTarget | undefined;
  debugJournalTarget?: JournalTarget | undefined;
  debugPaperAuthorship?: "first" | "coauthor" | undefined;
  delta?: number | undefined;
  dateDisplayMode?: DateDisplayMode | undefined;
  shopItemId?: ShopItemId | undefined;
  shopUpgradeId?: ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null> | undefined;
  aiSlotId?: AiSlotId | undefined;
  supportItemId?: SupportItemId | undefined;
}
/** Legacy field retained for old test fixtures and state migration. */
export type BikeUpgradeId = "road" | "ebike" | null;
