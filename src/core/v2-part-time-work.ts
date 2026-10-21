import { recordPersonalIncome } from "./v2-money";
import { getActiveOperationSanCostForState } from "./v2-buffs";
import { pushLog } from "./v2-engine-helpers";
import type { GameState } from "./v2-types";
import { consumeActiveOperation, getActiveOperationAllowance } from "./v2-ai-shop";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";

import { getPartTimeGrowthInterval, getPartTimeGrowthReward } from "./v2-growth-system";
import { usesGameplayRulesFrom } from "./v2-rule-context";
const BASE_SAN_COST = 5;
const BASE_MONEY_REWARD = 2;

export interface PartTimeWorkPreview {
  allowed: boolean;
  blockedReason: "none" | "action-limit" | "insufficient-san";
  nextCount: number;
  tier: number;
  sanCost: number;
  moneyReward: number;
  nextTierAt: number;
}

export function previewPartTimeWork(state: GameState): PartTimeWorkPreview {
  const nextCount = Math.max(0, Math.floor(state.partTimeWorkCount)) + 1;
  const interval = getPartTimeGrowthInterval();
  const tier = Math.floor((nextCount - 1) / interval);
  const sanCost = getActiveOperationSanCostForState(state, BASE_SAN_COST + (usesGameplayRulesFrom("20261022-r15") ? 0 : tier), "work");
  const moneyReward = BASE_MONEY_REWARD + tier * getPartTimeGrowthReward();
  const blockedReason = !getActiveOperationAllowance(state, "work").allowed
    ? "action-limit"
    : !quoteSanPayment(consumeActiveOperation(state, "work"), sanCost).allowed
      ? "insufficient-san"
      : "none";

  return {
    allowed: blockedReason === "none",
    blockedReason,
    nextCount,
    tier,
    sanCost,
    moneyReward,
    nextTierAt: (tier + 1) * interval + 1,
  };
}

export function applyPartTimeWork(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const preview = previewPartTimeWork(state);
  if (!preview.allowed) return state;

  const prepared = consumeActiveOperation(state, "work");
  const payment = quoteSanPayment(prepared, preview.sanCost);
  const paid = paySanCost(prepared, preview.sanCost);
  return pushLog(recordPersonalIncome({
    ...paid,
    partTimeWorkCount: preview.nextCount,
    player: {
      ...paid.player,
      money: paid.player.money + preview.moneyReward,
    },
  }, preview.moneyReward), `打工：第 ${preview.nextCount} 次兼职，${formatSanPayment(payment)}｜金币 +${preview.moneyReward}`);
}
