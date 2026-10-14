import type { GameState, InternshipOffer, InternshipState, Paper } from "./v2-types";
import { roundMoney } from "./v2-money";
import { getRoleTalentLevel } from "./v2-role-talent-state";

type InternshipContext = Pick<GameState, "internshipState" | "totalMonths">;

export interface InternshipStatus {
  kind: "remote3" | "conference6" | null;
  active: boolean;
  pending: boolean;
  remainingMonths: number;
}

type InternshipEligibilityContext = InternshipContext
  & Pick<GameState, "conferenceCareerState" | "papers" | "externalPublications" | "internshipCount">;

const INTERNSHIP_COMPANIES = ["字节跳动", "月之暗面", "腾讯", "阿里巴巴", "华为", "美团", "百度", "上海AI Lab", "蚂蚁集团"] as const;
const INTERNSHIP_DIRECTIONS = [
  { name: "大模型训练", positions: ["预训练算法实习生", "后训练算法实习生"] },
  { name: "推理优化", positions: ["推理加速实习生", "模型部署实习生"] },
  { name: "多模态研究", positions: ["视觉语言模型实习生", "多模态算法实习生"] },
  { name: "智能体应用", positions: ["智能体研发实习生", "大模型工具链实习生"] },
  { name: "数据与评测", positions: ["大模型数据实习生", "大模型评测实习生"] },
] as const;

export interface InternshipLead {
  company: string;
  direction: (typeof INTERNSHIP_DIRECTIONS)[number]["name"];
}

function rollIndex(getRoll: () => number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(getRoll() * count)));
}

export function createInternshipLead(getRoll: () => number = Math.random): InternshipLead {
  const companyIndex = rollIndex(getRoll, INTERNSHIP_COMPANIES.length);
  const directionIndex = rollIndex(getRoll, INTERNSHIP_DIRECTIONS.length);
  return { company: INTERNSHIP_COMPANIES[companyIndex]!, direction: INTERNSHIP_DIRECTIONS[directionIndex]!.name };
}

export function createInternshipOffer(getRoll: () => number = Math.random, lead = createInternshipLead(getRoll)): InternshipOffer {
  const companyIndex = INTERNSHIP_COMPANIES.findIndex((company) => company === lead.company);
  const directionIndex = INTERNSHIP_DIRECTIONS.findIndex((direction) => direction.name === lead.direction);
  const positions = INTERNSHIP_DIRECTIONS[directionIndex >= 0 ? directionIndex : 0]!.positions;
  const positionIndex = rollIndex(getRoll, positions.length);
  const baseMonthlyIncome = rollIndex(getRoll, 3);
  const monthlySanCost = 4 + rollIndex(getRoll, 3);
  const experimentBonus = 4 + rollIndex(getRoll, 3);
  return {
    id: `enterprise-${companyIndex}-${directionIndex}-${positionIndex}-${baseMonthlyIncome}-${monthlySanCost}-${experimentBonus}`,
    company: lead.company,
    position: positions[positionIndex]!,
    baseMonthlyIncome,
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
  state: InternshipContext & Pick<GameState, "papers" | "externalPublications"> & Partial<Pick<GameState, "selectedRoleId" | "roleTalents">>,
): { payment: number } {
  const status = getInternshipStatus(state);
  if (!status.active) return { payment: 0 };
  const income = status.kind === "remote3" ? 1
    : getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.internshipState.offer?.baseMonthlyIncome);
  const bonus = state.selectedRoleId === "rich" ? getRoleTalentLevel(state, "work-pays-off") * 0.5 : 0;
  return { payment: roundMoney(income * (1 + bonus)) };
}

export function getInternshipMonthlyStats(
  state: InternshipContext & Pick<GameState, "papers" | "externalPublications"> & Partial<Pick<GameState, "selectedRoleId" | "roleTalents">>,
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
