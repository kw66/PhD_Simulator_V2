import { afterEach, describe, expect, it, vi } from "vitest";
import { CAREER_OPTIONS, type CareerType } from "../src/core/v2-career-rules";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem, enqueueEventQueueItem } from "../src/core/v2-event-queue";
import { CAREER_PREPARATION_SAN_COST, getCareerPreparationFailure, prepareCareer, refreshCareerPreparation } from "../src/core/v2-graduation-career";
import { createCareerEventForType } from "../src/core/v2-monthly-career-events";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function readyState(): GameState {
  const initial = createStartedGameState("normal");
  return {
    ...initial,
    year: 3,
    month: 1,
    totalMonths: 24,
    eventQueue: [],
    careerLastPreparedTotalMonths: null,
    careerPreparedMonths: {},
    player: { ...initial.player, research: 20, social: 10, san: 20 },
  };
}

function decisionOf(root: PendingEvent): PendingEvent {
  return root.choices[0]!.effects.enqueueEvents![0]!;
}

function resultOf(decision: PendingEvent, choiceId = "normal"): PendingEvent {
  return decision.choices.find((choice) => choice.id === choiceId)!.effects.enqueueEvents![0]!;
}

afterEach(() => vi.restoreAllMocks());

describe("career card preparation", () => {
  it.each([
    ["master", 2, 12, false],
    ["master", 3, 0, false],
    ["master", 3, 1, true],
    ["master", 3, 8, true],
    ["phd", 5, 12, false],
    ["phd", 6, 0, false],
    ["phd", 6, 1, true],
    ["phd", 6, 12, true],
  ] as const)("gates %s year %i month %i by graduation year", (degree, year, month, available) => {
    const state = { ...readyState(), degree, year, month, totalMonths: (year - 1) * 12 + month - 1 };
    expect(getCareerPreparationFailure(state) === null).toBe(available);
    expect(getCareerPreparationFailure(state, "internet") === null).toBe(available);
    expect(prepareCareer(state, "internet") === state).toBe(!available);
  });

  it("blocks setup, finished and graduated states", () => {
    const ready = readyState();
    for (const state of [
      { ...ready, phase: "setup" as const },
      { ...ready, phase: "finished" as const },
      { ...ready, ending: "master" as const },
    ]) {
      expect(getCareerPreparationFailure(state)).not.toBeNull();
      expect(prepareCareer(state, "academic")).toBe(state);
    }
  });

  it.each([
    ["internet", 4, 43],
    ["stateOwned", 2, 43],
    ["civilService", 3, 40],
    ["academic", 2, 46],
  ] as const)("directly advances %s for exactly %i SAN with no AP or event", (type, cost, gain) => {
    const state = readyState();
    const snapshot = structuredClone(state);
    const prepared = dispatchAction(state, "prepare-career", { careerType: type });
    expect(CAREER_PREPARATION_SAN_COST[type]).toBe(cost);
    expect(prepared.player.san).toBe(20 - cost);
    expect(prepared.careerProgress).toEqual({ ...state.careerProgress, [type]: gain });
    expect(prepared.careerPreparedMonths).toEqual({ [type]: 24 });
    expect(prepared.careerLastPreparedTotalMonths).toBeNull();
    expect(prepared.eventQueue).toEqual([]);
    expect(prepared.actionState).toEqual(state.actionState);
    expect(state).toEqual(snapshot);
  });

  it("rejects invalid directions without mutation", () => {
    const state = readyState();
    expect(getCareerPreparationFailure(state, "invalid" as CareerType)).not.toBeNull();
    expect(prepareCareer(state, "invalid" as CareerType)).toBe(state);
  });

  it("advances every direction independently once per month and reopens next month", () => {
    const state = readyState();
    let prepared = state;
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      expect(getCareerPreparationFailure(prepared, type)).toBeNull();
      prepared = dispatchAction(prepared, "prepare-career", { careerType: type });
      expect(getCareerPreparationFailure(prepared, type)).not.toBeNull();
      expect(prepareCareer(prepared, type)).toBe(prepared);
    }
    expect(prepared.player.san).toBe(9);
    expect(prepared.careerProgress).toEqual({ internet: 43, stateOwned: 43, civilService: 40, academic: 46 });
    expect(prepared.careerPreparedMonths).toEqual({ internet: 24, stateOwned: 24, civilService: 24, academic: 24 });
    expect(prepared.actionState).toEqual(state.actionState);
    expect(prepared.eventQueue).toEqual([]);
    const nextMonth = { ...prepared, month: 2, totalMonths: 25 };
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      expect(getCareerPreparationFailure(nextMonth, type)).toBeNull();
      expect(prepareCareer(nextMonth, type).careerPreparedMonths[type]).toBe(25);
    }
    expect(prepareCareer(nextMonth, "academic").careerProgress.academic).toBe(92);
  });

  it("ignores the legacy global allowance when a direction is supplied", () => {
    const state = readyState();
    const prepared = { ...state, careerLastPreparedTotalMonths: state.totalMonths };
    expect(getCareerPreparationFailure(prepared)).not.toBeNull();
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      expect(getCareerPreparationFailure(prepared, type)).toBeNull();
      expect(prepareCareer(prepared, type).careerPreparedMonths[type]).toBe(24);
    }
  });

  it.each([1, 4, 7, 10])("keeps all four costs fixed in month %i despite SAN cost multipliers", (month) => {
    const state = readyState();
    const live = {
      ...state,
      month,
      buffs: [{ id: "cost", name: "精力消耗", source: "test", timing: "monthly" as const, remainingMonths: 1, activeOperationSanMultiplier: 2 }],
    };
    for (const [type, cost] of [["internet", 4], ["stateOwned", 2], ["civilService", 3], ["academic", 2]] as const) {
      expect(prepareCareer(live, type).player.san).toBe(20 - cost);
    }
  });

  it("allows direct advancement with all monthly AP already spent", () => {
    const state = readyState();
    state.actionState.used = state.actionState.limit;
    const prepared = dispatchAction(state, "prepare-career", { careerType: "internet" });
    expect(prepared.careerProgress.internet).toBe(43);
    expect(prepared.actionState).toEqual(state.actionState);
  });

  it.each([
    ["internet", 4], ["stateOwned", 2], ["civilService", 3], ["academic", 2],
  ] as const)("allows lethal %s advancement and lets engine endings settle", (type, cost) => {
    const initial = readyState();
    const state = { ...initial, player: { ...initial.player, san: cost - 1 } };
    expect(getCareerPreparationFailure(state, type)).toBeNull();
    const direct = prepareCareer(state, type);
    expect(direct.player.san).toBe(-1);
    expect(direct.phase).toBe("playing");
    expect(direct.ending).toBeNull();
    const settled = dispatchAction(state, "prepare-career", { careerType: type });
    expect(settled.player.san).toBe(-1);
    expect(settled.careerProgress[type]).toBeGreaterThan(0);
    expect(settled.careerPreparedMonths[type]).toBe(24);
    expect(settled.actionState).toEqual(state.actionState);
    expect(settled.phase).toBe("finished");
    expect(settled.ending).toBe("burnout");
    expect(settled.endingCause?.text).toContain(`SAN -${cost}`);
    const exact = dispatchAction({ ...state, player: { ...state.player, san: cost } }, "prepare-career", { careerType: type });
    expect(exact.player.san).toBe(0);
    expect(exact.phase).toBe("playing");
  });

  it("retains current stat, first-author publication and internship bonuses", () => {
    const state = readyState();
    const paper = { id: "published", title: "Paper", topicId: "topic", topicLabel: "Topic", heatMultiplier: 1, prepublicationDecayRate: 0.1, idea: 1, experiment: 1, writing: 1, status: "published" as const, target: "C" as const, reviewMonthsLeft: 0, submittedIdea: 1, submittedExperiment: 1, submittedWriting: 1 };
    const live = {
      ...state,
      player: { ...state.player, research: 41, social: 21 },
      internshipCount: 2,
      papers: [paper, { ...paper, id: "draft", status: "draft" as const }],
      externalPublications: [{ ...paper, id: "external" }, { ...paper, id: "coauthor", nonFirstAuthor: true }],
      careerProgress: { internet: 90, stateOwned: 90, civilService: 90, academic: 90 },
    };
    for (const [type, gain] of [["internet", 85], ["stateOwned", 64], ["civilService", 46], ["academic", 64]] as const) {
      expect(prepareCareer(live, type).careerProgress[type]).toBe(90 + gain);
    }
  });

  it("blocks parallel requests at every pending stage regardless of direction", () => {
    const state = readyState();
    const root = createCareerEventForType(state, "internet");
    const decision = decisionOf(root);
    for (const event of [root, decision, resultOf(decision), { ...root, careerPreparation: undefined }]) {
      const pending = { ...state, eventQueue: [createEventQueueItem(event, 1)] };
      expect(getCareerPreparationFailure(pending)).toContain("当前求职");
      expect(getCareerPreparationFailure(pending, "academic")).toContain("当前求职");
      expect(prepareCareer(pending, "academic")).toBe(pending);
    }
  });

  it("relocks the card after transferring and resetting its allowance", () => {
    const state = { ...readyState(), degree: "phd" as const, careerLastPreparedTotalMonths: null };
    expect(getCareerPreparationFailure(state)).toContain("第六年");
    expect(prepareCareer(state, "academic")).toBe(state);
    expect(getCareerPreparationFailure({ ...state, year: 6, totalMonths: 60 })).toBeNull();
  });

  it.each(["normal", "pause"])("commits legacy %s exactly at confirmation through the engine", (choiceId) => {
    const initial = readyState();
    const queued = enqueueEventQueueItem(initial, createCareerEventForType(initial, "internet"));
    const root = queued.eventQueue.find((event) => event.source === "career")!;
    const second = dispatchAction(queued, "resolve-event", { eventId: root.id, eventChoiceId: root.choices[0]!.id });
    const decision = second.eventQueue.find((event) => event.source === "career")!;
    const third = dispatchAction(second, "resolve-event", { eventId: decision.id, eventChoiceId: choiceId });
    const result = third.eventQueue.find((event) => event.source === "career")!;
    expect(third.player.san).toBe(initial.player.san);
    expect(third.careerProgress).toEqual(initial.careerProgress);
    expect(third.careerLastPreparedTotalMonths).toBeNull();
    const settled = dispatchAction(third, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(settled.player.san).toBe(initial.player.san - (choiceId === "normal" ? 6 : 0));
    expect(settled.careerProgress.internet).toBe(choiceId === "normal" ? 43 : 0);
    expect(settled.careerLastPreparedTotalMonths).toBe(initial.totalMonths);
    expect(settled.actionState).toEqual(initial.actionState);
    expect(settled.careerPreparedMonths).toEqual({});
    expect(getCareerPreparationFailure(settled)).not.toBeNull();
    expect(getCareerPreparationFailure(settled, "academic")).toBeNull();
  });

  it.each(["internet", "stateOwned", "civilService", "academic"] as const)("carries %s metadata and settles only on third confirmation", (type) => {
    const state = readyState();
    const root = createCareerEventForType(state, type);
    const decision = decisionOf(root);
    const metadata = { type, totalMonths: 24, degree: "master" };
    expect(root.careerPreparation).toEqual(metadata);
    expect(decision.careerPreparation).toEqual(metadata);
    expect(root.choices[0]!.effects).toEqual({ enqueueEvents: [decision] });
    expect(decision.choices.map((choice) => choice.id)).toEqual(CAREER_OPTIONS.map((option) => option.id));
    for (const choice of decision.choices) {
      const result = resultOf(decision, choice.id);
      expect(choice.effects).toEqual({ enqueueEvents: [result] });
      expect(result.careerPreparation).toEqual(metadata);
      expect(result.stage).toBe("result");
      expect(result.choices[0]!.effects.recordCareerPreparation).toBe(true);
      expect(result.choices[0]!.effects.careerType).toBe(type);
    }
    expect(JSON.stringify(root)).not.toMatch(/abandonCareer|放弃方向|求职评估|小厂|大厂|省部级|顶尖高校/);
  });
});

