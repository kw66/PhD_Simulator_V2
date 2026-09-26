import { addPaperCollaboration } from "./v2-paper-collaboration";
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
      pendingGuidanceToPlayer: state.advisorProgressState.pendingGuidanceToPlayer ?? GUIDANCE_AMOUNT,
    },
    fellowProgressState: state.fellowProgressState.map((profile) => ({
      ...profile,
      pendingGuidanceFromAdvisor: profile.pendingGuidanceFromAdvisor ?? GUIDANCE_AMOUNT,
    })),
  };
}

export function settleAdvisorGuidance(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  let nextState = state;
  const playerAmount = state.advisorProgressState.pendingGuidanceToPlayer;
  if (playerAmount != null) {
    const paper = applyGuidance(nextState.papers, state.selectedAdvisorName, playerAmount, random);
    if (paper) {
      nextState = {
        ...nextState,
        papers: nextState.papers.map((entry) => entry.id === paper.id ? paper : entry),
        advisorProgressState: { ...nextState.advisorProgressState, pendingGuidanceToPlayer: null },
      };
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
    nextState = {
      ...nextState,
      fellowPapers: nextState.fellowPapers?.map((entry) => entry.id === paper.id ? paper : entry),
      fellowProgressState: nextState.fellowProgressState.map((entry) => entry.id === profile.id
        ? { ...entry, pendingGuidanceFromAdvisor: null } : entry),
    };
  }
  return nextState;
}

export function getAdvisorGuidanceAmount(): number {
  return GUIDANCE_AMOUNT;
}
