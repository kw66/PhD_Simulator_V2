import { describe, expect, it } from "vitest";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyQueuedEventEffects, getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { getEventChoiceRisk } from "../src/core/v2-event-choice-risk";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { paySanCost } from "../src/core/v2-role-talent-costs";
import { applyEventPlayerEffects, formatEventSanPaymentText } from "../src/core/v2-event-player-effects";
import { resolveTeachersDayFixedEvent } from "../src/core/v2-fixed-events-teachers-day";
import { resolveWinterVacationFixedEvent } from "../src/core/v2-fixed-events-winter";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

const callbacks = { evaluateImmediateEndings: (state: GameState) => state, runPostQueuePipeline: (state: GameState) => state };
function initial(role: GameState["selectedRoleId"] = "normal", levels: Record<string, number> = {}): GameState {
  const state = createStartedGameState(role);
  return { ...state, degree: "phd", phase: "playing", totalMonths: 25, year: 3, month: 1, eventQueue: [],
    roleTalents: { levels, initialized: true }, player: { san: 10, research: 18, social: 18, favor: 18, money: 80 } };
}
function event(effects: EventChoice["effects"], id = "result"): PendingEvent {
  return { id, title: id, description: "", source: "fixed", chainId: "talent-event", stage: "result",
    blocking: true, deadlineMonths: 0, choices: [{ id: "confirm", label: "确定", outcome: "", effects }] };
}
function pending(state: GameState, effects: EventChoice["effects"]): GameState {
  const root = { ...event({ ...effects, enqueueEvents: [event({})] }, "decision"), stage: "act2" as const };
  state = { ...state, eventQueue: [createEventQueueItem(root, 1)] };
  return applyQueuedEventEffects(state, state.eventQueue[0]!, "confirm", callbacks);
}
function confirm(state: GameState): GameState {
  return applyQueuedEventEffects(state, state.eventQueue[0]!, "confirm", callbacks);
}

