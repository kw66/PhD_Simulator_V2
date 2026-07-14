import {
  getPublishedPaperCount,
  getTotalPublishedPaperCount,
} from "./v2-engine-helpers";
import { resolveMonthlyAcademicProgress } from "./v2-engine-monthly-academic";
import type { MonthlyUpkeepResult } from "./v2-engine-monthly-upkeep";
import { applyMonthlyUpkeep } from "./v2-engine-monthly-upkeep";
import { createMonthTransitionState } from "./v2-engine-month-transition";
import {
  getCalendarForTotalMonths,
} from "./v2-progression";
import {
  yearlyResetRandomEventState,
} from "./v2-random-event-rules";
import type {
  GameState,
} from "./v2-types";

export interface MonthAdvancePreparation {
  nextTotalMonths: number;
  nextYear: number;
  nextMonth: number;
  publishedPaperCountBeforeAdvance: number;
  monthlyUpkeep: MonthlyUpkeepResult;
  academicProgress: ReturnType<typeof resolveMonthlyAcademicProgress>;
  availableRandomEvents: GameState["availableRandomEvents"];
  usedRandomEvents: GameState["usedRandomEvents"];
}

export function prepareMonthAdvance(state: GameState): MonthAdvancePreparation {
  const nextTotalMonths = state.totalMonths + 1;
  const calendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);
  const publishedPaperCountBeforeAdvance = getPublishedPaperCount(state.papers);
  const totalPublishedPaperCountBeforeAdvance = getTotalPublishedPaperCount(state);
  const monthlyUpkeep = applyMonthlyUpkeep(state, calendar.month);
  const academicProgress = resolveMonthlyAcademicProgress({
    state,
    nextTotalMonths,
    nextPlayer: monthlyUpkeep.nextPlayer,
    relationshipState: monthlyUpkeep.relationshipState,
    loverState: monthlyUpkeep.loverState,
    researchCapacityState: monthlyUpkeep.researchCapacityState,
    totalResearchScore: state.totalResearchScore,
    totalCitations: monthlyUpkeep.totalCitations,
    publicationEffects: state.publicationEffects,
    reviewLogsStart: monthlyUpkeep.reviewLogsStart,
    monthlyRelationshipEffects: monthlyUpkeep.monthlyRelationshipEffects,
  });

  const nextRandomEventState = calendar.month === 1 && calendar.year > state.year
    ? yearlyResetRandomEventState(state, totalPublishedPaperCountBeforeAdvance)
    : state;

  return {
    nextTotalMonths,
    nextYear: calendar.year,
    nextMonth: calendar.month,
    publishedPaperCountBeforeAdvance,
    monthlyUpkeep,
    academicProgress,
    availableRandomEvents: nextRandomEventState.availableRandomEvents,
    usedRandomEvents: nextRandomEventState.usedRandomEvents,
  };
}

export function createBaseMonthTransitionState(params: {
  state: GameState;
  preparation: MonthAdvancePreparation;
  maxMonths: number;
  graduationScoreTarget: number;
}): GameState {
  const { state, preparation, maxMonths, graduationScoreTarget } = params;
  return createMonthTransitionState({
    state,
    nextTotalMonths: preparation.nextTotalMonths,
    nextYear: preparation.nextYear,
    nextMonth: preparation.nextMonth,
    maxMonths,
    graduationScoreTarget,
    totalResearchScore: preparation.academicProgress.totalResearchScore,
    totalCitations: preparation.academicProgress.totalCitations,
    nextPapers: preparation.academicProgress.nextPapers,
    nextExternalPublications: preparation.academicProgress.nextExternalPublications,
    availableRandomEvents: preparation.availableRandomEvents,
    usedRandomEvents: preparation.usedRandomEvents,
    nextSanCap: preparation.monthlyUpkeep.nextSanCap,
    nextPlayer: preparation.monthlyUpkeep.nextPlayer,
    publicationEffects: preparation.academicProgress.publicationEffects,
    relationshipState: preparation.monthlyUpkeep.relationshipState,
    internshipState: preparation.monthlyUpkeep.internshipState,
    loverState: preparation.monthlyUpkeep.loverState,
    loverProgressState: preparation.academicProgress.loverProgressState,
    fellowProgressState: preparation.academicProgress.fellowProgressState,
    researchCapacityState: preparation.academicProgress.researchCapacityState,
    advisorProgressState: preparation.academicProgress.advisorProgressState,
    jointTrainingState: preparation.academicProgress.jointTrainingState,
    internshipCount: preparation.monthlyUpkeep.internshipCount,
    shopState: preparation.monthlyUpkeep.shopState,
    coffeeState: preparation.monthlyUpkeep.coffeeState,
    readingState: preparation.monthlyUpkeep.readingState,
    temporaryActionEffects: preparation.monthlyUpkeep.temporaryActionEffects,
  });
}
