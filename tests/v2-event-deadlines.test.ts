import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { getBranchEventIntroChoice, isEventBlocking } from "../src/core/v2-event-auto-resolution";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { EventQueueItem, GameState, PendingEvent } from "../src/core/v2-types";

function learningState(): GameState {
  const started = createStartedGameState("normal");
  const state: GameState = { ...started, year: 1, month: 4, totalMonths: 4,
    randomState: { seed: 123, cursor: 0 }, selectedAdvisorName: "测试导师",
    eventQueue: [], pendingRandomEvents: [], availableRandomEvents: [],
    illnessProbability: 0, blockLinearEvents: true,
    player: { ...started.player, san: 20, money: 20, research: 4 },
  };
  const rolls: number[] = [];
  const root = createRandomEventById(9, state, () => { rolls.push(0.25); return 0.25; }).event!;
  root.randomReplay = { eventId: 9, serial: state.totalRandomEventCount, rolls };
  return { ...state, eventQueue: [createEventQueueItem(root, 1)] };
}

function current(state: GameState): EventQueueItem {
  const event = state.eventQueue.find(item => item.chainId === "random-9");
  if (!event) throw new Error("Missing learning event");
  return event;
}

function choose(state: GameState, index = 0): GameState {
  const event = current(state);
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[index]!.id });
}

function expectDeadline(state: GameState, expected: number): void {
  const event = current(state);
  const before = structuredClone(state);
  expect(event.deadlineMonths).toBe(expected);
  expect(getResolvableQueuedEvent(state, event).deadlineMonths).toBe(expected);
  expect(isEventBlocking(state, event)).toBe(expected === 0);
  const text = renderApp({ ...state, eventQueue: [event] }).replace(/<[^>]*>/gu, "");
  expect(text).toContain(`期限 ${expected > 0 ? `${expected}月后` : "本月"}`);
  expect(state).toEqual(before);
}

describe("event deadlines belong to the whole pending chain", () => {
  it("keeps one month through introduction, choice and result, then removes the event on confirmation", () => {
    let state = learningState();
    const before = structuredClone(state);
    const decision = current(state).choices[0]!.effects.enqueueEvents![0]!;
    expect(decision.deadlineMonths).toBe(1);
    expect(decision.choices.every(choice => choice.effects.enqueueEvents?.at(-1)?.deadlineMonths === 1)).toBe(true);
    for (const stage of ["act1", "act2", "result"] as const) {
      expect(current(state).stage).toBe(stage);
      expectDeadline(state, 1);
      expect(state.totalMonths).toBe(before.totalMonths);
      expect(state.player).toEqual(before.player);
      state = choose(state);
    }
    expect(state.eventQueue.some(item => item.chainId === "random-9")).toBe(false);
    expect(state.player.research).toBe(5);
    expect(state.eventHistory.filter(item => item.chainId === "random-9")).toHaveLength(1);
    expect(state.eventHistory.at(-1)?.completedAtTotalMonths).toBe(before.totalMonths);
  });

  it.each([0, 1, 2])("counts down only on a real month transition from stage %i", (resolvedStages) => {
    let state = learningState();
    for (let index = 0; index < resolvedStages; index++) state = choose(state);
    expectDeadline(state, 1);
    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(5);
    expectDeadline(state, 0);
    const due = structuredClone(state);
    expect(dispatchAction(state, "next-month").totalMonths).toBe(5);
    for (let index = resolvedStages; index < 2; index++) {
      state = choose(state);
      expectDeadline(state, 0);
    }
    expect(state.player).toEqual(due.player);
    const confirmed = choose(state);
    expect(confirmed.eventQueue.some(item => item.chainId === "random-9")).toBe(false);
    expect(confirmed.player.research).toBe(due.player.research + 1);
  });

  it.each([false, true])("preserves elapsed time through saved result previews and rewinds (debug: %s)", (debug) => {
    let state = learningState();
    if (debug) state = { ...state, debugEventReplayEnabled: true };
    state = choose(choose(state));
    state = dispatchAction(state, "next-month");
    const before = structuredClone(state.player);
    for (let attempt = 0; attempt < 3; attempt++) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      expectDeadline(state, 0);
      state = dispatchAction(state, debug ? "debug-replay-event" : "replay-event", {
        eventId: current(state).id, eventHistoryIndex: 0,
      });
      expect(current(state).stage).toBe("act1");
      expectDeadline(state, 0);
      state = choose(state);
      expectDeadline(state, 0);
      state = choose(state, attempt % 2);
      expectDeadline(state, 0);
      expect(state.player).toEqual(before);
      expect(state.totalMonths).toBe(5);
    }
  });

  it("inherits the active deadline for old nested scenes and keeps unrelated follow-up deadlines", () => {
    const scene = (id: string, chainId: string, stage: PendingEvent["stage"], deadlineMonths: number, next: PendingEvent[] = []): PendingEvent => ({
      id, chainId, stage, deadlineMonths, source: "system", title: id, description: "", blocking: true,
      choices: [{ id: "continue", label: "继续", outcome: "", effects: { enqueueEvents: next } }],
    });
    const result = scene("deadline-result", "random-9", "result", 0);
    const unrelated = scene("unrelated", "unrelated", "act1", 3);
    const decision = scene("deadline-choice", "random-9", "act2", 0, [result, unrelated]);
    const root = scene("deadline-root", "random-9", "act1", 1, [decision]);
    let state = { ...learningState(), eventQueue: [createEventQueueItem(root, 1)] };
    state = choose(state);
    expectDeadline(state, 1);
    state = choose(state);
    expectDeadline(state, 1);
    expect(state.eventQueue.find(item => item.id === unrelated.id)?.deadlineMonths).toBe(3);
  });

  it("skips a branched introduction without making the event due immediately", () => {
    const state = { ...learningState(), skipBranchEventIntro: true };
    const intro = current(state);
    const choice = getBranchEventIntroChoice(state, intro);
    expect(choice).not.toBeNull();
    const next = dispatchAction(state, "resolve-event", { eventId: intro.id, eventChoiceId: choice!.id });
    expect(current(next).stage).toBe("act2");
    expectDeadline(next, 1);
  });

  it.each(["result", "act3"] as const)("keeps a new follow-up task's own deadline after %s confirmation", (stage) => {
    const next: PendingEvent = { id: "next-task", chainId: "random-9", stage: "act1", deadlineMonths: 3,
      source: "system", title: "New task", description: "", blocking: true, choices: [] };
    const final: PendingEvent = { id: "completed-task", chainId: "random-9", stage, deadlineMonths: 0,
      source: "system", title: "Completed task", description: "", blocking: true,
      choices: [{ id: "confirm", label: "确定", outcome: "", effects: { enqueueEvents: [next] } }] };
    const state = { ...learningState(), eventQueue: [createEventQueueItem(final, 1)] };
    const after = choose(state);
    expect(current(after).id).toBe(next.id);
    expectDeadline(after, 3);
  });

  it("retains the previous deadline behavior only when replaying historical r11 commands", () => {
    withGameplayRuleset("20261019-r11", () => {
      const state = learningState();
      expect(current(state).deadlineMonths).toBe(1);
      expect(current(state).choices[0]!.effects.enqueueEvents![0]!.deadlineMonths).toBe(0);
      expect(current(choose(state)).deadlineMonths).toBe(0);
    });
    expectDeadline(choose(learningState()), 1);
  });
});
