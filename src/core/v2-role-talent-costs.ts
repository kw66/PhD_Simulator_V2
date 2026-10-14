import { recordPersonalSpending, roundMoney } from "./v2-money";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import type { GameState } from "./v2-types";

export interface SanPaymentOptions {
  allowOverdraw?: boolean;
  /** Month-start drains are not an action and cannot consume burning life beta. */
  allowBeta?: boolean;
}

export interface SanPaymentQuote {
  allowed: boolean;
  sanCost: number;
  moneyCost: number;
  sanCapCost: number;
  usesBeta: boolean;
}

/** The supplied cost already includes equipment, illness and all other modifiers. */
export function quoteSanPayment(state: GameState, cost: number, options: SanPaymentOptions = {}): SanPaymentQuote {
  const amount = Number.isFinite(cost) ? Math.max(0, cost) : 0;
  const ordinary = { allowed: true, sanCost: amount, moneyCost: 0, sanCapCost: 0, usesBeta: false };
  if (amount === 0) return ordinary;
  if (getRoleTalentLevel(state, "gold-power-alpha") > 0 && state.player.money >= 50 && state.player.money >= amount) {
    return { ...ordinary, sanCost: 0, moneyCost: amount };
  }
  if (state.player.san >= amount) return ordinary;
  if (options.allowBeta !== false && state.degree === "phd"
    && getRoleTalentLevel(state, "burning-life-beta") > 0
    && state.roleTalents?.betaUsedMonth !== state.totalMonths && state.sanCap >= 1) {
    return { ...ordinary, sanCost: 0, sanCapCost: 1, usesBeta: true };
  }
  return { ...ordinary, allowed: options.allowOverdraw === true };
}

/** Failed payments leave the state untouched; callers validate other costs before paying. */
export function paySanCost(state: GameState, cost: number, options: SanPaymentOptions = {}): GameState {
  const quote = quoteSanPayment(state, cost, options);
  if (!quote.allowed || (quote.sanCost === 0 && quote.moneyCost === 0 && quote.sanCapCost === 0)) return state;
  const sanCap = state.sanCap - quote.sanCapCost;
  return recordPersonalSpending({
    ...state,
    sanCap,
    player: { ...state.player, san: quote.sanCapCost > 0 ? Math.min(sanCap, state.player.san - quote.sanCost) : state.player.san - quote.sanCost,
      money: roundMoney(state.player.money - quote.moneyCost) },
    ...(quote.usesBeta ? { roleTalents: { ...state.roleTalents!, betaUsedMonth: state.totalMonths } } : {}),
  }, quote.moneyCost);
}

export function formatSanPayment(quote: SanPaymentQuote): string {
  return [quote.sanCost > 0 ? `SAN -${quote.sanCost}` : "", quote.moneyCost > 0 ? `金币 -${quote.moneyCost}（金之力α）` : "",
    quote.sanCapCost > 0 ? `SAN上限 -${quote.sanCapCost}（燃烧生命β）` : ""].filter(Boolean).join("，") || "SAN -0";
}

/** Short labels for action buttons; talent explanations belong in their tooltip. */
export function formatCompactSanPayment(quote: SanPaymentQuote, alphaCapCost = 0): string {
  const capCost = quote.sanCapCost + alphaCapCost;
  return [quote.sanCost > 0 ? `SAN-${quote.sanCost}` : "", quote.moneyCost > 0 ? `金币-${quote.moneyCost}` : "",
    capCost > 0 ? `SAN上限-${capCost}` : ""].filter(Boolean).join(" · ") || "SAN-0";
}
