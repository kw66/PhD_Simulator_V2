import type { FellowProfileAddition, FellowTypeId, GameState } from "./v2-types";

export interface RecruitmentCalendar {
  year: number;
  month?: number;
}

export function getRecruitmentAcademicYears(type: FellowTypeId, calendar: RecruitmentCalendar): number[] {
  const year = Math.max(1, Math.min(6, calendar.year));
  const candidates = type === "peer" ? [year]
    : type === "junior" ? Array.from({ length: Math.min(year, 4) }, (_, index) => index)
      : Array.from({ length: Math.max(0, 6 - year) }, (_, index) => year + index + 1);
  return calendar.month === 11 || calendar.month === 12
    ? candidates.filter((academicYear) => academicYear !== 3 && academicYear !== 6)
    : candidates;
}

export function hasRecruitLeft(
  state: Pick<GameState, "totalMonths">,
  candidate: Pick<FellowProfileAddition, "academicYear" | "academicStartTotalMonths" | "degree">,
): boolean {
  if (candidate.academicYear === undefined || candidate.academicStartTotalMonths === undefined) return false;
  const finalYear = candidate.degree === "phd" ? 6 : 3;
  const finalJune = candidate.academicStartTotalMonths + (finalYear - candidate.academicYear) * 12 + 9;
  return state.totalMonths > finalJune;
}
