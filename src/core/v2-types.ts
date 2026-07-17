import type { BestCareerOffer, CareerType } from "./v2-career-rules";
import type { RandomEventState } from "./v2-random-event-rules";
import type { ThesisState } from "./v2-thesis-rules";
import type { AchievementFlagId, AchievementFlags, EventCounters } from "./v2-types-achievement";
import type { CoffeeState, ReadingState, ShopState } from "./v2-types-economy";
import type { FixedEventResolution } from "./v2-types-fixed-events";
import type {
  AdvisorProgressState,
  ConferenceCareerState,
  ConferenceEncounterState,
  EventSupportState,
  FellowProgressProfile,
  InternshipState,
  JointTrainingState,
  LoverProgressState,
  LoverState,
  RelationshipState,
  ResearchCapacityState,
} from "./v2-types-relationship";

export * from "./v2-types-achievement";
export * from "./v2-types-economy";
export * from "./v2-types-fixed-events";
export * from "./v2-types-relationship";

export type RoleBaseId = "normal" | "genius" | "social" | "rich" | "teacher-child" | "chosen" | "rewinder" | "research-captain";
export type RoleMode = "upright" | "reversed";
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
export type AdvisorId = "chen-ming" | "zhou-lan" | "lin-hao" | "zhao-ning";
export type ManualSlotId = 1 | 2 | 3;
export type DebugStatId = "san" | "research" | "social" | "favor" | "money";
export type RoleGrowthStatId = DebugStatId;
export type GamePhase = "setup" | "playing" | "finished";
export type Degree = "master" | "phd";
export type EndingId = "master" | "phd" | "delay" | "burnout" | "poor" | "expelled" | "isolated" | null;
export type PaperTarget = "C" | "B" | "A";
export type PaperStatus = "draft" | "reviewing" | "published";
export type SupportItemId = "badminton_racket" | "game_controller" | "parasol";
export type BikeUpgradeId = "road" | "ebike" | null;
export type ChairUpgradeId = "advanced" | "massage" | "torture" | "spike" | "hammock" | null;
export type MonitorUpgradeId = "4k" | "smart" | "dual" | null;
export type ShopItemId = "gpu_buy" | "chair" | "keyboard" | "monitor" | "bike" | "down_jacket";
export type ShopUpgradeId =
  | "bike-road"
  | "bike-ebike"
  | "monitor-4k"
  | "monitor-smart"
  | "monitor-dual"
  | "chair-advanced"
  | "chair-massage"
  | "chair-torture"
  | "chair-spike"
  | "chair-hammock";
export type CoffeeMachineUpgradeId = "automatic" | "advanced" | "unlimited" | null;
export type EventSource = "fixed" | "random" | "system" | "review" | "thesis" | "career";
export type EventStage = "act1" | "act2" | "act3" | "result";
export type GameActionId =
  | "start-game"
  | "reset-game"
  | "select-role"
  | "change-lobby-role-page"
  | "change-role-achievement-page"
  | "select-advisor"
  | "create-paper"
  | "select-paper"
  | "read"
  | "idea"
  | "experiment"
  | "write"
  | "work"
  | "rest"
  | "submit-c"
  | "submit-b"
  | "submit-a"
  | "resolve-event"
  | "resolve-phd-yes"
  | "resolve-phd-no"
  | "save-manual"
  | "load-manual"
  | "delete-manual"
  | "buy-coffee"
  | "buy-coffee-machine"
  | "upgrade-coffee-machine"
  | "sell-coffee-machine"
  | "buy-shop-item"
  | "upgrade-shop-item"
  | "sell-shop-item"
  | "buy-support-item"
  | "sell-support-item"
  | "advance-advisor-task"
  | "interact-advisor"
  | "advance-lover-task"
  | "interact-lover"
  | "advance-fellow-task"
  | "interact-fellow"
  | "debug-adjust-stat"
  | "debug-shift-month"
  | "debug-trigger-event"
  | "debug-seed-paper"
  | "next-month";

export interface PlayerStats {
  san: number;
  research: number;
  social: number;
  favor: number;
  money: number;
}

export type PaperActionType = "idea" | "experiment" | "writing";

export interface ActionBonuses {
  idea: number;
  experiment: number;
  writing: number;
}

export type PersistentExtraActions = Record<PaperActionType, number>;

export interface TemporaryActionEffect {
  bonus: number;
  multiplier: number;
  extraActions: number;
}

export type TemporaryActionEffects = Record<PaperActionType, TemporaryActionEffect>;
export type TemporaryActionEffectUpdates = Partial<Record<PaperActionType, Partial<TemporaryActionEffect>>>;

export interface PaperPublicationState {
  citations: number;
  monthsSincePublication: number;
  pendingCitationFraction: number;
  effectiveScore: number;
  citationMultiplier: number;
}

export interface PublicationEffectsState {
  nextCitationMultipliers: number[];
  citationPenaltyMultiplier: number;
}

