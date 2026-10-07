import { roundMoney } from "./v2-money";
import type { FellowFinanceAccount, GameState } from "./v2-types";

export function getFellowFinanceAccount(state: GameState, fellowId: string): FellowFinanceAccount {
  return state.fellowFinanceAccounts?.[fellowId] ?? {
    name: state.fellowProgressState.find((profile) => profile.id === fellowId)?.name
      ?? state.fellowPapers?.find((paper) => paper.leadAuthorId === fellowId)?.leadAuthorName ?? "同学",
    money: 0,
  };
}

export function ensureFellowFinanceAccounts(state: GameState): GameState {
  const missing = state.fellowProgressState.filter((profile) => !state.fellowFinanceAccounts?.[profile.id]);
  if (!missing.length) return state;
  const accounts = { ...state.fellowFinanceAccounts };
  for (const profile of missing) accounts[profile.id] = getFellowFinanceAccount(state, profile.id);
  return { ...state, fellowFinanceAccounts: accounts };
}

export function creditFellowMoney(state: GameState, fellowId: string, amount: number): GameState {
  const account = getFellowFinanceAccount(state, fellowId);
  return { ...state, fellowFinanceAccounts: { ...state.fellowFinanceAccounts,
    [fellowId]: { ...account, money: roundMoney(account.money + amount) },
  } };
}

export function payFellowResearchCost(state: GameState, fellowId: string, amount: number) {
  const cost = Math.max(0, roundMoney(amount));
  const account = getFellowFinanceAccount(state, fellowId);
  const availableFunding = Math.max(0, state.advisorProgressState.funding);
  if (roundMoney(availableFunding + account.money) < cost) {
    return { state, paid: false, labCost: 0, personalCost: 0 };
  }
  const labCost = Math.min(availableFunding, cost);
  const personalCost = Math.min(account.money, roundMoney(cost - labCost));
  const nextState = creditFellowMoney(state, fellowId, -personalCost);
  return { state: { ...nextState, advisorProgressState: { ...nextState.advisorProgressState,
    funding: roundMoney(state.advisorProgressState.funding - labCost),
  } }, paid: true, labCost, personalCost };
}
