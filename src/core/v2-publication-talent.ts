import { pushLog } from "./v2-engine-helpers";
import { clampResearchToCap } from "./v2-research-cap-system";
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

const ZERO_REWARD: PublicationTalentReward = { san: 0, favor: 0, social: 0, research: 0, researchCap: 0 };

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
  { id: "first-paper", icon: "📄", name: "首发论文", description: "一作发表任意论文", reward: reward(2, 1, 0, 1, 0), isComplete: (state) => firstAuthorPapers(state).length >= 1 },
  { id: "first-a-or-journal", icon: "🏅", name: "首发 A 或期刊", description: "一作发表 A 类会议或期刊论文", reward: reward(4, 1, 0, 1, 0), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => paper.target === "A" || journalId(paper) !== null) },
  { id: "first-a-best-paper", icon: "🏆", name: "首发 A Best Paper", description: "一作发表 A 类 Best Paper", reward: reward(8, 2, 0, 1, 1), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => paper.target === "A" && paper.publication?.acceptType === "Best Paper") },
  { id: "first-nmi", icon: "📚", name: "首发 NMI", description: "一作发表 NMI", reward: reward(6, 2, 0, 1, 1), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => journalId(paper) === "nmi") },
  { id: "first-nature", icon: "🌟", name: "首发 Nature", description: "一作发表 Nature", reward: reward(10, 4, 0, 2, 2), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => journalId(paper) === "nature") },
  { id: "first-highly-cited", icon: "🏆", name: "首篇高被引论文", description: "一作论文达到高被引标准", reward: reward(2, 1, 0, 0, 1), isComplete: (state) => hasFirstAuthorPaper(state, (paper) => paper.publication?.highlyCited === true) },
  { id: "citations-100", icon: "💬", name: "达到 100 引用", description: "累计引用达到 100", reward: reward(2, 0, 0, 1, 0), isComplete: (state) => state.totalCitations >= 100 },
  { id: "citations-1000", icon: "💬", name: "达到 1000 引用", description: "累计引用达到 1000", reward: reward(4, 0, 0, 1, 0), isComplete: (state) => state.totalCitations >= 1000 },
  { id: "citations-10000", icon: "💬", name: "达到 10000 引用", description: "累计引用达到 10000", reward: reward(8, 0, 0, 1, 1), isComplete: (state) => state.totalCitations >= 10000 },
  { id: "first-coauthor-paper", icon: "🤝", name: "首篇合作论文", description: "作为非一作参与发表任意论文", reward: reward(2, 0, 1, 0, 0), isComplete: (state) => hasCoauthorPaper(state, () => true) },
  { id: "first-coauthor-a", icon: "🤝", name: "首篇合作 A", description: "作为非一作参与发表 A 类论文", reward: reward(3, 0, 1, 0, 0), isComplete: (state) => hasCoauthorPaper(state, (paper) => paper.target === "A") },
  { id: "first-coauthor-a-best-paper", icon: "🏆", name: "首篇合作 A Best Paper", description: "作为非一作参与发表 A 类 Best Paper", reward: reward(4, 0, 2, 0, 0), isComplete: (state) => hasCoauthorPaper(state, (paper) => paper.target === "A" && paper.publication?.acceptType === "Best Paper") },
];

export function getPublicationTalentChecklist(state: GameState): PublicationTalentChecklistItem[] {
  return PUBLICATION_TALENT_DEFINITIONS.map((definition) => ({
    ...definition,
    completed: definition.isComplete(state),
  }));
}

export function applyPublicationTalentRewards(state: GameState): GameState {
  const claimed = new Set(state.publicationTalentState?.claimedIds ?? []);
  const newlyCompleted = getPublicationTalentChecklist(state).filter((item) => item.completed && !claimed.has(item.id));
  if (newlyCompleted.length === 0) return state;

  const total = newlyCompleted.reduce<PublicationTalentReward>((sum, item) => ({
    san: sum.san + item.reward.san,
    favor: sum.favor + item.reward.favor,
    social: sum.social + item.reward.social,
    research: sum.research + item.reward.research,
    researchCap: sum.researchCap + item.reward.researchCap,
  }), { ...ZERO_REWARD });
  const researchCapacityState = {
    ...state.researchCapacityState,
    otherCapBonus: state.researchCapacityState.otherCapBonus + total.researchCap,
  };
  const nextState: GameState = {
    ...state,
    publicationTalentState: {
      claimedIds: [...claimed, ...newlyCompleted.map((item) => item.id)],
    },
    researchCapacityState,
    player: {
      ...state.player,
      san: Math.min(state.sanCap, state.player.san + total.san),
      favor: Math.min(20, state.player.favor + total.favor),
      social: Math.min(20, state.player.social + total.social),
      research: clampResearchToCap(state.player.research + total.research, researchCapacityState),
    },
  };
  const rewardText = [
    total.san ? `SAN+${total.san}` : "",
    total.favor ? `好感+${total.favor}` : "",
    total.social ? `社交+${total.social}` : "",
    total.research ? `科研+${total.research}` : "",
    total.researchCap ? `科研上限+${total.researchCap}` : "",
  ].filter(Boolean).join("、");
  return pushLog(nextState, `发表天赋完成：${newlyCompleted.map((item) => item.name).join("、")}；${rewardText}`);
}
