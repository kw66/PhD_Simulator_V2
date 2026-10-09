import { describe, expect, it } from "vitest";
import { renderShopSection, type ShopTabId } from "../src/app/v2-render-shop-panel";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import type { GameState } from "../src/core/v2-types";

function reimbursedState(funding: number): GameState {
  const state = createStartedGameState("normal");
  return {
    ...state,
    year: 1,
    month: 2,
    totalMonths: 2,
    player: { ...state.player, money: 0 },
    advisorProgressState: { ...state.advisorProgressState, funding },
    shopState: {
      ...state.shopState,
      labReimbursements: { totalMonths: 2, gpuTransaction: 1, workstationTransaction: 1 },
    },
    eventSupport: { ...state.eventSupport, aiCostsCoveredUntilTotalMonths: 2 },
  };
}

function findButton(html: string, action: string, attribute?: string): string {
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gu)].map((match) => match[0]);
  const matching = buttons.filter((button) => button.includes(`data-action="${action}"`)
    && (!attribute || button.includes(attribute)));
  expect(matching).toHaveLength(1);
  return matching[0]!;
}

const purchases = [
  { name: "GPU purchase", tab: "gear", action: "buy-shop-item", attribute: 'data-shop-item-id="gpu_buy"', cost: 6 },
  { name: "GPU upgrade", tab: "gear", action: "buy-shop-item", attribute: 'data-shop-item-id="gpu_buy"', cost: 7, gpuLevel: 1 },
  { name: "keyboard", tab: "gear", action: "buy-shop-item", attribute: 'data-shop-item-id="keyboard"', cost: 7 },
  { name: "monitor", tab: "gear", action: "buy-shop-item", attribute: 'data-shop-item-id="monitor"', cost: 8 },
  { name: "chair", tab: "rest", action: "buy-shop-item", attribute: 'data-shop-item-id="chair"', cost: 10 },
  { name: "chair upgrade", tab: "rest", action: "upgrade-shop-item", attribute: 'data-shop-upgrade-id="chair-advanced"', cost: 18, chairOwned: true },
  { name: "coffee machine", tab: "coffee", action: "buy-coffee-machine", cost: 5 },
  { name: "coffee upgrade", tab: "coffee", action: "upgrade-coffee-machine", attribute: 'data-shop-upgrade-id="manual"', cost: 12, machineOwned: true },
  { name: "AI subscription", tab: "ai", action: "buy-ai-month", attribute: 'data-ai-slot-id="gpt"', cost: 2 },
] satisfies Array<{
  name: string; tab: ShopTabId; action: string; attribute?: string; cost: number;
  gpuLevel?: number; chairOwned?: boolean; machineOwned?: boolean;
}>;

describe("shop lab funding presentation", () => {
  it.each(purchases)("shows the actual lab debit and funding boundary for $name", (purchase) => {
    for (const funding of [purchase.cost - 0.01, purchase.cost]) {
      const state = reimbursedState(funding);
      if ("gpuLevel" in purchase) state.shopState.gpuLevel = purchase.gpuLevel!;
      if ("chairOwned" in purchase) state.shopState.chairOwned = true;
      if ("machineOwned" in purchase) state.coffeeState.machineOwned = true;
      const before = structuredClone(state);
      const html = renderShopSection(state, purchase.tab, "chair-advanced", "manual");
      const button = findButton(html, purchase.action, "attribute" in purchase ? purchase.attribute : undefined);
      expect(button).toContain(`（经费 -${purchase.cost}）`);
      expect(button).toContain(`，0 金币"`);
      if (funding < purchase.cost) {
        expect(button).toContain('disabled aria-disabled="true"');
        expect(button).toContain(`title="科研经费不足（需${purchase.cost}，现有${funding}）"`);
      } else {
        expect(button).not.toContain('aria-disabled="true"');
        expect(button).toContain(`title="报销：科研经费 -${purchase.cost}，个人金币 0"`);
      }
      expect(state).toEqual(before);
    }
  });

  it("preserves ordinary personal purchases and free AI models with no lab debit", () => {
    const state = reimbursedState(0);
    const bike = findButton(renderShopSection(state, "gear"), "buy-shop-item", 'data-shop-item-id="bike"');
    expect(bike).not.toContain("经费");
    expect(bike).toContain('aria-disabled="true"');
    expect(bike).toContain('，6 金币"');
    const coffee = findButton(renderShopSection(state, "coffee"), "buy-coffee");
    expect(coffee).not.toContain("经费");
    expect(coffee).toContain('title="金币不足"');
    const freeModel = findButton(renderShopSection(state, "ai"), "buy-ai-month", 'data-ai-slot-id="doubao"');
    expect(freeModel).not.toContain("经费");
    expect(freeModel).not.toContain('aria-disabled="true"');
  });

  it("preserves gift and permanent entitlement purchases without lab funding", () => {
    const state = reimbursedState(0);
    state.shopState.entitlements = { gpuTransaction: 1, workstationTransaction: 1 };
    const gear = renderShopSection(state, "gear");
    for (const item of ["gpu_buy", "keyboard", "monitor"]) {
      const button = findButton(gear, "buy-shop-item", `data-shop-item-id="${item}"`);
      expect(button).not.toContain("经费");
      expect(button).not.toContain('aria-disabled="true"');
      expect(button).toContain('，0 金币"');
    }
    state.shopState.entitlements = { gpuTransaction: 0, workstationTransaction: 0 };
    state.shopState.labReimbursements.totalMonths = state.totalMonths - 1;
    state.loverProgressState.giftCoupons = 1;
    const gift = findButton(renderShopSection(state, "gear"), "buy-shop-item", 'data-shop-item-id="keyboard"');
    expect(gift).not.toContain("经费");
    expect(gift).not.toContain('aria-disabled="true"');
    expect(gift).toContain('，0 金币"');
  });

  it("does not use a lover gift to bypass an active reimbursement funding shortage", () => {
    const state = reimbursedState(0);
    state.loverProgressState.giftCoupons = 1;
    const button = findButton(renderShopSection(state, "gear"), "buy-shop-item", 'data-shop-item-id="keyboard"');
    expect(button).toContain('title="科研经费不足（需7，现有0）"');
    expect(button).toContain('aria-disabled="true"');
  });

  it("keeps upgrade selection and already purchased subscription locks intact", () => {
    const state = reimbursedState(0);
    state.shopState.chairOwned = true;
    const chair = renderShopSection(state, "rest");
    expect(chair).toContain('title="请先选择升级路线"');
    state.aiShopState.subscriptions.gpt.active = true;
    const subscription = findButton(renderShopSection(state, "ai"), "buy-ai-month", 'data-ai-slot-id="gpt"');
    expect(subscription).toContain('title="本月已订购"');
    expect(subscription).toContain('aria-disabled="true"');
    expect(subscription).not.toContain("经费");
  });
});
