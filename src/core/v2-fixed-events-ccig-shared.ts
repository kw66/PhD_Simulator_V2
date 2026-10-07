import { getAcademicCalendarYear } from "./v2-calendar";
import type { GameState, Paper } from "./v2-types";

const VALSE_LOCATIONS: Record<number, string> = { 2024: "重庆", 2025: "珠海", 2026: "武汉" };

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
  return VALSE_LOCATIONS[getAcademicCalendarYear(year, 9)] ?? "外地";
}

export function getCcigRealYear(gameYear: number, gameMonth: number): number {
  return getAcademicCalendarYear(gameYear, gameMonth);
}

export function getCcigSelfPayCost(_state: GameState): { hasMeetingExperience: boolean; discount: number; actualCost: number } {
  return { hasMeetingExperience: false, discount: 0, actualCost: 2 };
}
