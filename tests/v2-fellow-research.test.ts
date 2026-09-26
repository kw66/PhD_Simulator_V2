import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, attendFellowConferences, ensureFellowPapers, getFellowCurrentPaper, getFellowResearchAction, getFellowSubmissionTarget } from "../src/core/v2-fellow-research";
import { advanceFellowTask, getFellowDiscussionSanCost } from "../src/core/v2-fellow-actions";
import { settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { addPaperCollaboration, getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { createDraftPaper, decayUnpublishedPaper, prepareConferenceSubmission, resolvePaperReview } from "../src/core/v2-paper-rules";
import { applyRejectedPaperReview, settlePaperCitationMonth, settlePublishedPaperCitations } from "../src/core/v2-publication-system";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import { getConferenceInfo } from "../src/core/v2-conference-catalog";
import { endRelationship } from "../src/core/v2-relationship-actions";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, Paper } from "../src/core/v2-types";

function makeState(research = 20): GameState {
  const base = createStartedGameState("normal");
  const profile = { ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research, affinity: 2, startTotalMonths: 1, name: "林青" }),
    researchTopic: { topicId: "video-generation", topicLabel: "视频生成", heatMultiplier: 0.5, prepublicationDecayRate: 0.05 },
  };
  return ensureFellowPapers({
    ...base, totalMonths: 1, month: 1, year: 1, eventQueue: [], buffs: [],
    playerName: "张明", player: { ...base.player, research: 10, social: 6, san: 20, money: 20 },
    fellowProgressState: [profile],
    papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 10, experiment: 10, writing: 10 }],
  }, () => 0);
}

function nextMonth(state: GameState, random: () => number = () => 0.5): GameState {
  return advanceFellowResearch({ ...state, totalMonths: state.totalMonths + 1,
    month: state.month === 12 ? 1 : state.month + 1, year: state.year + (state.month === 12 ? 1 : 0),
  }, random);
}

function replacePaper(state: GameState, patch: Partial<Paper>): GameState {
  return { ...state, fellowPapers: [{ ...state.fellowPapers![0]!, ...patch }] };
}

