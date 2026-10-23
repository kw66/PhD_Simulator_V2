import { describe, expect, it } from "vitest";
import { getAdvisorGuidanceSummary, queueAdvisorGuidance, settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

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
  it.each([
    [{ "mentor-insight": 1 }, { idea: 20, experiment: 20, writing: 10 }, { idea: 10, experiment: 10, writing: 10 }],
    [{ "mentor-insight-beta": 1 }, { idea: 10, experiment: 10, writing: 10 }, { idea: 0, experiment: 0, writing: 10 }],
    [{ "mentor-insight": 1, "mentor-insight-beta": 1 }, { idea: 20, experiment: 20, writing: 10 }, { idea: 10, experiment: 10, writing: 10 }],
    [{}, { idea: 10, experiment: 10, writing: 10 }, { idea: 0, experiment: 0, writing: 10 }],
  ])("extends player guidance by the selected fields without multiplying writing (%j)", (levels, scores, collaborationScores) => {
    const before = { ...state(), selectedRoleId: "teacher-child" as const, roleTalents: { levels } };
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    expect(after.papers[0]).toMatchObject({ ...scores, collaborationScores });
    expect(after.fellowPapers?.[0]).toMatchObject({ idea: 10, experiment: 10, writing: 10 });
    expect(after.papers[0]?.collaborators?.[0]).toMatchObject({
      id: "advisor", contributionScores: Object.fromEntries(Object.entries(collaborationScores).filter(([, value]) => value > 0)),
    });
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(settleAdvisorGuidance(after, () => 0)).toBe(after);
  });

  it.each(["mentor-insight"])("uses %s on a draft with no experiment and preserves fellow eligibility", (talent) => {
    const before = { ...state(), selectedRoleId: "teacher-child" as const, roleTalents: { levels: { [talent]: 1 } },
      papers: [paper("player-paper", { idea: 0, experiment: 0 })],
      fellowPapers: state().fellowPapers!.map((entry) => ({ ...entry, experiment: 0 })),
    };
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    expect(after.papers[0]).toMatchObject({ idea: 10, experiment: 10, writing: 10 });
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(after.fellowPapers).toEqual(before.fellowPapers);
    expect(after.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBe(10);
  });

  it("retains extended guidance through a missing target and consumes it once on one eligible paper", () => {
    const base = { ...state(), selectedRoleId: "teacher-child" as const, roleTalents: { levels: { "mentor-insight": 1, "mentor-insight-beta": 1 } }, papers: [] };
    const waiting = settleAdvisorGuidance(queueAdvisorGuidance(base), () => 0);
    const repeated = settleAdvisorGuidance(queueAdvisorGuidance(waiting), () => 0);
    expect(repeated.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    const excluded = [paper("nonfirst", { nonFirstAuthor: true }), paper("published", { status: "published" }), paper("conference", { status: "reviewing" })];
    const ready = settleAdvisorGuidance({ ...repeated, papers: [...excluded, paper("first", { experiment: 0 }), paper("second")] }, () => 0.999);
    expect(ready.papers.slice(0, 3)).toEqual(excluded);
    expect(ready.papers[3]?.writing).toBe(0);
    expect(ready.papers[4]).toMatchObject({ idea: 20, experiment: 20, writing: 10 });
    expect(settleAdvisorGuidance(ready, () => 0)).toBe(ready);
  });

  it("keeps the old writing multiplier in r27 replays and ignores extension talents for other roles", () => {
    const base = { ...state(), selectedRoleId: "teacher-child" as const, roleTalents: { levels: { "mentor-insight": 2, "mentor-insight-beta": 1 } } };
    const legacy = withGameplayRuleset("20261022-r27", () => settleAdvisorGuidance(queueAdvisorGuidance(base), () => 0));
    expect(legacy.papers[0]).toMatchObject({ idea: 10, experiment: 10, writing: 20 });
    const other = settleAdvisorGuidance(queueAdvisorGuidance({ ...base, selectedRoleId: "normal" }), () => 0);
    expect(other.papers[0]).toMatchObject({ idea: 10, experiment: 10, writing: 10 });
  });
  it("retains split guidance for r37 recordings", () => {
    const base = { ...state(), selectedRoleId: "teacher-child" as const, roleTalents: { levels: { "mentor-insight": 1 } } };
    const after = withGameplayRuleset("20261023-r37", () => settleAdvisorGuidance(queueAdvisorGuidance(base), () => 0));
    expect(after.papers[0]).toMatchObject({ idea: 20, experiment: 10, writing: 10 });
  });

  it("describes the same support fields in project rewards and guidance logs", () => {
    const base = { ...state(), selectedRoleId: "teacher-child" as const, roleTalents: { levels: { "mentor-insight": 1, "mentor-insight-beta": 1 } } };
    expect(getAdvisorGuidanceSummary(base)).toBe("论文协作：想idea+10、做实验+10、写作+10");
    const next = settleAdvisorGuidance(queueAdvisorGuidance(base), () => 0);
    expect(next.log.map((entry) => entry.text)).toContain(`导师指导：你的《${base.papers[0]!.title}》，论文协作：想idea +10、做实验 +10、写作 +10`);
    expect(withGameplayRuleset("20261022-r27", () => getAdvisorGuidanceSummary(base))).toBe("论文写作协作+15");
  });

  it("adds exactly 10 writing collaboration points to the player and fellow", () => {
    const before = state();
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    for (const guided of [...after.papers, ...after.fellowPapers!]) {
      expect(guided).toMatchObject({
        idea: 10, experiment: 10, writing: 10,
        collaborationScores: { idea: 0, experiment: 0, writing: 10 },
        collaborators: [{ id: "advisor", name: "导师", contributionScores: { writing: 10 } }],
      });
    }
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(after.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBeNull();
    expect(settleAdvisorGuidance(after, () => 0)).toBe(after);
    expect(after.log).toHaveLength(before.log.length + 2);
    expect(after.log.map((entry) => entry.text)).toEqual([
      `导师指导：同学的《${before.fellowPapers![0]!.title}》，论文写作协作 +10`,
      `导师指导：你的《${before.papers[0]!.title}》，论文写作协作 +10`,
    ]);
  });

  it.each([0, 0.999])("randomly selects one eligible paper independently for the player and every fellow (roll=%s)", (roll) => {
    const fellows = (["senior", "peer", "junior"] as const).map((type) => ({
      ...createCustomFellowProgressProfile({ type, gender: "female", research: 8, affinity: 2, startTotalMonths: 1, name: type }),
      id: `fellow-${type}`,
    }));
    const recipientPapers = (recipient: string) => [
      paper(`${recipient}-unready`, { experiment: 0 }),
      paper(`${recipient}-draft`),
      paper(`${recipient}-conference`, { status: "reviewing", reviewMonthsLeft: 2 }),
      paper(`${recipient}-journal`, { status: "journal-reviewing", journalTarget: "nature" }),
      paper(`${recipient}-coauthor`, { nonFirstAuthor: true }),
      paper(`${recipient}-published`, { status: "published" }),
    ];
    const before: GameState = {
      ...state(),
      papers: recipientPapers("player"),
      fellowProgressState: fellows,
      fellowPapers: fellows.flatMap((profile) => recipientPapers(profile.id).map((entry) => ({
        ...entry, leadAuthorId: profile.id, leadAuthorName: profile.name,
      }))),
    };
    const rolls = [roll, 0.999 - roll, roll, 0.999 - roll];
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => rolls.shift()!);
    const recipients = ["player", ...fellows.map((profile) => profile.id)];
    const selected = [roll, 0.999 - roll, roll, 0.999 - roll].map((value, index) =>
      `${recipients[index]}-${value === 0 ? "draft" : "journal"}`);
    const originalPapers = [...before.papers, ...before.fellowPapers!];
    for (const guided of [...after.papers, ...after.fellowPapers!]) {
      const original = originalPapers.find((entry) => entry.id === guided.id)!;
      expect(guided).toEqual(selected.includes(guided.id) ? {
        ...original,
        writing: original.writing + 10,
        collaborationScores: { idea: 0, experiment: 0, writing: 10 },
        collaborators: [{ id: "advisor", name: "导师", contributionScores: { writing: 10 } }],
      } : original);
    }
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(after.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([null, null, null]);
    expect(settleAdvisorGuidance(after, () => 0)).toBe(after);
  });

  it("allows guidance on journal modification but keeps conference review frozen", () => {
    const journal = { ...paper("journal-paper"), status: "journal-reviewing" as const, journalTarget: "nature" as const };
    const conference = { ...paper("conference-paper"), status: "reviewing" as const, reviewMonthsLeft: 2 };
    const before = { ...state(), papers: [journal, conference] };
    const after = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    expect(after.papers[0]?.collaborationScores?.writing).toBe(10);
    expect(after.papers[1]).toEqual(conference);
    expect(after.papers[0]).toMatchObject({ idea: 10, experiment: 10, writing: 10 });
  });

  it.each(["draft", "journal-reviewing"] as const)("holds one writing opportunity until a %s paper has positive experiment score", (status) => {
    const base = state();
    const before = {
      ...base,
      papers: base.papers.map((entry) => ({ ...entry, status, experiment: 0 })),
      fellowPapers: base.fellowPapers!.map((entry) => ({ ...entry, status, experiment: 0 })),
    };
    const waiting = settleAdvisorGuidance(queueAdvisorGuidance(before), () => 0);
    const repeated = settleAdvisorGuidance(queueAdvisorGuidance(waiting), () => 0);
    expect(repeated.papers).toEqual(before.papers);
    expect(repeated.fellowPapers).toEqual(before.fellowPapers);
    expect(repeated.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(repeated.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBe(10);
    const ready = settleAdvisorGuidance({
      ...repeated,
      papers: repeated.papers.map((entry) => ({ ...entry, experiment: 1 })),
      fellowPapers: repeated.fellowPapers!.map((entry) => ({ ...entry, experiment: 1 })),
    }, () => 0);
    for (const guided of [...ready.papers, ...ready.fellowPapers!]) {
      expect(guided).toMatchObject({ idea: 10, experiment: 1, writing: 10, collaborationScores: { idea: 0, experiment: 0, writing: 10 } });
    }
    expect(ready.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(ready.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBeNull();
    expect(settleAdvisorGuidance(ready, () => 0)).toBe(ready);
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
    expect(later.papers[0]?.collaborationScores?.writing).toBe(10);
    expect(later.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
  });

  it("does not create guidance until a vertical project completion queues it", () => {
    const before = state();
    const idle = settleAdvisorGuidance(before, () => 0);
    expect(idle.papers[0]?.collaborationScores?.writing).toBe(0);
    const queued = queueAdvisorGuidance(before);
    expect(queued.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(settleAdvisorGuidance(queued, () => 0).papers[0]?.collaborationScores?.writing).toBe(10);
  });

  it("keeps fulfilled null opportunities consumed across repeated retries", () => {
    const before = state();
    before.advisorProgressState.pendingGuidanceToPlayer = null;
    before.fellowProgressState[0]!.pendingGuidanceFromAdvisor = null;
    expect(settleAdvisorGuidance(before, () => 0)).toBe(before);
    expect(before.papers[0]?.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 0 });
    expect(before.fellowPapers?.[0]?.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 0 });
  });
});
