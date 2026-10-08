import { getAiModelForTotalMonths, polishUnsubmittedPapers, type AiModelOffer } from "./v2-ai-shop";
import { creditFellowMoney, getFellowFinanceAccount, getFellowSpendableMoney } from "./v2-fellow-finance";
import { getLabExperimentMoneyCost } from "./v2-lab-compute";
import { roundMoney } from "./v2-money";
import { getPaperScoreBreakdown, setPaperOwnScore } from "./v2-paper-collaboration";
import { generateResearchScore } from "./v2-research-operation";
import type { GameState, Paper, PaperActionType } from "./v2-types";

const FELLOW_AI_SLOTS = ["doubao", "deepseek", "gpt", "claude"] as const;

export function applyFellowAiResearch(
  paper: Paper,
  field: PaperActionType,
  research: number,
  model: AiModelOffer | null,
  random: () => number,
): Paper {
  const effect = model?.slot === "claude" ? undefined : model?.researchEffects[field];
  const executions = Math.max(1, 1 + Math.floor(effect?.extraActions ?? 0));
  let score = getPaperScoreBreakdown(paper, field).own;
  for (let execution = 0; execution < executions; execution += 1) {
    score = generateResearchScore(research, score, effect?.multiplier ?? 1, effect?.bonus ?? 0, random);
  }
  return setPaperOwnScore(paper, field, score);
}

export function scoreFellowAiModel(paper: Paper, field: PaperActionType, research: number, model: AiModelOffer): number {
  const polished = model.slot === "claude" ? polishUnsubmittedPapers([paper], model).papers[0]! : paper;
  const simulated = applyFellowAiResearch(polished, field, research, model, () => 0.5);
  const baseline = applyFellowAiResearch(paper, field, research, null, () => 0.5);
  return simulated.idea + simulated.experiment + simulated.writing - baseline.idea - baseline.experiment - baseline.writing;
}

export function getFellowAiBudget(state: GameState, fellowId: string): number {
  return Math.max(0, roundMoney(getFellowSpendableMoney(state, fellowId)
    - getLabExperimentMoneyCost(state)));
}

export function subscribeFellowAi(
  state: GameState,
  fellowId: string,
  paperId: string,
  field: PaperActionType,
): { state: GameState; model: AiModelOffer | null; subscribed: boolean } {
  const profile = state.fellowProgressState.find((entry) => entry.id === fellowId);
  const paper = state.fellowPapers?.find((entry) => entry.id === paperId && entry.leadAuthorId === fellowId);
  if (state.phase !== "playing" || !profile || !paper
    || paper.status !== "draft"
    || profile.nextMonthlyAction === "project" || state.totalMonths <= profile.startTotalMonths) {
    return { state, model: null, subscribed: false };
  }
  const account = getFellowFinanceAccount(state, fellowId);
  if (account.aiSubscribedTotalMonths === state.totalMonths) {
    return { state, model: account.aiSlot ? getAiModelForTotalMonths(state.totalMonths, account.aiSlot) : null, subscribed: false };
  }
  const budget = getFellowAiBudget(state, fellowId);
  const offers = FELLOW_AI_SLOTS.map((slot) => getAiModelForTotalMonths(state.totalMonths, slot))
    .filter((model) => model.price <= budget)
    .map((model) => ({ model, score: scoreFellowAiModel(paper, field, profile.research, model) }))
    .sort((left, right) => right.score - left.score || left.model.price - right.model.price);
  const model = offers[0]!.model;
  const paid = creditFellowMoney(state, fellowId, -model.price);
  return {
    state: {
      ...paid,
      fellowFinanceAccounts: {
        ...paid.fellowFinanceAccounts,
        [fellowId]: { ...getFellowFinanceAccount(paid, fellowId), aiSlot: model.slot as typeof FELLOW_AI_SLOTS[number],
          aiSubscribedTotalMonths: state.totalMonths },
      },
      fellowPapers: model.slot === "claude"
        ? paid.fellowPapers?.map((entry) => entry.id === paperId ? polishUnsubmittedPapers([entry], model).papers[0]! : entry)
        : paid.fellowPapers,
    },
    model,
    subscribed: true,
  };
}
