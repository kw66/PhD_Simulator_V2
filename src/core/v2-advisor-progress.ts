import { getAcademicCalendarMonth, getAcademicCalendarYear } from "./v2-calendar";
import { ADVISOR_SALARY, SCORE_BY_TARGET } from "./v2-content";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { getJournalDefinition } from "./v2-journal-system";
import type { AdvisorGrantId, AdvisorProgressState, Degree, GameState, Paper } from "./v2-types";
import { recordTalentTrigger } from "./v2-talent-history";
import { getRelationshipSanCost } from "./v2-buffs";
import { settleAdvisorGuidance } from "./v2-advisor-guidance";
import { advanceSharedLabProject, ADVISOR_HORIZONTAL_REWARD } from "./v2-lab-projects";

export const ADVISOR_HORIZONTAL_SAN_COST = 5;
export const ADVISOR_VERTICAL_SAN_COST = 4;
/** Kept as the default horizontal cost for callers that do not choose a project. */
export const ADVISOR_TASK_SAN_COST = ADVISOR_HORIZONTAL_SAN_COST;
export { ADVISOR_HORIZONTAL_REWARD, PROJECT_PROGRESS_MAX } from "./v2-lab-projects";

export interface AdvisorGrantDefinition {
  id: AdvisorGrantId;
  name: string;
  threshold: number;
  funding: number;
  durationYears: number;
}

export const ADVISOR_GRANTS: readonly AdvisorGrantDefinition[] = [
  { id: "youth", name: "青基", threshold: 25, funding: 10, durationYears: 3 },
  { id: "general", name: "面上", threshold: 50, funding: 20, durationYears: 4 },
  { id: "excellent", name: "优青", threshold: 150, funding: 50, durationYears: 3 },
  { id: "distinguished", name: "杰青", threshold: 400, funding: 100, durationYears: 5 },
  { id: "academician", name: "院士", threshold: 1000, funding: 200, durationYears: 0 },
];

export function createAdvisorProgressState(): AdvisorProgressState {
  return {
    researchAccumulation: 20,
    funding: 10,
    horizontalProgress: 0,
    verticalProgress: 0,
    nextProject: "horizontal",
    monthlyActivity: "暂无项目安排",
    awards: [],
    pendingApplication: null,
    countedPaperIds: [],
    lastSettledTotalMonths: null,
    lastHorizontalTotalMonths: null,
    lastProjectTotalMonths: null,
  };
}

function getHighestAdvisorAwardIndex(advisor: AdvisorProgressState): number {
  return ADVISOR_GRANTS.reduce((highest, grant, index) => advisor.awards.some((award) => award.id === grant.id)
    ? index : highest, -1);
}

export function getAdvisorRankLabel(advisor: AdvisorProgressState): string {
  return ["讲师", "副教授", "教授·四级", "教授·三级", "教授·二级", "教授·一级"][getHighestAdvisorAwardIndex(advisor) + 1]!;
}

export function getAdvisorMonthlySalary(advisor: AdvisorProgressState, degree: Degree): number {
  const rankIndex = getHighestAdvisorAwardIndex(advisor) + 1;
  return ADVISOR_SALARY[degree] + rankIndex * (degree === "phd" ? 0.5 : 0.25);
}

export function getAdvisorNextSalaryIncrease(advisor: AdvisorProgressState, degree: Degree): number {
  return getHighestAdvisorAwardIndex(advisor) === ADVISOR_GRANTS.length - 1 ? 0 : degree === "phd" ? 0.5 : 0.25;
}

export function getAdvisorSalaryPayment(advisor: AdvisorProgressState, degree: Degree) {
  const accrued = getAdvisorMonthlySalary(advisor, degree) + (advisor.salaryRemainder ?? 0);
  const payment = Math.floor(accrued);
  return { payment, remainder: accrued - payment };
}

export function getAdvisorGrantLimit(advisor: AdvisorProgressState): number {
  return advisor.awards.length > 0 ? 2 : 1;
}

export function getActiveAdvisorGrants(advisor: AdvisorProgressState, calendarYear: number) {
  return advisor.awards.filter((award) => award.endYear !== null && award.endYear > calendarYear);
}

