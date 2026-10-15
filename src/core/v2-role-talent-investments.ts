import { recordPersonalIncome } from "./v2-money";
import { formatMoney, roundMoney } from "./v2-money";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import type { GameState } from "./v2-types";

export function getRoleTalentInvestmentLevel(state: GameState): number {
  return state.selectedRoleId === "rich" ? getRoleTalentLevel(state, "investment-savvy")
    : state.selectedRoleId === "rich-reversed" ? getRoleTalentLevel(state, "finance-master") : 0;
}

export function getRoleTalentInvestmentDuration(state: GameState): number {
  return 12 - (state.selectedRoleId === "rich-reversed" ? Math.min(6, getRoleTalentLevel(state, "investment-acceleration")) : 0);
}

export function investRoleTalentMoney(state: GameState): { state: GameState; success: boolean; message: string } {
  const level = getRoleTalentInvestmentLevel(state);
  if (state.phase !== "playing" || level === 0) return { state, success: false, message: "尚未解锁理财能手" };
  if (state.player.money < 5) return { state, success: false, message: "投资需要5金币" };
  const id = state.roleTalents?.nextInvestmentId ?? 1;
  const duration = getRoleTalentInvestmentDuration(state);
  return {
    state: {
      ...state,
      player: { ...state.player, money: roundMoney(state.player.money - 5) },
      roleTalents: {
        ...state.roleTalents!, nextInvestmentId: id + 1,
        investments: [...(state.roleTalents?.investments ?? []), {
          id, investedAt: state.totalMonths, dueAt: state.totalMonths + duration, principal: 5, interest: level,
        }],
      },
    },
    success: true,
    message: `投资5金币，${duration}个月后收回本金并获得${formatMoney(level)}金币利息`,
  };
}

export function settleRoleTalentInvestments(state: GameState): { state: GameState; principal: number; interest: number; count: number } {
  const investments = state.roleTalents?.investments ?? [];
  const due = investments.filter((investment) => investment.dueAt <= state.totalMonths);
  const principal = roundMoney(due.reduce((sum, investment) => sum + investment.principal, 0));
  const interest = roundMoney(due.reduce((sum, investment) => sum + investment.interest, 0));
  return {
    state: due.length === 0 ? state : recordPersonalIncome({
      ...state,
      player: { ...state.player, money: roundMoney(state.player.money + principal + interest) },
      roleTalents: { ...state.roleTalents!, investments: investments.filter((investment) => investment.dueAt > state.totalMonths) },
    }, interest),
    principal, interest, count: due.length,
  };
}
