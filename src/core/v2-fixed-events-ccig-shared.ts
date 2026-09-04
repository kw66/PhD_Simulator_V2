import { getAcademicCalendarYear } from "./v2-calendar";
import { getMeetingSelfPayDiscount } from "./v2-meeting-system";
import type { GameState, Paper } from "./v2-types";

const CCIG_LOCATIONS = ["合肥", "成都", "苏州", "西安", "重庆"] as const;

export type CcigParticipationMode = "skip" | "advisor" | "self";
export type CcigActivityMode = "listen" | "poster" | "travel" | "food";

export function getCcigPosterPaper(state: Pick<GameState, "papers" | "externalPublications">): Paper | null {
  return [...state.papers, ...state.externalPublications]
    .filter((paper) => (
      paper.status === "published"
      && paper.target === "A"
      && paper.nonFirstAuthor !== true
      && paper.publication !== null
      && paper.publication !== undefined
    ))
    .sort((left, right) => (
      (right.publication?.effectiveScore ?? 0) - (left.publication?.effectiveScore ?? 0)
    ))[0] ?? null;
}

export function getCcigChainId(state: Pick<GameState, "year" | "month">): string {
  return `ccig-y${state.year}-m${state.month}`;
}

export function getCcigActivityChainId(state: Pick<GameState, "year" | "month">): string {
  return `${getCcigChainId(state)}-activity`;
}

export function getCcigLocation(year: number): string {
  return CCIG_LOCATIONS[(year - 1) % CCIG_LOCATIONS.length] ?? CCIG_LOCATIONS[0];
}

export function getCcigRealYear(gameYear: number, gameMonth: number): number {
  return getAcademicCalendarYear(gameYear, gameMonth);
}

export function getCcigSelfPayCost(state: GameState): { hasMeetingExperience: boolean; discount: number; actualCost: number } {
  const discount = getMeetingSelfPayDiscount(state.eventCounters.meetingCount, 2);
  const actualCost = Math.max(0, 2 - discount);
  return { hasMeetingExperience: discount > 0, discount, actualCost };
}
