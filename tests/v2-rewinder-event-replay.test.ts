import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { createEntertainmentCampusRandomEvent } from "../src/core/v2-random-events-campus-entertainment";
import { canRewindPendingEvent } from "../src/core/v2-rewinder-event-replay";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createStore } from "../src/core/v2-store";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { saveAccountProfile } from "../src/core/v2-account-storage";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import type { EventQueueItem, GameState } from "../src/core/v2-types";

function base(): GameState {
  const initial = { ...createInitialState(), randomState: { seed: 1700000000, cursor: 0 } };
  const started = dispatchAction(initial, "start-game", { roleId: "rewinder" });
  return dispatchAction({ ...started, month: 6, totalMonths: 6, selectedAdvisorName: "测试导师", eventQueue: [],
    player: { ...started.player, san: 20, favor: 8, research: 6, money: 30 } }, "resolve-event", { eventId: "fixture-initialize" });
}

function current(state: GameState, chainId: string): EventQueueItem {
  const event = state.eventQueue.find(item => item.chainId === chainId);
  if (!event) throw new Error(`Missing ${chainId}`);
  return event;
}

function choose(state: GameState, chainId: string, index = 0): GameState {
  const event = current(state, chainId);
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[index]!.id });
}

function rewind(state: GameState, chainId: string, targetIndex = 1, eventChoiceId?: string): GameState {
  return dispatchAction(state, "rewinder-replay-event", {
    eventId: current(state, chainId).id, eventHistoryIndex: targetIndex, eventChoiceId,
  });
}

function gameplay(state: GameState) {
  const { eventQueue: _queue, ...rest } = state;
  return rest;
}

