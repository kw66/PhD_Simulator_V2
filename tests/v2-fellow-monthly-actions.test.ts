import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConferenceInfo } from "../src/core/v2-conference-catalog";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers, getFellowCurrentPaper } from "../src/core/v2-fellow-research";
import * as labProjects from "../src/core/v2-lab-projects";
import { addPaperCollaboration, getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import * as paperRules from "../src/core/v2-paper-rules";
import { createDraftPaper, decayUnpublishedPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { applyRejectedPaperReview } from "../src/core/v2-publication-system";
import * as researchOperations from "../src/core/v2-research-operation";
import type { FellowProgressProfile, GameState, Paper } from "../src/core/v2-types";

const zeroRandom = () => 0;

function makeFellow(id = "fellow", patch: Partial<FellowProgressProfile> = {}): FellowProgressProfile {
  return {
    ...createCustomFellowProgressProfile({
      type: "peer", gender: "female", research: 20, affinity: 0, startTotalMonths: 1, name: id,
    }),
    id,
    researchTopic: {
      topicId: "video-generation", topicLabel: "Video generation", heatMultiplier: 0.5, prepublicationDecayRate: 0,
    },
    ...patch,
  };
}

function makeState(options: {
  fellows?: FellowProgressProfile[];
  totalMonths?: number;
  funding?: number;
  horizontalProgress?: number;
  verticalProgress?: number;
} = {}): GameState {
  const base = createStartedGameState("normal");
  const totalMonths = options.totalMonths ?? 1;
  const profiles = options.fellows ?? [makeFellow()];
  const state = ensureFellowPapers({
    ...base,
    ...getCalendarForTotalMonths(totalMonths),
    totalMonths,
    playerName: "Player",
    selectedAdvisorName: "Advisor",
    player: { ...base.player, research: 10, social: 6, san: 20, money: 20 },
    eventQueue: [],
    availableRandomEvents: [],
    buffs: [],
    papers: [createDraftPaper(totalMonths, 0, zeroRandom)],
    fellowProgressState: profiles,
    fellowPapers: [],
    advisorProgressState: {
      ...base.advisorProgressState,
      funding: options.funding ?? 10,
      horizontalProgress: options.horizontalProgress ?? 0,
      verticalProgress: options.verticalProgress ?? 0,
    },
  }, zeroRandom);
  return {
    ...state,
    fellowProgressState: profiles,
    fellowPapers: state.fellowPapers!.map((paper) => ({
      ...paper,
      prepublicationDecayRate: 0,
      createdTotalMonths: state.fellowProgressState.find((profile) => profile.id === paper.leadAuthorId)!.startTotalMonths,
    })),
  };
}

function currentPaper(state: GameState, fellowId = "fellow"): Paper {
  const paper = getFellowCurrentPaper(state, fellowId);
  expect(paper, `current paper for ${fellowId}`).toBeDefined();
  return paper!;
}

function fellow(state: GameState, fellowId = "fellow"): FellowProgressProfile {
  const profile = state.fellowProgressState.find((entry) => entry.id === fellowId);
  expect(profile, `profile for ${fellowId}`).toBeDefined();
  return profile!;
}

function withPaper(state: GameState, patch: Partial<Paper>, fellowId = "fellow"): GameState {
  const paperId = currentPaper(state, fellowId).id;
  return { ...state, fellowPapers: state.fellowPapers!.map((paper) => paper.id === paperId ? { ...paper, ...patch } : paper) };
}

function advanceTo(state: GameState, totalMonths: number): GameState {
  return advanceFellowResearch({ ...state, ...getCalendarForTotalMonths(totalMonths), totalMonths }, zeroRandom);
}

function nextMonth(state: GameState): GameState {
  return advanceTo(state, state.totalMonths + 1);
}

function scores(paper: Paper): number[] {
  return [paper.idea, paper.experiment, paper.writing];
}

function withReview(state: GameState, fellowId = "fellow", score = 100, monthsLeft = 1): GameState {
  const paper = currentPaper(state, fellowId);
  const submitted = prepareConferenceSubmission({ ...paper, idea: score, experiment: score, writing: score }, "A", state.month, state.year);
  return withPaper(state, { ...submitted, reviewMonthsLeft: monthsLeft }, fellowId);
}

beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0); });
afterEach(() => vi.restoreAllMocks());

