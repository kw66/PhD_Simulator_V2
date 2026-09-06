import { describe, expect, it } from "vitest";

import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { applyPrepublicationPaperDecay, createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import {
  advancePaperReviewDeadlines,
  getPaperCitationMultiplierBreakdown,
  resolveDuePaperReviews,
  settlePublishedPaperCitations,
} from "../src/core/v2-publication-system";
import type { GameState } from "../src/core/v2-types";

function advanceReviewToPc(state: GameState): { state: GameState; reviewerEvent: GameState["eventQueue"][number]; finalEvent: GameState["eventQueue"][number] } {
  let next = state;
  const first = next.eventQueue[0]!;
  next = dispatchAction(next, "resolve-event", { eventId: first.id, eventChoiceId: first.choices[0]!.id });
  const reviewerEvent = next.eventQueue[0]!;
  next = dispatchAction(next, "resolve-event", { eventId: reviewerEvent.id, eventChoiceId: reviewerEvent.choices[0]!.id });
  return { state: next, reviewerEvent, finalEvent: next.eventQueue[0]! };
}

function confirmReview(state: GameState): GameState {
  const advanced = advanceReviewToPc(state);
  return dispatchAction(advanced.state, "resolve-event", {
    eventId: advanced.finalEvent.id,
    eventChoiceId: "confirm-review-result",
  });
}

describe("v2 publication loop", () => {
  it("submits a completed draft into a three-month review", () => {
    const draft = {
      ...createDraftPaper(1, 0),
      idea: 3,
      experiment: 3,
      writing: 3,
    };
    const state = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 1,
      totalMonths: 1,
      eventQueue: [],
      papers: [draft],
      selectedPaperId: draft.id,
    };

    const next = dispatchAction(state, "submit-paper", { paperId: draft.id, paperTarget: "C" });
    expect(next.papers[0]).toMatchObject({
      status: "reviewing",
      target: "C",
      reviewMonthsLeft: 3,
      submittedIdea: 3,
      submittedExperiment: 3,
      submittedWriting: 3,
    });
    expect(next.log[0]?.text).toContain("进入 3 个月审稿期");
  });

  it("withdraws a reviewing paper through the public action dispatcher", () => {
    const draft = {
      ...createDraftPaper(1, 0, () => 0),
      idea: 6,
      experiment: 5,
      writing: 4,
    };
    const state = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 1,
      totalMonths: 1,
      eventQueue: [],
      papers: [draft],
      selectedPaperId: draft.id,
    };
    const submitted = dispatchAction(state, "submit-paper", { paperId: draft.id, paperTarget: "B" });
    const withdrawn = dispatchAction(submitted, "withdraw-paper", { paperId: draft.id });

    expect(withdrawn.papers[0]).toMatchObject({
      status: "draft",
      target: null,
      idea: 6,
      experiment: 5,
      writing: 4,
    });
    expect(withdrawn.log[0]?.text).toContain("撤稿");
  });

  it("resolves a due review and awards the target research score", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 8,
      experiment: 8,
      writing: 8,
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 1,
      submittedIdea: 8,
      submittedExperiment: 8,
      submittedWriting: 8,
      submittedMonth: 1,
      submittedYear: 1,
    };
    let state: GameState = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 2,
      totalMonths: 2,
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
      player: { ...createStartedGameState("normal").player, san: 10 },
    };
    state = advancePaperReviewDeadlines(state);
    expect(state.papers[0]).toMatchObject({ idea: 8, experiment: 8, writing: 8 });
    const result = resolveDuePaperReviews(state, () => 0);
    expect(result.state.papers).toHaveLength(1);
    expect(result.state.eventQueue[0]?.title).toBe("论文结果");
    expect(result.state.eventQueue[0]?.description).toContain("本年会议概况");
    expect(result.state.eventQueue[0]?.paperReviewPresentation).toMatchObject({
      kind: "overview",
      paperTitle: paper.title,
      target: "C",
    });
    const advanced = advanceReviewToPc(result.state);
    expect(advanced.finalEvent.title).toContain("PC 最终决定");
    expect(advanced.reviewerEvent.paperReviewPresentation?.kind).toBe("reviewers");
    expect(advanced.finalEvent.paperReviewPresentation?.kind).toBe("decision");
    const confirmed = confirmReview(result.state);
    expect(confirmed.papers).toHaveLength(0);
    expect(confirmed.externalPublications[0]?.status).toBe("published");
    expect(confirmed.externalPublications[0]).toMatchObject({
      conferenceHandled: false,
      conferenceAvailableAtTotalMonths: confirmed.totalMonths + 3,
    });
    expect(confirmed.externalPublications[0]?.publication?.effectiveScore).toBe(24);
    expect(confirmed.externalPublications[0]?.lastReview?.reports).toHaveLength(3);
    expect(confirmed.eventHistory.at(-1)?.stages.map((stage) => stage.paperReviewPresentation?.kind)).toEqual([
      "overview",
      "reviewers",
      "decision",
    ]);
    expect(confirmed.totalResearchScore).toBe(1);
    expect(confirmed.player.san).toBe(14);
    expect(confirmed.publicationTalentState?.claimedIds).toEqual(["first-paper"]);
    expect(confirmed.log.some((entry) => entry.text.includes("C类会议接收"))).toBe(true);
    expect(confirmed.log.at(-1)?.text).toBe("发表天赋完成：首发论文；SAN+2、好感+1、科研+1");
  });

  it("releases a review-result chain back to a draft when force-advancing", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 8,
      experiment: 8,
      writing: 8,
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 8,
      submittedExperiment: 8,
      submittedWriting: 8,
      submittedMonth: 1,
      submittedYear: 1,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 2,
      totalMonths: 2,
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const queued = resolveDuePaperReviews(state, () => 0).state;
    expect(queued.eventQueue[0]?.title).toBe("论文结果");

    const forced = dispatchAction(queued, "force-next-month");
    expect(forced.papers[0]).toMatchObject({
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
      publication: null,
      lastReview: null,
    });
    expect(forced.eventQueue.some((event) => event.id.startsWith("paper-review-result-"))).toBe(false);
  });

  it("does not apply a second decay when an already-decayed paper is rejected", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 10,
      experiment: 20,
      writing: 5,
      prepublicationDecayRate: 0.1,
      status: "reviewing" as const,
      target: "A" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 10,
      submittedExperiment: 20,
      submittedWriting: 5,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const decayed = applyPrepublicationPaperDecay(state);
    const result = resolveDuePaperReviews(decayed, () => 0.99);
    const confirmed = confirmReview(result.state);

    expect(decayed.papers[0]).toMatchObject({ idea: 9, experiment: 18, writing: 4 });
    expect(confirmed.papers[0]).toMatchObject({ status: "draft", idea: 9, experiment: 18, writing: 4 });
  });

  it("turns a rejection into concrete revision growth from an expert reviewer", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 1,
      experiment: 1,
      writing: 1,
      status: "reviewing" as const,
      target: "A" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 1,
      submittedExperiment: 1,
      submittedWriting: 1,
      submittedMonth: 1,
      submittedYear: 1,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const result = resolveDuePaperReviews(state, () => 0.65);
    const advanced = advanceReviewToPc(result.state);
    expect(advanced.state.eventHistory).toHaveLength(0);
    expect(advanced.reviewerEvent.description).toContain("资深审稿人");
    const confirmed = confirmReview(result.state);
    expect(confirmed.papers[0]).toMatchObject({ status: "draft", idea: 31, experiment: 1, writing: 1 });
    expect(confirmed.papers[0]?.lastReview?.accepted).toBe(false);
  });

  it("lets a strict reviewer improve the two weakest dimensions", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 1,
      experiment: 1,
      writing: 10,
      status: "reviewing" as const,
      target: "A" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 1,
      submittedExperiment: 1,
      submittedWriting: 10,
      submittedMonth: 1,
      submittedYear: 1,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const rolls = [0.85, 0.95, 0.95];
    const result = resolveDuePaperReviews(state, () => rolls.shift() ?? 0.95);
    const advanced = advanceReviewToPc(result.state);
    expect(advanced.reviewerEvent.description).toContain("严格审稿人");
    expect(advanced.reviewerEvent.description).toContain("idea +3、实验 +3");
    const confirmed = confirmReview(result.state);
    expect(confirmed.papers[0]).toMatchObject({ status: "draft", idea: 4, experiment: 4, writing: 10 });
  });

  it("reduces SAN reward after publishing a same-level paper", () => {
    const prior = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0),
      status: "published" as const,
      target: "C" as const,
      submittedMonth: 1,
      submittedYear: 1,
      idea: 8,
      experiment: 8,
      writing: 8,
      submittedIdea: 8,
      submittedExperiment: 8,
      submittedWriting: 8,
    }, 1, "Poster", 0.35);
    const paper = {
      ...createDraftPaper(2, 1),
      idea: 8,
      experiment: 8,
      writing: 8,
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 8,
      submittedExperiment: 8,
      submittedWriting: 8,
      submittedMonth: 1,
      submittedYear: 1,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      externalPublications: [prior],
      publicationTalentState: { claimedIds: ["first-paper"] },
      selectedPaperId: paper.id,
      player: { ...createStartedGameState("normal").player, san: 10 },
    };
    const result = resolveDuePaperReviews(state, () => 0);
    const advanced = advanceReviewToPc(result.state);
    const confirmed = confirmReview(result.state);
    expect(advanced.finalEvent.description).toContain("同级或更高等级");
    expect(confirmed.player.san).toBe(11);
  });

  it("applies reviewer pressure on rejection confirmation", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 1,
      experiment: 1,
      writing: 1,
      status: "reviewing" as const,
      target: "A" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 1,
      submittedExperiment: 1,
      submittedWriting: 1,
      submittedMonth: 1,
      submittedYear: 1,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
      player: { ...createStartedGameState("normal").player, san: 10 },
    };
    const result = resolveDuePaperReviews(state, () => 0.95);
    const advanced = advanceReviewToPc(result.state);
    const confirmed = confirmReview(result.state);
    expect(advanced.reviewerEvent.description).toContain("恶意审稿人");
    expect(confirmed.player.san).toBe(4);
  });

  it("archives an accepted paper and immediately reuses the freed workstation slot", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 8,
      experiment: 8,
      writing: 8,
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 8,
      submittedExperiment: 8,
      submittedWriting: 8,
      submittedMonth: 1,
      submittedYear: 1,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      totalMonths: 2,
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const resolved = resolveDuePaperReviews(state, () => 0);
    const confirmed = confirmReview(resolved.state);
    const next = dispatchAction(confirmed, "create-paper", { paperSlotIndex: 0 });

    expect(confirmed.papers).toHaveLength(0);
    expect(confirmed.externalPublications).toHaveLength(1);
    expect(next.papers).toHaveLength(1);
    expect(next.papers[0]?.status).toBe("draft");
  });

  it("carries a paper-specific draft citation penalty into the archived publication", () => {
    const paper = {
      ...createDraftPaper(1, 0),
      idea: 8,
      experiment: 8,
      writing: 8,
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 8,
      submittedExperiment: 8,
      submittedWriting: 8,
      citationDebuffMultiplierOnPublish: 0.5,
    };
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
    };
    const result = resolveDuePaperReviews(state, () => 0);
    const confirmed = confirmReview(result.state);

    expect(confirmed.externalPublications[0]?.publication?.citationDebuffMultiplier).toBe(0.5);
    expect(confirmed.externalPublications[0]?.publication?.effectiveScore).toBe(24);
  });

  it("settles published citations every month and records the calendar year", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 34,
      experiment: 33,
      writing: 33,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 34,
      submittedExperiment: 33,
      submittedWriting: 33,
      conferenceHandled: true,
    });
    const state = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 2,
      totalMonths: 2,
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const firstMonth = settlePublishedPaperCitations(state);
    expect(firstMonth.changes).toEqual([{ title: paper.title, amount: 5 }]);
    expect(firstMonth.state.papers[0]?.publication).toMatchObject({
      citations: 5,
      effectiveScore: 100,
      monthsSincePublish: 1,
    });
    const result = settlePublishedPaperCitations(firstMonth.state);
    expect(result.changes).toEqual([{ title: paper.title, amount: 6 }]);
    expect(result.state.papers[0]?.publication?.citations).toBe(11);
    expect(result.state.papers[0]?.publication?.monthsSincePublish).toBe(2);
    expect(result.state.totalCitations).toBe(11);
    expect(result.state.citationHistoryByYear[2023]).toBe(11);
  });

  it("settles each paper every month regardless of its publication age", () => {
    const createPublishedPaper = (index: number, monthsSincePublish: number) => {
      const paper = attachPaperPublication({
        ...createDraftPaper(1, index),
        heatMultiplier: 1,
        idea: 34,
        experiment: 33,
        writing: 33,
        status: "published" as const,
        target: "A" as const,
        submittedIdea: 34,
        submittedExperiment: 33,
        submittedWriting: 33,
        conferenceHandled: true,
      });
      return {
        ...paper,
        publication: paper.publication ? { ...paper.publication, monthsSincePublish } : null,
      };
    };
    const newPaper = createPublishedPaper(0, 0);
    const oneMonthOldPaper = createPublishedPaper(1, 4);
    const state: GameState = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 2,
      totalMonths: 2,
      eventQueue: [],
      papers: [newPaper, oneMonthOldPaper],
      selectedPaperId: newPaper.id,
    };

    const result = settlePublishedPaperCitations(state).state;
    expect(result.papers[0]?.publication).toMatchObject({ monthsSincePublish: 1, effectiveScore: 100, citations: 5 });
    expect(result.papers[1]?.publication).toMatchObject({ monthsSincePublish: 5, effectiveScore: 100, citations: 5 });
  });

  it("keeps poster lifetime citations high for A papers and mostly single-digit for ordinary C papers", () => {
    const aPaper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 24,
      experiment: 23,
      writing: 23,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 24,
      submittedExperiment: 23,
      submittedWriting: 23,
      conferenceHandled: true,
    }, 1, "Poster", 1.4);
    const cPaper = attachPaperPublication({
      ...createDraftPaper(1, 1),
      heatMultiplier: 1,
      idea: 10,
      experiment: 10,
      writing: 10,
      status: "published" as const,
      target: "C" as const,
      submittedIdea: 10,
      submittedExperiment: 10,
      submittedWriting: 10,
      conferenceHandled: true,
    }, 1, "Poster", 0.3);
    let state: GameState = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 1,
      totalMonths: 1,
      eventQueue: [],
      papers: [aPaper, cPaper],
      selectedPaperId: aPaper.id,
    };

    for (let month = 0; month < 100; month += 1) {
      state = settlePublishedPaperCitations(state).state;
    }

    expect(state.papers[0]?.publication).toMatchObject({ effectiveScore: 0, citations: 164 });
    expect(state.papers[1]?.publication).toMatchObject({ effectiveScore: 0, citations: 13 });
  });

  it("uses heat as a direct monthly citation multiplier while scores decay every four months by ten percent", () => {
    const createPaperAtHeat = (heatMultiplier: number) => attachPaperPublication({
      ...createDraftPaper(1, heatMultiplier),
      heatMultiplier,
      idea: 36,
      experiment: 35,
      writing: 35,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 36,
      submittedExperiment: 35,
      submittedWriting: 35,
      conferenceHandled: true,
    }, 1, "Poster", 1);
    const coolPaper = createPaperAtHeat(1);
    const hotPaper = createPaperAtHeat(2);
    const state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [coolPaper, hotPaper],
      selectedPaperId: coolPaper.id,
    };

    const firstMonth = settlePublishedPaperCitations(state).state;
    expect(firstMonth.papers[0]?.publication).toMatchObject({ effectiveScore: 106, citations: 5, monthsSincePublish: 1 });
    expect(firstMonth.papers[1]?.publication).toMatchObject({ effectiveScore: 106, citations: 10, monthsSincePublish: 1 });
    const secondMonth = settlePublishedPaperCitations(firstMonth).state;
    expect(secondMonth.papers[0]?.publication).toMatchObject({ effectiveScore: 106, citations: 10, monthsSincePublish: 2 });
    expect(secondMonth.papers[1]?.publication).toMatchObject({ effectiveScore: 106, citations: 21, monthsSincePublish: 2 });
    const thirdMonth = settlePublishedPaperCitations(secondMonth).state;
    expect(thirdMonth.papers[0]?.publication).toMatchObject({ effectiveScore: 106, citations: 15, monthsSincePublish: 3 });
    expect(thirdMonth.papers[1]?.publication).toMatchObject({ effectiveScore: 106, citations: 31, monthsSincePublish: 3 });
    const fourthMonth = settlePublishedPaperCitations(thirdMonth).state;
    expect(fourthMonth.papers[0]?.publication).toMatchObject({ effectiveScore: 95, citations: 21, monthsSincePublish: 4 });
    expect(fourthMonth.papers[1]?.publication).toMatchObject({ effectiveScore: 95, citations: 42, monthsSincePublish: 4 });
  });

  it("awards highly cited status after twelve months using the frozen publication heat threshold", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 0.7,
      idea: 0,
      experiment: 0,
      writing: 0,
      status: "published" as const,
      target: "C" as const,
      submittedIdea: 0,
      submittedExperiment: 0,
      submittedWriting: 0,
      conferenceHandled: true,
    });
    paper.publication!.citations = 140;
    paper.publication!.monthsSincePublish = 11;
    paper.heatMultiplier = 1.5;

    const settled = settlePublishedPaperCitations({
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    }).state;

    expect(settled.papers[0]?.publication).toMatchObject({
      highlyCitedThreshold: 140,
      highlyCited: true,
      monthsSincePublish: 12,
    });
  });

  it("supports arXiv while a conference paper is awaiting exposure", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      idea: 4,
      experiment: 4,
      writing: 4,
      status: "published" as const,
      target: "C" as const,
      submittedIdea: 4,
      submittedExperiment: 4,
      submittedWriting: 4,
      conferenceHandled: false,
    });
    const state = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
      player: { ...createStartedGameState("normal").player, san: 10 },
    };
    const next = dispatchAction(state, "promote-paper", { paperId: paper.id, promotionId: "arxiv" });
    expect(next.player.san).toBe(8);
    expect(next.papers[0]?.publication?.promotions?.arxiv).toBe(true);
    expect(next.papers[0]?.publication?.preprintExposed).toBe(true);
    expect(next.papers[0]?.publication?.citationDebuffMultiplier).toBe(1);
  });

  it("uses current score for the GitHub promotion and charges four SAN", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      idea: 8,
      experiment: 7,
      writing: 5,
      status: "published" as const,
      target: "B" as const,
      submittedIdea: 8,
      submittedExperiment: 7,
      submittedWriting: 5,
      conferenceHandled: true,
    });
    const state = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
      player: { ...createStartedGameState("normal").player, san: 10 },
    };
    const next = dispatchAction(state, "promote-paper", { paperId: paper.id, promotionId: "github" });
    expect(next.player.san).toBe(6);
    expect(next.papers[0]?.publication?.effectiveScore).toBe(25);
    expect(next.papers[0]?.publication?.citationDebuffMultiplier).toBe(1);
  });

  it("keeps promotion and citation debuffs in independent multiplier zones", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 2,
      idea: 20,
      experiment: 20,
      writing: 20,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 20,
      submittedExperiment: 20,
      submittedWriting: 20,
      citationDebuffMultiplierOnPublish: 0.5,
      conferenceHandled: true,
    }, 0.5, "Oral", 1.2);
    paper.publication!.promotions = { arxiv: false, github: false, xiaohongshu: true };
    const state: GameState = {
      ...createStartedGameState("normal"),
      papers: [paper],
      externalPublications: [],
      buffs: [{
        id: "person-citation-penalty",
        name: "引用受损",
        source: "人物关系",
        timing: "permanent",
        remainingMonths: null,
        publicationEffects: { citationDebuffMultiplier: 0.75 },
      }],
    };

    expect(getPaperCitationMultiplierBreakdown(state, paper)).toEqual({
      heat: 2,
      influence: 1.2,
      promotion: 1.75,
      citationDebuff: 0.25,
      total: 1.05,
    });
  });

  it("applies conference presentation multipliers only after the conference is handled", () => {
    const createAtType = (
      acceptType: "Poster" | "Spotlight" | "Oral" | "Best Paper Candidate",
      conferenceHandled = true,
    ) => attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 10,
      experiment: 10,
      writing: 10,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 10,
      submittedExperiment: 10,
      submittedWriting: 10,
      conferenceHandled,
    }, 1, acceptType, 1);
    const state = createStartedGameState("normal");

    expect(getPaperCitationMultiplierBreakdown(state, createAtType("Poster")).promotion).toBe(1);
    expect(getPaperCitationMultiplierBreakdown(state, createAtType("Spotlight")).promotion).toBe(1);
    expect(getPaperCitationMultiplierBreakdown(state, createAtType("Best Paper Candidate")).promotion).toBe(5);
    expect(getPaperCitationMultiplierBreakdown(state, createAtType("Oral", false)).promotion).toBe(1);
    expect(getPaperCitationMultiplierBreakdown(state, createAtType("Best Paper Candidate", false)).promotion).toBe(1);
  });

  it("delays paper promotion multipliers until a conference paper is handled", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 10,
      experiment: 10,
      writing: 10,
      status: "published" as const,
      target: "C" as const,
      submittedIdea: 10,
      submittedExperiment: 10,
      submittedWriting: 10,
      conferenceHandled: false,
    }, 1, "Poster", 0.3, 1.1);
    paper.publication!.promotions = { arxiv: false, github: false, xiaohongshu: true };
    const state = createStartedGameState("normal");

    expect(getPaperCitationMultiplierBreakdown(state, paper).promotion).toBe(1);
    expect(getPaperCitationMultiplierBreakdown(state, { ...paper, conferenceHandled: true }).promotion).toBeCloseTo(1.35);
  });

  it("exempts non-first-author papers from citation debuffs and all promotion actions", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      idea: 10,
      experiment: 10,
      writing: 10,
      status: "published" as const,
      target: "C" as const,
      submittedIdea: 10,
      submittedExperiment: 10,
      submittedWriting: 10,
      conferenceHandled: false,
      nonFirstAuthor: true,
    }, 0.5, "Poster", 0.3);
    const state: GameState = {
      ...createStartedGameState("normal"),
      papers: [paper],
      externalPublications: [],
      player: { ...createStartedGameState("normal").player, san: 10 },
      buffs: [{
        id: "person-citation-penalty",
        name: "引用受损",
        source: "人物关系",
        timing: "permanent",
        remainingMonths: null,
        publicationEffects: { citationDebuffMultiplier: 0.75 },
      }],
    };

    expect(getPaperCitationMultiplierBreakdown(state, paper).citationDebuff).toBe(1);
    const promoted = dispatchAction(state, "promote-paper", { paperId: paper.id, promotionId: "xiaohongshu" });
    expect(promoted.player.san).toBe(10);
    expect(promoted.papers[0]?.publication?.promotions?.xiaohongshu).not.toBe(true);
  });

  it("uses the submitted score for monthly citations before the four-month decay", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 1,
      experiment: 1,
      writing: 1,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 34,
      submittedExperiment: 33,
      submittedWriting: 33,
      conferenceHandled: false,
    }, 1, "Poster", 1);
    paper.publication!.preprintExposed = true;
    const state: GameState = {
      ...createStartedGameState("normal"),
      papers: [paper],
      externalPublications: [],
    };

    const settled = settlePublishedPaperCitations(state).state;
    expect(settled.papers[0]?.publication).toMatchObject({
      citations: 5,
      effectiveScore: 100,
      monthsSincePublish: 1,
    });
    const secondMonth = settlePublishedPaperCitations(settled).state;
    const thirdMonth = settlePublishedPaperCitations(secondMonth).state;
    expect(thirdMonth.papers[0]?.publication).toMatchObject({
      citations: 15,
      effectiveScore: 100,
      monthsSincePublish: 3,
    });
    const fourthMonth = settlePublishedPaperCitations(thirdMonth).state;
    expect(fourthMonth.papers[0]?.publication).toMatchObject({
      citations: 20,
      effectiveScore: 90,
      monthsSincePublish: 4,
    });
  });

  it("does not charge SAN for arXiv after the three-month early-exposure window", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      idea: 10,
      experiment: 10,
      writing: 10,
      status: "published" as const,
      target: "C" as const,
      submittedIdea: 10,
      submittedExperiment: 10,
      submittedWriting: 10,
      conferenceHandled: false,
    });
    paper.publication!.monthsSincePublish = 3;
    const state: GameState = {
      ...createStartedGameState("normal"),
      papers: [paper],
      externalPublications: [],
      player: { ...createStartedGameState("normal").player, san: 10 },
    };

    const next = dispatchAction(state, "promote-paper", { paperId: paper.id, promotionId: "arxiv" });
    expect(next.player.san).toBe(10);
    expect(next.papers[0]?.publication?.preprintExposed).not.toBe(true);
  });

  it("keeps pre-attendance citations at zero until arXiv exposes the paper", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 34,
      experiment: 33,
      writing: 33,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 34,
      submittedExperiment: 33,
      submittedWriting: 33,
      conferenceHandled: false,
    }, 1, "Poster", 1);
    let state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      publicationTalentState: { claimedIds: ["first-paper", "first-a-or-journal"] },
      selectedPaperId: paper.id,
      player: { ...createStartedGameState("normal").player, san: 10 },
    };
    state = settlePublishedPaperCitations(state).state;
    expect(state.papers[0]?.publication).toMatchObject({ monthsSincePublish: 1, citations: 0 });
    const exposed = dispatchAction(state, "promote-paper", { paperId: paper.id, promotionId: "arxiv" });
    expect(exposed.player.san).toBe(8);
    expect(exposed.papers[0]?.publication?.preprintExposed).toBe(true);
    const cited = settlePublishedPaperCitations(exposed).state;
    expect(cited.papers[0]?.publication?.monthsSincePublish).toBe(2);
    expect(cited.papers[0]?.publication?.citations).toBe(5);
    const citedNextMonth = settlePublishedPaperCitations(cited).state;
    expect(citedNextMonth.papers[0]?.publication?.monthsSincePublish).toBe(3);
    expect(citedNextMonth.papers[0]?.publication?.citations).toBe(10);
  });

  it("keeps conference citations blocked until attendance is handled", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0),
      heatMultiplier: 1,
      idea: 34,
      experiment: 33,
      writing: 33,
      status: "published" as const,
      target: "A" as const,
      submittedIdea: 34,
      submittedExperiment: 33,
      submittedWriting: 33,
      conferenceHandled: false,
    }, 1, "Poster", 1);
    let state: GameState = {
      ...createStartedGameState("normal"),
      eventQueue: [],
      papers: [paper],
      selectedPaperId: paper.id,
    };

    for (let month = 0; month < 6; month += 1) {
      state = settlePublishedPaperCitations(state).state;
    }
    expect(state.papers[0]?.publication?.monthsSincePublish).toBe(6);
    expect(state.papers[0]?.publication?.citations).toBe(0);

    state = {
      ...state,
      papers: state.papers.map((entry) => ({ ...entry, conferenceHandled: true })),
    };
    state = settlePublishedPaperCitations(state).state;
    state = settlePublishedPaperCitations(state).state;
    expect(state.papers[0]?.publication?.citations).toBeGreaterThan(0);
  });
});
