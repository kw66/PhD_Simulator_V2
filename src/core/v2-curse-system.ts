import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { recordPersonalSpending, roundMoney } from "./v2-money";
import { applyPlayerAttributeChange } from "./v2-player-attributes";
import { DISEASE_MONTH_END_CHANGE_BY_SAN_TIER } from "./v2-sanity-rules";
import { getUnlockedPaperSlotCount } from "./v2-paper-rules";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { GameState, RoleId } from "./v2-types";

export type CurseDifficulty = 1 | 2 | 3 | 4;
export interface CurseRunState {
  difficulty: CurseDifficulty;
  debt: number;
  /** Idempotent monthly settlement, included in snapshots and replay. */
  lastSettledTotalMonths: number;
}

export const CURSED_ROLE_IDS: readonly RoleId[] = ["cursed-frail", "special-fading-genius", "special-finite-life", "cursed-debt"];
export function isCursedRole(roleId: RoleId): boolean { return CURSED_ROLE_IDS.includes(roleId); }
export function normalizeCurseDifficulty(value: unknown): CurseDifficulty {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4 ? value as CurseDifficulty : 1;
}

export function initializeCurse(state: GameState, difficulty: unknown = 1): GameState {
  if (!isCursedRole(state.selectedRoleId)) return state;
  const rank = normalizeCurseDifficulty(difficulty);
  const relaxed = usesGameplayRulesFrom("20261025-r55");
  const curseState: CurseRunState = { difficulty: rank, debt: state.selectedRoleId === "cursed-debt"
    ? (relaxed ? [50, 70, 90, 110] : [60, 80, 100, 120])[rank - 1]! : 0, lastSettledTotalMonths: 1 };
  const rebalanced = usesGameplayRulesFrom("20261017-r6");
  let next = { ...state, curseState };
  if (state.selectedRoleId === "special-fading-genius") next = { ...next, player: { ...state.player,
    research: (relaxed ? [20, 18, 16, 14] : rebalanced ? [18, 16, 14, 12] : [20, 17, 14, 11])[rank - 1]! } };
  if (state.selectedRoleId === "special-finite-life") {
    const san = (relaxed ? [300, 200, 150, 100] : rebalanced ? [300, 200, 120, 80] : [400, 300, 200, 100])[rank - 1]!;
    next = { ...next, sanCap: san, player: { ...state.player, san } };
  }
  return { ...next, paperSlotsUnlocked: Math.max(next.paperSlotsUnlocked, getUnlockedPaperSlotCount(next.player.research)) };
}

/** These are probability percentage points, replacing the ordinary increments. */
export function getMonthEndIllnessDelta(state: GameState): number {
  if (state.totalMonths <= 0) return 0;
  const tier = state.player.san < 6 ? 0 : state.player.san < 12 ? 1 : state.player.san < 18 ? 2 : 3;
  if (state.selectedRoleId !== "cursed-frail") return DISEASE_MONTH_END_CHANGE_BY_SAN_TIER[tier];
  const difficulty = state.curseState?.difficulty ?? 1;
  if (tier === 3 && usesGameplayRulesFrom("20261025-r55")) return difficulty - 2;
  return [9, 6, 3, usesGameplayRulesFrom("20261017-r6") ? 1 : 0][tier]! * difficulty;
}

/** The first September is not charged; October settles the first completed month. */
export function settleCurseMonthStart(state: GameState, writeLog = true): GameState {
  const curse = state.curseState;
  if (!curse || state.totalMonths <= 1 || curse.lastSettledTotalMonths >= state.totalMonths) return state;
  let next = { ...state, curseState: { ...curse, lastSettledTotalMonths: state.totalMonths } };
  if (state.selectedRoleId === "special-fading-genius") {
    next = applyPlayerAttributeChange(next, "research", usesGameplayRulesFrom("20261017-r6") ? -0.5 : -1).state as typeof next;
    if (writeLog) next = pushLog(next, `天才迟暮：科研 ${state.player.research}→${next.player.research}。`) as typeof next;
  }
  if (state.selectedRoleId === "cursed-debt" && curse.debt > 0) {
    // Do not round interest to whole coins or cents: debt is distinct from money.
    const debt = Number((curse.debt * 1.02).toFixed(10));
    next = { ...next, curseState: { ...next.curseState, debt } };
    if (writeLog) next = pushLog(next, `债务利息：${curse.debt}→${debt}金币。`) as typeof next;
  }
  return next;
}

/** Cash uses cents; even the smallest positive interest remainder needs one cent. */
export function getCurseDebtPayoffAmount(debt: number): number {
  if (!(debt > 0)) return 0;
  const [whole, fraction = ""] = debt.toFixed(10).split(".");
  const cents = Number(whole) * 100 + Number(fraction.slice(0, 2)) + (/[1-9]/.test(fraction.slice(2)) ? 1 : 0);
  return Math.max(0.01, cents / 100);
}

/** Missing amount means repay as much as available. This does not use an action. */
export function repayCurseDebt(state: GameState, amount?: number): GameState {
  if (state.phase !== "playing" || state.selectedRoleId !== "cursed-debt" || !state.curseState) return state;
  const debt = state.curseState.debt;
  if (!(debt > 0)) return pushNoOpLog(state, "债务已结清。");
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return state;
  const available = Math.max(0, roundMoney(state.player.money));
  const requested = amount === undefined ? available : Math.min(available, roundMoney(amount));
  if (!(requested > 0)) return pushNoOpLog(state, "金币不足，暂时无法还款。");
  const principal = Math.min(debt, requested);
  const payment = Math.min(requested, usesGameplayRulesFrom("20261022-r17")
    ? getCurseDebtPayoffAmount(principal)
    : Math.ceil(Number(principal.toFixed(10)) * 100 - 1e-8) / 100);
  const remaining = Number(Math.max(0, debt - payment).toFixed(10));
  return pushLog(recordPersonalSpending({ ...state,
    curseState: { ...state.curseState, debt: remaining },
    player: { ...state.player, money: roundMoney(state.player.money - payment) },
  }, payment), `偿还债务${payment}金币${remaining > 0 ? `，剩余${remaining}金币` : "，债务已结清"}。`);
}

export function hasUnpaidCurseDebt(state: GameState): boolean {
  return state.selectedRoleId === "cursed-debt" && (state.curseState?.debt ?? 0) > 0;
}
