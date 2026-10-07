import { getActiveBuffs } from "./v2-buffs";
import type { Buff, GameState } from "./v2-types";

export const RESEARCH_EXPERIMENT_MONEY_COST = 3;

export function createLabGpuFailureBuff(): Buff {
  return {
    id: "lab-gpu-failure",
    name: "算力短缺",
    source: "显卡故障",
    timing: "monthly",
    remainingMonths: 6,
    labExperimentMoneyDelta: 1,
    description: "你和同学每次做实验费用+1，由实验室经费支付。",
  };
}

export function getLabExperimentMoneyCost(state: Pick<GameState, "buffs">): number {
  const delta = getActiveBuffs(state.buffs).reduce((sum, buff) => sum
    + (Number.isFinite(buff.labExperimentMoneyDelta) ? buff.labExperimentMoneyDelta ?? 0 : 0), 0);
  return Math.max(0, RESEARCH_EXPERIMENT_MONEY_COST + delta);
}