describe("live career preparation refresh", () => {
  it("replaces an old deferred result patch with live confirmation effects", () => {
    const initial = readyState();
    const result = resultOf(decisionOf(createCareerEventForType(initial, "internet")));
    const stale = {
      ...result,
      deferredStatePatch: [
        { path: ["player", "san"], previousValue: 20, value: 14 },
        { path: ["careerProgress", "internet"], previousValue: 0, value: 43 },
      ],
    };
    const live = {
      ...initial,
      sanCap: 50,
      player: { ...initial.player, research: 40, social: 20, san: 30 },
      careerProgress: { ...initial.careerProgress, internet: 90 },
      eventQueue: [createEventQueueItem(stale, 1)],
    };
    const settled = dispatchAction(live, "resolve-event", { eventId: stale.id, eventChoiceId: stale.choices[0]!.id });
    expect(settled.player.san).toBe(24);
    expect(settled.careerProgress.internet).toBe(141);
    expect(settled.careerLastPreparedTotalMonths).toBe(24);
  });

  it.each(["act1", "act2", "result", "act3"] as const)("refreshes live progress, stats and SAN in %s without RNG or mutation", (stage) => {
    const state = readyState();
    const root = createCareerEventForType(state, "internet");
    const decision = decisionOf(root);
    const original = stage === "act1" ? root : stage === "act2" ? decision : { ...resultOf(decision), stage };
    const history = [{ title: "原场景", description: "原记录", choices: [], selectedChoiceId: "normal" }];
    const event = { ...original, history, deferredStatePatch: [{ path: ["player", "san"], previousValue: 20, value: 14 }] };
    const live = {
      ...state,
      careerProgress: { ...state.careerProgress, internet: 90 },
      internshipCount: 2,
      player: { ...state.player, research: 40, social: 20, san: 1 },
      buffs: [{ id: "cost", name: "精力消耗", source: "test", timing: "monthly" as const, remainingMonths: 1, activeOperationSanMultiplier: 2 }],
    };
    const snapshot = structuredClone({ live, event });
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("unexpected RNG"); });
    const refreshed = refreshCareerPreparation(live, event);
    const refreshedDecision = stage === "act1" ? decisionOf(refreshed) : stage === "act2" ? refreshed : null;
    const result = refreshedDecision ? resultOf(refreshedDecision) : refreshed;
    expect(result.choices[0]!.effects).toMatchObject({ careerProgress: 81, san: -12, recordCareerPreparation: true });
    expect(result.choices[0]!.disabledReason).toContain("12");
    expect(result.description).toContain("从 90 提升到 171");
    expect(refreshed.id).toBe(event.id);
    expect(refreshed.stage).toBe(stage);
    expect(refreshed.history).toBe(history);
    expect(refreshed.deferredStatePatch).toBeUndefined();
    expect(refreshed.careerPreparation).toEqual(event.careerPreparation);
    expect(refreshed.choices.map((choice) => choice.id)).toEqual(event.choices.map((choice) => choice.id));
    expect({ live, event }).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();

    const affordable = refreshCareerPreparation({ ...live, player: { ...live.player, san: 12 } }, refreshed);
    const affordableResult = stage === "act1" ? resultOf(decisionOf(affordable)) : stage === "act2" ? resultOf(affordable) : affordable;
    expect(affordableResult.choices[0]!.disabledReason).toBeUndefined();
  });

  it("refreshes paper-count bonuses using current first-author publications", () => {
    const state = readyState();
    const event = createCareerEventForType(state, "academic");
    const paper = { id: "published", title: "Paper", topicId: "topic", topicLabel: "Topic", heatMultiplier: 1, prepublicationDecayRate: 0.1, idea: 1, experiment: 1, writing: 1, status: "published" as const, target: "C" as const, reviewMonthsLeft: 0, submittedIdea: 1, submittedExperiment: 1, submittedWriting: 1 };
    const live = { ...state, papers: [paper], externalPublications: [{ ...paper, id: "coauthor", nonFirstAuthor: true }] };
    const result = resultOf(decisionOf(refreshCareerPreparation(live, event)));
    expect(result.choices[0]!.effects.careerProgress).toBe(49);
  });

  it("keeps settled reviews, old months and transferred-degree events unchanged", () => {
    const state = readyState();
    const result = resultOf(decisionOf(createCareerEventForType(state, "internet")));
    for (const live of [
      { ...state, totalMonths: 25, month: 2 },
      { ...state, totalMonths: 36, year: 4 },
      { ...state, degree: "phd" as const },
      { ...state, careerLastPreparedTotalMonths: 24, careerProgress: { ...state.careerProgress, internet: 100 } },
    ]) expect(refreshCareerPreparation(live, result)).toBe(result);
    const unrelated = { ...result, source: "fixed" as const };
    expect(refreshCareerPreparation(state, unrelated)).toBe(unrelated);
    const legacy = { ...result, careerPreparation: undefined };
    expect(refreshCareerPreparation(state, legacy)).toBe(legacy);
  });
});
