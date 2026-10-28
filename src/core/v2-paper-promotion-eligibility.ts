import type { Paper, PaperPromotionId } from "./v2-types";

/** Channels offered for this paper, independent of the player's SAN or money.
 * Completed channels remain part of the list after their action closes a window. */
export function getApplicablePaperPromotions(paper: Paper): PaperPromotionId[] {
  if (paper.status !== "published" || !paper.publication || paper.nonFirstAuthor === true
    || (paper.leadAuthorId && paper.leadAuthorId !== "player")) return [];
  if (paper.journalTarget ?? paper.publication.journalTarget) return ["github", "xiaohongshu", "quantum"];
  const arxiv = paper.publication.promotions?.arxiv === true
    || (paper.target !== null && paper.conferenceHandled !== true
      && paper.publication.preprintExposed !== true && paper.publication.posterExposed !== true
      && (paper.publication.monthsSincePublish ?? 0) < 3);
  return [...(arxiv ? ["arxiv" as const] : []), "github", "xiaohongshu"];
}

export function hasCompletedApplicablePaperPromotions(paper: Paper): boolean {
  const applicable = getApplicablePaperPromotions(paper);
  return applicable.length > 0 && applicable.every(id => paper.publication?.promotions?.[id] === true);
}
