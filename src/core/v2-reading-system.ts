import { addOrReplaceBuffs, getActiveOperationSanCostForState, getActiveOperationSanMultiplier, getReadingEffect } from "./v2-buffs";
import { pushLog } from "./v2-engine-helpers";
import { clampResearchToCap } from "./v2-research-cap-system";
import { getShopReadSanDiscount } from "./v2-shop-items-effects";
import type { Buff, GameState, ReadingState } from "./v2-types";

export interface ReadPaperActionOptions {
  consumeMonthlyAction: boolean;
  consumeMonthlyActionOnce?: boolean;
  allowSanOverdraw?: boolean;
  writeLog?: boolean;
  source?: string;
}

export interface ReadPaperActionResolution {
  nextState: GameState;
  requestedCount: number;
  appliedCount: number;
  totalSanCost: number;
  totalIdeaBonus: number;
  researchGain: number;
  monthlyActionsUsed: number;
  blockedReason: "none" | "action-limit" | "insufficient-san";
}

export interface ReadPaperActionPreview {
  canRead: boolean;
  readCount: number;
  sanCost: number;
  baseSanCost: number;
  illnessMultiplier: number;
  blockedReason: ReadPaperActionResolution["blockedReason"];
}

export interface ReadingCountProgress {
  nextState: GameState;
  appliedCount: number;
  researchGain: number;
}

export function createReadingState(): ReadingState {
  return {
    readCount: 0,
  };
}

/** Return the next-action idea bonus waiting to be consumed from reading. */
export function getPendingReadingIdeaBonus(state: Pick<GameState, "buffs">): number {
  return state.buffs.reduce((total, buff) => {
    if (!buff.id.startsWith("read-paper-idea-")) return total;
    if (buff.remainingMonths !== null && buff.remainingMonths <= 0) return total;
    const bonus = buff.actionEffects?.idea?.bonus;
    return total + (Number.isFinite(bonus) ? bonus ?? 0 : 0);
  }, 0);
}

export function getReadingIdeaBonus(readCount: number): number {
  const normalizedReadCount = Math.max(1, Math.floor(readCount));
  return 1 + Math.floor((normalizedReadCount - 1) / 10);
}

export function getManualReadPaperCount(state: Pick<GameState, "buffs">): number {
  return 1 + Math.max(0, Math.floor(getReadingEffect(state.buffs).manualExtraReads));
}

export function getReadPaperSanCost(
  state: Pick<GameState, "buffs" | "shopState" | "month" | "eventSupport">,
): { baseSanCost: number; illnessMultiplier: number; sanCost: number } {
  const baseSanCost = 2;
  const readingSanDelta = getReadingEffect(state.buffs).sanDelta;
  const equipmentSanDelta = -getShopReadSanDiscount(state.shopState);
  const illnessMultiplier = getActiveOperationSanMultiplier(state.buffs, "read");
  return {
    baseSanCost,
    illnessMultiplier,
    sanCost: getActiveOperationSanCostForState(state, baseSanCost, "read", equipmentSanDelta + readingSanDelta),
  };
}

export function previewReadPaperAction(state: GameState): ReadPaperActionPreview {
  const readCount = getManualReadPaperCount(state);
  const perRead = getReadPaperSanCost(state);
  const baseSanCost = perRead.baseSanCost * readCount;
  const sanCost = perRead.sanCost * readCount;
  const blockedReason = state.actionState.used >= state.actionState.limit
    ? "action-limit"
    : state.player.san < sanCost
      ? "insufficient-san"
      : "none";
  return {
    canRead: blockedReason === "none",
    readCount,
    sanCost,
    baseSanCost,
    illnessMultiplier: perRead.illnessMultiplier,
    blockedReason,
  };
}

export function applyReadingCountProgress(state: GameState, requestedCount: number): ReadingCountProgress {
  const appliedCount = Math.max(0, Math.floor(requestedCount));
  if (appliedCount === 0) {
    return { nextState: state, appliedCount: 0, researchGain: 0 };
  }

  const previousReadCount = state.readingState.readCount;
  const readCount = previousReadCount + appliedCount;
  const crossedMilestones = Math.floor(readCount / 10) - Math.floor(previousReadCount / 10);
  const research = clampResearchToCap(state.player.research + crossedMilestones, state.researchCapacityState);
  const researchGain = research - state.player.research;

  return {
    nextState: {
      ...state,
      readingState: { ...state.readingState, readCount },
      player: { ...state.player, research },
    },
    appliedCount,
    researchGain,
  };
}

