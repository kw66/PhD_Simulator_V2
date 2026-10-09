import { describe, expect, it } from "vitest";
import { advanceAdvisorProject } from "../src/core/v2-advisor-progress";
import { getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { calculateCareerProgress, CAREER_OPTIONS } from "../src/core/v2-career-rules";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { advanceFellowTask } from "../src/core/v2-fellow-actions";
import { applyFellowAiResearch } from "../src/core/v2-fellow-ai";
import { advanceFellowCooperation, settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { advanceSharedLabProject } from "../src/core/v2-lab-projects";
import { advanceLoverDate, createLoverProgressState, getLoverRouteGain, settlePendingLoverHelp } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation, generateResearchScore } from "../src/core/v2-research-operation";
import { calculateThesisProgressGain } from "../src/core/v2-thesis-rules";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const state = createStartedGameState("normal");
  const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", startTotalMonths: 1,
    research: 8.25, affinity: 1, identitySeed: "precision", name: "林青" });
  return { ...state, month: 2, totalMonths: 2, selectedAdvisorName: "导师",
    player: { ...state.player, research: 6.75 }, fellowProgressState: [fellow],
    papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 1, experiment: 1, writing: 1 }] };
}

describe("decimal research calculations", () => {
  it("rounds only after random scaling, multiplier and bonus, retaining the improvement floor", () => {
    expect(generateResearchScore(6.75, 0, 1.25, 0.5, () => 0.5)).toBe(13);
    expect(generateResearchScore(6.75, 20, 1.25, 0.5, () => 0.5)).toBe(21);
  });

  it.each(["idea", "experiment", "writing"] as const)("uses decimal player and fellow research for %s with AI effects", (field) => {
    const state = makeState();
    const model = getAiModelForTotalMonths(49, "gpt");
    state.buffs = [{ id: "precision", name: "precision", source: "test", timing: "permanent", remainingMonths: null,
      actionEffects: model.researchEffects }];
    const paper = state.papers[0]!;
    const playerResult = applyResearchOperation(state, paper.id, field, () => 0.5);
    const fellowResult = applyFellowAiResearch(paper, field, state.player.research, model, () => 0.5);
    expect(playerResult.papers[0]![field]).toBe(19);
    expect(fellowResult[field]).toBe(19);
    expect(playerResult.actionState.used).toBe(1);
    expect(playerResult.player.research).toBe(6.75);
  });

  it.each(["horizontal", "vertical"] as const)("floors the final player gain without prematurely completing a %s project", (type) => {
    const state = makeState();
    const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
    state.advisorProgressState[field] = 90.5;
    const next = advanceAdvisorProject(state, type, () => 0.5);
    expect(next.advisorProgressState[field]).toBe(99);
    expect(next.log.find((entry) => entry.text.startsWith("推进"))?.text).toMatch(/进度 \+9$/);
    expect(next.log.filter((entry) => entry.text.includes("项目完成："))).toHaveLength(0);
    expect(next.player.research).toBe(6.75);
    const repeated = advanceAdvisorProject(next, type, () => 0.5);
    expect(repeated.advisorProgressState[field]).toBe(99);
    expect(repeated.player.san).toBe(next.player.san);
  });

  it.each(["horizontal", "vertical"] as const)("completes a %s project with an integer remainder", (type) => {
    const state = makeState();
    const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
    state.advisorProgressState[field] = 91.5;
    const next = advanceAdvisorProject(state, type, () => 0.5);
    expect(next.advisorProgressState[field]).toBe(0);
    expect(next.log.filter((entry) => entry.text.includes("项目完成："))).toHaveLength(1);
    expect(next.player.research).toBe(6.75);
  });

  it.each(["horizontal", "vertical"] as const)("ignores subpoint gains and normalizes %s shared progress on a positive gain", (type) => {
    const state = makeState();
    const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
    state.advisorProgressState[field] = 99.25;
    const first = advanceSharedLabProject(state, type, 0.5, () => 0);
    expect(first).toMatchObject({ gain: 0, completed: 0 });
    expect(first.state).toBe(state);
    expect(first.state.advisorProgressState[field]).toBe(99.25);
    const second = advanceSharedLabProject(first.state, type, 1, () => 0);
    expect(second).toMatchObject({ gain: 1, completed: 1 });
    expect(second.state.advisorProgressState[field]).toBe(0);
  });

  it.each(["horizontal", "vertical"] as const)("floors the final fellow gain on its monthly %s project action", (type) => {
    const state = ensureFellowPapers(makeState(), () => 0.5);
    const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
    state.advisorProgressState.funding = type === "horizontal" ? 30 : 60;
    state.fellowProgressState[0]!.nextMonthlyAction = "project";
    const next = advanceFellowResearch(state, () => 0.5);
    expect(next.advisorProgressState[field]).toBe(11);
    expect(next.fellowProgressState[0]!.monthlyActivity).toMatch(new RegExp(`${type === "horizontal" ? "横向" : "纵向"}进度 \\+11(?![\\d.])`));
    expect(next.fellowProgressState[0]!.research).toBe(8.25);
    expect(advanceFellowResearch(next, () => 0.5)).toBe(next);
  });

  it("does not prematurely complete active cooperation after flooring its research-derived gain", () => {
    const state = makeState();
    state.papers = [];
    state.fellowProgressState[0]!.taskProgress = 90.5;
    const next = advanceFellowTask(state, state.fellowProgressState[0]!.id, () => 0.5);
    expect(next.fellowProgressState[0]).toMatchObject({ taskProgress: 99.5, taskUsedThisMonth: true });
    expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBeNull();
    expect(next.fellowProgressState[0]!.pendingHelpToFellow).toBeNull();
    expect(next.log.find((entry) => entry.text.startsWith("科研协作："))?.text).toMatch(/协作进度 \+9，/);
    expect(next.log.some((entry) => entry.text.startsWith("科研协作完成："))).toBe(false);
    expect(next.player.research).toBe(6.75);
    expect(advanceFellowTask(next, state.fellowProgressState[0]!.id, () => 0.5)).toBe(next);
  });

  it("floors active cooperation gain and snapshots both decimal helpers before final score rounding", () => {
    const state = makeState();
    state.papers = [];
    state.fellowProgressState[0]!.taskProgress = 91.5;
    const next = advanceFellowTask(state, state.fellowProgressState[0]!.id, () => 0.5);
    expect(next.fellowProgressState[0]).toMatchObject({ taskProgress: 0.5,
      pendingHelpToPlayer: 8.25, pendingHelpToFellow: 6.75 });
    const profile = next.fellowProgressState[0]!;
    const paper = makeState().papers[0]!;
    const settled = settlePendingFellowHelp({ ...next,
      player: { ...next.player, research: 18.5 },
      fellowProgressState: [{ ...profile, research: 19.5 }],
      papers: [paper], fellowPapers: [{ ...paper, id: "fellow-paper", leadAuthorId: profile.id }],
    }, () => 0.5);
    expect(getPaperScoreBreakdown(settled.papers[0]!, "experiment")).toEqual({ own: 1, collaboration: 8, total: 9 });
    expect(getPaperScoreBreakdown(settled.fellowPapers![0]!, "idea")).toEqual({ own: 1, collaboration: 6, total: 7 });
    expect(settled.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null });
    expect(settled.log.find((entry) => entry.text.startsWith("论文帮助：林青"))?.text).toContain("实验+8");
    expect(settlePendingFellowHelp(settled, () => 0.5)).toBe(settled);
  });

  it("preserves fractional automatic affinity cooperation independently of research-derived gains", () => {
    const state = ensureFellowPapers(makeState(), () => 0.5);
    state.fellowProgressState[0]!.affinity = 1.25;
    state.fellowProgressState[0]!.taskProgress = 98.5;
    state.fellowProgressState[0]!.nextMonthlyAction = "project";
    const next = advanceFellowResearch(state, () => 0.5);
    expect(next.fellowProgressState[0]!.taskProgress).toBe(99.75);
    expect(next.log.some((entry) => entry.text.startsWith("科研协作完成："))).toBe(false);
  });

  it("does not stack pending decimal help or leave zero-score help pending forever", () => {
    const profile = makeState().fellowProgressState[0]!;
    const first = advanceFellowCooperation(profile, 100, 6.75);
    const second = advanceFellowCooperation({ ...first, research: 19.5 }, 100, 18.5);
    expect(second).toMatchObject({ pendingHelpToPlayer: 8.25, pendingHelpToFellow: 6.75 });
    const state = makeState();
    state.fellowProgressState = [advanceFellowCooperation({ ...profile, research: 0.75 }, 100, 0.5)];
    const next = settlePendingFellowHelp(state, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null });
    expect(next.papers).toEqual(state.papers);
  });

  it.each([false, true])("clears both subpoint help snapshots without score loss when targets exist: %s", (hasTargets) => {
    for (const research of [0, 0.25, 0.75, 0.999]) {
      const state = makeState();
      const profile = state.fellowProgressState[0]!;
      const paper = state.papers[0]!;
      state.papers = hasTargets ? [paper] : [];
      state.fellowPapers = hasTargets ? [{ ...paper, id: "fellow-paper", leadAuthorId: profile.id }] : [];
      state.fellowProgressState = [advanceFellowCooperation({ ...profile, research }, 100, research)];
      const next = settlePendingFellowHelp(state, () => 0);
      expect(Math.floor(research)).toBe(0);
      expect(next.papers).toEqual(state.papers);
      expect(next.fellowPapers).toEqual(state.fellowPapers);
      expect(next.log).toEqual(state.log);
      expect(next.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null });
      expect(next.fellowProgressState[0]!.helpedPlayerCount).toBeUndefined();
      expect(next.fellowProgressState[0]!.helpedFellowCount).toBeUndefined();
      expect(settlePendingFellowHelp(next, () => 0)).toBe(next);
      const replenished = advanceFellowCooperation({ ...next.fellowProgressState[0]!, research: 1.25 }, 100, 1);
      expect(replenished).toMatchObject({ pendingHelpToPlayer: 1.25, pendingHelpToFellow: 1 });
      const waiting = settlePendingFellowHelp({ ...next, papers: [], fellowPapers: [], fellowProgressState: [replenished] }, () => 0);
      expect(waiting.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: 1.25, pendingHelpToFellow: 1 });
      const delivered = settlePendingFellowHelp({ ...waiting, papers: [paper],
        fellowPapers: [{ ...paper, id: "fellow-paper", leadAuthorId: profile.id }] }, () => 0);
      expect(delivered.papers[0]!.idea).toBe(paper.idea + 1);
      expect(delivered.fellowPapers![0]!.idea).toBe(paper.idea + 1);
      expect(delivered.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null,
        helpedPlayerCount: 1, helpedFellowCount: 1 });
    }
  });

  it("combines decimal player and lover research before rounding study progress and help scores", () => {
    const state = makeState();
    state.papers = [];
    state.loverState = activateLover("smart", 1, "male");
    state.loverProgressState = { ...createLoverProgressState("smart", () => 0), research: 9.5,
      routes: { play: { progress: 0, completed: 0 }, study: { progress: 92, completed: 0 }, shopping: { progress: 0, completed: 0 } } };
    expect(getLoverRouteGain(state, "study")).toBe(8);
    const next = advanceLoverDate(state, "study");
    expect(next.loverProgressState.routes!.study).toEqual({ progress: 0, completed: 1 });
    expect(next.loverProgressState.pendingPaperHelp?.amount).toBe(9.5);
    const settled = settlePendingLoverHelp({ ...next, papers: makeState().papers,
      loverProgressState: { ...next.loverProgressState, research: 19.5 } }, () => 0);
    expect(getPaperScoreBreakdown(settled.papers[0]!, "idea")).toEqual({ own: 1, collaboration: 9, total: 10 });
    expect(settled.loverProgressState.pendingPaperHelp).toBeNull();
    expect(settlePendingLoverHelp(settled, () => 0)).toBe(settled);
  });

  it("rounds thesis progress after adding the decimal research contribution", () => {
    expect(calculateThesisProgressGain(12, 3, 6.75)).toBe(20);
    expect(calculateThesisProgressGain(0, 3, 6.75)).toBe(0);
  });

  it("rounds career progress after adding weighted research and publication contributions", () => {
    expect(calculateCareerProgress("internet", CAREER_OPTIONS[2]!, {
      research: 8.25, social: 10, publishedPaperCount: 3, internshipCount: 0,
    })).toBe(44);
    expect(calculateCareerProgress("internet", CAREER_OPTIONS[0]!, {
      research: 8.25, social: 10, publishedPaperCount: 3, internshipCount: 0,
    })).toBe(0);
  });

  it("combines fractional research and social contributions before rounding career progress", () => {
    expect(calculateCareerProgress("internet", CAREER_OPTIONS[2]!, {
      research: 8.25, social: 12.5, publishedPaperCount: 0, internshipCount: 0,
    })).toBe(40);
  });
});