describe("fellow monthly action state", () => {
  it.each([1, 2, 12])("starts research the month after joining at %s, then alternates with projects", (startTotalMonths) => {
    const joined = makeState({ fellows: [makeFellow("fellow", { startTotalMonths })], totalMonths: startTotalMonths });
    expect(scores(currentPaper(joined))).toEqual([0, 0, 0]);
    const joinMonth = advanceFellowResearch(joined, zeroRandom);
    expect(scores(currentPaper(joinMonth))).toEqual([0, 0, 0]);
    expect(joinMonth.advisorProgressState).toMatchObject({ horizontalProgress: 0, verticalProgress: 0 });

    const researched = nextMonth(joinMonth);
    expect(scores(currentPaper(researched))).toEqual([10, 0, 0]);
    expect(fellow(researched).nextMonthlyAction).toBe("project");
    expect(researched.advisorProgressState.horizontalProgress).toBe(0);

    const projected = nextMonth(researched);
    expect(scores(currentPaper(projected))).toEqual([9, 0, 0]);
    expect(projected.advisorProgressState).toMatchObject({ horizontalProgress: 20, funding: 10 });
    expect(fellow(projected).nextMonthlyAction).toBe("research");

    const experimented = nextMonth(projected);
    expect(scores(currentPaper(experimented))).toEqual([8, 10, 0]);
    expect(experimented.advisorProgressState).toMatchObject({ horizontalProgress: 20, funding: 7 });
    expect(fellow(experimented).nextMonthlyAction).toBe("project");
    expect(advanceFellowResearch(experimented, zeroRandom)).toBe(experimented);
    expect(experimented.player).toEqual(joined.player);
    expect(experimented.actionState).toEqual(joined.actionState);
  });

  it.each([2, 3])("honors an explicit project action at month %s independently of join parity", (totalMonths) => {
    const before = withPaper(makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction: "project" })], funding: 20 }), { idea: 10 });
    const after = advanceTo(before, totalMonths);
    expect(scores(currentPaper(after))).toEqual([9, 0, 0]);
    expect(after.advisorProgressState).toMatchObject({ funding: 20, verticalProgress: 20, horizontalProgress: 0 });
    expect(fellow(after).nextMonthlyAction).toBe("research");
    expect(fellow(after).lastProjectTotalMonths).toBe(totalMonths);
  });

  it("defaults a missing action to research and performs only one action after skipped months", () => {
    const profile = makeFellow();
    delete profile.nextMonthlyAction;
    const first = advanceTo(makeState({ fellows: [profile] }), 6);
    expect(scores(currentPaper(first))).toEqual([10, 0, 0]);
    expect(fellow(first).nextMonthlyAction).toBe("project");
    const later = advanceTo(first, 9);
    expect(scores(currentPaper(later))).toEqual([9, 0, 0]);
    expect(later.advisorProgressState.horizontalProgress).toBe(20);
    expect(fellow(later).nextMonthlyAction).toBe("research");
  });

  it("resets a pending project to research when a missing current draft is created", () => {
    const base = makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction: "project" })] });
    const next = ensureFellowPapers({ ...base, fellowPapers: [] }, zeroRandom);
    expect(scores(currentPaper(next))).toEqual([0, 0, 0]);
    expect(fellow(next).nextMonthlyAction).toBe("research");
    expect(scores(currentPaper(nextMonth(next)))).toEqual([10, 0, 0]);
  });

  it("creates a blank draft on joining and runs the new cadence through dispatchAction", () => {
    const base = makeState({ fellows: [] });
    const joined = dispatchAction(base, "debug-add-relationship", { debugRelationshipType: "peer" });
    const profile = joined.fellowProgressState[0]!;
    expect(scores(currentPaper(joined, profile.id))).toEqual([0, 0, 0]);
    const researched = dispatchAction(joined, "next-month");
    expect(researched.totalMonths).toBe(joined.totalMonths + 1);
    expect(currentPaper(researched, profile.id)).toMatchObject({ experiment: 0, writing: 0 });
    expect(currentPaper(researched, profile.id).idea).toBeGreaterThan(0);
    expect(fellow(researched, profile.id).nextMonthlyAction).toBe("project");
    const projected = dispatchAction({ ...researched, eventQueue: [] }, "next-month");
    expect(projected.totalMonths).toBe(researched.totalMonths + 1);
    expect(currentPaper(projected, profile.id)).toMatchObject({ experiment: 0, writing: 0 });
    expect(fellow(projected, profile.id)).toMatchObject({ nextMonthlyAction: "research", lastProjectTotalMonths: projected.totalMonths });
  });
});