export function getEligibleAdvisorGrant(advisor: AdvisorProgressState, calendarYear: number): AdvisorGrantDefinition | null {
  const highest = getHighestAdvisorAwardIndex(advisor);
  const hasProjectSlot = getActiveAdvisorGrants(advisor, calendarYear).length < getAdvisorGrantLimit(advisor);
  return [...ADVISOR_GRANTS].reverse().find((grant) => {
    if (ADVISOR_GRANTS.indexOf(grant) <= highest || advisor.researchAccumulation < grant.threshold) return false;
    return grant.id === "academician"
      ? advisor.awards.some((award) => award.id === "distinguished")
      : hasProjectSlot;
  }) ?? null;
}

export function getAdvisorApplicationSummary(state: GameState): string {
  if (state.month <= 0 || state.totalMonths <= 0) return "入学后开放";
  const advisor = state.advisorProgressState;
  const pending = advisor.pendingApplication;
  if (pending) return `${ADVISOR_GRANTS.find((grant) => grant.id === pending.id)!.name}申请中 · 8月公布`;
  const highest = getHighestAdvisorAwardIndex(advisor);
  if (highest === ADVISOR_GRANTS.length - 1) return "已获院士";
  const year = getAcademicCalendarYear(state.year, state.month);
  const applicationYear = year + (getAcademicCalendarMonth(state.month) >= 3 ? 1 : 0);
  const eligible = getEligibleAdvisorGrant(advisor, applicationYear);
  if (eligible) return `下次3月申请${eligible.name} · 门槛${eligible.threshold}`;
  if (getActiveAdvisorGrants(advisor, applicationYear).length >= getAdvisorGrantLimit(advisor) && highest < 3) {
    return "下次3月限项 · 等待项目名额释放";
  }
  const next = ADVISOR_GRANTS[highest + 1]!;
  return `${next.name}门槛${next.threshold} · 每年3月申请`;
}

function getAdvisorPaperScore(paper: Paper): number {
  const journal = paper.journalTarget ?? paper.publication?.journalTarget;
  return journal ? getJournalDefinition(journal).researchScore : paper.target ? SCORE_BY_TARGET[paper.target] : 0;
}

export function syncAdvisorResearchAccumulation(state: GameState): GameState {
  if (!state.selectedAdvisorName || state.phase === "setup") return state;
  const counted = new Set(state.advisorProgressState.countedPaperIds);
  const fellowIds = new Set(state.fellowProgressState.map((profile) => profile.id));
  let scoreGain = 0;
  const newIds: string[] = [];
  const fellowPapers = (state.fellowPapers ?? []).filter((paper) => fellowIds.has(paper.leadAuthorId ?? ""));
  for (const paper of [...state.papers, ...state.externalPublications, ...fellowPapers]) {
    if (paper.status !== "published" || counted.has(paper.id)
      || paper.leadAuthorId === "lover" || paper.leadAuthorId?.startsWith("lover-")) continue;
    const score = getAdvisorPaperScore(paper);
    if (score <= 0) continue;
    counted.add(paper.id);
    newIds.push(paper.id);
    scoreGain += score;
  }
  if (newIds.length === 0) return state;
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      researchAccumulation: state.advisorProgressState.researchAccumulation + scoreGain,
      countedPaperIds: [...state.advisorProgressState.countedPaperIds, ...newIds],
    },
  };
}

export function getAdvisorTaskSanCost(
  state: GameState,
  projectType: "horizontal" | "vertical" = "horizontal",
): number {
  return getRelationshipSanCost(
    state,
    projectType === "vertical" ? ADVISOR_VERTICAL_SAN_COST : ADVISOR_HORIZONTAL_SAN_COST,
  );
}

export function advanceAdvisorProject(
  state: GameState,
  projectType: "horizontal" | "vertical",
  random: () => number = Math.random,
): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  if (state.advisorProgressState.lastPlayerProjectTotalMonths === state.totalMonths) return pushNoOpLog(state, "科研项目：本月已推进，下月恢复");
  const sanCost = getAdvisorTaskSanCost(state, projectType);
  if (state.player.san < sanCost) return pushNoOpLog(state, `科研项目：SAN不足，需要${sanCost}`);
  const result = advanceSharedLabProject(state, projectType, Math.floor(state.player.research) + Math.floor(random() * 6), random);
  const completed = result.completed > 0;
  return pushLog({
    ...result.state,
    player: { ...result.state.player, san: state.player.san - sanCost },
    advisorProgressState: {
      ...result.state.advisorProgressState,
      lastPlayerProjectTotalMonths: state.totalMonths,
      lastProjectTotalMonths: state.totalMonths,
      ...(projectType === "horizontal" ? { lastHorizontalTotalMonths: state.totalMonths } : {}),
    },
  }, `推进${projectType === "horizontal" ? "横向" : "纵向"}项目：SAN-${sanCost}${completed ? projectType === "horizontal" ? `，科研经费+${ADVISOR_HORIZONTAL_REWARD}，劳务费+5` : "，科研积累提升，指导论文" : `，进度+${result.gain}`}`);
}

