import { describe, expect, it, vi } from "vitest";
import { getConferenceInfo } from "../src/core/v2-conference-catalog";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper, getReviewStrictnessMultiplier } from "../src/core/v2-paper-rules";
import {
  applyPaperReviewSettlement,
  createPaperReviewResultEvent,
  projectPaperReviewSettlement,
  refreshPaperReviewEvent,
  refreshPaperReviewEvents,
  resolveDuePaperReviews,
} from "../src/core/v2-publication-system";
import type { GameState, PaperReviewSettlement, PendingEvent } from "../src/core/v2-types";

function fixture(accepted = false) {
  const paper = {
    ...createDraftPaper(1, 0, () => 0), status: "reviewing" as const, target: "A" as const,
    submittedMonth: 3, submittedYear: 1, reviewMonthsLeft: 0,
    submittedIdea: 30, submittedExperiment: 20, submittedWriting: 10,
    idea: 24, experiment: 23, writing: 8,
  };
  const conference = getConferenceInfo(3, "A", 1);
  const settlement: PaperReviewSettlement = {
    paperId: paper.id, target: "A", accepted, acceptType: accepted ? "Poster" : null,
    submittedScore: 60, totalReviewScore: 1, borderlineChance: 0.375,
    venueInfluence: conference.influence,
    reviewStrictnessMultiplier: getReviewStrictnessMultiplier("A", conference.influence),
    scoreGain: accepted ? 4 : 0, reviewerSanChange: -2,
    reports: [
      { reviewer: "Reviewer 1", focus: "idea", effectiveScore: 30, reviewScore: 1, decision: "Accept",
        improvements: { idea: 2, experiment: 1, writing: 3 }, sanChange: -2, baseSanChange: -2 },
      { reviewer: "Reviewer 2", focus: "experiment", effectiveScore: 20, reviewScore: 0, decision: "Borderline",
        improvementAction: "experiment", improvementAmount: 4 },
      { reviewer: "Reviewer 3", focus: "balanced", effectiveScore: 10, reviewScore: 0, decision: "Borderline" },
    ],
  };
  const state: GameState = { ...createStartedGameState("normal"), papers: [paper], eventQueue: [],
    month: 2, totalMonths: 2, buffs: [] };
  return { state, paper, settlement, conference };
}

function stages(event: PendingEvent) {
  const reviewers = event.choices[0]!.effects.enqueueEvents![0]!;
  const decision = reviewers.choices[0]!.effects.enqueueEvents![0]!;
  return { overview: event, reviewers, decision };
}

function decisionPresentation(event: PendingEvent) {
  const presentation = event.paperReviewPresentation;
  if (presentation?.kind !== "decision") throw new Error("Expected a review decision");
  return presentation;
}

function advance(state: GameState) {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
}

