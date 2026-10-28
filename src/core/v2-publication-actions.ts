import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { recordPersonalSpending } from "./v2-money";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";
import {
  getPaperPromotionCost,
  getPaperPromotionMoneyCost,
  getPaperPromotionMultiplierBonus,
} from "./v2-publication-rules";
import type { GameState, PaperPromotionId } from "./v2-types";
import { getApplicablePaperPromotions } from "./v2-paper-promotion-eligibility";
import { usesGameplayRulesFrom } from "./v2-rule-context";

const PROMOTION_LABELS: Record<PaperPromotionId, string> = {
  arxiv: "挂 arXiv",
  github: "GitHub 开源",
  xiaohongshu: "小红书宣发",
  quantum: "量子位宣发",
};

function getPromotionFailure(state: GameState, paperId: string, promotionId: PaperPromotionId): string | null {
  const paper = state.papers.find((entry) => entry.id === paperId)
    ?? state.externalPublications.find((entry) => entry.id === paperId);
  if (!paper) return "没有找到这篇论文";
  if (paper.status !== "published" || !paper.publication) return "只有已发表论文可以推广";
  if (paper.nonFirstAuthor === true) return "非一作论文不能由你进行宣传";
  if (paper.publication.promotions?.[promotionId] === true) return "这项推广已经完成";
  if (usesGameplayRulesFrom("20261028-r59") && !getApplicablePaperPromotions(paper).includes(promotionId)) {
    return promotionId === "arxiv" ? "论文已经公开，挂 arXiv 不再带来提前曝光"
      : promotionId === "quantum" ? "量子位宣传仅适用于期刊论文" : "这项推广不适用于该论文";
  }
  if (promotionId === "quantum" && !paper.journalTarget && !paper.publication.journalTarget) return "量子位宣传仅适用于期刊论文";
  if (
    promotionId === "arxiv"
    && (
      paper.target === null
      || paper.conferenceHandled === true
      || paper.publication.preprintExposed === true
      || paper.publication.posterExposed === true
      || (paper.publication.monthsSincePublish ?? 0) >= 3
    )
  ) {
    return "论文已经公开，挂 arXiv 不再带来提前曝光";
  }
  const cost = getPaperPromotionCost(promotionId, state);
  const moneyCost = getPaperPromotionMoneyCost(promotionId);
  if (moneyCost > 0) return state.player.money >= moneyCost ? null : `金币不足，需要 ${moneyCost}`;
  return quoteSanPayment(state, cost).allowed ? null : `SAN 不足，需要 ${cost}`;
}

export function applyPaperPromotion(
  state: GameState,
  paperId: string,
  promotionId: PaperPromotionId,
): GameState {
  if (state.phase !== "playing") return state;
  const failure = getPromotionFailure(state, paperId, promotionId);
  if (failure) return pushNoOpLog(state, `${PROMOTION_LABELS[promotionId]}：${failure}`);

  const paperIndex = state.papers.findIndex((entry) => entry.id === paperId);
  const externalIndex = state.externalPublications.findIndex((entry) => entry.id === paperId);
  const source = paperIndex >= 0 ? state.papers : state.externalPublications;
  const index = paperIndex >= 0 ? paperIndex : externalIndex;
  const paper = source[index];
  if (!paper?.publication || index < 0) return state;

  const cost = getPaperPromotionCost(promotionId, state);
  const bonus = getPaperPromotionMultiplierBonus(promotionId);
  const nextPublication = {
    ...paper.publication,
    ...(promotionId === "arxiv" ? { preprintExposed: true } : {}),
    effectiveScore: promotionId === "github"
      ? paper.publication.effectiveScore + Math.floor(paper.publication.effectiveScore * 0.25)
      : paper.publication.effectiveScore,
    promotions: {
      arxiv: paper.publication.promotions?.arxiv ?? false,
      github: paper.publication.promotions?.github ?? false,
      xiaohongshu: paper.publication.promotions?.xiaohongshu ?? false,
      quantum: paper.publication.promotions?.quantum ?? false,
      [promotionId]: true,
    },
  };
  const updatedPaper = { ...paper, publication: nextPublication };
  const nextPapers = paperIndex >= 0 ? [...state.papers] : state.papers;
  const nextExternal = externalIndex >= 0 ? [...state.externalPublications] : state.externalPublications;
  if (paperIndex >= 0) nextPapers[paperIndex] = updatedPaper;
  if (externalIndex >= 0) nextExternal[externalIndex] = updatedPaper;

  const moneyCost = getPaperPromotionMoneyCost(promotionId);
  const payment = quoteSanPayment(state, cost);
  const paid = moneyCost > 0
    ? { ...state, player: { ...state.player, money: state.player.money - moneyCost } }
    : paySanCost(state, cost);
  const result = promotionId === "quantum"
    ? `金币 -${moneyCost}；引用倍率 +${Math.round(bonus * 100)}%`
    : promotionId === "github"
    ? `${formatSanPayment(payment)}；当前分 +${Math.floor(paper.publication.effectiveScore * 0.25)}`
    : promotionId === "arxiv"
      ? `${formatSanPayment(payment)}；提前公开`
    : `${formatSanPayment(payment)}；引用倍率 +${Math.round(bonus * 100)}%`;
  return pushLog(
    recordPersonalSpending({ ...paid, papers: nextPapers, externalPublications: nextExternal }, moneyCost),
    `${PROMOTION_LABELS[promotionId]}：${paper.title}；${result}`,
  );
}
