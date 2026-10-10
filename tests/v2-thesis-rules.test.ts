import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import {
  advanceThesisResearchPoint, createInitialThesisState, getGraduationPreparationYear,
  getThesisAdvanceFailure, getThesisAdvanceSanCost, isGraduationPreparationUnlocked, prepareThesisBlindReview, syncThesisState,
} from "../src/core/v2-thesis-rules";
import { generatePaperTopic } from "../src/core/v2-paper-topics";
import type { Degree, GameState, Paper } from "../src/core/v2-types";

function fixture(degree: Degree = "master", month = 1): GameState {
  return {
    ...createInitialState(), phase: "playing", degree, year: degree === "master" ? 3 : 6,
    month, totalMonths: (degree === "master" ? 24 : 60) + month, buffs: [],
    player: { san: 20, research: 12.9, favor: 0, social: 0, money: 0 },
  };
}

function paper(id: string, score: number, topicId = "image-classification", extra: Partial<Paper> = {}): Paper {
  return {
    id, title: id, topicId, topicLabel: topicId, heatMultiplier: 1, prepublicationDecayRate: 0.1,
    idea: score / 2, experiment: score / 4, writing: score / 4, status: "published",
    target: "A", reviewMonthsLeft: 0, submittedIdea: null, submittedExperiment: null, submittedWriting: null,
    publication: { citations: 0, effectiveScore: 1, citationDebuffMultiplier: 1 }, ...extra,
  };
}