describe("paper review core presentation metadata", () => {
  it("uses catalog metadata and preserves the submission scores and fixed PC result", () => {
    const { state, paper, settlement, conference } = fixture();
    const chain = stages(createPaperReviewResultEvent(paper, settlement, state));
    expect(chain.overview.paperReviewPresentation).toMatchObject({
      conferenceName: conference.name, conferenceFullName: conference.fullName,
      conferenceYear: conference.year, field: conference.field, referenceScore: conference.referenceScore,
      venueInfluence: conference.influence, reviewStrictnessMultiplier: settlement.reviewStrictnessMultiplier,
    });
    expect(chain.reviewers.paperReviewPresentation).toMatchObject({
      target: "A", venueInfluence: conference.influence, submittedScore: 60,
      submittedScores: { idea: 30, experiment: 20, writing: 10 }, reports: settlement.reports,
    });
    expect(chain.decision.paperReviewPresentation).toMatchObject({ totalReviewScore: 1, borderlineChance: 0.375 });
    expect(chain.decision.choices[0]!.label).toBe("确定");
  });

  it.each([false, true])("separates changes during review from actual revision gains, accepted=%s", (accepted) => {
    const { state, paper, settlement } = fixture(accepted);
    const presentation = decisionPresentation(stages(createPaperReviewResultEvent(paper, settlement, state)).decision);
    const zero = { idea: 0, experiment: 0, writing: 0, total: 0 };
    expect(presentation.scoreChange).toEqual({
      submitted: { idea: 30, experiment: 20, writing: 10, total: 60 },
      beforeSettlement: { idea: 24, experiment: 23, writing: 8, total: 55 },
      afterSettlement: accepted ? { idea: 24, experiment: 23, writing: 8, total: 55 }
        : { idea: 26, experiment: 28, writing: 11, total: 65 },
      duringReviewChange: { idea: -6, experiment: 3, writing: -2, total: -5 },
      reviewerImprovement: accepted ? zero : { idea: 2, experiment: 5, writing: 3, total: 10 },
      settlementChange: accepted ? zero : { idea: 2, experiment: 5, writing: 3, total: 10 },
      totalChange: accepted ? { idea: -6, experiment: 3, writing: -2, total: -5 }
        : { idea: -4, experiment: 8, writing: 1, total: 5 },
    });
    const projected = projectPaperReviewSettlement(state, settlement);
    const actual = applyPaperReviewSettlement(state, settlement);
    for (const result of [projected, actual]) {
      const finalPaper = [...result.papers, ...result.externalPublications].find((entry) => entry.id === paper.id)!;
      expect(presentation.scoreChange.afterSettlement).toMatchObject({
        idea: finalPaper.idea, experiment: finalPaper.experiment, writing: finalPaper.writing,
      });
    }
    expect(decisionPresentation(stages(createPaperReviewResultEvent(paper, settlement)).decision).scoreChange)
      .toEqual(presentation.scoreChange);
  });

  it("refreshes nested score deltas when paper scores change with unchanged SAN", () => {
    const { state, paper, settlement } = fixture();
    const event = refreshPaperReviewEvent(state, createPaperReviewResultEvent(paper, settlement, state));
    const original = structuredClone(event);
    const changed = { ...state, papers: [{ ...paper, idea: 31, writing: 9 }] };
    const refreshed = refreshPaperReviewEvent(changed, event);
    const chain = stages(refreshed);
    expect(refreshed).not.toBe(event);
    expect(event).toEqual(original);
    expect(chain.decision.choices[0]!.effects.paperReviewSettlement)
      .toEqual(stages(event).decision.choices[0]!.effects.paperReviewSettlement);
    expect(decisionPresentation(chain.decision).scoreChange).toMatchObject({
      submitted: { idea: 30, experiment: 20, writing: 10, total: 60 },
      beforeSettlement: { idea: 31, experiment: 23, writing: 9, total: 63 },
      afterSettlement: { idea: 33, experiment: 28, writing: 12, total: 73 },
      duringReviewChange: { idea: 1, experiment: 3, writing: -1, total: 3 },
      totalChange: { idea: 3, experiment: 8, writing: 2, total: 13 },
    });
    expect(refreshPaperReviewEvent(changed, refreshed)).toBe(refreshed);
  });

  it("preserves the metadata and decision through a live SAN refresh", () => {
    const { state, paper, settlement } = fixture();
    const event = createPaperReviewResultEvent(paper, settlement, state);
    const changed = { ...state, buffs: [{ id: "debug-buff-illness", name: "疾病", source: "测试",
      timing: "monthly" as const, remainingMonths: 1, activeOperationSanMultiplier: 2 }] };
    const refreshed = stages(refreshPaperReviewEvent(changed, event));
    const original = stages(event);
    expect(refreshed.overview.paperReviewPresentation).toEqual(original.overview.paperReviewPresentation);
    expect(refreshed.reviewers.paperReviewPresentation).toMatchObject({
      target: "A", venueInfluence: settlement.venueInfluence, submittedScore: 60,
      submittedScores: { idea: 30, experiment: 20, writing: 10 },
    });
    expect(decisionPresentation(refreshed.decision)).toMatchObject({
      accepted: false, totalReviewScore: 1, borderlineChance: 0.375,
      scoreChange: decisionPresentation(original.decision).scoreChange,
    });
    expect(refreshed.decision.choices[0]!.effects.paperReviewSettlement?.reviewerSanChange).toBe(-4);
  });

  it.each([false, true])("does not mutate state or draw RNG while creating or refreshing previews, accepted=%s", (accepted) => {
    const { state, paper, settlement } = fixture(accepted);
    const snapshot = structuredClone(state);
    const settlementSnapshot = structuredClone(settlement);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Preview drew RNG"); });
    try {
      const event = createPaperReviewResultEvent(paper, settlement, state);
      refreshPaperReviewEvent(state, event);
      resolveDuePaperReviews(state, () => 0.99);
      expect(random).not.toHaveBeenCalled();
      expect(state).toEqual(snapshot);
      expect(settlement).toEqual(settlementSnapshot);
    } finally {
      random.mockRestore();
    }
  });

  it.each([false, true])("defers changes until confirmation and freezes historical snapshots, accepted=%s", (accepted) => {
    const { state, paper, settlement } = fixture(accepted);
    const queued = { ...state, eventQueue: [createEventQueueItem(createPaperReviewResultEvent(paper, settlement, state), 1)] };
    let pending = advance(advance(queued));
    expect(pending.papers).toEqual(state.papers);
    expect(pending.player).toEqual(state.player);
    expect(pending.totalResearchScore).toBe(state.totalResearchScore);
    expect(pending.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
    expect(pending.externalPublications).toEqual(state.externalPublications);
    pending = refreshPaperReviewEvents({ ...pending, papers: [{ ...paper, idea: 40 }] });
    const expected = decisionPresentation(pending.eventQueue[0]!).scoreChange;
    const confirmed = advance(pending);
    const history = confirmed.eventHistory.find((entry) => entry.chainId === queued.eventQueue[0]!.chainId)!;
    expect(history.stages.at(-1)?.paperReviewPresentation).toMatchObject({ scoreChange: expected });
    const historicalSnapshot = structuredClone(confirmed.eventHistory);
    const refreshed = refreshPaperReviewEvents({ ...confirmed,
      papers: confirmed.papers.map((entry) => ({ ...entry, idea: 999 })),
      externalPublications: confirmed.externalPublications.map((entry) => ({ ...entry, idea: 999 })),
    });
    expect(refreshed.eventHistory).toEqual(historicalSnapshot);
    expect(refreshed.eventHistory).toBe(confirmed.eventHistory);
  });
});
