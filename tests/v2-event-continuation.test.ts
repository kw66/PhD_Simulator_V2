import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { enqueueEventQueueItem } from "../src/core/v2-event-queue";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import * as fixedEvents from "../src/core/v2-fixed-events";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

function playing(): GameState {
  const state = createStartedGameState("normal");
  return { ...state, year: 1, month: 5, totalMonths: 5, selectedAdvisorName: "测试导师",
    eventQueue: [], availableRandomEvents: [], player: { ...state.player, money: 10 } };
}

function scene(id: string, chainId: string, stage: PendingEvent["stage"], effects: EventChoice["effects"] = {}): PendingEvent {
  return { id, title: id, description: id, chainId, stage, source: "random", blocking: true, deadlineMonths: 0,
    choices: [{ id: `${id}-ok`, label: "确认", outcome: "完成", effects }] };
}

function resolve(state: GameState, id: string, choiceIndex = 0): GameState {
  const event = state.eventQueue.find((item) => item.id === id)!;
  return dispatchAction(state, "resolve-event", { eventId: id, eventChoiceId: event.choices[choiceIndex]!.id });
}

describe("event continuation collisions", () => {
  it.each([false, true])("retains deferred rewards and the result scene when an id is occupied (same chain: %s)", (sameChain) => {
    const result = scene("chain-x-result", "chain-x", "result");
    let state = enqueueEventQueueItem(playing(), scene("chain-x-act1", "chain-x", "act1", { money: 5, enqueueEvents: [result] }));
    const collision = { ...scene(result.id, sameChain ? "chain-x" : "other", "act1"), deadlineMonths: 3 };
    state = enqueueEventQueueItem(state, collision);
    state = enqueueEventQueueItem(state, scene(`${result.id}~followup-1`, "another", "act1"));
    const original = structuredClone(state);
    const next = resolve(state, "chain-x-act1");
    expect(state).toEqual(original);
    expect(next.player.money).toBe(10);
    expect(next.eventHistory).toHaveLength(0);
    const continuation = next.eventQueue.find((event) => event.id === `${result.id}~followup-2`)!;
    expect(continuation.stage).toBe("result");
    expect(continuation.deferredStatePatch).toBeDefined();
    expect(next.eventQueue.find((event) => event.id === collision.id)?.chainId).toBe(collision.chainId);
    const completed = resolve(next, continuation.id);
    expect(completed.player.money).toBe(15);
    expect(completed.eventHistory.filter((record) => record.chainId === "chain-x")).toHaveLength(1);
    expect(dispatchAction(completed, "resolve-event", { eventId: continuation.id, eventChoiceId: continuation.choices[0]!.id }).player.money).toBe(15);
  });

  it("attaches the patch to exactly one successful continuation when the first id conflicts", () => {
    const first = scene("first-result", "chain", "result");
    const second = scene("second-result", "chain", "result");
    let state = enqueueEventQueueItem(playing(), scene("intro", "chain", "act1", { money: 5, enqueueEvents: [first, second] }));
    state = enqueueEventQueueItem(state, scene(first.id, "other", "result"));
    const next = resolve(state, "intro");
    const continuations = next.eventQueue.filter((event) => event.chainId === "chain");
    expect(continuations).toHaveLength(2);
    expect(continuations.filter((event) => event.deferredStatePatch)).toHaveLength(1);
    const afterSecond = resolve(next, second.id);
    expect(afterSecond.player.money).toBe(10);
    const afterFirst = resolve(afterSecond, continuations[0]!.id);
    expect(afterFirst.player.money).toBe(15);
  });

  it.each([false, true])("refreshes renamed random decisions and results (same-chain result collision: %s)", (sameChain) => {
    const state = playing();
    const rolls: number[] = [];
    const root = createRandomEventById(6, state, () => { rolls.push(0); return 0; }).event!;
    root.randomReplay = { eventId: 6, serial: state.totalRandomEventCount, rolls };
    const decisionId = root.choices[0]!.effects.enqueueEvents![0]!.id;
    let queued = enqueueEventQueueItem(state, root);
    queued = enqueueEventQueueItem(queued, scene(decisionId, "other", "act1"));
    const opened = resolve(queued, root.id);
    const decision = opened.eventQueue.find((event) => event.chainId === root.chainId)!;
    expect(decision.id).not.toBe(decisionId);
    const refreshedDecision = getResolvableQueuedEvent(opened, decision);
    const resultId = refreshedDecision.choices[0]!.effects.enqueueEvents![0]!.id;
    const blocked = enqueueEventQueueItem(opened, scene(resultId, sameChain ? root.chainId : "other-result", "act1"));
    const selected = resolve(blocked, decision.id);
    const result = selected.eventQueue.find((event) => event.chainId === root.chainId && event.stage === "result")!;
    expect(result.id).not.toBe(resultId);
    const changed = { ...selected, player: { ...selected.player, favor: 20, research: 18 } };
    const refreshedResult = getResolvableQueuedEvent(changed, result);
    expect(refreshedResult.id).toBe(result.id);
    expect(refreshedResult.description).toContain("SAN -0（减免2）");
    expect(refreshedResult.description).not.toBe(result.description);
    const replayed = dispatchAction({ ...changed, debugEventReplayEnabled: true }, "debug-replay-event", {
      eventId: result.id, eventHistoryIndex: 1,
    });
    expect(new Set(replayed.eventQueue.map((event) => event.id)).size).toBe(replayed.eventQueue.length);
    expect(replayed.eventQueue.find((event) => event.id === decisionId)?.chainId).toBe("other");
    expect(replayed.eventQueue.find((event) => event.chainId === root.chainId && event.history?.length)?.stage).toBe("act2");
    const completed = resolve(changed, result.id);
    expect(completed.player.favor).toBe(20);
    expect(completed.player.san).toBe(changed.player.san);
    expect(completed.eventQueue.some((event) => event.id === result.id)).toBe(false);
    expect(completed.eventQueue.find((event) => event.id === resultId)?.chainId).toBe(sameChain ? root.chainId : "other-result");
  });
});

describe("fixed event state preservation", () => {
  it("retains paper and progression changes returned by a fixed resolver", () => {
    const initial = playing();
    const paper = { ...createDraftPaper(5, 1, () => 0), idea: 7 };
    vi.spyOn(fixedEvents, "applyFixedEventResolution").mockImplementation((state) => ({
      nextState: { ...state, papers: [paper], degree: "phd", maxMonths: 68,
        totalResearchScore: 9, player: { ...state.player, social: 12 } },
      outcome: "完成",
    }));
    const resolved = applyChoiceEffectsToState(initial, {
      id: "fixed", label: "确认", outcome: "完成",
      effects: { money: 2, fixedEventResolution: { kind: "ccig-skip" } },
    }).nextState;
    expect(resolved.papers).toEqual([paper]);
    expect(resolved.degree).toBe("phd");
    expect(resolved.maxMonths).toBe(68);
    expect(resolved.totalResearchScore).toBe(9);
    expect(resolved.player.money).toBe(12);
    expect(resolved.relationshipState.unlockedSlots).toBe(4);
    expect(initial.papers).toHaveLength(0);
  });
});
