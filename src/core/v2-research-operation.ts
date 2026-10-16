import { gameRandom } from "./v2-game-random";
import { consumeNextActionBuffs, getActionEffect, getActiveOperationSanCostForState } from "./v2-buffs";
import { consumeActiveOperation, getActiveOperationAllowance } from "./v2-ai-shop";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";
import { getAcademicCalendarYear } from "./v2-calendar";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { getQueuedPaperTargetIds } from "./v2-event-queue";
import { createDraftPaper, getAvailablePaperSlotCount, getWorkstationPaperSlotMap } from "./v2-paper-rules";
import { getShopExperimentMoneyDiscount, getShopPaperActionModifier } from "./v2-shop-items-effects";
import { getPaperScoreBreakdown, setPaperOwnScore } from "./v2-paper-collaboration";
import { combineEffectMultipliers } from "./v2-numeric-modifiers";
import { getInternshipExperimentEffect } from "./v2-internship-system";
import { getLabExperimentMoneyCost } from "./v2-lab-compute";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import { recordPersonalSpending, roundMoney } from "./v2-money";
import type { GameState, PaperActionType } from "./v2-types";
import { getEffectiveResearch } from "./v2-effective-attributes";
import { captureResearchContext } from "./v2-paper-diagnostics";

export const RESEARCH_OPERATION_SAN_COST: Record<PaperActionType, number> = {
  idea: 2,
  experiment: 3,
  writing: 4,
};

export { RESEARCH_EXPERIMENT_MONEY_COST } from "./v2-lab-compute";

export function getResearchExperimentMoneyCost(state: Pick<GameState, "shopState" | "internshipState" | "totalMonths" | "buffs">): number {
  return Math.max(0, getLabExperimentMoneyCost(state)
    - getShopExperimentMoneyDiscount(state.shopState)
    - getInternshipExperimentEffect(state).moneyDiscount);
}

export function getResearchExperimentCostBreakdown(state: Pick<GameState, "shopState" | "advisorProgressState" | "internshipState" | "totalMonths" | "buffs">): {
  total: number;
  advisorFunding: number;
  playerMoney: number;
} {
  const total = getResearchExperimentMoneyCost(state);
  const advisorFunding = roundMoney(Math.min(total, Math.max(0, state.advisorProgressState.funding)));
  return { total, advisorFunding, playerMoney: roundMoney(total - advisorFunding) };
}

export function getResearchActionEffect(state: GameState, actionType: PaperActionType, includeNextAction = true) {
  const effect = getActionEffect(state, actionType, { includeNextAction });
  if (actionType !== "experiment") return effect;
  const internship = getInternshipExperimentEffect(state);
  return {
    ...effect,
    bonus: effect.bonus + internship.bonus,
    multiplier: combineEffectMultipliers([effect.multiplier, internship.multiplier]),
  };
}

const RESEARCH_OPERATION_LABEL: Record<PaperActionType, string> = {
  idea: "想 idea",
  experiment: "做实验",
  writing: "写论文",
};

export interface ResearchOperationPreview {
  actionType: PaperActionType;
  allowed: boolean;
  consumesAction: boolean;
  usesAiResearchBonus: boolean;
  scoreBonus: number;
  scoreMultiplier: number;
  extraActions: number;
  sanCost: number;
}

/**
 * Shared resolver for idea, experiment and writing. Keep this calculation in
 * one place so every future workstation button follows the same AI rules.
 */
export function previewResearchOperation(
  state: GameState,
  actionType: PaperActionType,
  baseSanCost: number,
): ResearchOperationPreview {
  const allowance = getActiveOperationAllowance(state, actionType);
  const effect = getResearchActionEffect(state, actionType);
  const equipmentEffect = getShopPaperActionModifier(state.shopState, actionType);
  const sanCost = getActiveOperationSanCostForState(
    state,
    baseSanCost,
    actionType,
    effect.sanDelta - equipmentEffect.sanDiscount + (allowance.usesAiResearchBonus ? 2 : 0),
  );
  return {
    actionType,
    allowed: allowance.allowed,
    consumesAction: allowance.consumesAction,
    usesAiResearchBonus: allowance.usesAiResearchBonus,
    scoreBonus: effect.bonus + equipmentEffect.bonus,
    scoreMultiplier: effect.multiplier,
    extraActions: effect.extraActions + equipmentEffect.extraActions,
    sanCost,
  };
}

export function createResearchPaper(state: GameState, slotIndex: number): GameState {
  const availableSlotCount = getAvailablePaperSlotCount(state);
  const papersBySlot = getWorkstationPaperSlotMap(state.papers);
  if (
    state.phase !== "playing"
    || !Number.isInteger(slotIndex)
    || slotIndex < 0
    || slotIndex >= availableSlotCount
    || papersBySlot.has(slotIndex)
  ) {
    return state;
  }

  const existingPaperIds = new Set([
    ...[...state.papers, ...state.externalPublications].map((paper) => paper.id),
    ...getQueuedPaperTargetIds(state.eventQueue),
  ]);
  let sequence = 1;
  while (existingPaperIds.has(`paper-${state.totalMonths}-${sequence}`)) sequence += 1;
  const paper = {
    ...createDraftPaper(
      state.totalMonths,
      sequence - 1,
      gameRandom,
      getAcademicCalendarYear(state.year, state.month),
    ),
    paperSlotIndex: slotIndex,
  };
  return {
    ...state,
    paperSlotsUnlocked: availableSlotCount,
    papers: [...state.papers, paper],
    selectedPaperId: paper.id,
  };
}