describe("thesis initialization and support", () => {
  it("uses accepted totals including collaboration exactly once, never decaying publication score", () => {
    const state = fixture();
    state.papers = [paper("conference", 90, "topic", {
      submittedIdea: 100, submittedExperiment: 50, submittedWriting: 50,
      submittedCollaborationScores: { idea: 40, experiment: 20, writing: 20 },
      collaborationScores: { idea: 10 },
    }), paper("journal", 150, "topic", {
      journalTarget: "nature", submittedIdea: 10, submittedExperiment: 10, submittedWriting: 10,
      collaborationScores: { idea: 30, experiment: 10 },
    })];
    const initialized = syncThesisState(state, () => 0);
    expect(initialized.thesis.researchPoints.map((point) => point.score)).toEqual([200, 150]);
    expect(initialized.thesis.researchPoints.map((point) => point.initialScore)).toEqual([200, 150]);
  });

  it.each(["master", "phd"] as const)("unlocks %s in graduation-year September", (degree) => {
    const state = fixture(degree);
    const random = vi.fn(() => 0);
    expect(getGraduationPreparationYear(degree)).toBe(degree === "master" ? 3 : 6);
    const previous = { ...state, year: state.year - 1, month: 12 };
    expect(isGraduationPreparationUnlocked(previous)).toBe(false);
    expect(syncThesisState(previous, random)).toBe(previous);
    expect(isGraduationPreparationUnlocked({ ...state, month: 0 })).toBe(false);
    expect(random).not.toHaveBeenCalled();
    expect(isGraduationPreparationUnlocked(state)).toBe(true);
    expect(syncThesisState(state, random).thesis.researchPoints).toHaveLength(degree === "master" ? 2 : 3);
  });

  it("selects the largest top-N sum of own first-author papers and deduplicates IDs", () => {
    const state = fixture();
    state.papers = [
      paper("a1", 110, "a"), paper("a2", 100, "a"), paper("b1", 150, "b"),
      paper("b2", 50, "b"), paper("b3", 40, "b"), paper("coauthor", 900, "c", { nonFirstAuthor: true }),
      paper("draft", 1000, "d", { status: "draft" }),
    ];
    state.externalPublications = [state.papers[2]!, paper("external", 5, "a")];
    const initialized = syncThesisState(state, () => 0);
    expect(initialized.thesis.topicId).toBe("a");
    expect(initialized.thesis.researchPoints.map((point) => point.score)).toEqual([110, 100]);
    expect(initialized.thesis.usedSupportPaperIds).toEqual(["a1", "a2"]);
    expect(syncThesisState({ ...state, degree: "phd", year: 6 }, () => 0).thesis.topicId).toBe("b");
    expect(state.thesis).toEqual(createInitialThesisState());
  });

  it("generates a real default topic once and fills missing points with zero", () => {
    const state = fixture("phd");
    const random = vi.fn(() => 0);
    const initialized = syncThesisState(state, random);
    expect(initialized.thesis.topicId).toBe(generatePaperTopic(2028, () => 0).topicId);
    expect(initialized.thesis.title).toContain(initialized.thesis.topicLabel);
    expect(initialized.thesis.researchPoints.map((point) => point.score)).toEqual([0, 0, 0]);
    expect(initialized.thesis.researchPoints.map((point) => point.initialScore)).toEqual([0, 0, 0]);
    random.mockClear();
    expect(syncThesisState(initialized, random)).toBe(initialized);
    expect(getThesisAdvanceFailure(initialized, 0)).toBeNull();
    expect(random).not.toHaveBeenCalled();
    const onePaper = syncThesisState({ ...state, papers: [paper("only", 70)] }, () => 0);
    expect(onePaper.thesis.researchPoints.map((point) => point.score)).toEqual([70, 0, 0]);
    expect(onePaper.thesis.researchPoints.map((point) => point.initialScore)).toEqual([70, 0, 0]);
  });

  it("replaces the weakest whole point only on strict improvement", () => {
    let state = syncThesisState({ ...fixture(), papers: [paper("old", 100), paper("strong", 200)] }, () => 0);
    state = advanceThesisResearchPoint(state, 1);
    expect(state.thesis.researchPoints[1]!.score).toBe(112);
    expect(state.thesis.researchPoints[1]!.initialScore).toBe(100);
    const same = { ...state, papers: [...state.papers, paper("equal", 112), paper("below", 111), paper("other", 300, "other")] };
    expect(syncThesisState(same)).toBe(same);
    state = syncThesisState({ ...same, papers: [...same.papers, paper("new", 113)] });
    expect(state.thesis.researchPoints.map((point) => point.score)).toEqual([200, 113]);
    expect(state.thesis.researchPoints.map((point) => point.initialScore)).toEqual([200, 113]);
    expect(state.thesis.researchPoints[1]!.supportPaperId).toBe("new");
    expect(state.thesis.topicId).toBe("image-classification");
    expect(getThesisAdvanceFailure(state, 1)).toContain("本月已推进");
    expect(state.thesis.usedSupportPaperIds).toEqual(["strong", "old", "new"]);
    const altered = { ...state, papers: state.papers.map((entry) => entry.id === "old" ? paper("old", 9999) : entry) };
    expect(syncThesisState(altered)).toBe(altered);
    expect(new Set(state.thesis.researchPoints.map((point) => point.supportPaperId)).size).toBe(2);
    const advanced = advanceThesisResearchPoint({ ...state, month: 2, totalMonths: state.totalMonths + 1 }, 1);
    expect(advanced.thesis.researchPoints[1]).toMatchObject({ score: 125, initialScore: 113, supportPaperId: "new" });
    expect(state.thesis.researchPoints[1]).toMatchObject({ score: 113, initialScore: 113 });
  });

  it("does not reuse a support paper for a second point or inflate on repeated refresh", () => {
    let state = syncThesisState({ ...fixture(), papers: [paper("only", 100)] }, () => 0);
    expect(syncThesisState(state)).toBe(state);
    state = syncThesisState({ ...state, papers: [...state.papers, paper("upgrade", 150)] });
    expect(state.thesis.researchPoints.map((point) => point.score)).toEqual([100, 150]);
    expect(syncThesisState(state)).toBe(state);
    const archived = { ...state, papers: [], externalPublications: state.papers };
    expect(syncThesisState(archived)).toBe(archived);
  });
});

