import { pushLog } from "./v2-engine-helpers";
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
          profile = { ...profile, pendingHelpToPlayer: null };
          nextState = pushLog({ ...nextState, papers: nextState.papers.map((entry) => entry.id === paper.id ? paper : entry) },
            `论文帮助：${getFellowName(profile)}帮你完善《${paper.title}》，${SCORE_LABELS[target.field]}+${amount}`);
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
          profile = { ...profile, pendingHelpToFellow: null };
          nextState = pushLog({ ...nextState, fellowPapers: nextState.fellowPapers?.map((entry) => entry.id === paper.id ? paper : entry) },
            `论文帮助：你帮${getFellowName(profile)}完善《${paper.title}》，${SCORE_LABELS[target.field]}+${amount}`);
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
