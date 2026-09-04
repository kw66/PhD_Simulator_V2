import {
  ADVISOR_REQUIREMENTS,
  MASTER_TOTAL_MONTHS,
  PHD_TOTAL_MONTHS,
  ROLE_DEFINITIONS,
} from "./v2-content";
import type { Degree, RoleDefinition, RoleId } from "./v2-types";

function getMaxYearsByDegree(_degree: Degree): number {
  return 6;
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
    month: Math.min(Math.max(remainingMonths, 1), 8),
  };
}

export function getRoleDefinition(roleId: RoleId): RoleDefinition {
  const role = ROLE_DEFINITIONS.find((item) => item.id === roleId);
  if (!role) {
    throw new Error(`Unknown role: ${roleId}`);
  }
  return role;
}

export function getRoleOptions(): RoleDefinition[] {
  return ROLE_DEFINITIONS;
}

export function getCalendarForTotalMonths(totalMonths: number, degree: Degree = "master"): { year: number; month: number } {
  return getCalendarForMaxYears(totalMonths, getMaxYearsByDegree(degree));
}

export function getMonthLimitByDegree(degree: Degree): number {
  return degree === "master" ? MASTER_TOTAL_MONTHS : PHD_TOTAL_MONTHS;
}

export function getGraduationScoreTarget(degree: Degree, advisorName: string | null): number | null {
  if (!advisorName) return null;
  return degree === "master" ? ADVISOR_REQUIREMENTS.masterGrad : ADVISOR_REQUIREMENTS.phdGrad;
}
