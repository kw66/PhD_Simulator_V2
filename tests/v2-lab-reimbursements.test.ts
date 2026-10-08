import { describe, expect, it } from "vitest";
import { AI_SLOT_IDS, getAiModelForTotalMonths, hasAiReimbursement } from "../src/core/v2-ai-shop";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import { createFundingCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { isRandomEventEligible } from "../src/core/v2-random-event-router";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import type { DispatchPayload, GameState, PendingEvent } from "../src/core/v2-types";

function makeState(): GameState {
  const initial = createStartedGameState("normal");
  return { ...initial, selectedAdvisorName: "导师", year: 1, month: 6, totalMonths: 6, eventQueue: [], buffs: [],
    player: { ...initial.player, money: 0, san: 20, favor: 18 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 100 },
  };
}

function resolve(state: GameState, choiceIndex = 0): GameState {
  const event = getResolvableQueuedEvent(state, state.eventQueue[0]!);
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[choiceIndex]!.id });
}

function fundingDecision(state: GameState, branch: number): GameState {
  const event = createFundingCampusRandomEvent(state, () => 0);
  return resolve(resolve({ ...state, eventQueue: [createEventQueueItem(event, 1)] }), branch);
}

describe("funding rewards from a separate closing project", () => {
  it.each([0, 1, 2, 3])("grants branch %i only on confirmation without reserving or spending lab funds", (branch) => {
    const initial = makeState();
    const pending = fundingDecision(initial, branch);
    expect(pending.advisorProgressState).toEqual(initial.advisorProgressState);
    expect(pending.player.money).toBe(0);
    expect(pending.shopState.entitlements).toEqual(initial.shopState.entitlements);
    expect(pending.buffs).toEqual(initial.buffs);
    const lowFunding = { ...pending, advisorProgressState: { ...pending.advisorProgressState, funding: 1 } };
    const event = getResolvableQueuedEvent(lowFunding, lowFunding.eventQueue[0]!);
    expect(event.choices).toHaveLength(1);
    expect(event.choices[0]!.disabledReason).toBeUndefined();
    const paid = resolve(lowFunding);
    expect(paid.advisorProgressState).toEqual(lowFunding.advisorProgressState);
    expect(paid.phase).toBe("playing");
    if (branch === 0) expect(paid.shopState.entitlements.gpuTransaction).toBe(1);
    if (branch === 1) expect(paid.player.money).toBe(9);
    if (branch === 2) expect(paid.shopState.entitlements.workstationTransaction).toBe(1);
    if (branch === 3) expect(paid.buffs.some((buff) => buff.shopEffects?.aiCostsCoveredAtTotalMonths === 7)).toBe(true);
    const repeated = dispatchAction(paid, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    expect(repeated.advisorProgressState).toEqual(paid.advisorProgressState);
    expect(repeated.player.money).toBe(paid.player.money);
    expect(repeated.shopState.entitlements).toEqual(paid.shopState.entitlements);
    expect(repeated.buffs).toEqual(paid.buffs);
  });

  it.each([[0, 3], [6, 5], [12, 7], [18, 9]])("pays favor %i labor reward %i from the closing project", (favor, amount) => {
    const state = makeState();
    state.player.favor = favor;
    const paid = resolve(fundingDecision(state, 1));
    expect(paid.player.money).toBe(amount);
    expect(paid.advisorProgressState).toEqual(state.advisorProgressState);
    expect(paid.log.some((entry) => entry.text.includes(`金币 +${amount}`))).toBe(true);
    expect(paid.log.some((entry) => /实验室经费 -|预留|补足差额/u.test(entry.text))).toBe(false);
  });

  it("keeps the existing appearance threshold above sixty", () => {
    for (const funding of [1, 60, 61, 100]) {
      const state = makeState();
      state.advisorProgressState.funding = funding;
      expect(isRandomEventEligible(state, 8)).toBe(funding > 60);
    }
  });

  it("never emits reserve or lab-debit effects, including denied results", () => {
    const state = makeState();
    state.player.favor = 0;
    const inspect = (event: PendingEvent): void => {
      for (const choice of event.choices) {
        expect(Object.keys(choice.effects)).not.toContain("labReimbursementReservation");
        expect(choice.effects.advisorProgressStateDeltas).toBeUndefined();
        expect(choice.outcome).not.toMatch(/预留|实验室经费 -|补足差额/u);
        for (const next of choice.effects.enqueueEvents ?? []) inspect(next);
      }
    };
    for (const roll of [0, 0.99]) {
      const event = createFundingCampusRandomEvent(state, () => roll);
      expect(event.description).toContain("另一笔快结项");
      inspect(event);
    }
  });

  const purchases = [
    { branch: 0, action: "buy-shop-item", payload: { shopItemId: "gpu_buy" } },
    { branch: 2, action: "buy-shop-item", payload: { shopItemId: "keyboard" } },
    { branch: 2, action: "buy-shop-item", payload: { shopItemId: "monitor" } },
    { branch: 2, action: "buy-shop-item", payload: { shopItemId: "chair" } },
    { branch: 2, action: "upgrade-shop-item", payload: { shopUpgradeId: "chair-advanced" } },
    { branch: 2, action: "buy-coffee-machine", payload: {} },
    { branch: 2, action: "upgrade-coffee-machine", payload: { shopUpgradeId: "manual" } },
  ] satisfies Array<{ branch: number; action: Parameters<typeof getShopActionPrice>[1]; payload: DispatchPayload }>;

  it.each(purchases)("uses one external allowance for $action $payload without touching the lab account", ({ branch, action, payload }) => {
    let state = resolve(fundingDecision(makeState(), branch));
    if (action === "upgrade-shop-item") state.shopState.chairOwned = true;
    if (action === "upgrade-coffee-machine") state.coffeeState.machineOwned = true;
    state.advisorProgressState.funding = 1;
    const before = structuredClone(state);
    const purchased = dispatchAction(state, action, payload);
    expect(purchased.player.money).toBe(0);
    expect(purchased.advisorProgressState).toEqual(state.advisorProgressState);
    expect(purchased.shopState.entitlements[branch === 0 ? "gpuTransaction" : "workstationTransaction"]).toBe(0);
    expect(purchased.log[0]!.text).not.toMatch(/预留|补足差额|退款/u);
    expect(state).toEqual(before);
    const again = dispatchAction(purchased, action, payload);
    expect(again.advisorProgressState).toEqual(purchased.advisorProgressState);
    expect(again.player.money).toBe(0);
  });

  it("covers all six AI purchases and renewal next month without a reserve or end-of-month refund", () => {
    const initial = makeState();
    const funded = resolve(fundingDecision(initial, 3));
    expect(funded.advisorProgressState).toEqual(initial.advisorProgressState);
    expect(hasAiReimbursement(funded)).toBe(false);
    for (const slot of AI_SLOT_IDS) expect(getShopActionPrice(funded, "buy-ai-month", { aiSlotId: slot })).toBe(getAiModelForTotalMonths(6, slot).price);
    funded.aiShopState.subscriptions.gpt.enabled = true;
    const covered = applyMonthlyEffects({ ...funded, month: 7, totalMonths: 7 }).nextState;
    const control = applyMonthlyEffects({ ...funded, buffs: [], month: 7, totalMonths: 7 }).nextState;
    expect(covered.advisorProgressState).toEqual(control.advisorProgressState);
    expect(covered.aiShopState.subscriptions.gpt.active).toBe(true);
    let purchased = covered;
    for (const slot of AI_SLOT_IDS) {
      purchased = applyShopAction(purchased, "buy-ai-month", { aiSlotId: slot });
      expect(purchased.aiShopState.subscriptions[slot].active).toBe(true);
    }
    expect(purchased.player.money).toBe(covered.player.money);
    expect(purchased.advisorProgressState).toEqual(covered.advisorProgressState);
    const expired = applyMonthlyEffects({ ...purchased, month: 8, totalMonths: 8 }).nextState;
    const noCoverage = applyMonthlyEffects({ ...purchased, buffs: purchased.buffs.filter((buff) => !buff.shopEffects?.aiCostsCovered), month: 8, totalMonths: 8 }).nextState;
    expect(expired.advisorProgressState).toEqual(noCoverage.advisorProgressState);
    expect(covered.advisorProgressState.funding).toBe(initial.advisorProgressState.funding - 1.5);
    expect(expired.advisorProgressState.funding).toBe(initial.advisorProgressState.funding - 2 * 1.5);
    expect(hasAiReimbursement(expired)).toBe(false);
  });
});
