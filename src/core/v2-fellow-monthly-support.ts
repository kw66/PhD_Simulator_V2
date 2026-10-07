import type { FellowProgressProfile } from "./v2-types";

export function recordFellowMonthlySupport(
  profile: FellowProgressProfile,
  totalMonths: number,
  activity: string,
): FellowProgressProfile {
  const previous = profile.lastSupportTotalMonths === totalMonths ? profile.monthlySupportActivity : undefined;
  return {
    ...profile,
    monthlySupportActivity: previous ? `${previous}；${activity}` : activity,
    lastSupportTotalMonths: totalMonths,
  };
}
