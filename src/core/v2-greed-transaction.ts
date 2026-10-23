import { recordAchievementStats } from "./v2-achievement-runtime-types";
import { getTierResistChance } from "./v2-sanity-rules";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { GameState } from "./v2-types";

const precise = (value: number) => Number(value.toFixed(10));
const addFinite = (left: number, right: number) => precise(usesGameplayRulesFrom("20261023-r46") ? Math.min(Number.MAX_VALUE, left + right) : left + right);
const STATS = ["research", "social", "favor"] as const;

/** The same +1 steps as ordinary growth, skipping whole constant-resistance tiers. */
export function growGreedAttribute(current: number, amount: number, cap: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return current;
  let whole = Math.floor(amount);
  const fraction = precise(amount - whole);
  let value = current;
  while (whole > 0 && value < cap) {
    const retained = 1 - getTierResistChance(value);
    const boundary = value < 6 ? 6 : value < 12 ? 12 : value < 18 ? 18 : Infinity;
    const steps = Math.min(whole, Math.max(1, Math.ceil(precise((boundary - value) / retained))));
    value = precise(Math.min(cap, value + steps * retained));
    whole -= steps;
  }
  if (fraction > 0 && value < cap) value = precise(Math.min(cap, value + fraction * (1 - getTierResistChance(value))));
  return value;
}

/** One purchase, seven random weights; amount is the raw reward budget. */
export function allocateGreedSpending(amount: number, roll: () => number): number[] {
  if (!Number.isFinite(amount) || amount <= 0) return Array<number>(7).fill(0);
  const weights = Array.from({ length: 7 }, () => {
    const value = roll();
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total === 0) weights.fill(1);
  const denominator = total || 7;
  const rewards = weights.map(weight => precise(amount * (weight / denominator)));
  const largest = weights.indexOf(Math.max(...weights));
  // Subtract the other shares, avoiding an overflowing intermediate sum.
  rewards[largest] = usesGameplayRulesFrom("20261023-r46") && amount >= 1e300
    ? precise(Math.max(0, rewards.reduce((rest, value, index) => index === largest ? rest : rest - value, amount)))
    : precise(rewards[largest]! + amount - rewards.reduce((sum, value) => sum + value, 0));
  return rewards;
}

export function applyGreedSpendingTransaction(state: GameState, amount: number, roll: () => number): GameState {
  const rewards = allocateGreedSpending(amount, roll);
  const before = recordAchievementStats(state);
  const talents = before.roleTalents!;
  // A single transaction grants its allocated caps and growth together.
  const capacity = { ...before.researchCapacityState,
    otherCapBonus: addFinite(before.researchCapacityState.otherCapBonus, rewards[4]!) };
  const caps = { ...talents.capBonuses,
    social: addFinite(talents.capBonuses?.social ?? 0, rewards[5]!),
    favor: addFinite(talents.capBonuses?.favor ?? 0, rewards[6]!) };
  const player = { ...before.player,
    san: Math.max(before.player.san, precise(Math.min(before.sanCap, before.player.san + rewards[0]!))) };
  const growth = { ...talents.growthTotals };
  for (const [index, stat] of STATS.entries()) {
    const rawCap = stat === "research" ? capacity.baseCap + capacity.jointTrainingCitationCapBonus + capacity.otherCapBonus : 20 + caps[stat];
    const cap = usesGameplayRulesFrom("20261023-r46") ? Math.min(Number.MAX_VALUE, rawCap) : rawCap;
    player[stat] = growGreedAttribute(player[stat], rewards[index + 1]!, Math.max(0, cap));
    growth[stat] = addFinite(growth[stat] ?? 0, Math.max(0, player[stat] - before.player[stat]));
  }
  return recordAchievementStats({ ...before, player, researchCapacityState: capacity,
    roleTalents: { ...talents, capBonuses: caps, growthTotals: growth } });
}
