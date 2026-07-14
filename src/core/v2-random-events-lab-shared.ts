import type { GameState } from "./v2-types";

export type RandomRollProvider = () => number;

export function wouldUnlockLearnToSayNo(
  state: GameState,
  rejectType: "mentoring" | "review" | "project",
): boolean {
  const mentoringCount = state.eventCounters.rejectedMentoringCount + (rejectType === "mentoring" ? 1 : 0);
  const reviewCount = state.eventCounters.rejectedReviewCount + (rejectType === "review" ? 1 : 0);
  const projectCount = state.eventCounters.rejectedProjectCount + (rejectType === "project" ? 1 : 0);
  return mentoringCount > 0 && reviewCount > 0 && projectCount > 0;
}
