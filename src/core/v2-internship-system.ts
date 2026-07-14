import type { ConferenceCareerState, EventQueueItem, GameState, InternshipState, Paper, PaperActionType } from "./v2-types";

const INTERNSHIP_DURATION_MONTHS = 6;
const BASE_INTERNSHIP_EXPERIMENT_MULTIPLIER = 1.25;
const INTERNSHIP_MONTHLY_SAN_COST = 2;

export interface InternshipMonthlyEffectResult {
  internshipState: InternshipState;
  moneyDelta: number;
  sanDelta: number;
  internshipCountDelta: number;
  logs: string[];
}

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
    startTotalMonths: null,
    experimentMultiplier: 1,
  };
}

export function activateInternship(totalMonths: number): InternshipState {
  return {
    active: true,
    remainingMonths: INTERNSHIP_DURATION_MONTHS,
    startTotalMonths: totalMonths,
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

export function getInternshipExperimentMultiplier(state: InternshipState, actionType: PaperActionType): number {
  if (!state.active || actionType !== "experiment") {
    return 1;
  }

  return state.experimentMultiplier;
}

export function getPublishedAPaperCount(state: Pick<GameState, "papers" | "externalPublications">): number {
  return countPublishedAPapers(state.papers) + countPublishedAPapers(state.externalPublications);
}

export function getInternshipMonthlyIncome(publishedAPaperCount: number, totalCitations: number): number {
  return Math.min(1 + publishedAPaperCount * 0.5 + Math.floor(totalCitations / 500) * 0.5, 6);
}

export function shouldEnqueueInternshipInvite(input: {
  conferenceCareerState: ConferenceCareerState;
  internshipState: InternshipState;
  eventQueue: EventQueueItem[];
}): boolean {
  return input.conferenceCareerState.enterpriseCount >= 3
    && !input.internshipState.active
    && !input.conferenceCareerState.permanentlyBlockedInternship
    && !input.eventQueue.some((event) => event.chainId === "internship-invite");
}

export function applyInternshipMonthlyEffect(
  internshipState: InternshipState,
  monthlyIncome: number,
  internshipCount: number,
): InternshipMonthlyEffectResult {
  if (!internshipState.active) {
    return {
      internshipState,
      moneyDelta: 0,
      sanDelta: 0,
      internshipCountDelta: 0,
      logs: [],
    };
  }

  const remainingMonths = internshipState.remainingMonths - 1;
  if (remainingMonths <= 0) {
    return {
      internshipState: createInternshipState(),
      moneyDelta: 0,
      sanDelta: 0,
      internshipCountDelta: 1,
      logs: [`实习结束，累计完成 ${internshipCount + 1} 次实习。`],
    };
  }

  return {
    internshipState: {
      ...internshipState,
      remainingMonths,
    },
    moneyDelta: monthlyIncome,
    sanDelta: -INTERNSHIP_MONTHLY_SAN_COST,
    internshipCountDelta: 0,
    logs: [`实习月结：金钱 +${monthlyIncome}，SAN -${INTERNSHIP_MONTHLY_SAN_COST}。`],
  };
}
