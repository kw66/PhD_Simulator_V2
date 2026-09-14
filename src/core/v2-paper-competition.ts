import type { GameState, Paper } from "./v2-types";
import { setPaperTotalScore } from "./v2-paper-collaboration";

export const PAPER_COMPETITION_EVENT_IDS = [17, 18] as const;

export type PaperCompetitionEventId = typeof PAPER_COMPETITION_EVENT_IDS[number];

export interface PendingPaperCompetitionEvent {
  eventId: PaperCompetitionEventId;
  serial: number;
}

export interface PaperCompetitionResolution {
  paperId: string;
  field: "idea" | "experiment";
  multiplier: number;
  sanCost: number;
}

export interface PaperCompetitionPreview {
  applicable: boolean;
  resolvedOutcome: string;
  paper?: Paper;
  score?: number;
}

export function isPaperCompetitionEventId(eventId: number): eventId is PaperCompetitionEventId {
  return eventId === 17 || eventId === 18;
}

function isEligiblePaper(paper: Paper, field: PaperCompetitionResolution["field"]): boolean {
  return paper.nonFirstAuthor !== true
    && (paper.status === "draft" || paper.status === "reviewing")
    && Number.isFinite(paper[field])
    && paper[field] > 0;
}

export function getPaperCompetitionCandidates(state: GameState, eventId: PaperCompetitionEventId): Paper[] {
  if (!isPaperCompetitionEventId(eventId)) return [];
  const field = eventId === 17 ? "idea" : "experiment";
  return state.papers.filter((paper) => isEligiblePaper(paper, field));
}

function isValidResolution(resolution: PaperCompetitionResolution): boolean {
  return resolution !== null
    && typeof resolution === "object"
    && typeof resolution.paperId === "string"
    && resolution.paperId.length > 0
    && (resolution.field === "idea" || resolution.field === "experiment")
    && Number.isFinite(resolution.multiplier)
    && Number.isFinite(resolution.sanCost)
    && (
      (resolution.multiplier === 0.25 && resolution.sanCost === 0)
      || (resolution.multiplier === 0.5 && resolution.sanCost === 1)
      || (resolution.multiplier === 0.75 && resolution.sanCost === 3)
      || (resolution.multiplier === 1.25 && resolution.sanCost === 6)
    );
}

function getAdjustedScore(paper: Paper, resolution: PaperCompetitionResolution): number {
  return Math.max(1, Math.round(paper[resolution.field] * resolution.multiplier));
}

export function formatPaperCompetitionOutcome(paper: Paper, resolution: PaperCompetitionResolution): string {
  const fieldLabel = resolution.field === "idea" ? "idea" : "实验";
  const score = getAdjustedScore(paper, resolution);
  const sanOutcome = resolution.sanCost > 0 ? `SAN-${resolution.sanCost}｜` : "";
  return `${sanOutcome}${fieldLabel}×${resolution.multiplier}（${paper[resolution.field]}→${score}）`;
}

export function previewPaperCompetitionResolution(
  state: GameState,
  resolution: PaperCompetitionResolution,
): PaperCompetitionPreview {
  if (state.phase !== "playing" || !isValidResolution(resolution) || !Number.isFinite(state.player.san)) {
    return { applicable: false, resolvedOutcome: "本次不作处理" };
  }

  const currentPaper = state.papers.find((candidate) => candidate.id === resolution.paperId);
  if (!currentPaper || !isEligiblePaper(currentPaper, resolution.field)) {
    const paper = currentPaper ?? state.externalPublications.find((candidate) => candidate.id === resolution.paperId);
    return {
      applicable: false,
      paper,
      resolvedOutcome: !paper ? "目标论文已丢弃，本次不作处理"
        : paper.status === "published" ? "目标论文已录用，本次不受影响"
          : paper.status === "journal-reviewing" ? "目标论文已进入期刊修改，本次不受影响"
            : "目标论文已不符合条件，本次不作处理",
    };
  }

  const paper = currentPaper;
  const score = getAdjustedScore(paper, resolution);
  const san = state.player.san - resolution.sanCost;
  if (!Number.isFinite(score) || !Number.isFinite(san)) {
    return { applicable: false, paper, resolvedOutcome: "本次不作处理" };
  }

  return { applicable: true, paper, score, resolvedOutcome: formatPaperCompetitionOutcome(paper, resolution) };
}

export function applyPaperCompetitionResolution(
  state: GameState,
  resolution: PaperCompetitionResolution,
): { nextState: GameState; resolvedOutcome: string } {
  const preview = previewPaperCompetitionResolution(state, resolution);
  if (!preview.applicable || !preview.paper || preview.score === undefined) {
    return { nextState: state, resolvedOutcome: preview.resolvedOutcome };
  }
  const { paper, score } = preview;

  return {
    nextState: {
      ...state,
      player: resolution.sanCost === 0 ? state.player : { ...state.player, san: state.player.san - resolution.sanCost },
      papers: state.papers.map((candidate) => candidate === paper
        ? setPaperTotalScore(paper, resolution.field, score)
        : candidate),
    },
    resolvedOutcome: preview.resolvedOutcome,
  };
}
