import { describe, expect, it } from "vitest";
import { advanceAdvisorProject, createAdvisorProgressState, settleAdvisorMonth } from "../src/core/v2-advisor-progress";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState } from "../src/core/v2-types";

function state(overrides: Partial<GameState> = {}): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    phase: "playing",
    selectedAdvisorName: "导师",
    totalMonths: 2,
    month: 2,
    year: 1,
    player: { ...base.player, san: 100, money: 0, research: 20 },
    papers: [{ ...createDraftPaper(2, 0, () => 0), idea: 10, experiment: 0, writing: 0 }],
    advisorProgressState: createAdvisorProgressState(),
    ...overrides,
  };
}

describe("new advisor project economy", () => {
  it("starts with 20 accumulation and 10 funding without a cap", () => {
    expect(createAdvisorProgressState()).toMatchObject({ researchAccumulation: 20, funding: 10 });
  });

  it("settles the advisor project by 10 once per month", () => {
    const next = settleAdvisorMonth(state());
    expect(next.advisorProgressState).toMatchObject({ horizontalProgress: 10, nextProject: "vertical" });
    expect(settleAdvisorMonth(next).advisorProgressState.horizontalProgress).toBe(10);
  });

  it("pays horizontal rewards only when the 100-point project completes", () => {
    const before = state({ advisorProgressState: { ...createAdvisorProgressState(), horizontalProgress: 99 } });
    const next = advanceAdvisorProject(before, "horizontal", () => 0);
    expect(next.advisorProgressState.funding).toBe(30);
    expect(next.player.money).toBe(5);
    expect(next.advisorProgressState.horizontalProgress).toBe(19);
  });

  it("adds ten percent of current accumulation when vertical work completes", () => {
    const before = state({ advisorProgressState: { ...createAdvisorProgressState(), verticalProgress: 99, researchAccumulation: 20 } });
    const next = advanceAdvisorProject(before, "vertical", () => 0);
    expect(next.advisorProgressState.researchAccumulation).toBe(22);
    expect(next.advisorProgressState.verticalProgress).toBe(19);
    expect(next.player.money).toBe(0);
  });

  it("lets fellows start vertical projects once shared funding reaches 20", () => {
    const profile = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 10, affinity: 1, startTotalMonths: 1, name: "Test fellow" });
    const initial = state({ totalMonths: 1, month: 1, advisorProgressState: { ...createAdvisorProgressState(), funding: 20 }, fellowProgressState: [profile], fellowPapers: [] });
    const before = ensureFellowPapers(initial, () => 0);
    const researched = advanceFellowResearch({ ...before, totalMonths: 2, month: 2 }, () => 0);
    const after = advanceFellowResearch({ ...researched, totalMonths: 3, month: 3 }, () => 0);
    expect(after.advisorProgressState.verticalProgress).toBe(10);
    expect(after.fellowProgressState[0]?.monthlyActivity).toBe("纵向进度+10");
    expect(after.advisorProgressState.funding).toBe(20);
  });

  it("shares fellow project progress with the advisor card and guides only on vertical completion", () => {
    const profile = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 10, affinity: 1, startTotalMonths: 1, name: "Test fellow" });
    const initial = state({
      totalMonths: 1,
      month: 1,
      advisorProgressState: { ...createAdvisorProgressState(), verticalProgress: 99, funding: 20 },
      fellowProgressState: [profile],
      fellowPapers: [],
    });
    const before = ensureFellowPapers(initial, () => 0);
    const researched = advanceFellowResearch({ ...before, totalMonths: 2, month: 2 }, () => 0);
    const after = advanceFellowResearch({ ...researched, totalMonths: 3, month: 3 }, () => 0);
    expect(after.advisorProgressState.verticalProgress).toBe(9);
    expect(after.advisorProgressState.researchAccumulation).toBe(22);
    expect(after.fellowPapers?.[0]?.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 0 });
    expect(after.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBe(10);
    expect(after.fellowProgressState[0]?.monthlyActivity).toContain("完成并指导论文");
    const experimented = advanceFellowResearch({ ...after, totalMonths: 4, month: 4 }, () => 0);
    expect(experimented.fellowPapers?.[0]?.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 10 });
    expect(experimented.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBeNull();
  });

  it("charges shared funding when a fellow advances its experiment", () => {
    const profile = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 10, affinity: 1, startTotalMonths: 1, name: "Test fellow" });
    const initial = state({
      totalMonths: 5,
      month: 5,
      advisorProgressState: { ...createAdvisorProgressState(), funding: 10 },
      fellowProgressState: [profile],
      fellowPapers: [{ ...createDraftPaper(1, 0, () => 0), leadAuthorId: profile.id, idea: 10, experiment: 0, writing: 0 }],
    });
    const after = advanceFellowResearch(initial, () => 0);
    expect(after.fellowPapers?.[0]?.experiment).toBeGreaterThan(0);
    expect(after.advisorProgressState.funding).toBe(7);
    expect(after.fellowProgressState[0]?.monthlyActivity).toContain("实验+5（经费-3）");
  });

});