describe("role talent event settlement", () => {
  it("re-evaluates the original gain at the current tier after a deferred scene", () => {
    let state = pending(initial(), { research: 0.4, rawResearch: 1 });
    expect(state.player.research).toBe(18);
    state = { ...state, player: { ...state.player, research: 6 } };
    state = confirm(state);
    expect(state.player.research).toBeCloseTo(6.8);
    expect(state.roleTalents?.growthTotals?.research).toBeCloseTo(0.8);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("uses lasting fortune once rather than resisting the presentation delta again", () => {
    const state = initial("chosen", { "lasting-fortune": 3 });
    const choice = event({ research: 0.4, rawResearch: 1 }).choices[0]!;
    const next = applyChoiceEffectsToState(state, choice).nextState;
    expect(next.player.research).toBe(18.7);
    expect(state.player.research).toBe(18);
  });

  it("preserves original requests so overflow fills the new cap only on confirmation", () => {
    let state = initial("normal", { breakthrough: 1 });
    state = { ...state, player: { ...state.player, research: 20 } };
    state = pending(state, { research: 0, rawResearch: 3 });
    expect(state.researchCapacityState.otherCapBonus).toBe(0);
    expect(state.roleTalents?.breakthroughCounts?.research ?? 0).toBe(0);
    state = confirm(state);
    expect(state.player.research).toBe(21);
    expect(state.researchCapacityState.otherCapBonus).toBe(1);
    expect(state.roleTalents?.breakthroughCounts?.research).toBe(1);
  });

  it("does not reserve beta in previews and rechecks its use before confirmation", () => {
    let state = initial("normal", { "burning-life-beta": 1 });
    state = { ...state, player: { ...state.player, san: 1 } };
    state = pending(state, { san: -3 });
    const beforeCap = state.sanCap;
    expect(state.roleTalents?.betaUsedMonth).toBeUndefined();
    expect(getEventChoiceRisk(state, state.eventQueue[0]!, state.eventQueue[0]!.choices[0]!)).toBeNull();
    state = paySanCost(state, 2);
    expect(state.sanCap).toBe(beforeCap - 1);
    expect(getEventChoiceRisk(state, state.eventQueue[0]!, state.eventQueue[0]!.choices[0]!)).toBe("certain");
    state = confirm(state);
    expect(state.sanCap).toBe(beforeCap - 1);
    expect(state.player.san).toBe(-2);
  });

  it("rechecks legacy favor replacement using the confirmed balance in r24 recordings", () => withGameplayRuleset("20261022-r24", () => {
    let state = pending(initial("rich", { "gold-power-beta": 1 }), { favor: 0, rawFavor: -1 });
    expect(state.player.favor).toBe(18);
    expect(state.player.money).toBe(80);
    state = { ...state, player: { ...state.player, money: 49 } };
    state = confirm(state);
    expect(state.player.favor).toBeCloseTo(17.6);
    expect(state.player.money).toBe(49);
    const rich = applyChoiceEffectsToState(initial("rich", { "gold-power-beta": 1 }), event({ favor: 0, rawFavor: -1 }).choices[0]!).nextState;
    expect(rich.player.favor).toBe(18);
    expect(rich.player.money).toBe(79.2);
  }));

  it("keeps teachers-day gift and errand raw rewards at one point", () => {
    const state = initial("chosen", { "lasting-fortune": 3 });
    const gift = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-stamp" }, () => 0);
    expect(gift.nextState.player.favor).toBe(19.4);
    const low = { ...state, player: { ...state.player, favor: 1 } };
    const errand = resolveTeachersDayFixedEvent(low, { kind: "teachers-day-message" }, () => 0);
    expect(errand.nextState.player.favor).toBe(2);
  });

  it("uses the enlarged red envelope before the existing lover doubling", () => {
    const state = initial("rich", { "red-envelope": 4 });
    const normal = resolveWinterVacationFixedEvent(state, { kind: "winter-vacation-rest" }, () => 0)!;
    expect(normal.enqueueEvents?.[0]?.choices[0]?.effects.money).toBe(6);
    const lover = resolveWinterVacationFixedEvent({ ...state, loverState: { ...state.loverState, active: true } }, { kind: "winter-vacation-rest" }, () => 0.4)!;
    expect(lover.enqueueEvents?.[0]?.choices[0]?.effects.money).toBe(12);
  });

  it("refreshing a deferred result leaves all real talent state untouched", () => {
    const state = pending(initial("normal", { breakthrough: 1 }), { research: 0.4, rawResearch: 1 });
    const snapshot = JSON.stringify(state);
    getResolvableQueuedEvent(state, state.eventQueue[0]!);
    getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("keeps permitted overflow on ordinary recovery and empty effects, but honors an explicit reset", () => {
    const state = initial("chosen-reversed", { "swap-breaks-cap": 1 });
    state.player.san = 50;
    state.player.research = 50;
    state.player.social = 50;
    state.player.favor = 50;
    expect(applyEventPlayerEffects(state, { san: 2 }).player.san).toBe(50);
    expect(applyEventPlayerEffects(state, {}).player).toEqual(state.player);
    expect(applyEventPlayerEffects(state, { restoreSanToCap: true }).player.san).toBe(state.sanCap);
    const withPatch = { ...event({}), deferredStatePatch: [{ path: ["player", "money"], previousValue: 80, value: 81 }] };
    const pendingState = { ...state, eventQueue: [createEventQueueItem(withPatch, 1)] };
    expect(confirm(pendingState).player).toEqual({ ...state.player, money: 81 });
  });

  it("allows an illness rest to use alpha and beta together only on confirmation", () => {
    let state = initial("normal", { "burning-life-alpha": 1, "burning-life-beta": 1 });
    state = { ...state, player: { ...state.player, san: 1 }, actionState: { ...state.actionState, used: state.actionState.limit } };
    const originalCap = state.sanCap;
    state = pending(state, { restAction: true, san: -3 });
    expect(state.sanCap).toBe(originalCap);
    state = confirm(state);
    expect(state.sanCap).toBe(originalCap - 2);
    expect(state.roleTalents?.alphaUsedMonth).toBe(state.totalMonths);
    expect(state.roleTalents?.betaUsedMonth).toBe(state.totalMonths);
    expect(state.player.san).toBeGreaterThan(1);
  });

  it("shows the replacement payment in result copy while preserving original costs", () => {
    const state = initial("normal", { "burning-life-beta": 1 });
    state.player.san = 1;
    const effects = { san: -6 };
    expect(formatEventSanPaymentText("SAN -6（疾病增加3）", state, effects)).toBe("SAN上限 -1（燃烧生命β）");
    const rich = initial("rich", { "gold-power-alpha": 1 });
    rich.roleTalents!.goldPowerEnabled = true;
    expect(formatEventSanPaymentText("SAN -6", rich, effects)).toBe("金币 -6（金之力）");
    expect(effects.san).toBe(-6);
  });
});