describe("research selection and funding retries", () => {
  it.each([
    { before: [0, 0, 0], after: [10, 0, 0], spending: 0 },
    { before: [0, 9, 0], after: [10, 8, 0], spending: 0 },
    { before: [9, 0, 0], after: [8, 10, 0], spending: 3 },
    { before: [9, 9, 0], after: [8, 8, 10], spending: 0 },
    { before: [5, 5, 5], after: [10, 4, 4], spending: 0 },
    { before: [9, 5, 5], after: [8, 10, 4], spending: 3 },
    { before: [9, 9, 5], after: [8, 8, 10], spending: 0 },
  ])("fills prerequisites then breaks lowest-field ties in field order: $before", ({ before, after, spending }) => {
    const state = withPaper(makeState(), { idea: before[0]!, experiment: before[1]!, writing: before[2]! });
    const next = nextMonth(state);
    expect(scores(currentPaper(next))).toEqual(after);
    expect(next.advisorProgressState.funding).toBe(10 - spending);
    expect(fellow(next).nextMonthlyAction).toBe("project");
  });

  it("selects the lowest total rather than the lowest personal contribution", () => {
    const state = withPaper(makeState(), {
      idea: 21, experiment: 7, writing: 8, collaborationScores: { idea: 20 },
      collaborators: [{ id: "player", name: "Player" }],
    });
    const decayed = decayUnpublishedPaper(currentPaper(state));
    const next = nextMonth(state);
    expect(scores(currentPaper(next))).toEqual([20, 10, 7]);
    expect(getPaperScoreBreakdown(currentPaper(next), "idea")).toEqual(getPaperScoreBreakdown(decayed, "idea"));
    expect(next.advisorProgressState.funding).toBe(7);
  });

  it.each([0, 2])("retries an underfunded experiment every month at funding %s without using player money", (funding) => {
    let state = withPaper(makeState({ funding }), { idea: 10 });
    for (const horizontalProgress of [20, 40]) {
      state = nextMonth(state);
      expect(currentPaper(state).experiment).toBe(0);
      expect(state.advisorProgressState).toMatchObject({ funding, horizontalProgress });
      expect(fellow(state).nextMonthlyAction).toBe("research");
      expect(state.player.money).toBe(20);
    }
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 3 } };
    const retried = nextMonth(state);
    expect(currentPaper(retried).experiment).toBe(10);
    expect(retried.advisorProgressState).toMatchObject({ funding: 0, horizontalProgress: 40 });
    expect(fellow(retried).nextMonthlyAction).toBe("project");
    expect(retried.player.money).toBe(20);
  });

  it("keeps retrying through horizontal completion but waits until next month to spend its own reward", () => {
    let state = withPaper(makeState({ funding: 0 }), { idea: 10 });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      state = nextMonth(state);
      expect(currentPaper(state).experiment).toBe(0);
      expect(fellow(state).nextMonthlyAction).toBe("research");
      expect(state.advisorProgressState).toMatchObject({
        horizontalProgress: attempt * 20 % 100, funding: attempt === 5 ? 20 : 0,
      });
      expect(state.player.money).toBe(attempt === 5 ? 25 : 20);
    }
    const retried = nextMonth(state);
    expect(currentPaper(retried).experiment).toBe(10);
    expect(retried.advisorProgressState).toMatchObject({ funding: 17, horizontalProgress: 0, verticalProgress: 0 });
    expect(retried.player.money).toBe(25);
    expect(fellow(retried).nextMonthlyAction).toBe("project");
  });

  it("reselects the weakest field after help changes the previously blocked experiment", () => {
    const blocked = nextMonth(withPaper(makeState({ funding: 2 }), { idea: 12, experiment: 1, writing: 8 }));
    expect(blocked.advisorProgressState.horizontalProgress).toBe(20);
    const next = nextMonth({ ...blocked, fellowProgressState: [{ ...fellow(blocked), pendingHelpToFellow: 20 }] });
    expect(scores(currentPaper(next))).toEqual([10, 21, 10]);
    expect(getPaperScoreBreakdown(currentPaper(next), "experiment")).toEqual({ own: 1, collaboration: 20, total: 21 });
    expect(next.advisorProgressState).toMatchObject({ funding: 2, horizontalProgress: 20 });
    expect(fellow(next)).toMatchObject({ pendingHelpToFellow: null, nextMonthlyAction: "project" });
  });

  it.each([3, 20])("charges exactly three shared funding at balance %s, ignoring player GPU discounts", (funding) => {
    const base = withPaper(makeState({ funding }), { idea: 10 });
    const state = { ...base, player: { ...base.player, money: 0 }, shopState: { ...base.shopState, gpuLevel: 8 } };
    const next = nextMonth(state);
    expect(currentPaper(next).experiment).toBe(10);
    expect(next.advisorProgressState).toMatchObject({ funding: funding - 3, horizontalProgress: 0, verticalProgress: 0 });
    expect(next.player).toEqual(state.player);
    expect(next.actionState).toEqual(state.actionState);
  });
});

