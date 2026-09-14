import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem, getCurrentQueueEvent } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getAcceptedPaperScore } from "../src/core/v2-publication-rules";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createPaperCompetitionRandomEvent } from "../src/core/v2-random-events-paper-competition";
import type { GameState, Paper, PendingEvent } from "../src/core/v2-types";

const COMPETITIONS = [
  { eventId: 17, title: "被抢发idea", field: "idea", secondChoice: "狡辩二者不同" },
  { eventId: 18, title: "新SOTA", field: "experiment", secondChoice: "选择性对比" },
] as const;

const RESPONSES = [
  { choiceIndex: 0, multiplier: 0.25, sanCost: 0 },
  { choiceIndex: 1, multiplier: 0.5, sanCost: 1 },
  { choiceIndex: 2, multiplier: 0.75, sanCost: 3 },
  { choiceIndex: 3, multiplier: 1.25, sanCost: 6 },
] as const;

function makePaper(index: number, overrides: Partial<Paper> = {}): Paper {
  return {
    ...createDraftPaper(6, index, () => 0),
    title: `Competition paper ${index}`,
    idea: 40,
    experiment: 40,
    writing: 20,
    ...overrides,
  };
}

function makeState(papers: Paper[] = [makePaper(0)]): GameState {
  const started = createStartedGameState("normal");
  return {
    ...started,
    year: 1,
    month: 6,
    totalMonths: 6,
    eventQueue: [],
    eventHistory: [],
    log: [],
    papers,
    externalPublications: [],
    selectedPaperId: papers[0]?.id ?? null,
    availableRandomEvents: [],
    totalRandomEventCount: 7,
    illnessProbability: 0,
    player: { ...started.player, san: 20, research: 4, social: 4 },
  };
}

function queueCompetition(state: GameState, eventId: 17 | 18, roll = 0): GameState {
  const rolls: number[] = [];
  const event = createPaperCompetitionRandomEvent(eventId, state, () => {
    rolls.push(roll);
    return roll;
  });
  if (!event) throw new Error(`Competition ${eventId} has no eligible paper`);
  return {
    ...state,
    eventQueue: [createEventQueueItem({
      ...event,
      randomReplay: { eventId, serial: state.totalRandomEventCount, rolls },
    }, 1)],
  };
}

