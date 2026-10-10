import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { enqueueMonthlyEventsForMonth } from "../src/core/v2-event-scheduler";
import { collectThesisEventForMonth } from "../src/core/v2-monthly-thesis-events";
import { enqueuePendingEvents } from "../src/core/v2-event-enqueue";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { finishTrainingIfReady } from "../src/core/v2-ending-system";
import { createInitialThesisState, syncThesisState } from "../src/core/v2-thesis-rules";
import { getMonthLimitByDegree } from "../src/core/v2-progression";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import { createCareerEventForType } from "../src/core/v2-monthly-career-events";
import { renderApp } from "../src/app/v2-render";
import type { Degree, GameState } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

function prepared(degree: Degree = "master"): GameState {
  const base = createStartedGameState("normal");
  const year = degree === "master" ? 3 : 6;
  return syncThesisState({ ...base, degree, year, month: 1, totalMonths: (year - 1) * 12 + 1,
    maxMonths: getMonthLimitByDegree(degree), graduationScoreTarget: degree === "master" ? 1 : 7,
    totalResearchScore: degree === "master" ? 1 : 7, selectedAdvisorName: "张老师",
    eventQueue: [], availableRandomEvents: [], illnessProbability: 0,
    player: { ...base.player, research: 14.75, san: 20, money: 100 },
    advisorProgressState: { ...base.advisorProgressState, funding: 1000 },
  }, () => 0);
}

function openReview(state: GameState): GameState {
  const collection = collectThesisEventForMonth({ ...state, month: 8, totalMonths: (state.year - 1) * 12 + 8 }, () => 0.4);
  return enqueuePendingEvents(collection.nextState, collection.event ? [collection.event] : []).nextState;
}

