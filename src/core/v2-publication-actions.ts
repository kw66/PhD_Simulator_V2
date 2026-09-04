import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import {
  getPaperPromotionCost,
  getPaperPromotionMultiplierBonus,
} from "./v2-publication-rules";
import type { GameState, PaperPromotionId } from "./v2-types";

const PROMOTION_LABELS: Record<PaperPromotionId, string> = {
  arxiv: "挂 arXiv",
  github: "GitHub 开源",
  xiaohongshu: "小红书宣发",
};

function getPromotionFailure(state: GameState, paperId: string, promotionId: PaperPromotionId): string | null {
  const paper = state.papers.find((entry) => entry.id === paperId)
    ?? state.externalPublications.find((entry) => entry.id === paperId);
  if (!paper) return "没有找到这篇论文";
  if (paper.status !== "published" || !paper.publication) return "只有已发表论文可以推广";
  if (paper.nonFirstAuthor === true) return "非一作论文不能由你进行宣传";
  if (paper.publication.promotions?.[promotionId] === true) return "这项推广已经完成";
  if (
    promotionId === "arxiv"
    && (
      paper.target === null
      || paper.conferenceHandled === true
      || (paper.publication.monthsSincePublish ?? 0) >= 3
    )
  ) {
    return "论文已经公开，挂 arXiv 不再带来提前曝光";
  }
  const cost = getPaperPromotionCost(promotionId);
  return state.player.san >= cost ? null : `SAN 不足，需要 ${cost}`;
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

  const cost = getPaperPromotionCost(promotionId);
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
      [promotionId]: true,
    },
  };
  const updatedPaper = { ...paper, publication: nextPublication };
  const nextPapers = paperIndex >= 0 ? [...state.papers] : state.papers;
  const nextExternal = externalIndex >= 0 ? [...state.externalPublications] : state.externalPublications;
  if (paperIndex >= 0) nextPapers[paperIndex] = updatedPaper;
  if (externalIndex >= 0) nextExternal[externalIndex] = updatedPaper;

  const player = { ...state.player, san: state.player.san - cost };
  const result = promotionId === "github"
    ? `SAN -${cost}；当前分 +${Math.floor(paper.publication.effectiveScore * 0.25)}`
    : promotionId === "arxiv"
      ? `SAN -${cost}；提前公开`
      : `SAN -${cost}；引用倍率 +${Math.round(bonus * 100)}%`;
  return pushLog(
    { ...state, papers: nextPapers, externalPublications: nextExternal, player },
    `${PROMOTION_LABELS[promotionId]}：${paper.title}；${result}`,
  );
}
