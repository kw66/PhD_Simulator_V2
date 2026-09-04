import { consumeNextActionBuffs, getActionEffect, getActiveOperationSanCostForState } from "./v2-buffs";
import { getActiveOperationAllowance } from "./v2-ai-shop";
import { getAcademicCalendarYear } from "./v2-calendar";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { createDraftPaper, getAvailablePaperSlotCount, getWorkstationPaperSlotMap } from "./v2-paper-rules";
import { getShopPaperActionModifier } from "./v2-shop-items-effects";
import type { GameState, PaperActionType } from "./v2-types";

export const RESEARCH_OPERATION_SAN_COST: Record<PaperActionType, number> = {
  idea: 2,
  experiment: 3,
  writing: 4,
};

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
  const effect = getActionEffect(state, actionType);
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

export function applyResearchOperationActionState(
  state: GameState,
  actionType: PaperActionType,
): Pick<GameState, "actionState"> {
  const allowance = getActiveOperationAllowance(state, actionType);
  return {
    actionState: {
      ...state.actionState,
      used: state.actionState.used + (allowance.consumesAction ? 1 : 0),
      aiResearchBonusUsed: state.actionState.aiResearchBonusUsed || allowance.usesAiResearchBonus,
    },
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

  const existingPaperIds = new Set([...state.papers, ...state.externalPublications].map((paper) => paper.id));
  let sequence = 1;
  while (existingPaperIds.has(`paper-${state.totalMonths}-${sequence}`)) sequence += 1;
  const paper = {
    ...createDraftPaper(
      state.totalMonths,
      sequence - 1,
      Math.random,
      getAcademicCalendarYear(state.year, state.month),
    ),
    paperSlotIndex: slotIndex,
  };
  return pushLog({
    ...state,
    paperSlotsUnlocked: availableSlotCount,
    papers: [...state.papers, paper],
    selectedPaperId: paper.id,
  }, `科研：在论文槽 ${slotIndex + 1} 开启${paper.title}`);
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

function generateResearchScore(
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
  random: () => number = Math.random,
): GameState {
  if (state.phase !== "playing") return state;

  const eligibility = canRunPaperAction(state, paperId, actionType);
  if (!eligibility.allowed) return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：${eligibility.reason}`);

  const preview = previewResearchOperation(state, actionType, RESEARCH_OPERATION_SAN_COST[actionType]);
  if (!preview.allowed) return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：本月行动次数已用尽`);
  if (state.player.san < preview.sanCost) {
    return pushNoOpLog(state, `${RESEARCH_OPERATION_LABEL[actionType]}：SAN 不足，需要 ${preview.sanCost}`);
  }

  const paper = state.papers[eligibility.paperIndex]!;
  const equipmentEffect = getShopPaperActionModifier(state.shopState, actionType);
  const executionCount = Math.max(1, 1 + Math.floor(preview.extraActions));
  let score = paper[actionType];

  for (let index = 0; index < executionCount; index += 1) {
    const buffEffect = getActionEffect(state, actionType, { includeNextAction: index === 0 });
    score = generateResearchScore(
      state.player.research,
      score,
      buffEffect.multiplier,
      buffEffect.bonus + equipmentEffect.bonus,
      random,
    );
  }

  const actionState = applyResearchOperationActionState(state, actionType);
  const updatedPaper = { ...paper, [actionType]: score };
  const nextState = consumeNextActionBuffs({
    ...state,
    ...actionState,
    papers: state.papers.map((entry, index) => index === eligibility.paperIndex ? updatedPaper : entry),
    selectedPaperId: paper.id,
    player: { ...state.player, san: state.player.san - preview.sanCost },
  }, actionType);
  const operationCountText = executionCount > 1 ? `，共 ${executionCount} 次` : "";
  return pushLog(
    nextState,
    `${RESEARCH_OPERATION_LABEL[actionType]}：${paper.title}，${actionType} ${paper[actionType]} → ${score}${operationCountText}；SAN -${preview.sanCost}`,
  );
}