function createIdeaBuff(state: GameState, readCount: number, ideaBonus: number, source: string): Buff {
  return {
    id: `read-paper-idea-${state.totalMonths}-${readCount}`,
    name: `下次想 idea +${ideaBonus}分`,
    source,
    timing: "next-action",
    remainingMonths: null,
    actionEffects: { idea: { bonus: ideaBonus } },
  };
}

export function applyReadPaperActions(
  state: GameState,
  requestedCount: number,
  options: ReadPaperActionOptions,
): ReadPaperActionResolution {
  const count = Math.max(0, Math.floor(requestedCount));
  const allowSanOverdraw = options.allowSanOverdraw ?? false;
  const consumeMonthlyActionOnce = options.consumeMonthlyActionOnce ?? false;
  const source = options.source?.trim() || "看论文";
  let nextState = state;
  let appliedCount = 0;
  let totalSanCost = 0;
  let totalIdeaBonus = 0;
  let researchGain = 0;
  let monthlyActionsUsed = 0;
  let blockedReason: ReadPaperActionResolution["blockedReason"] = "none";

  if (
    options.consumeMonthlyAction
    && consumeMonthlyActionOnce
    && !allowSanOverdraw
    && state.player.san < getReadPaperSanCost(state).sanCost * count
  ) {
    return {
      nextState: state,
      requestedCount: count,
      appliedCount: 0,
      totalSanCost: 0,
      totalIdeaBonus: 0,
      researchGain: 0,
      monthlyActionsUsed: 0,
      blockedReason: "insufficient-san",
    };
  }

  for (let index = 0; index < count; index += 1) {
    const consumesActionThisRead = options.consumeMonthlyAction
      && (!consumeMonthlyActionOnce || monthlyActionsUsed === 0);
    if (consumesActionThisRead && nextState.actionState.used >= nextState.actionState.limit) {
      blockedReason = "action-limit";
      break;
    }

    const { sanCost } = getReadPaperSanCost(nextState);
    if (!allowSanOverdraw && nextState.player.san < sanCost) {
      blockedReason = "insufficient-san";
      break;
    }

    const readCount = nextState.readingState.readCount + 1;
    const ideaBonus = getReadingIdeaBonus(readCount);
    const reachesResearchMilestone = readCount > 0 && readCount % 10 === 0;
    const nextResearch = reachesResearchMilestone
      ? clampResearchToCap(nextState.player.research + 1, nextState.researchCapacityState)
      : nextState.player.research;
    const appliedResearchGain = nextResearch - nextState.player.research;

    nextState = {
      ...nextState,
      actionState: consumesActionThisRead
        ? { ...nextState.actionState, used: nextState.actionState.used + 1 }
        : nextState.actionState,
      readingState: {
        ...nextState.readingState,
        readCount,
      },
      player: {
        ...nextState.player,
        san: nextState.player.san - sanCost,
        research: nextResearch,
      },
      buffs: addOrReplaceBuffs(nextState.buffs, [createIdeaBuff(nextState, readCount, ideaBonus, source)]),
    };

    appliedCount += 1;
    totalSanCost += sanCost;
    totalIdeaBonus += ideaBonus;
    researchGain += appliedResearchGain;
    monthlyActionsUsed += consumesActionThisRead ? 1 : 0;
  }

  if ((options.writeLog ?? true) && appliedCount > 0) {
    const parts = [
      `看论文 ${appliedCount} 次`,
      `SAN -${totalSanCost}`,
      `下次想 idea +${totalIdeaBonus}`,
      researchGain > 0 ? `科研 +${researchGain}` : "",
    ].filter(Boolean);
    nextState = pushLog(nextState, `${source}：${parts.join("｜")}`);
  }

  return {
    nextState,
    requestedCount: count,
    appliedCount,
    totalSanCost,
    totalIdeaBonus,
    researchGain,
    monthlyActionsUsed,
    blockedReason,
  };
}

export function previewReadPaperActions(
  state: GameState,
  count: number,
  options: Omit<ReadPaperActionOptions, "writeLog">,
): ReadPaperActionResolution {
  return applyReadPaperActions(structuredClone(state), count, { ...options, writeLog: false });
}
