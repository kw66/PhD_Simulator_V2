import { gameRandom } from "./v2-game-random";
import { usesCurrentGameplayRules, usesGameplayRulesFrom } from "./v2-rule-context";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { getCaptainAdvisorGuidanceBonus, getCaptainGuidanceMultiplier, isCaptain } from "./v2-captain-state";
import { addPaperCollaboration, getRoleCollaborationScore } from "./v2-paper-collaboration";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { getFellowName } from "./v2-fellow-progression";
import { recordFellowMonthlySupport } from "./v2-fellow-monthly-support";
import type { GameState, Paper, PaperActionType } from "./v2-types";

const GUIDANCE_AMOUNT = 10;
type GuidanceScores = Partial<Record<PaperActionType, number>>;

export function getAdvisorGuidanceScores(state: GameState, amount = GUIDANCE_AMOUNT + getCaptainAdvisorGuidanceBonus(state)): GuidanceScores {
  const writing = getRoleCollaborationScore(state, "advisor", amount);
  if (state.selectedRoleId !== "teacher-child" || !usesGameplayRulesFrom("20261023-r28")) return { writing };
  return {
    ...(getRoleTalentLevel(state, "mentor-insight") > 0 ? { idea: amount } : {}),
    ...(getRoleTalentLevel(state, usesGameplayRulesFrom("20261023-r38") ? "mentor-insight" : "mentor-insight-beta") > 0 ? { experiment: amount } : {}),
    writing,
  };
}

export function getAdvisorGuidanceSummary(state: GameState, amount?: number): string {
  const scores = getAdvisorGuidanceScores(state, amount);
  if (!scores.idea && !scores.experiment) return `论文写作协作+${scores.writing}`;
  const labels = { idea: "想idea", experiment: "做实验", writing: "写作" };
  return `论文协作：${(["idea", "experiment", "writing"] as const)
    .filter((field) => scores[field]).map((field) => `${labels[field]}+${scores[field]}`).join("、")}`;
}

function applyGuidance(
  papers: Paper[],
  advisorName: string,
  scores: GuidanceScores,
  random: () => number,
): Paper | undefined {
  const targets = papers.flatMap((paper) => {
    if (paper.nonFirstAuthor === true || (paper.status !== "draft" && paper.status !== "journal-reviewing")) return [];
    return paper.experiment > 0 || ((scores.idea || scores.experiment) && paper.status === "draft") ? [paper] : [];
  });
  if (targets.length === 0) return undefined;
  const target = targets[Math.floor(random() * targets.length)]!;
  const paper = addPaperCollaboration(target, {
    paperId: target.id,
    collaborator: { id: "advisor", name: advisorName },
    scores,
  });
  return paper === target ? undefined : paper;
}

export function queueAdvisorGuidance(state: GameState): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  // A captain's automatic projects can complete repeatedly before a writing
  // target exists. Preserve every award at its earned value, including the
  // receiving fellow's multiplier at that moment.
  const retain = (pending: number | null | undefined, amount: number): number => isCaptain(state) && usesCurrentGameplayRules()
    ? (pending ?? 0) + amount : pending ?? amount;
  const amount = GUIDANCE_AMOUNT + getCaptainAdvisorGuidanceBonus(state);
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      pendingGuidanceToPlayer: retain(state.advisorProgressState.pendingGuidanceToPlayer, amount),
    },
    fellowProgressState: state.fellowProgressState.map((profile) => ({
      ...profile,
      pendingGuidanceFromAdvisor: retain(profile.pendingGuidanceFromAdvisor, Math.floor(amount * getCaptainGuidanceMultiplier(state, profile))),
    })),
  };
}

export function settleAdvisorGuidance(state: GameState, random: () => number = gameRandom): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  let nextState = state;
  const pendingPlayerAmount = state.advisorProgressState.pendingGuidanceToPlayer;
  if (pendingPlayerAmount != null) {
    const paper = applyGuidance(nextState.papers, state.selectedAdvisorName, getAdvisorGuidanceScores(state, pendingPlayerAmount), random);
    if (paper) {
      nextState = {
        ...nextState,
        papers: nextState.papers.map((entry) => entry.id === paper.id ? paper : entry),
        advisorProgressState: { ...nextState.advisorProgressState, pendingGuidanceToPlayer: null },
      };
      nextState = pushMilestoneLog(nextState,
        `导师指导：你的《${paper.title}》，${getAdvisorGuidanceSummary(state, pendingPlayerAmount).replaceAll("+", " +")}`,
        "advisor-guidance-player");
    }
  }
  for (const profile of nextState.fellowProgressState) {
    if (profile.pendingGuidanceFromAdvisor == null) continue;
    const paper = applyGuidance(
      (nextState.fellowPapers ?? []).filter((entry) => entry.leadAuthorId === profile.id),
      state.selectedAdvisorName,
      { writing: profile.pendingGuidanceFromAdvisor },
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
