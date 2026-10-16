import { gameRandom } from "./v2-game-random";
import { getEffectiveResearch } from "./v2-effective-attributes";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { getFellowName } from "./v2-fellow-progression";
import { recordFellowMonthlySupport } from "./v2-fellow-monthly-support";
import { getCaptainCooperationMax, getCaptainFellowHelpQueue, isCaptain } from "./v2-captain-state";
import { addPaperCollaboration, getRoleCollaborationScore } from "./v2-paper-collaboration";
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
  const progress = profile.taskProgress + amount;
  const completed = Math.floor(progress / profile.taskMax);
  return {
    ...profile,
    taskProgress: progress % profile.taskMax,
    pendingHelpToPlayer: profile.pendingHelpToPlayer ?? (completed > 0 ? Math.max(0, profile.research) : null),
    pendingHelpToFellow: profile.pendingHelpToFellow ?? (completed > 0 ? Math.max(0, playerResearch) : null),
  };
}

export function advanceFellowCooperationWithLog(state: GameState, fellowId: string, amount: number, operationStartState: GameState = state): GameState {
  const original = state.fellowProgressState.find((fellow) => fellow.id === fellowId);
  if (!original) return state;
  // The stored taskMax is the displayed effective cap; always derive captain
  // discounts from the base cap, never subtract them again on the next advance.
  const taskMax = getCaptainCooperationMax(state, isCaptain(state) ? { ...original, taskMax: 100 } : original);
  const profile = original.taskMax === taskMax ? original : { ...original, taskMax };
  if (amount <= 0) return profile === original ? state : {
    ...state, fellowProgressState: state.fellowProgressState.map((fellow) => fellow.id === fellowId ? profile : fellow),
  };
  const playerResearch = getEffectiveResearch(state, operationStartState);
  let progressed = advanceFellowCooperation(profile, amount, playerResearch);
  let nextState = { ...state, fellowProgressState: state.fellowProgressState.map((fellow) => fellow.id === fellowId ? progressed : fellow) };
  const completed = Math.floor((profile.taskProgress + amount) / profile.taskMax);
  if (completed <= 0) return nextState;
  const name = getFellowName(profile);
  if (isCaptain(state)) {
    const pending = getCaptainFellowHelpQueue(state, profile);
    const queue = { player: [...pending.player, ...Array<number>(completed).fill(Math.max(0, profile.research))],
      fellow: [...pending.fellow, ...Array<number>(completed).fill(Math.max(0, playerResearch))] };
    progressed = { ...progressed, pendingHelpToPlayer: queue.player[0] ?? null, pendingHelpToFellow: queue.fellow[0] ?? null };
    nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === fellowId ? progressed : fellow),
      captainState: { ...state.captainState!, pendingFellowHelp: { ...state.captainState!.pendingFellowHelp, [fellowId]: queue } } };
    return pushMilestoneLog(nextState,
      `科研协作完成：${name}，协作进度满${profile.taskMax}${completed > 1 ? `（${completed}次）` : ""}；新增${completed}次双向论文帮助，分别保留待生效`,
      "fellow-cooperation");
  }
  const playerHelp = profile.pendingHelpToPlayer != null
    ? `已有${name}帮你的论文帮助待生效（${getRoleCollaborationScore(state, "fellow", profile.pendingHelpToPlayer)}分），不叠加`
    : `${name}帮你的论文帮助已就绪（${getRoleCollaborationScore(state, "fellow", progressed.pendingHelpToPlayer!)}分）`;
  const fellowHelp = profile.pendingHelpToFellow != null
    ? `已有你帮${name}的论文帮助待生效（${Math.floor(profile.pendingHelpToFellow)}分），不叠加`
    : `你帮${name}的论文帮助已就绪（${Math.floor(progressed.pendingHelpToFellow!)}分）`;
  return pushMilestoneLog(nextState,
    `科研协作完成：${name}，协作进度满${profile.taskMax}${completed > 1 ? `（${completed}次）` : ""}；${playerHelp}；${fellowHelp}`,
    "fellow-cooperation");
}

function settleFellowHelpPass(state: GameState, random: () => number): GameState {
  if (state.phase !== "playing") return state;
  let nextState = state;
  for (const original of state.fellowProgressState) {
    let profile = original;
    const pending = isCaptain(state) ? getCaptainFellowHelpQueue(state, profile) : undefined;
    let queue = pending;
    let consumedPlayer = false;
    let consumedFellow = false;
    if (profile.pendingHelpToPlayer != null) {
      const amount = getRoleCollaborationScore(state, "fellow", profile.pendingHelpToPlayer);
      const target = selectHelpTarget(getHelpTargets(nextState.papers), profile.type, random);
      if (target) {
        const paper = addPaperCollaboration(target.paper, {
          paperId: target.paper.id,
          collaborator: { id: profile.id, name: getFellowName(profile) },
          scores: { [target.field]: amount },
        });
        if (paper !== target.paper) {
          consumedPlayer = true;
          profile = { ...profile, pendingHelpToPlayer: null, helpedPlayerCount: (profile.helpedPlayerCount ?? 0) + 1 };
          profile = recordFellowMonthlySupport(profile, state.totalMonths,
            `帮助你完善《${paper.title}》：${SCORE_LABELS[target.field]} +${paper[target.field] - target.paper[target.field]}`);
          nextState = pushMilestoneLog({ ...nextState, papers: nextState.papers.map((entry) => entry.id === paper.id ? paper : entry) },
            `论文帮助：${getFellowName(profile)}帮你完善《${paper.title}》，${SCORE_LABELS[target.field]}+${paper[target.field] - target.paper[target.field]}`, "fellow-help");
        }
      }
      if (amount < 1) { profile = { ...profile, pendingHelpToPlayer: null }; consumedPlayer = true; }
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
          consumedFellow = true;
          profile = { ...profile, pendingHelpToFellow: null, helpedFellowCount: (profile.helpedFellowCount ?? 0) + 1 };
          profile = recordFellowMonthlySupport(profile, state.totalMonths,
            `获得你的帮助《${paper.title}》：${SCORE_LABELS[target.field]} +${paper[target.field] - target.paper[target.field]}`);
          nextState = pushMilestoneLog({ ...nextState, fellowPapers: nextState.fellowPapers?.map((entry) => entry.id === paper.id ? paper : entry) },
            `论文帮助：你帮${getFellowName(profile)}完善《${paper.title}》，${SCORE_LABELS[target.field]}+${paper[target.field] - target.paper[target.field]}`, "fellow-help");
        }
      }
      if (amount < 1) { profile = { ...profile, pendingHelpToFellow: null }; consumedFellow = true; }
    }
    if (queue && (consumedPlayer || consumedFellow)) {
      queue = { player: consumedPlayer ? queue.player.slice(1) : queue.player,
        fellow: consumedFellow ? queue.fellow.slice(1) : queue.fellow };
      profile = { ...profile, pendingHelpToPlayer: queue.player[0] ?? null, pendingHelpToFellow: queue.fellow[0] ?? null };
      nextState = { ...nextState, captainState: { ...nextState.captainState!,
        pendingFellowHelp: { ...nextState.captainState!.pendingFellowHelp, [profile.id]: queue } } };
    }
    if (profile !== original) {
      nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id ? profile : fellow) };
    }
  }
  return nextState;
}

export function settlePendingFellowHelp(state: GameState, random: () => number = gameRandom): GameState {
  let current = state;
  while (true) {
    const next = settleFellowHelpPass(current, random);
    if (next === current) return next;
    current = next;
  }
}
