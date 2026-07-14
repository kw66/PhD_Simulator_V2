import { ADVISOR_DEFINITIONS, MASTER_TOTAL_MONTHS, PHD_TOTAL_MONTHS, ROLE_BASE_ORDER, ROLE_DEFINITIONS } from "./v2-content";
import type { AdvisorDefinition, AdvisorTierId, Degree, PendingDecision, RoleBaseId, RoleDefinition, RoleId, RoleMode } from "./v2-types";

function getMaxYearsByDegree(degree: Degree): number {
  return degree === "master" ? 3 : 5;
}

export function isPreEnrollmentState(state: Pick<{ month: number; totalMonths: number }, "month" | "totalMonths">): boolean {
  return state.month <= 0 || state.totalMonths <= 0;
}

function getCalendarForMaxYears(totalMonths: number, maxYears: number): { year: number; month: number } {
  if (totalMonths <= 0) {
    return { year: 1, month: 0 };
  }

  let remainingMonths = totalMonths;

  for (let year = 1; year < maxYears; year += 1) {
    if (remainingMonths <= 12) {
      return { year, month: remainingMonths };
    }
    remainingMonths -= 12;
  }

  return {
    year: maxYears,
    month: Math.min(Math.max(remainingMonths, 1), 10),
  };
}

export function getRoleDefinition(roleId: RoleId): RoleDefinition {
  const role = ROLE_DEFINITIONS.find((item) => item.id === roleId);
  if (!role) {
    throw new Error(`Unknown role: ${roleId}`);
  }
  return role;
}

export function getRoleBaseId(roleId: RoleId): RoleBaseId {
  return getRoleDefinition(roleId).baseId;
}

export function getRoleMode(roleId: RoleId): RoleMode {
  return getRoleDefinition(roleId).mode;
}

export function isReversedRole(roleId: RoleId): boolean {
  return getRoleMode(roleId) === "reversed";
}

export function getRoleVariant(baseId: RoleBaseId, mode: RoleMode): RoleDefinition {
  const targetId = mode === "upright" ? baseId : (`${baseId}-reversed` as RoleId);
  return getRoleDefinition(targetId);
}

export function getRoleBaseOrder(): RoleBaseId[] {
  return ROLE_BASE_ORDER;
}

export function getAdvisorDefinition(advisorId: AdvisorTierId): AdvisorDefinition {
  const advisor = ADVISOR_DEFINITIONS.find((item) => item.id === advisorId);
  if (!advisor) {
    throw new Error(`Unknown advisor: ${advisorId}`);
  }
  return advisor;
}

export function getAdvisorDefinitionOrNull(advisorId: AdvisorTierId | null): AdvisorDefinition | null {
  return advisorId ? getAdvisorDefinition(advisorId) : null;
}

export function isAdvisorGenericTitle(advisor: Pick<AdvisorDefinition, "name" | "title">): boolean {
  return advisor.title === advisor.name || advisor.title === "教授" || advisor.title === "副教授";
}

export function getAdvisorHonorText(advisor: Pick<AdvisorDefinition, "name" | "title">): string {
  return isAdvisorGenericTitle(advisor) ? "无" : advisor.title;
}

export function formatAdvisorTierLabel(advisor: Pick<AdvisorDefinition, "name" | "title">): string {
  return isAdvisorGenericTitle(advisor) ? advisor.name : `${advisor.name} / ${advisor.title}`;
}

export function getRoleOptions(): RoleDefinition[] {
  return ROLE_DEFINITIONS;
}

export function getAdvisorOptions(): AdvisorDefinition[] {
  return ADVISOR_DEFINITIONS;
}

export function getCalendarForTotalMonths(totalMonths: number, degree: Degree = "master"): { year: number; month: number } {
  return getCalendarForMaxYears(totalMonths, getMaxYearsByDegree(degree));
}

export function getMonthLimitByDegree(degree: Degree): number {
  return degree === "master" ? MASTER_TOTAL_MONTHS : PHD_TOTAL_MONTHS;
}

export function getGraduationScoreTarget(degree: Degree, advisorId: AdvisorTierId | null): number | null {
  if (!advisorId) return null;
  const advisor = getAdvisorDefinition(advisorId);
  return degree === "master" ? advisor.requirements.masterGrad : advisor.requirements.phdGrad;
}

export function getAdvisorSalaryForMonth(advisorId: AdvisorTierId | null, degree: Degree, month: number): number {
  if (!advisorId) return 0;
  const advisor = getAdvisorDefinition(advisorId);
  const baseSalary = advisor.salary[degree];

  if (Number.isInteger(baseSalary)) {
    return baseSalary;
  }

  if (baseSalary === 1.5) {
    return month % 2 === 0 ? 2 : 1;
  }

  if (baseSalary === 1.25) {
    return [4, 8, 12].includes(month) ? 2 : 1;
  }

  return Math.floor(baseSalary);
}

export function getPhdDecisionRequirement(advisorId: AdvisorTierId | null, year: number): number | null {
  if (year !== 2 && year !== 3) {
    return null;
  }
  if (!advisorId) return null;

  const advisor = getAdvisorDefinition(advisorId);
  return year === 2 ? advisor.requirements.phdYear2 : advisor.requirements.phdYear3;
}

export function createPhdDecision(year: number, requiredScore: number): PendingDecision {
  return {
    kind: "phd-transfer",
    requiredScore,
    year,
  };
}