function resolveCurrent(state: GameState, choiceIndex = 0): GameState {
  const event = getCurrentQueueEvent(state);
  const choice = event?.choices[choiceIndex];
  if (!event || !choice) throw new Error("Expected a queued event and choice");
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

function finishCompetition(state: GameState, choiceIndex = 0): GameState {
  return resolveCurrent(resolveCurrent(resolveCurrent(state), choiceIndex));
}

function getDecision(event: PendingEvent): PendingEvent {
  const decision = event.choices[0]?.effects.enqueueEvents?.[0];
  if (!decision) throw new Error("Missing second act");
  return decision;
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(COMPETITIONS)("paper competition $eventId: $field", ({ eventId, title, field, secondChoice }) => {
  it("routes a pure three-act event with the approved options and final-confirmation effects", () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    const event = createPaperCompetitionRandomEvent(eventId, state, () => 0)!;
    expect(event.title).toBe(title);
    expect(event.stage).toBe("act1");
    expect(event.description).toContain(state.papers[0]!.title);
    expect(event.paperCompetitionTargetId).toBe(state.papers[0]!.id);
    expect(event.choices).toHaveLength(1);
    expect(Object.keys(event.choices[0]!.effects)).toEqual(["enqueueEvents"]);

    const decision = getDecision(event);
    expect(decision.stage).toBe("act2");
    expect(decision.choices.map((choice) => choice.label)).toEqual([
      "装作不知道", secondChoice, "小幅修改", "大幅修改",
    ]);
    for (const response of RESPONSES) {
      const choice = decision.choices[response.choiceIndex]!;
      expect(choice.disabledReason).toBeUndefined();
      expect(Object.keys(choice.effects)).toEqual(["enqueueEvents"]);
      const result = choice.effects.enqueueEvents![0]!;
      expect(result.stage).toBe("result");
      expect(result.chainId).toBe(event.chainId);
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0]!.effects).toEqual({
        paperCompetitionResolution: {
          paperId: state.papers[0]!.id,
          field,
          multiplier: response.multiplier,
          sanCost: response.sanCost,
        },
      });
    }
    const routed = createRandomEventById(eventId, state, () => 0);
    expect(routed.event).toEqual(event);
    expect(routed.nextState).toEqual(state);
    expect(state).toEqual(snapshot);
  });

  it.each(["draft", "reviewing"] as const)("selects one eligible %s independently of the selected paper", (status) => {
    const state = makeState([
      makePaper(0, { [field]: 0 }),
      makePaper(1, { status }),
      makePaper(2, { status: "journal-reviewing", journalTarget: "nature" }),
      makePaper(3, { status: "published" }),
      makePaper(4, { nonFirstAuthor: true }),
      makePaper(5, { status }),
    ]);
    state.externalPublications = [makePaper(6)];
    expect(createPaperCompetitionRandomEvent(eventId, state, () => 0)?.paperCompetitionTargetId)
      .toBe(state.papers[1]!.id);
    expect(createPaperCompetitionRandomEvent(eventId, state, () => 0.999)?.paperCompetitionTargetId)
      .toBe(state.papers[5]!.id);

    const completed = finishCompetition(queueCompetition(state, eventId, 0.999), 1);
    expect(completed.papers).toEqual(state.papers.map((paper, index) => (
      index === 5 ? { ...paper, [field]: 20 } : paper
    )));
    expect(completed.externalPublications).toEqual(state.externalPublications);
    expect(completed.player.san).toBe(19);
  });

  it("does not build or consume a target roll when every paper is ineligible", () => {
    const state = makeState([
      makePaper(0, { [field]: 0 }),
      makePaper(1, { [field]: -1 }),
      makePaper(2, { status: "journal-reviewing", journalTarget: "nature" }),
      makePaper(3, { status: "published" }),
      makePaper(4, { nonFirstAuthor: true }),
    ]);
    state.externalPublications = [makePaper(5)];
    const getRoll = vi.fn(() => 0);
    expect(createPaperCompetitionRandomEvent(eventId, state, getRoll)).toBeNull();
    expect(getRoll).not.toHaveBeenCalled();
    expect(createPaperCompetitionRandomEvent(eventId, makeState([]), getRoll)).toBeNull();
  });

  describe.each(["draft", "reviewing"] as const)("%s settlement", (status) => {
    it.each(RESPONSES)("applies x$multiplier and SAN -$sanCost exactly once on confirmation", ({ choiceIndex, multiplier, sanCost }) => {
      const target = makePaper(0, {
        status,
        ...(status === "reviewing" ? {
          target: "A" as const,
          submittedIdea: 40,
          submittedExperiment: 40,
          submittedWriting: 20,
          submittedMonth: 6,
          submittedYear: 1,
          reviewMonthsLeft: 2,
        } : {}),
      });
      const state = makeState([target, makePaper(1)]);
      const snapshot = structuredClone(state);
      const queued = queueCompetition(state, eventId);
      const decision = resolveCurrent(queued);
      const result = resolveCurrent(decision, choiceIndex);
      for (const intermediate of [queued, decision, result]) {
        expect(intermediate.papers).toEqual(state.papers);
        expect(intermediate.player).toEqual(state.player);
        expect(intermediate.actionState).toEqual(state.actionState);
      }
      expect(getCurrentQueueEvent(result)?.stage).toBe("result");
      const confirmation = getCurrentQueueEvent(result)!;
      const completed = resolveCurrent(result);
      expect(completed.papers).toEqual([{ ...target, [field]: 40 * multiplier }, state.papers[1]]);
      expect(completed.player).toEqual({ ...state.player, san: 20 - sanCost });
      expect(completed.actionState).toEqual(state.actionState);
      expect(completed.totalRandomEventCount).toBe(state.totalRandomEventCount);
      expect(completed.eventQueue).toHaveLength(0);
      expect(completed.eventHistory).toHaveLength(1);
      expect(completed.eventHistory[0]!.stages).toHaveLength(3);
      const repeated = dispatchAction(completed, "resolve-event", {
        eventId: confirmation.id,
        eventChoiceId: confirmation.choices[0]!.id,
      });
      expect(repeated).toEqual(completed);
      expect(state).toEqual(snapshot);
    });
  });

  it.each([
    { score: 1, choiceIndex: 0, expected: 1 },
    { score: 2, choiceIndex: 0, expected: 1 },
    { score: 6, choiceIndex: 0, expected: 2 },
    { score: 3, choiceIndex: 1, expected: 2 },
    { score: 2, choiceIndex: 2, expected: 2 },
    { score: 2, choiceIndex: 3, expected: 3 },
  ])("rounds score $score with choice $choiceIndex to $expected and retains positive progress", ({ score, choiceIndex, expected }) => {
    const state = makeState([makePaper(0, { [field]: score })]);
    const completed = finishCompetition(queueCompetition(state, eventId), choiceIndex);
    expect(completed.papers[0]![field]).toBe(expected);
  });

  it.each(["insert", "remove-other"] as const)("keeps the replay target after paper array change: %s", (change) => {
    const state = makeState([makePaper(0), makePaper(1), makePaper(2)]);
    const queued = queueCompetition(state, eventId, 0.5);
    expect(queued.eventQueue[0]!.paperCompetitionTargetId).toBe(state.papers[1]!.id);
    const changedPapers = change === "insert"
      ? [makePaper(3), makePaper(4), ...state.papers]
      : state.papers.slice(1);
    const completed = finishCompetition({ ...queued, papers: changedPapers }, 1);
    expect(completed.papers).toEqual(changedPapers.map((paper) => (
      paper.id === state.papers[1]!.id ? { ...paper, [field]: 20 } : paper
    )));
    expect(completed.player.san).toBe(19);
  });

  describe.each(["before-first-act", "before-confirmation"] as const)("invalidated target %s", (timing) => {
    it.each(["removed", "journal", "accepted", "nonfirst"] as const)("skips every effect without retargeting when %s", (change) => {
      const state = makeState([makePaper(0), makePaper(1)]);
      let queued = queueCompetition(state, eventId);
      if (timing === "before-confirmation") queued = resolveCurrent(resolveCurrent(queued), 3);
      const target = queued.papers[0]!;
      const changed: GameState = {
        ...queued,
        publicationTalentState: { claimedIds: change === "accepted" ? ["first-paper"] : [] },
        papers: change === "removed" ? queued.papers.slice(1) : [
          change === "journal" ? { ...target, status: "journal-reviewing", journalTarget: "nature" }
            : change === "accepted" ? { ...target, status: "published" }
              : { ...target, nonFirstAuthor: true },
          queued.papers[1]!,
        ],
      };
      const completed = timing === "before-confirmation" ? resolveCurrent(changed) : finishCompetition(changed, 3);
      expect(completed.papers).toEqual(changed.papers);
      expect(completed.player).toEqual(changed.player);
      expect(completed.actionState).toEqual(changed.actionState);
      expect(completed.eventQueue).toHaveLength(0);
      expect(completed.eventHistory).toHaveLength(1);
    });
  });

  it.each([0, 3])("keeps review acceptance and published initial score frozen after choice %s", (choiceIndex) => {
    const paper = makePaper(0, {
      idea: 8, experiment: 8, writing: 8,
      status: "reviewing", target: "C", reviewMonthsLeft: 2,
      submittedIdea: 8, submittedExperiment: 8, submittedWriting: 8,
      submittedMonth: 1, submittedYear: 1,
    });
    const initial = makeState([paper]);
    const completed = finishCompetition(queueCompetition(initial, eventId), choiceIndex);
    const beforeReview = { ...completed, papers: [{ ...completed.papers[0]!, reviewMonthsLeft: 0 }] };
    const baseline = resolveDuePaperReviews({ ...initial, papers: [{ ...paper, reviewMonthsLeft: 0 }] }, () => 0).state;
    const reviewed = resolveDuePaperReviews(beforeReview, () => 0).state;
    const confirmed = finishCompetition(reviewed);
    const baselineConfirmed = finishCompetition(baseline);
    const published = confirmed.externalPublications.find((entry) => entry.id === paper.id)!;
    expect(published.status).toBe("published");
    expect(published.lastReview).toEqual(baselineConfirmed.externalPublications[0]!.lastReview);
    expect(getAcceptedPaperScore(published)).toBe(24);
    expect(published.publication?.effectiveScore).toBe(24);
    expect(published.submittedIdea).toBe(8);
    expect(published.submittedExperiment).toBe(8);
    expect(published.submittedWriting).toBe(8);
  });

  it("retains changed current progress and then adds feedback on rejection", () => {
    const paper = makePaper(0, {
      idea: 4, experiment: 4, writing: 4,
      status: "reviewing", target: "A", reviewMonthsLeft: 2,
      submittedIdea: 4, submittedExperiment: 4, submittedWriting: 4,
      submittedMonth: 1, submittedYear: 1,
    });
    const initial = makeState([paper]);
    const competed = finishCompetition(queueCompetition(initial, eventId), 0);
    const due = { ...competed, papers: [{ ...competed.papers[0]!, reviewMonthsLeft: 0 }] };
    const reviewState = resolveDuePaperReviews(due, () => 0.65).state;
    const finalStage = resolveCurrent(resolveCurrent(reviewState));
    const settlement = getCurrentQueueEvent(finalStage)!.choices[0]!.effects.paperReviewSettlement!;
    const baseline = finishCompetition(resolveDuePaperReviews({
      ...initial, papers: [{ ...paper, reviewMonthsLeft: 0 }],
    }, () => 0.65).state);
    expect(settlement.accepted).toBe(false);
    expect(settlement.submittedScore).toBe(12);
    const confirmed = resolveCurrent(finalStage);
    expect(confirmed.papers[0]!.lastReview).toEqual(baseline.papers[0]!.lastReview);
    expect(confirmed.papers[0]!.status).toBe("draft");
    let totalFeedback = 0;
    for (const action of ["idea", "experiment", "writing"] as const) {
      const feedback = settlement.reports.reduce((total, report) => total
        + (report.improvements?.[action] ?? 0)
        + (report.improvementAction === action ? report.improvementAmount ?? 0 : 0), 0);
      expect(confirmed.papers[0]![action]).toBe(due.papers[0]![action] + feedback);
      totalFeedback += feedback;
    }
    expect(totalFeedback).toBeGreaterThan(0);
    expect(confirmed.papers[0]![field]).toBe(baseline.papers[0]![field] - 3);
    expect(confirmed.papers[0]!.submittedIdea).toBeNull();
    expect(confirmed.papers[0]!.submittedExperiment).toBeNull();
    expect(confirmed.externalPublications).toHaveLength(0);
  });

  it("applies the locked resolution to the target's current score at final confirmation", () => {
    const initial = makeState([makePaper(0), makePaper(1)]);
    const result = resolveCurrent(resolveCurrent(queueCompetition(initial, eventId)), 1);
    const updated = { ...result, papers: [{ ...result.papers[0]!, [field]: 13 }, result.papers[1]!] };
    const confirmed = resolveCurrent(updated);
    expect(confirmed.papers).toEqual([{ ...updated.papers[0]!, [field]: 7 }, updated.papers[1]]);
    expect(confirmed.player.san).toBe(19);
  });

  it("skips both SAN and paper effects when target progress has become zero", () => {
    const initial = makeState([makePaper(0), makePaper(1)]);
    const result = resolveCurrent(resolveCurrent(queueCompetition(initial, eventId)), 3);
    const updated = { ...result, papers: [{ ...result.papers[0]!, [field]: 0 }, result.papers[1]!] };
    const confirmed = resolveCurrent(updated);
    expect(confirmed.papers).toEqual(updated.papers);
    expect(confirmed.player).toEqual(updated.player);
    expect(confirmed.eventQueue).toHaveLength(0);
  });
});
