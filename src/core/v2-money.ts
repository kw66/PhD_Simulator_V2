import { recordAchievementCounter, recordAchievementFact, recordAchievementStats } from "./v2-achievement-runtime-types";
import type { GameState } from "./v2-types";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { usesGameplayRulesFrom } from "./v2-rule-context";

export function roundMoney(amount: number): number {
  // At this magnitude doubles cannot represent cents; shifting the exponent
  // would overflow even though the original amount is still finite.
  if (usesGameplayRulesFrom("20261023-r46") && Math.abs(amount) >= 1e21) return Math.sign(amount) * Math.min(Math.abs(amount), Number.MAX_VALUE);
  const [coefficient, exponent = "0"] = Math.abs(amount).toString().split("e");
  const rounded = Math.round(Number(`${coefficient}e${Number(exponent) + 2}`)) / 100;
  return rounded === 0 ? 0 : Math.sign(amount) * rounded;
}

export function formatMoney(amount: number): string {
  return String(roundMoney(amount));
}

export function recordPersonalSpending(state: GameState, amount: number): GameState {
  const spent = roundMoney(amount);
  if (!(spent > 0)) return state;
  let next: GameState = { ...state, personalSpending: roundMoney((state.personalSpending ?? 0) + spent) };
  if (state.selectedRoleId !== "rich-reversed" || !state.roleTalents) return next;
  if (usesGameplayRulesFrom("20261023-r45")) {
    return { ...next, roleTalents: { ...state.roleTalents,
      greedQualifiedSpending: roundMoney((state.roleTalents.greedQualifiedSpending ?? 0) + spent),
      ...(state.degree === "phd" && getRoleTalentLevel(state, "post-phd-money-conversion") > 0 ? {
        pendingMoneyConversionTransactions: [...(state.roleTalents.pendingMoneyConversionTransactions ?? []), spent],
      } : {}),
    } };
  }
  const conversions = state.degree === "phd" && getRoleTalentLevel(state, "post-phd-money-conversion") > 0
    ? roundMoney((state.roleTalents.moneyConversionRemainder ?? 0) + spent) : 0;
  const count = Math.floor(conversions);
  next = { ...next, roleTalents: { ...state.roleTalents,
    greedQualifiedSpending: roundMoney((state.roleTalents.greedQualifiedSpending ?? 0) + spent),
    ...(conversions > 0 ? {
      moneyConversionRemainder: roundMoney(conversions - count),
      pendingMoneyConversions: (state.roleTalents.pendingMoneyConversions ?? 0) + count,
    } : {}),
  } };
  return next;
}

export function normalizeGameMoney(state: GameState): GameState {
  const money = roundMoney(state.player.money);
  const funding = roundMoney(state.advisorProgressState.funding);
  let fellowFinanceAccounts = state.fellowFinanceAccounts;
  for (const [id, account] of Object.entries(state.fellowFinanceAccounts ?? {})) {
    const balance = roundMoney(account.money);
    if (balance === account.money) continue;
    fellowFinanceAccounts = { ...fellowFinanceAccounts, [id]: { ...account, money: balance } };
  }
  if (money === state.player.money && funding === state.advisorProgressState.funding
    && fellowFinanceAccounts === state.fellowFinanceAccounts) return state;
  return {
    ...state,
    player: money === state.player.money ? state.player : { ...state.player, money },
    advisorProgressState: funding === state.advisorProgressState.funding ? state.advisorProgressState
      : { ...state.advisorProgressState, funding },
    ...(fellowFinanceAccounts !== state.fellowFinanceAccounts ? { fellowFinanceAccounts } : {}),
  };
}

/** Record an actual income at its source; balances, resets and returned principal are not earnings. */
export function recordPersonalIncome(state: GameState, amount: number): GameState {
  if (!Number.isFinite(amount) || amount <= 0) return state;
  const key = `income:${state.totalMonths}`;
  let next = recordAchievementCounter(state, key, roundMoney(amount));
  if (!next.achievementProgress) return next;
  const run = next.achievementProgress;
  next = { ...next, achievementProgress: { ...run, counters: { ...run.counters, [key]: roundMoney(run.counters[key] ?? 0) } } };
  if ((next.achievementProgress!.counters[key] ?? 0) >= 100) next = recordAchievementFact(next, "global:windfall");
  return recordAchievementStats(next);
}
