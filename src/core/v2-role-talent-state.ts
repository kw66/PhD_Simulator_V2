import type { GameState } from "./v2-types";
import { usesGameplayRulesFrom } from "./v2-rule-context";

export type PlayerAttribute = "research" | "social" | "favor";
export type AttributeChangeSource = "ordinary" | "equalize" | "swap" | "reset";

export interface RoleTalentInvestment {
  id: number;
  investedAt: number;
  dueAt: number;
  principal: number;
  interest: number;
}

export interface RoleTalentRunState {
  /** Independent copy of the allocation made before this run. */
  levels: Record<string, number>;
  initialized?: boolean;
  advisorFundingGranted?: boolean;
  phdGranted?: boolean;
  /** Growth-only reduction fixed from published A papers at PhD transfer (0..0.6). */
  researchGrowthResistanceReduction?: number;
  capBonuses?: Partial<Record<PlayerAttribute, number>>;
  breakthroughCounts?: Partial<Record<PlayerAttribute, number>>;
  growthTotals?: Partial<Record<PlayerAttribute, number>>;
  lossTotals?: Partial<Record<PlayerAttribute, number>>;
  actionRemainder?: number;
  monthlyActionBonus?: number;
  alphaUsedMonth?: number;
  betaUsedMonth?: number;
  regularActionsSpent?: number;
  lastMonthlySettlement?: number;
  lastAnnualSettlement?: number;
  lastMonthEndSettlement?: number;
  socialStagnantMonths?: number;
  lastStagnationCurseMonth?: number;
  rejectedPaperRewardIds?: string[];
  rejectionRewardKeys?: string[];
  regularActionBudget?: number;
  lastSwapMonth?: number;
  lastCurseMonth?: number;
  negativeDiseaseMilestone?: number;
  negativeDiseaseSanMilestone?: number;
  boostedFellowIds?: string[];
  academicAtmosphereFellowIds?: string[];
  familyPatronageGrantedIds?: string[];
  investments?: RoleTalentInvestment[];
  nextInvestmentId?: number;
  /** Opt-in payment with personal coins instead of SAN. */
  goldPowerEnabled?: boolean;
  researchCurseBroken?: boolean;
  socialChangedMonth?: number;
  socialGainRemainder?: number;
  socialLossRemainder?: number;
  favorResetCount?: number;
  attributeReactionSequence?: number;
  greedQualifiedSpending?: number;
  greedLossRemainder?: number;
  coinGameRemainder?: number;
  pendingCoinGames?: number;
  moneyConversionRemainder?: number;
  pendingMoneyConversions?: number;
  pendingMoneyConversionTransactions?: number[];
  lastGreedResetMonth?: number;
  greedRandomState?: number;
  sanCapReserveBonus?: number;
}

export function getRoleTalentLevel(state: Pick<GameState, "roleTalents">, id: string): number {
  const level = state.roleTalents?.levels[id] ?? 0;
  return Number.isSafeInteger(level) && level > 0 ? level : 0;
}

export function createRoleTalentRunState(levels: Record<string, number> = {}): RoleTalentRunState {
  return { levels: { ...levels } };
}

/** Recompute for each new review draw; existing review reports stay unchanged. */
export function getRoleKindReviewerBonus(state: Pick<GameState, "selectedRoleId" | "degree" | "player" | "roleTalents">): number {
  if (state.selectedRoleId !== "social" || state.degree !== "phd") return 0;
  const perLevel = usesGameplayRulesFrom("20261023-r36") ? 0.01 : usesGameplayRulesFrom("20261023-r30") ? 0.02 : 0.01;
  return Math.min(1, Math.max(0, Number((state.player.social * perLevel * getRoleTalentLevel(state, "kindly-reviewed")).toFixed(10))));
}