describe("fellow research lifecycle", () => {
  it("waits three full months after submission, blocks editing and exposes the accepted collaboration in results", () => {
    let state = replacePaper(makeState(100), { idea: 100, experiment: 100, writing: 0 });
    const fellowPaper = state.fellowPapers![0]!;
    state = { ...state, fellowPapers: [addPaperCollaboration(fellowPaper, {
      paperId: fellowPaper.id, collaborator: { id: "player", name: "张明" }, scores: { writing: 10 },
    })] };
    const paperId = state.fellowPapers![0]!.id;
    state = nextMonth(state);
    state = { ...state, fellowProgressState: [{ ...state.fellowProgressState[0]!, pendingHelpToFellow: 10 }] };
    const submitted = state.fellowPapers!.find((paper) => paper.id === paperId)!;
    expect(submitted).toMatchObject({ status: "reviewing", reviewMonthsLeft: 3 });
    const snapshot = [submitted.submittedIdea, submitted.submittedExperiment, submitted.submittedWriting];
    const playerPaper = structuredClone(state.papers[0]);
    for (const remaining of [3, 2, 1]) {
      const paper = state.fellowPapers!.find((entry) => entry.id === paperId)!;
      expect(paper).toMatchObject({ status: "reviewing", reviewMonthsLeft: remaining });
      expect([paper.submittedIdea, paper.submittedExperiment, paper.submittedWriting]).toEqual(snapshot);
      const attempted = settlePendingFellowHelp(state, () => 0);
      expect(attempted.fellowPapers).toEqual(state.fellowPapers);
      expect(attempted.papers[0]).toEqual(playerPaper);
      expect(attempted.fellowProgressState[0]!.pendingHelpToFellow).toBe(10);
      expect(applyResearchOperation(state, paperId, "idea").fellowPapers).toEqual(state.fellowPapers);
      expect(state.externalPublications).toHaveLength(0);
      expect(advanceFellowResearch(state)).toBe(state);
      state = nextMonth(state);
    }
    const publication = state.externalPublications.find((paper) => paper.id === paperId)!;
    expect(publication).toMatchObject({ status: "published", nonFirstAuthor: true, leadAuthorName: "林青" });
    expect(publication.title).toBe(fellowPaper.title);
    expect(state.externalPublications.filter((paper) => paper.id === paperId)).toHaveLength(1);
    expect(state.totalResearchScore).toBe(0);
  });
  it("retains the person's direction and heat across acceptance, new titles and calendar years", () => {
    let state = replacePaper(makeState(), { idea: 100, experiment: 100, writing: 100 });
    const profile = state.fellowProgressState[0]!;
    const first = state.fellowPapers![0]!;
    expect(first).toMatchObject(profile.researchTopic!);
    state = { ...state, fellowPapers: [{ ...prepareConferenceSubmission(first, "A", 1, 1), reviewMonthsLeft: 1 }] };
    const next = advanceFellowResearch({ ...state, totalMonths: 36, year: 3, month: 12 }, () => 0.8);
    const draft = getFellowCurrentPaper(next, profile.id)!;
    expect(draft).toMatchObject(profile.researchTopic!);
    expect(draft.title).not.toBe(first.title);
    expect(draft.id).not.toBe(first.id);
    expect(next.fellowProgressState[0]!.researchTopic).toEqual(profile.researchTopic);
    expect(next.fellowPapers!.find((paper) => paper.id === first.id)).toMatchObject(profile.researchTopic!);
  });

  it("keeps the current direction when initializing an older fellow without topic metadata", () => {
    const state = makeState();
    const profile = { ...state.fellowProgressState[0]!, researchTopic: undefined };
    const restored = ensureFellowPapers({ ...state, fellowProgressState: [profile] });
    expect(restored.fellowProgressState[0]!.researchTopic).toEqual(state.fellowProgressState[0]!.researchTopic);
    expect(restored.fellowPapers).toEqual(state.fellowPapers);
  });
  it("starts research next month, alternates projects and decays scores every month", () => {
    let state = makeState();
    expect(state.fellowPapers).toHaveLength(1);
    expect(advanceFellowResearch(state).fellowPapers![0]).toMatchObject({ idea: 0, experiment: 0, writing: 0 });
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 23, experiment: 0, writing: 0, status: "draft" });
    expect(advanceFellowResearch(state)).toBe(state);
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 22, experiment: 0, writing: 0 });
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 21, experiment: 23, writing: 0 });
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 20, experiment: 22, writing: 0 });
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ writing: 23, status: "reviewing", reviewMonthsLeft: 3 });
    expect(state.fellowPapers![0]!.target).not.toBeNull();
    expect(state.fellowProgressState[0]!.monthlyActivity).toContain("投稿");
    expect(state.player).toEqual(makeState().player);
    expect(state.actionState.used).toBe(0);
  });

  it.each([1, 2, 12])("anchors research to joining at month %s, including across calendar years", (startTotalMonths) => {
    const base = makeState();
    let state: GameState = { ...base, totalMonths: startTotalMonths, month: startTotalMonths,
      fellowProgressState: [{ ...base.fellowProgressState[0]!, startTotalMonths }],
      fellowPapers: [{ ...base.fellowPapers![0]!, createdTotalMonths: startTotalMonths }],
    };
    for (const elapsed of [1, 2, 3, 4]) {
      state = nextMonth(state);
      expect(state.fellowPapers![0]).toMatchObject({
        idea: 24 - elapsed, experiment: elapsed >= 3 ? 26 - elapsed : 0, writing: 0,
      });
      expect(state.fellowProgressState[0]!.taskProgress).toBe(elapsed * 2);
      expect(advanceFellowResearch(state)).toBe(state);
    }
  });

  it.each([2, 3])("researches a replacement draft created at month %s without waiting for join parity", (createdTotalMonths) => {
    const base = makeState();
    let state: GameState = { ...base, totalMonths: createdTotalMonths, month: createdTotalMonths,
      fellowPapers: [{ ...base.fellowPapers![0]!, createdTotalMonths }],
    };
    state = advanceFellowResearch(state, () => 0.5);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 23, experiment: 0, writing: 0 });
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 22, experiment: 0, writing: 0 });
    state = nextMonth(state);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 21, experiment: 23, writing: 0 });
  });

  it("does not catch up missed research operations after skipping a scheduled month", () => {
    const state = advanceFellowResearch({ ...makeState(), totalMonths: 4, month: 4 }, () => 0.5);
    expect(state.fellowPapers![0]).toMatchObject({ idea: 23, experiment: 0, writing: 0 });
    expect(nextMonth(state).fellowPapers![0]).toMatchObject({ idea: 22, experiment: 0, writing: 0 });
  });

  it("keeps automatic fellow research and submission out of the ordinary game log", () => {
    const state = { ...makeState(), log: [{ id: "existing", month: 2, text: "玩家操作" }] };
    const next = advanceFellowResearch(state, () => 0);
    expect(next.log).toEqual(state.log);
  });

  it("chooses the best eligible conference using the same current year and month reference scores", () => {
    for (const year of [1, 4]) {
      const state = { ...makeState(), year, month: 6 };
      for (const total of [3, 20, 40, 60, 100, 160]) {
        const paper = { ...state.fellowPapers![0]!, idea: 1, experiment: 1, writing: total - 2 };
        const expected = (["A", "B", "C"] as const).find((target) => total >= getConferenceInfo(6, target, year).referenceScore) ?? null;
        expect(getFellowSubmissionTarget(state, paper)).toBe(expected);
      }
    }
  });

  it("updates the weakest score below C with the same personal max and proportional decay as players", () => {
    let state = replacePaper(makeState(0), { idea: 4, experiment: 2, writing: 3 });
    const before = state.fellowPapers![0]!;
    const collaborated = addPaperCollaboration(before, { paperId: before.id, collaborator: { id: "player", name: "张明" }, scores: { idea: 2 } });
    state = { ...state, fellowPapers: [collaborated] };
    const decayed = decayUnpublishedPaper(collaborated);
    const playerState = { ...state, player: { ...state.player, research: 0 }, papers: [decayed] };
    const expected = applyResearchOperation(playerState, decayed.id, "experiment", () => 0).papers[0]!;
    const next = nextMonth(state, () => 0);
    expect(next.fellowPapers![0]).toEqual(expected);
    expect(next.fellowPapers![0]!.status).toBe("draft");
    expect(getPaperScoreBreakdown(next.fellowPapers![0]!, "idea").collaboration).toBeGreaterThan(0);
  });

  it("uses combined scores for choosing the weakest dimension and submission eligibility", () => {
    const state = makeState();
    const paper = { ...state.fellowPapers![0]!, idea: 20, experiment: 2, writing: 3, collaborationScores: { idea: 20 } };
    expect(getFellowResearchAction(paper)).toBe("experiment");
    expect(getFellowSubmissionTarget(state, { ...paper, idea: 500, collaborationScores: { idea: 500 } })).toBe("A");
  });

  it("keeps review snapshots frozen and revises and resubmits after shared rejection feedback", () => {
    let state = replacePaper(makeState(0), { idea: 6, experiment: 6, writing: 6, prepublicationDecayRate: 0.15 });
    const submitted = prepareConferenceSubmission(state.fellowPapers![0]!, "A", 1, 1);
    state = { ...state, fellowPapers: [{ ...submitted, reviewMonthsLeft: 1 }] };
    const decayed = decayUnpublishedPaper(state.fellowPapers![0]!);
    const result = resolvePaperReview(decayed, () => 0);
    const rejected = applyRejectedPaperReview(decayed, result.nextPaper.lastReview!);
    const expected = applyResearchOperation({ ...state, player: { ...state.player, research: 0 }, papers: [rejected] },
      rejected.id, getFellowResearchAction(rejected), () => 0).papers[0]!;
    const next = nextMonth(state, () => 0);
    expect(rejected.lastReview?.accepted).toBe(false);
    expect(next.fellowPapers![0]).toEqual(prepareConferenceSubmission(expected, "C", 2, 1));
    expect(next.fellowProgressState[0]?.monthlyActivity).toContain("论文退稿");
    expect(next.fellowPapers![0]!.rejectionCount).toBe(1);
    expect(next.fellowPapers).toHaveLength(1);
    expect(nextMonth(next, () => 0).fellowPapers![0]!.id).toBe(submitted.id);
    expect(next.player).toEqual(state.player);
  });

  it("publishes independently without player rewards and researches the new draft immediately", () => {
    let state = replacePaper(makeState(), { idea: 100, experiment: 100, writing: 100 });
    const submitted = prepareConferenceSubmission(state.fellowPapers![0]!, "A", 1, 1);
    state = { ...state, fellowPapers: [{ ...submitted, reviewMonthsLeft: 1 }] };
    const next = nextMonth(state, () => 0.5);
    expect(next.fellowPapers).toHaveLength(2);
    expect(next.fellowPapers![0]).toMatchObject({ status: "published", publication: { citations: 0, effectiveScore: 300 }, conferenceHandled: false });
    expect(getFellowCurrentPaper(next, state.fellowProgressState[0]!.id)).toMatchObject({ idea: 23, experiment: 0, writing: 0 });
    expect(new Set(next.fellowPapers!.map((paper) => paper.id)).size).toBe(2);
    expect(next.externalPublications).toHaveLength(0);
    expect(next.player).toEqual(state.player);
    expect(next.totalResearchScore).toBe(state.totalResearchScore);
    let later = nextMonth(next);
    expect(getFellowCurrentPaper(later, state.fellowProgressState[0]!.id)).toMatchObject({ idea: 22, experiment: 0, writing: 0 });
    later = nextMonth(later);
    expect(getFellowCurrentPaper(later, state.fellowProgressState[0]!.id)).toMatchObject({ idea: 21, experiment: 23, writing: 0 });
  });

  it("uses shared exposure, citation fractions, promotion and decay without crediting unrelated papers to the player", () => {
    const state = makeState();
    const paper = attachPaperPublication({ ...prepareConferenceSubmission({ ...state.fellowPapers![0]!, idea: 100, experiment: 100, writing: 100 }, "A", 1, 1), status: "published", conferenceHandled: false, conferenceAvailableAtTotalMonths: 5 }, 1, "Oral", 1.2);
    const before = { ...state, totalMonths: 4, month: 4, fellowPapers: [paper] };
    expect(settlePaperCitationMonth(before, paper).amount).toBe(0);
    let next = advanceFellowResearch(attendFellowConferences({ ...before, totalMonths: 5, month: 5 }), () => 0);
    const expected = settlePaperCitationMonth(next, { ...paper, conferenceHandled: true });
    expect(next.fellowPapers![0]).toEqual(expected.paper);
    expect(next.totalCitations).toBe(0);
    for (let month = 0; month < 3; month += 1) {
      const expectedPaper = settlePaperCitationMonth({ ...next, buffs: [] }, next.fellowPapers![0]!).paper;
      next = nextMonth(next, () => 0);
      expect(next.fellowPapers![0]).toEqual(expectedPaper);
    }
    expect(next.fellowPapers![0]!.publication?.effectiveScore).toBe(270);
    expect(next.fellowPapers![0]!.publication?.citations).toBeGreaterThan(0);
  });

  it("publishes helped papers once as non-first-author results, retaining authors even after ending cooperation", () => {
    let state = replacePaper(makeState(), { idea: 100, experiment: 100, writing: 100 });
    const paper = state.fellowPapers![0]!;
    const helped = addPaperCollaboration(paper, { paperId: paper.id, collaborator: { id: "player", name: "张明" }, scores: { writing: 10 } });
    state = { ...state, fellowPapers: [{ ...prepareConferenceSubmission(helped, "A", 1, 1), reviewMonthsLeft: 1 }] };
    state = { ...state, player: { ...state.player, social: 5 }, relationshipState: { ...state.relationshipState, unlockedSlots: 2 } };
    state = endRelationship(state, state.fellowProgressState[0]!.id);
    const next = nextMonth(state, () => 0.5);
    expect(next.externalPublications).toHaveLength(1);
    expect(next.externalPublications[0]).toMatchObject({ id: paper.id, nonFirstAuthor: true, leadAuthorName: "林青", collaborators: [{ id: "player", name: "张明" }] });
    expect(next.fellowPapers).toHaveLength(0);
    expect(next.totalResearchScore).toBe(0);
    expect(next.publicationTalentState?.claimedIds).toContain("first-coauthor-paper");
    expect(next.publicationTalentState?.claimedIds).not.toContain("first-paper");
    expect(next.relationshipState.unlockedSlots).toBe(3);
    const atConference = attendFellowConferences({ ...next, totalMonths: 5, month: 5 });
    const settled = settlePublishedPaperCitations(atConference).state;
    expect(settled.totalCitations).toBe(settled.externalPublications[0]!.publication!.citations);
    expect(settled.totalCitations).toBeGreaterThan(0);
  });
});

