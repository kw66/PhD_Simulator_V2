import { describe, expect, it } from "vitest";
import { AI_SLOT_IDS, getAiModelForTotalMonths, renewAiSubscriptionSlot } from "../src/core/v2-ai-shop";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import {
  getLabReimbursementReserveAmount,
  getLabReimbursementQuote,
  getLabReimbursementPurchaseQuote,
  reconcileLabAiReimbursements,
  reserveLabReimbursement,
  settleLabReimbursementPurchase,
} from "../src/core/v2-lab-reimbursements";
import { createFundingCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { applyShopAction } from "../src/core/v2-shop-transactions";
import type { DispatchPayload, GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const initial = createStartedGameState("normal");
  return {
    ...initial,
    phase: "playing",
    month: 12,
    totalMonths: 12,
    eventQueue: [],
    buffs: [],
    player: { ...initial.player, money: 0, favor: 18 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 100 },
  };
}

function equipmentReservation(state: GameState, kind: "gpu" | "workstation"): GameState {
  const reserved = reserveLabReimbursement(state, kind);
  const entitlement = kind === "gpu" ? "gpuTransaction" : "workstationTransaction";
  return {
    ...reserved,
    shopState: {
      ...reserved.shopState,
      entitlements: { ...reserved.shopState.entitlements, [entitlement]: reserved.shopState.entitlements[entitlement] + 1 },
    },
  };
}

function fundingDecision(state: GameState, branch: number): GameState {
  const event = createFundingCampusRandomEvent(state, () => 0);
  let next = { ...state, eventQueue: [createEventQueueItem(event, 1)] };
  for (const choiceIndex of [0, branch]) {
    const queued = getResolvableQueuedEvent(next, next.eventQueue[0]!);
    next = dispatchAction(next, "resolve-event", { eventId: queued.id, eventChoiceId: queued.choices[choiceIndex]!.id });
  }
  return next;
}

function confirmFunding(state: GameState): GameState {
  const queued = getResolvableQueuedEvent(state, state.eventQueue[0]!);
  return dispatchAction(state, "resolve-event", { eventId: queued.id, eventChoiceId: queued.choices[0]!.id });
}

describe("lab reimbursement reserves", () => {
  it.each(["gpu", "workstation", "ai"] as const)("rejects an unaffordable %s reservation without a partial debit", (kind) => {
    const state = makeState();
    const required = getLabReimbursementReserveAmount(state, kind);
    state.advisorProgressState.funding = required - 1;
    const before = structuredClone(state);
    expect(getLabReimbursementQuote(state, kind)).toMatchObject({ amount: required, affordable: false });
    expect(reserveLabReimbursement(state, kind)).toBe(state);
    expect(state).toEqual(before);
    state.advisorProgressState.funding = required;
    expect(reserveLabReimbursement(state, kind).advisorProgressState.funding).toBe(0);
  });

  it.each([0, 1, 2, 3])("guards branch %i final confirmation and allows closing without reimbursement", (branch) => {
    const state = makeState();
    state.advisorProgressState.funding = 0;
    const pending = fundingDecision(state, branch);
    const result = pending.eventQueue[0]!;
    expect(result.choices[0]!.disabledReason).toContain("经费不足");
    expect(confirmFunding(pending).advisorProgressState).toEqual(state.advisorProgressState);
    const cancelled = dispatchAction(pending, "resolve-event", {
      eventId: result.id, eventChoiceId: result.choices[1]!.id,
    });
    expect(cancelled.eventQueue.some((event) => event.chainId === "random-8")).toBe(false);
    expect(cancelled.advisorProgressState).toEqual(state.advisorProgressState);
    expect(cancelled.shopState.entitlements).toEqual(state.shopState.entitlements);
    expect(cancelled.buffs).toEqual(state.buffs);
    expect(cancelled.player.money).toBe(state.player.money);
  });

  it.each([0, 1, 2, 3])("rechecks branch %i funding on execution without granting deferred rewards", (branch) => {
    const initial = makeState();
    const pending = fundingDecision(initial, branch);
    expect(pending.shopState.entitlements).toEqual(initial.shopState.entitlements);
    expect(pending.buffs).toEqual(initial.buffs);
    expect(pending.advisorProgressState).toEqual(initial.advisorProgressState);
    const stale = { ...pending, advisorProgressState: { ...pending.advisorProgressState, funding: 0 } };
    const resolved = confirmFunding(stale);
    expect(resolved.advisorProgressState).toEqual(stale.advisorProgressState);
    expect(resolved.shopState.entitlements).toEqual(initial.shopState.entitlements);
    expect(resolved.buffs).toEqual(initial.buffs);
    expect(resolved.player.money).toBe(initial.player.money);
  });

  it("reserves the current equipment price on final dispatch and refunds the difference on purchase", () => {
    const pending = fundingDecision(makeState(), 2);
    const updated = { ...pending, shopState: { ...pending.shopState, chairOwned: true } };
    const funded = confirmFunding(updated);
    expect(funded.advisorProgressState.funding).toBe(80);
    expect(funded.advisorProgressState.labReimbursements).toEqual([{ kind: "workstation", amount: 20, coveredTotalMonths: null }]);
    expect(funded.shopState.entitlements.workstationTransaction).toBe(1);
    const purchased = dispatchAction(funded, "buy-shop-item", { shopItemId: "keyboard" });
    expect(purchased.advisorProgressState.funding).toBe(93);
    expect(purchased.advisorProgressState.labReimbursements).toEqual([]);
    expect(purchased.shopState.entitlements.workstationTransaction).toBe(0);
    const event = updated.eventQueue[0]!;
    const repeated = dispatchAction(purchased, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    expect(repeated.advisorProgressState).toEqual(purchased.advisorProgressState);
  });

  it("integrates AI confirmation, covered purchases and end-of-month refund before renewal", () => {
    const initial = { ...makeState(), month: 6, totalMonths: 6 };
    const funded = confirmFunding(fundingDecision(initial, 3));
    const reserved = getLabReimbursementReserveAmount(initial, "ai");
    expect(funded.advisorProgressState.funding).toBe(100 - reserved);
    expect(funded.advisorProgressState.labReimbursements).toEqual([{ kind: "ai", amount: reserved, coveredTotalMonths: 7 }]);
    const covered = applyMonthlyEffects({ ...funded, month: 7, totalMonths: 7 }).nextState;
    const purchased = dispatchAction(covered, "buy-ai-month", { aiSlotId: "gpt" });
    expect(purchased.player.money).toBe(covered.player.money);
    expect(purchased.advisorProgressState.labReimbursements).toEqual(funded.advisorProgressState.labReimbursements);
    const closing = { ...purchased, month: 8, totalMonths: 8 };
    const control = applyMonthlyEffects({
      ...closing,
      advisorProgressState: { ...closing.advisorProgressState, labReimbursements: [] },
    }).nextState;
    const reconciled = applyMonthlyEffects(closing).nextState;
    expect(reconciled.advisorProgressState.funding - control.advisorProgressState.funding)
      .toBe(reserved - getAiModelForTotalMonths(7, "gpt").price);
    expect(reconciled.advisorProgressState.labReimbursements).toEqual([]);
  });

  it.each([
    { kind: "gpu", action: "buy-shop-item", payload: { shopItemId: "gpu_buy" }, additional: 1 },
    { kind: "workstation", action: "upgrade-shop-item", payload: { shopUpgradeId: "chair-advanced" }, additional: 8 },
    { kind: "workstation", action: "upgrade-coffee-machine", payload: { shopUpgradeId: "manual" }, additional: 2 },
  ] as const)("rejects $action when its reservation shortfall cannot be funded, then logs an affordable top-up", ({ kind, action, payload, additional }) => {
    let state = equipmentReservation(makeState(), kind);
    if (kind === "gpu") state.shopState.gpuLevel = 1;
    if (action === "upgrade-shop-item") state.shopState.chairOwned = true;
    if (action === "upgrade-coffee-machine") state.coffeeState.machineOwned = true;
    state.advisorProgressState.funding = additional - 1;
    const before = structuredClone(state);
    expect(getLabReimbursementPurchaseQuote(state, action, payload)?.additionalFunding).toBe(additional);
    expect(settleLabReimbursementPurchase(state, action, payload)).toBe(state);
    const rejected = dispatchAction(state, action, payload);
    expect(rejected.advisorProgressState).toEqual(state.advisorProgressState);
    expect(rejected.shopState).toEqual(state.shopState);
    expect(rejected.coffeeState).toEqual(state.coffeeState);
    expect(rejected.player.money).toBe(state.player.money);
    expect(rejected.log[0]!.text).toContain("差额");
    expect(state).toEqual(before);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: additional } };
    const purchased = dispatchAction(state, action, payload);
    expect(purchased.advisorProgressState.funding).toBe(0);
    expect(purchased.advisorProgressState.labReimbursements).toEqual([]);
    expect(purchased.log.some((entry) => entry.text.includes(`补足差额 -${additional}`))).toBe(true);
  });

  it.each([[0, 3], [6, 5], [12, 7], [18, 9]])("debits actual lab funding for favor %i labor pay", (favor, amount) => {
    const state = makeState();
    state.player.favor = favor;
    const event = createFundingCampusRandomEvent(state, () => 0);
    const decision = event.choices[0]!.effects.enqueueEvents![0]!.choices[1]!;
    const salary = decision.effects.enqueueEvents![0]!.choices[0]!;
    const paid = applyChoiceEffectsToState(state, salary).nextState;
    expect(paid.player.money).toBe(amount);
    expect(paid.advisorProgressState.funding).toBe(100 - amount);
    expect(paid.advisorProgressState.labReimbursements).toBeUndefined();
  });

  it.each([[0, 3], [6, 5], [12, 7], [18, 9]])("rechecks the exact labor payment %i/%i after funding changes", (favor, amount) => {
    const initial = makeState();
    initial.player.favor = favor;
    const pending = fundingDecision(initial, 1);
    expect(pending.player.money).toBe(initial.player.money);
    expect(pending.advisorProgressState.funding).toBe(100);
    const result = pending.eventQueue[0]!;
    expect(result.description).toContain(`金币 +${amount}；实验室经费 -${amount}`);
    expect(result.completionLog).toContain(`实验室经费 -${amount}`);
    expect(result.choices[0]!.outcome).toContain(`实验室经费 -${amount}`);
    const changed = {
      ...pending,
      player: { ...pending.player, favor: 0 },
      advisorProgressState: { ...pending.advisorProgressState, funding: amount - 1 },
    };
    const rejected = confirmFunding(changed);
    expect(rejected.player.money).toBe(initial.player.money);
    expect(rejected.advisorProgressState).toEqual(changed.advisorProgressState);
    const affordable = { ...changed, advisorProgressState: { ...changed.advisorProgressState, funding: amount } };
    const paid = confirmFunding(affordable);
    expect(paid.player.money).toBe(initial.player.money + amount);
    expect(paid.advisorProgressState.funding).toBe(0);
    expect(paid.advisorProgressState.labReimbursements).toBeUndefined();
    expect(paid.log.some((entry) => entry.text.includes(`实验室经费 -${amount}`))).toBe(true);
    const repeated = dispatchAction(paid, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.player.money).toBe(paid.player.money);
    expect(repeated.advisorProgressState).toEqual(paid.advisorProgressState);
  });

  it("places reservation requests only on approved final confirmations", () => {
    const state = makeState();
    const before = structuredClone(state);
    const event = createFundingCampusRandomEvent(state, () => 0);
    const choices = event.choices[0]!.effects.enqueueEvents![0]!.choices;
    expect(event.choices[0]!.effects.labReimbursementReservation).toBeUndefined();
    expect(choices.every((choice) => choice.effects.labReimbursementReservation === undefined)).toBe(true);
    expect(choices.map((choice) => choice.effects.enqueueEvents![0]!.choices[0]!.effects.labReimbursementReservation))
      .toEqual(["gpu", { kind: "labor", amount: 9 }, "workstation", "ai"]);
    state.player.favor = 0;
    const denied = createFundingCampusRandomEvent(state, () => 0.99);
    expect(denied.choices[0]!.effects.enqueueEvents![0]!.choices.filter((_, index) => index !== 1).every((choice) =>
      choice.effects.enqueueEvents![0]!.choices[0]!.effects.labReimbursementReservation === undefined)).toBe(true);
    expect(before.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
    expect(state.advisorProgressState.labReimbursements).toBeUndefined();
  });

  it("prices the options available at confirmation, ignoring free entitlements and lover gifts", () => {
    const state = makeState();
    state.shopState.entitlements = { gpuTransaction: 1, workstationTransaction: 1 };
    state.loverProgressState.giftCoupons = 1;
    expect(getLabReimbursementReserveAmount(state, "gpu")).toBe(6);
    expect(getLabReimbursementReserveAmount(state, "workstation")).toBe(10);
    state.shopState.chairOwned = true;
    expect(getLabReimbursementReserveAmount(state, "workstation")).toBe(20);
    state.shopState.chairUpgrade = "advanced";
    state.coffeeState.machineOwned = true;
    expect(getLabReimbursementReserveAmount(state, "workstation")).toBe(18);
    state.coffeeState.machineUpgrade = "manual";
    expect(getLabReimbursementReserveAmount(state, "workstation")).toBe(8);
    state.shopState.monitorOwned = true;
    state.shopState.keyboardOwned = true;
    state.shopState.gpuLevel = 10;
    expect(getLabReimbursementReserveAmount(state, "workstation")).toBe(0);
    expect(getLabReimbursementReserveAmount(state, "gpu")).toBe(0);
  });

  const purchases: Array<{
    action: Parameters<typeof applyShopAction>[1];
    payload: DispatchPayload;
    cost: number;
  }> = [
    { action: "buy-shop-item", payload: { shopItemId: "keyboard" }, cost: 7 },
    { action: "buy-shop-item", payload: { shopItemId: "monitor" }, cost: 8 },
    { action: "buy-shop-item", payload: { shopItemId: "chair" }, cost: 10 },
    { action: "upgrade-shop-item", payload: { shopUpgradeId: "chair-advanced" }, cost: 18 },
    { action: "buy-coffee-machine", payload: {}, cost: 5 },
    { action: "upgrade-coffee-machine", payload: { shopUpgradeId: "manual" }, cost: 12 },
  ];

  it.each(purchases)("consumes one reserve and refunds unused funding for $action $payload", ({ action, payload, cost }) => {
    let state = makeState();
    if (action === "upgrade-shop-item") state.shopState.chairOwned = true;
    if (action === "upgrade-coffee-machine") state.coffeeState.machineOwned = true;
    state = equipmentReservation(state, "workstation");
    const before = structuredClone(state);
    const purchased = applyShopAction(state, action, payload);
    expect(purchased.advisorProgressState.funding).toBe(100 - cost);
    expect(purchased.advisorProgressState.labReimbursements).toEqual([]);
    expect(purchased.shopState.entitlements.workstationTransaction).toBe(0);
    expect(purchased.player.money).toBe(0);
    expect(state).toEqual(before);
    expect(applyShopAction(purchased, action, payload).advisorProgressState.funding).toBe(100 - cost);
  });

  it("preserves reserves on invalid operations and consumes stacked GPU reservations individually", () => {
    let state = makeState();
    state.shopState.gpuLevel = 3;
    state = equipmentReservation(equipmentReservation(state, "gpu"), "gpu");
    state = equipmentReservation(state, "workstation");
    const rejected = applyShopAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-advanced" });
    expect(rejected.advisorProgressState).toEqual(state.advisorProgressState);
    const first = applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(first.advisorProgressState.labReimbursements?.map((reservation) => reservation.kind)).toEqual(["gpu", "workstation"]);
    const second = applyShopAction(first, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(second.advisorProgressState.funding).toBe(100 - 9 - 10 - 10);
    expect(second.advisorProgressState.labReimbursements?.map((reservation) => reservation.kind)).toEqual(["workstation"]);
    expect(second.shopState.entitlements.gpuTransaction).toBe(0);
  });

  it("never creates lab reserves or debits funding for talent/debug vouchers", () => {
    const state = makeState();
    state.shopState.entitlements = { gpuTransaction: 1, workstationTransaction: 1 };
    const gpu = applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    const workstation = applyShopAction(gpu, "buy-coffee-machine", {});
    expect(workstation.advisorProgressState).toEqual(state.advisorProgressState);
    expect(workstation.player.money).toBe(0);
    expect(reconcileLabAiReimbursements(workstation, state.totalMonths)).toBe(workstation);
  });

  it("reserves all six next-month model fees across an academic-year price change", () => {
    const state = makeState();
    state.totalMonths = 24;
    const total = AI_SLOT_IDS.reduce((sum, slot) => sum + getAiModelForTotalMonths(25, slot).price, 0);
    expect(total).toBeGreaterThan(AI_SLOT_IDS.reduce((sum, slot) => sum + getAiModelForTotalMonths(24, slot).price, 0));
    const reserved = reserveLabReimbursement(state, "ai");
    expect(reserved.advisorProgressState.funding).toBe(100 - total);
    expect(reserved.advisorProgressState.labReimbursements).toEqual([{ kind: "ai", amount: total, coveredTotalMonths: 25 }]);
    expect(reserveLabReimbursement(reserved, "ai")).toBe(reserved);
    expect(reconcileLabAiReimbursements(reserved, 24)).toBe(reserved);
    const refunded = reconcileLabAiReimbursements(reserved, 25);
    expect(refunded.advisorProgressState.funding).toBe(100);
    expect(reconcileLabAiReimbursements(refunded, 25)).toBe(refunded);
  });

  it("reconciles manual purchases and automatic renewals once, leaving future and equipment reserves", () => {
    let state = equipmentReservation(reserveLabReimbursement(makeState(), "ai"), "gpu");
    state = { ...state, totalMonths: 13, month: 1, eventSupport: { ...state.eventSupport, aiCostsCoveredUntilTotalMonths: 13 } };
    state.aiShopState.subscriptions.gpt.enabled = true;
    const renewal = renewAiSubscriptionSlot(state.aiShopState, 13, 0, "gpt", true);
    state = { ...state, aiShopState: renewal.state };
    state = applyShopAction(state, "buy-ai-month", { aiSlotId: "claude" });
    const repeated = applyShopAction(state, "buy-ai-month", { aiSlotId: "claude" });
    expect(repeated.aiShopState).toEqual(state.aiShopState);
    state = applyShopAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" });
    state = reserveLabReimbursement(state, "ai");
    const before = structuredClone(state);
    const reconciled = reconcileLabAiReimbursements(state, 13);
    const used = getAiModelForTotalMonths(13, "gpt").price + getAiModelForTotalMonths(13, "claude").price;
    const future = getLabReimbursementReserveAmount(state, "ai");
    expect(reconciled.advisorProgressState.funding).toBe(100 - 6 - used - future);
    expect(reconciled.advisorProgressState.labReimbursements?.map((reservation) => reservation.kind)).toEqual(["gpu", "ai"]);
    expect(reconcileLabAiReimbursements(reconciled, 13)).toBe(reconciled);
    expect(state).toEqual(before);
  });

  it("refunds inactive AI slots even when failed renewal records the covered month", () => {
    let state = reserveLabReimbursement(makeState(), "ai");
    state = { ...state, totalMonths: 13 };
    state.aiShopState.subscriptions.gpt = {
      enabled: true, active: true, paused: false,
      modelId: getAiModelForTotalMonths(12, "gpt").id, lastRenewalTotalMonths: 12,
    };
    const renewal = renewAiSubscriptionSlot(state.aiShopState, 13, 0, "gpt", true);
    expect(renewal.items[0]?.reason).toBe("model-updated");
    state = { ...state, aiShopState: renewal.state };
    expect(reconcileLabAiReimbursements(state, 13).advisorProgressState.funding).toBe(100);
  });
});
