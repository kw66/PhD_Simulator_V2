import { recordAchievementStats } from "./v2-achievement-runtime-types";
import { formatMoney, recordPersonalSpending, roundMoney } from "./v2-money";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { formatAttributeDetail, roundAttribute } from "./v2-attribute-format";
import { usesGameplayRulesFrom } from "./v2-rule-context";
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
  const precise = usesGameplayRulesFrom("20261021-r13") ? roundAttribute : (value: number) => value;
  const amount = Number.isFinite(cost) ? precise(Math.max(0, cost)) : 0;
  const ordinary = { allowed: true, sanCost: amount, moneyCost: 0, sanCapCost: 0, usesBeta: false };
  if (amount === 0) return ordinary;
  const moneyCost = usesGameplayRulesFrom("20261021-r13") ? roundMoney(amount) : amount;
  if (getRoleTalentLevel(state, "gold-power-alpha") > 0 && state.player.money >= 50 && state.player.money >= moneyCost) {
    return { ...ordinary, sanCost: 0, moneyCost };
  }
  if (precise(state.player.san) >= amount) return ordinary;
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
  const precise = usesGameplayRulesFrom("20261021-r13") ? roundAttribute : (value: number) => value;
  const sanCap = precise(state.sanCap - quote.sanCapCost);
  const san = precise(state.player.san - quote.sanCost);
  return recordAchievementStats(recordPersonalSpending({
    ...state,
    sanCap,
    player: { ...state.player, san: quote.sanCapCost > 0 ? Math.min(sanCap, san) : san,
      money: roundMoney(state.player.money - quote.moneyCost) },
    ...(quote.usesBeta ? { roleTalents: { ...state.roleTalents!, betaUsedMonth: state.totalMonths } } : {}),
  }, quote.moneyCost));
}

export function formatSanPayment(quote: SanPaymentQuote): string {
  if (!usesGameplayRulesFrom("20261021-r13")) {
    return [quote.sanCost > 0 ? `SAN -${quote.sanCost}` : "", quote.moneyCost > 0 ? `金币 -${quote.moneyCost}（金之力α）` : "",
      quote.sanCapCost > 0 ? `SAN上限 -${quote.sanCapCost}（燃烧生命β）` : ""].filter(Boolean).join("，") || "SAN -0";
  }
  return [quote.sanCost > 0 ? `SAN -${formatAttributeDetail(quote.sanCost)}` : "", quote.moneyCost > 0 ? `金币 -${formatMoney(quote.moneyCost)}（金之力α）` : "",
    quote.sanCapCost > 0 ? `SAN上限 -${formatAttributeDetail(quote.sanCapCost)}（燃烧生命β）` : ""].filter(Boolean).join("，") || "SAN -0";
}

/** Short labels for action buttons; talent explanations belong in their tooltip. */
export function formatCompactSanPayment(quote: SanPaymentQuote, alphaCapCost = 0): string {
  const capCost = quote.sanCapCost + alphaCapCost;
  return [quote.sanCost > 0 ? `SAN-${formatAttributeDetail(quote.sanCost)}` : "", quote.moneyCost > 0 ? `金币-${formatMoney(quote.moneyCost)}` : "",
    capCost > 0 ? `SAN上限-${formatAttributeDetail(capCost)}` : ""].filter(Boolean).join(" · ") || "SAN-0";
}
