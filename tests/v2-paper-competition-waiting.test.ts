import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderPlayScreen } from "../src/app/v2-render-play";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem, hasBlockingQueueEvent } from "../src/core/v2-event-queue";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import {
  activatePendingRandomEvents,
  rememberPendingRandomEvent,
} from "../src/core/v2-paper-competition-waiting";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import {
  buildWeightedRandomEventPool,
  createRandomEventPool,
  yearlyResetRandomEventState,
} from "../src/core/v2-random-event-rules";
import type { GameState, Paper, PendingEvent } from "../src/core/v2-types";

const COMPETITIONS = [
  { eventId: 17, field: "idea", sanCost: 2 },
  { eventId: 18, field: "experiment", sanCost: 3 },
] as const;

function makePaper(index: number, overrides: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(6, index, () => 0), ...overrides };
}

function makeState(papers: Paper[] = []): GameState {
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
    availableRandomEvents: [17, 18],
    usedRandomEvents: [11, 14, 16],
    totalRandomEventCount: 7,
    illnessProbability: 0,
    player: { ...started.player, san: 20, research: 4, social: 4 },
  };
}

function rememberBoth(state: GameState): GameState {
  return rememberPendingRandomEvent(rememberPendingRandomEvent(state, 17, 6), 18, 7);
}

