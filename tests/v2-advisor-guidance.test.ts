import { describe, expect, it } from "vitest";
import { queueAdvisorGuidance, settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

function paper(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(2, 0, () => 0), id, idea: 10, experiment: 10, writing: 0, ...patch };
}

function state(): GameState {
  const base = createStartedGameState("normal");
  const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 8, affinity: 2, startTotalMonths: 1, name: "同学" });
  return {
    ...base,
    phase: "playing",
    selectedAdvisorName: "导师",
    totalMonths: 2,
    month: 2,
    year: 1,
    papers: [paper("player-paper")],
    fellowProgressState: [fellow],
    fellowPapers: [paper("fellow-paper", { leadAuthorId: fellow.id, leadAuthorName: fellow.name })],
  };
}

describe("advisor guidance", () => {
  it("adds 10 collaboration points to one actionable player field and fellow field", () => {
    const before = state();
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    expect(after.papers[0]).toMatchObject({ collaborationScores: { idea: 10 }, collaborators: [{ id: "advisor", name: "导师" }] });
    expect(after.fellowPapers?.[0]).toMatchObject({ collaborationScores: { idea: 10 }, collaborators: [{ id: "advisor", name: "导师" }] });
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(after.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBeNull();
    expect(settleAdvisorGuidance(after, () => 0)).toBe(after);
    expect(after.log).toEqual(before.log);
  });

  it("allows guidance on journal modification but keeps conference review frozen", () => {
    const journal = { ...paper("journal-paper"), status: "journal-reviewing" as const, journalTarget: "nature" as const };
    const conference = { ...paper("conference-paper"), status: "reviewing" as const, reviewMonthsLeft: 2 };
    const before = { ...state(), papers: [journal, conference] };
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    expect(after.papers[0]?.collaborationScores?.idea).toBe(10);
    expect(after.papers[1]?.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 0 });
  });

  it("stores one guidance opportunity when no actionable paper exists", () => {
    const before = { ...state(), papers: [], fellowPapers: [] };
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(after.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBe(10);
    const repeated = settleAdvisorGuidance(queueAdvisorGuidance(after), () => 0);
    expect(repeated.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(repeated.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBe(10);
    const later = settleAdvisorGuidance({ ...after, papers: [paper("new-paper")] }, () => 0);
    expect(later.papers[0]?.collaborationScores?.idea).toBe(10);
    expect(later.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
  });

  it("does not create guidance until a vertical project completion queues it", () => {
    const before = state();
    const idle = settleAdvisorGuidance(before, () => 0);
    expect(idle.papers[0]?.collaborationScores?.idea).toBe(0);
    const queued = queueAdvisorGuidance(before);
    expect(queued.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(settleAdvisorGuidance(queued, () => 0).papers[0]?.collaborationScores?.idea).toBe(10);
  });

  it("keeps fulfilled null opportunities consumed across repeated retries", () => {
    const before = state();
    before.advisorProgressState.pendingGuidanceToPlayer = null;
    before.fellowProgressState[0]!.pendingGuidanceFromAdvisor = null;
    expect(settleAdvisorGuidance(before, () => 0)).toBe(before);
    expect(before.papers[0]?.collaborationScores?.idea).toBe(0);
    expect(before.fellowPapers?.[0]?.collaborationScores?.idea).toBe(0);
  });
});
