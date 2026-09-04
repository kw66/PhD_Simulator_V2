import type { GameState } from "./v2-types";

export function getPublishedPaperCount(state: GameState): number {
  return state.papers.filter((paper) => paper.status === "published" && paper.nonFirstAuthor !== true).length
    + state.externalPublications.filter((paper) => paper.status === "published" && paper.nonFirstAuthor !== true).length;
}