describe("fellow reciprocal cooperation", () => {
  it.each(["draft", "reviewing"] as const)("allows task progress with a %s paper and pending events without editing papers", (status) => {
    const base = replacePaper(makeState(), { status, reviewMonthsLeft: status === "reviewing" ? 3 : 0 });
    const profile = base.fellowProgressState[0]!;
    const state = {
      ...base, papers: [], fellowProgressState: [profile],
      eventQueue: [createEventQueueItem({
        id: "pending-discussion-test", title: "待办", description: "", source: "system", blocking: true, deadlineMonths: 0,
        chainId: "pending-discussion-test", stage: "act1",
        choices: [{ id: "continue", label: "继续", outcome: "", effects: {} }],
      }, 1)],
    };
    const paid = advanceFellowTask(state, profile.id, () => 0.5);
    expect(paid.fellowProgressState[0]).toMatchObject({ taskProgress: 13, taskUsedThisMonth: true });
    expect(paid.player.san).toBe(state.player.san - getFellowDiscussionSanCost(state, profile));
    expect(paid.eventQueue).toEqual(state.eventQueue);
    expect(paid.fellowPapers).toEqual(state.fellowPapers);
    expect(paid.papers).toEqual([]);
    expect(advanceFellowTask(paid, profile.id)).toBe(paid);
    expect(dispatchAction(state, "relationship-task", { relationshipId: profile.id }).fellowProgressState[0]!.taskUsedThisMonth).toBe(true);
  });
  it("applies illness before AI and seasonal cost adjustments", () => {
    const base = makeState();
    const state = { ...base, month: 8, buffs: [{
      id: "discussion-cost", name: "讨论消耗", source: "测试", timing: "monthly" as const,
      remainingMonths: null, activeOperationSanMultiplier: 2, relationshipOperationSanDelta: -1,
    }] };
    expect(getFellowDiscussionSanCost(state, state.fellowProgressState[0]!)).toBe(4);
  });

  it("charges SAN once monthly for discussion without adding paper scores", () => {
    const state = makeState();
    const profile = state.fellowProgressState[0]!;
    const cost = getFellowDiscussionSanCost(state, profile);
    const next = advanceFellowTask(state, profile.id, () => 0.5);
    expect(next.fellowProgressState[0]).toMatchObject({ taskProgress: 13, taskUsedThisMonth: true });
    expect(next.player.san).toBe(state.player.san - cost);
    expect(next.fellowPapers).toEqual(state.fellowPapers);
    expect(next.papers).toEqual(state.papers);
    expect(advanceFellowTask(next, profile.id)).toBe(next);
    expect(advanceFellowTask({ ...state, player: { ...state.player, san: 0 } }, profile.id).fellowProgressState).toEqual(state.fellowProgressState);
  });

  it("automatically adds affinity only from the month after joining and never twice in one month", () => {
    const initial = makeState();
    expect(initial.fellowProgressState[0]!.taskMax).toBe(100);
    const joined = advanceFellowResearch(initial, () => 0);
    expect(joined.fellowProgressState[0]!.taskProgress).toBe(0);
    const state = {
      ...joined,
      fellowProgressState: [{ ...joined.fellowProgressState[0]!, taskUsedThisMonth: true }],
    };
    const next = nextMonth(state, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ taskProgress: 2, taskUsedThisMonth: false, affinity: 2 });
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
    const discussed = advanceFellowTask(next, next.fellowProgressState[0]!.id, () => 0);
    expect(discussed.fellowProgressState[0]!.taskProgress).toBe(12);
    expect(advanceFellowResearch(discussed, () => 0).fellowProgressState[0]!.taskProgress).toBe(12);
    expect(nextMonth(discussed, () => 0).fellowProgressState[0]).toMatchObject({ taskProgress: 14, taskUsedThisMonth: false });
  });

  it("completes monthly cooperation with retained excess and unchanged rapport next month", () => {
    const base = makeState();
    const state = {
      ...base,
      papers: [],
      fellowPapers: [prepareConferenceSubmission({ ...base.fellowPapers![0]!, idea: 10, experiment: 10, writing: 10 }, "A", 1, 1)],
      fellowProgressState: [{ ...base.fellowProgressState[0]!, taskProgress: 99 }],
    };
    const next = nextMonth(state, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({
      taskProgress: 1, affinity: 2, pendingHelpToPlayer: 20, pendingHelpToFellow: 10,
    });
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
    expect(nextMonth(next, () => 0).fellowProgressState[0]).toMatchObject({ taskProgress: 3, affinity: 2 });
  });

  it("engine creates fellow papers on joining and advances through the real month pipeline", () => {
    const base = { ...createStartedGameState("normal"), totalMonths: 1, month: 1, year: 1, eventQueue: [] };
    const joined = dispatchAction(base, "debug-add-relationship", { debugRelationshipType: "peer" });
    expect(joined.fellowPapers).toHaveLength(1);
    const next = dispatchAction(joined, "next-month");
    expect(next.fellowPapers![0]!.idea).toBeGreaterThan(0);
    expect(next.fellowProgressState[0]?.nextMonthlyAction).toBe("project");
    const projectMonth = dispatchAction({ ...next, eventQueue: [] }, "next-month");
    expect(projectMonth.fellowPapers![0]).toEqual(decayUnpublishedPaper(next.fellowPapers![0]!));
    expect(projectMonth.fellowProgressState[0]?.monthlyActivity).toMatch(/[横纵]向进度\+/);
  });

  it("waits until the month after attending to earn citations, matching the player conference timeline", () => {
    const base = makeState();
    const paper = attachPaperPublication({
      ...prepareConferenceSubmission({ ...base.fellowPapers![0]!, idea: 100, experiment: 100, writing: 100 }, "A", 1, 1),
      status: "published", conferenceHandled: false, conferenceAvailableAtTotalMonths: 5,
    }, 1, "Oral", 1.2);
    const state = { ...base, totalMonths: 4, month: 4, fellowPapers: [{ ...paper, publication: { ...paper.publication!, monthsSincePublish: 2 } }] };
    const atConference = dispatchAction(state, "next-month");
    expect(atConference.fellowPapers![0]).toMatchObject({ conferenceHandled: true, publication: { citations: 0 } });
    const afterConference = dispatchAction({ ...atConference, eventQueue: [] }, "next-month");
    expect(afterConference.fellowPapers![0]!.publication!.citations).toBeGreaterThan(0);
    expect(afterConference.totalCitations).toBe(0);
  });
});