export type RelationshipKind = "advisor" | "senior" | "junior" | "peer" | "lover";
export type FellowTypeId = "senior" | "peer" | "junior";
export type FellowTaskType = "idea" | "experiment" | "writing";
export type LoverTypeId = "beautiful" | "smart";

export interface RoleDefinition {
  id: RoleId;
  baseId: RoleBaseId;
  mode: RoleMode;
  name: string;
  shortName: string;
  icon: string;
  tagline: string;
  description: string;
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

export interface RolePassiveDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  unlockLevel: number;
}

export interface RoleLobbyDefinition {
  roleId: RoleId;
  archetype: string;
  summary: string;
  portraitLabel: string;
  unlockConditionText: string;
  growthStatIds: RoleGrowthStatId[];
  passiveDefinitions: RolePassiveDefinition[];
}

export interface RoleUnlockState {
  owned: boolean;
  statusLabel: string;
  unlockConditionText: string;
}

export interface RoleMetaProgress {
  level: number;
  exp: number;
  expToNext: number;
  completedRuns: number;
  achievementCount: number;
  unlockedAchievementIds: string[];
  achievementSnapshots: Record<string, RoleAchievementProgressSnapshot>;
  availableStatPoints: number;
  allocatedStats: PlayerStats;
  passiveLevels: Record<string, number>;
  historyBest: RoleHistoryBest;
  unlocked: boolean;
  unlockConditionText: string;
}

export interface RoleHistoryBest {
  researchScore: number;
  totalCitations: number;
  natureCount: number;
  representativeCitations: number;
  representativeScore: number;
}

export interface AchievementMetaState {
  flags: AchievementFlags;
  unlockedCount: number;
  totalCount: number;
}

export interface AccountProfile {
  ownedRoleIds: RoleId[];
  selectedLobbyRoleId: RoleId;
  lobbyRolePage: number;
  lobbyRoleAchievementPage: number;
  metaCurrency: number;
  achievementProgress: {
    flags: AchievementFlags;
  };
  roleProgress: Record<RoleId, RoleMetaProgress>;
}

export interface LobbySelectedRoleStatViewModel {
  id: RoleGrowthStatId;
  label: string;
  base: number;
  bonus: number;
  total: number;
}

export interface LobbySelectedRoleHistoryStatViewModel {
  id: "research-score" | "total-citations" | "nature-count" | "representative-citations" | "representative-score";
  label: string;
  value: number;
}

export interface LobbySelectedRolePassiveViewModel {
  definition: RolePassiveDefinition;
  level: number;
  unlocked: boolean;
}

export type RoleAchievementMilestone = "graduate" | "phd" | "phd-with-global-achievements";
export type RoleAchievementMetricId =
  | RoleGrowthStatId
  | "completed-runs"
  | "chair-owned"
  | "chair-advanced";

export interface RoleAchievementDefinition {
  id: string;
  title: string;
  description: string;
  rewardText?: string;
  milestone?: RoleAchievementMilestone;
}

export interface RoleAchievementProgressSnapshot {
  values: Partial<Record<RoleAchievementMetricId, number>>;
}

export interface LobbySelectedRoleAchievementViewModel {
  definition: RoleAchievementDefinition;
  unlocked: boolean;
  progressLines: string[];
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
  achievementProgress: AchievementMetaState;
}

export interface AdvisorRequirements {
  phdYear2: number;
  phdYear3: number;
  masterGrad: number;
  phdGrad: number;
}

export interface AdvisorDefinition {
  id: AdvisorId;
  name: string;
  color: string;
}

export interface Paper {
  id: string;
  title: string;
  idea: number;
  experiment: number;
  writing: number;
  status: PaperStatus;
  target: PaperTarget | null;
  reviewMonthsLeft: number;
  submittedIdea: number | null;
  submittedExperiment: number | null;
  submittedWriting: number | null;
  submittedMonth?: number | null;
  submittedYear?: number | null;
  conferenceHandled?: boolean;
  publication?: PaperPublicationState | null;
  receivedRelationshipBonus?: boolean;
}

export interface GameLogEntry {
  id: string;
  month: number;
  text: string;
}

export interface GrantedPublicationEffect {
  title?: string;
  target: PaperTarget;
  acceptedScore: number;
  citationMultiplier?: number;
}

export interface PaperEffectUpdate {
  id: string;
  idea?: number;
  experiment?: number;
  writing?: number;
  conferenceHandled?: boolean;
  receivedRelationshipBonus?: boolean;
}

