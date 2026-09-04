import { polishUnsubmittedPapers, type AiModelOffer } from "./v2-ai-shop";
import { applyReadPaperActions } from "./v2-reading-system";
import type { GameState } from "./v2-types";

export interface AiActivationEffectsResolution {
  nextState: GameState;
  polishDetails: string[];
  readingDetails: string[];
}

export function applyAiActivationEffects(
  state: GameState,
  models: readonly AiModelOffer[],
): AiActivationEffectsResolution {
  let nextState = state;
  const polishDetails: string[] = [];
  const readingDetails: string[] = [];

  for (const model of models) {
    if (model.slot === "claude") {
      const polished = polishUnsubmittedPapers(nextState.papers, model);
      if (polished.changedScoreCount > 0) {
        nextState = { ...nextState, papers: polished.papers };
        polishDetails.push(`${model.name} 提升 ${polished.changedPaperCount} 篇未提交论文或送审期刊的分数，共 ${polished.changedScoreCount} 项`);
      }
    }

    const requestedReads = Math.max(0, Math.floor(model.readingEffect?.automaticReads ?? 0));
    if (requestedReads === 0) continue;
    const reading = applyReadPaperActions(nextState, requestedReads, {
      consumeMonthlyAction: false,
      allowSanOverdraw: false,
      writeLog: false,
      source: `${model.name} 自动阅读`,
    });
    nextState = reading.nextState;
    if (reading.appliedCount === 0) {
      readingDetails.push(`${model.name} 自动看论文未完成，SAN 不足`);
      continue;
    }
    const completion = reading.appliedCount < requestedReads
      ? `自动看论文 ${reading.appliedCount}/${requestedReads} 次`
      : `自动看论文 ${reading.appliedCount} 次`;
    const sanText = reading.totalSanCost === 0 ? "SAN +0" : `SAN -${reading.totalSanCost}`;
    readingDetails.push(`${model.name} ${completion}，${sanText}，下次想 idea +${reading.totalIdeaBonus}${reading.researchGain > 0 ? `，科研 +${reading.researchGain}` : ""}`);
  }

  return { nextState, polishDetails, readingDetails };
}
