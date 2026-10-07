import { afterEach, describe, expect, it, vi } from "vitest";
import { settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { getLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return ensureFellowPapers({
    ...base, year: 1, month: 4, totalMonths: 4, selectedAdvisorName: "测试导师",
    eventQueue: [], availableRandomEvents: [],
    player: { ...base.player, san: 20, money: 20, research: 10 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    fellowProgressState: [createCustomFellowProgressProfile({
      type: "senior", gender: "female", name: "林青", startTotalMonths: 1,
      academicYear: 2, research: 10, affinity: 1,
    })],
    papers: [createDraftPaper(1, 0, () => 0)],
  }, () => 0);
}

afterEach(() => vi.restoreAllMocks());

describe("fellow monthly salary records", () => {
  it("records actual rounded payments and their month separately from action summaries", () => {
    const state = makeState();
    state.advisorProgressState.awards = [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }];
    state.fellowProgressState[0] = { ...state.fellowProgressState[0]!, monthlyActivity: "上月活动" };
    const expected = getLabPayroll(state);
    const paid = settleLabPayroll(state);
    expect(paid.fellowProgressState[0]).toMatchObject({
      monthlySalaryPaid: 1.25, lastSalaryTotalMonths: 4, monthlyActivity: "上月活动",
    });
    expect(paid.advisorProgressState.funding).toBe(state.advisorProgressState.funding - expected.total);
    const advanced = advanceFellowResearch(paid, () => 0);
    expect(advanced.fellowProgressState[0]).toMatchObject({ monthlySalaryPaid: 1.25, lastSalaryTotalMonths: 4 });
    const following = settleLabPayroll({ ...advanced, month: 5, totalMonths: 5 });
    expect(following.fellowProgressState[0]).toMatchObject({ monthlySalaryPaid: 1.25, lastSalaryTotalMonths: 5 });
  });

  it.each(["pre-enrollment", "just-joined"] as const)("records zero for a %s fellow rather than retaining last month's payment", (kind) => {
    const state = makeState();
    state.fellowProgressState[0] = {
      ...state.fellowProgressState[0]!, monthlySalaryPaid: 3, lastSalaryTotalMonths: 3,
      ...(kind === "pre-enrollment" ? { academicYear: 0 } : { startTotalMonths: 4 }),
    };
    expect(settleLabPayroll(state).fellowProgressState[0]).toMatchObject({ monthlySalaryPaid: 0, lastSalaryTotalMonths: 4 });
  });

  it("retains salary records after the complete engine monthly pipeline", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = makeState();
    const advanced = dispatchAction(state, "next-month");
    expect(advanced).toMatchObject({ phase: "playing", totalMonths: 5 });
    expect(advanced.fellowProgressState[0]).toMatchObject({ monthlySalaryPaid: 1, lastSalaryTotalMonths: 5 });
    expect(advanced.fellowProgressState[0]!.monthlyActivity).toContain("协作进度");
  });
});

describe("fellow monthly review and support summaries", () => {
  it.each([false, true])("preserves review outcome and the following action for accepted=%s", (accepted) => {
    const state = makeState();
    const score = accepted ? 100 : 1;
    const paper = prepareConferenceSubmission({
      ...state.fellowPapers![0]!, createdTotalMonths: 1, idea: score, experiment: score, writing: score,
      collaborators: [{ id: "player", name: "你" }],
    }, "A", 1, 1);
    state.fellowPapers = [{ ...paper, reviewMonthsLeft: 1 }];
    state.fellowProgressState[0] = { ...state.fellowProgressState[0]!, pendingHelpToFellow: 10 };
    const next = advanceFellowResearch(state, () => 0);
    const profile = next.fellowProgressState[0]!;
    expect(profile.monthlyActivity).toContain(accepted ? "论文中稿（与你合作）" : "论文退稿");
    expect(profile.monthlyActivity).toContain("协作进度");
    expect(profile.monthlyActivity).toMatch(/(?:新稿|论文)(?:idea|实验|写作) \+/);
    expect(profile.monthlySupportActivity).toContain("获得你的帮助");
    expect(profile.lastSupportTotalMonths).toBe(4);
    if (accepted) expect(next.externalPublications).toEqual(expect.arrayContaining([expect.objectContaining({ id: paper.id, nonFirstAuthor: true })]));
    else expect(next.fellowPapers!.find((entry) => entry.id === paper.id)?.rejectionCount).toBe(1);
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
  });

  it("accumulates help in both directions and advisor guidance without replacing automatic activities", () => {
    const state = makeState();
    state.fellowProgressState[0] = {
      ...state.fellowProgressState[0]!, pendingHelpToPlayer: 7, pendingHelpToFellow: 8, pendingGuidanceFromAdvisor: 10,
      monthlyActivity: "协作进度 +1，论文实验 +4",
      monthlySupportActivity: "过期结算", lastSupportTotalMonths: 3,
    };
    state.fellowPapers = state.fellowPapers!.map((paper) => ({ ...paper, idea: 20, experiment: 10, writing: 0 }));
    const helped = settlePendingFellowHelp(state, () => 0);
    const settled = settleAdvisorGuidance(helped, () => 0);
    const profile = settled.fellowProgressState[0]!;
    expect(profile.monthlyActivity).toBe(state.fellowProgressState[0]!.monthlyActivity);
    expect(profile.monthlySupportActivity).not.toContain("过期结算");
    expect(profile.monthlySupportActivity).toContain("帮助你完善");
    expect(profile.monthlySupportActivity).toContain("idea +7");
    expect(profile.monthlySupportActivity).toContain("获得你的帮助");
    expect(profile.monthlySupportActivity).toContain("写作 +8");
    expect(profile.monthlySupportActivity).toContain("获得导师指导");
    expect(profile.monthlySupportActivity).toContain("写作 +10");
    expect(profile.lastSupportTotalMonths).toBe(4);
    expect(settled.papers[0]!.idea).toBe(state.papers[0]!.idea + 7);
    expect(settled.fellowPapers![0]!.writing).toBe(18);
    expect(settleAdvisorGuidance(settlePendingFellowHelp(settled, () => 0), () => 0)).toBe(settled);
    const following = settlePendingFellowHelp({
      ...settled, totalMonths: 5,
      fellowProgressState: [{ ...profile, pendingHelpToPlayer: 2 }],
    }, () => 0);
    expect(following.fellowProgressState[0]!.monthlySupportActivity).toContain("idea +2");
    expect(following.fellowProgressState[0]!.monthlySupportActivity).not.toContain("导师指导");
    expect(following.fellowProgressState[0]!.lastSupportTotalMonths).toBe(5);
  });

  it("does not report applied support while no eligible paper can receive it", () => {
    const state = makeState();
    state.papers = [];
    state.fellowPapers = state.fellowPapers!.map((paper) => ({ ...paper, status: "reviewing" }));
    state.fellowProgressState[0] = {
      ...state.fellowProgressState[0]!, pendingHelpToPlayer: 7, pendingHelpToFellow: 8, pendingGuidanceFromAdvisor: 10,
    };
    const next = settleAdvisorGuidance(settlePendingFellowHelp(state, () => 0), () => 0);
    expect(next).toBe(state);
    expect(next.fellowProgressState[0]!.monthlySupportActivity).toBeUndefined();
  });
});