describe("entry funding and sequential card order", () => {
  it.each([false, true])("uses entry funding 19 for every project even after a reward crosses 20 (reversed papers=%s)", (reversed) => {
    const profiles = [makeFellow("first", { research: 10, nextMonthlyAction: "project" }), makeFellow("second", { research: 10, nextMonthlyAction: "project" })];
    const before = makeState({ fellows: profiles, funding: 19, horizontalProgress: 90 });
    if (reversed) before.fellowPapers!.reverse();
    const next = nextMonth(before);
    expect(next.advisorProgressState).toMatchObject({ funding: 39, horizontalProgress: 10, verticalProgress: 0 });
    expect(next.player.money).toBe(25);
    for (const profile of profiles) {
      expect(scores(currentPaper(next, profile.id))).toEqual([0, 0, 0]);
      expect(fellow(next, profile.id).nextMonthlyAction).toBe("research");
    }
  });

  it.each([false, true])("uses entry funding 20 for a later project after an earlier experiment spends three (reversed papers=%s)", (reversed) => {
    const before = withPaper(makeState({
      fellows: [makeFellow("project", { startTotalMonths: 2, nextMonthlyAction: "project" }), makeFellow("research", { nextMonthlyAction: "research" })],
      totalMonths: 2, funding: 20,
    }), { idea: 10 }, "research");
    if (reversed) before.fellowPapers!.reverse();
    const next = nextMonth(before);
    expect(currentPaper(next, "research").experiment).toBe(10);
    expect(next.advisorProgressState).toMatchObject({ funding: 17, horizontalProgress: 0, verticalProgress: 20 });
    expect(fellow(next, "research").nextMonthlyAction).toBe("project");
    expect(fellow(next, "project").nextMonthlyAction).toBe("research");
  });

  it.each([
    { starts: [1, 2], winner: "first", reversed: false, reverseProfiles: false },
    { starts: [1, 2], winner: "first", reversed: true, reverseProfiles: false },
    { starts: [2, 1], winner: "second", reversed: false, reverseProfiles: false },
    { starts: [2, 1], winner: "second", reversed: true, reverseProfiles: false },
    { starts: [1, 1], winner: "first", reversed: false, reverseProfiles: false },
    { starts: [1, 1], winner: "first", reversed: true, reverseProfiles: false },
    { starts: [1, 1], winner: "second", reversed: false, reverseProfiles: true },
    { starts: [1, 1], winner: "second", reversed: true, reverseProfiles: true },
  ])("spends scarce funding in card order: $starts, reversed papers=$reversed, reversed profiles=$reverseProfiles", ({ starts, winner, reversed, reverseProfiles }) => {
    const profiles = [makeFellow("first", { startTotalMonths: starts[0]! }), makeFellow("second", { startTotalMonths: starts[1]! })];
    let before = makeState({ fellows: profiles, totalMonths: 2, funding: 3 });
    for (const profile of profiles) before = withPaper(before, { idea: 10 }, profile.id);
    if (reverseProfiles) before = { ...before, fellowProgressState: [...before.fellowProgressState].reverse() };
    if (reversed) before.fellowPapers!.reverse();
    const snapshot = structuredClone(before);
    const next = nextMonth(before);
    for (const profile of profiles) {
      expect(currentPaper(next, profile.id).experiment).toBe(profile.id === winner ? 10 : 0);
      expect(fellow(next, profile.id).nextMonthlyAction).toBe(profile.id === winner ? "project" : "research");
    }
    expect(next.advisorProgressState).toMatchObject({ funding: 0, horizontalProgress: 20, verticalProgress: 0 });
    expect(next.player.money).toBe(20);
    expect(before).toEqual(snapshot);
  });

  it.each([false, true])("lets horizontal completion fund a later card's experiment in the same month (reversed papers=%s)", (reversed) => {
    const profiles = [makeFellow("research", { startTotalMonths: 2 }), makeFellow("project", { research: 10, nextMonthlyAction: "project" })];
    const before = withPaper(makeState({ fellows: profiles, totalMonths: 2, funding: 0, horizontalProgress: 90 }), { idea: 10 }, "research");
    if (reversed) before.fellowPapers!.reverse();
    const next = nextMonth(before);
    expect(scores(currentPaper(next, "project"))).toEqual([0, 0, 0]);
    expect(currentPaper(next, "research").experiment).toBe(10);
    expect(next.advisorProgressState).toMatchObject({ funding: 17, horizontalProgress: 0, verticalProgress: 0 });
    expect(next.player.money).toBe(25);
    expect(fellow(next, "project").nextMonthlyAction).toBe("research");
    expect(fellow(next, "research").nextMonthlyAction).toBe("project");
  });

  it("does not revisit an earlier blocked researcher after a later card earns funding", () => {
    const profiles = [makeFellow("project", { startTotalMonths: 2, research: 10, nextMonthlyAction: "project" }), makeFellow("research")];
    const before = withPaper(makeState({ fellows: profiles, totalMonths: 2, funding: 0, horizontalProgress: 70 }), { idea: 10 }, "research");
    const next = nextMonth(before);
    expect(currentPaper(next, "research").experiment).toBe(0);
    expect(next.advisorProgressState).toMatchObject({ funding: 20, horizontalProgress: 0, verticalProgress: 0 });
    expect(next.player.money).toBe(25);
    expect(fellow(next, "research").nextMonthlyAction).toBe("research");
  });
});

