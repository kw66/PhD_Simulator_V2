import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectThesisEventForMonth } from "../src/core/v2-monthly-thesis-events";
import {
  advanceThesisResearchPoint, prepareThesisBlindReview, syncThesisState, THESIS_REVIEW_THRESHOLDS,
} from "../src/core/v2-thesis-rules";
import type { Degree, GameState, Paper, PendingEvent } from "../src/core/v2-types";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

function fixture(degree: Degree = "master", scores = [100, 100]): GameState {
  const initial: GameState = {
    ...createInitialState(), phase: "playing", degree, year: degree === "master" ? 3 : 6,
    month: 1, totalMonths: degree === "master" ? 25 : 61,
    graduationScoreTarget: 10, totalResearchScore: 10,
  };
  const state = syncThesisState(initial, () => 0);
  return {
    ...state, month: 8, totalMonths: state.totalMonths + 7,
    thesis: { ...state.thesis, researchPoints: state.thesis.researchPoints.map((point, index) => ({ ...point, score: scores[index] ?? 0 })) },
  };
}

function stages(event: PendingEvent) {
  const requirements = event.choices[0]!.effects.enqueueEvents![0]!;
  const result = requirements.choices[0]!.effects.enqueueEvents![0]!;
  return [event, requirements, result];
}

