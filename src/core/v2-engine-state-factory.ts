import { createAchievementFlags } from "./v2-achievements";
import { MAX_ACTIONS_PER_MONTH, MAX_SAN } from "./v2-content";
import { createAdvisorProgressState } from "./v2-advisor-progress";
import { createConferenceCareerState } from "./v2-conference-career";
import { createConferenceEncounterState } from "./v2-conference-encounters";
import { clonePlayer, createLogEntry } from "./v2-engine-helpers";
import { createEventCounters } from "./v2-event-counters";
import { createCoffeeState } from "./v2-coffee-system";
import { createReadingState } from "./v2-reading-system";
import { createShopState } from "./v2-shop-items";
import { createInitialRandomEventState } from "./v2-random-event-rules";
import { getUnlockedPaperSlotCount } from "./v2-paper-rules";
import {
  getGraduationScoreTarget,
  getAdvisorDefinition,
  getCalendarForTotalMonths,
  getMonthLimitByDegree,
  getRoleDefinition,
} from "./v2-progression";
import { createInitialThesisState } from "./v2-thesis-rules";
import { createRelationshipState, syncRelationshipState, tryAddRelationship } from "./v2-relationship-rules";
import { createPublicationEffectsState } from "./v2-publication-rules";
import { createTemporaryActionEffects } from "./v2-temporary-action-rules";
import { createInternshipState } from "./v2-internship-system";
import { createLoverState } from "./v2-lover-system";
import { createLoverProgressState } from "./v2-lover-progression";
import { createJointTrainingState } from "./v2-joint-training-system";
import { createResearchCapacityState } from "./v2-research-cap-system";
import type { AdvisorId, GameState, RoleId } from "./v2-types";

export function createInitialState(): GameState {
  const calendar = getCalendarForTotalMonths(0);
  return {
    phase: "setup",
    selectedRoleId: "normal",
    setupSelectedRoleId: null,
    selectedAdvisorId: null,
    degree: "master",
    year: calendar.year,
    month: calendar.month,
    totalMonths: 0,
    maxMonths: getMonthLimitByDegree("master"),
    actionsRemaining: MAX_ACTIONS_PER_MONTH,
    maxActionsPerMonth: MAX_ACTIONS_PER_MONTH,
    sanCap: MAX_SAN,
    paperSlotsUnlocked: getUnlockedPaperSlotCount(0),
    graduationScoreTarget: null,
    totalResearchScore: 0,
    totalCitations: 0,
    papers: [],
    externalPublications: [],
    ...createInitialRandomEventState(),
    slotPublishedA: [false, false, false, false],
    upgradedSlots: [false, false, false, false],
    thesis: createInitialThesisState(),
    careerProgress: { internet: 0, stateOwned: 0, civilService: 0, academic: 0 },
    careerAbandoned: { internet: false, stateOwned: false, civilService: false, academic: false },
    bestCareerOffer: null,
    internshipCount: 0,
    willTransferPhDYear3: false,
    isNatureExtensionYear: false,
    selectedPaperId: null,
    shopState: createShopState(),
    coffeeState: createCoffeeState(),
    readingState: createReadingState(),
    actionBonuses: { idea: 0, experiment: 0, writing: 0 },
    persistentExtraActions: { idea: 0, experiment: 0, writing: 0 },
    temporaryActionEffects: createTemporaryActionEffects(),
    publicationEffects: createPublicationEffectsState(),
    relationshipState: createRelationshipState(),
    fellowProgressState: [],
    conferenceEncounterState: createConferenceEncounterState(),
    conferenceCareerState: createConferenceCareerState(),
    internshipState: createInternshipState(),
    loverState: createLoverState(),
    loverProgressState: createLoverProgressState(),
    researchCapacityState: createResearchCapacityState(),
    advisorProgressState: createAdvisorProgressState(),
    jointTrainingState: createJointTrainingState(),
    eventSupport: { hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, hasFinanceTalent: false },
    eventCounters: createEventCounters(),
    achievementFlags: createAchievementFlags(),
    player: { san: 20, research: 0, social: 0, favor: 0, money: 0 },
    log: [createLogEntry(0, "等待选择角色。")],
    ending: null,
    eventQueue: [],
    pendingDecision: null,
    manualSaveSummaries: [],
  };
}

export function createStartedGameState(roleId: RoleId, advisorId: AdvisorId | null = null): GameState {
  const role = getRoleDefinition(roleId);
  const advisor = advisorId ? getAdvisorDefinition(advisorId) : null;
  const initialPaperSlots = role.initialPaperSlots ?? getUnlockedPaperSlotCount(role.startingStats.research);
  const baseState = createInitialState();
  const baseRelationshipState = syncRelationshipState(createRelationshipState(), role.startingStats.social);
  const relationshipState = advisor
    ? tryAddRelationship(baseRelationshipState, "advisor").nextState
    : baseRelationshipState;

  return {
    ...baseState,
    phase: "playing",
    selectedRoleId: role.id,
    setupSelectedRoleId: role.id,
    selectedAdvisorId: advisor?.id ?? null,
    degree: "master",
    year: 1,
    month: 0,
    totalMonths: 0,
    maxMonths: getMonthLimitByDegree("master"),
    actionsRemaining: MAX_ACTIONS_PER_MONTH,
    maxActionsPerMonth: MAX_ACTIONS_PER_MONTH,
    sanCap: MAX_SAN,
    paperSlotsUnlocked: initialPaperSlots,
    graduationScoreTarget: getGraduationScoreTarget("master", advisor?.id ?? null),
    slotPublishedA: [false, false, false, false],
    upgradedSlots: [false, false, false, false],
    thesis: createInitialThesisState(),
    careerProgress: { internet: 0, stateOwned: 0, civilService: 0, academic: 0 },
    careerAbandoned: { internet: false, stateOwned: false, civilService: false, academic: false },
    bestCareerOffer: null,
    internshipCount: 0,
    willTransferPhDYear3: false,
    isNatureExtensionYear: false,
    shopState: createShopState(),
    coffeeState: createCoffeeState(),
    readingState: createReadingState(),
    actionBonuses: { idea: 0, experiment: 0, writing: 0 },
    persistentExtraActions: { idea: 0, experiment: 0, writing: 0 },
    temporaryActionEffects: createTemporaryActionEffects(),
    conferenceEncounterState: createConferenceEncounterState(),
    conferenceCareerState: createConferenceCareerState(),
    internshipState: createInternshipState(),
    loverState: createLoverState(),
    loverProgressState: createLoverProgressState(),
    relationshipState,
    fellowProgressState: [],
    researchCapacityState: createResearchCapacityState(),
    advisorProgressState: createAdvisorProgressState(advisor?.id),
    jointTrainingState: createJointTrainingState(),
    eventSupport: { hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, hasFinanceTalent: false },
    eventCounters: createEventCounters(),
    achievementFlags: createAchievementFlags(),
    player: clonePlayer(role.startingStats),
    log: advisor
      ? [createLogEntry(0, `以 ${role.name} 身份开局，导师为 ${advisor.name} / 讲师。`)]
      : [],
  };
}