function grantPaperProgress(paperId: string, scores: Partial<Pick<Paper, "idea" | "experiment">>): PendingEvent {
  return {
    id: "grant-paper-progress",
    title: "Paper progress",
    description: "A confirmed event grants paper progress",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "grant-paper-progress",
    stage: "result",
    choices: [{
      id: "confirm-progress",
      label: "Confirm",
      outcome: "Paper progress granted",
      effects: { paperUpdates: [{ id: paperId, ...scores }] },
    }],
  };
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hidden paper competition lifecycle", () => {
  it("includes both competition events in a fresh pool even without papers", () => {
    expect(createRandomEventPool()).toEqual(expect.arrayContaining([17, 18]));
    expect(createRandomEventPool()).toContain(16);
    const state = makeState();
    expect(buildWeightedRandomEventPool({
      ...state, social: 4, research: 4, hasRecoverableDraftPaper: false,
    }).candidateEventIds).toEqual([17, 18]);
  });

  it.each(COMPETITIONS)("draws $eventId once, then hides it without a target, UI, log or blocking queue", ({ eventId }) => {
    const state = { ...makeState(), availableRandomEvents: [eventId] };
    const snapshot = structuredClone(state);
    const getRoll = vi.fn().mockReturnValueOnce(0.8).mockReturnValue(0);
    const drawn = collectRandomEventsForMonth(state, getRoll);
    expect(drawn.events).toHaveLength(0);
    expect(drawn.nextState.pendingRandomEvents).toEqual([{ eventId, serial: 8 }]);
    expect(drawn.nextState.totalRandomEventCount).toBe(8);
    expect(drawn.nextState.availableRandomEvents).not.toContain(eventId);
    expect(drawn.nextState.usedRandomEvents.filter((entry) => entry === eventId)).toHaveLength(0);
    expect(drawn.nextState.eventQueue).toEqual(state.eventQueue);
    expect(drawn.nextState.log).toEqual(state.log);
    expect(drawn.nextState.eventHistory).toEqual(state.eventHistory);
    expect(drawn.nextState.player).toEqual(state.player);
    expect(hasBlockingQueueEvent(drawn.nextState)).toBe(false);
    expect(getRoll).toHaveBeenCalledTimes(2);
    expect(renderPlayScreen(drawn.nextState)).toBe(renderPlayScreen({
      ...drawn.nextState, pendingRandomEvents: [],
    }));
    expect(state).toEqual(snapshot);
  });

  it.each(COMPETITIONS)("queues $eventId immediately when its draw already has an eligible paper", ({ eventId, field }) => {
    const state = { ...makeState([makePaper(0, { [field]: 8 })]), availableRandomEvents: [eventId] };
    const getRoll = vi.fn().mockReturnValueOnce(0.8).mockReturnValue(0);
    const drawn = collectRandomEventsForMonth(state, getRoll);
    expect(drawn.events).toHaveLength(1);
    expect(drawn.events[0]).toMatchObject({
      paperCompetitionTargetId: state.papers[0]!.id,
      stage: "act1",
      randomReplay: { eventId, serial: 8 },
    });
    expect(drawn.nextState.pendingRandomEvents ?? []).toHaveLength(0);
    expect(drawn.nextState.totalRandomEventCount).toBe(8);
    expect(drawn.nextState.papers).toEqual(state.papers);
    expect(drawn.nextState.player).toEqual(state.player);
  });

  it("remembers at most one opportunity per type and never increments the draw counter itself", () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    const first = rememberPendingRandomEvent(state, 17, 6);
    const repeated = rememberPendingRandomEvent(first, 17, 999);
    const both = rememberPendingRandomEvent(repeated, 18, 7);
    expect(repeated.pendingRandomEvents).toEqual([{ eventId: 17, serial: 6 }]);
    expect(both.pendingRandomEvents).toEqual([{ eventId: 17, serial: 6 }, { eventId: 18, serial: 7 }]);
    expect(both.availableRandomEvents).toEqual([]);
    expect(both.usedRandomEvents).toEqual([11, 14, 16]);
    expect(both.totalRandomEventCount).toBe(7);
    expect(both.log).toEqual(state.log);
    expect(both.eventQueue).toEqual(state.eventQueue);
    expect(state).toEqual(snapshot);
  });

  it("does not redraw waiting types even if they reappear in the available pool", () => {
    const waiting = { ...rememberBoth(makeState()), availableRandomEvents: [17, 18], usedRandomEvents: [11, 14, 16] };
    expect(buildWeightedRandomEventPool({ ...waiting, social: 4, research: 4 }).candidateEventIds).toEqual([]);
    const drawn = collectRandomEventsForMonth(waiting, () => 0.99);
    expect(drawn.events).toEqual([]);
    expect(drawn.nextState.pendingRandomEvents).toEqual(waiting.pendingRandomEvents);
    expect(drawn.nextState.totalRandomEventCount).toBe(7);
  });

  it("leaves waiting events invisible and consumes no target rolls while eligibility is absent", () => {
    const waiting = rememberBoth(makeState([
      makePaper(0),
      makePaper(1, { idea: 10, experiment: 10, status: "journal-reviewing", journalTarget: "nature" }),
      makePaper(2, { idea: 10, experiment: 10, status: "published" }),
      makePaper(3, { idea: 10, experiment: 10, nonFirstAuthor: true }),
    ]));
    const getRoll = vi.fn(() => 0.5);
    let checked = waiting;
    for (let count = 0; count < 3; count += 1) checked = activatePendingRandomEvents(checked, getRoll);
    expect(checked).toEqual(waiting);
    expect(getRoll).not.toHaveBeenCalled();
    expect(checked.eventQueue).toHaveLength(0);
  });

  it("never generates competitions solely because progress exists without a remembered draw", () => {
    const state = makeState([makePaper(0, { idea: 5, experiment: 5 })]);
    delete state.pendingRandomEvents;
    const getRoll = vi.fn(() => 0);
    expect(activatePendingRandomEvents(state, getRoll)).toBe(state);
    expect(getRoll).not.toHaveBeenCalled();
    const researched = dispatchAction(state, "research-paper", {
      paperId: state.papers[0]!.id, paperActionType: "idea",
    });
    expect(researched.papers[0]!.idea).toBeGreaterThan(5);
    expect(researched.eventQueue).toHaveLength(0);
    expect(researched.pendingRandomEvents ?? []).toHaveLength(0);
  });

  it.each(COMPETITIONS)("wakes $eventId immediately through the actual $field research action", ({ eventId, field, sanCost }) => {
    const paper = makePaper(0, field === "experiment" ? { idea: 4 } : {});
    const waiting = rememberPendingRandomEvent(makeState([paper]), eventId, 7);
    const researched = dispatchAction(waiting, "research-paper", { paperId: paper.id, paperActionType: field });
    expect(researched.papers[0]![field]).toBeGreaterThan(0);
    expect(researched.player.san).toBe(waiting.player.san - sanCost);
    expect(researched.actionState.used).toBe(waiting.actionState.used + 1);
    expect(researched.eventQueue).toHaveLength(1);
    expect(researched.eventQueue[0]).toMatchObject({
      stage: "act1", paperCompetitionTargetId: paper.id, randomReplay: { eventId, serial: 7 },
    });
    expect(researched.pendingRandomEvents).toEqual([]);
    expect(researched.totalRandomEventCount).toBe(7);
    expect(researched.log).toHaveLength(1);
    expect(researched.eventHistory).toHaveLength(0);
  });

  it("allows rest and month advance while the only events are hidden", () => {
    const waiting = rememberBoth(makeState());
    waiting.player.san = 10;
    const rested = dispatchAction(waiting, "rest");
    expect(rested.player.san).toBe(12);
    expect(rested.actionState.used).toBe(waiting.actionState.used + 1);
    expect(rested.eventQueue).toHaveLength(0);
    const advanced = dispatchAction(rested, "next-month");
    expect(advanced.totalMonths).toBe(7);
    expect(advanced.pendingRandomEvents).toEqual(waiting.pendingRandomEvents);
    expect(advanced.totalRandomEventCount).toBe(7);
    expect(advanced.log.some((entry) => entry.text.includes("必须先处理待办事件"))).toBe(false);
  });

  it("does not wake on an empty new paper but wakes as soon as that paper gains idea", () => {
    const waiting = rememberPendingRandomEvent(makeState(), 17, 7);
    const created = dispatchAction(waiting, "create-paper", { paperSlotIndex: 0 });
    expect(created.papers).toHaveLength(1);
    expect(created.papers[0]!.idea).toBe(0);
    expect(created.eventQueue).toHaveLength(0);
    expect(created.pendingRandomEvents).toEqual(waiting.pendingRandomEvents);
    const researched = dispatchAction(created, "research-paper", {
      paperId: created.papers[0]!.id, paperActionType: "idea",
    });
    expect(researched.eventQueue[0]?.paperCompetitionTargetId).toBe(created.papers[0]!.id);
    expect(researched.pendingRandomEvents).toEqual([]);
  });

  it("activates both eligible types in the same event-granted progress update without losing other queued events", () => {
    const paper = makePaper(0);
    const waiting = rememberBoth(makeState([paper]));
    const grant = grantPaperProgress(paper.id, { idea: 8, experiment: 12 });
    const unrelated = { ...grantPaperProgress(paper.id, {}), id: "other-event", chainId: "other-event" };
    const queued = {
      ...waiting,
      eventQueue: [createEventQueueItem(grant, 1), createEventQueueItem(unrelated, 2)],
    };
    const granted = dispatchAction(queued, "resolve-event", { eventId: grant.id, eventChoiceId: grant.choices[0]!.id });
    expect(granted.papers[0]).toMatchObject({ idea: 8, experiment: 12 });
    expect(granted.player).toEqual(waiting.player);
    expect(granted.eventQueue).toHaveLength(3);
    expect(granted.eventQueue[0]!.id).toBe(unrelated.id);
    expect(granted.eventQueue.slice(1).map((event) => event.randomReplay)).toEqual([
      { eventId: 17, serial: 6, rolls: [0] },
      { eventId: 18, serial: 7, rolls: [0] },
    ]);
    expect(granted.eventQueue.slice(1).map((event) => event.paperCompetitionTargetId)).toEqual([paper.id, paper.id]);
    expect(granted.pendingRandomEvents).toEqual([]);
    expect(granted.totalRandomEventCount).toBe(7);
    expect(granted.eventHistory).toHaveLength(1);
    expect(granted.log).toHaveLength(1);

    let checked = granted;
    for (let count = 0; count < 3; count += 1) {
      checked = dispatchAction(checked, "select-paper", { paperId: paper.id });
      checked = activatePendingRandomEvents(checked, () => 0.99);
    }
    expect(checked).toEqual(granted);
    const rememberedAgain = rememberPendingRandomEvent(granted, 17, 999);
    expect(rememberedAgain).toEqual(granted);
  });

  it("selects the target at wake time from current candidates, never from papers present when hidden", () => {
    const original = makePaper(0);
    const waiting = rememberPendingRandomEvent(makeState([original]), 17, 7);
    expect(waiting.pendingRandomEvents).toEqual([{ eventId: 17, serial: 7 }]);
    const firstCandidate = makePaper(1, { idea: 8 });
    const secondCandidate = makePaper(2, { idea: 12 });
    const changed = { ...waiting, papers: [firstCandidate, secondCandidate] };
    const awake = activatePendingRandomEvents(changed, () => 0.999);
    expect(awake.eventQueue[0]!.paperCompetitionTargetId).toBe(secondCandidate.id);
    expect(awake.eventQueue[0]!.description).toContain(secondCandidate.title);
    expect(awake.papers).toEqual(changed.papers);
    expect(awake.player).toEqual(changed.player);
    expect(awake.totalRandomEventCount).toBe(7);
  });

  it("wakes only the matching type and keeps the other opportunity hidden", () => {
    const waiting = rememberBoth(makeState([makePaper(0, { idea: 8 })]));
    const awake = activatePendingRandomEvents(waiting, () => 0);
    expect(awake.eventQueue.map((event) => event.randomReplay?.eventId)).toEqual([17]);
    expect(awake.pendingRandomEvents).toEqual([{ eventId: 18, serial: 7 }]);
    expect(awake.totalRandomEventCount).toBe(7);
    expect(activatePendingRandomEvents(awake, () => 0)).toEqual(awake);
  });

  it("preserves waiting serials across repeated annual resets and excludes them from fresh pools", () => {
    const waiting = rememberBoth(makeState());
    let reset = waiting;
    for (let year = 2; year <= 4; year += 1) {
      reset = { ...reset, ...yearlyResetRandomEventState(reset), year };
      expect(reset.pendingRandomEvents).toEqual(waiting.pendingRandomEvents);
      expect(reset.totalRandomEventCount).toBe(7);
      expect(reset.availableRandomEvents).not.toContain(17);
      expect(reset.availableRandomEvents).not.toContain(18);
      expect(reset.usedRandomEvents.filter((eventId) => eventId === 17)).toHaveLength(0);
      expect(reset.usedRandomEvents.filter((eventId) => eventId === 18)).toHaveLength(0);
      reset = rememberBoth(reset);
      expect(reset.pendingRandomEvents).toHaveLength(2);
    }
  });

  it("preserves hidden opportunities through the actual December-to-new-year month action", () => {
    const waiting = { ...rememberBoth(makeState()), year: 1, month: 12, totalMonths: 12 };
    const advanced = dispatchAction(waiting, "next-month");
    expect(advanced).toMatchObject({ year: 2, month: 1, totalMonths: 13, totalRandomEventCount: 7 });
    expect(advanced.pendingRandomEvents).toEqual(waiting.pendingRandomEvents);
    expect(advanced.availableRandomEvents).not.toContain(17);
    expect(advanced.availableRandomEvents).not.toContain(18);
    expect(advanced.eventQueue.filter((event) => event.paperCompetitionTargetId)).toHaveLength(0);
    const withProgress = { ...advanced, papers: [makePaper(0, { idea: 8, experiment: 8 })] };
    const awake = activatePendingRandomEvents(withProgress, () => 0);
    expect(awake.eventQueue.filter((event) => event.paperCompetitionTargetId)).toHaveLength(2);
    expect(awake.totalRandomEventCount).toBe(7);
    expect(awake.pendingRandomEvents).toEqual([]);
  });

  it("does not activate outside the playing phase", () => {
    const waiting = rememberBoth(makeState([makePaper(0, { idea: 8, experiment: 8 })]));
    const getRoll = vi.fn(() => 0);
    for (const phase of [createInitialState().phase, "finished"] as const) {
      const state = { ...waiting, phase };
      expect(activatePendingRandomEvents(state, getRoll)).toEqual(state);
    }
    expect(getRoll).not.toHaveBeenCalled();
  });

  it.each(COMPETITIONS)("debug $eventId supplies a target and appears on the first click", ({ eventId, field }) => {
    const initial = makeState();
    const payload = { eventId: `random-${eventId}` };
    const awake = dispatchAction(initial, "debug-trigger-event", payload);
    expect(awake.papers).toHaveLength(1);
    expect(awake.papers[0]![field]).toBeGreaterThan(0);
    expect(awake.log).toEqual(initial.log);
    expect(awake.player).toEqual(initial.player);
    expect(awake.actionState).toEqual(initial.actionState);
    expect(awake.eventQueue).toHaveLength(1);
    expect(awake.eventQueue[0]).toMatchObject({
      stage: "act1", paperCompetitionTargetId: awake.papers[0]!.id, randomReplay: { eventId, serial: 8 },
    });
    expect(awake.totalRandomEventCount).toBe(8);
    expect(awake.pendingRandomEvents).toEqual([]);
    expect(dispatchAction(awake, "debug-trigger-event", payload)).toEqual(awake);
  });

  it.each(COMPETITIONS)("debug $eventId uses an existing eligible paper without creating synthetic progress", ({ eventId, field }) => {
    const initial = makeState([makePaper(0, { [field]: 8 })]);
    const awake = dispatchAction(initial, "debug-trigger-event", { eventId: `random-${eventId}` });
    expect(awake.papers).toEqual(initial.papers);
    expect(awake.player).toEqual(initial.player);
    expect(awake.totalRandomEventCount).toBe(8);
    expect(awake.eventQueue).toHaveLength(1);
    expect(awake.eventQueue[0]!.paperCompetitionTargetId).toBe(initial.papers[0]!.id);
    expect(awake.pendingRandomEvents).toEqual([]);
  });

  it("keeps each replay bound to its own event when debug reveals both hidden competitions", () => {
    const initial = rememberBoth(makeState());
    const awake = dispatchAction(initial, "debug-trigger-event", { eventId: "random-17" });
    expect(awake.eventQueue).toHaveLength(2);
    for (const event of awake.eventQueue) {
      expect(event.replayContext?.debugEventId).toBe(event.chainId);
      expect(event.replayContext?.rootEvent.paperCompetitionTargetId).toBe(event.paperCompetitionTargetId);
    }
  });

  it("protects both a revealed queued event and the other hidden type across an actual annual reset", () => {
    const waiting = rememberBoth({ ...makeState([makePaper(0, { idea: 8 })]), month: 12, totalMonths: 12 });
    const awake = activatePendingRandomEvents(waiting, () => 0);
    const acrossYear = {
      ...awake,
      eventQueue: awake.eventQueue.map((event) => ({ ...event, deadlineMonths: 2 })),
    };
    const advanced = dispatchAction(acrossYear, "next-month");
    expect(advanced).toMatchObject({ year: 2, month: 1, totalMonths: 13, totalRandomEventCount: 7 });
    expect(advanced.pendingRandomEvents).toEqual([{ eventId: 18, serial: 7 }]);
    expect(advanced.eventQueue.filter((event) => event.randomReplay?.eventId === 17)).toHaveLength(1);
    expect(advanced.eventQueue.filter((event) => event.randomReplay?.eventId === 18)).toHaveLength(0);
    expect(advanced.availableRandomEvents).not.toContain(17);
    expect(advanced.availableRandomEvents).not.toContain(18);
    expect(advanced.usedRandomEvents.filter((eventId) => eventId === 17)).toHaveLength(1);
    expect(advanced.usedRandomEvents.filter((eventId) => eventId === 18)).toHaveLength(0);
    expect(rememberPendingRandomEvent(advanced, 17, 999)).toEqual(advanced);
  });
});
