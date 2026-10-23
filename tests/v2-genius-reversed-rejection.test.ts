import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyRejectedPaperReview, resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { settleRoleTalentPaperRejection } from "../src/core/v2-role-talent-lifecycle";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, Paper } from "../src/core/v2-types";

function fixture(degree: GameState["degree"] = "master"): GameState {
  const initial = createStartedGameState("genius-reversed");
  const paper = { ...createDraftPaper(1, 0), idea: 1, experiment: 2, writing: 3 };
  return { ...initial, degree, month: 1, year: 1, totalMonths: 1, eventQueue: [],
    sanCap: 60, player: { san: 60, money: 10, research: 0, social: 6, favor: 6 },
    papers: [paper], selectedPaperId: paper.id,
    roleTalents: { initialized: true, levels: { "paper-opening": 1, "knowledge-monetization": 2,
      "research-wellness": 1, "learning-from-rejection": 3 } } };
}

function submitAndOpenReview(state: GameState, roll = 0.99) {
  const submitted = dispatchAction(state, "submit-paper", { paperId: state.papers[0]!.id, paperTarget: "A" });
  expect(submitted.papers[0]?.status).toBe("reviewing");
  const submittedPaper = submitted.papers[0]!;
  const ready = { ...submitted, papers: submitted.papers.map(paper => ({ ...paper, reviewMonthsLeft: 0 })) };
  const pending = resolveDuePaperReviews(ready, () => roll).state;
  return { submittedPaper, pending };
}

function advanceReviewToPc(state: GameState) {
  const first = state.eventQueue.find(event => event.source === "review")!;
  const secondState = dispatchAction(state, "resolve-event", { eventId: first.id, eventChoiceId: first.choices[0]!.id });
  const reviewerEvent = secondState.eventQueue.find(event => event.chainId === first.chainId)!;
  const finalState = dispatchAction(secondState, "resolve-event", { eventId: reviewerEvent.id, eventChoiceId: reviewerEvent.choices[0]!.id });
  const finalEvent = finalState.eventQueue.find(event => event.chainId === first.chainId)!;
  return { finalState, finalEvent, reviewerEvent };
}

function confirmReview(state: GameState) {
  const { finalState, finalEvent } = advanceReviewToPc(state);
  return dispatchAction(finalState, "resolve-event", { eventId: finalEvent.id, eventChoiceId: "confirm-review-result" });
}

function expectScoreReward(state: GameState, submittedPaper: Paper, gain = 3) {
  const paper = state.papers[0]!;
  expect(paper.lastReview?.accepted).toBe(false);
  const feedbackOnly = applyRejectedPaperReview(submittedPaper, paper.lastReview!);
  expect(paper).toMatchObject({ status: "draft", rejectionCount: feedbackOnly.rejectionCount,
    idea: feedbackOnly.idea + gain, experiment: feedbackOnly.experiment + gain, writing: feedbackOnly.writing + gain });
}

