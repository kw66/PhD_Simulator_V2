import { pushMilestoneLog } from "./v2-engine-helpers";
import { getFellowName } from "./v2-fellow-progression";
import { addPaperCollaboration } from "./v2-paper-collaboration";
import type { FellowProgressProfile, GameState, Paper, PaperActionType } from "./v2-types";

const SCORE_FIELDS = ["idea", "experiment", "writing"] as const;
const SCORE_LABELS = { idea: "idea", experiment: "实验", writing: "写作" };

interface HelpTarget {
  paper: Paper;
  field: PaperActionType;
}

function getHelpTargets(papers: Paper[]): HelpTarget[] {
  return papers.flatMap((paper) => paper.nonFirstAuthor !== true
    && (paper.status === "draft" || paper.status === "journal-reviewing")
    ? SCORE_FIELDS.filter((field) => field === "idea"
      || (field === "experiment" ? paper.idea > 0 : paper.experiment > 0))
      .map((field) => ({ paper, field }))
    : []);
}

function selectHelpTarget(targets: HelpTarget[], type: FellowProgressProfile["type"], random: () => number): HelpTarget | undefined {
  const fixedField = type === "senior" ? "idea" : type === "junior" ? "experiment" : null;
  const candidates = fixedField ? targets.filter((target) => target.field === fixedField) : targets;
  return candidates.length > 0 ? candidates[Math.floor(random() * candidates.length)] : undefined;
}

export function advanceFellowCooperation(profile: FellowProgressProfile, amount: number, playerResearch: number): FellowProgressProfile {
  if (amount <= 0) return profile;
  const progress = profile.taskProgress + Math.floor(amount);
  const completed = Math.floor(progress / profile.taskMax);
  return {
    ...profile,
    taskProgress: progress % profile.taskMax,
    pendingHelpToPlayer: profile.pendingHelpToPlayer ?? (completed > 0 ? Math.max(0, Math.floor(profile.research)) : null),
    pendingHelpToFellow: profile.pendingHelpToFellow ?? (completed > 0 ? Math.max(0, Math.floor(playerResearch)) : null),
  };
}

export function advanceFellowCooperationWithLog(state: GameState, fellowId: string, amount: number): GameState {
  const profile = state.fellowProgressState.find((fellow) => fellow.id === fellowId);
  if (!profile || amount <= 0) return state;
  const progressed = advanceFellowCooperation(profile, amount, state.player.research);
  const nextState = { ...state, fellowProgressState: state.fellowProgressState.map((fellow) => fellow.id === fellowId ? progressed : fellow) };
  const completed = Math.floor((profile.taskProgress + Math.floor(amount)) / profile.taskMax);
  if (completed <= 0) return nextState;
  const name = getFellowName(profile);
  const playerHelp = profile.pendingHelpToPlayer != null
    ? `已有${name}帮你的论文帮助待生效（${profile.pendingHelpToPlayer}分），不叠加`
    : `${name}帮你的论文帮助已就绪（${progressed.pendingHelpToPlayer}分）`;
  const fellowHelp = profile.pendingHelpToFellow != null
    ? `已有你帮${name}的论文帮助待生效（${profile.pendingHelpToFellow}分），不叠加`
    : `你帮${name}的论文帮助已就绪（${progressed.pendingHelpToFellow}分）`;
  return pushMilestoneLog(nextState,
    `科研协作完成：${name}，协作进度满${profile.taskMax}${completed > 1 ? `（${completed}次）` : ""}；${playerHelp}；${fellowHelp}`,
    "fellow-cooperation");
}

function settleFellowHelpPass(state: GameState, random: () => number): GameState {
  if (state.phase !== "playing") return state;
  let nextState = state;
  for (const original of state.fellowProgressState) {
    let profile = original;
    if (profile.pendingHelpToPlayer != null) {
      const amount = profile.pendingHelpToPlayer;
      const target = selectHelpTarget(getHelpTargets(nextState.papers), profile.type, random);
      if (target) {
        const paper = addPaperCollaboration(target.paper, {
          paperId: target.paper.id,
          collaborator: { id: profile.id, name: getFellowName(profile) },
          scores: { [target.field]: amount },
        });
        if (paper !== target.paper) {
          profile = { ...profile, pendingHelpToPlayer: null, helpedPlayerCount: (profile.helpedPlayerCount ?? 0) + 1 };
          nextState = pushMilestoneLog({ ...nextState, papers: nextState.papers.map((entry) => entry.id === paper.id ? paper : entry) },
            `论文帮助：${getFellowName(profile)}帮你完善《${paper.title}》，${SCORE_LABELS[target.field]}+${amount}`, "fellow-help");
        }
      }
      if (amount === 0) profile = { ...profile, pendingHelpToPlayer: null };
    }
    if (profile.pendingHelpToFellow != null) {
      const amount = profile.pendingHelpToFellow;
      const targets = getHelpTargets((nextState.fellowPapers ?? []).filter((paper) => paper.leadAuthorId === profile.id));
      const target = targets.reduce<HelpTarget | undefined>((selected, candidate) => !selected
        || candidate.paper[candidate.field] < selected.paper[selected.field] ? candidate : selected, undefined);
      if (target) {
        const paper = addPaperCollaboration(target.paper, {
          paperId: target.paper.id,
          collaborator: { id: "player", name: nextState.playerName?.trim() || "你" },
          scores: { [target.field]: amount },
        });
        if (paper !== target.paper) {
          profile = { ...profile, pendingHelpToFellow: null, helpedFellowCount: (profile.helpedFellowCount ?? 0) + 1 };
          nextState = pushMilestoneLog({ ...nextState, fellowPapers: nextState.fellowPapers?.map((entry) => entry.id === paper.id ? paper : entry) },
            `论文帮助：你帮${getFellowName(profile)}完善《${paper.title}》，${SCORE_LABELS[target.field]}+${amount}`, "fellow-help");
        }
      }
      if (amount === 0) profile = { ...profile, pendingHelpToFellow: null };
    }
    if (profile !== original) {
      nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id ? profile : fellow) };
    }
  }
  return nextState;
}

export function settlePendingFellowHelp(state: GameState, random: () => number = Math.random): GameState {
  let current = state;
  while (true) {
    const next = settleFellowHelpPass(current, random);
    if (next === current) return next;
    current = next;
  }
}
