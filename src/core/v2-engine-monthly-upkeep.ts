import {
  clampSan,
  cloneInternshipState,
  cloneLoverState,
  clonePlayer,
  cloneRelationshipState,
  cloneResearchCapacityState,
} from "./v2-engine-helpers";
import {
  applyCoffeeMonthlyEffect,
} from "./v2-coffee-system";
import {
  applyDualMonitorMonthlyRead,
} from "./v2-reading-system";
import {
  applyShopMonthlyModifier,
  getChairFlatMonthlySanBonus,
  getChairMonthlyRecovery,
} from "./v2-shop-items";
import { getMonthlySeasonSanModifier } from "./v2-sanity-rules";
import {
  applyInternshipMonthlyEffect,
  getInternshipMonthlyIncome,
  getPublishedAPaperCount,
} from "./v2-internship-system";
import { applyLoverMonthlyEffect } from "./v2-lover-system";
import { getMonthlyRelationshipEffects } from "./v2-relationship-rules";
import { clampResearchToCap } from "./v2-research-cap-system";
import { getAdvisorSalaryForMonth } from "./v2-progression";
import type { GameState } from "./v2-types";

const BASE_MONTHLY_LIVING_COST = 1;

export interface MonthlyUpkeepResult {
  nextPlayer: GameState["player"];
  relationshipState: GameState["relationshipState"];
  internshipState: GameState["internshipState"];
  loverState: GameState["loverState"];
  researchCapacityState: GameState["researchCapacityState"];
  internshipCount: number;
  totalCitations: number;
  shopState: GameState["shopState"];
  coffeeState: GameState["coffeeState"];
  readingState: GameState["readingState"];
  temporaryActionEffects: GameState["temporaryActionEffects"];
  nextSanCap: number;
  reviewLogsStart: string[];
  shopLogs: string[];
  coffeeLogs: string[];
  readingLogs: string[];
  monthlyRelationshipEffects: ReturnType<typeof getMonthlyRelationshipEffects>;
}

export function applyMonthlyUpkeep(
  state: GameState,
  calendarMonth: number,
): MonthlyUpkeepResult {
  const nextPlayer = clonePlayer(state.player);
  const relationshipState = cloneRelationshipState(state);
  let internshipState = cloneInternshipState(state);
  let loverState = cloneLoverState(state);
  let researchCapacityState = cloneResearchCapacityState(state);
  let internshipCount = state.internshipCount;
  let totalCitations = state.totalCitations;

  if (state.eventSupport.hasFinanceTalent) {
    nextPlayer.money += Math.ceil(Math.max(0, state.player.money) * 0.03);
  }
  nextPlayer.money += getAdvisorSalaryForMonth(state.selectedAdvisorId, state.degree, calendarMonth);
  nextPlayer.san = clampSan(nextPlayer.san + 1, state.sanCap);
  nextPlayer.money -= BASE_MONTHLY_LIVING_COST;

  const loverMonthlyEffect = applyLoverMonthlyEffect(loverState, nextPlayer.san, state.sanCap);
  loverState = loverMonthlyEffect.loverState;
  if (loverMonthlyEffect.moneyDelta !== 0) {
    nextPlayer.money += loverMonthlyEffect.moneyDelta;
  }
  if (loverMonthlyEffect.sanDelta !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + loverMonthlyEffect.sanDelta, state.sanCap);
  }

  const chairFlatMonthlySanBonus = getChairFlatMonthlySanBonus(state.shopState);
  if (chairFlatMonthlySanBonus !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + chairFlatMonthlySanBonus, state.sanCap);
  }
  const chairMonthlyRecovery = getChairMonthlyRecovery(state.shopState, nextPlayer.san, state.sanCap);
  if (chairMonthlyRecovery !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + chairMonthlyRecovery, state.sanCap);
  }
  if (state.eventSupport.hasStrongBodyTalent) {
    nextPlayer.san = clampSan(nextPlayer.san + 1, state.sanCap);
  }

  const monthlySeasonSanModifier = getMonthlySeasonSanModifier(calendarMonth, state.eventSupport);
  if (monthlySeasonSanModifier !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + monthlySeasonSanModifier, state.sanCap);
  }

  const shopMonthlyModifier = applyShopMonthlyModifier(state.shopState, calendarMonth);
  if (shopMonthlyModifier.sanDelta !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + shopMonthlyModifier.sanDelta, state.sanCap);
  }
  const nextSanCap = state.sanCap + shopMonthlyModifier.sanCapDelta;

  const monthlyRelationshipEffects = getMonthlyRelationshipEffects(relationshipState);
  nextPlayer.san = clampSan(nextPlayer.san + monthlyRelationshipEffects.sanDelta, nextSanCap);
  totalCitations += monthlyRelationshipEffects.citationDelta;

  const internshipMonthlyEffect = applyInternshipMonthlyEffect(
    internshipState,
    getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.totalCitations),
    internshipCount,
  );
  internshipState = internshipMonthlyEffect.internshipState;
  internshipCount += internshipMonthlyEffect.internshipCountDelta;
  if (internshipMonthlyEffect.moneyDelta !== 0) {
    nextPlayer.money += internshipMonthlyEffect.moneyDelta;
  }
  if (internshipMonthlyEffect.sanDelta !== 0) {
    nextPlayer.san += internshipMonthlyEffect.sanDelta;
  }

  const monthlyCoffeeEffect = applyCoffeeMonthlyEffect(state.coffeeState, nextPlayer.money);
  if (monthlyCoffeeEffect.moneyDelta !== 0) {
    nextPlayer.money += monthlyCoffeeEffect.moneyDelta;
  }
  if (monthlyCoffeeEffect.sanDelta !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + monthlyCoffeeEffect.sanDelta, nextSanCap);
  }

  const monthlyDualReadEffect = applyDualMonitorMonthlyRead(state.readingState, state.shopState, state.temporaryActionEffects);
  if (monthlyDualReadEffect.sanDelta !== 0) {
    nextPlayer.san = clampSan(nextPlayer.san + monthlyDualReadEffect.sanDelta, nextSanCap);
  }
  if (monthlyDualReadEffect.researchDelta !== 0) {
    nextPlayer.research = clampResearchToCap(nextPlayer.research + monthlyDualReadEffect.researchDelta, researchCapacityState);
  }

  return {
    nextPlayer,
    relationshipState,
    internshipState,
    loverState,
    researchCapacityState,
    internshipCount,
    totalCitations,
    shopState: shopMonthlyModifier.shopState,
    coffeeState: monthlyCoffeeEffect.coffeeState,
    readingState: monthlyDualReadEffect.readingState,
    temporaryActionEffects: monthlyDualReadEffect.temporaryActionEffects,
    nextSanCap,
    reviewLogsStart: [
      ...loverMonthlyEffect.logs,
      ...internshipMonthlyEffect.logs,
    ],
    shopLogs: shopMonthlyModifier.logs,
    coffeeLogs: monthlyCoffeeEffect.logs,
    readingLogs: monthlyDualReadEffect.logs,
    monthlyRelationshipEffects,
  };
}
