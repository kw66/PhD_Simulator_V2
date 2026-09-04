import { getActiveOperationSanCostForState } from "./v2-buffs";
import { pushLog } from "./v2-engine-helpers";
import type { GameState } from "./v2-types";

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
  const blockedReason = state.actionState.used >= state.actionState.limit
    ? "action-limit"
    : state.player.san < sanCost
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

  return pushLog({
    ...state,
    partTimeWorkCount: preview.nextCount,
    actionState: { ...state.actionState, used: state.actionState.used + 1 },
    player: {
      ...state.player,
      san: state.player.san - preview.sanCost,
      money: state.player.money + preview.moneyReward,
    },
  }, `打工：第 ${preview.nextCount} 次兼职，SAN -${preview.sanCost}｜金币 +${preview.moneyReward}`);
}
