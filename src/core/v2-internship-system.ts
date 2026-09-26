import type { GameState, InternshipState, Paper } from "./v2-types";

type InternshipContext = Pick<GameState, "internshipState" | "totalMonths">;

export interface InternshipStatus {
  kind: "remote3" | "conference6" | null;
  active: boolean;
  pending: boolean;
  remainingMonths: number;
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
    experimentMultiplier: 1,
    experimentBonus: 0,
    experimentMoneyDiscount: 0,
  };
}

export function activateInternship(): InternshipState {
  return {
    active: true,
    kind: "conference6",
    remainingMonths: 6,
    experimentMultiplier: 1.25,
    experimentBonus: 0,
    experimentMoneyDiscount: 0,
  };
}

export function activateRemoteInternship(totalMonths: number): InternshipState {
  return {
    active: true,
    kind: "remote3",
    startTotalMonths: totalMonths + 1,
    endTotalMonths: totalMonths + 3,
    remainingMonths: 3,
    experimentMultiplier: 1,
    experimentBonus: 4,
    experimentMoneyDiscount: 1,
  };
}

export function getInternshipStatus({ internshipState, totalMonths }: InternshipContext): InternshipStatus {
  if (!internshipState.active) {
    return { kind: null, active: false, pending: false, remainingMonths: 0 };
  }
  const kind = internshipState.kind ?? "conference6";
  if (kind === "remote3") {
    const start = internshipState.startTotalMonths;
    const end = internshipState.endTotalMonths;
    if (start === undefined || end === undefined || totalMonths > end) {
      return { kind, active: false, pending: false, remainingMonths: 0 };
    }
    return {
      kind,
      active: totalMonths >= start,
      pending: totalMonths < start,
      remainingMonths: Math.max(0, end - Math.max(totalMonths, start) + 1),
    };
  }
  return {
    kind,
    active: internshipState.remainingMonths > 0,
    pending: false,
    remainingMonths: Math.max(0, internshipState.remainingMonths),
  };
}

export function hasOngoingInternship(state: InternshipContext): boolean {
  const status = getInternshipStatus(state);
  return status.active || status.pending;
}

export function getInternshipMonthlyStats(
  state: InternshipContext & Pick<GameState, "papers" | "externalPublications" | "totalCitations">,
): { san: number; money: number } {
  const status = getInternshipStatus(state);
  if (!status.active) return { san: 0, money: 0 };
  return status.kind === "remote3"
    ? { san: -3, money: 1 }
    : { san: -2, money: getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.totalCitations) };
}

export function getInternshipExperimentEffect(state: InternshipContext): {
  bonus: number;
  multiplier: number;
  moneyDiscount: number;
} {
  const status = getInternshipStatus(state);
  if (!status.active) return { bonus: 0, multiplier: 1, moneyDiscount: 0 };
  return status.kind === "remote3"
    ? { bonus: 4, multiplier: 1, moneyDiscount: 1 }
    : { bonus: 0, multiplier: state.internshipState.experimentMultiplier, moneyDiscount: 0 };
}

export function advanceInternshipMonth(state: InternshipContext): InternshipState {
  if (!state.internshipState.active) return state.internshipState;
  const status = getInternshipStatus(state);
  if (status.kind === "remote3") {
    return status.active || status.pending
      ? { ...state.internshipState, remainingMonths: status.remainingMonths }
      : createInternshipState();
  }
  return state.internshipState.remainingMonths <= 1
    ? createInternshipState()
    : { ...state.internshipState, remainingMonths: state.internshipState.remainingMonths - 1 };
}

export function increaseInternshipExperimentMultiplier(state: InternshipState): InternshipState {
  if (!state.active || state.kind === "remote3") {
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
