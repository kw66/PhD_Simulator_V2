import { expect } from "vitest";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../../src/core/v2-progression";
import {
  createInitialThesisState, prepareThesisBlindReview, syncThesisState, THESIS_REVIEW_THRESHOLDS,
} from "../../src/core/v2-thesis-rules";
import type { GameState } from "../../src/core/v2-types";

export function withPassingThesisReview(state: GameState): GameState {
  const reviewMonth = getMonthLimitByDegree(state.degree) - 2;
  const prepared = syncThesisState({
    ...state,
    ...getCalendarForTotalMonths(reviewMonth, state.degree),
    totalMonths: reviewMonth,
    totalResearchScore: state.graduationScoreTarget!,
    thesis: createInitialThesisState(),
  }, () => 0);
  prepared.thesis.researchPoints = prepared.thesis.researchPoints.map((point) => ({
    ...point, score: Math.max(point.score, Math.ceil(THESIS_REVIEW_THRESHOLDS[state.degree].B / 3)),
  }));
  const reviewed = prepareThesisBlindReview(prepared, () => 0);
  expect(reviewed.thesis.review).toMatchObject({ submitted: true, passed: true });
  expect(reviewed.thesis.review!.reports).toHaveLength(state.degree === "master" ? 3 : 5);
  return { ...state, thesis: { ...reviewed.thesis, reviewResolved: true } };
}
