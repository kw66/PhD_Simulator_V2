import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

const COMPETITIONS = [
  { eventId: 17, field: "idea", otherEventId: 18, otherField: "experiment" },
  { eventId: 18, field: "experiment", otherEventId: 17, otherField: "idea" },
] as const;

const RESPONSES = [
  { choiceIndex: 1, multiplier: 0.5, sanCost: 1 },
  { choiceIndex: 3, multiplier: 1.25, sanCost: 6 },
] as const;

function makePaper(index: number, overrides: Partial<Paper> = {}): Paper {
  return {
    ...createDraftPaper(6, index, () => 0),
    title: `Debug competition paper ${index}`,
    idea: 40,
    experiment: 60,
    writing: 20,
    collaborators: [{ id: `collaborator-${index}`, name: `Collaborator ${index}` }],
    collaborationScores: { idea: 8, experiment: 12, writing: 4 },
    ...overrides,
  };
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
    papers,
    externalPublications: [],
    selectedPaperId: papers[0]?.id ?? null,
    availableRandomEvents: [17, 18],
    usedRandomEvents: [11, 14, 16],
    pendingRandomEvents: [],
    totalRandomEventCount: 7,
    illnessProbability: 0,
    buffs: [],
    player: { ...started.player, san: 20, money: 23, research: 4, social: 4 },
  };
}

function triggerCompetition(state: GameState, eventId: 17 | 18): GameState {
  return dispatchAction(state, "debug-trigger-event", { eventId: `random-${eventId}` });
}

function getCompetition(state: GameState, eventId: 17 | 18) {
  const events = state.eventQueue.filter((event) => event.chainId === `random-${eventId}`);
  expect(events).toHaveLength(1);
  return events[0]!;
}

function getTarget(state: GameState, eventId: 17 | 18): Paper {
  const event = getCompetition(state, eventId);
  const target = state.papers.find((paper) => paper.id === event.paperCompetitionTargetId);
  expect(target).toBeDefined();
  return target!;
}

function resolveCompetition(state: GameState, eventId: 17 | 18, choiceIndex = 0): GameState {
  const event = getCompetition(state, eventId);
  return dispatchAction(state, "resolve-event", {
    eventId: event.id,
    eventChoiceId: event.choices[choiceIndex]!.id,
  });
}

function expectDebugResourcesUnchanged(actual: GameState, before: GameState): void {
  expect(actual.player).toEqual(before.player);
  expect(actual.actionState).toEqual(before.actionState);
  expect(actual.buffs).toEqual(before.buffs);
  expect(actual.relationshipState).toEqual(before.relationshipState);
  expect(actual.externalPublications).toEqual(before.externalPublications);
  expect(actual.log).toEqual(before.log);
  expect(actual.eventHistory).toEqual(before.eventHistory);
}

