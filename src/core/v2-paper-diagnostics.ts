import { getEffectiveResearch, getEffectiveSocial } from "./v2-effective-attributes";
import { getPlayerAttributeCap } from "./v2-player-attributes";
import { getPaperScoreBreakdown } from "./v2-paper-collaboration";
import type { GameState, Paper } from "./v2-types";

/** Small, capture-time evidence; no player names, paper titles or relationship names. */
export function captureResearchContext(state: GameState) {
  const groups = new Map<string, { count: number; ids: string[]; timing: string; remainingMonths: number | null;
    actionEffects?: import("./v2-types").TemporaryActionEffectUpdates;
    paperPolishEffects?: Partial<Record<"idea" | "experiment" | "writing", number>> }>();
  for (const buff of state.buffs) {
    if ((buff.remainingMonths !== null && buff.remainingMonths <= 0) || (!buff.actionEffects && !buff.paperPolishEffects)) continue;
    const effects = { timing: buff.timing, remainingMonths: buff.remainingMonths,
      actionEffects: buff.actionEffects, paperPolishEffects: buff.paperPolishEffects };
    const key = JSON.stringify(effects);
    const existing = groups.get(key);
    if (existing) { existing.count++; if (existing.ids.length < 3) existing.ids.push(buff.id); }
    else groups.set(key, { ...JSON.parse(key) as typeof effects, count: 1, ids: [buff.id] });
  }
  return {
    roleId: state.selectedRoleId,
    runKey: JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]),
    totalMonths: state.totalMonths,
    degree: state.degree,
    talents: { ...state.roleTalents?.levels },
    attributes: { ...state.player, effectiveResearch: getEffectiveResearch(state), effectiveSocial: getEffectiveSocial(state),
      researchCap: getPlayerAttributeCap(state, "research"), socialCap: getPlayerAttributeCap(state, "social"),
      favorCap: getPlayerAttributeCap(state, "favor"), sanCap: state.sanCap },
    buffs: [...groups.values()],
    equipment: { gpuLevel: state.shopState.gpuLevel, keyboardOwned: state.shopState.keyboardOwned, monitorOwned: state.shopState.monitorOwned },
    ai: Object.fromEntries(Object.entries(state.aiShopState.subscriptions).filter(([, slot]) => slot.active)
      .map(([id, slot]) => [id, slot.modelId])),
    internship: { active: state.internshipState.active, remainingMonths: state.internshipState.remainingMonths,
      multiplier: state.internshipState.experimentMultiplier, bonus: state.internshipState.experimentBonus ?? 0 },
  };
}

export function capturePaperDiagnostics(state: GameState, paper: Paper, submitted = false) {
  const scored = submitted ? { ...paper, idea: paper.submittedIdea ?? paper.idea,
    experiment: paper.submittedExperiment ?? paper.experiment, writing: paper.submittedWriting ?? paper.writing,
    collaborationScores: paper.submittedCollaborationScores ?? {} } : paper;
  return {
    version: 1,
    ...captureResearchContext(state),
    paperId: paper.id,
    createdTotalMonths: paper.createdTotalMonths ?? null,
    scorePhase: submitted ? "submission" : "publication",
    observationPhase: submitted ? "decision" : "publication",
    scores: { idea: getPaperScoreBreakdown(scored, "idea"), experiment: getPaperScoreBreakdown(scored, "experiment"), writing: getPaperScoreBreakdown(scored, "writing") },
    submission: paper.researchDiagnostics?.submission ?? null,
    lastOperations: paper.researchDiagnostics?.lastOperations ?? {},
  };
}

export type ResearchContext = ReturnType<typeof captureResearchContext>;
export interface PaperResearchDiagnostics {
  submission?: ResearchContext;
  lastOperations?: Partial<Record<"idea" | "experiment" | "writing", {
    context: ResearchContext;
    previousOwn: number;
    nextOwn: number;
    multiplier: number;
    bonus: number;
    executions: number;
  }>>;
}
