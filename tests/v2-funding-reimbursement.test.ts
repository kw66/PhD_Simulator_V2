import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createFundingCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { AI_SLOT_IDS, getAiModelForTotalMonths, hasAiReimbursement } from "../src/core/v2-ai-shop";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import { renderApp } from "../src/app/v2-render";
import type { GameState } from "../src/core/v2-types";

function makeState(favor = 1): GameState {
  const state = createStartedGameState("normal");
  return { ...state, month: 6, totalMonths: 6, eventQueue: [], eventHistory: [], log: [], buffs: [],
    player: { ...state.player, san: 10, money: 50, favor } };
}

function makeEvent(state: GameState, rolls = [0, 0, 0]) {
  let index = 0;
  const event = createFundingCampusRandomEvent(state, () => rolls[index++] ?? 0);
  return { ...event, randomReplay: { eventId: 8, serial: state.totalRandomEventCount, rolls } };
}

function choices(state: GameState, rolls = [0, 0, 0]) {
  return makeEvent(state, rolls).choices[0]!.effects.enqueueEvents![0]!.choices;
}

function resolve(state: GameState, choiceIndex = 0) {
  const event = getResolvableQueuedEvent(state, state.eventQueue[0]!);
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[choiceIndex]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("advisor funding reimbursements", () => {
  it.each([[0, 40, 3], [5, 40, 3], [6, 60, 5], [11, 60, 5], [12, 80, 7], [17, 80, 7], [18, 100, 9], [20, 100, 9]])(
    "uses favor %i for %i percent approval and a guaranteed %i coins", (favor, percent, money) => {
      for (const roll of [0, percent / 100 - 0.000001, Math.min(0.999999, percent / 100)]) {
        const branches = choices(makeState(favor), [roll, roll, roll]);
        const approved = roll < percent / 100;
        expect(branches[1]!.effects.money).toBe(money);
        for (const index of [0, 2, 3]) {
          const choice = branches[index]!;
          expect(choice.outcome).toContain(`${approved ? "同意报销" : "未获同意"}（${approved ? percent : 100 - percent}%）`);
          const { enqueueEvents, ...rewards } = choice.effects;
          if (!approved) expect(rewards).toEqual({});
          else expect(Object.keys(rewards)).not.toHaveLength(0);
          expect(enqueueEvents![0]!.description).toContain(choice.outcome);
          expect(enqueueEvents![0]!.description.split("\n\n机制结算")[0]!.split("\n\n")).toHaveLength(2);
        }
      }
    },
  );

  it("draws each reimbursement separately and preserves labor pay", () => {
    const branches = choices(makeState(), [0.1, 0.8, 0.2]);
    expect(branches[0]!.effects.shopEntitlementDeltas).toEqual({ gpuTransaction: 1 });
    expect(branches[2]!.effects.shopEntitlementDeltas).toBeUndefined();
    expect(branches[3]!.effects.addBuffs).toHaveLength(1);
    expect(branches[1]!.effects.money).toBe(3);
  });

  it("schedules only on final confirmation and lets debug replay switch away without a reward", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState(18);
    let state: GameState = { ...initial, debugEventReplayEnabled: true, eventQueue: [createEventQueueItem(makeEvent(initial), 1)] };
    state = resolve(resolve(state), 3);
    expect(state.buffs).toEqual([]);
    const result = state.eventQueue[0]!;
    state = dispatchAction(state, "debug-replay-event", { eventId: result.id, eventHistoryIndex: 1 });
    state = resolve(resolve(state, 1));
    expect(state.buffs).toEqual([]);
    expect(state.player.money).toBe(initial.player.money + 9);
    let approved = resolve(resolve({ ...initial, eventQueue: [createEventQueueItem(makeEvent(initial), 1)] }), 3);
    const approval = approved.eventQueue[0]!;
    approved = resolve(approved);
    expect(approved.buffs.filter(buff => buff.shopEffects?.aiCostsCovered)).toHaveLength(1);
    expect(approved.buffs[0]!.shopEffects?.aiCostsCoveredAtTotalMonths).toBe(7);
    expect(hasAiReimbursement(approved)).toBe(false);
    expect(dispatchAction(approved, "resolve-event", { eventId: approval.id, eventChoiceId: approval.choices[0]!.id }).buffs).toEqual(approved.buffs);
  });

  it("keeps saved rolls when deferred and schedules relative to the actual resolution month", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState(6);
    let state: GameState = JSON.parse(JSON.stringify({ ...initial, eventQueue: [createEventQueueItem(makeEvent(initial, [0.7, 0.5, 0.2]), 1)] }));
    state.month = 7;
    state.totalMonths = 7;
    state = resolve(state);
    const decision = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(decision.choices[0]!.outcome).toContain("未获同意（40%）");
    expect(decision.choices[2]!.outcome).toContain("同意报销（60%）");
    state = resolve(resolve(state, 3));
    expect(state.buffs[0]!.shopEffects?.aiCostsCoveredAtTotalMonths).toBe(8);
  });

  it("covers all AI purchases and renewals next month, with matching preview and expiry", () => {
    const initial = makeState();
    const funded = applyChoiceEffectsToState(initial, choices(initial)[3]!).nextState;
    expect(hasAiReimbursement(funded)).toBe(false);
    for (const slot of AI_SLOT_IDS) {
      expect(getShopActionPrice(funded, "buy-ai-month", { aiSlotId: slot })).toBe(getAiModelForTotalMonths(6, slot).price);
    }
    const purchased = applyShopAction(funded, "buy-ai-month", { aiSlotId: "gpt" });
    expect(purchased.player.money).toBe(initial.player.money - 2);
    purchased.aiShopState.subscriptions.gpt.enabled = true;
    const saved = JSON.parse(JSON.stringify(purchased)) as GameState;
    const preview = previewNextMonthEffects(saved);
    const next = applyMonthlyEffects({ ...saved, month: 7, totalMonths: 7 });
    expect(preview.items.find(item => item.id === "ai-renewal-gpt")?.stats.money).toBeCloseTo(0);
    expect(next.resolution.items.find(item => item.id === "ai-renewal-gpt")?.stats.money).toBeCloseTo(0);
    expect(next.nextState.aiShopState.subscriptions.gpt.active).toBe(true);
    expect(hasAiReimbursement(next.nextState)).toBe(true);
    for (const slot of AI_SLOT_IDS) {
      expect(getShopActionPrice(next.nextState, "buy-ai-month", { aiSlotId: slot })).toBe(0);
    }
    const manual = applyShopAction(next.nextState, "buy-ai-month", { aiSlotId: "claude" });
    expect(manual.player.money).toBe(next.nextState.player.money);
    expect(manual.aiShopState.subscriptions.claude.active).toBe(true);
    const expired = applyMonthlyEffects({ ...next.nextState, month: 8, totalMonths: 8 });
    expect(hasAiReimbursement(expired.nextState)).toBe(false);
    expect(expired.resolution.items.find(item => item.id === "ai-renewal-gpt")?.stats.money).toBe(-2);
    expect(expired.nextState.buffs.some(buff => buff.shopEffects?.aiCostsCovered)).toBe(false);
    expect(renderApp(funded)).toContain('data-effect-id="next-month-ai-reimbursement-');
    expect(renderApp(funded)).not.toContain('data-effect-id="monthly-ai-reimbursement-');
    expect(renderApp(next.nextState)).toContain('data-effect-id="monthly-ai-reimbursement-');
    expect(renderApp(next.nextState)).not.toContain('data-effect-id="next-month-ai-reimbursement-');
  });

  it("preserves current coverage when another reimbursement is granted for next month", () => {
    const initial = makeState();
    const first = applyChoiceEffectsToState(initial, choices(initial)[3]!).nextState;
    const active = applyMonthlyEffects({ ...first, month: 7, totalMonths: 7 }).nextState;
    const second = applyChoiceEffectsToState(active, choices(active)[3]!).nextState;
    expect(hasAiReimbursement(second)).toBe(true);
    expect(hasAiReimbursement(applyMonthlyEffects({ ...second, month: 8, totalMonths: 8 }).nextState)).toBe(true);
  });
});
