import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyResearchOperationActionState, previewResearchOperation } from "../src/core/v2-research-operation";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { getShopPaperActionModifier } from "../src/core/v2-shop-items";
import { getShopActionPrice } from "../src/core/v2-shop-transactions";
import {
  getActiveOperationAllowance,
  getAiModelForTotalMonths,
  getAiModelTimeline,
  createAiBuffs,
  createAiShopState,
  hasAiCollaboration,
  polishUnsubmittedPapers,
  renewAiSubscriptionSlot,
} from "../src/core/v2-ai-shop";

function admittedState() {
  let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-open-advisor-info" });
  state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-confirm" });
  state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-finish" });
  state = dispatchAction(state, "next-month");
  return { ...state, eventQueue: [], buffs: [], player: { ...state.player, money: 100, san: 10 } };
}

describe("v2 shop transactions", () => {
  it("allows shop interactions before enrollment during development", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = { ...state, player: { ...state.player, money: 5 } };

    const bought = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(bought.aiShopState.subscriptions.gpt.active).toBe(true);
    expect(bought.player.money).toBe(3);

    const toggled = dispatchAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" });
    expect(toggled.aiShopState.subscriptions.gpt.enabled).toBe(true);
  });

  it("selects the six-year model milestones for each provider", () => {
    expect(getAiModelForTotalMonths(1, "gpt").name).toBe("GPT-3.5");
    expect(getAiModelForTotalMonths(13, "gpt").name).toBe("GPT-4o");
    expect(getAiModelForTotalMonths(25, "gpt").name).toBe("GPT-5");
    expect(getAiModelForTotalMonths(37, "gpt").name).toBe("GPT-5.6-sol");
    expect(getAiModelForTotalMonths(1, "claude").name).toBe("Claude 2");
    expect(getAiModelForTotalMonths(25, "gemini").name).toBe("Gemini 2.5");
    expect(getAiModelForTotalMonths(25, "gemini").price).toBe(1);
    expect(getAiModelForTotalMonths(25, "gemini").relationshipOperationSanDelta).toBeUndefined();
    expect(getAiModelForTotalMonths(37, "gemini").price).toBe(3);
    expect(getAiModelForTotalMonths(37, "gemini").relationshipOperationSanDelta).toBe(-1);
    expect(getAiModelForTotalMonths(1, "deepseek").name).toBe("DeepSeek-V2");
    expect(getAiModelForTotalMonths(1, "deepseek").price).toBe(1);
    expect(getAiModelForTotalMonths(13, "deepseek").name).toBe("DeepSeek-V3.2");
    expect(getAiModelForTotalMonths(1, "doubao").name).toBe("豆包 Seed 1");
    expect(getAiModelForTotalMonths(1, "kimi")).toMatchObject({ name: "Kimi Chat", price: 1, readingEffect: { sanDelta: -1 } });
    expect(getAiModelForTotalMonths(13, "kimi")).toMatchObject({ name: "Kimi k1.5", price: 1, readingEffect: { sanDelta: -1, manualExtraReads: 1 } });
    expect(getAiModelForTotalMonths(25, "kimi")).toMatchObject({ name: "Kimi K2", price: 2, readingEffect: { sanDelta: -1, automaticReads: 1 } });
    expect(getAiModelForTotalMonths(37, "kimi")).toMatchObject({ name: "Kimi K3", price: 2, readingEffect: { sanDelta: -1, automaticReads: 1 } });
    expect(getAiModelForTotalMonths(49, "kimi")).toMatchObject({ name: "Kimi K4", price: 3, readingEffect: { sanDelta: -1, automaticReads: 2 } });
    expect(getAiModelForTotalMonths(61, "kimi")).toMatchObject({ name: "Kimi K5", price: 3, readingEffect: { sanDelta: -1, automaticReads: 2 } });
    expect(getAiModelTimeline().some((model) => model.name.includes("Opus 3.5"))).toBe(false);
  });

  it("buys and sells equipment without consuming actions or SAN", () => {
    const initial = admittedState();
    const purchased = dispatchAction(initial, "buy-shop-item", { shopItemId: "keyboard" });

    expect(purchased.player.money).toBe(initial.player.money - 7);
    expect(purchased.player.san).toBe(initial.player.san);
    expect(purchased.actionState).toEqual(initial.actionState);
    expect(purchased.shopState.keyboardOwned).toBe(true);

    const sold = dispatchAction(purchased, "sell-shop-item", { shopItemId: "keyboard" });
    expect(sold.player.money).toBe(initial.player.money - 4);
    expect(sold.player.san).toBe(initial.player.san);
    expect(sold.actionState).toEqual(initial.actionState);
    expect(sold.shopState.keyboardOwned).toBe(false);
  });

  it("buys the first bicycle tier for six coins", () => {
    const initial = { ...admittedState(), player: { ...admittedState().player, money: 6 } };
    const purchased = dispatchAction(initial, "buy-shop-item", { shopItemId: "bike" });

    expect(purchased.player.money).toBe(0);
    expect(purchased.shopState.bikeOwned).toBe(true);
    expect(purchased.shopState.bikeLevel).toBe(1);
    expect(purchased.shopState.investments.bike).toBe(6);
  });

  it("upgrades one GPU through the progressive 6-to-15 coin model chain", () => {
    const admitted = admittedState();
    const initial = { ...admitted, player: { ...admitted.player, money: 105 } };
    let state: ReturnType<typeof createInitialState> = initial;
    for (let level = 1; level <= 10; level += 1) {
      expect(getShopActionPrice(state, "buy-shop-item", { shopItemId: "gpu_buy" })).toBe(5 + level);
      state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
      expect(state.shopState.gpuLevel).toBe(level);
    }

    expect(state.player.money).toBe(0);
    expect(state.player.san).toBe(initial.player.san);
    expect(state.actionState).toEqual(initial.actionState);
    expect(getShopPaperActionModifier(state.shopState, "experiment")).toEqual({
      bonus: 10,
      extraActions: 10,
      sanDiscount: 0,
    });
    expect(state.shopState.investments.gpu).toBe(105);
    expect(state.log.some((entry) => entry.text.includes("显卡升级为 B300 显卡，金币 -15"))).toBe(true);

    const maxed = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(maxed.shopState.gpuLevel).toBe(10);
    expect(maxed.player.money).toBe(0);

    const sold = dispatchAction(maxed, "sell-shop-item", { shopItemId: "gpu_buy" });
    expect(sold.shopState.gpuLevel).toBe(0);
    expect(sold.player.money).toBe(52);
    expect(sold.shopState.investments.gpu).toBe(0);
    expect(sold.log.some((entry) => entry.text.includes("出售B300 显卡，金币 +52"))).toBe(true);
  });

  it("consumes mentor funding entitlements independently without creating resale value", () => {
    const admitted = admittedState();
    let state: ReturnType<typeof createInitialState> = {
      ...admitted,
      player: { ...admitted.player, money: 0 },
      shopState: {
        ...admitted.shopState,
        entitlements: {
          gpuTransaction: 1,
          keyboardPurchase: 1,
          monitorPurchase: 1,
          chairPurchase: 1,
          chairUpgrade: 1,
          coffeeMachinePurchase: 1,
          coffeeMachineUpgrade: 1,
        },
      },
    };

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "monitor" });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "chair" });
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-advanced" });
    state = dispatchAction(state, "buy-coffee-machine");
    state = dispatchAction(state, "upgrade-coffee-machine", { shopUpgradeId: "manual" });

    expect(state.player.money).toBe(0);
    expect(state.shopState.gpuLevel).toBe(1);
    expect(state.shopState.keyboardOwned).toBe(true);
    expect(state.shopState.monitorOwned).toBe(true);
    expect(state.shopState.chairUpgrade).toBe("advanced");
    expect(state.coffeeState.machineUpgrade).toBe("manual");
    expect(Object.values(state.shopState.entitlements)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(state.shopState.investments).toEqual({ gpu: 0, chair: 0, keyboard: 0, monitor: 0, bike: 0 });

    state = dispatchAction(state, "sell-shop-item", { shopItemId: "gpu_buy" });
    state = dispatchAction(state, "sell-shop-item", { shopItemId: "keyboard" });
    state = dispatchAction(state, "sell-shop-item", { shopItemId: "monitor" });
    state = dispatchAction(state, "sell-shop-item", { shopItemId: "chair" });
    state = dispatchAction(state, "sell-coffee-machine");
    expect(state.player.money).toBe(0);
  });

  it("applies coffee recovery and resets the monthly cup counter at month start", () => {
    const initial = admittedState();
    const equipped = dispatchAction(initial, "buy-coffee-machine");
    const coffee = dispatchAction(equipped, "buy-coffee", {});
    expect(coffee.player.money).toBe(equipped.player.money - 2);
    expect(coffee.player.san).toBe(equipped.player.san + 3);
    expect(coffee.actionState).toEqual(equipped.actionState);
    expect(coffee.coffeeState.coffeePurchaseCountThisMonth).toBe(1);
    expect(coffee.coffeeState.coffeeProducedCountThisMonth).toBe(1);

    const nextMonth = dispatchAction(coffee, "next-month");
    expect(nextMonth.coffeeState.coffeePurchaseCountThisMonth).toBe(0);
    expect(nextMonth.coffeeState.coffeeProducedCountThisMonth).toBe(0);
  });

  it("requires a coffee machine before controlling the ice-Americano subscription", () => {
    let state: ReturnType<typeof createInitialState> = admittedState();
    state = dispatchAction(state, "toggle-coffee-subscription");
    expect(state.coffeeState.subscriptionEnabled).toBe(false);
    state = dispatchAction(state, "buy-coffee-machine");
    state = dispatchAction(state, "toggle-coffee-subscription");
    expect(state.coffeeState.subscriptionEnabled).toBe(true);
    state = dispatchAction(state, "toggle-coffee-subscription");
    expect(state.coffeeState.subscriptionEnabled).toBe(false);
  });

  it("does not add timeline noise when changing monthly renewal switches", () => {
    let state: ReturnType<typeof createInitialState> = admittedState();
    const initialLogLength = state.log.length;

    state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" });
    expect(state.log).toHaveLength(initialLogLength);

    state = dispatchAction(state, "buy-coffee-machine");
    const afterMachineLogLength = state.log.length;
    state = dispatchAction(state, "toggle-coffee-subscription");
    state = dispatchAction(state, "toggle-coffee-subscription");
    expect(state.log).toHaveLength(afterMachineLogLength);
  });

  it("preserves advanced-machine progress through selling and re-upgrading", () => {
    let state: ReturnType<typeof createInitialState> = admittedState();
    state = dispatchAction(state, "buy-coffee-machine");
    state = {
      ...state,
      coffeeState: { ...state.coffeeState, machineTrackedCoffeeCount: 9 },
    };
    state = dispatchAction(state, "upgrade-coffee-machine", { shopUpgradeId: "advanced" });
    expect(state.coffeeState.machineTrackedCoffeeCount).toBe(9);

    state = dispatchAction(state, "buy-coffee");
    expect(state.coffeeState.machineTrackedCoffeeCount).toBe(10);
    state = dispatchAction(state, "sell-coffee-machine");
    expect(state.coffeeState.machineTrackedCoffeeCount).toBe(10);
    expect(state.coffeeState.machineUpgrade).toBeNull();
    state = dispatchAction(state, "buy-coffee-machine");
    state = dispatchAction(state, "upgrade-coffee-machine", { shopUpgradeId: "advanced" });
    expect(state.coffeeState.machineTrackedCoffeeCount).toBe(10);
  });

  it("preserves bicycle progress through selling and rebuying", () => {
    let state: ReturnType<typeof createInitialState> = admittedState();
    state = {
      ...state,
      shopState: {
        ...state.shopState,
        bikeOwned: true,
        bikeSanSpent: 11,
        bikeSanCapGains: 1,
      },
    };

    state = dispatchAction(state, "sell-shop-item", { shopItemId: "bike" });
    expect(state.shopState.bikeSanSpent).toBe(11);
    expect(state.shopState.bikeSanCapGains).toBe(1);

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "bike" });
    expect(state.shopState.bikeLevel).toBe(1);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "bike" });
    expect(state.shopState.bikeLevel).toBe(2);
    expect(state.shopState.bikeSanSpent).toBe(11);
    expect(state.shopState.bikeSanCapGains).toBe(1);
  });

  it("reduces ice-Americano production to one coin with the manual machine", () => {
    let state: ReturnType<typeof createInitialState> = admittedState();
    state = dispatchAction(state, "buy-coffee-machine");
    state = dispatchAction(state, "upgrade-coffee-machine", { shopUpgradeId: "manual" });
    const moneyBeforeCoffee = state.player.money;

    state = dispatchAction(state, "buy-coffee");
    expect(state.player.money).toBe(moneyBeforeCoffee - 1);
  });

  it("rests for two SAN by default and five with a hammock", () => {
    const initial = admittedState();
    const withoutHammock = dispatchAction({ ...initial, player: { ...initial.player, san: 10 } }, "rest");
    expect(withoutHammock.player.san).toBe(12);
    expect(withoutHammock.actionState.used).toBe(1);
    expect(withoutHammock.log[0]?.text).toContain("SAN +2");

    const hammockState = {
      ...initial,
      player: { ...initial.player, san: 10 },
      shopState: { ...initial.shopState, chairOwned: true, chairUpgrade: "hammock" as const },
    };
    const rested = dispatchAction(hammockState, "rest");
    expect(rested.player.san).toBe(15);
    expect(rested.actionState.used).toBe(1);
    expect(rested.log[0]?.text).toContain("SAN +5");
    expect(rested.shopState.chairSanRecovered).toBe(5);
  });

  it("does not add a log when resting at the SAN cap", () => {
    const initial = admittedState();
    const capped = {
      ...initial,
      player: { ...initial.player, san: initial.sanCap },
    };
    const rested = dispatchAction(capped, "rest");

    expect(rested.player.san).toBe(initial.sanCap);
    expect(rested.actionState.used).toBe(capped.actionState.used + 1);
    expect(rested.log).toEqual(capped.log);
  });

  it("lets the spike chair restore a zero-SAN reading result to 3", () => {
    const initial = admittedState();
    const protectedState = {
      ...initial,
      player: { ...initial.player, san: 2 },
      shopState: { ...initial.shopState, chairOwned: true, chairUpgrade: "spike" as const },
    };

    const read = dispatchAction(protectedState, "read-paper");
    expect(read.player.san).toBe(3);
    expect(read.phase).toBe("playing");
    expect(read.shopState.chairSanRecovered).toBe(3);
  });

  it("renews enabled AI subscriptions and pauses them independently when money is insufficient", () => {
    const initial = { ...admittedState(), player: { ...admittedState().player, money: 0 } };
    let state = dispatchAction(initial, "toggle-ai-subscription", { aiSlotId: "doubao" });
    state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" });
    state = dispatchAction(state, "next-month");

    const doubaoModel = getAiModelForTotalMonths(state.totalMonths, "doubao");
    expect(state.aiShopState.subscriptions.doubao.active).toBe(true);
    expect(state.aiShopState.subscriptions.doubao.modelId).toBe(doubaoModel.id);
    expect(state.aiShopState.subscriptions.gpt.active).toBe(false);
    expect(state.aiShopState.subscriptions.gpt.paused).toBe(true);
    expect(state.player.money).toBe(initial.player.money + 1);
  });

  it("keeps the combined coffee and AI subscription preview equal to actual month-start charges", () => {
    const initial = admittedState();
    const state = {
      ...initial,
      player: { ...initial.player, money: 3 },
      eventQueue: [],
      coffeeState: {
        ...initial.coffeeState,
        machineOwned: true,
        subscriptionEnabled: true,
      },
      aiShopState: {
        subscriptions: {
          ...initial.aiShopState.subscriptions,
          gpt: { ...initial.aiShopState.subscriptions.gpt, enabled: true },
        },
      },
    };

    const preview = previewNextMonthEffects(state);
    const advanced = dispatchAction(state, "next-month");
    expect(advanced.player.money).toBe(preview.player.money);
    expect(advanced.coffeeState.machineTrackedCoffeeCount).toBe(0);
    expect(advanced.coffeeState.coffeePurchaseCountThisMonth).toBe(1);
    expect(advanced.coffeeState.coffeeProducedCountThisMonth).toBe(1);
    expect(advanced.aiShopState.subscriptions.gpt.active).toBe(true);
  });

  it("uses mentor reimbursement for an AI month purchase", () => {
    const initial = admittedState();
    const reimbursed = {
      ...initial,
      eventSupport: { ...initial.eventSupport, aiCostsCoveredUntilTotalMonths: initial.totalMonths },
    };
    const bought = dispatchAction(reimbursed, "buy-ai-month", { aiSlotId: "gpt" });
    expect(bought.player.money).toBe(initial.player.money);
    expect(bought.aiShopState.subscriptions.gpt.active).toBe(true);
  });

  it("uses Kimi k1.5 to settle two reads in one manual action", () => {
    const initial = { ...admittedState(), year: 2, month: 1, totalMonths: 13 };
    const bought = dispatchAction(initial, "buy-ai-month", { aiSlotId: "kimi" });
    const read = dispatchAction(bought, "read-paper");

    expect(bought.player.money).toBe(initial.player.money - 1);
    expect(read.readingState.readCount).toBe(2);
    expect(read.actionState.used).toBe(1);
    expect(read.actionState.aiResearchBonusUsed).toBe(false);
    expect(read.player.san).toBe(initial.player.san - 2);
  });

  it("runs Kimi automatic reading on purchase and renewal without consuming an action", () => {
    const initial = { ...admittedState(), year: 3, month: 1, totalMonths: 25 };
    let state = dispatchAction(initial, "buy-ai-month", { aiSlotId: "kimi" });

    expect(state.readingState.readCount).toBe(1);
    expect(state.actionState.used).toBe(0);
    expect(state.player.san).toBe(initial.player.san - 1);
    expect(state.log.some((entry) => entry.text.includes("Kimi K2 自动看论文 1 次"))).toBe(true);

    state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId: "kimi" });
    const readyToAdvance = {
      ...state,
      eventQueue: [],
      buffs: [...state.buffs, {
        id: "expiring-illness",
        name: "即将恢复",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        activeOperationSanMultiplier: 2,
      }],
    };
    const preview = previewNextMonthEffects(readyToAdvance);
    const renewed = dispatchAction(readyToAdvance, "next-month");
    expect(renewed.readingState.readCount).toBe(2);
    expect(renewed.actionState.used).toBe(0);
    expect(renewed.player).toEqual(preview.player);
    expect(preview.items).toContainEqual(expect.objectContaining({ id: "ai-automatic-reading", appliedStats: { san: -1 } }));
    expect(renewed.log.some((entry) => entry.text.includes("Kimi 自动阅读") && entry.text.includes("Kimi K2 自动看论文 1 次"))).toBe(true);
  });

  it("polishes every score on drafts and journal revisions when Claude is acquired", () => {
    const model = getAiModelTimeline().find((candidate) => candidate.id === "claude-fable-7")!;
    const papers = [
      {
        id: "draft",
        title: "草稿",
        topicId: "test",
        topicLabel: "测试方向",
        heatMultiplier: 1,
        prepublicationDecayRate: 0.1,
        idea: 2,
        experiment: 0,
        writing: 1,
        status: "draft" as const,
        target: null,
        reviewMonthsLeft: 0,
        submittedIdea: null,
        submittedExperiment: null,
        submittedWriting: null,
      },
      {
        id: "published",
        title: "已提交",
        topicId: "test",
        topicLabel: "测试方向",
        heatMultiplier: 1,
        prepublicationDecayRate: 0.1,
        idea: 2,
        experiment: 2,
        writing: 2,
        status: "published" as const,
        target: "C" as const,
        reviewMonthsLeft: 0,
        submittedIdea: 2,
        submittedExperiment: 2,
        submittedWriting: 2,
      },
      {
        id: "journal-revision",
        title: "期刊修改稿",
        topicId: "test",
        topicLabel: "测试方向",
        heatMultiplier: 1,
        prepublicationDecayRate: 0.1,
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "journal-reviewing" as const,
        target: null,
        journalTarget: "nmi" as const,
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
      },
    ];
    const result = polishUnsubmittedPapers(papers, model);
    expect(result.papers[0]).toMatchObject({ idea: 6, experiment: 4, writing: 5 });
    expect(result.papers[1]).toEqual(papers[1]);
    expect(result.papers[2]).toMatchObject({ idea: 4, experiment: 4, writing: 4 });
    expect(result.changedPaperCount).toBe(2);
    expect(result.changedScoreCount).toBe(6);
  });

  it("uses one AI research bonus only after every regular action point is spent", () => {
    const state = admittedState();
    const aiShopState = {
      ...state.aiShopState,
      subscriptions: Object.fromEntries(
        Object.entries(state.aiShopState.subscriptions).map(([slot, subscription]) => [
          slot,
          slot === "doubao" || slot === "gpt" || slot === "claude"
            ? { ...subscription, active: true, modelId: getAiModelForTotalMonths(1, slot as "gpt" | "claude" | "gemini" | "deepseek" | "doubao" | "kimi").id }
            : subscription,
        ]),
      ) as typeof state.aiShopState.subscriptions,
    };
    expect(hasAiCollaboration(aiShopState)).toBe(true);
    const regularAllowance = getActiveOperationAllowance({
      aiShopState,
      actionState: { used: 1, limit: 2, aiResearchBonusUsed: false },
    }, "writing");
    expect(regularAllowance).toMatchObject({ allowed: true, consumesAction: true, usesAiResearchBonus: false });

    const exhaustedActionState = { used: 2, limit: 2, aiResearchBonusUsed: false };
    const allowance = getActiveOperationAllowance({ aiShopState, actionState: exhaustedActionState }, "writing");
    expect(allowance).toMatchObject({ allowed: true, consumesAction: false, usesAiResearchBonus: true });
    const preview = previewResearchOperation({
      ...state,
      aiShopState,
      buffs: createAiBuffs(aiShopState),
      actionState: exhaustedActionState,
    }, "writing", 4);
    expect(preview).toMatchObject({ allowed: true, consumesAction: false, usesAiResearchBonus: true, sanCost: 7 });
    expect(applyResearchOperationActionState({
      ...state,
      aiShopState,
      actionState: exhaustedActionState,
    }, "writing")).toEqual({
      actionState: { used: 2, limit: 2, aiResearchBonusUsed: true },
    });

    expect(getActiveOperationAllowance({
      aiShopState,
      actionState: { ...exhaustedActionState, aiResearchBonusUsed: true },
    }, "writing")).toMatchObject({ allowed: false, consumesAction: false, usesAiResearchBonus: false });
  });

  it("requires GPT or Claude in a three-model AI collaboration", () => {
    const activateSlots = (slots: Array<"gpt" | "claude" | "gemini" | "deepseek" | "doubao" | "kimi">) => {
      const state = createAiShopState();
      for (const slot of slots) {
        state.subscriptions[slot] = {
          ...state.subscriptions[slot],
          active: true,
          modelId: getAiModelForTotalMonths(1, slot).id,
        };
      }
      return state;
    };

    expect(hasAiCollaboration(activateSlots(["gemini", "deepseek", "doubao"]))).toBe(false);
    expect(hasAiCollaboration(activateSlots(["kimi", "deepseek", "doubao"]))).toBe(false);
    expect(hasAiCollaboration(activateSlots(["gpt", "deepseek", "doubao"]))).toBe(true);
    expect(hasAiCollaboration(activateSlots(["claude", "gemini", "doubao"]))).toBe(true);
  });

  it.each(["read-paper", "part-time-work", "rest"] as const)(
    "unlocks the shared AI research bonus after %s exhausts regular actions",
    (firstAction) => {
      let state: ReturnType<typeof createInitialState> = admittedState();
      state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
      const activeSlots = new Set(["gpt", "claude", "doubao"]);
      const aiShopState = {
        ...state.aiShopState,
        subscriptions: Object.fromEntries(
          Object.entries(state.aiShopState.subscriptions).map(([slot, subscription]) => [
            slot,
            activeSlots.has(slot)
              ? {
                  ...subscription,
                  active: true,
                  modelId: getAiModelForTotalMonths(state.totalMonths, slot as keyof typeof state.aiShopState.subscriptions).id,
                }
              : subscription,
          ]),
        ) as typeof state.aiShopState.subscriptions,
      };
      state = {
        ...state,
        aiShopState,
        buffs: createAiBuffs(aiShopState),
        player: { ...state.player, san: 12 },
      };

      const exhausted = dispatchAction(state, firstAction);
      expect(exhausted.actionState).toMatchObject({ used: 1, limit: 1, aiResearchBonusUsed: false });
      expect(previewResearchOperation(exhausted, "idea", 2)).toMatchObject({
        allowed: true,
        consumesAction: false,
        usesAiResearchBonus: true,
      });

      const researched = dispatchAction(exhausted, "research-paper", {
        paperId: exhausted.papers[0]!.id,
        paperActionType: "idea",
      });
      expect(researched.actionState).toEqual({ used: 1, limit: 1, aiResearchBonusUsed: true });
      expect(previewResearchOperation(researched, "idea", 2).allowed).toBe(false);
    },
  );

  it("applies the current season to each research operation", () => {
    const state = admittedState();
    const spring = { ...state, month: 8, totalMonths: 8 };
    const summer = { ...state, month: 10, totalMonths: 10 };

    expect(previewResearchOperation(spring, "idea", 4).sanCost).toBe(3);
    expect(previewResearchOperation(summer, "experiment", 4).sanCost).toBe(5);
    expect(previewResearchOperation({
      ...summer,
      eventSupport: { ...summer.eventSupport, hasParasol: true },
    }, "writing", 4).sanCost).toBe(4);
  });

  it("applies equipment after illness multipliers in research previews", () => {
    const state = admittedState();
    const preview = previewResearchOperation({
      ...state,
      month: 8,
      shopState: { ...state.shopState, keyboardOwned: true },
      buffs: [{
        id: "flu",
        name: "流感",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: null,
        activeOperationSanMultiplier: 2,
      }],
    }, "writing", 4);

    expect(preview).toMatchObject({ sanCost: 6, scoreBonus: 0 });
  });

  it("closes automatic renewal without charging when a model generation updates", () => {
    const aiShopState = createAiShopState();
    aiShopState.subscriptions.gpt = {
      ...aiShopState.subscriptions.gpt,
      enabled: true,
      active: true,
      modelId: "gpt-3.5",
      lastRenewalTotalMonths: 12,
    };

    const renewal = renewAiSubscriptionSlot(aiShopState, 13, 10, "gpt");
    expect(renewal.money).toBe(10);
    expect(renewal.items).toEqual([expect.objectContaining({
      slot: "gpt",
      paid: false,
      price: 2,
      reason: "model-updated",
    })]);
    expect(renewal.state.subscriptions.gpt).toMatchObject({
      enabled: false,
      active: false,
      paused: false,
      modelId: "gpt-4o",
      lastRenewalTotalMonths: 13,
    });
  });

  it("records the model update and closed renewal during actual month advancement", () => {
    const initial = admittedState();
    const state = {
      ...initial,
      year: 1,
      month: 12,
      totalMonths: 12,
      eventQueue: [],
      player: { ...initial.player, money: 10 },
      aiShopState: {
        subscriptions: {
          ...initial.aiShopState.subscriptions,
          gpt: {
            ...initial.aiShopState.subscriptions.gpt,
            enabled: true,
            active: true,
            modelId: "gpt-3.5",
            lastRenewalTotalMonths: 12,
          },
        },
      },
    };

    const preview = previewNextMonthEffects(state);
    const advanced = dispatchAction(state, "next-month");
    expect(preview.items.find((item) => item.id === "ai-renewal-gpt")).toMatchObject({
      appliedStats: { money: 0 },
      note: "模型已更新，自动续费已关闭",
    });
    expect(advanced.aiShopState.subscriptions.gpt.enabled).toBe(false);
    expect(advanced.log[0]?.text).toContain("GPT-4o续费 金币 +0");
    expect(advanced.log[0]?.text).toContain("模型已更新，自动续费已关闭");
  });
});