function canRunPaperAction(
  state: GameState,
  paperId: string,
  actionType: PaperActionType,
): { allowed: true; paperIndex: number } | { allowed: false; reason: string } {
  const paperIndex = state.papers.findIndex((paper) => paper.id === paperId);
  if (paperIndex < 0) return { allowed: false, reason: "没有找到这篇论文" };
  const paper = state.papers[paperIndex]!;
  if (paper.status !== "draft" && paper.status !== "journal-reviewing") {
    return { allowed: false, reason: "审稿中的论文暂时不能继续修改" };
  }
  if (actionType === "experiment" && paper.idea <= 0) {
    return { allowed: false, reason: "先想出 idea，才能开始实验" };
  }
  if (actionType === "writing" && paper.experiment <= 0) {
    return { allowed: false, reason: "先完成实验，才能开始写论文" };
  }
  return { allowed: true, paperIndex };
}

export function generateResearchScore(
  research: number,
  currentScore: number,
  multiplier: number,
  bonus: number,
  random: () => number,
): number {
  const raw = research * (0.5 + random()) + Math.floor(random() * 6);
  const candidate = Math.max(0, Math.round(raw * multiplier + bonus));
  return Math.max(candidate, currentScore + 1);
}

export function applyResearchOperation(
  state: GameState,
  paperId: string,
  actionType: PaperActionType,
  random: () => number = gameRandom,
): GameState {
  if (state.phase !== "playing") return state;

  const eligibility = canRunPaperAction(state, paperId, actionType);
  if (!eligibility.allowed) return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：${eligibility.reason}`);

  const preview = previewResearchOperation(state, actionType, RESEARCH_OPERATION_SAN_COST[actionType]);
  if (!preview.allowed) return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：本月行动次数已用尽`);

  const experimentCost = actionType === "experiment"
    ? getResearchExperimentCostBreakdown(state)
    : { total: 0, advisorFunding: 0, playerMoney: 0 };
  const advisorFundingUsed = experimentCost.advisorFunding;
  const playerMoneyCost = experimentCost.playerMoney;
  if (state.player.money < playerMoneyCost) {
    return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：金币不足，需要 ${playerMoneyCost}`);
  }
  const preparedState = consumeActiveOperation({ ...state, player: { ...state.player, money: roundMoney(state.player.money - playerMoneyCost) } }, actionType);
  const payment = quoteSanPayment(preparedState, preview.sanCost);
  if (!payment.allowed) return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：SAN 不足，需要 ${preview.sanCost}`);

  const paper = state.papers[eligibility.paperIndex]!;
  const equipmentEffect = getShopPaperActionModifier(state.shopState, actionType);
  const executionCount = Math.max(1, 1 + Math.floor(preview.extraActions));
  let score = getPaperScoreBreakdown(paper, actionType).own;

  for (let index = 0; index < executionCount; index += 1) {
    const buffEffect = getResearchActionEffect(state, actionType, index === 0);
    score = generateResearchScore(
      getEffectiveResearch(state, state),
      score,
      buffEffect.multiplier,
      buffEffect.bonus + equipmentEffect.bonus,
      random,
    );
  }

  const updatedPaper = {
    ...setPaperOwnScore(paper, actionType, score),
    ...(paper.nonFirstAuthor || (paper.leadAuthorId && paper.leadAuthorId !== "player") ? {} : { researchDiagnostics: {
      ...paper.researchDiagnostics,
      lastOperations: { ...paper.researchDiagnostics?.lastOperations, [actionType]: {
        context: captureResearchContext(state), previousOwn: getPaperScoreBreakdown(paper, actionType).own,
        nextOwn: score, multiplier: preview.scoreMultiplier, bonus: preview.scoreBonus, executions: executionCount,
      } },
    } }),
  };
  const nextState = consumeNextActionBuffs(recordPersonalSpending({
    ...paySanCost(preparedState, preview.sanCost),
    papers: state.papers.map((entry, index) => index === eligibility.paperIndex ? updatedPaper : entry),
    selectedPaperId: paper.id,
    advisorProgressState: actionType === "experiment"
      ? { ...state.advisorProgressState, funding: roundMoney(state.advisorProgressState.funding - advisorFundingUsed) }
      : state.advisorProgressState,
  }, playerMoneyCost), actionType);
  const operationCountText = executionCount > 1 ? `，共 ${executionCount} 次` : "";
  return pushLog(
    recordLabFinance(nextState, "player-experiment", -advisorFundingUsed),
    `${RESEARCH_OPERATION_LABEL[actionType]}：${paper.title}，${actionType} ${paper[actionType]} → ${updatedPaper[actionType]}${operationCountText}；${formatSanPayment(payment)}${playerMoneyCost > 0 ? `；金币 -${playerMoneyCost}` : ""}`,
  );
}
