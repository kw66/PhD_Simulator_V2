import { getActiveOperationSanCostForState } from "./v2-buffs";
import { pushLog } from "./v2-engine-helpers";
import type { GameState } from "./v2-types";
import { consumeActiveOperation, getActiveOperationAllowance } from "./v2-ai-shop";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";

const WORKS_PER_TIER = 8;
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
  const tier = Math.floor((nextCount - 1) / WORKS_PER_TIER);
  const sanCost = getActiveOperationSanCostForState(state, BASE_SAN_COST + tier, "work");
  const moneyReward = BASE_MONEY_REWARD + tier;
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
    nextTierAt: (tier + 1) * WORKS_PER_TIER + 1,
  };
}

export function applyPartTimeWork(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const preview = previewPartTimeWork(state);
  if (!preview.allowed) return state;

  const prepared = consumeActiveOperation(state, "work");
  const payment = quoteSanPayment(prepared, preview.sanCost);
  const paid = paySanCost(prepared, preview.sanCost);
  return pushLog({
    ...paid,
    partTimeWorkCount: preview.nextCount,
    player: {
      ...paid.player,
      money: paid.player.money + preview.moneyReward,
    },
  }, `打工：第 ${preview.nextCount} 次兼职，${formatSanPayment(payment)}｜金币 +${preview.moneyReward}`);
}
