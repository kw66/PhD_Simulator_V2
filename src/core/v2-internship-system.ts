import type { GameState, InternshipOffer, InternshipState, Paper } from "./v2-types";
import { roundMoney } from "./v2-money";

type InternshipContext = Pick<GameState, "internshipState" | "totalMonths">;

export interface InternshipStatus {
  kind: "remote3" | "conference6" | null;
  active: boolean;
  pending: boolean;
  remainingMonths: number;
}

type InternshipEligibilityContext = InternshipContext
  & Pick<GameState, "conferenceCareerState" | "papers" | "externalPublications" | "internshipCount">;

const INTERNSHIP_POSITIONS = [
  { company: "初创科技公司", position: "研发实习生", baseMonthlyIncome: 0 },
  { company: "产业技术公司", position: "算法实习生", baseMonthlyIncome: 1 },
  { company: "大型科技公司", position: "研究实习生", baseMonthlyIncome: 2 },
] as const;

function rollInternshipValue(getRoll: () => number): number {
  return Math.min(2, Math.max(0, Math.floor(getRoll() * 3)));
}

export function createInternshipOffer(getRoll: () => number = Math.random): InternshipOffer {
  const positionIndex = rollInternshipValue(getRoll);
  const monthlySanCost = 4 + rollInternshipValue(getRoll);
  const experimentBonus = 4 + rollInternshipValue(getRoll);
  return {
    id: `enterprise-${positionIndex}-${monthlySanCost}-${experimentBonus}`,
    ...INTERNSHIP_POSITIONS[positionIndex]!,
    monthlySanCost,
    experimentBonus,
  };
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

export function activateInternship(offer: InternshipOffer = createInternshipOffer(() => 0.5)): InternshipState {
  return {
    offer,
    active: true,
    kind: "conference6",
    remainingMonths: 6,
    experimentMultiplier: 1.25,
    experimentBonus: offer.experimentBonus,
    experimentMoneyDiscount: 2,
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

export function hasRemoteInternshipScore(state: Pick<GameState, "totalResearchScore">): boolean {
  return state.totalResearchScore >= 2;
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

export function hasInternshipExperience(
  state: InternshipContext & Pick<GameState, "conferenceCareerState" | "internshipCount">,
): boolean {
  return state.internshipCount > 0 || state.conferenceCareerState.hasInternshipExperience === true || hasOngoingInternship(state);
}

export function hasPublishedAConferencePaper(state: Pick<GameState, "papers" | "externalPublications">): boolean {
  return [...state.papers, ...state.externalPublications].some((paper) => paper.status === "published"
    && paper.target === "A" && !paper.journalTarget && !paper.publication?.journalTarget);
}

export function canTriggerConferenceInternshipInvite(state: InternshipEligibilityContext, nextEnterpriseCount: number): boolean {
  return nextEnterpriseCount >= 2 && !hasOngoingInternship(state)
    && (hasPublishedAConferencePaper(state) || hasInternshipExperience(state));
}

export function getInternshipSalaryPayment(
  state: InternshipContext & Pick<GameState, "papers" | "externalPublications">,
): { payment: number } {
  const status = getInternshipStatus(state);
  if (!status.active) return { payment: 0 };
  const income = status.kind === "remote3" ? 1
    : getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.internshipState.offer?.baseMonthlyIncome);
  return { payment: roundMoney(income) };
}

export function getInternshipMonthlyStats(
  state: InternshipContext & Pick<GameState, "papers" | "externalPublications">,
): { san: number; money: number } {
  const status = getInternshipStatus(state);
  if (!status.active) return { san: 0, money: 0 };
  return {
    san: status.kind === "remote3" ? -2 : -(state.internshipState.offer?.monthlySanCost ?? 5),
    money: getInternshipSalaryPayment(state).payment,
  };
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
    : { bonus: state.internshipState.offer?.experimentBonus ?? 5, multiplier: 1.25, moneyDiscount: 2 };
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

export function getPublishedAPaperCount(state: Pick<GameState, "papers" | "externalPublications">): number {
  return countPublishedAPapers(state.papers.filter((paper) => paper.nonFirstAuthor !== true))
    + countPublishedAPapers(state.externalPublications.filter((paper) => paper.nonFirstAuthor !== true));
}

export function getInternshipMonthlyIncome(publishedAPaperCount: number, baseMonthlyIncome: number = 1): number {
  return Math.min(baseMonthlyIncome + publishedAPaperCount, 6);
}
