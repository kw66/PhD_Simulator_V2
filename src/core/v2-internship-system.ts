import type { GameState, InternshipState, Paper } from "./v2-types";

const INTERNSHIP_DURATION_MONTHS = 6;
const BASE_INTERNSHIP_EXPERIMENT_MULTIPLIER = 1.25;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function countPublishedAPapers(papers: Paper[]): number {
  return papers.filter((paper) => paper.status === "published" && paper.target === "A").length;
}

export function createInternshipState(): InternshipState {
  return {
    active: false,
    remainingMonths: 0,
    experimentMultiplier: 1,
  };
}

export function activateInternship(): InternshipState {
  return {
    active: true,
    remainingMonths: INTERNSHIP_DURATION_MONTHS,
    experimentMultiplier: BASE_INTERNSHIP_EXPERIMENT_MULTIPLIER,
  };
}

export function increaseInternshipExperimentMultiplier(state: InternshipState): InternshipState {
  if (!state.active) {
    return state;
  }

  return {
    ...state,
    experimentMultiplier: roundToTwoDecimals(state.experimentMultiplier + 0.05),
  };
}

export function getPublishedAPaperCount(state: Pick<GameState, "papers" | "externalPublications">): number {
  return countPublishedAPapers(state.papers.filter((paper) => paper.nonFirstAuthor !== true))
    + countPublishedAPapers(state.externalPublications.filter((paper) => paper.nonFirstAuthor !== true));
}

export function getInternshipMonthlyIncome(publishedAPaperCount: number, totalCitations: number): number {
  return Math.min(1 + publishedAPaperCount * 0.5 + Math.floor(totalCitations / 500) * 0.5, 6);
}
