import type { GameState } from "./v2-types";
import { getRoleTalentLevel } from "./v2-role-talent-state";

export function roundMoney(amount: number): number {
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
