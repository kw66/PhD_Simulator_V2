import { getLabTalentActionBonus } from "./v2-lab-talent";
import { clampSan, pushLog } from "./v2-engine-helpers";
import { getInternshipExperimentMultiplier } from "./v2-internship-system";
import {
  applyReadAction,
  consumeReadingIdeaBonus,
  getMonitorIdeaBonus,
} from "./v2-reading-system";
import { clampResearchToCap } from "./v2-research-cap-system";
import { isPreEnrollmentState } from "./v2-progression";
import { getShopPaperActionModifier } from "./v2-shop-items";
import {
  calculateTemporaryActionGain,
  consumeTemporaryActionEffect,
} from "./v2-temporary-action-rules";
import {
  createDraftPaper,
  getReviewMonths,
  getSelectedPaper,
  getSubmitReadyThreshold,
  markPaperReviewing,
} from "./v2-paper-rules";
import type { GameState, Paper, PaperActionType, PaperTarget, PlayerStats } from "./v2-types";

const PAPER_ACTION_LABELS: Record<PaperActionType, string> = {
  idea: "想 idea",
  experiment: "做实验",
  writing: "写作",
};

const PAPER_PROGRESS_LABELS: Record<PaperActionType, string> = {
  idea: "idea",
  experiment: "实验",
  writing: "写作",
};

type SpendAction = (
  state: GameState,
  text: string,
  updater: (player: PlayerStats) => PlayerStats,
  papers?: Paper[],
) => GameState;

type GetActionBlockedState = (state: GameState) => GameState | null;

export function applyPaperAction(
  state: GameState,
  actionType: PaperActionType,
  getActionBlockedState: GetActionBlockedState,
  spendAction: SpendAction,
  paperId?: string,
): GameState {
  if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
  const blockedState = getActionBlockedState(state);
  if (blockedState) return blockedState;

  const selected = getSelectedPaper(state, paperId);
  if (!selected) return pushLog(state, "当前没有选中的论文。");
  if (selected.status !== "draft") return pushLog(state, "当前只能推进草稿状态的论文。");

  const baseGain = 2 + state.actionBonuses[actionType];
  const labTalentActionBonus = getLabTalentActionBonus(state.relationshipState);
  const temporaryEffect = state.temporaryActionEffects[actionType];
  const shopActionModifier = getShopPaperActionModifier(state.shopState, actionType);
  const readingIdeaBonus = actionType === "idea" ? getMonitorIdeaBonus(state.shopState, state.readingState) : 0;
  const dualMonitorIdeaBonus = actionType === "idea" ? state.readingState.dualMonitorIdeaBonus : 0;
  const internshipExperimentMultiplier = getInternshipExperimentMultiplier(state.internshipState, actionType);
  const sanCost = Math.max(0, 1 - shopActionModifier.sanDiscount);
  const totalGain = calculateTemporaryActionGain(baseGain, {
    bonus: temporaryEffect.bonus + shopActionModifier.bonus + readingIdeaBonus + dualMonitorIdeaBonus + labTalentActionBonus,
    multiplier: temporaryEffect.multiplier * internshipExperimentMultiplier,
    extraActions: temporaryEffect.extraActions + state.persistentExtraActions[actionType] + shopActionModifier.extraActions,
  });

  const papers = state.papers.map((paper) => {
    if (paper.id !== selected.id) return paper;

    switch (actionType) {
      case "idea":
        return { ...paper, idea: paper.idea + totalGain };
      case "experiment":
        return { ...paper, experiment: paper.experiment + totalGain };
      case "writing":
        return { ...paper, writing: paper.writing + totalGain };
      default:
        return paper;
    }
  });

  const nextState = selected.id === state.selectedPaperId ? state : { ...state, selectedPaperId: selected.id };
  return spendAction(
    {
      ...nextState,
      readingState: actionType === "idea" ? consumeReadingIdeaBonus(state.readingState) : state.readingState,
      temporaryActionEffects: consumeTemporaryActionEffect(state.temporaryActionEffects, actionType),
    },
    `${PAPER_ACTION_LABELS[actionType]}，${selected.title}${PAPER_PROGRESS_LABELS[actionType]} +${totalGain}，SAN -${sanCost}。`,
    (player) => ({ ...player, san: clampSan(player.san - sanCost, state.sanCap) }),
    papers,
  );
}

export function createPaperAction(
  state: GameState,
  spendAction: SpendAction,
): GameState {
  if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
  if (state.papers.length >= state.paperSlotsUnlocked) {
    return pushLog(state, `当前已用满 ${state.paperSlotsUnlocked} 个已解锁论文槽。`);
  }

  const paper = createDraftPaper(state.totalMonths, state.papers.length);
  return spendAction(
    { ...state, selectedPaperId: paper.id },
    `创建了 ${paper.title}。`,
    (player) => ({ ...player, san: clampSan(player.san - 1) }),
    [...state.papers, paper],
  );
}

export function submitPaperAction(
  state: GameState,
  target: PaperTarget,
  spendAction: SpendAction,
  paperId?: string,
): GameState {
  if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
  const selected = getSelectedPaper(state, paperId);
  if (!selected) return pushLog(state, "当前没有选中的论文。");
  if (selected.status !== "draft") return pushLog(state, "当前论文已经在审稿或已发表。");

  const readyValue = getSubmitReadyThreshold(target);
  const total = selected.idea + selected.experiment + selected.writing;
  if (total < readyValue) {
    return pushLog(state, `${selected.title} 还没达到 ${target} 类投稿准备线（当前 ${total} / 需要 ${readyValue}）。`);
  }

  const papers = state.papers.map((paper) => paper.id === selected.id
    ? markPaperReviewing(paper, target, state.month, state.year)
    : paper);
  return spendAction(
    { ...state, selectedPaperId: selected.id },
    `${selected.title} 已提交 ${target} 类，预计审稿 ${getReviewMonths(target)} 个月。`,
    (player) => ({ ...player, san: clampSan(player.san - 1) }),
    papers,
  );
}

export function readPaperAction(
  state: GameState,
  getActionBlockedState: GetActionBlockedState,
  spendAction: SpendAction,
): GameState {
  if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
  const blockedState = getActionBlockedState(state);
  if (blockedState) return blockedState;

  const result = applyReadAction(state.readingState, state.shopState, state.temporaryActionEffects);
  if (state.player.san < result.sanCost) {
    return pushLog(state, `阅读论文需要 ${result.sanCost} 点 SAN，当前不足。`);
  }

  let text = `阅读论文，科研 +${result.researchDelta}，下次想 idea +${result.ideaBonus}，SAN -${result.sanCost}。`;
  if (state.shopState.monitorUpgrade === "4k") {
    text = `阅读论文（4K 显示器），科研 +${result.researchDelta}，下次想 idea +${result.ideaBonus}，SAN -${result.sanCost}。`;
  } else if (state.shopState.monitorUpgrade === "smart") {
    text = `阅读论文（智能显示器），科研 +${result.researchDelta}，下次想 idea +${result.ideaBonus}，SAN -${result.sanCost}。`;
  } else if (state.shopState.monitorUpgrade === "dual") {
    text = `阅读论文（双屏显示器），科研 +${result.researchDelta}，下次想 idea +${result.ideaBonus}，SAN -${result.sanCost}。`;
  }

  return spendAction({
    ...state,
    readingState: result.readingState,
    temporaryActionEffects: result.temporaryActionEffects,
  }, text, (player) => ({
    ...player,
    research: clampResearchToCap(player.research + result.researchDelta, state.researchCapacityState),
    san: clampSan(player.san - result.sanCost, state.sanCap),
  }));
}
