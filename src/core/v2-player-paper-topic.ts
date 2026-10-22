import { PAPER_TOPIC_CATALOG } from "./v2-paper-topics";
import { getAcceptedPaperScore } from "./v2-publication-rules";
import { getGuaranteedThesisScore, getThesisReviewThresholds } from "./v2-thesis-rules";
import type { GameState, Paper } from "./v2-types";

const selectableTopics = new Set(PAPER_TOPIC_CATALOG.map((topic) => topic.id));

/** Prefer the player's established direction, without carrying another paper's heat. */
export function getPreferredPaperTopicId(state: Pick<GameState, "degree" | "papers" | "externalPublications">): string | undefined {
  const papers = new Map<string, Paper>();
  for (const paper of [...state.papers, ...state.externalPublications]) {
    if (!paper.nonFirstAuthor && (!paper.leadAuthorId || paper.leadAuthorId === "player")
      && selectableTopics.has(paper.topicId) && !papers.has(paper.id)) {
      papers.set(paper.id, paper);
    }
  }
  const published = [...papers.values()].filter((paper) => paper.status === "published");
  const candidates = published.length > 0 ? published : [...papers.values()];
  const count = state.degree === "master" ? 2 : 3;
  const directions = new Map<string, number[]>();
  for (const paper of candidates) {
    const scores = directions.get(paper.topicId) ?? [];
    scores.push(published.length > 0 ? getAcceptedPaperScore(paper) : paper.idea + paper.experiment + paper.writing);
    directions.set(paper.topicId, scores);
  }
  const ranked = [...directions].map(([topicId, scores]) => ({
    topicId, scores: scores.sort((left, right) => right - left).slice(0, count),
  }));
  // Stable sorting leaves exact ties (including all-zero drafts) in creation order.
  const best = ranked.sort((left, right) => right.scores.reduce((sum, score) => sum + score, 0)
    - left.scores.reduce((sum, score) => sum + score, 0))[0];
  if (!best) return undefined;
  const supportScores = Array.from({ length: count }, (_, index) => best.scores[index] ?? 0);
  return getGuaranteedThesisScore(state.degree, supportScores) >= getThesisReviewThresholds(state.degree).A
    ? undefined : best.topicId;
}
