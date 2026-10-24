import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCaptainRunState } from "../src/core/v2-captain-state";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers, getFellowCurrentPaper } from "../src/core/v2-fellow-research";
import { subscribeFellowAi } from "../src/core/v2-fellow-ai";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { withGameRandom } from "../src/core/v2-game-random";
import { settleFellowCoauthoredPapers } from "../src/core/v2-lab-talent";
import type { FellowProgressProfile, GameState, Paper } from "../src/core/v2-types";

const zero = () => 0;
function fellow(id: string, patch: Partial<FellowProgressProfile> = {}): FellowProgressProfile {
  return { ...createCustomFellowProgressProfile({ type: "peer", gender: "female", name: id,
    research: 10, affinity: 0, startTotalMonths: 1, identitySeed: id }), id, ...patch };
}
function fixture(others = [fellow("target", { research: 0, nextMonthlyAction: "project" })]): GameState {
  const base = createStartedGameState("normal");
  const profiles = [fellow("helper"), ...others];
  const start = ensureFellowPapers({ ...base, totalMonths: 1, month: 1, year: 1, eventQueue: [], buffs: [],
    selectedAdvisorName: "Advisor", papers: [], fellowProgressState: profiles,
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
  }, zero);
  const own = getFellowCurrentPaper(start, "helper")!;
  return { ...start, totalMonths: 2, month: 2,
    fellowProgressState: profiles,
    fellowPapers: start.fellowPapers!.map(paper => paper.id === own.id
      ? { ...prepareConferenceSubmission({ ...paper, idea: 100, experiment: 100, writing: 100 }, "A", 1, 1), reviewMonthsLeft: 8 }
      : { ...paper, prepublicationDecayRate: 0 }),
  };
}
const profile = (state: GameState, id = "helper") => state.fellowProgressState.find(entry => entry.id === id)!;
const paper = (state: GameState, id = "helper") => getFellowCurrentPaper(state, id)!;
const updatePaper = (state: GameState, id: string, patch: Partial<Paper>): GameState => ({ ...state,
  fellowPapers: state.fellowPapers!.map(entry => entry.leadAuthorId === id ? { ...entry, ...patch } : entry) });
const nextMonth = (state: GameState) => advanceFellowResearch({ ...state, ...getCalendarForTotalMonths(state.totalMonths + 1), totalMonths: state.totalMonths + 1 }, zero);
afterEach(() => vi.restoreAllMocks());

