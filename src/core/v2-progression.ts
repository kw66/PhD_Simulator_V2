import {
  ADVISOR_DEFINITIONS,
  ADVISOR_REQUIREMENTS,
  ADVISOR_SALARY,
  MASTER_TOTAL_MONTHS,
  PHD_TOTAL_MONTHS,
  ROLE_BASE_ORDER,
  ROLE_DEFINITIONS,
} from "./v2-content";
import type { AdvisorDefinition, AdvisorId, Degree, PendingDecision, RoleBaseId, RoleDefinition, RoleId, RoleMode } from "./v2-types";

const LEGACY_ADVISOR_ID_MAP: Record<string, AdvisorId> = {
  level1: "chen-ming",
  level2: "zhou-lan",
  level3: "lin-hao",
  level4: "lin-hao",
  level5: "zhao-ning",
};

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

export function normalizeAdvisorId(value: unknown): AdvisorId | null {
  if (typeof value !== "string") return null;
  const advisor = ADVISOR_DEFINITIONS.find((item) => item.id === value);
  return advisor?.id ?? LEGACY_ADVISOR_ID_MAP[value] ?? null;
}

export function getAdvisorDefinition(advisorId: AdvisorId): AdvisorDefinition {
  const normalizedAdvisorId = normalizeAdvisorId(advisorId);
  const advisor = ADVISOR_DEFINITIONS.find((item) => item.id === normalizedAdvisorId);
  if (!advisor) {
    throw new Error(`Unknown advisor: ${advisorId}`);
  }
  return advisor;
}

export function getAdvisorDefinitionOrNull(advisorId: AdvisorId | null): AdvisorDefinition | null {
  return advisorId ? getAdvisorDefinition(advisorId) : null;
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

export function getGraduationScoreTarget(degree: Degree, advisorId: AdvisorId | null): number | null {
  if (!advisorId) return null;
  return degree === "master" ? ADVISOR_REQUIREMENTS.masterGrad : ADVISOR_REQUIREMENTS.phdGrad;
}

export function getAdvisorSalaryForMonth(advisorId: AdvisorId | null, degree: Degree, _month: number): number {
  if (!advisorId) return 0;
  const baseSalary = ADVISOR_SALARY[degree];

  if (Number.isInteger(baseSalary)) {
    return baseSalary;
  }

  return Math.floor(baseSalary);
}

export function getPhdDecisionRequirement(advisorId: AdvisorId | null, year: number): number | null {
  if (year !== 2 && year !== 3) {
    return null;
  }
  if (!advisorId) return null;

  return year === 2 ? ADVISOR_REQUIREMENTS.phdYear2 : ADVISOR_REQUIREMENTS.phdYear3;
}

export function createPhdDecision(year: number, requiredScore: number): PendingDecision {
  return {
    kind: "phd-transfer",
    requiredScore,
    year,
  };
}
