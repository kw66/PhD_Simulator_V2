import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueAdvisorGuidance, settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { createAdvisorProgressState } from "../src/core/v2-advisor-progress";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceSharedLabProject } from "../src/core/v2-lab-projects";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import type { FellowProgressProfile, GameState, Paper } from "../src/core/v2-types";

function seedRandom(seed = 1) {
  let value = seed;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  });
}

function makePaper(id: string, patch: Partial<Paper> = {}): Paper {
  return {
    ...createDraftPaper(1, 0, () => 0),
    id,
    createdTotalMonths: 1,
    idea: 10,
    experiment: 0,
    writing: 0,
    prepublicationDecayRate: 0.05,
    ...patch,
  };
}

function makeFellow(id = "fellow-one", patch: Partial<FellowProgressProfile> = {}): FellowProgressProfile {
  return {
    ...createCustomFellowProgressProfile({
      type: "peer", gender: "female", research: 10, affinity: 1, startTotalMonths: 1, name: id,
    }),
    id,
    ...patch,
  };
}

function makeState(patch: Partial<GameState> = {}): GameState {
  const base = createStartedGameState("normal");
  const fellow = makeFellow("fellow-one", { nextMonthlyAction: "project" });
  return {
    ...base,
    totalMonths: 3,
    month: 3,
    year: 1,
    playerName: "Player",
    selectedAdvisorName: "Advisor",
    player: { ...base.player, san: 20, money: 20, research: 20, social: 6 },
    paperSlotsUnlocked: 3,
    eventQueue: [],
    availableRandomEvents: [],
    buffs: [],
    papers: [makePaper("player-paper", { experiment: 10 })],
    fellowProgressState: [fellow],
    fellowPapers: [makePaper("fellow-paper", { leadAuthorId: fellow.id, leadAuthorName: fellow.name })],
    advisorProgressState: createAdvisorProgressState(),
    ...patch,
  };
}

function nextMonth(state: GameState, seed = 1): GameState {
  seedRandom(seed);
  const next = dispatchAction(state, "next-month");
  expect(next.totalMonths).toBe(state.totalMonths + 1);
  expect(next.phase).toBe("playing");
  return next;
}

function collaborationTotal(paper: Paper): number {
  return Object.values(paper.collaborationScores ?? {}).reduce((total, amount) => total + amount, 0);
}

beforeEach(() => { seedRandom(); });
afterEach(() => vi.restoreAllMocks());