describe("r50 fellow paper months during review", () => {
  it("alternates peer help and projects throughout review without granting player credit", () => {
    const initial = fixture();
    const first = advanceFellowResearch(initial, zero);
    const helped = paper(first, "target");
    expect(helped.idea).toBeGreaterThan(0);
    expect(helped.collaborators).toEqual([{ id: "helper", name: "helper", contributionScores: { idea: helped.idea } }]);
    expect(getPaperScoreBreakdown(helped, "idea")).toEqual({ own: 0, collaboration: helped.idea, total: helped.idea });
    expect(profile(first).nextMonthlyAction).toBe("project");
    expect(profile(first).monthlyActivity).toContain("帮助target完善");
    expect(profile(first, "target").monthlyActivity).toContain("helper帮助完善");
    expect(first.player).toEqual(initial.player);
    expect(first.papers).toEqual(initial.papers);
    expect(first.externalPublications).toEqual(initial.externalPublications);
    expect(first.totalResearchScore).toBe(initial.totalResearchScore);
    expect(first.fellowProgressState.map(entry => entry.affinity)).toEqual([0, 0]);
    expect(first.advisorProgressState.verticalProgress).toBe(0);
    const second = nextMonth(first);
    expect(profile(second).nextMonthlyAction).toBe("research");
    expect(profile(second).monthlyActivity).toContain("纵向进度");
    expect(profile(second).monthlyActivity).not.toContain("帮助target");
    const third = nextMonth(second);
    expect(profile(third).nextMonthlyAction).toBe("project");
    expect(profile(third).monthlyActivity).toContain("帮助target完善");
    expect(paper(third).reviewMonthsLeft).toBe(5);
    expect(advanceFellowResearch(third, () => { throw Error("duplicate random"); })).toBe(third);
  });

  it.each([0, 0.999])("chooses one random other fellow for roll %s", roll => {
    const initial = fixture([fellow("alpha", { research: 0, nextMonthlyAction: "project" }), fellow("beta", { research: 0, nextMonthlyAction: "project" })]);
    const next = advanceFellowResearch(initial, () => roll);
    const chosen = roll === 0 ? "alpha" : "beta";
    const other = roll === 0 ? "beta" : "alpha";
    expect(paper(next, chosen).collaborators?.some(entry => entry.id === "helper")).toBe(true);
    expect(paper(next, other).collaborators).toEqual([]);
    expect(paper(next).collaborators).toEqual([]);
  });

  it("does not substitute a project when no other draft is available", () => {
    const initial = fixture([]);
    const first = advanceFellowResearch(initial, zero);
    expect(profile(first).nextMonthlyAction).toBe("project");
    expect(profile(first).monthlyActivity).toContain("暂无可帮助");
    expect(first.advisorProgressState).toEqual(initial.advisorProgressState);
    expect(first.fellowFinanceAccounts).toEqual(initial.fellowFinanceAccounts);
    const second = nextMonth(first);
    expect(profile(second).monthlyActivity).toContain("纵向进度");
    expect(profile(second).nextMonthlyAction).toBe("research");
  });

  it("excludes absent fellows, reviewing papers, and the player's papers", () => {
    const initial = fixture();
    const unavailable = updatePaper(initial, "target", { status: "reviewing", reviewMonthsLeft: 8 });
    unavailable.fellowPapers!.push({ ...createDraftPaper(1, 0, zero), id: "departed-draft", leadAuthorId: "departed", createdTotalMonths: 1 });
    unavailable.papers = [createDraftPaper(1, 0, zero)];
    const next = advanceFellowResearch(unavailable, zero);
    expect(profile(next).monthlyActivity).toContain("暂无可帮助");
    expect(next.papers).toEqual(unavailable.papers);
    expect(next.fellowPapers!.find(entry => entry.id === "departed-draft")!.collaborators).toEqual([]);
  });

  it("preserves a pending project across fresh-draft creation and acceptance", () => {
    let initial = fixture([]);
    initial.fellowProgressState = [{ ...profile(initial), nextMonthlyAction: "project" }];
    expect(profile(ensureFellowPapers({ ...initial, fellowPapers: [] }, zero)).nextMonthlyAction).toBe("project");
    initial = updatePaper(initial, "helper", { reviewMonthsLeft: 1 });
    const next = advanceFellowResearch(initial, () => 0.99);
    expect(next.fellowPapers!.some(entry => entry.status === "published")).toBe(true);
    expect(paper(next).status).toBe("draft");
    expect(paper(next).idea).toBe(0);
    expect(profile(next).nextMonthlyAction).toBe("research");
    expect(profile(next).monthlyActivity).toContain("纵向进度");
    expect(paper(nextMonth(next)).idea).toBeGreaterThan(0);
  });

  it("retains the project month after rejection and resumes research next month", () => {
    let initial = fixture([]);
    initial.fellowProgressState = [{ ...profile(initial), nextMonthlyAction: "project" }];
    initial = updatePaper(initial, "helper", { idea: 1, experiment: 1, writing: 1, submittedIdea: 1, submittedExperiment: 1, submittedWriting: 1, reviewMonthsLeft: 1 });
    const next = advanceFellowResearch(initial, zero);
    expect(paper(next)).toMatchObject({ status: "draft", rejectionCount: 1 });
    expect(profile(next).nextMonthlyAction).toBe("research");
    expect(profile(next).monthlyActivity).toContain("论文退稿");
    expect(profile(next).monthlyActivity).toContain("纵向进度");
    expect(profile(next).monthlyActivity).not.toMatch(/论文(?:idea|实验|写作) \+/);
    const resumed = nextMonth(next);
    expect(profile(resumed).nextMonthlyAction).toBe("project");
    expect(profile(resumed).monthlyActivity).toMatch(/论文(?:idea|实验|写作) \+/);
  });

  it("charges the helper's experiment costs and does not spend target or player money", () => {
    let initial = updatePaper(fixture(), "target", { idea: 8, experiment: 0 });
    initial.advisorProgressState.funding = 1;
    initial.fellowFinanceAccounts = { helper: { name: "helper", money: 4 }, target: { name: "target", money: 100 } };
    const next = advanceFellowResearch(initial, zero);
    expect(paper(next, "target").collaborators?.[0]?.contributionScores?.experiment).toBeGreaterThan(0);
    expect(next.fellowFinanceAccounts!.helper!.money).toBe(2);
    expect(next.fellowFinanceAccounts!.target!.money).toBe(100);
    expect(next.advisorProgressState.funding).toBe(0);
    expect(next.player.money).toBe(initial.player.money);
    expect(profile(next).monthlyActivity).toContain("经费 -1，自费 -2");
  });

  it("does not perform unpaid experiments or convert failed help to a project", () => {
    const initial = updatePaper(fixture(), "target", { idea: 8, experiment: 0 });
    initial.advisorProgressState.funding = 0;
    const next = advanceFellowResearch(initial, zero);
    expect(paper(next, "target").experiment).toBe(0);
    expect(paper(next, "target").collaborators).toEqual([]);
    expect(profile(next).nextMonthlyAction).toBe("project");
    expect(profile(next).monthlyActivity).toContain("实验经费不足");
    expect(profile(next).monthlyActivity).not.toContain("横向进度");
    expect(next.advisorProgressState.horizontalProgress).toBe(0);
  });

  it("attributes helper-funded Claude polishing once without buying for the recipient", () => {
    const initial = updatePaper(fixture(), "target", { idea: 100, experiment: 100, writing: 100 });
    initial.totalMonths = 16;
    initial.fellowFinanceAccounts = { helper: { name: "helper", money: 20 }, target: { name: "target", money: 20 } };
    const target = paper(initial, "target");
    const subscribed = subscribeFellowAi(initial, "helper", target.id, "writing", true);
    expect(subscribed.model?.slot).toBe("claude");
    expect(subscribed.state.fellowFinanceAccounts!.helper!.money).toBe(18);
    expect(subscribed.state.fellowFinanceAccounts!.target).toEqual(initial.fellowFinanceAccounts.target);
    expect(paper(subscribed.state, "target").collaborators).toEqual([{ id: "helper", name: "helper", contributionScores: { idea: 2, experiment: 2 } }]);
    expect(getPaperScoreBreakdown(paper(subscribed.state, "target"), "idea")).toEqual({ own: 100, collaboration: 2, total: 102 });
    const repeated = subscribeFellowAi(subscribed.state, "helper", target.id, "idea", true);
    expect(repeated.state).toBe(subscribed.state);
    expect(repeated.subscribed).toBe(false);
    expect(subscribeFellowAi({ ...initial, fellowProgressState: initial.fellowProgressState.map(entry => entry.id === "helper" ? { ...entry, nextMonthlyAction: "project" } : entry) }, "helper", target.id, "writing", true).subscribed).toBe(false);
  });

  it("preserves captain extra actions and the project apprenticeship exception", () => {
    const initial = fixture();
    const captain = createCaptainRunState({ normal: 10 });
    const withCaptain: GameState = { ...initial, selectedRoleId: "research-captain", captainState: { ...captain,
      tags: { helper: "normal" }, initializedMembers: ["helper"] } };
    const twice = advanceFellowResearch(withCaptain, zero);
    expect(profile(twice).monthlyActivity).toContain("帮助target完善");
    expect(profile(twice).monthlyActivity).toContain("纵向进度");
    expect(profile(twice).nextMonthlyAction).toBe("research");
    const apprentice: GameState = { ...initial, selectedRoleId: "teacher-child", roleTalents: { levels: { "project-apprenticeship": 1 } } };
    const projected = advanceFellowResearch(apprentice, zero);
    expect(profile(projected).monthlyActivity).toContain("纵向进度");
    expect(profile(projected).monthlyActivity).not.toContain("帮助target");
    expect(paper(projected, "target").collaborators).toEqual([]);
  });

  it("retains r49 review-time projects and fresh-draft scheduling", () => {
    withGameplayRuleset("20261024-r49", () => {
      const initial = fixture([]);
      const first = advanceFellowResearch(initial, zero);
      expect(profile(first).monthlyActivity).toContain("纵向进度");
      expect(profile(nextMonth(first)).monthlyActivity).toContain("纵向进度");
      const reset = ensureFellowPapers({ ...initial, fellowPapers: [], fellowProgressState: [{ ...profile(initial), nextMonthlyAction: "project" }] }, zero);
      expect(profile(reset).nextMonthlyAction).toBe("research");
    });
  });

  it("uses the serialized random stream for target selection and contribution scoring", () => {
    const initial = { ...fixture([fellow("alpha", { nextMonthlyAction: "project" }), fellow("beta", { nextMonthlyAction: "project" })]),
      randomState: { seed: 503917, cursor: 0 } };
    const snapshot = structuredClone(initial);
    const run = () => withGameRandom(initial, () => advanceFellowResearch(initial));
    const first = run();
    expect(run()).toEqual(first);
    expect(first.randomState!.cursor).toBeGreaterThan(0);
    expect(initial).toEqual(snapshot);
  });

  it.each([false, true])("never grants player credit for fellow-only papers on accepted=%s", accepted => {
    const initial = { ...fixture(), selectedRoleId: "social-reversed" as const, roleTalents: { levels: { "rejection-camaraderie": 2 } } };
    const helped = advanceFellowResearch(initial, zero);
    const target = paper(helped, "target");
    const score = accepted ? 100 : 1;
    const submitted = { ...prepareConferenceSubmission({ ...target, idea: score, experiment: score, writing: score }, "A", 1, 1), reviewMonthsLeft: 1 };
    const reviewState = { ...helped, totalMonths: 3, month: 3, fellowPapers: helped.fellowPapers!.map(entry => entry.id === target.id ? submitted : entry) };
    const settled = settleFellowCoauthoredPapers(advanceFellowResearch(reviewState, accepted ? () => 0.99 : zero));
    expect(settled.papers).toEqual(initial.papers);
    expect(settled.externalPublications).toEqual(initial.externalPublications);
    expect(settled.totalResearchScore).toBe(initial.totalResearchScore);
    expect(settled.fellowProgressState.map(entry => entry.affinity)).toEqual([0, 0]);
    expect(settled.eventHistory.flatMap(entry => entry.stages).filter(stage => stage.talentTrigger?.name === "同病相怜")).toHaveLength(0);
    const original = settled.fellowPapers!.find(entry => entry.id === target.id)!;
    expect(original.status).toBe(accepted ? "published" : "draft");
    expect(original.collaborators!.map(entry => entry.id)).toEqual(["helper"]);
  });
});