describe("reviews settle before monthly own actions", () => {
  it.each([19, 20])("does a project every month while reviewing at entry funding %s", (funding) => {
    const before = withReview(makeState({ funding }), "fellow", 100, 3);
    const submitted = currentPaper(before);
    let state = before;
    for (const reviewMonthsLeft of [2, 1]) {
      state = nextMonth(state);
      expect(currentPaper(state)).toMatchObject({
        status: "reviewing", reviewMonthsLeft,
        submittedIdea: submitted.submittedIdea, submittedExperiment: submitted.submittedExperiment, submittedWriting: submitted.submittedWriting,
      });
      const progress = (3 - reviewMonthsLeft) * 20;
      expect(state.advisorProgressState).toMatchObject({
        funding, horizontalProgress: funding < 20 ? progress : 0, verticalProgress: funding >= 20 ? progress : 0,
      });
    }
    expect(state.player).toEqual(before.player);
  });

  it.each([false, true])("researches a fresh draft in the acceptance month, then projects (player coauthor=%s)", (coauthored) => {
    let before = withPaper(makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction: "project" })] }), { idea: 100, experiment: 100, writing: 100 });
    if (coauthored) {
      const paper = currentPaper(before);
      before = withPaper(before, addPaperCollaboration(paper, { paperId: paper.id, collaborator: { id: "player", name: "Player" }, scores: { idea: 1 } }));
    }
    const oldPaper = currentPaper(before);
    before = withPaper(before, { ...prepareConferenceSubmission(oldPaper, "A", 1, 1), reviewMonthsLeft: 1 });
    const accepted = nextMonth(before);
    const publications = [...accepted.fellowPapers!, ...accepted.externalPublications].filter((paper) => paper.id === oldPaper.id);
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({ status: "published", lastReview: { accepted: true } });
    expect(currentPaper(accepted).id).not.toBe(oldPaper.id);
    expect(currentPaper(accepted)).toMatchObject({ status: "draft", createdTotalMonths: accepted.totalMonths, idea: 10, experiment: 0, writing: 0 });
    expect(fellow(accepted).nextMonthlyAction).toBe("project");
    expect(accepted.advisorProgressState).toMatchObject({ horizontalProgress: 0, verticalProgress: 0 });
    const projected = nextMonth(accepted);
    expect(scores(currentPaper(projected))).toEqual([9, 0, 0]);
    expect(projected.advisorProgressState.horizontalProgress).toBe(20);
    expect(fellow(projected).nextMonthlyAction).toBe("research");
    expect(currentPaper(nextMonth(projected)).experiment).toBe(10);
  });

  it("applies rejection feedback, optimizes and resubmits immediately, then projects", () => {
    const before = withReview(makeState({ fellows: [makeFellow("fellow", { research: 4, nextMonthlyAction: "project" })] }), "fellow", 1);
    const submitted = currentPaper(before);
    const review = paperRules.resolvePaperReview(submitted, zeroRandom).nextPaper.lastReview!;
    expect(review.accepted).toBe(false);
    const feedback = applyRejectedPaperReview(decayUnpublishedPaper(submitted), review);
    const optimized = nextMonth(before);
    expect(currentPaper(optimized)).toMatchObject({
      id: submitted.id, status: "reviewing", rejectionCount: 1, reviewMonthsLeft: 3,
      idea: feedback.idea, experiment: feedback.experiment + 1, writing: feedback.writing,
    });
    expect(currentPaper(optimized)).toMatchObject({ submittedMonth: optimized.month, submittedYear: optimized.year });
    expect(fellow(optimized).nextMonthlyAction).toBe("project");
    expect(optimized.advisorProgressState).toMatchObject({ funding: 7, horizontalProgress: 0, verticalProgress: 0 });
    const projected = nextMonth(optimized);
    expect(scores(currentPaper(projected))).toEqual(scores(decayUnpublishedPaper(currentPaper(optimized))));
    expect(projected.advisorProgressState.horizontalProgress).toBe(4);
    expect(fellow(projected).nextMonthlyAction).toBe("research");
  });

  it.each([true, false])("settles retained help before selecting post-review research (accepted=%s)", (accepted) => {
    const before = withReview(makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction: "project", pendingHelpToFellow: 10 })] }), "fellow", accepted ? 100 : 1);
    const next = nextMonth(before);
    const paper = currentPaper(next);
    if (accepted) {
      expect(scores(paper)).toEqual([10, 10, 0]);
      expect(getPaperScoreBreakdown(paper, "idea")).toEqual({ own: 0, collaboration: 10, total: 10 });
      expect(next.advisorProgressState.funding).toBe(7);
    } else {
      expect(paper.writing).toBe(10);
      expect(getPaperScoreBreakdown(paper, "experiment")).toEqual({ own: 1, collaboration: 10, total: 11 });
      expect(next.advisorProgressState.funding).toBe(10);
    }
    expect(fellow(next)).toMatchObject({ pendingHelpToFellow: null, nextMonthlyAction: "project" });
    expect(next.advisorProgressState).toMatchObject({ horizontalProgress: 0, verticalProgress: 0 });
  });

  it.each([false, true])("settles every due review before any research or project (reversed papers=%s)", (reversed) => {
    let before = makeState({ fellows: [
      makeFellow("project", { nextMonthlyAction: "project" }), makeFellow("accepted"), makeFellow("rejected", { research: 4 }),
    ] });
    before = withReview(withReview(before, "accepted"), "rejected", 1);
    if (reversed) before.fellowPapers!.reverse();
    const phases: string[] = [];
    const resolveReview = paperRules.resolvePaperReview;
    const advanceProject = labProjects.advanceSharedLabProject;
    const researchScore = researchOperations.generateResearchScore;
    vi.spyOn(paperRules, "resolvePaperReview").mockImplementation((...args) => {
      phases.push(`review:${args[0].leadAuthorId}`);
      return resolveReview(...args);
    });
    vi.spyOn(labProjects, "advanceSharedLabProject").mockImplementation((...args) => {
      phases.push("project");
      return advanceProject(...args);
    });
    vi.spyOn(researchOperations, "generateResearchScore").mockImplementation((...args) => {
      phases.push("research");
      return researchScore(...args);
    });
    nextMonth(before);
    expect(phases.slice(0, 2).sort()).toEqual(["review:accepted", "review:rejected"]);
    expect(phases.slice(2)).toEqual(["project", "research", "research"]);
  });
});

