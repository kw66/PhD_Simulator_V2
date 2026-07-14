import { decrementEventQueueDeadlines } from "./v2-event-queue";
import { advanceColdWeight } from "./v2-random-event-rules";
import type { GameState } from "./v2-types";

export interface MonthTransitionStateInput {
  state: GameState;
  nextTotalMonths: number;
  nextYear: number;
  nextMonth: number;
  maxMonths: number;
  graduationScoreTarget: number;
  totalResearchScore: number;
  totalCitations: number;
  nextPapers: GameState["papers"];
  nextExternalPublications: GameState["externalPublications"];
  availableRandomEvents: GameState["availableRandomEvents"];
  usedRandomEvents: GameState["usedRandomEvents"];
  nextSanCap: number;
  nextPlayer: GameState["player"];
  publicationEffects: GameState["publicationEffects"];
  relationshipState: GameState["relationshipState"];
  internshipState: GameState["internshipState"];
  loverState: GameState["loverState"];
  loverProgressState: GameState["loverProgressState"];
  fellowProgressState: GameState["fellowProgressState"];
  researchCapacityState: GameState["researchCapacityState"];
  advisorProgressState: GameState["advisorProgressState"];
  jointTrainingState: GameState["jointTrainingState"];
  internshipCount: number;
  shopState: GameState["shopState"];
  coffeeState: GameState["coffeeState"];
  readingState: GameState["readingState"];
  temporaryActionEffects: GameState["temporaryActionEffects"];
}

export function createMonthTransitionState(input: MonthTransitionStateInput): GameState {
  return {
    ...input.state,
    totalMonths: input.nextTotalMonths,
    year: input.nextYear,
    month: input.nextMonth,
    maxMonths: input.maxMonths,
    graduationScoreTarget: input.graduationScoreTarget,
    actionsRemaining: input.state.maxActionsPerMonth,
    totalResearchScore: input.totalResearchScore,
    totalCitations: input.totalCitations,
    papers: input.nextPapers,
    externalPublications: input.nextExternalPublications,
    availableRandomEvents: [...input.availableRandomEvents],
    usedRandomEvents: [...input.usedRandomEvents],
    coldWeight: advanceColdWeight(input.state.coldWeight),
    badmintonYear: input.state.badmintonYear,
    totalRandomEventCount: input.state.totalRandomEventCount,
    slotPublishedA: [...input.state.slotPublishedA],
    sanCap: input.nextSanCap,
    player: input.nextPlayer,
    publicationEffects: input.publicationEffects,
    relationshipState: input.relationshipState,
    internshipState: input.internshipState,
    loverState: input.loverState,
    loverProgressState: input.loverProgressState,
    fellowProgressState: input.fellowProgressState,
    researchCapacityState: input.researchCapacityState,
    advisorProgressState: input.advisorProgressState,
    jointTrainingState: input.jointTrainingState,
    internshipCount: input.internshipCount,
    shopState: input.shopState,
    coffeeState: input.coffeeState,
    readingState: input.readingState,
    temporaryActionEffects: input.temporaryActionEffects,
    eventQueue: decrementEventQueueDeadlines(input.state.eventQueue),
  };
}