describe("shared lab project lifecycle", () => {
  it.each([null, undefined])("never creates guidance from %s pending values, including monthly horizontal completion", (pending) => {
    const base = makeState();
    const before: GameState = {
      ...base,
      advisorProgressState: { ...base.advisorProgressState, horizontalProgress: 90, pendingGuidanceToPlayer: pending },
      fellowProgressState: base.fellowProgressState.map((profile) => ({ ...profile, pendingGuidanceFromAdvisor: pending })),
    };
    const idle = settleAdvisorGuidance(settleAdvisorGuidance(before));
    expect(idle.papers).toEqual(before.papers);
    expect(idle.fellowPapers).toEqual(before.fellowPapers);

    const after = nextMonth(before);
    expect(after.advisorProgressState).toMatchObject({ horizontalProgress: 10, verticalProgress: 0, funding: 30, researchAccumulation: 20 });
    expect(after.player.money).toBe(26);
    expect(after.papers[0]).toMatchObject({ idea: 9, experiment: 9, writing: 0 });
    expect(after.fellowPapers?.[0]).toMatchObject({ idea: 9, experiment: 0, writing: 0 });
    for (const paper of [...after.papers, ...after.fellowPapers!]) {
      expect(collaborationTotal(paper)).toBe(0);
      expect(paper.collaborators).toEqual([]);
    }
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBe(pending);
    expect(after.fellowProgressState[0]?.pendingGuidanceFromAdvisor).toBe(pending);
  });

  it.each([
    { type: "horizontal" as const, funding: 10, advisorProject: "vertical" as const },
    { type: "vertical" as const, funding: 20, advisorProject: "horizontal" as const },
  ])("adds a fellow's 10 points to the existing shared $type progress 20 -> 30", ({ type, funding, advisorProject }) => {
    const before = makeState({ advisorProgressState: {
      ...createAdvisorProgressState(), funding, horizontalProgress: 20, verticalProgress: 20, nextProject: advisorProject,
    } });
    const after = nextMonth(before);
    expect(after.advisorProgressState).toMatchObject({ horizontalProgress: 30, verticalProgress: 30, funding, researchAccumulation: 20 });
    expect(after.fellowProgressState[0]?.monthlyActivity).toContain(type === "horizontal" ? "横向进度+10" : "纵向进度+10");
    expect(after.fellowPapers?.[0]).toMatchObject({ idea: 9, experiment: 0, writing: 0 });
    expect(collaborationTotal(after.papers[0]!)).toBe(0);
    expect(collaborationTotal(after.fellowPapers![0]!)).toBe(0);
  });

  it.each(["player", "advisor", "fellow"] as const)("pays funding 20 and player money 5 when the %s completes horizontal work", (contributor) => {
    const base = makeState();
    const before = {
      ...base,
      advisorProgressState: { ...base.advisorProgressState, horizontalProgress: 90, nextProject: "vertical" as const },
      ...(contributor === "advisor" ? { fellowProgressState: [], fellowPapers: [] } : {}),
    };
    seedRandom();
    const after = contributor === "player"
      ? dispatchAction(before, "advisor-project", { projectType: "horizontal" })
      : nextMonth(contributor === "advisor"
        ? { ...before, advisorProgressState: { ...before.advisorProgressState, nextProject: "horizontal" } }
        : before);
    expect(after.advisorProgressState.funding).toBe(30);
    expect(after.player.money).toBe(before.player.money + 5 + (contributor === "player" ? 0 : 1));
    expect(after.advisorProgressState.horizontalProgress).toBe(contributor === "player" ? 10 : 0);
    expect(after.advisorProgressState.researchAccumulation).toBe(20);
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBeUndefined();
    expect(collaborationTotal(after.papers[0]!)).toBe(0);
  });

  it("rewards only full 100 points and retains excess shared progress", () => {
    const before = makeState({ advisorProgressState: { ...createAdvisorProgressState(), horizontalProgress: 90 } });
    const partial = advanceSharedLabProject(before, "horizontal", 9, Math.random);
    expect(partial).toMatchObject({ gain: 9, completed: 0, state: { advisorProgressState: { horizontalProgress: 99, funding: 10 }, player: { money: 20 } } });
    const completed = advanceSharedLabProject(partial.state, "horizontal", 202, Math.random);
    expect(completed).toMatchObject({ gain: 202, completed: 3, state: { advisorProgressState: { horizontalProgress: 1, funding: 70 }, player: { money: 35 } } });
    expect(completed.state.papers).toEqual(before.papers);
    expect(completed.state.fellowPapers).toEqual(before.fellowPapers);
  });

  it("floors vertical accumulation growth and guides each lab member once, excluding the lover", () => {
    const base = makeState();
    const second = makeFellow("fellow-two");
    const before = {
      ...base,
      fellowProgressState: [...base.fellowProgressState, second],
      fellowPapers: [
        ...base.fellowPapers!.map((paper) => ({ ...paper, experiment: 10 })),
        makePaper("second-paper", { leadAuthorId: second.id, leadAuthorName: second.name, experiment: 10 }),
      ],
      loverState: activateLover("smart", 1, "male"),
      loverProgressState: createLoverProgressState("smart", () => 0),
      advisorProgressState: { ...base.advisorProgressState, verticalProgress: 90, researchAccumulation: 29 },
    };
    const partial = advanceSharedLabProject(before, "vertical", 9, Math.random);
    expect(partial).toMatchObject({ gain: 9, completed: 0, state: { advisorProgressState: { verticalProgress: 99, researchAccumulation: 29 } } });
    expect(partial.state.papers).toEqual(before.papers);
    expect(partial.state.fellowPapers).toEqual(before.fellowPapers);
    const completed = advanceSharedLabProject(partial.state, "vertical", 2, Math.random);
    expect(completed).toMatchObject({ gain: 2, completed: 1, state: { advisorProgressState: { verticalProgress: 1, researchAccumulation: 31, funding: 10 }, player: { money: 20 } } });
    for (const paper of [...completed.state.papers, ...completed.state.fellowPapers!]) {
      expect(collaborationTotal(paper)).toBe(10);
      expect(paper).toMatchObject({ idea: 10, experiment: 10, writing: 10, collaborationScores: { idea: 0, experiment: 0, writing: 10 } });
      expect(paper.collaborators).toEqual([{ id: "advisor", name: "Advisor" }]);
    }
    expect(completed.state.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(completed.state.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([null, null]);
    expect(completed.state.loverState).toEqual(before.loverState);
    expect(completed.state.loverProgressState).toEqual(before.loverProgressState);
  });
});

describe("monthly fellow experiment funding", () => {
  it("deducts exactly 3 shared funding and retains the expense in the activity after month settlement", () => {
    const before = makeState({ totalMonths: 4, month: 4, fellowProgressState: [makeFellow()] });
    const after = nextMonth(before);
    expect(after.advisorProgressState.funding).toBe(7);
    expect(after.fellowPapers?.[0]).toMatchObject({ idea: 9, experiment: 10, writing: 0 });
    expect(after.fellowProgressState[0]?.monthlyActivity).toContain("实验+10（经费-3）");
    expect(after.player.money).toBe(before.player.money + 1);
    expect(after.player.san).toBe(20);
    expect(after.actionState.used).toBe(0);
    const selected = dispatchAction(after, "select-paper", { paperId: after.papers[0]!.id });
    expect(selected.advisorProgressState.funding).toBe(7);
    expect(selected.fellowProgressState[0]?.monthlyActivity).toContain("经费-3");
  });

  it("switches an experiment to shared horizontal work at funding 2 without charging the player", () => {
    const before = makeState({
      totalMonths: 4, month: 4,
      fellowProgressState: [makeFellow()],
      advisorProgressState: { ...createAdvisorProgressState(), funding: 2, horizontalProgress: 20, nextProject: "vertical" },
    });
    const after = nextMonth(before);
    expect(after.advisorProgressState).toMatchObject({ funding: 2, horizontalProgress: 30, verticalProgress: 10 });
    expect(after.fellowPapers?.[0]).toMatchObject({ idea: 9, experiment: 0, writing: 0 });
    expect(after.fellowProgressState[0]?.monthlyActivity).toContain("经费不足，横向进度+10");
    expect(after.player.money).toBe(before.player.money + 1);
    expect(after.player.san).toBe(20);
    expect(after.actionState.used).toBe(0);
  });

  it.each([false, true])("lets only one of two fellows spend a shared funding balance of 3 (reversed=%s)", (reversed) => {
    const base = makeState({ fellowProgressState: [makeFellow()] });
    const second = makeFellow("fellow-two");
    const profiles = [...base.fellowProgressState, second];
    const papers = [...base.fellowPapers!, makePaper("second-paper", { leadAuthorId: second.id, leadAuthorName: second.name })];
    const before = {
      ...base, totalMonths: 4, month: 4,
      fellowProgressState: reversed ? [...profiles].reverse() : profiles,
      fellowPapers: reversed ? [...papers].reverse() : papers,
      advisorProgressState: { ...base.advisorProgressState, funding: 3, horizontalProgress: 20, nextProject: "vertical" as const },
    };
    const after = nextMonth(before);
    expect(after.advisorProgressState).toMatchObject({ funding: 0, horizontalProgress: 32, verticalProgress: 10 });
    expect(after.fellowPapers?.map((paper) => paper.experiment)).toEqual([10, 0]);
    expect(after.fellowProgressState[0]?.monthlyActivity).toContain("实验+10（经费-3）");
    expect(after.fellowProgressState[1]?.monthlyActivity).toContain("经费不足，横向进度+12");
    expect(after.player.money).toBe(before.player.money + 1);
    expect(after.player.san).toBe(20);
    expect(after.actionState.used).toBe(0);
  });
});

describe("vertical completion guidance across actions", () => {
  it.each([false, true])("guides eligible recipients and waits for experiments when a fellow completes vertical work mid-month (completerLast=%s)", (completerLast) => {
    const base = makeState();
    const researcher = makeFellow("researcher");
    const profiles = [...base.fellowProgressState, researcher];
    const papers = [...base.fellowPapers!, makePaper("researcher-paper", { leadAuthorId: researcher.id, leadAuthorName: researcher.name })];
    const before = {
      ...base,
      fellowProgressState: completerLast ? [...profiles].reverse() : profiles,
      fellowPapers: completerLast ? [...papers].reverse() : papers,
      advisorProgressState: { ...base.advisorProgressState, funding: 23, verticalProgress: 90 },
    };
    const after = nextMonth(before);
    expect(after.advisorProgressState).toMatchObject({
      funding: 20,
      verticalProgress: completerLast ? 2 : 0,
      researchAccumulation: 22,
      pendingGuidanceToPlayer: null,
    });
    expect(after.papers.map((paper) => paper.id)).toEqual(before.papers.map((paper) => paper.id));
    expect(after.fellowPapers?.map((paper) => paper.id)).toEqual(before.fellowPapers.map((paper) => paper.id));
    const researcherPaper = after.fellowPapers!.find((paper) => paper.id === "researcher-paper")!;
    for (const paper of [...after.papers, researcherPaper]) {
      expect(collaborationTotal(paper)).toBe(10);
      expect(paper.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 10 });
      expect(paper.collaborators).toEqual([{ id: "advisor", name: "Advisor" }]);
    }
    const completerPaper = after.fellowPapers!.find((paper) => paper.id === "fellow-paper")!;
    expect(completerPaper).toMatchObject({ experiment: 0, writing: 0, collaborators: [] });
    expect(collaborationTotal(completerPaper)).toBe(0);
    expect(researcherPaper.experiment).toBeGreaterThan(0);
    expect(after.fellowProgressState.find((profile) => profile.id === researcher.id)?.monthlyActivity)
      .toMatch(/论文实验\+\d+（经费-3）/);
    expect(after.fellowProgressState.find((profile) => profile.id === researcher.id)?.pendingGuidanceFromAdvisor).toBeNull();
    expect(after.fellowProgressState.find((profile) => profile.id === "fellow-one")?.pendingGuidanceFromAdvisor).toBe(10);
    const settled = settleAdvisorGuidance(after);
    expect(settled.papers).toEqual(after.papers);
    expect(settled.fellowPapers).toEqual(after.fellowPapers);
  });

  it("queues explicitly and stores at most one independent opportunity for each recipient", () => {
    const base = makeState({ papers: [] });
    const second = makeFellow("fellow-two");
    const frozen = prepareConferenceSubmission(makePaper("frozen", { idea: 10, experiment: 10, writing: 10, leadAuthorId: second.id }), "A", 1, 1);
    const before = {
      ...base, fellowProgressState: [...base.fellowProgressState, second],
      fellowPapers: [...base.fellowPapers!.map((paper) => ({ ...paper, experiment: 10 })), frozen],
    };
    const queued = queueAdvisorGuidance(queueAdvisorGuidance(before));
    expect(queued.papers).toEqual(before.papers);
    expect(queued.fellowPapers).toEqual(before.fellowPapers);
    expect(queued.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(queued.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([10, 10]);
    const settled = settleAdvisorGuidance(queued);
    expect(settled.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(settled.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([null, 10]);
    expect(collaborationTotal(settled.fellowPapers![0]!)).toBe(10);
    expect(settled.fellowPapers![0]!.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 10 });
    expect(settled.fellowPapers?.[1]).toEqual(frozen);
    const repeated = settleAdvisorGuidance(settled);
    expect(repeated.fellowPapers).toEqual(settled.fellowPapers);
    expect(repeated.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([null, 10]);
  });

  it("keeps one pending opportunity across completions, paper creation and idea work, then consumes it after experiment", () => {
    const before = makeState({
      papers: [], fellowProgressState: [], fellowPapers: [],
      advisorProgressState: { ...createAdvisorProgressState(), verticalProgress: 90, nextProject: "vertical" },
    });
    const completed = nextMonth(before);
    expect(completed.advisorProgressState).toMatchObject({ researchAccumulation: 22, pendingGuidanceToPlayer: 10 });
    const repeated = advanceSharedLabProject(completed, "vertical", 200, Math.random).state;
    expect(repeated.advisorProgressState).toMatchObject({ researchAccumulation: 26, pendingGuidanceToPlayer: 10 });
    const created = dispatchAction({ ...repeated, actionState: { ...repeated.actionState, limit: 2 } }, "create-paper", { paperSlotIndex: 0 });
    expect(created.papers).toHaveLength(1);
    expect(created.papers[0]).toMatchObject({ idea: 0, experiment: 0, writing: 0, collaborators: [] });
    expect(created.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    const paperId = created.papers[0]!.id;
    const idea = dispatchAction(created, "research-paper", { paperId, paperActionType: "idea" });
    expect(idea.papers[0]!.idea).toBeGreaterThan(0);
    expect(idea.papers[0]).toMatchObject({ experiment: 0, writing: 0, collaborators: [] });
    expect(idea.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    const experiment = dispatchAction(idea, "research-paper", { paperId, paperActionType: "experiment" });
    expect(experiment.papers[0]!.experiment).toBeGreaterThan(0);
    expect(experiment.papers[0]).toMatchObject({
      idea: idea.papers[0]!.idea, writing: 10,
      collaborationScores: { idea: 0, experiment: 0, writing: 10 },
      collaborators: [{ id: "advisor", name: "Advisor" }],
    });
    expect(experiment.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    const second = dispatchAction(experiment, "create-paper", { paperSlotIndex: 1 });
    expect(second.papers).toHaveLength(2);
    expect(second.papers[0]).toEqual(experiment.papers[0]);
    expect(collaborationTotal(second.papers[1]!)).toBe(0);
    const later = nextMonth({ ...second, eventQueue: [] });
    expect(later.papers[0]).toMatchObject({ writing: 9, collaborationScores: { idea: 0, experiment: 0, writing: 9 } });
    expect(collaborationTotal(later.papers[1]!)).toBe(0);
    expect(later.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
  });

  it("retains guidance during conference review and consumes it once after the rejection event unfreezes the paper", () => {
    const submitted = {
      ...prepareConferenceSubmission(makePaper("conference-paper", { idea: 1, experiment: 1, writing: 1 }), "A", 1, 1),
      reviewMonthsLeft: 1,
    };
    let state = nextMonth(makeState({
      papers: [submitted], fellowProgressState: [], fellowPapers: [],
      advisorProgressState: { ...createAdvisorProgressState(), verticalProgress: 90, nextProject: "vertical" },
    }));
    expect(state.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(state.papers[0]).toMatchObject({ status: "reviewing", submittedIdea: 1, submittedExperiment: 1, submittedWriting: 1 });
    expect(collaborationTotal(state.papers[0]!)).toBe(0);
    for (const stage of ["act1", "act2", "result"]) {
      const event = state.eventQueue.find((entry) => entry.chainId === `paper-review-result-${submitted.id}`)!;
      expect(event?.stage).toBe(stage);
      expect(state.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    expect(state.papers[0]).toMatchObject({ status: "draft", lastReview: { accepted: false } });
    expect(collaborationTotal(state.papers[0]!)).toBe(10);
    expect(state.papers[0]?.collaborationScores).toEqual({ idea: 0, experiment: 0, writing: 10 });
    expect(state.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(dispatchAction(state, "select-paper", { paperId: submitted.id }).papers).toEqual(state.papers);
  });

  it("archives a journal accepted by vertical-completion guidance in the same month exactly once", () => {
    const journal = makePaper("journal-paper", {
      status: "journal-reviewing", journalTarget: "pami", idea: 40, experiment: 40, writing: 40,
      submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40,
    });
    const before = makeState({
      papers: [journal], fellowProgressState: [], fellowPapers: [],
      advisorProgressState: { ...createAdvisorProgressState(), verticalProgress: 90, nextProject: "vertical" },
    });
    const after = nextMonth(before);
    expect(after.papers).toHaveLength(0);
    expect(after.externalPublications).toHaveLength(1);
    const published = after.externalPublications[0]!;
    expect(published).toMatchObject({
      id: journal.id, status: "published", journalTarget: "pami",
      idea: 40, experiment: 40, writing: 50, collaborationScores: { idea: 0, experiment: 0, writing: 10 },
      publication: { effectiveScore: 130 }, collaborators: [{ id: "advisor", name: "Advisor" }],
    });
    expect(collaborationTotal(published)).toBe(10);
    expect(after.totalResearchScore).toBe(5);
    expect(after.advisorProgressState).toMatchObject({ researchAccumulation: 27, countedPaperIds: [journal.id], pendingGuidanceToPlayer: null });
    const repeated = dispatchAction(after, "select-paper", { paperId: journal.id });
    expect(repeated.externalPublications).toEqual(after.externalPublications);
    expect(repeated.totalResearchScore).toBe(5);
    expect(repeated.advisorProgressState.researchAccumulation).toBe(27);
  });
});
