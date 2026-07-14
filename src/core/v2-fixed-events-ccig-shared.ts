import type { GameState } from "./v2-types";

const CCIG_LOCATIONS = ["合肥", "成都", "苏州", "西安", "重庆"] as const;

export type CcigParticipationMode = "skip" | "advisor" | "self";
export type CcigActivityMode = "listen" | "travel" | "food";

export function getCcigLocation(year: number): string {
  return CCIG_LOCATIONS[(year - 1) % CCIG_LOCATIONS.length] ?? CCIG_LOCATIONS[0];
}

export function getCcigRealYear(gameYear: number, gameMonth: number): number {
  return 2029 + Number(gameYear || 0) + (Number(gameMonth || 0) >= 5 ? 1 : 0);
}

export function hasCcigFullGear(state: GameState): boolean {
  return state.shopState.bikeUpgrade === "ebike"
    && state.eventSupport.hasParasol
    && state.eventSupport.hasDownJacket;
}

export function getCcigSelfPayCost(state: GameState): { hasFullGear: boolean; discount: number; actualCost: number } {
  const hasFullGear = hasCcigFullGear(state);
  const meetingCount = Math.max(0, state.eventCounters.meetingCount);
  const discount = hasFullGear ? Math.min(2 + Math.floor(meetingCount / 4), 6) : 0;
  const actualCost = Math.max(0, 2 - discount);
  return { hasFullGear, discount, actualCost };
}