function expectRootTarget(state: GameState, eventId: 17 | 18, paperId: string): void {
  const event = getCompetition(state, eventId);
  expect(event.paperCompetitionTargetId).toBe(paperId);
  expect(event.replayContext?.rootEvent).toMatchObject({
    chainId: `random-${eventId}`,
    stage: "act1",
    paperCompetitionTargetId: paperId,
  });
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(COMPETITIONS)("debug paper competition $eventId: $field", ({ eventId, field, otherEventId, otherField }) => {
  it("immediately queues the first click without papers, costs or gameplay logs", () => {
    const initial = makeState();
    const snapshot = structuredClone(initial);
    const queued = triggerCompetition(initial, eventId);
    const target = getTarget(queued, eventId);

    expect(queued.papers).toHaveLength(1);
    expect(queued.eventQueue).toHaveLength(1);
    expect(target.status).toBe("draft");
    expect(target.nonFirstAuthor).not.toBe(true);
    expect(Number.isFinite(target[field])).toBe(true);
    expect(target[field]).toBeGreaterThan(0);
    expect(getCompetition(queued, eventId)).toMatchObject({
      stage: "act1", randomReplay: { eventId, serial: 8 },
    });
    expectRootTarget(queued, eventId, target.id);
    expect(queued.pendingRandomEvents).toEqual([]);
    expect(queued.totalRandomEventCount).toBe(8);
    expectDebugResourcesUnchanged(queued, snapshot);
    expect(initial).toEqual(snapshot);
  });

  it.each(["blank", "non-first-author", "journal", "mixed"] as const)(
    "adds only one eligible test draft when existing papers are %s",
    (kind) => {
      const ineligible = [
        makePaper(0, { idea: 0, experiment: 0, writing: 0, collaborationScores: {}, collaborators: [] }),
        makePaper(1, { nonFirstAuthor: true, leadAuthorName: "Existing lead author" }),
        makePaper(2, { status: "journal-reviewing", journalTarget: "nature" }),
      ];
      const papers = kind === "mixed" ? ineligible
        : [ineligible[kind === "blank" ? 0 : kind === "non-first-author" ? 1 : 2]!];
      const initial = makeState(papers);
      const snapshot = structuredClone(initial);
      const queued = triggerCompetition(initial, eventId);
      const target = getTarget(queued, eventId);

      expect(queued.papers).toHaveLength(papers.length + 1);
      expect(queued.papers.filter((paper) => paper.id !== target.id)).toEqual(snapshot.papers);
      expect(snapshot.papers.some((paper) => paper.id === target.id)).toBe(false);
      expect(new Set(queued.papers.map((paper) => paper.id)).size).toBe(queued.papers.length);
      expect(target.status).toBe("draft");
      expect(target.nonFirstAuthor).not.toBe(true);
      expect(target[field]).toBeGreaterThan(0);
      expect(queued.eventQueue).toHaveLength(1);
      expect(queued.pendingRandomEvents).toEqual([]);
      expect(queued.totalRandomEventCount).toBe(8);
      expectDebugResourcesUnchanged(queued, snapshot);
      expect(initial).toEqual(snapshot);
    },
  );

  it.each(["draft", "reviewing"] as const)("reuses an eligible %s without rewriting any score or metadata", (status) => {
    const initial = makeState([makePaper(0, {
      status,
      submittedIdea: status === "reviewing" ? 40 : null,
      submittedExperiment: status === "reviewing" ? 60 : null,
      submittedWriting: status === "reviewing" ? 20 : null,
    })]);
    const snapshot = structuredClone(initial);
    const queued = triggerCompetition(initial, eventId);

    expect(getTarget(queued, eventId).id).toBe(initial.papers[0]!.id);
    expect(queued.papers).toEqual(snapshot.papers);
    expect(queued.totalRandomEventCount).toBe(8);
    expectDebugResourcesUnchanged(queued, snapshot);
    expect(initial).toEqual(snapshot);
  });

  describe.each([0, 0.99])("target selection with roll %s", (roll) => {
    it.each(RESPONSES)("settles only the bound paper with x$multiplier and SAN -$sanCost once", ({ choiceIndex, multiplier, sanCost }) => {
      const initial = makeState([
        makePaper(0, { [field]: 0, collaborationScores: { [field]: 0 } }),
        makePaper(1),
        makePaper(2, { nonFirstAuthor: true }),
        makePaper(3, {
          status: "reviewing", target: "A",
          idea: 80, experiment: 100, writing: 24,
          collaborationScores: { idea: 16, experiment: 20, writing: 4 },
          submittedIdea: 80, submittedExperiment: 100, submittedWriting: 24,
          submittedCollaborationScores: { idea: 16, experiment: 20, writing: 4 },
          submittedMonth: 6, submittedYear: 1, reviewMonthsLeft: 2,
        }),
      ]);
      const snapshot = structuredClone(initial);
      const target = initial.papers[roll === 0 ? 1 : 3]!;
      vi.mocked(Math.random).mockReturnValue(roll);
      const queued = triggerCompetition(initial, eventId);
      expect(queued.eventQueue).toHaveLength(1);
      expectRootTarget(queued, eventId, target.id);
      expectDebugResourcesUnchanged(queued, snapshot);
      vi.mocked(Math.random).mockReturnValue(roll === 0 ? 0.99 : 0);
      const decision = resolveCompetition(queued, eventId);
      const result = resolveCompetition(decision, eventId, choiceIndex);

      for (const [index, intermediate] of [queued, decision, result].entries()) {
        expect(getCompetition(intermediate, eventId).stage).toBe(["act1", "act2", "result"][index]);
        expectRootTarget(intermediate, eventId, target.id);
        expect(intermediate.papers).toEqual(snapshot.papers);
        expect(intermediate.player).toEqual(snapshot.player);
        expect(intermediate.actionState).toEqual(snapshot.actionState);
        expect(intermediate.totalRandomEventCount).toBe(8);
      }

      const confirmation = getCompetition(result, eventId);
      const completed = resolveCompetition(result, eventId);
      expect(completed.papers).toEqual(snapshot.papers.map((paper) => paper.id === target.id ? {
        ...paper,
        [field]: paper[field] * multiplier,
        collaborationScores: { ...paper.collaborationScores, [field]: paper.collaborationScores![field]! * multiplier },
      } : paper));
      const expectedSanCost = eventId === 17 && choiceIndex === 3 ? 4 : sanCost;
      expect(completed.player).toEqual({ ...snapshot.player, san: snapshot.player.san - expectedSanCost });
      expect(completed.actionState).toEqual(snapshot.actionState);
      expect(completed.buffs).toEqual(snapshot.buffs);
      expect(completed.relationshipState).toEqual(snapshot.relationshipState);
      expect(completed.externalPublications).toEqual(snapshot.externalPublications);
      expect(completed.eventQueue).toEqual([]);
      expect(completed.pendingRandomEvents).toEqual([]);
      expect(completed.totalRandomEventCount).toBe(8);
      expect(completed.eventHistory).toHaveLength(1);
      expect(completed.eventHistory[0]!.stages).toHaveLength(3);
      expect(dispatchAction(completed, "resolve-event", {
        eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id,
      })).toEqual(completed);
      expect(initial).toEqual(snapshot);
    });
  });

  it.each(["empty", "eligible", "hidden"] as const)("keeps repeated clicks idempotent throughout every act from %s", (source) => {
    const initial = makeState(source === "eligible" ? [makePaper(0)] : []);
    if (source === "hidden") {
      initial.pendingRandomEvents = [{ eventId, serial: 6 }];
      initial.availableRandomEvents = [otherEventId];
    }
    let state = triggerCompetition(initial, eventId);
    const targetId = getTarget(state, eventId).id;
    const expectedCount = source === "hidden" ? 7 : 8;
    expect(getCompetition(state, eventId).randomReplay?.serial).toBe(source === "hidden" ? 6 : 8);

    for (const stage of ["act1", "act2", "result"]) {
      expect(getCompetition(state, eventId).stage).toBe(stage);
      const snapshot = structuredClone(state);
      vi.mocked(Math.random).mockReturnValue(0.99);
      for (let click = 0; click < 3; click += 1) {
        state = triggerCompetition(state, eventId);
        expect(state).toEqual(snapshot);
        expectRootTarget(state, eventId, targetId);
        expect(state.papers).toHaveLength(1);
        expect(state.totalRandomEventCount).toBe(expectedCount);
        expect(state.usedRandomEvents.filter((entry) => entry === eventId)).toHaveLength(1);
      }
      if (stage !== "result") state = resolveCompetition(state, eventId);
    }
  });

  it("does not create a replacement or duplicate when the queued target was discarded", () => {
    const queued = triggerCompetition(makeState(), eventId);
    const targetId = getTarget(queued, eventId).id;
    const discarded = dispatchAction(queued, "discard-paper", { paperId: targetId });
    expect(discarded.papers).toEqual([]);
    expect(triggerCompetition(discarded, eventId)).toEqual(discarded);
    expectRootTarget(discarded, eventId, targetId);
  });

  it.each(["both", "other-only"] as const)("activates coexisting hidden opportunities once with consistent root targets: %s", (hidden) => {
    const initial = makeState();
    initial.pendingRandomEvents = hidden === "both"
      ? [{ eventId, serial: 6 }, { eventId: otherEventId, serial: 7 }]
      : [{ eventId: otherEventId, serial: 7 }];
    initial.availableRandomEvents = hidden === "both" ? [] : [eventId];
    const queued = triggerCompetition(initial, eventId);
    const target = getTarget(queued, eventId);
    const expectedCount = hidden === "both" ? 7 : 8;
    expect(queued.papers).toHaveLength(1);
    expect(queued.totalRandomEventCount).toBe(expectedCount);
    expect(getCompetition(queued, eventId).randomReplay?.serial).toBe(hidden === "both" ? 6 : 8);
    expectDebugResourcesUnchanged(queued, initial);

    const awake = dispatchAction(queued, "research-paper", { paperId: target.id, paperActionType: otherField });
    expect(awake.papers[0]![otherField]).toBeGreaterThan(0);
    expect(awake.papers).toHaveLength(1);
    expect(awake.eventQueue).toHaveLength(2);
    expect(awake.pendingRandomEvents).toEqual([]);
    expect(awake.totalRandomEventCount).toBe(expectedCount);
    expect(getCompetition(awake, otherEventId).randomReplay?.serial).toBe(7);

    let repeated = awake;
    for (const currentId of [eventId, otherEventId, eventId, otherEventId]) {
      expectRootTarget(repeated, currentId, target.id);
      expect(repeated.usedRandomEvents.filter((entry) => entry === currentId)).toHaveLength(1);
      repeated = triggerCompetition(repeated, currentId);
      repeated = dispatchAction(repeated, "select-paper", { paperId: target.id });
      expect(repeated).toEqual(awake);
    }
  });

  it("keeps normal scheduling hidden until conditions or an explicit debug click supply a target", () => {
    const initial = { ...makeState(), availableRandomEvents: [eventId] };
    const snapshot = structuredClone(initial);
    const getRoll = vi.fn().mockReturnValueOnce(0.8).mockReturnValue(0);
    const drawn = collectRandomEventsForMonth(initial, getRoll);
    expect(drawn.events).toEqual([]);
    expect(drawn.nextState.papers).toEqual([]);
    expect(drawn.nextState.eventQueue).toEqual([]);
    expect(drawn.nextState.pendingRandomEvents).toEqual([{ eventId, serial: 8 }]);
    expect(drawn.nextState.totalRandomEventCount).toBe(8);
    expectDebugResourcesUnchanged(drawn.nextState, snapshot);

    const queued = triggerCompetition(drawn.nextState, eventId);
    expect(getCompetition(queued, eventId).randomReplay?.serial).toBe(8);
    expect(getTarget(queued, eventId)[field]).toBeGreaterThan(0);
    expect(queued.papers).toHaveLength(1);
    expect(queued.pendingRandomEvents).toEqual([]);
    expect(queued.totalRandomEventCount).toBe(8);
    expectDebugResourcesUnchanged(queued, snapshot);
    expect(initial).toEqual(snapshot);
  });
});
