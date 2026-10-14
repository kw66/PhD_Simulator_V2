import { describe, expect, it } from "vitest";
import { MONTHLY_LIVING_COST } from "../src/core/v2-content";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { enqueueEventQueueItem } from "../src/core/v2-event-queue";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import { getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation, getResearchExperimentCostBreakdown } from "../src/core/v2-research-operation";

function fundedState() {
  const state = createStartedGameState("normal");
  return { ...state, totalMonths: 2, year: 1, month: 2, selectedAdvisorName: "王老师",
    player: { ...state.player, money: 100 } };
}

describe("personal spending history", () => {
  it("keeps gross shop spending after a sale and counts event costs without counting income", () => {
    const initial = fundedState();
    const bought = dispatchAction(initial, "buy-coffee-machine");
    const purchase = initial.player.money - bought.player.money;
    expect(purchase).toBeGreaterThan(0);
    expect(bought.personalSpending).toBe(purchase);

    const sold = dispatchAction(bought, "sell-coffee-machine");
    expect(sold.player.money).toBeGreaterThan(bought.player.money);
    expect(sold.personalSpending).toBe(purchase);

    const event = enqueueEventQueueItem(sold, {
      id: "expense-test", title: "费用测试", description: "支付个人费用", source: "fixed",
      blocking: true, deadlineMonths: 0, chainId: "expense-test", stage: "result",
      choices: [{ id: "pay", label: "支付", outcome: "金币 -3", effects: { money: -3 } }],
    });
    const paid = dispatchAction(event, "resolve-event", { eventId: "expense-test", eventChoiceId: "pay" });
    expect(paid.personalSpending).toBe(purchase + 3);
  });

  it("counts living costs even when the same month also pays a salary", () => {
    const initial = fundedState();
    const settled = applyMonthlyEffects(initial);
    expect(settled.resolution.items.some((item) => item.id === "advisor-salary" && (item.appliedStats.money ?? 0) > 0)).toBe(true);
    expect(settled.nextState.personalSpending).toBe(MONTHLY_LIVING_COST);
  });

  it("includes paid AI renewals and player-funded experiments", () => {
    const initial = fundedState();
    const modelPrice = getAiModelForTotalMonths(initial.totalMonths, "gpt").price;
    const purchased = dispatchAction(initial, "buy-ai-month", { aiSlotId: "gpt" });
    expect(purchased.personalSpending).toBe(modelPrice);
    const enabled = dispatchAction(purchased, "toggle-ai-subscription", { aiSlotId: "gpt" });
    const renewed = applyMonthlyEffects({ ...enabled, totalMonths: 3, month: 3 });
    expect(renewed.nextState.personalSpending).toBe(modelPrice * 2 + MONTHLY_LIVING_COST);

    const paper = { ...createDraftPaper(2, 0, () => 0), idea: 5 };
    const researching = { ...initial, papers: [paper], advisorProgressState: { ...initial.advisorProgressState, funding: 0 } };
    const playerCost = getResearchExperimentCostBreakdown(researching).playerMoney;
    expect(playerCost).toBeGreaterThan(0);
    const researched = applyResearchOperation(researching, paper.id, "experiment", () => 0);
    expect(researched.personalSpending).toBe(playerCost);
  });
});