export function advanceAdvisorHorizontal(state: GameState, random: () => number = Math.random): GameState {
  return advanceAdvisorProject(state, "horizontal", random);
}

export function settleAdvisorMonth(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName || state.totalMonths <= 1) return state;
  if ((state.advisorProgressState.lastSettledTotalMonths ?? -1) >= state.totalMonths) return state;
  let nextState = syncAdvisorResearchAccumulation(state);
  let advisor: AdvisorProgressState = {
    ...nextState.advisorProgressState,
    lastSettledTotalMonths: state.totalMonths,
  };
  if (state.totalMonths > 0 && advisor.lastAdvisorProjectTotalMonths !== state.totalMonths) {
    const projectType = advisor.nextProject ?? "horizontal";
    if (projectType === "horizontal" && advisor.funding <= 0) {
      advisor = {
        ...advisor,
        nextProject: "vertical",
        lastAdvisorProjectTotalMonths: state.totalMonths,
        lastProjectTotalMonths: state.totalMonths,
        monthlyActivity: "横向项目暂停（科研经费不足）",
      };
    } else {
      const result = advanceSharedLabProject({ ...nextState, advisorProgressState: advisor }, projectType, 10, random);
      nextState = result.state;
      advisor = {
        ...nextState.advisorProgressState,
        nextProject: projectType === "horizontal" ? "vertical" : "horizontal",
        lastAdvisorProjectTotalMonths: state.totalMonths,
        lastProjectTotalMonths: state.totalMonths,
        monthlyActivity: `${projectType === "horizontal" ? "横向" : "纵向"}进度+10${result.completed > 0 ? projectType === "vertical" ? "（项目完成），指导论文" : "（项目完成）" : ""}`,
      };
    }
  }
  const calendarMonth = getAcademicCalendarMonth(state.month);
  const calendarYear = getAcademicCalendarYear(state.year, state.month);
  const pending = advisor.pendingApplication;
  if (calendarMonth === 8 && pending?.calendarYear === calendarYear) {
    const grant = ADVISOR_GRANTS.find((definition) => definition.id === pending.id)!;
    if (!advisor.awards.some((award) => award.id === grant.id)) {
      const previousSalary = getAdvisorMonthlySalary(advisor, state.degree);
      const addedFunding = grant.funding;
      advisor = {
        ...advisor,
        funding: advisor.funding + addedFunding,
        awards: [...advisor.awards, {
          id: grant.id,
          awardedYear: calendarYear,
          startYear: grant.durationYears > 0 ? calendarYear + 1 : null,
          endYear: grant.durationYears > 0 ? calendarYear + grant.durationYears : null,
        }],
      };
      nextState = pushLog(nextState, `导师${grant.id === "academician" ? "当选" : "获批"}${grant.name}：晋升${getAdvisorRankLabel(advisor)}，科研经费+${addedFunding}`);
      const salary = getAdvisorMonthlySalary(advisor, state.degree);
      if (salary > previousSalary) {
        nextState = recordTalentTrigger(nextState, `advisor-salary:${grant.id}:${calendarYear}`, {
          name: "导师晋升",
          recipient: "你",
          reason: `导师晋升${getAdvisorRankLabel(advisor)}`,
          effects: [`每月补助+${salary - previousSalary}（${previousSalary}→${salary}金币）`],
          details: ["下次月初起按新标准发放"],
        });
      }
    }
    advisor = { ...advisor, pendingApplication: null };
  }
  if (calendarMonth === 3 && advisor.pendingApplication === null) {
    const grant = getEligibleAdvisorGrant(advisor, calendarYear);
    if (grant) {
      advisor = { ...advisor, pendingApplication: { id: grant.id, calendarYear, researchSnapshot: advisor.researchAccumulation } };
      nextState = pushLog(nextState, `年度申请：导师提交${grant.name}申请，科研积累${advisor.researchAccumulation}，8月公布`);
    } else if (getHighestAdvisorAwardIndex(advisor) < ADVISOR_GRANTS.length - 1) {
      nextState = pushLog(nextState, "年度申请：尚无符合门槛且不限项的新项目，本年不申请");
    }
  }
  return settleAdvisorGuidance({ ...nextState, advisorProgressState: advisor }, random);
}
