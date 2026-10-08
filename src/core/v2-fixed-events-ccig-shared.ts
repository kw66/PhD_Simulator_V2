import { getAcademicCalendarYear } from "./v2-calendar";
import { createFixedEvent } from "./v2-fixed-events-shared";
import type { GameState, Paper } from "./v2-types";

const VALSE_LOCATIONS: Record<number, string> = { 2024: "重庆", 2025: "珠海", 2026: "武汉" };

export type CcigParticipationMode = "skip" | "advisor" | "self";
export type CcigActivityMode = "listen" | "poster" | "travel" | "food";

export function createCcigFixedEvent(state: Pick<GameState, "year" | "month">, params: Parameters<typeof createFixedEvent>[0]) {
  return createFixedEvent({
    ...params,
    choices: params.choices.map((choice) => !choice.effects.fixedEventResolution ? choice : {
      ...choice,
      effects: {
        ...choice.effects,
        fixedEventResolution: {
          ...choice.effects.fixedEventResolution,
          ccigCalendar: { year: state.year, month: state.month },
        },
      },
    }),
  });
}

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
