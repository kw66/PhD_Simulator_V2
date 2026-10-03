import { settleFellowCoauthoredPapers } from "./v2-lab-talent";
import { settlePublishedImageMisuse } from "./v2-academic-integrity";
import { getResearchCap } from "./v2-research-cap-system";
import { applyTierResist } from "./v2-sanity-rules";
import { describeResistedTalentReward, describeTalentReward, recordTalentTrigger } from "./v2-talent-history";
import type { GameState, Paper } from "./v2-types";

export interface PublicationTalentReward {
  san: number;
  favor: number;
  social: number;
  research: number;
  researchCap: number;
}

export interface PublicationTalentDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  reward: PublicationTalentReward;
  isComplete: (state: GameState) => boolean;
}

export interface PublicationTalentChecklistItem extends PublicationTalentDefinition {
  completed: boolean;
}

function publishedPapers(state: GameState): Paper[] {
  return [...state.papers, ...state.externalPublications].filter((paper) => paper.status === "published");
}

function firstAuthorPapers(state: GameState): Paper[] {
  return publishedPapers(state).filter((paper) => paper.nonFirstAuthor !== true);
}

function journalId(paper: Paper): string | null {
  return paper.journalTarget ?? paper.publication?.journalTarget ?? null;
}

function hasFirstAuthorPaper(state: GameState, predicate: (paper: Paper) => boolean): boolean {
  return firstAuthorPapers(state).some(predicate);
}

function hasCoauthorPaper(state: GameState, predicate: (paper: Paper) => boolean): boolean {
  return publishedPapers(state).some((paper) => paper.nonFirstAuthor === true && predicate(paper));
}

function reward(san: number, favor: number, social: number, research: number, researchCap: number): PublicationTalentReward {
  return { san, favor, social, research, researchCap };
}

export const PUBLICATION_TALENT_DEFINITIONS: readonly PublicationTalentDefinition[] = [
  { id: "first-paper", icon: "📄", name: "研究之始", description: "一作发表任意论文", reward: reward(2, 1, 0, 1, 0), isComplete: (state) => firstAuthorPapers(state).length >= 1 },
  { id: "first-a-or-journal", icon: "🏅", name: "初露锋芒", description: "一作发表 A 类会议或期刊论文", reward: reward(4, 1, 0, 1, 0), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => paper.target === "A" || journalId(paper) !== null) },
  { id: "first-a-best-paper", icon: "🏆", name: "最佳之作", description: "一作发表 A 类 Best Paper", reward: reward(8, 2, 0, 1, 1), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => paper.target === "A" && paper.publication?.acceptType === "Best Paper") },
  { id: "first-nmi", icon: "📚", name: "自然之子", description: "一作发表 NMI", reward: reward(6, 2, 0, 1, 1), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => journalId(paper) === "nmi") },
  { id: "first-nature", icon: "🌟", name: "自然之巅", description: "一作发表 Nature", reward: reward(10, 4, 0, 2, 2), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => journalId(paper) === "nature") },
  { id: "first-highly-cited", icon: "🏆", name: "同行瞩目", description: "一作论文达到高被引标准", reward: reward(2, 1, 0, 0, 1), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => paper.publication?.highlyCited === true) },
  { id: "citations-100", icon: "💬", name: "学术影响·Ⅰ", description: "累计引用达到 100", reward: reward(2, 0, 0, 1, 0), isComplete: (state) => state.totalCitations >= 100 },
  { id: "citations-1000", icon: "💬", name: "学术影响·Ⅱ", description: "累计引用达到 1000", reward: reward(4, 0, 0, 1, 0), isComplete: (state) => state.totalCitations >= 1000 },
  { id: "citations-10000", icon: "💬", name: "学术影响·Ⅲ", description: "累计引用达到 10000", reward: reward(8, 0, 0, 1, 1), isComplete: (state) => state.totalCitations >= 10000 },
  { id: "first-coauthor-paper", icon: "🤝", name: "携手启程", description: "作为非一作参与发表任意论文", reward: reward(2, 0, 1, 0, 0), isComplete: (state) => hasCoauthorPaper(state, () => true) },
  { id: "first-coauthor-a", icon: "🤝", name: "携手共进", description: "作为非一作参与发表 A 类论文", reward: reward(3, 0, 1, 0, 0), isComplete: (state) => hasCoauthorPaper(state, (paper) => paper.target === "A") },
  { id: "first-coauthor-a-best-paper", icon: "🏆", name: "携手登峰", description: "作为非一作参与发表 A 类 Best Paper", reward: reward(4, 0, 2, 0, 0), isComplete: (state) => hasCoauthorPaper(state, (paper) => paper.target === "A" && paper.publication?.acceptType === "Best Paper") },
  { id: "perseverance", icon: "🌱", name: "越挫越勇", description: "一作论文被拒至少3次后发表", reward: reward(4, 0, 0, 1, 0), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => (paper.rejectionCount ?? 0) >= 3) },
];

