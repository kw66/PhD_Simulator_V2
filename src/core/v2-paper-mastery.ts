import { addOrReplaceBuffs } from "./v2-buffs";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import { recordTalentTrigger } from "./v2-talent-history";
import type { GameState, PaperActionType } from "./v2-types";

export const PAPER_MASTERY_BUFF_ID = "paper-mastery";
export const PAPER_MASTERY_ACTIONS = ["idea", "experiment", "writing"] as const;
export const PAPER_MASTERY_LABELS = { idea: "想idea", experiment: "做实验", writing: "写论文" } as const;

export interface PaperMasteryState {
  count: number;
  /** Local to this life; a paper moving between collections never earns twice. */
  rewardedPaperIds: string[];
}

export function getPaperMasteryCount(state: GameState): number {
  return Math.max(0, Math.floor(state.paperMasteryState?.count ?? 0));
}

export function getPaperMasteryBonuses(state: GameState): Record<PaperActionType, number> {
  const buff = state.buffs.find(item => item.id === PAPER_MASTERY_BUFF_ID);
  return {
    idea: buff?.actionEffects?.idea?.bonus ?? 0,
    experiment: buff?.actionEffects?.experiment?.bonus ?? 0,
    writing: buff?.actionEffects?.writing?.bonus ?? 0,
  };
}

/** Shared by conference/journal settlement and granted first-author publications.
 * Projection returns the same effects without appending a talent history entry. */
export function applyPaperMastery(state: GameState, record = true): GameState {
  if (state.phase === "setup" || !usesGameplayRulesFrom("20261018-r7")) return state;
  const rewarded = new Set(state.paperMasteryState?.rewardedPaperIds ?? []);
  const papers = [...new Map([...state.papers, ...state.externalPublications]
    .filter(paper => paper.status === "published" && paper.nonFirstAuthor !== true
      && (!paper.leadAuthorId || paper.leadAuthorId === "player"))
    .map(paper => [paper.id, paper])).values()]
    .filter(paper => !rewarded.has(paper.id))
    .sort((a, b) => (a.acceptedTotalMonths ?? 0) - (b.acceptedTotalMonths ?? 0)
      || (a.acceptedOrder ?? 0) - (b.acceptedOrder ?? 0));
  if (!papers.length) return state;
  let count = getPaperMasteryCount(state);
  const bonuses = getPaperMasteryBonuses(state);
  let next = state;
  for (const paper of papers) {
    const action = PAPER_MASTERY_ACTIONS[count % 3]!;
    count += 1;
    bonuses[action] += 1;
    rewarded.add(paper.id);
    if (record) next = recordTalentTrigger(next, `paper-mastery:${paper.id}`, {
      name: "论文熟手", recipient: state.playerName ? `你·${state.playerName}` : "你",
      reason: `一作发表《${paper.title}》，第${count}次论文积累`,
      effects: [`永久${PAPER_MASTERY_LABELS[action]} +1分（累计 +${bonuses[action]}分）`],
    });
  }
  return {
    ...next,
    paperMasteryState: { count, rewardedPaperIds: [...rewarded] },
    buffs: addOrReplaceBuffs(next.buffs, [{
      id: PAPER_MASTERY_BUFF_ID, name: "论文熟手", source: "论文熟手", timing: "permanent", remainingMonths: null,
      actionEffects: { idea: { bonus: bonuses.idea }, experiment: { bonus: bonuses.experiment }, writing: { bonus: bonuses.writing } },
      description: "每篇一作论文按想idea、做实验、写论文顺序循环获得永久 +1分。",
    }]),
  };
}