describe("thesis direction replacement", () => {
  it.each(["master", "phd"] as const)("selects the strongest other-topic top-N total for %s, not the largest single paper", (degree) => {
    const state = syncThesisState({ ...fixture(degree), papers: [paper("old", 100, "old")] }, () => 0);
    const candidates = {
      ...state,
      papers: [...state.papers, paper("single", 250, "single"), paper("pair1", 140, "pair"), paper("pair2", 130, "pair"),
        paper("triple1", 100, "triple"), paper("triple2", 95, "triple"), paper("triple3", 90, "triple"),
        paper("triple4", 85, "triple")],
    };
    const random = vi.fn(() => 0.5);
    const next = syncThesisState(candidates, random);
    const expectedScores = degree === "master" ? [140, 130] : [100, 95, 90];
    const expectedTopic = degree === "master" ? "pair" : "triple";
    expect(next.thesis.topicId).toBe(expectedTopic);
    expect(next.thesis.topicLabel).toBe(expectedTopic);
    expect(next.thesis.title).toBe(`${expectedTopic}的方法设计与实验分析研究`);
    expect(next.thesis.researchPoints.map((point) => point.score)).toEqual(expectedScores);
    expect(next.thesis.researchPoints.map((point) => point.initialScore)).toEqual(expectedScores);
    expect(random).toHaveBeenCalledTimes(1);
    expect(syncThesisState(next, random)).toBe(next);
    expect(random).toHaveBeenCalledTimes(1);
    expect(state.thesis.topicId).toBe("old");
  });

  it.each([211, 212, 213])("compares candidate total %i against current scores including manual gains", (total) => {
    const state = syncThesisState({ ...fixture(), papers: [paper("old1", 100, "old"), paper("old2", 100, "old")] }, () => 0);
    const advanced = advanceThesisResearchPoint(state, 0);
    const candidates = { ...advanced, papers: [...advanced.papers, paper("new1", 110, "new"), paper("new2", total - 110, "new")] };
    const random = vi.fn(() => 0);
    const next = syncThesisState(candidates, random);
    if (total <= 212) {
      expect(next).toBe(candidates);
      expect(next.thesis.title).toBe(state.thesis.title);
      expect(random).not.toHaveBeenCalled();
    } else {
      expect(next.thesis.topicId).toBe("new");
      expect(next.thesis.researchPoints.map((point) => point.score)).toEqual([110, 103]);
      expect(next.thesis.researchPoints.map((point) => point.initialScore)).toEqual([110, 103]);
      expect(random).toHaveBeenCalledTimes(1);
    }
  });

  it("applies same-topic upgrades before comparing another direction and keeps the title without RNG", () => {
    const state = syncThesisState({ ...fixture(), papers: [paper("old1", 100, "old"), paper("old2", 100, "old")] }, () => 0);
    const candidates = { ...state, papers: [...state.papers, paper("upgrade", 200, "old"), paper("other1", 140, "other"), paper("other2", 130, "other")] };
    const random = vi.fn(() => 0.75);
    const next = syncThesisState(candidates, random);
    expect(next.thesis.topicId).toBe("old");
    expect(next.thesis.title).toBe(state.thesis.title);
    expect(next.thesis.researchPoints.map((point) => point.score)).toEqual([200, 100]);
    expect(next.thesis.researchPoints.map((point) => point.initialScore)).toEqual([200, 100]);
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["master", "phd"] as const)("resets %s points with zero padding while preserving monthly usage per index", (degree) => {
    const initialized = syncThesisState({ ...fixture(degree), papers: [paper("old", 100, "old")] }, () => 0);
    const previousMonth = advanceThesisResearchPoint(initialized, 0);
    const state = advanceThesisResearchPoint({ ...previousMonth, month: 2, totalMonths: previousMonth.totalMonths + 1 }, 1);
    const next = syncThesisState({ ...state, papers: [...state.papers, paper("new", 200, "new")] }, () => 0);
    const expectedScores = degree === "master" ? [200, 0] : [200, 0, 0];
    expect(next.thesis.researchPoints.map((point) => point.score)).toEqual(expectedScores);
    expect(next.thesis.researchPoints.map((point) => point.initialScore)).toEqual(expectedScores);
    expect(next.thesis.researchPoints.map((point) => point.lastAdvancedTotalMonths))
      .toEqual(state.thesis.researchPoints.map((point) => point.lastAdvancedTotalMonths));
    expect(next.thesis.researchPoints[0]).toMatchObject({ supportPaperId: "new", supportPaperTitle: "new" });
    expect(next.thesis.researchPoints[1]).toMatchObject({ supportPaperId: null, supportPaperTitle: null });
    expect(getThesisAdvanceFailure(next, 1)).toContain("本月已推进");
    expect(advanceThesisResearchPoint(next, 1)).toBe(next);
    expect(getThesisAdvanceFailure(next, 0)).toBeNull();
    expect(advanceThesisResearchPoint(next, 0).thesis.researchPoints[0]).toMatchObject({ score: 212, initialScore: 200 });
    if (degree === "phd") expect(getThesisAdvanceFailure(next, 2)).toBeNull();
    expect(next.player).toBe(state.player);
  });

  it("uses unique published first-author accepted totals across active and external papers", () => {
    const state = syncThesisState({ ...fixture(), papers: [paper("old", 300, "old")] }, () => 0);
    const conference = paper("conference", 90, "accepted", {
      submittedIdea: 100, submittedExperiment: 50, submittedWriting: 50,
      submittedCollaborationScores: { idea: 40, experiment: 20, writing: 20 },
    });
    const journal = paper("journal", 150, "accepted", {
      journalTarget: "nature", submittedIdea: 10, submittedExperiment: 10, submittedWriting: 10,
    });
    const duplicate = paper("duplicate", 250, "duplicate-topic");
    const next = syncThesisState({
      ...state, papers: [...state.papers, conference, duplicate, paper("coauthor", 9999, "coauthor", { nonFirstAuthor: true }),
        paper("draft", 9999, "draft", { status: "draft" })],
      externalPublications: [conference, journal, duplicate],
    }, () => 0);
    expect(next.thesis.topicId).toBe("accepted");
    expect(next.thesis.researchPoints.map((point) => point.score)).toEqual([200, 150]);
    expect(next.thesis.researchPoints.map((point) => point.initialScore)).toEqual([200, 150]);
    expect(next.thesis.usedSupportPaperIds).toEqual(["old", "conference", "journal"]);
  });

  it("can return to a historical direction with a new paper and never oscillates on refresh", () => {
    const initial = syncThesisState({ ...fixture(), papers: [paper("a1", 100, "a"), paper("a2", 90, "a")] }, () => 0);
    const random = vi.fn(() => 0);
    const switched = syncThesisState({ ...initial, papers: [...initial.papers, paper("b1", 110, "b"), paper("b2", 100, "b")] }, random);
    expect(switched.thesis.topicId).toBe("b");
    const returned = syncThesisState({ ...switched, papers: [...switched.papers, paper("a3", 130, "a")] }, random);
    expect(returned.thesis.topicId).toBe("a");
    expect(returned.thesis.researchPoints.map((point) => point.supportPaperId)).toEqual(["a3", "a1"]);
    expect(returned.thesis.researchPoints.map((point) => point.score)).toEqual([130, 100]);
    expect(returned.thesis.usedSupportPaperIds).toEqual(["a1", "a2", "b1", "b2", "a3"]);
    for (let refresh = 0; refresh < 3; refresh += 1) expect(syncThesisState(returned, random)).toBe(returned);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("takes the final direction switch into the review snapshot and freezes all later upgrades", () => {
    const state = syncThesisState({ ...fixture(), papers: [paper("old", 100, "old")] }, () => 0);
    const prepared = prepareThesisBlindReview({
      ...state, month: 8, totalMonths: state.totalMonths + 7,
      papers: [...state.papers, paper("new1", 150, "new"), paper("new2", 140, "new")],
      graduationScoreTarget: 10, totalResearchScore: 10,
    }, () => 0.5);
    expect(prepared.thesis.topicId).toBe("new");
    expect(prepared.thesis.review!.title).toBe(prepared.thesis.title);
    expect(prepared.thesis.review!.researchPoints.map((point) => point.initialScore)).toEqual([150, 140]);
    expect(prepared.thesis.review!.researchPoints).toEqual(prepared.thesis.researchPoints);
    const random = vi.fn(() => 0);
    for (const frozen of [
      prepared,
      { ...prepared, thesis: { ...prepared.thesis, review: null, reviewResolved: true } },
      { ...state, month: 9 },
    ]) {
      const candidates = { ...frozen, papers: [...frozen.papers, paper("late", 9999, "late")] };
      expect(syncThesisState(candidates, random)).toBe(candidates);
    }
    expect(random).not.toHaveBeenCalled();
  });
});

describe("thesis point advancement", () => {
  it.each(["master", "phd"] as const)("preserves %s baselines through advancement and an independent review snapshot", (degree) => {
    const initialized = syncThesisState({ ...fixture(degree), papers: [paper("support", 100)] }, () => 0);
    const first = advanceThesisResearchPoint(initialized, 0);
    const second = advanceThesisResearchPoint({ ...first, month: 2, totalMonths: first.totalMonths + 1 }, 0);
    const advanced = advanceThesisResearchPoint(second, 1);
    expect(initialized.thesis.researchPoints[0]).toMatchObject({ score: 100, initialScore: 100 });
    expect(advanced.thesis.researchPoints[0]).toMatchObject({ score: 124, initialScore: 100 });
    expect(advanced.thesis.researchPoints[1]).toMatchObject({ score: 12, initialScore: 0 });
    const prepared = prepareThesisBlindReview({
      ...advanced, month: 8, totalMonths: advanced.totalMonths + 6,
      graduationScoreTarget: 10, totalResearchScore: 10,
    }, () => 0);
    const review = prepared.thesis.review!;
    expect(review.submitted).toBe(true);
    expect(review.researchPoints).toEqual(advanced.thesis.researchPoints);
    expect(review.researchPoints).not.toBe(prepared.thesis.researchPoints);
    expect(review.researchPoints[0]).not.toBe(prepared.thesis.researchPoints[0]);
    prepared.thesis.researchPoints[0]!.score = 999;
    prepared.thesis.researchPoints[0]!.initialScore = 999;
    expect(review.researchPoints[0]).toMatchObject({ score: 124, initialScore: 100 });
    expect(review.researchPoints[1]).toMatchObject({ score: 12, initialScore: 0 });
  });

  it.each([1, 2, 3, 4, 5, 6, 7])("permits writing in month %i without AP and rounds research down", (month) => {
    const state = syncThesisState(fixture("master", month), () => 0);
    state.actionState = { ...state.actionState, used: state.actionState.limit };
    const next = advanceThesisResearchPoint(state, 0);
    expect(next.thesis.researchPoints[0]!.score).toBe(12);
    expect(next.player.san).toBe(20 - (month === 7 ? 2 : 3));
    expect(next.actionState).toEqual(state.actionState);
    expect(advanceThesisResearchPoint(next, 0)).toBe(next);
    expect(advanceThesisResearchPoint(next, 1).thesis.researchPoints[1]!.score).toBe(12);
    const later = { ...next, month: month + 1, totalMonths: next.totalMonths + 1 };
    if (month < 7) expect(advanceThesisResearchPoint(later, 0).thesis.researchPoints[0]!.score).toBe(24);
  });

  it.each([8, 9, 10, 11, 12])("disallows writing in month %i", (month) => {
    const state = syncThesisState(fixture("phd", month), () => 0);
    expect(getThesisAdvanceFailure(state, 0)).not.toBeNull();
    expect(advanceThesisResearchPoint(state, 0)).toBe(state);
  });

  it("does not cap point scores at the old progress limit or discount SAN by research tier", () => {
    const state = syncThesisState({ ...fixture(), papers: [paper("high", 490)] }, () => 0);
    state.player.research = 20;
    state.player.san = 1;
    expect(getThesisAdvanceSanCost(state)).toBe(3);
    expect(getThesisAdvanceFailure(state, 0)).toBeNull();
    const next = advanceThesisResearchPoint(state, 0);
    expect(next.thesis.researchPoints[0]!.score).toBe(510);
    expect(next.player.san).toBe(-2);
    expect(next.ending).toBeNull();
    state.buffs = [{ id: "cost", name: "cost", source: "test", timing: "monthly", remainingMonths: 1, activeOperationSanMultiplier: 2 }];
    expect(getThesisAdvanceSanCost(state)).toBe(6);
    expect(getThesisAdvanceSanCost({ ...state, month: 7 })).toBe(5);
  });

  it("rejects invalid indices, uninitialized state, and non-playing phase without drawing RNG", () => {
    const state = syncThesisState(fixture(), () => 0);
    const uninitialized = fixture();
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("unexpected RNG"); });
    try {
      for (const index of [-1, 0.5, 2, NaN]) expect(advanceThesisResearchPoint(state, index)).toBe(state);
      expect(getThesisAdvanceFailure(uninitialized, 0)).not.toBeNull();
      expect(advanceThesisResearchPoint({ ...state, phase: "setup" }, 0).thesis).toBe(state.thesis);
      expect(advanceThesisResearchPoint(state, 0).thesis.researchPoints[0]!.score).toBe(12);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
