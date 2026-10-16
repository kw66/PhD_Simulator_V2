import { gameRandom } from "./v2-game-random";
import { getCaptainAdvisorGuidanceBonus, getCaptainGuidanceMultiplier } from "./v2-captain-state";
import { addPaperCollaboration, getRoleCollaborationScore } from "./v2-paper-collaboration";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { getFellowName } from "./v2-fellow-progression";
import { recordFellowMonthlySupport } from "./v2-fellow-monthly-support";
import type { GameState, Paper } from "./v2-types";

const GUIDANCE_AMOUNT = 10;

function applyGuidance(
  papers: Paper[],
  advisorName: string,
  amount: number,
  random: () => number,
): Paper | undefined {
  const targets = papers.flatMap((paper) => {
    if (paper.nonFirstAuthor === true || (paper.status !== "draft" && paper.status !== "journal-reviewing")) return [];
    return paper.experiment > 0 ? [{ paper, field: "writing" as const }] : [];
  });
  if (targets.length === 0) return undefined;
  const target = targets[Math.floor(random() * targets.length)]!;
  const paper = addPaperCollaboration(target.paper, {
    paperId: target.paper.id,
    collaborator: { id: "advisor", name: advisorName },
    scores: { [target.field]: amount },
  });
  return paper === target.paper ? undefined : paper;
}

export function queueAdvisorGuidance(state: GameState): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      pendingGuidanceToPlayer: state.advisorProgressState.pendingGuidanceToPlayer ?? GUIDANCE_AMOUNT + getCaptainAdvisorGuidanceBonus(state),
    },
    fellowProgressState: state.fellowProgressState.map((profile) => ({
      ...profile,
      pendingGuidanceFromAdvisor: profile.pendingGuidanceFromAdvisor ?? Math.floor((GUIDANCE_AMOUNT + getCaptainAdvisorGuidanceBonus(state)) * getCaptainGuidanceMultiplier(state, profile)),
    })),
  };
}

export function settleAdvisorGuidance(state: GameState, random: () => number = gameRandom): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  let nextState = state;
  const pendingPlayerAmount = state.advisorProgressState.pendingGuidanceToPlayer;
  if (pendingPlayerAmount != null) {
    const playerAmount = getRoleCollaborationScore(state, "advisor", pendingPlayerAmount);
    const paper = applyGuidance(nextState.papers, state.selectedAdvisorName, playerAmount, random);
    if (paper) {
      nextState = {
        ...nextState,
        papers: nextState.papers.map((entry) => entry.id === paper.id ? paper : entry),
        advisorProgressState: { ...nextState.advisorProgressState, pendingGuidanceToPlayer: null },
      };
      nextState = pushMilestoneLog(nextState,
        `导师指导：你的《${paper.title}》，论文写作协作 +${playerAmount}`,
        "advisor-guidance-player");
    }
  }
  for (const profile of nextState.fellowProgressState) {
    if (profile.pendingGuidanceFromAdvisor == null) continue;
    const paper = applyGuidance(
      (nextState.fellowPapers ?? []).filter((entry) => entry.leadAuthorId === profile.id),
      state.selectedAdvisorName,
      profile.pendingGuidanceFromAdvisor,
      random,
    );
    if (!paper) continue;
    const previousWriting = nextState.fellowPapers?.find((entry) => entry.id === paper.id)?.writing ?? 0;
    nextState = {
      ...nextState,
      fellowPapers: nextState.fellowPapers?.map((entry) => entry.id === paper.id ? paper : entry),
      fellowProgressState: nextState.fellowProgressState.map((entry) => entry.id === profile.id
        ? recordFellowMonthlySupport({ ...entry, pendingGuidanceFromAdvisor: null }, state.totalMonths,
          `获得导师指导《${paper.title}》：写作 +${paper.writing - previousWriting}`) : entry),
    };
    nextState = pushMilestoneLog(nextState,
      `导师指导：${getFellowName(profile)}的《${paper.title}》，论文写作协作 +${profile.pendingGuidanceFromAdvisor}`,
      `advisor-guidance-${profile.id}`);
  }
  return nextState;
}

export function getAdvisorGuidanceAmount(state?: GameState): number {
  return state ? getRoleCollaborationScore(state, "advisor", GUIDANCE_AMOUNT + getCaptainAdvisorGuidanceBonus(state)) : GUIDANCE_AMOUNT;
}
