import { clearDraftPaperProgress } from "./v2-engine-helpers";
import type { EventChoice, GameState } from "./v2-types";

export function applyPaperUpdates(state: GameState, choice: EventChoice): GameState["papers"] {
  const paperUpdateMap = new Map((choice.effects.paperUpdates ?? []).map((update) => [update.id, update] as const));
  return (choice.effects.clearDraftProgress === true ? clearDraftPaperProgress(state.papers) : state.papers).map((paper) => {
    const update = paperUpdateMap.get(paper.id);
    return update ? { ...paper, ...update } : paper;
  });
}