describe("genius reversed confirmed rejection talents", () => {
  it("grants first-rejection SAN independently of research growth, only once and only before PhD", () => {
    const baseline = fixture();
    baseline.player = { ...baseline.player, san: 15, research: 20 };
    baseline.roleTalents!.levels["work-life-balance"] = 1;
    const submitted = submitAndOpenReview(baseline);
    const control = confirmReview({ ...submitted.pending, roleTalents: { ...submitted.pending.roleTalents!,
      levels: { ...submitted.pending.roleTalents!.levels, "work-life-balance": 0 } } });
    const after = confirmReview(submitted.pending);
    expect(after.sanCap).toBe(baseline.sanCap + 1);
    expect(after.player.san).toBe(control.player.san + 4);
    expect(after.player.research).toBe(20);
    expect(after.achievementProgress?.counters["san-cap-gain"]).toBe(1);
    const saved: GameState = JSON.parse(JSON.stringify(after));
    expect(settleRoleTalentPaperRejection(saved, submitted.submittedPaper)).toEqual(saved);
    const repeated = submitAndOpenReview(saved);
    const repeatControl = confirmReview({ ...repeated.pending, roleTalents: { ...repeated.pending.roleTalents!,
      levels: { ...repeated.pending.roleTalents!.levels, "work-life-balance": 0 } } });
    const repeatAfter = confirmReview(repeated.pending);
    expect(repeatAfter.player.san).toBe(repeatControl.player.san);
    expect(repeatAfter.sanCap).toBe(after.sanCap);
    const doctorate = submitAndOpenReview({ ...baseline, degree: "phd" });
    expect(confirmReview(doctorate.pending).sanCap).toBe(baseline.sanCap);
  });

  it("uses rank-four money and score rewards and leaves unconfirmed SAN untouched", () => {
    const before = fixture();
    before.player.san = 10;
    before.roleTalents!.levels = { "knowledge-monetization": 4, "learning-from-rejection": 4, "work-life-balance": 1 };
    const { pending, submittedPaper } = submitAndOpenReview(before);
    const preview = advanceReviewToPc(pending);
    expect(preview.finalState.sanCap).toBe(before.sanCap);
    expect(preview.finalState.player.san).toBe(before.player.san);
    const after = confirmReview(pending);
    expect(after.player.money).toBe(before.player.money + 4);
    expect(after.sanCap).toBe(before.sanCap + 1);
    expectScoreReward(after, submittedPaper, 4);
  });

  it("retains r39 rejection scores, income and growth-based SAN for old recordings", () => withGameplayRuleset("20261023-r39", () => {
    const before = fixture();
    before.roleTalents!.levels["work-life-balance"] = 1;
    const { pending, submittedPaper } = submitAndOpenReview(before);
    const after = confirmReview(pending);
    expectScoreReward(after, submittedPaper, 6);
    expect(after.player.money).toBe(14);
    expect(after.sanCap).toBe(before.sanCap + 1);
  }));

  it("defers rewards until act three and adds repeat score rewards without repeating first-rejection income or research", () => {
    const initial = fixture();
    const { pending, submittedPaper } = submitAndOpenReview(initial);
    const { finalState, finalEvent } = advanceReviewToPc(pending);
    for (const unconfirmed of [pending, finalState]) {
      expect(unconfirmed.player.money).toBe(10);
      expect(unconfirmed.player.research).toBe(0);
      expect(unconfirmed.papers[0]).toMatchObject({ idea: 1, experiment: 2, writing: 3, status: "reviewing" });
      expect(unconfirmed.roleTalents?.rejectedPaperRewardIds).toBeUndefined();
      expect(unconfirmed.roleTalents?.rejectionRewardKeys).toBeUndefined();
    }
    const confirmed = dispatchAction(finalState, "resolve-event", { eventId: finalEvent.id, eventChoiceId: "confirm-review-result" });
    expectScoreReward(confirmed, submittedPaper);
    expect(confirmed.player.money).toBe(12);
    expect(confirmed.player.research).toBe(1);

    const restored: GameState = JSON.parse(JSON.stringify(confirmed));
    expect(settleRoleTalentPaperRejection(restored, submittedPaper)).toEqual(restored);
    const again = submitAndOpenReview(restored);
    const twice = confirmReview(again.pending);
    expectScoreReward(twice, again.submittedPaper);
    expect(twice.player.money).toBe(12);
    expect(twice.player.research).toBe(1);
    expect(twice.roleTalents?.rejectedPaperRewardIds).toEqual([submittedPaper.id]);
    expect(twice.roleTalents?.rejectionRewardKeys).toEqual([`${submittedPaper.id}:1`, `${submittedPaper.id}:2`]);
    const roundTrip: GameState = JSON.parse(JSON.stringify(twice));
    expect(settleRoleTalentPaperRejection(roundTrip, again.submittedPaper)).toEqual(roundTrip);
  });

  it("adds all three talent scores to expert feedback and rewards the first rejection of each distinct paper", () => {
    const first = submitAndOpenReview(fixture(), 0.65);
    expect(advanceReviewToPc(first.pending).reviewerEvent.description).toContain("资深审稿人");
    const confirmed = confirmReview(first.pending);
    expectScoreReward(confirmed, first.submittedPaper);
    expect(confirmed.papers[0]).toMatchObject({ idea: 34, experiment: 5, writing: 6 });
    const secondPaper = { ...createDraftPaper(2, 0), idea: 1, experiment: 2, writing: 3 };
    const next = submitAndOpenReview({ ...confirmed, papers: [secondPaper], selectedPaperId: secondPaper.id });
    const secondConfirmed = confirmReview(next.pending);
    expect(secondConfirmed.player.money).toBe(14);
    expect(secondConfirmed.player.research).toBe(2);
    expect(secondConfirmed.roleTalents?.rejectedPaperRewardIds).toEqual([first.submittedPaper.id, secondPaper.id]);
  });

  it("keeps the per-rejection score reward during a doctorate without master-only first-rejection rewards", () => {
    const { pending, submittedPaper } = submitAndOpenReview(fixture("phd"));
    const confirmed = confirmReview(pending);
    expectScoreReward(confirmed, submittedPaper);
    expect(confirmed.player.money).toBe(10);
    expect(confirmed.player.research).toBe(0);
    expect(confirmed.roleTalents?.rejectedPaperRewardIds).toBeUndefined();
  });

  it.each([{ nonFirstAuthor: true }, { leadAuthorId: "fellow-1" }])("does not reward non-player first authorship: %j", authorship => {
    const submitted = submitAndOpenReview(fixture());
    const pending = { ...submitted.pending, papers: submitted.pending.papers.map(paper => ({ ...paper, ...authorship })) };
    const confirmed = confirmReview(pending);
    expectScoreReward(confirmed, { ...submitted.submittedPaper, ...authorship }, 0);
    expect(confirmed.player.money).toBe(10);
    expect(confirmed.player.research).toBe(0);
    expect(confirmed.roleTalents?.rejectionRewardKeys).toBeUndefined();
    expect(confirmed.roleTalents?.rejectedPaperRewardIds).toBeUndefined();
  });
});
