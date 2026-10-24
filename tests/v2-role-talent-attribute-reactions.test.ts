import { describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyPlayerAttributeChange, getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { settleRoleTalentRescues } from "../src/core/v2-role-talent-reactions";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import { applyQueuedEventEffects } from "../src/core/v2-engine-event-resolution";
import { getEventChoiceRisk } from "../src/core/v2-event-choice-risk";
import { applyEventPlayerEffects } from "../src/core/v2-event-player-effects";
import { settleGreedCoinGames } from "../src/core/v2-role-talent-greed";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function base(role: GameState["selectedRoleId"], levels: Record<string, number>): GameState {
  const initial = createStartedGameState(role);
  return { ...initial, phase: "playing", eventQueue: [], totalMonths: 25, year: 3, month: 1, degree: "phd",
    roleTalents: { levels, initialized: true }, player: { san: 10, money: 10, research: 18, social: 18, favor: 18 } };
}
const update = (state: GameState, stat: "research" | "social" | "favor", delta: number) => applyPlayerAttributeChange(state, stat, delta).state;

describe("ordinary attribute talent reactions", () => {
  it("fires research growth rewards once per request, grants caps first and records independent changes", () => {
    const state = base("genius-reversed", { "knowledge-monetization": 2, "work-life-balance": 1, "research-network": 1,
      "research-wellness": 1, "reputation-growth": 1, "social-growth": 1 });
    state.player.san = state.sanCap;
    state.player.social = 20;
    state.player.favor = 20;
    const next = update(state, "research", 3);
    expect(next.player.research).toBe(19.2);
    expect(next.player.money).toBe(10);
    expect(next.sanCap).toBe(state.sanCap);
    expect(next.player.san).toBe(state.sanCap);
    expect(next.player.social).toBe(20.4);
    expect(next.player.favor).toBe(20.4);
    expect(getPlayerAttributeCap(next, "social")).toBe(21);
    expect(next.roleTalents?.growthTotals?.research).toBe(1.2);
    expect(next.roleTalents?.growthTotals?.social).toBe(0.4);
    expect(state.player.money).toBe(10);
  });

  it.each(["master", "phd"] as const)("grants the new cap and attribute rewards in %s", degree => {
    const state = { ...base("genius-reversed", { "work-life-balance": 1, "reputation-growth": 1, "social-growth": 1 }), degree };
    const next = update(state, "research", 1);
    expect(next.sanCap).toBe(state.sanCap);
    expect(next.player.san).toBe(10);
    expect(next.player.social).toBe(18.4);
    expect(next.player.favor).toBe(18.4);
    expect(getPlayerAttributeCap(next, "social")).toBe(21);
    expect(getPlayerAttributeCap(next, "favor")).toBe(21);
  });

  it("preserves the old research money and PhD-only cap rewards in r32 recordings", () => withGameplayRuleset("20261023-r32", () => {
    const state = base("genius-reversed", { "knowledge-monetization": 2, "work-life-balance": 2, "research-network": 1,
      "research-wellness": 1, "reputation-growth": 1, "social-growth": 1 });
    const next = update(state, "research", 3);
    expect(next.player.money).toBe(14);
    expect(next.player.san).toBe(14);
    expect(next.sanCap).toBe(state.sanCap + 1);
    expect(update({ ...state, degree: "master" }, "research", 3).sanCap).toBe(state.sanCap);
  }));

  it("does not reward capped zero gains or a reset/equalize/swap", () => {
    const state = base("genius-reversed", { "knowledge-monetization": 2 });
    state.player.research = 20;
    expect(update(state, "research", 3).player.money).toBe(10);
    for (const source of ["reset", "equalize", "swap"] as const) {
      expect(applyPlayerAttributeChange({ ...state, player: { ...state.player, research: 1 } }, "research", 1, source).state.player.money).toBe(10);
    }
  });

  it("unlocks at real research twenty permanently and raises its cap with later growth", () => {
    let state = base("genius-reversed", { "break-research-curse": 1, "knowledge-monetization": 1 });
    state.player.research = 19.8;
    state = update(state, "research", 1);
    expect(state.player.research).toBe(20);
    expect(state.roleTalents?.researchCurseBroken).toBe(true);
    state = update(state, "research", 3);
    expect(state.player.research).toBe(21.2);
    expect(getPlayerAttributeCap(state, "research")).toBe(21.2);
    state = update(state, "research", -4);
    expect(state.player.research).toBeLessThan(20);
    expect(state.roleTalents?.researchCurseBroken).toBe(true);
    expect(getPlayerAttributeCap(state, "research")).toBe(21.2);
    expect(state.eventHistory.filter(entry => entry.id === "talent:role-break-research-curse")).toHaveLength(1);
  });

  it("preserves the old ordinary favor penalty in r51 recordings", () => withGameplayRuleset("20261024-r51", () => {
    const state = base("teacher-child-reversed", { "lower-favor-reset": 2 });
    expect(previewPlayerAttributeChange(state, "favor", -1).effectiveChange).toBe(-1);
    expect(withGameplayRuleset("20261023-r43", () => previewPlayerAttributeChange(state, "favor", -1).effectiveChange)).toBe(-1.6);
    expect(previewPlayerAttributeChange(state, "favor", 1).effectiveChange).toBe(0.4);
    expect(previewPlayerAttributeChange(state, "favor", -1, "reset").effectiveChange).toBe(-1);
  }));

  it.each([1, 2, 3, 4])("preserves half-point favor loss ranks in r51 recordings: %s", rank => withGameplayRuleset("20261024-r51", () => {
    const state = base("teacher-child-reversed", { "lower-favor-reset": rank });
    state.player.favor = 4;
    expect(previewPlayerAttributeChange(state, "favor", -0.25).effectiveChange).toBe(-0.25 - rank * 0.5);
    expect(previewPlayerAttributeChange(state, "favor", 1).effectiveChange).toBe(1);
    expect(previewPlayerAttributeChange(state, "favor", 0).effectiveChange).toBe(0);
    expect(previewPlayerAttributeChange(state, "favor", -1, "reset").effectiveChange).toBe(-1);
    expect(previewPlayerAttributeChange(state, "social", -1).adjustedRawChange).toBe(-1);
  }));

  it("rank-four refill supplies eight coins once in r51 recordings", () => withGameplayRuleset("20261024-r51", () => {
    const state = base("teacher-child-reversed", { "favor-reset": 1, "reset-coins": 4 });
    state.player = { ...state.player, favor: -0.5, money: 1 };
    const next = settleRoleTalentRescues(state);
    expect(next.player.money).toBe(8);
    expect(settleRoleTalentRescues(next)).toBe(next);
    expect(settleRoleTalentRescues({ ...state, player: { ...state.player, money: 10 } }).player.money).toBe(10);
  }));

  it("preserves the old below-zero rescue in r51 recordings", () => withGameplayRuleset("20261024-r51", () => {
    let state = base("teacher-child-reversed", { "favor-reset": 1, "reset-research": 1, "reset-social": 1,
      "reset-research-cap": 1, "reset-social-cap": 1, "reset-coins": 2, "end-of-grace": 2 });
    state.player = { ...state.player, favor: 1, research: 20, social: 20, money: 1 };
    expect(update(state, "favor", -1).player.favor).toBe(0);
    state = update(state, "favor", -2);
    expect(state.player.favor).toBe(17);
    expect(getPlayerAttributeCap(state, "favor")).toBe(17);
    expect(state.player.research).toBe(20.4);
    expect(state.player.social).toBe(20.4);
    expect(state.player.money).toBe(4);
    expect(state.roleTalents?.favorResetCount).toBe(1);
    expect(state.roleTalents?.lossTotals?.favor).toBe(2);
    expect(evaluateCoreEndings(state).phase).toBe("playing");
    expect(settleRoleTalentRescues(state)).toBe(state);
  }));

  it("continues to reset at minimum favor cap six in r51 recordings", () => withGameplayRuleset("20261024-r51", () => {
    const state = base("teacher-child-reversed", { "favor-reset": 1, "reset-coins": 2, "end-of-grace": 2 });
    state.roleTalents!.capBonuses = { favor: -14 };
    state.player.favor = 0;
    const next = update(state, "favor", -1);
    expect(next.player.favor).toBe(6);
    expect(getPlayerAttributeCap(next, "favor")).toBe(6);
    expect(next.player.money).toBe(10);
    expect(next.roleTalents?.favorResetCount).toBe(1);
    const directNegative = { ...state, player: { ...state.player, favor: -1 } };
    expect(evaluateCoreEndings(directNegative).player.favor).toBe(6);
    expect(evaluateCoreEndings(directNegative).phase).toBe("playing");
  }));

  it("converts research and social growth into favor loss and resets below six", () => {
    let state = base("teacher-child-reversed", {});
    state.player = { ...state.player, favor: 5, research: 1, social: 1 };
    state = update(state, "research", 1);
    expect(state.player.research).toBe(2);
    expect(state.player.favor).toBe(21);
    expect(getPlayerAttributeCap(state, "favor")).toBe(21);
    expect(state.roleTalents?.favorResetCount).toBe(1);
  });

  it("uses the revised favor resistance in both directions", () => {
    const state = base("teacher-child-reversed", { "end-of-grace": 3 });
    state.player.favor = 18;
    expect(previewPlayerAttributeChange(state, "favor", 1).effectiveChange).toBeCloseTo(0.1);
    expect(previewPlayerAttributeChange(state, "favor", -1).effectiveChange).toBeCloseTo(-0.7);
  });

  it("keeps gain and loss remainders separately, rewards completed points and tracks any social change", () => {
    let state = base("social-reversed", { "social-to-san": 3, "social-loss-coins": 2 });
    state.player.social = 6;
    state = update(state, "social", 1);
    expect(state.player.san).toBe(10);
    expect(state.roleTalents?.socialGainRemainder).toBe(0.8);
    state = update(state, "social", -1);
    expect(state.roleTalents?.socialLossRemainder).toBe(0.8);
    state = update(state, "social", 1);
    state = update(state, "social", -1);
    expect(state.player.san).toBe(13);
    expect(state.player.money).toBe(12);
    expect(state.roleTalents?.socialGainRemainder).toBe(0.6);
    expect(state.roleTalents?.socialLossRemainder).toBe(0.6);
    expect(state.roleTalents?.socialChangedMonth).toBe(25);
    expect(state.roleTalents?.growthTotals?.social).toBe(1.6);
    expect(state.roleTalents?.lossTotals?.social).toBe(1.6);
  });

  it("does not mark capped gains or swaps as ordinary social activity", () => {
    const state = base("social-reversed", { "social-to-san": 3 });
    state.player.social = 20;
    expect(update(state, "social", 1).roleTalents?.socialChangedMonth).toBeUndefined();
    expect(applyPlayerAttributeChange(state, "social", -1, "swap").state.roleTalents?.socialChangedMonth).toBeUndefined();
  });

  it("keeps deferred research reactions and their logs out of live state until confirmation", () => {
    const initial = base("genius-reversed", { "knowledge-monetization": 2, "work-life-balance": 1, "reputation-growth": 1, "social-growth": 1 });
    const result: PendingEvent = { id: "reaction-result", title: "Result", description: "", source: "fixed", stage: "result",
      chainId: "reaction", blocking: true, deadlineMonths: 0, choices: [{ id: "ok", label: "ok", outcome: "", effects: {} }] };
    const decision: PendingEvent = { ...result, id: "reaction-decision", stage: "act2",
      choices: [{ id: "gain", label: "gain", outcome: "", effects: { rawResearch: 3, enqueueEvents: [result] } }] };
    const callbacks = { evaluateImmediateEndings: (s: GameState) => s, runPostQueuePipeline: (s: GameState) => s };
    const started = { ...initial, eventQueue: [createEventQueueItem(decision, 1)] };
    const preview = applyQueuedEventEffects(started, started.eventQueue[0]!, "gain", callbacks);
    expect(preview.player).toEqual(initial.player);
    expect(preview.roleTalents).toEqual(initial.roleTalents);
    expect(preview.eventHistory).toEqual(initial.eventHistory);
    const confirmed = applyQueuedEventEffects(preview, preview.eventQueue[0]!, "ok", callbacks);
    expect(confirmed.player.money).toBe(10);
    expect(confirmed.player.san).toBe(10);
    expect(confirmed.sanCap).toBe(initial.sanCap);
    expect(confirmed.player.social).toBe(18.4);
    expect(confirmed.player.favor).toBe(18.4);
    expect(confirmed.player.research).toBe(19.2);
    expect(confirmed.roleTalents?.attributeReactionSequence).toBe(1);
  });

  it("previews a favor reset as a rescue and never consumes global RNG for greed projection in r51 recordings", () => withGameplayRuleset("20261024-r51", () => {
    const state = base("teacher-child-reversed", { "favor-reset": 1 });
    state.player.favor = 0;
    const event: PendingEvent = { id: "risk", title: "", description: "", source: "fixed", stage: "result", chainId: "risk",
      blocking: true, deadlineMonths: 0, choices: [{ id: "ok", label: "", outcome: "", effects: { rawFavor: -1 } }] };
    expect(getEventChoiceRisk(state, event, event.choices[0]!)).toBeNull();
    const greed = base("rich-reversed", { "coin-game": 1, "post-phd-money-conversion": 1 });
    const snapshot = JSON.stringify(greed);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    try {
      const gamble = { ...event, choices: [{ id: "ok", label: "", outcome: "", effects: { rawFavor: -3, money: -2 } }] };
      expect(getEventChoiceRisk(greed, gamble, gamble.choices[0]!)).toBeNull();
      expect(JSON.stringify(greed)).toBe(snapshot);
    } finally { random.mockRestore(); }
  }));

  it("freezes greed games until the complete event request has been applied and previews deterministically", () => {
    const initial = base("rich-reversed", { "coin-game": 1, "loss-to-money": 1, "post-phd-money-conversion": 1 });
    initial.player = { ...initial.player, money: 30, favor: 1 };
    const finalEffects = { money: 10 };
    const firstEffects = { rawFavor: -2, money: -2 };
    const result: PendingEvent = { id: "greed-result", title: "", description: "", source: "fixed", stage: "result",
      chainId: "greed", blocking: true, deadlineMonths: 0, choices: [{ id: "ok", label: "", outcome: "", effects: finalEffects }] };
    const decision: PendingEvent = { ...result, id: "greed-decision", stage: "act2",
      choices: [{ id: "go", label: "", outcome: "", effects: { ...firstEffects, enqueueEvents: [result] } }] };
    const callbacks = { evaluateImmediateEndings: (s: GameState) => s, runPostQueuePipeline: (s: GameState) => s };
    const started = { ...initial, eventQueue: [createEventQueueItem(decision, 1)] };
    const pending = applyQueuedEventEffects(started, started.eventQueue[0]!, "go", callbacks);
    const snapshot = JSON.stringify(pending);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    try {
      getEventChoiceRisk(pending, pending.eventQueue[0]!, pending.eventQueue[0]!.choices[0]!);
      getEventChoiceRisk(pending, pending.eventQueue[0]!, pending.eventQueue[0]!.choices[0]!);
      const expected = settleGreedCoinGames(applyEventPlayerEffects(applyEventPlayerEffects(initial, firstEffects), finalEffects));
      random.mockRestore(); // The confirmed event's ordinary log uses a random identifier, not the talent draw stream.
      const confirmed = applyQueuedEventEffects(pending, pending.eventQueue[0]!, "ok", callbacks);
      expect(confirmed.player).toEqual(expected.player);
      expect(confirmed.roleTalents?.greedRandomState).toEqual(expected.roleTalents?.greedRandomState);
      expect(confirmed.roleTalents?.pendingCoinGames).toBe(0);
      expect(JSON.stringify(pending)).toBe(snapshot);
    } finally { random.mockRestore(); }
  });

  it("settles year-summary rest without spending an action and applies sloth bonuses once", () => {
    const state = base("normal-reversed", { "year-summary-recovery": 1, "restful-idle": 2, "coffee-lifeline": 2 });
    state.player.san = 1;
    const next = applyChoiceEffectsToState(state, { id: "rest", label: "", outcome: "", effects: { san: 5, roleTalentRest: "year-summary" } }).nextState;
    expect(next.player.san).toBe(next.sanCap);
    expect(next.actionState.used).toBe(state.actionState.used);
    for (const action of ["idea", "experiment", "writing"] as const) {
      expect(next.buffs.find(buff => buff.id === `role-rest-${action}`)?.actionEffects?.[action]?.bonus).toBe(2);
    }
  });
});
