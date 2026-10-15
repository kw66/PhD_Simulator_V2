import { recordPersonalIncome } from "./v2-money";
import { recordAchievementSanCapGain } from "./v2-achievement-runtime-types";
import { applyPlayerAttributeChange } from "./v2-player-attributes";
import { consumeActiveOperation, getActiveOperationAllowance } from "./v2-ai-shop";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";
import { getReadPaperSanCost } from "./v2-reading-system";
import { recordPersonalSpending, roundMoney } from "./v2-money";
import type { EventChoice, GameState } from "./v2-types";

/** Keep result copy consistent with resource replacement without changing the original request. */
export function formatEventSanPaymentText(text: string, state: GameState, effects: EventChoice["effects"]): string {
  const cost = Math.max(0, -(effects.san ?? 0))
    + (effects.readPaperActions ? getReadPaperSanCost(state).sanCost * effects.readPaperActions : 0);
  if (cost <= 0) return text;
  let quotedState = state;
  if (effects.restAction && getActiveOperationAllowance(state, "rest").allowed) quotedState = consumeActiveOperation(state, "rest");
  quotedState = { ...quotedState, player: { ...quotedState.player, money: roundMoney(quotedState.player.money + roundMoney(effects.money ?? 0)) } };
  const quote = quoteSanPayment(quotedState, cost, { allowOverdraw: true });
  if (!quote.usesBeta && quote.moneyCost <= 0) return text;
  const payment = formatSanPayment(quote);
  return text.replace(/SAN\s*-\s*\d+(?:\.\d+)?(?:（[^）]*）)?/gu, () => payment);
}

/** Pure shared settlement for event previews, confirmations and fixed-event mutations. */
export function applyEventPlayerEffects(state: GameState, effects: EventChoice["effects"]): GameState {
  if (effects.restAction && getActiveOperationAllowance(state, "rest").allowed) {
    state = consumeActiveOperation(state, "rest");
  }
  const sanCap = Math.max(0, state.sanCap + (effects.sanCapDelta ?? 0));
  const researchCapacityState = { ...state.researchCapacityState };
  for (const [key, delta] of Object.entries(effects.researchCapacityStateDeltas ?? {})) {
    researchCapacityState[key as keyof typeof researchCapacityState] += delta ?? 0;
  }
  let next: GameState = {
    ...state, sanCap, researchCapacityState,
    player: { ...state.player, san: (effects.sanCapDelta ?? 0) < 0 ? Math.min(sanCap, state.player.san) : state.player.san,
      money: roundMoney(state.player.money + roundMoney(effects.money ?? 0)) },
  };
  next = recordAchievementSanCapGain(next, sanCap - state.sanCap);
  next = recordPersonalIncome(next, effects.money ?? 0);
  next = recordPersonalSpending(next, Math.max(0, -(effects.money ?? 0)));
  if ((effects.san ?? 0) < 0) next = paySanCost(next, -effects.san!, { allowOverdraw: true });
  else if ((effects.san ?? 0) > 0) next = { ...next, player: { ...next.player,
    san: Math.max(next.player.san, Math.min(next.sanCap, next.player.san + effects.san!)) } };
  if (effects.restoreSanToCap) next = { ...next, player: { ...next.player, san: next.sanCap } };
  for (const stat of ["research", "social", "favor"] as const) {
    const rawKey = { research: "rawResearch", social: "rawSocial", favor: "rawFavor" }[stat] as "rawResearch" | "rawSocial" | "rawFavor";
    const raw = effects[rawKey] ?? effects[stat];
    if (raw !== undefined && raw !== 0) next = applyPlayerAttributeChange(next, stat, raw).state;
  }
  return next;
}