describe("thesis blind-review sampling", () => {
  it("uses the approved degree thresholds while preserving all r57 review grades", () => {
    expect(THESIS_REVIEW_THRESHOLDS).toEqual({ master: { C: 60, B: 100, A: 200 }, phd: { C: 180, B: 250, A: 500 } });
    for (const [degree, raw, currentGrade, oldGrade] of [
      ["master", 60, "C", "D"], ["master", 100, "B", "D"], ["master", 200, "A", "B"],
      ["phd", 180, "C", "D"], ["phd", 250, "B", "C"], ["phd", 500, "A", "A"],
    ] as const) {
      const state = fixture(degree, Array(degree === "master" ? 2 : 3).fill(raw / 3));
      const current = prepareThesisBlindReview(state, () => 0.37).thesis.review!;
      expect(current.reports.every(report => report.grade === currentGrade)).toBe(true);
      withGameplayRuleset("20261026-r57", () => {
        const old = prepareThesisBlindReview(state, () => 0.37).thesis.review!;
        expect(old.reports.every(report => report.grade === oldGrade)).toBe(true);
        expect(old.passed).toBe(oldGrade === "A" || oldGrade === "B");
      });
    }
  });

  it("accepts 330-point doctoral work in new runs while replaying the old 360 threshold", () => {
    const state = fixture("phd", [110, 110, 110]);
    expect(prepareThesisBlindReview(state, () => 0.37).thesis.review!.passed).toBe(true);
    withGameplayRuleset("20261021-r14", () => {
      const old = prepareThesisBlindReview(state, () => 0.37).thesis.review!;
      expect(old.passed).toBe(false);
      expect(old.reports.every(report => report.grade === "C")).toBe(true);
      expect(prepareThesisBlindReview(fixture("phd", [120, 120, 120]), () => 0.37).thesis.review!.passed).toBe(true);
    });
  });
  it.each(["master", "phd"] as const)("samples only normal %s reviewers with total weight three", (degree) => {
    const points = degree === "master" ? [140, 25] : [230, 160, 30];
    const state = fixture(degree, points);
    const random = vi.fn(() => 0.37);
    const review = prepareThesisBlindReview(state, random).thesis.review!;
    expect(review.reports).toHaveLength(degree === "master" ? 3 : 5);
    for (const report of review.reports) {
      expect(report.weights).toHaveLength(points.length);
      expect(report.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(3, 12);
      expect(report.weights.every((weight) => weight >= (degree === "master" ? 1.2 : 0.8))).toBe(true);
      expect(report.effectiveScore).toBe(Math.round(points.reduce((sum, point, index) => sum + point * report.weights[index]!, 0)));
      expect(report.comment.length).toBeGreaterThan(0);
    }
    expect(review.degree).toBe(degree);
    expect(review.title).toBe(state.thesis.title);
    expect(review.researchPoints).not.toBe(state.thesis.researchPoints);
    expect(state.thesis.review).toBeNull();
  });

  it("splits the extra weight then shuffles it with the ordinary reviewer algorithm", () => {
    const rolls = [0.5, 0.25, 0, 0.75, 0.5];
    let index = 0;
    const review = prepareThesisBlindReview(fixture("phd", [100, 200, 300]), () => rolls[index++ % rolls.length]!).thesis.review!;
    expect(review.reports[0]!.weights[0]).toBeCloseTo(1.025);
    expect(review.reports[0]!.weights[1]).toBeCloseTo(0.875);
    expect(review.reports[0]!.weights[2]).toBeCloseTo(1.1);
    expect(review.reports[0]!.effectiveScore).toBe(608);
  });

  for (const degree of ["master", "phd"] as const) {
    const thresholds = THESIS_REVIEW_THRESHOLDS[degree];
    for (const [raw, grade, band] of [
      [thresholds.C - 1, "D", [0, 59]], [thresholds.C, "C", [60, 74]],
      [thresholds.B - 1, "C", [60, 74]], [thresholds.B, "B", [75, 89]],
      [thresholds.A - 1, "B", [75, 89]], [thresholds.A, "A", [90, 100]],
    ] as const) {
      it(`${degree} raw ${raw} yields ${grade} at both display-score extremes`, () => {
        for (const roll of [0, 0.999999, 1]) {
          const state = fixture(degree, Array(degree === "master" ? 2 : 3).fill(raw / 3));
          const review = prepareThesisBlindReview(state, () => roll).thesis.review!;
          expect(review.reports.every((report) => report.grade === grade && report.effectiveScore === raw)).toBe(true);
          expect(review.reports.every((report) => report.score === band[roll === 0 ? 0 : 1])).toBe(true);
          expect(review.passed).toBe(grade === "A" || grade === "B");
          expect(review.excellent).toBe(grade === "A");
        }
      });
    }
  }

  it("one C prevents passing even when the other reviewers give B", () => {
    const rolls = [0, 0.999999, 0, 0.999999, 0.999999, 0, 0.999999, 0.999999, 0];
    let index = 0;
    const review = prepareThesisBlindReview(fixture("master", [50, 20]), () => rolls[index++] ?? 0).thesis.review!;
    expect(review.reports.map((report) => report.grade)).toEqual(["C", "B", "B"]);
    expect(review.passed).toBe(false);
    expect(review.excellent).toBe(false);
  });

  it.each([null, 11])("freezes failed eligibility for target %s without sampling reviewers", (target) => {
    const state = { ...fixture(), graduationScoreTarget: target };
    const random = vi.fn(() => 0.5);
    const failed = prepareThesisBlindReview(state, random);
    expect(failed.thesis.review).toMatchObject({ submitted: false, reports: [], passed: false, excellent: false });
    expect(failed.thesis.review!.reason).toBeTruthy();
    expect(random).not.toHaveBeenCalled();
    const later = { ...failed, graduationScoreTarget: 10, totalResearchScore: 1000, month: 9 };
    expect(prepareThesisBlindReview(later, random)).toBe(later);
    expect(random).not.toHaveBeenCalled();
  });

  it("takes final April support before freezing and never redraws or upgrades afterward", () => {
    const state = fixture();
    const paper: Paper = {
      id: "april", title: "April", topicId: state.thesis.topicId!, topicLabel: state.thesis.topicLabel,
      heatMultiplier: 1, prepublicationDecayRate: 0.1, status: "published", target: "A", reviewMonthsLeft: 0,
      idea: 40, experiment: 30, writing: 30, submittedIdea: 100, submittedExperiment: 100, submittedWriting: 100,
    };
    state.papers = [paper];
    const prepared = prepareThesisBlindReview(state, () => 0);
    expect(prepared.thesis.review!.researchPoints.map((point) => point.score)).toEqual([300, 100]);
    const later = { ...prepared, month: 9, papers: [{ ...paper, id: "later", submittedIdea: 900 }] };
    const random = vi.fn(() => { throw new Error("reroll"); });
    expect(prepareThesisBlindReview(later, random)).toBe(later);
    expect(syncThesisState(later, random)).toBe(later);
    expect(advanceThesisResearchPoint(later, 0)).toBe(later);
    expect(random).not.toHaveBeenCalled();
  });
});

describe("thesis blind-review event snapshots", () => {
  it("records real point changes and freezes them before the review scenes", () => {
    let state = fixture("master", [40, 10]);
    state.player = { ...state.player, research: 6, san: 20 };
    state.month = 2;
    state.totalMonths = 26;
    state = advanceThesisResearchPoint(state, 0);
    expect(state.thesis.scoreHistory.at(-1)).toMatchObject({ totalMonths: 26, pointScores: [51, 10] });
    state.month = 8;
    state.totalMonths = 32;
    const collected = collectThesisEventForMonth(state, () => 0);
    const [overview, reports, decision] = stages(collected.event!);
    expect(overview.thesisReviewPresentation?.scoreHistory.at(-1)?.pointScores).toEqual([51, 10]);
    expect(reports.thesisReviewPresentation?.scoreHistory).toEqual(overview.thesisReviewPresentation?.scoreHistory);
    expect(decision.thesisReviewPresentation?.scoreHistory).toEqual(overview.thesisReviewPresentation?.scoreHistory);
    state.thesis.scoreHistory.at(-1)!.pointScores[0] = 999;
    expect(overview.thesisReviewPresentation?.scoreHistory.at(-1)?.pointScores[0]).toBe(51);
  });

  it.each(["master", "phd"] as const)("builds three %s scenes and resolves only on final confirmation", (degree) => {
    const state = fixture(degree, [200, 200, 200]);
    const collected = collectThesisEventForMonth(state, () => 0);
    expect(collected.event!.id).toBe(`thesis-review-${degree}-y${state.year}`);
    const [intro, requirements, result] = stages(collected.event!);
    expect([intro, requirements, result].map((event) => event!.stage)).toEqual(["act1", "act2", "result"]);
    expect([intro, requirements, result].map((event) => event!.choices[0]!.label)).toEqual(["继续", "继续", "确定"]);
    expect(intro!.thesisReviewPresentation?.stage).toBe("overview");
    expect(requirements!.thesisReviewPresentation?.stage).toBe("reports");
    expect(result!.thesisReviewPresentation?.stage).toBe("decision");
    expect(intro!.thesisReviewPresentation?.scoreHistory.at(-1)?.pointScores).toEqual(degree === "master" ? [200, 200] : [200, 200, 200]);
    expect(intro!.choices[0]!.effects.resolveThesisReview).toBeUndefined();
    expect(requirements!.choices[0]!.effects.resolveThesisReview).toBeUndefined();
    expect(result!.choices[0]!.effects).toEqual({ resolveThesisReview: true });
    expect(collected.nextState.thesis.reviewResolved).toBe(false);
    expect(result!.thesisReviewPresentation!.pointScores).toEqual(degree === "master" ? [200, 200] : [200, 200, 200]);
    expect(result!.thesisReviewPresentation!.review).toEqual(collected.nextState.thesis.review);
    expect(result!.thesisReviewPresentation!.review).not.toBe(collected.nextState.thesis.review);
    expect(result!.description).toContain(`机制结算\n结果：盲审通过\n结果：优秀${degree === "master" ? "硕士" : "博士"}论文`);
    expect(result!.description).not.toContain("×");
    collected.nextState.thesis.review!.reports[0]!.weights[0] = 99;
    expect(result!.thesisReviewPresentation!.review.reports[0]!.weights[0]).not.toBe(99);
  });

  it("protects every queued stage against duplication and rebuilds missing events from the frozen review", () => {
    const collected = collectThesisEventForMonth(fixture(), () => 0);
    const random = vi.fn(() => { throw new Error("reroll"); });
    for (const event of stages(collected.event!)) {
      const queued = { ...collected.nextState, eventQueue: [createEventQueueItem(event!, 1)] };
      expect(collectThesisEventForMonth(queued, random)).toEqual({ nextState: queued, event: null });
    }
    const rebuilt = collectThesisEventForMonth({ ...collected.nextState, totalResearchScore: 0 }, random);
    expect(rebuilt.event).toEqual(collected.event);
    const resolved = { ...collected.nextState, thesis: { ...collected.nextState.thesis, reviewResolved: true } };
    expect(collectThesisEventForMonth(resolved, random).event).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it("only schedules in the graduation year from April, including missed debug catchup", () => {
    const state = fixture();
    for (const year of [1, 2, 4, 6]) expect(collectThesisEventForMonth({ ...state, year }).event).toBeNull();
    for (const month of [0, 1, 7]) expect(collectThesisEventForMonth({ ...state, month }).event).toBeNull();
    for (const month of [8, 9, 10]) expect(collectThesisEventForMonth({ ...state, month }, () => 0).event).not.toBeNull();
    const random = vi.fn(() => { throw new Error("unexpected RNG"); });
    for (const phase of ["setup", "finished"] as const) {
      const inactive = { ...state, phase };
      expect(syncThesisState(inactive, random)).toBe(inactive);
      expect(prepareThesisBlindReview(inactive, random)).toBe(inactive);
      expect(collectThesisEventForMonth(inactive, random).event).toBeNull();
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("distinguishes ineligible and failed review, with current-degree June delay", () => {
    for (const submitted of [true, false]) {
      const state = { ...fixture("master", [0, 0]), totalResearchScore: submitted ? 10 : 0 };
      const event = collectThesisEventForMonth(state, () => 0).event!;
      const result = stages(event)[2]!;
      expect(result.description).toContain(submitted ? "结果：盲审未通过" : "结果：未能送审");
      expect(result.description).toContain("若五月没有转入博士培养");
      expect(result.description).toContain("六月");
      expect(result.description).toContain("延毕");
      expect(event.description).not.toContain("已提交");
    }
  });
});