describe("rewinder pending event choices", () => {
  it("lets ordinary rewinder runs inspect every Teacher's Day branch repeatedly without rerolls or rewards", () => {
    const original = base();
    const chain = "teachers-day";
    let state = { ...original, eventQueue: [createEventQueueItem(createTeachersDayEvent(original, () => 0), 1)] };
    state = choose(state, chain);
    const decision = structuredClone(state);
    const results = new Map<string, EventQueueItem>();
    for (const choice of current(decision, chain).choices) {
      state = choose(state, chain, current(state, chain).choices.findIndex(item => item.id === choice.id));
      results.set(choice.id, structuredClone(current(state, chain)));
      expect(gameplay(state)).toEqual(gameplay(decision));
      expect(canRewindPendingEvent(state, current(state, chain), 1)).toBe(true);
      state = rewind(state, chain);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const [choiceId, expected] of results) {
        state = choose(state, chain, current(state, chain).choices.findIndex(item => item.id === choiceId));
        expect(current(state, chain)).toEqual(expected);
        expect(gameplay(state)).toEqual(gameplay(decision));
        state = rewind(state, chain);
      }
    }
    state = choose(rewind(state, chain, 0), chain);
    expect(current(state, chain)).toEqual(current(decision, chain));
    const selected = choose(state, chain);
    const shifted = { ...selected, randomState: { ...selected.randomState!, cursor: selected.randomState!.cursor + 97 } };
    const sameChoice = current(decision, chain).choices[0]!.id;
    const fixedAfterOtherRandomness = rewind(shifted, chain, 1, sameChoice);
    expect(current(fixedAfterOtherRandomness, chain)).toEqual(results.get(sameChoice));
    expect(fixedAfterOtherRandomness.randomState).toEqual(shifted.randomState);
    expect(new Set(current(fixedAfterOtherRandomness, chain).fixedResultPreview!.rolls).size).toBeGreaterThan(1);
    state = choose(state, chain, 1);
    const straight = choose(choose(decision, chain, 1), chain);
    const final = choose(state, chain);
    expect(final).toEqual(straight);
    expect(final.player.money).toBe(decision.player.money - 1);
    expect(final.eventHistory.filter(event => event.chainId === chain)).toHaveLength(1);
    expect(final.eventHistory.at(-1)?.debugReplayable).not.toBe(true);
    expect(final.eventHistory.at(-1)?.stages.every(stage => stage.replayEvent === undefined)).toBe(true);
  });

  it("retains a random event's branch outcomes across JSON reload and direct history-choice clicks", () => {
    const original = base();
    const chain = "random-15";
    const rolls: number[] = [];
    const supplied = [0.1, 0.9];
    const root = createEntertainmentCampusRandomEvent(original, () => {
      const roll = supplied.shift() ?? 0.4; rolls.push(roll); return roll;
    });
    let state = choose({ ...original, eventQueue: [createEventQueueItem({ ...root,
      randomReplay: { eventId: 15, serial: original.totalRandomEventCount, rolls } }, 1)] }, chain);
    const decision = structuredClone(state);
    const firstId = current(state, chain).choices[2]!.id;
    state = choose(state, chain, 2);
    const firstResult = structuredClone(current(state, chain));
    state = JSON.parse(JSON.stringify(state)) as GameState;
    const otherId = current(decision, chain).choices[3]!.id;
    const alternate = rewind(state, chain, 1, otherId);
    expect(current(alternate, chain).history?.at(-1)?.selectedChoiceId).toBe(otherId);
    const repeated = rewind(alternate, chain, 1, firstId);
    expect(current(repeated, chain)).toEqual(firstResult);
    expect(gameplay(repeated)).toEqual(gameplay(state));
    expect(choose(repeated, chain)).toEqual(choose(choose(decision, chain, 2), chain));
  });

  it("rejects other roles, old months, invalid targets, other chains and already confirmed events", () => {
    const original = base();
    const root = createTeachersDayEvent(original, () => 0);
    const result = choose(choose({ ...original, eventQueue: [createEventQueueItem(root, 1)] }, root.chainId), root.chainId);
    const event = current(result, root.chainId);
    const invalidStates: GameState[] = [
      { ...result, selectedRoleId: "normal" }, { ...result, phase: "finished", ending: "burnout" },
      { ...result, totalMonths: result.totalMonths + 1 },
    ];
    for (const state of invalidStates) expect(canRewindPendingEvent(state, event, 1)).toBe(false);
    for (const index of [-1, 0.5, NaN, 99]) expect(canRewindPendingEvent(result, event, index)).toBe(false);
    for (const payload of [{ eventId: "missing", eventHistoryIndex: 1 },
      { eventId: event.id, eventHistoryIndex: 1, eventChoiceId: "not-a-choice" }]) {
      expect(dispatchAction(result, "rewinder-replay-event", payload)).toEqual(result);
    }
    const tampered = { ...event, history: event.history!.map((stage, index) => index !== 1 ? stage : {
      ...stage, replayEvent: { ...stage.replayEvent!, chainId: "unrelated-chain" },
    }) };
    expect(canRewindPendingEvent({ ...result, eventQueue: [tampered] }, tampered, 1)).toBe(false);
    const finished = choose(result, root.chainId);
    expect(dispatchAction(finished, "rewinder-replay-event", { eventId: event.id, eventHistoryIndex: 1 })).toEqual(finished);
  });

  it("keeps pre-r8 replay event shapes unchanged", () => {
    const original = base();
    const root = createTeachersDayEvent(original, () => 0);
    const pending = withGameplayRuleset("20261018-r7", () => choose({ ...original, eventQueue: [createEventQueueItem(root, 1)] }, root.chainId));
    expect(current(pending, root.chainId).rewinderReplay).toBeUndefined();
    expect(current(pending, root.chainId).history?.[0]?.replayEvent?.rewinderReplay).toBeUndefined();
    expect(canRewindPendingEvent(pending, current(pending, root.chainId), 0)).toBe(false);
  });

  it("saves, reloads and verifies normal rewinds without debug disqualification", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    const account = createDefaultAccountProfile();
    account.roleProgress.rewinder.unlocked = true;
    saveAccountProfile(account, storage);
    const adapter = createMemoryRunSaveAdapter();
    const repository = () => createRunSaveRepository({ storage, adapter });
    let saves = repository();
    let store = createStore({ storage, saves });
    await store.ready();
    store.getState().randomState = { seed: 1700000000, cursor: 0 };
    store.dispatch("start-game", { roleId: "rewinder" });
    for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
      const event = current(store.getState(), "before-grad-school");
      store.dispatch("resolve-event", { eventId: event.id, eventChoiceId });
    }
    store.dispatch("next-month");
    const chain = "teachers-day";
    const select = (index = 0) => {
      const event = current(store.getState(), chain);
      store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: event.choices[index]!.id });
    };
    select(); select(1);
    const result = structuredClone(current(store.getState(), chain));
    const choiceId = result.history![1]!.selectedChoiceId;
    store.dispatch("rewinder-replay-event", { eventId: result.id, eventHistoryIndex: 1, eventChoiceId: choiceId });
    expect(current(store.getState(), chain)).toEqual(result);
    await store.flushSaves();
    expect(saves.get("rewinder")!.replay!.commands.at(-1)).toMatchObject({ actionId: "rewinder-replay-event" });
    saves = repository();
    store = createStore({ storage, saves });
    await store.ready(); store.dispatch("start-game", { roleId: "rewinder" });
    expect(current(store.getState(), chain)).toEqual(result);
    expect(store.getReplayStatus().failed).toBeUndefined();
    store.dispatch("rewinder-replay-event", { eventId: result.id, eventHistoryIndex: 1 });
    select(1); select();
    expect(store.getState().eventHistory.filter(event => event.chainId === chain)).toHaveLength(1);
    store.dispatch("quit-game");
    expect(store.getReplayStatus().failed).toBeUndefined();
    expect(store.isCurrentRunDebugged()).toBe(false);
    expect(store.isCurrentRunDisqualified()).toBe(false);
    expect(store.getEndingExperienceAward()?.disqualifiedByDebug).not.toBe(true);
    store.dispatch("settle-and-return");
    expect(store.getState().phase).toBe("setup");
  });
});
