export const ENROLLMENT_CALENDAR_YEAR = 2023;

export function getAcademicCalendarYear(gameYear: number, gameMonth: number): number {
  return ENROLLMENT_CALENDAR_YEAR - 1
    + Number(gameYear || 0)
    + (Number(gameMonth || 0) >= 5 ? 1 : 0);
}