describe("automatic assistance and submission", () => {
  it.each(["research", "project"] as const)("automatic help and guidance preserve the pending %s action", (nextMonthlyAction) => {
    const before = makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction, pendingHelpToFellow: 10, pendingGuidanceFromAdvisor: 10 })] });
    const next = dispatchAction(before, "select-paper", { paperId: before.papers[0]!.id });
    expect(fellow(next)).toMatchObject({ nextMonthlyAction, pendingHelpToFellow: null, pendingGuidanceFromAdvisor: null });
    expect(getPaperScoreBreakdown(currentPaper(next), "idea")).toEqual({ own: 0, collaboration: 20, total: 20 });
    expect(next.advisorProgressState).toEqual(before.advisorProgressState);
    expect(next.actionState).toEqual(before.actionState);
  });

  it("settles newly completed monthly cooperation before research selects its field", () => {
    const before = makeState({ fellows: [makeFellow("fellow", { affinity: 1, taskProgress: 99 })] });
    const next = nextMonth(before);
    expect(scores(currentPaper(next))).toEqual([10, 10, 0]);
    expect(getPaperScoreBreakdown(currentPaper(next), "idea")).toEqual({ own: 0, collaboration: 10, total: 10 });
    expect(next.advisorProgressState.funding).toBe(7);
    expect(fellow(next)).toMatchObject({ taskProgress: 0, pendingHelpToFellow: null, nextMonthlyAction: "project" });
  });

  it("keeps a scheduled project when guidance and help arrive during that month", () => {
    const before = makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction: "project", pendingHelpToFellow: 10, pendingGuidanceFromAdvisor: 10 })] });
    const next = nextMonth(before);
    expect(getPaperScoreBreakdown(currentPaper(next), "idea")).toEqual({ own: 0, collaboration: 20, total: 20 });
    expect(currentPaper(next).experiment).toBe(0);
    expect(next.advisorProgressState).toMatchObject({ horizontalProgress: 20, verticalProgress: 0, funding: 10 });
    expect(fellow(next).nextMonthlyAction).toBe("research");
    expect(currentPaper(nextMonth(next)).experiment).toBe(10);
  });

  it.each([1, 4])("submits after own research using current A/B/C reference scores in year %s", (year) => {
    const month = 6;
    for (const target of ["A", "B", "C"] as const) {
      const conference = getConferenceInfo(month, target, year);
      const totalMonths = (year - 1) * 12 + month;
      const before = withPaper(makeState({
        fellows: [makeFellow("fellow", { research: 0, startTotalMonths: totalMonths - 1 })], totalMonths: totalMonths - 1,
      }), { idea: conference.referenceScore - 2, experiment: 1, writing: 1 });
      const next = nextMonth(before);
      const paper = currentPaper(next);
      const expectedTarget = (["A", "B", "C"] as const).find((grade) => {
        const info = getConferenceInfo(month, grade, year);
        return info.name !== "-" && conference.referenceScore >= info.referenceScore;
      });
      expect(paper.idea + paper.experiment + paper.writing).toBe(conference.referenceScore);
      expect(paper).toMatchObject({ status: "reviewing", target: expectedTarget, submittedMonth: month, submittedYear: year, reviewMonthsLeft: 3 });
      expect([paper.submittedIdea, paper.submittedExperiment, paper.submittedWriting]).toEqual(scores(paper));
      expect(fellow(next).nextMonthlyAction).toBe("project");
    }
  });

  it("keeps a successfully researched paper below the lowest current reference in draft", () => {
    const reference = Math.min(...(["A", "B", "C"] as const).map((target) => getConferenceInfo(6, target, 1).referenceScore));
    const before = withPaper(makeState({ fellows: [makeFellow("fellow", { research: 0 })], totalMonths: 5 }), { idea: reference - 3, experiment: 1, writing: 1 });
    const next = nextMonth(before);
    const paper = currentPaper(next);
    expect(paper.idea + paper.experiment + paper.writing).toBe(reference - 1);
    expect(paper.status).toBe("draft");
    expect(fellow(next).nextMonthlyAction).toBe("project");
  });

  it("does not submit an eligible paper on a project-only month, even after automatic help", () => {
    const before = withPaper(makeState({ fellows: [makeFellow("fellow", { nextMonthlyAction: "project", pendingHelpToFellow: 10 })] }), { idea: 100, experiment: 100, writing: 100 });
    const next = nextMonth(before);
    expect(currentPaper(next)).toMatchObject({ status: "draft", submittedIdea: null, submittedExperiment: null, submittedWriting: null });
    expect(next.advisorProgressState.horizontalProgress).toBe(20);
    expect(fellow(next).nextMonthlyAction).toBe("research");
  });
});