export function getPublicationTalentChecklist(state: GameState): PublicationTalentChecklistItem[] {
  return PUBLICATION_TALENT_DEFINITIONS.map((definition) => ({
    ...definition,
    completed: definition.isComplete(state),
  }));
}

/**
 * SAN is restored up to the SAN cap; favor, social and research are normal
 * increases, so each point goes through the tier resist against the value the
 * previous point left. Settling item by item in order is the same as resisting
 * the merged batch point by point. Research cap bonuses land first.
 */
export function applyPublicationTalentRewards(state: GameState, random: () => number = Math.random): GameState {
  state = settlePublishedImageMisuse(state);
  state = settleFellowCoauthoredPapers(state);
  const claimed = new Set(state.publicationTalentState?.claimedIds ?? []);
  const newlyCompleted = getPublicationTalentChecklist(state).filter((item) => item.completed && !claimed.has(item.id));
  if (newlyCompleted.length === 0) return state;

  const researchCapacityState = {
    ...state.researchCapacityState,
    otherCapBonus: state.researchCapacityState.otherCapBonus
      + newlyCompleted.reduce((sum, item) => sum + item.reward.researchCap, 0),
  };
  const maxima = { favor: 20, social: 20, research: getResearchCap(researchCapacityState) };
  const labels = { favor: "好感", social: "社交", research: "科研" };
  const player = { ...state.player };
  let researchCap = getResearchCap(state.researchCapacityState);
  const records = newlyCompleted.map((item) => {
    const effects: string[] = [];
    if (item.reward.san !== 0) {
      const before = player.san;
      player.san = Math.min(state.sanCap, before + item.reward.san);
      effects.push(describeTalentReward("SAN", item.reward.san, before, player.san));
    }
    for (const stat of ["favor", "social", "research"] as const) {
      if (item.reward[stat] === 0) continue;
      const before = player[stat];
      const result = applyTierResist(item.reward[stat], before, random, maxima[stat]);
      player[stat] = before + result.effectiveChange;
      effects.push(describeResistedTalentReward(labels[stat], before, result));
    }
    if (item.reward.researchCap !== 0) {
      const before = researchCap;
      researchCap += item.reward.researchCap;
      effects.push(describeTalentReward("科研上限", item.reward.researchCap, before, researchCap));
    }
    return { item, effects };
  });

  let recordedState: GameState = {
    ...state,
    publicationTalentState: {
      claimedIds: [...claimed, ...newlyCompleted.map((item) => item.id)],
    },
    researchCapacityState,
    player,
  };
  for (const { item, effects } of records) {
    recordedState = recordTalentTrigger(recordedState, `publication:${item.id}`, {
      name: item.name, recipient: state.playerName ? `你·${state.playerName}` : "你", reason: item.description, effects,
    });
  }
  return recordedState;
}
