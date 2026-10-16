import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCaptainRunState } from "../src/core/v2-captain-state";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { advanceFellowCooperationWithLog } from "../src/core/v2-fellow-cooperation";
import { settleFellowCoauthoredPapers, settleLabResearchGrowth } from "../src/core/v2-lab-talent";
import { createDraftPaper, decayUnpublishedPaper } from "../src/core/v2-paper-rules";
import type { CaptainTag } from "../src/core/v2-captain-state";
import type { GameState } from "../src/core/v2-types";

function captainState(tag: CaptainTag, level = 10): GameState {
  const base = createStartedGameState("research-captain");
  const fellow = { ...createCustomFellowProgressProfile({ type: "peer", gender: "female",
    research: 5, affinity: 2, startTotalMonths: 1, name: "林青", identitySeed: "captain-test" }), id: "fellow-test" };
  const captain = createCaptainRunState({ [tag]: level });
  return ensureFellowPapers({ ...base, totalMonths: 2, month: 2, year: 1, eventQueue: [], buffs: [],
    player: { ...base.player, research: 10 }, fellowProgressState: [fellow],
    captainState: { ...captain, tags: { [fellow.id]: tag }, initializedMembers: [fellow.id] },
    papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 1, experiment: 1, writing: 1 }],
  }, () => 0);
}

describe("captain fellow monthly integration", () => {
  it("runs a normal-tag extra action using the latest alternating action, and decays only once", () => {
    let state = captainState("normal");
    const paper = { ...state.fellowPapers![0]!, createdTotalMonths: 1, idea: 10 };
    state = { ...state, fellowPapers: [paper], fellowProgressState: [{ ...state.fellowProgressState[0]!, nextMonthlyAction: "project" }] };
    const next = advanceFellowResearch(state, () => 0);
    expect(next.fellowPapers![0]!.idea).toBe(decayUnpublishedPaper(paper).idea);
    expect(next.fellowPapers![0]!.experiment).toBeGreaterThan(0);
    expect(next.fellowProgressState[0]!.nextMonthlyAction).toBe("project");
    expect(next.fellowProgressState[0]!.monthlyActivity).toContain("横向进度");
    expect(next.fellowProgressState[0]!.monthlyActivity).toContain("论文实验");
    expect(next.fellowProgressState[0]!.taskProgress).toBe(2);
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
  });

  it("accumulates fractional ordinary actions across months without repeating the monthly lifecycle", () => {
    let state = captainState("normal", 5);
    state = advanceFellowResearch(state, () => 0);
    expect(state.fellowProgressState[0]!.nextMonthlyAction).toBe("project");
    state = advanceFellowResearch({ ...state, totalMonths: 3, month: 3 }, () => 0);
    expect(state.fellowProgressState[0]!.nextMonthlyAction).toBe("project");
    expect(state.fellowProgressState[0]!.taskProgress).toBe(4);
    expect(state.fellowProgressState[0]!.monthlyActivity!.match(/订阅/gu)).toHaveLength(1);
  });

  it("adds one chosen cooperation advance to long-term cooperation and delivers each completed help", () => {
    const base = captainState("chosen");
    const state = { ...base, fellowProgressState: [{ ...base.fellowProgressState[0]!,
      affinity: 90, longTermMentoring: true, nextMonthlyAction: "project" as const }] };
    const next = advanceFellowResearch(state, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ taskMax: 90, taskProgress: 0, helpedPlayerCount: 3, helpedFellowCount: 3 });
    expect(next.papers[0]!.collaborationScores?.idea).toBe(15);
    expect(next.fellowProgressState[0]!.monthlyActivity).toContain("推进3次");
    expect(next.fellowProgressState[0]!.monthlyActivity!.match(/横向进度/gu)).toHaveLength(1);
  });

  it("retains every pending help when no player paper exists and never subtracts task caps twice", () => {
    const base = captainState("chosen");
    let state: GameState = { ...base, papers: [], fellowProgressState: [{ ...base.fellowProgressState[0]!, affinity: 90, longTermMentoring: true }] };
    state = advanceFellowResearch(state, () => 0);
    expect(state.fellowProgressState[0]).toMatchObject({ taskMax: 90, pendingHelpToPlayer: 5 });
    expect(state.captainState!.pendingFellowHelp!["fellow-test"]!.player).toEqual([5, 5, 5]);
    state = advanceFellowCooperationWithLog(state, "fellow-test", 1);
    expect(state.fellowProgressState[0]!.taskMax).toBe(90);
    const idle = advanceFellowCooperationWithLog(base, "fellow-test", 0);
    expect(idle.fellowProgressState[0]!.taskMax).toBe(90);
  });

  it("uses extended genius research and social affinity caps for annual and publication rewards", () => {
    let researchState = captainState("genius", 3);
    researchState = { ...researchState, month: 12, totalMonths: 12,
      fellowProgressState: [{ ...researchState.fellowProgressState[0]!, research: 20 }] };
    expect(settleLabResearchGrowth(researchState).fellowProgressState[0]!.research).toBeGreaterThan(20);
    const base = captainState("social", 3);
    const fellow = { ...base.fellowProgressState[0]!, affinity: 20 };
    const paper = { ...base.papers[0]!, status: "published" as const, collaborators: [{ id: fellow.id, name: "林青" }] };
    const rewarded = settleFellowCoauthoredPapers({ ...base, fellowProgressState: [fellow], papers: [paper] });
    expect(rewarded.fellowProgressState[0]!.affinity).toBeCloseTo(20.4);
    const annual = settleLabResearchGrowth({ ...rewarded, month: 12, totalMonths: 12,
      player: { ...base.player, social: 12 } });
    expect(annual.fellowProgressState[0]!.affinity).toBeGreaterThan(20.4);
    expect(annual.fellowProgressState[0]!.affinity).toBeLessThanOrEqual(23);
  });
});
