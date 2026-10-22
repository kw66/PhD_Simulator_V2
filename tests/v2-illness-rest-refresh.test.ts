import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { enqueuePendingEvents } from "../src/core/v2-event-enqueue";
import { createIllnessRandomEvent } from "../src/core/v2-random-events-core-health";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { canRewindPendingEvent } from "../src/core/v2-event-replay";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { renderPlayScreen } from "../src/app/v2-render-play";
import type { GameState } from "../src/core/v2-types";

function queuedIllness(used = 0): GameState {
  const base = createStartedGameState("normal");
  const state: GameState = { ...base, phase: "playing", selectedAdvisorName: "测试导师", year: 2, month: 3,
    totalMonths: 15, eventQueue: [], totalRandomEventCount: 10, randomState: { seed: 1707, cursor: 0 },
    player: { ...base.player, san: 10, money: 20 }, actionState: { ...base.actionState, used, limit: 1 } };
  return enqueuePendingEvents(state, [createIllnessRandomEvent(state, () => 0, "fever")]).nextState;
}
function current(state: GameState) { return state.eventQueue.find(event => event.chainId === "illness-fever")!; }
function restChoice(state: GameState) { return getResolvableQueuedEvent(state, current(state)).choices.find(choice => choice.effects.restAction)!; }
function choose(state: GameState, rest = false): GameState {
  const event = current(state);
  const choice = rest ? event.choices.find(entry => entry.effects.restAction)! : event.choices[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

describe("queued illness rest follows current action availability", () => {
  it("disables a previously queued rest option after a normal action outside the event", () => {
    const queued = queuedIllness();
    const spent = dispatchAction(queued, "rest");
    expect(spent.actionState.used).toBe(1);
    const decision = choose(spent);
    expect(current(decision).stage).toBe("act2");
    expect(restChoice(decision).disabledReason).toBe("本月行动点已用尽，无法休息");
    const rejected = choose(decision, true);
    expect(current(rejected).id).toBe(current(decision).id);
    expect(rejected.player).toEqual(decision.player);
  });

  it("re-enables a queued option when another regular action becomes available", () => {
    let state = choose(queuedIllness(1));
    expect(restChoice(state).disabledReason).toBeTruthy();
    state = refreshPendingEventDecisions({ ...state, actionState: { ...state.actionState, limit: 2 } });
    expect(restChoice(state).disabledReason).toBeUndefined();
    const result = choose(state, true);
    expect(current(result).stage).toBe("result");
    expect(result.actionState.used).toBe(1);
    const settled = choose(result);
    expect(settled.actionState.used).toBe(2);
    expect(settled.eventQueue.some(event => event.chainId === "illness-fever")).toBe(false);
  });

  it("blocks stale result confirmation without settling, and still allows returning to the decision", () => {
    const result = choose(choose(queuedIllness()), true);
    expect(current(result).deferredChoices?.some(entry => entry.choice.effects.restAction)).toBe(true);
    const spent = dispatchAction(result, "rest");
    const refreshed = refreshPendingEventDecisions(spent);
    const event = getResolvableQueuedEvent(refreshed, current(refreshed));
    expect(event.choices[0]!.disabledReason).toBe("本月行动点已用尽，无法休息");
    expect(choose(refreshed).player).toEqual(refreshed.player);
    expect(choose(refreshed).buffs).toEqual(refreshed.buffs);
    expect(canRewindPendingEvent(refreshed, current(refreshed), 1)).toBe(true);
    const returned = dispatchAction(refreshed, "rewinder-replay-event", { eventId: event.id, eventHistoryIndex: 1 });
    expect(current(returned).stage).toBe("act2");
    expect(restChoice(returned).disabledReason).toBeTruthy();
    expect(current(returned).choices.find(choice => choice.id.includes("hospital"))?.disabledReason).toBeUndefined();
    expect(returned.player).toEqual(refreshed.player);
  });

  it("refreshes deferred result confirmation in both directions after JSON save round trips", () => {
    let state = choose(choose(queuedIllness()), true);
    state = dispatchAction(state, "rest");
    state = refreshPendingEventDecisions(JSON.parse(JSON.stringify(state)) as GameState);
    expect(current(state).choices[0]!.disabledReason).toBeTruthy();
    const cursor = state.randomState;
    state = refreshPendingEventDecisions({ ...state, actionState: { ...state.actionState, limit: 2 } });
    state = refreshPendingEventDecisions(JSON.parse(JSON.stringify(state)) as GameState);
    expect(current(state).choices[0]!.disabledReason).toBeUndefined();
    expect(state.randomState).toEqual(cursor);
    const confirmed = choose(state);
    expect(confirmed.actionState.used).toBe(2);
    expect(confirmed.eventQueue.some(event => event.chainId === "illness-fever")).toBe(false);
  });

  it("uses the real rest allowance including an unused doctoral alpha action", () => {
    let state = choose(queuedIllness(1));
    state = refreshPendingEventDecisions({ ...state, degree: "phd", roleTalents: {
      ...state.roleTalents, levels: { ...state.roleTalents?.levels, "burning-life-alpha": 1 }, initialized: true,
    } });
    expect(restChoice(state).disabledReason).toBeUndefined();
    state = refreshPendingEventDecisions({ ...state, roleTalents: { ...state.roleTalents!, alphaUsedMonth: state.totalMonths } });
    expect(restChoice(state).disabledReason).toBeTruthy();
  });

  it("preserves an unrelated restriction rather than clearing every disabled reason", () => {
    let state = choose(queuedIllness(1));
    state = { ...state, eventQueue: state.eventQueue.map(event => ({ ...event,
      choices: event.choices.map(choice => choice.effects.restAction ? { ...choice, disabledReason: "独立条件尚未满足" } : choice),
    })) };
    state = refreshPendingEventDecisions({ ...state, actionState: { ...state.actionState, limit: 2 } });
    expect(restChoice(state).disabledReason).toBe("独立条件尚未满足");
  });

  it("keeps r17 decision behavior for historical replay commands", () => withGameplayRuleset("20261022-r17", () => {
    const decision = choose(dispatchAction(queuedIllness(), "rest"));
    expect(restChoice(decision).disabledReason).toBeUndefined();
    expect(current(choose(decision, true)).id).toBe(current(decision).id);
    const unavailableAtCreation = choose(queuedIllness(1));
    const restored = refreshPendingEventDecisions({ ...unavailableAtCreation, actionState: { ...unavailableAtCreation.actionState, limit: 2 } });
    expect(restChoice(restored).disabledReason).toBeTruthy();
  }));

  it("keeps r17 result confirmation behavior without consuming a second rest", () => withGameplayRuleset("20261022-r17", () => {
    const result = choose(choose(queuedIllness()), true);
    const spent = dispatchAction(result, "rest");
    expect(getResolvableQueuedEvent(spent, current(spent)).choices[0]!.disabledReason).toBeUndefined();
    const rejected = choose(spent);
    expect(rejected.player).toEqual(spent.player);
    expect(current(rejected).id).toBe(current(spent).id);
  }));

  it.each(["decision", "result"] as const)("updates illness recovery after buying a hammock during the %s scene", (scene) => {
    let state = queuedIllness();
    state = { ...state, player: { ...state.player, money: 30 } };
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "chair" });
    state = choose(state);
    expect(restChoice(state).outcome).toContain("SAN +2");
    if (scene === "result") state = choose(state, true);
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-hammock" });
    expect(state.shopState.chairUpgrade).toBe("hammock");
    if (scene === "decision") {
      expect(restChoice(state).outcome).toContain("SAN +5");
      expect(restChoice(state).outcome).toContain("SAN -7.5");
      state = choose(state, true);
    }
    const preview = getResolvableQueuedEvent(state, current(state));
    expect(preview.description).toContain("SAN +5");
    expect(preview.description).toContain("SAN -7.5");
    expect(preview.completionLog).toContain("SAN +5");
    expect(preview.description).not.toContain("SAN +2");
    const settled = choose(state);
    expect(settled.player.san).toBe(7.5);
    expect(settled.actionState.used).toBe(1);
    expect(settled.log.some(entry => entry.text.includes("SAN +5") && entry.text.includes("SAN -7.5"))).toBe(true);
  });

  it("retains r18 recovery copy even though settlement already uses the current hammock", () => withGameplayRuleset("20261022-r18", () => {
    let state = queuedIllness();
    state = { ...state, player: { ...state.player, money: 30 } };
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "chair" });
    state = choose(state);
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-hammock" });
    expect(restChoice(state).outcome).toContain("SAN +2");
    state = choose(state, true);
    expect(getResolvableQueuedEvent(state, current(state)).description).toContain("SAN +2");
    const settled = choose(state);
    expect(settled.player.san).toBe(7.5);
    expect(settled.log.some(entry => entry.text.includes("SAN +2") && entry.text.includes("SAN -7.5"))).toBe(true);
  }));

  it("renders a stale saved decision with its rest button disabled before any gameplay action", () => {
    const decision = choose(queuedIllness());
    const stale = JSON.parse(JSON.stringify({ ...decision, actionState: { ...decision.actionState, used: 1 } })) as GameState;
    expect(current(stale).choices.find(choice => choice.effects.restAction)!.disabledReason).toBeUndefined();
    const before = JSON.stringify(stale);
    const html = renderPlayScreen(stale, { isEventContentOpen: true, activeEventId: current(stale).id });
    const button = html.match(/<button\b[^>]*title="本月行动点已用尽，无法休息"[^>]*>/u)?.[0];
    expect(button).toBeDefined();
    expect(button).toContain('disabled aria-disabled="true"');
    expect(button).not.toContain('data-action="resolve-event"');
    expect(JSON.stringify(stale)).toBe(before);
  });

  it("does not rewrite unrelated choices or non-illness SAN recovery text", () => {
    let state = choose(queuedIllness());
    state = { ...state, shopState: { ...state.shopState, chairUpgrade: "hammock" }, eventQueue: state.eventQueue.map(event => ({
      ...event, choices: event.choices.map(choice => choice.effects.restAction ? choice : { ...choice, outcome: "SAN +11｜SAN 上限 +2" }),
    })) };
    const illness = getResolvableQueuedEvent(state, current(state));
    expect(illness.choices.filter(choice => !choice.effects.restAction).every(choice => choice.outcome === "SAN +11｜SAN 上限 +2")).toBe(true);
    const otherEvent = { ...current(state), chainId: "other-rest-event" };
    expect(getResolvableQueuedEvent(state, otherEvent).choices.find(choice => choice.effects.restAction)!.outcome).toContain("SAN +2");
  });

  it("renders an unrefreshed saved result as unavailable while keeping rewind available", () => {
    const result = choose(choose(queuedIllness()), true);
    const stale = JSON.parse(JSON.stringify({ ...result, actionState: { ...result.actionState, used: 1 } })) as GameState;
    expect(current(stale).choices[0]!.disabledReason).toBeUndefined();
    const html = renderPlayScreen(stale, { isEventContentOpen: true, activeEventId: current(stale).id });
    expect(html).toMatch(/<button\b[^>]*disabled aria-disabled="true"[^>]*title="本月行动点已用尽，无法休息"/u);
    const rewind = html.match(/<button\b[^>]*data-action="replay-event"[^>]*>/u)?.[0];
    expect(rewind).toBeDefined();
    expect(rewind).not.toContain("disabled");
    expect(canRewindPendingEvent(stale, current(stale), 1)).toBe(true);
  });
});
