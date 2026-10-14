import type { GameState } from "./v2-types";

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
  /** Fixed additional kind-reviewer probability recorded at PhD transfer (0..1). */
  kindReviewerBonus?: number;
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
  regularActionBudget?: number;
  lastSwapMonth?: number;
  lastCurseMonth?: number;
  negativeDiseaseMilestone?: number;
  boostedFellowIds?: string[];
  investments?: RoleTalentInvestment[];
  nextInvestmentId?: number;
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
  lastGreedResetMonth?: number;
  greedRandomState?: number;
}

export function getRoleTalentLevel(state: Pick<GameState, "roleTalents">, id: string): number {
  const level = state.roleTalents?.levels[id] ?? 0;
  return Number.isSafeInteger(level) && level > 0 ? level : 0;
}

export function createRoleTalentRunState(levels: Record<string, number> = {}): RoleTalentRunState {
  return { levels: { ...levels } };
}
