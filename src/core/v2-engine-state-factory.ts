import { createGameRandomState, getActiveGameRandomState, withGameRandom } from "./v2-game-random";
import { getEffectiveResearch, getEffectiveSocial } from "./v2-effective-attributes";
import { MAX_SAN } from "./v2-content";
import { createAdvisorProgressState } from "./v2-advisor-progress";
import { createConferenceCareerState, createConferenceEncounterState } from "./v2-conference-encounters";
import { clonePlayer, createLogEntry } from "./v2-engine-helpers";
import { createEventCounters } from "./v2-event-counters";
import { createCoffeeState } from "./v2-coffee-system";
import { createReadingState } from "./v2-reading-system";
import { createShopState } from "./v2-shop-items";
import { createAiShopState } from "./v2-ai-shop";
import { createInitialRandomEventState, createRandomEventPool } from "./v2-random-event-rules";
import { getUnlockedPaperSlotCount } from "./v2-paper-rules";
import { createConferenceLocationSeed } from "./v2-conference-catalog";
import {
  getCalendarForTotalMonths,
  getMonthLimitByDegree,
  getRoleDefinition,
} from "./v2-progression";
import { createInitialThesisState } from "./v2-thesis-rules";
import { createRelationshipState, syncRelationshipState } from "./v2-relationship-rules";
import { createInternshipState } from "./v2-internship-system";
import { createLoverState } from "./v2-lover-system";
import { createLoverProgressState } from "./v2-lover-progression";
import { createResearchCapacityState } from "./v2-research-cap-system";
import type { GameState, RoleId } from "./v2-types";
import { createRoleTalentRunState } from "./v2-role-talent-state";
import { sanitizeRoleTalentAllocation } from "./v2-role-talent-definitions";
import { initializeRoleTalents } from "./v2-role-talent-lifecycle";

export function createInitialState(): GameState {
  const calendar = getCalendarForTotalMonths(0);
  return {
    phase: "setup",
    blockLinearEvents: true,
    debugEventReplayEnabled: false,
    debugSkippedJournalFeePaperIds: [],
    selectedRoleId: "normal",
    setupSelectedRoleId: null,
    playerName: null,
    selectedAdvisorName: null,
    degree: "master",
    phdStartYear: null,
    year: calendar.year,
    month: calendar.month,
    totalMonths: 0,
    maxMonths: getMonthLimitByDegree("master"),
    sanCap: MAX_SAN,
    sanHistory: [],
    paperSlotsUnlocked: getUnlockedPaperSlotCount(0),
    graduationScoreTarget: null,
    totalResearchScore: 0,
    totalCitations: 0,
    citationHistoryByYear: {},
    papers: [],
    externalPublications: [],
    ...createInitialRandomEventState(),
    thesis: createInitialThesisState(),
    careerProgress: { internet: 0, stateOwned: 0, civilService: 0, academic: 0 },
    careerInterviewExperience: { internet: 0, stateOwned: 0, civilService: 0, academic: 0 },
    careerPreparedMonths: {},
    careerLastRecruitmentTotalMonths: null,
    careerOffers: {},
    personalSpending: 0,
    internshipCount: 0,
    selectedPaperId: null,
    shopState: createShopState(),
    aiShopState: createAiShopState(),
    coffeeState: createCoffeeState(),
    readingState: createReadingState(),
    partTimeWorkCount: 0,
    actionState: { used: 0, limit: 1, aiResearchBonusUsed: false },
    relationshipState: createRelationshipState(),
    fellowProgressState: [],
    fellowFinanceAccounts: {},
    fellowPapers: [],
    conferenceEncounterState: createConferenceEncounterState(),
    conferenceAttendancePlans: [],
    conferenceLocationSeed: null,
    conferenceCareerState: createConferenceCareerState(),
    internshipState: createInternshipState(),
    loverState: createLoverState(),
    loverProgressState: createLoverProgressState(),
    researchCapacityState: createResearchCapacityState(),
    advisorProgressState: createAdvisorProgressState(),
    eventSupport: { hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, aiCostsCoveredUntilTotalMonths: null },
    eventCounters: createEventCounters(),
    scholarshipState: {
      lastAwardYear: null,
      awardCount: 0,
      scoreBaseline: 0,
      claimedPaperIds: [],
    },
    publicationTalentState: { claimedIds: [] },
    buffs: [],
    player: { san: 20, research: 0, social: 0, favor: 0, money: 0 },
    log: [createLogEntry(0, "等待选择角色。")],
    ending: null,
    eventQueue: [],
    eventHistory: [],
  };
}

export function createStartedGameState(
  roleId: RoleId,
  talentAllocation: Record<string, number> = {},
  bonusTalentPoints = 0,
): GameState {
  const initial = { ...createInitialState(), randomState: getActiveGameRandomState() ?? createGameRandomState() };
  return withGameRandom(initial, () => createStartedGameStateInternal(roleId, talentAllocation, bonusTalentPoints, initial));
}

function createStartedGameStateInternal(roleId: RoleId, talentAllocation: Record<string, number>, bonusTalentPoints: number, baseState: GameState): GameState {
  const role = getRoleDefinition(roleId);
  const initialPaperSlots = getUnlockedPaperSlotCount(role.startingStats.research);
  const relationshipState = syncRelationshipState(createRelationshipState(), role.startingStats.social);

  const started = initializeRoleTalents({
    ...baseState,
    roleTalents: createRoleTalentRunState(sanitizeRoleTalentAllocation(roleId, 10, talentAllocation, bonusTalentPoints)),
    phase: "playing",
    selectedRoleId: role.id,
    setupSelectedRoleId: role.id,
    playerName: null,
    selectedAdvisorName: null,
    conferenceLocationSeed: createConferenceLocationSeed(),
    year: 1,
    month: 0,
    totalMonths: 0,
    paperSlotsUnlocked: initialPaperSlots,
    relationshipState,
    player: clonePlayer(role.startingStats),
    log: [],
  });
  return { ...started, availableRandomEvents: createRandomEventPool(started), paperSlotsUnlocked: Math.max(started.paperSlotsUnlocked, getUnlockedPaperSlotCount(getEffectiveResearch(started))),
    relationshipState: syncRelationshipState(started.relationshipState, getEffectiveSocial(started)) };
}
