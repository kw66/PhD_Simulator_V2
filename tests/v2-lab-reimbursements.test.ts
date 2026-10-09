import { describe, expect, it } from "vitest";
import { AI_SLOT_IDS, getAiModelForTotalMonths, hasAiReimbursement } from "../src/core/v2-ai-shop";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { applyMonthlyEffects, applyMonthStartSubscriptions, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { createFundingCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { getRandomEventAppearanceCondition, isRandomEventEligible } from "../src/core/v2-random-event-router";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import { getShopActionListedPrice } from "../src/core/v2-lover-gift";
import { getLabReimbursementCount } from "../src/core/v2-lab-reimbursement";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "../src/core/v2-lab-projects";
import type { DispatchPayload, GameState } from "../src/core/v2-types";

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

describe("advisor event spending from actual lab funding", () => {
  it.each([0, 1, 2, 3])("settles branch %i only on final confirmation and never twice", (branch) => {
    const initial = makeState();
    const pending = fundingDecision(initial, branch);
    expect(pending.advisorProgressState).toEqual(initial.advisorProgressState);
    expect(pending.player.money).toBe(0);
    expect(pending.shopState).toEqual(initial.shopState);
    expect(pending.buffs).toEqual(initial.buffs);
    const event = getResolvableQueuedEvent(pending, pending.eventQueue[0]!);
    const paid = resolve(pending);
    expect(paid.advisorProgressState.funding).toBe(branch === 1 ? 91 : 100);
    if (branch === 0) expect(getLabReimbursementCount(paid, "gpuTransaction")).toBe(1);
    if (branch === 1) expect(paid.player.money).toBe(9);
    if (branch === 2) expect(getLabReimbursementCount(paid, "workstationTransaction")).toBe(1);
    if (branch === 3) expect(paid.buffs[0]!.shopEffects?.aiCostsCoveredAtTotalMonths).toBe(7);
    const repeated = dispatchAction(paid, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    expect(repeated.advisorProgressState).toEqual(paid.advisorProgressState);
    expect(repeated.player.money).toBe(paid.player.money);
    expect(repeated.shopState).toEqual(paid.shopState);
    expect(repeated.buffs).toEqual(paid.buffs);
  });

  it.each([[0, 3], [6, 5], [12, 7], [18, 9]])("pays favor %i labor reward %i from the lab", (favor, amount) => {
    const state = makeState();
    state.player.favor = favor;
    const paid = resolve(fundingDecision(state, 1));
    expect(paid.player.money).toBe(amount);
    expect(paid.advisorProgressState.funding).toBe(100 - amount);
  });

  it("preserves dangerous event payment when funds fall after the offer", () => {
    const pending = fundingDecision(makeState(), 1);
    pending.advisorProgressState.funding = 1;
    const paid = resolve(pending);
    expect(paid.advisorProgressState.funding).toBe(-8);
    expect(paid.player.money).toBe(9);
    expect(paid.phase).toBe("finished");
  });

  it("uses the inclusive shared threshold and existing lab account narrative", () => {
    for (const funding of [0, 59.99, 60, 60.01, 100]) {
      const state = makeState();
      state.advisorProgressState.funding = funding;
      expect(isRandomEventEligible(state, 8)).toBe(funding >= LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD);
    }
    expect(getRandomEventAppearanceCondition(8)).toBe(`科研经费 ≥ ${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}`);
    const event = createFundingCampusRandomEvent(makeState(), () => 0);
    expect(event.description).toContain("实验室经费表");
    expect(event.description).not.toContain("另一笔");
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

  it.each(purchases)("charges the current full price once for $action $payload", ({ branch, action, payload }) => {
    const state = resolve(fundingDecision(makeState(), branch));
    if (action === "upgrade-shop-item") state.shopState.chairOwned = true;
    if (action === "upgrade-coffee-machine") state.coffeeState.machineOwned = true;
    state.advisorProgressState.funding = getShopActionListedPrice(state, action, payload)!;
    const before = structuredClone(state);
    const purchased = dispatchAction(state, action, payload);
    expect(purchased.player.money).toBe(0);
    expect(purchased.advisorProgressState.funding).toBe(0);
    expect(getLabReimbursementCount(purchased, branch === 0 ? "gpuTransaction" : "workstationTransaction")).toBe(0);
    expect(purchased.shopState.investments).toEqual(state.shopState.investments);
    expect(state).toEqual(before);
    expect(dispatchAction(purchased, action, payload).advisorProgressState).toEqual(purchased.advisorProgressState);
  });

  it.each(purchases)("preserves coverage and gifts when $action cannot be funded", ({ branch, action, payload }) => {
    const state = resolve(fundingDecision(makeState(), branch));
    if (action === "upgrade-shop-item") state.shopState.chairOwned = true;
    if (action === "upgrade-coffee-machine") state.coffeeState.machineOwned = true;
    state.advisorProgressState.funding = getShopActionListedPrice(state, action, payload)! - 0.01;
    state.player.money = 100;
    state.loverProgressState.giftCoupons = 1;
    const failed = dispatchAction(state, action, payload);
    expect(failed.shopState).toEqual(state.shopState);
    expect(failed.coffeeState).toEqual(state.coffeeState);
    expect(failed.player.money).toBe(100);
    expect(failed.loverProgressState.giftCoupons).toBe(1);
    expect(failed.advisorProgressState).toEqual(state.advisorProgressState);
    expect(failed.log[0]!.text).toContain("科研经费不足");
  });

  it.each([0, 2])("expires only event allowances across months for branch %i", (branch) => {
    const granted = resolve(fundingDecision(makeState(), branch));
    const kind = branch === 0 ? "gpuTransaction" : "workstationTransaction";
    granted.shopState.entitlements[kind] = 1;
    const saved = JSON.parse(JSON.stringify(granted)) as GameState;
    const next = applyMonthlyEffects({ ...saved, month: 7, totalMonths: 7 }).nextState;
    expect(getLabReimbursementCount(next, kind)).toBe(0);
    expect(next.shopState.labReimbursements[kind]).toBe(0);
    expect(next.shopState.entitlements[kind]).toBe(1);
    const payload = { shopItemId: branch === 0 ? "gpu_buy" : "keyboard" } as const;
    const purchased = applyShopAction(next, "buy-shop-item", payload);
    expect(purchased.shopState.entitlements[kind]).toBe(0);
    expect(purchased.advisorProgressState).toEqual(next.advisorProgressState);
    expect(getShopActionPrice(purchased, "buy-shop-item", payload)).toBeGreaterThan(0);
  });

  it("uses permanent entitlements before lab allowances without charging them", () => {
    const state = resolve(fundingDecision(makeState(), 0));
    state.shopState.entitlements.gpuTransaction = 1;
    const permanent = applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(permanent.advisorProgressState.funding).toBe(100);
    expect(getLabReimbursementCount(permanent, "gpuTransaction")).toBe(1);
    const price = getShopActionListedPrice(permanent, "buy-shop-item", { shopItemId: "gpu_buy" })!;
    const reimbursed = applyShopAction(permanent, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(reimbursed.advisorProgressState.funding).toBe(100 - price);
    expect(getLabReimbursementCount(reimbursed, "gpuTransaction")).toBe(0);
  });

  it.each([0, 2])("grants branch %i for the confirmation month and caps outstanding grants at one", (branch) => {
    const pending = fundingDecision(makeState(), branch);
    const kind = branch === 0 ? "gpuTransaction" : "workstationTransaction";
    const granted = resolve({ ...pending, totalMonths: 7, month: 7 });
    expect(getLabReimbursementCount(granted, kind)).toBe(1);
    expect(granted.shopState.labReimbursements.totalMonths).toBe(7);
    const repeated = resolve(fundingDecision(granted, branch));
    expect(getLabReimbursementCount(repeated, kind)).toBe(1);
    expect(getLabReimbursementCount({ ...repeated, totalMonths: 8 }, kind)).toBe(0);
  });

  it("does not spend funding on invalid equipment operations or model-update renewals", () => {
    const equipment = resolve(fundingDecision(makeState(), 2));
    const failed = applyShopAction(equipment, "upgrade-shop-item", { shopUpgradeId: "chair-advanced" });
    expect(failed.advisorProgressState).toEqual(equipment.advisorProgressState);
    expect(failed.shopState).toEqual(equipment.shopState);
    const base = makeState();
    const ai = resolve(fundingDecision({ ...base, totalMonths: 12, month: 12 }, 3));
    ai.aiShopState.subscriptions.gpt = { enabled: true, active: true, paused: false, modelId: "gpt-3.5", lastRenewalTotalMonths: 12 };
    const renewed = applyMonthStartSubscriptions({ ...ai, totalMonths: 13, month: 1 });
    expect(renewed.nextState.advisorProgressState).toEqual(ai.advisorProgressState);
    expect(renewed.nextState.aiShopState.subscriptions.gpt).toMatchObject({ active: false, enabled: false });
    expect(renewed.resolution.items[0]!.note).toContain("模型已更新");
  });

  it("covers all six AI providers next month and charges only successful use", () => {
    const funded = resolve(fundingDecision(makeState(), 3));
    expect(hasAiReimbursement(funded)).toBe(false);
    expect(funded.advisorProgressState.funding).toBe(100);
    funded.aiShopState.subscriptions.gpt.enabled = true;
    const covered = applyMonthlyEffects({ ...funded, month: 7, totalMonths: 7 }).nextState;
    const control = applyMonthlyEffects({ ...funded, buffs: [], month: 7, totalMonths: 7 }).nextState;
    expect(covered.advisorProgressState.funding).toBe(control.advisorProgressState.funding - 2);
    let purchased = covered;
    for (const slot of AI_SLOT_IDS) {
      purchased = applyShopAction(purchased, "buy-ai-month", { aiSlotId: slot });
      expect(purchased.aiShopState.subscriptions[slot].active).toBe(true);
    }
    const totalCost = AI_SLOT_IDS.reduce((sum, slot) => sum + getAiModelForTotalMonths(7, slot).price, 0);
    expect(purchased.player.money).toBe(covered.player.money);
    expect(purchased.advisorProgressState.funding).toBe(control.advisorProgressState.funding - totalCost);
    expect(applyMonthStartSubscriptions(purchased).nextState.advisorProgressState).toEqual(purchased.advisorProgressState);
    const expired = applyMonthlyEffects({ ...purchased, month: 8, totalMonths: 8 }).nextState;
    expect(hasAiReimbursement(expired)).toBe(false);
    expect(expired.advisorProgressState.funding).toBe(purchased.advisorProgressState.funding - 1.5);
  });

  it("pauses unfunded AI renewals without personal payment and permits manual retry", () => {
    const funded = resolve(fundingDecision(makeState(), 3));
    funded.player.money = 100;
    funded.loverProgressState.giftCoupons = 1;
    funded.advisorProgressState.funding = 1;
    funded.aiShopState.subscriptions.gpt.enabled = true;
    const settlement = applyMonthStartSubscriptions({ ...funded, month: 7, totalMonths: 7 });
    expect(settlement.nextState.aiShopState.subscriptions.gpt).toMatchObject({ active: false, paused: true });
    expect(settlement.resolution.items[0]!.note).toContain("科研经费不足");
    expect(settlement.nextState.player.money).toBe(100);
    expect(settlement.nextState.advisorProgressState.funding).toBe(1);
    const failed = applyShopAction(settlement.nextState, "buy-ai-month", { aiSlotId: "gpt" });
    expect(failed.aiShopState).toEqual(settlement.nextState.aiShopState);
    const retry = applyShopAction({ ...failed, advisorProgressState: { ...failed.advisorProgressState, funding: 2 } }, "buy-ai-month", { aiSlotId: "gpt" });
    expect(retry.aiShopState.subscriptions.gpt.active).toBe(true);
    expect(retry.advisorProgressState.funding).toBe(0);
    expect(retry.player.money).toBe(100);
    expect(retry.loverProgressState.giftCoupons).toBe(1);
  });

  it("previews the same limited funding after payroll without changing state", () => {
    const funded = resolve(fundingDecision(makeState(), 3));
    funded.advisorProgressState.funding = 3;
    funded.player.money = 100;
    funded.aiShopState.subscriptions.gpt.enabled = true;
    funded.aiShopState.subscriptions.claude.enabled = true;
    const before = structuredClone(funded);
    const preview = previewNextMonthEffects(funded);
    const actual = applyMonthlyEffects({ ...funded, month: 7, totalMonths: 7 });
    expect(preview.items.filter(item => item.id.startsWith("ai-renewal"))).toEqual(actual.resolution.items.filter(item => item.id.startsWith("ai-renewal")));
    expect(actual.nextState.advisorProgressState.funding).toBe(0);
    expect(actual.nextState.aiShopState.subscriptions.gpt.active).toBe(true);
    expect(actual.nextState.aiShopState.subscriptions.claude.paused).toBe(true);
    expect(funded).toEqual(before);
  });
});