export interface EventChoice {
  id: string;
  label: string;
  outcome: string;
  effects: {
    san?: number;
    research?: number;
    social?: number;
    favor?: number;
    money?: number;
    score?: number;
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
    nextPublicationCitationMultiplier?: number;
    publicationPenaltyMultiplier?: number;
    clearDraftProgress?: boolean;
    grantedPublication?: GrantedPublicationEffect;
    eventSupportUpdates?: Partial<EventSupportState>;
    persistentExtraActionDeltas?: Partial<PersistentExtraActions>;
    setBadmintonYearToCurrent?: boolean;
    relationshipAdditions?: RelationshipKind[];
    mentorshipStacks?: number;
    conferenceEncounterUpdates?: Partial<ConferenceEncounterState>;
    conferenceCareerUpdates?: Partial<ConferenceCareerState>;
    internshipStateUpdates?: Partial<InternshipState>;
    loverStateUpdates?: Partial<LoverState>;
    loverProgressStateUpdates?: Partial<LoverProgressState>;
    activateLoverProgress?: LoverTypeId;
    researchCapacityStateDeltas?: Partial<Record<keyof ResearchCapacityState, number>>;
    advisorProgressStateDeltas?: Partial<Record<keyof AdvisorProgressState, number>>;
    jointTrainingStateUpdates?: Partial<JointTrainingState>;
    restoreSanToCap?: boolean;
    triggerInternshipInvite?: boolean;
    triggerJointTrainingInvite?: boolean;
    triggerLoverDevelopment?: LoverTypeId;
    counterDeltas?: Partial<EventCounters>;
    achievementFlags?: AchievementFlagId[];
    fixedEventResolution?: FixedEventResolution;
    enqueueEvents?: PendingEvent[];
    paperUpdates?: PaperEffectUpdate[];
  };
}

export interface PendingEvent {
  id: string;
  title: string;
  description: string;
  preview: string;
  source: EventSource;
  blocking: boolean;
  deadlineMonths: number;
  chainId: string;
  stage: EventStage;
  choices: EventChoice[];
}

export interface EventQueueItem extends PendingEvent {
  queueOrder: number;
}

export interface PendingDecision {
  kind: "phd-transfer";
  requiredScore: number;
  year: number;
}

export interface ManualSaveSummary {
  slot: ManualSlotId;
  savedAt: string;
  degree: Degree;
  year: number;
  month: number;
  totalMonths: number;
  totalResearchScore: number;
  selectedRoleId: RoleId;
  selectedAdvisorId: AdvisorId | null;
  ending: EndingId;
}

export interface GameState extends RandomEventState {
  phase: GamePhase;
  selectedRoleId: RoleId;
  setupSelectedRoleId?: RoleId | null;
  selectedAdvisorId: AdvisorId | null;
  degree: Degree;
  year: number;
  month: number;
  totalMonths: number;
  maxMonths: number;
  actionsRemaining: number;
  maxActionsPerMonth: number;
  sanCap: number;
  paperSlotsUnlocked: number;
  graduationScoreTarget: number | null;
  totalResearchScore: number;
  totalCitations: number;
  papers: Paper[];
  externalPublications: Paper[];
  slotPublishedA: boolean[];
  upgradedSlots: boolean[];
  thesis: ThesisState;
  careerProgress: Record<CareerType, number>;
  careerAbandoned: Record<CareerType, boolean>;
  bestCareerOffer: BestCareerOffer | null;
  internshipCount: number;
  willTransferPhDYear3: boolean;
  isNatureExtensionYear: boolean;
  selectedPaperId: string | null;
  shopState: ShopState;
  coffeeState: CoffeeState;
  readingState: ReadingState;
  actionBonuses: ActionBonuses;
  persistentExtraActions: PersistentExtraActions;
  temporaryActionEffects: TemporaryActionEffects;
  publicationEffects: PublicationEffectsState;
  relationshipState: RelationshipState;
  conferenceEncounterState: ConferenceEncounterState;
  conferenceCareerState: ConferenceCareerState;
  internshipState: InternshipState;
  loverState: LoverState;
  loverProgressState: LoverProgressState;
  fellowProgressState: FellowProgressProfile[];
  researchCapacityState: ResearchCapacityState;
  advisorProgressState: AdvisorProgressState;
  jointTrainingState: JointTrainingState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
  achievementFlags: AchievementFlags;
  player: PlayerStats;
  log: GameLogEntry[];
  ending: EndingId;
  eventQueue: EventQueueItem[];
  pendingDecision: PendingDecision | null;
  manualSaveSummaries: ManualSaveSummary[];
}

export interface DispatchPayload {
  roleId?: RoleId | undefined;
  advisorId?: AdvisorId | undefined;
  paperId?: string | undefined;
  paperTarget?: PaperTarget | undefined;
  eventId?: string | undefined;
  eventChoiceId?: string | undefined;
  manualSlot?: ManualSlotId | undefined;
  relationshipId?: string | undefined;
  shopItemId?: ShopItemId | undefined;
  shopUpgradeId?: ShopUpgradeId | undefined;
  supportItemId?: SupportItemId | undefined;
  debugStatId?: DebugStatId | undefined;
  delta?: number | undefined;
}