function finishReview(state: GameState): GameState {
  let next = state;
  for (let index = 0; index < 3; index += 1) {
    const event = next.eventQueue.find((entry) => entry.source === "thesis")!;
    next = dispatchAction(next, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
  }
  return next;
}

describe("graduation preparation engine lifecycle", () => {
  it.each(["master", "phd"] as const)("unlocks %s September from the real monthly calendar", (degree) => {
    const state = prepared(degree);
    const august = { ...state, year: state.year - 1, month: 12, totalMonths: state.totalMonths - 1,
      thesis: createInitialThesisState() };
    vi.spyOn(Math, "random").mockReturnValue(0);
    const september = dispatchAction(august, "next-month");
    expect(september).toMatchObject({ degree, year: state.year, month: 1, phase: "playing" });
    expect(september.thesis.researchPoints).toHaveLength(degree === "master" ? 2 : 3);
    expect(september.thesis.review).toBeNull();
  });

  it("lets every point advance independently once per month without action points", () => {
    const state = prepared("phd");
    let next = state;
    for (const thesisPointIndex of [0, 1, 2]) next = dispatchAction(next, "advance-thesis-point", { thesisPointIndex });
    expect(next.thesis.researchPoints.map((point) => point.score)).toEqual([14, 14, 14]);
    expect(next.player.san).toBe(11);
    expect(next.actionState).toEqual(state.actionState);
    const repeated = dispatchAction(next, "advance-thesis-point", { thesisPointIndex: 0 });
    expect(repeated.thesis).toEqual(next.thesis);
    expect(repeated.player.san).toBe(11);
    const nextMonth = dispatchAction({ ...repeated, month: 2, totalMonths: repeated.totalMonths + 1 }, "advance-thesis-point", { thesisPointIndex: 0 });
    expect(nextMonth.thesis.researchPoints[0]!.score).toBe(28);
    const fatal = dispatchAction({ ...state, player: { ...state.player, san: 2 } }, "advance-thesis-point", { thesisPointIndex: 0 });
    expect(fatal).toMatchObject({ phase: "finished", ending: "burnout" });
  });

  it("schedules and freezes April review once, and commits its three scenes only at confirmation", () => {
    const state = prepared();
    state.thesis.researchPoints = state.thesis.researchPoints.map((point) => ({ ...point, score: 110 }));
    const april = { ...state, month: 8, totalMonths: 32 };
    const queued = enqueueMonthlyEventsForMonth(april, () => 0).nextState;
    expect(queued.eventQueue.filter((event) => event.source === "thesis")).toHaveLength(1);
    expect(queued.thesis.review?.excellent).toBe(true);
    expect(queued.thesis.reviewResolved).toBe(false);
    const noDuplicate = collectThesisEventForMonth(queued, () => { throw new Error("redraw"); });
    expect(noDuplicate.event).toBeNull();
    const current = queued.eventQueue.find((event) => event.source === "thesis")!;
    const random = vi.spyOn(Math, "random");
    getResolvableQueuedEvent(queued, current);
    renderApp(queued);
    expect(random).not.toHaveBeenCalled();
    const confirmed = finishReview({ ...queued, eventQueue: [current] });
    expect(confirmed.thesis.reviewResolved).toBe(true);
    const history = confirmed.eventHistory.find((event) => event.source === "thesis")!;
    expect(history.stages).toHaveLength(3);
    expect(history.stages[2]!.thesisReviewPresentation?.review.excellent).toBe(true);
    const restored = JSON.parse(JSON.stringify(confirmed)) as GameState;
    const frozen = dispatchAction(restored, "advance-thesis-point", { thesisPointIndex: 0 });
    expect(frozen.thesis).toEqual(confirmed.thesis);
    const june = { ...confirmed, month: 10, totalMonths: 34, eventQueue: [] };
    expect(finishTrainingIfReady(june).ending).toBe("master");
    expect(finishTrainingIfReady(june).log[0]!.text).toContain("优秀硕士论文");
  });

  it("cannot rescue a failed April submission with later publications", () => {
    const state = prepared();
    state.totalResearchScore = 0;
    state.thesis.researchPoints.forEach((point) => { point.score = 200; });
    const queued = openReview(state);
    const next = finishReview({ ...queued, totalResearchScore: 10 });
    expect(next.thesis.review).toMatchObject({ submitted: false, passed: false, reports: [] });
    expect(next.phase).toBe("playing");
    expect(finishTrainingIfReady({ ...next, month: 10, totalMonths: 34, eventQueue: [] }).ending).toBe("delay");
  });

  it("replaces the whole current score and freezes support papers after April", () => {
    const state = prepared();
    state.thesis.researchPoints = state.thesis.researchPoints.map((point) => ({ ...point, score: 120 }));
    const paper = { ...createDraftPaper(1, 0, () => 0), id: "new-support", status: "published" as const,
      topicId: state.thesis.topicId!, topicLabel: state.thesis.topicLabel, idea: 50, experiment: 50, writing: 40 };
    const next = dispatchAction({ ...state, externalPublications: [paper] }, "set-linear-event-blocking", { blockLinearEvents: true });
    expect(next.thesis.researchPoints.map((point) => point.score)).toEqual([140, 120]);
    const reviewed = openReview(next);
    const latePaper = { ...paper, id: "late-support", idea: 500 };
    const late = dispatchAction({ ...reviewed, externalPublications: [...reviewed.externalPublications, latePaper] }, "set-linear-event-blocking", { blockLinearEvents: true });
    expect(late.thesis).toEqual(reviewed.thesis);
  });

  it("clears both cards and pending events on transfer, then starts PhD points from publications only", () => {
    const state = openReview(prepared());
    state.careerProgress.internet = 120;
    state.careerLastPreparedTotalMonths = state.totalMonths;
    state.careerPreparedMonths = { internet: state.totalMonths, academic: state.totalMonths };
    const transferred = applyChoiceEffectsToState({ ...state, month: 9, totalMonths: 33 }, {
      id: "transfer", label: "转博", outcome: "", effects: { transferToPhd: true },
    }).nextState;
    expect(transferred.degree).toBe("phd");
    expect(transferred.thesis).toEqual(createInitialThesisState());
    expect(Object.values(transferred.careerProgress)).toEqual([0, 0, 0, 0]);
    expect(transferred.careerLastPreparedTotalMonths).toBeNull();
    expect(transferred.careerPreparedMonths).toEqual({});
    expect(transferred.eventQueue.some((event) => event.source === "thesis" || event.source === "career")).toBe(false);
    expect(syncThesisState(transferred)).toBe(transferred);
    const reopened = syncThesisState({ ...transferred, year: 6, month: 1, totalMonths: 61 }, () => 0);
    expect(reopened.thesis.researchPoints.map((point) => point.score)).toEqual([0, 0, 0]);
    expect(reopened.thesis.review).toBeNull();
  });

  it("clears stale graduate events only when the actual transfer chain is confirmed", () => {
    const reviewed = openReview(prepared());
    const state = enqueuePendingEvents(reviewed, [createCareerEventForType(reviewed, "internet")]).nextState;
    state.month = 9;
    state.totalMonths = 33;
    state.totalResearchScore = 3;
    state.careerProgress.internet = 100;
    state.careerLastPreparedTotalMonths = 32;
    state.careerPreparedMonths = { internet: 33 };
    let next = enqueuePendingEvents(state, [createPhdDecisionEvent(state, 3)]).nextState;
    for (let index = 0; index < 3; index += 1) {
      const event = next.eventQueue.find((entry) => entry.chainId === "phd-decision")!;
      next = dispatchAction(next, "resolve-event", { eventId: event.id,
        eventChoiceId: index === 1 ? "transfer-phd" : event.choices[0]!.id });
      if (index < 2) {
        expect(next.degree).toBe("master");
        expect(next.thesis.review).not.toBeNull();
        expect(next.careerProgress.internet).toBe(100);
      }
    }
    expect(next.degree).toBe("phd");
    expect(next.thesis).toEqual(createInitialThesisState());
    expect(next.careerProgress.internet).toBe(0);
    expect(next.careerLastPreparedTotalMonths).toBeNull();
    expect(next.careerPreparedMonths).toEqual({});
    expect(next.eventQueue.some((event) => event.source === "thesis" || event.source === "career")).toBe(false);
  });

  it("closes an obsolete career confirmation without spending SAN or duplicating progress", () => {
    const initial = prepared();
    let state = enqueuePendingEvents(initial, [createCareerEventForType(initial, "internet")]).nextState;
    const root = state.eventQueue.find((event) => event.source === "career")!;
    state = dispatchAction(state, "resolve-event", { eventId: root.id, eventChoiceId: root.choices[0]!.id });
    const decision = state.eventQueue.find((event) => event.source === "career")!;
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: "normal" });
    const result = state.eventQueue.find((event) => event.source === "career")!;
    const stale = { ...state, totalMonths: state.totalMonths + 1, month: 2 };
    const refreshed = getResolvableQueuedEvent(stale, result);
    const closed = dispatchAction(stale, "resolve-event", { eventId: result.id, eventChoiceId: refreshed.choices[0]!.id });
    expect(closed.player.san).toBe(stale.player.san);
    expect(closed.careerProgress).toEqual(stale.careerProgress);
    expect(closed.careerLastPreparedTotalMonths).toBeNull();
  });
});
