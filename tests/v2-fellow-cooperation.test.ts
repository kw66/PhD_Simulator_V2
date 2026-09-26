import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { advanceFellowTask } from "../src/core/v2-fellow-actions";
import { advanceFellowCooperation, settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers, getFellowCurrentPaper } from "../src/core/v2-fellow-research";
import { addPaperCollaboration, getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import type { FellowProgressProfile, FellowTypeId, GameState, Paper } from "../src/core/v2-types";

function makeState(type: FellowTypeId = "peer"): GameState {
  const base = createStartedGameState("normal");
  const profile = createCustomFellowProgressProfile({
    type, gender: "female", name: "林青", research: 20, affinity: 2, startTotalMonths: 1,
  });
  return ensureFellowPapers({
    ...base, totalMonths: 1, month: 1, year: 1, eventQueue: [], buffs: [], playerName: "张明",
    player: { ...base.player, research: 10, social: 6, san: 20, money: 20 },
    fellowProgressState: [profile],
    papers: [makePaper(0, 10, 10, 10)],
  }, () => 0);
}

function makePaper(slot: number, idea: number, experiment: number, writing: number): Paper {
  return { ...createDraftPaper(1, slot, () => 0), idea, experiment, writing, prepublicationDecayRate: 0 };
}

function withPending(state: GameState, pending: Partial<FellowProgressProfile>): GameState {
  return { ...state, fellowProgressState: [{ ...state.fellowProgressState[0]!, ...pending }] };
}

function scores(paper: Paper): number[] {
  return [paper.idea, paper.experiment, paper.writing];
}

afterEach(() => vi.restoreAllMocks());

describe("fellow cooperation completion", () => {
  it("retains excess progress and snapshots both researchers at completion", () => {
    const profile = { ...makeState().fellowProgressState[0]!, taskProgress: 99 };
    const next = advanceFellowCooperation(profile, 14, 10);
    expect(next).toMatchObject({ taskMax: 100, taskProgress: 13, affinity: 2, pendingHelpToPlayer: 20, pendingHelpToFellow: 10 });
    expect(profile).toMatchObject({ taskProgress: 99, affinity: 2 });
  });

  it("stores at most one help per direction without replacing existing snapshots", () => {
    const profile = { ...makeState().fellowProgressState[0]!, taskProgress: 90 };
    const first = advanceFellowCooperation(profile, 215, 10);
    expect(first).toMatchObject({ taskProgress: 5, affinity: 2, pendingHelpToPlayer: 20, pendingHelpToFellow: 10 });
    const second = advanceFellowCooperation({ ...first, research: 90 }, 100, 80);
    expect(second).toMatchObject({ taskProgress: 5, affinity: 2, pendingHelpToPlayer: 20, pendingHelpToFellow: 10 });
  });

  it.each([
    { pendingHelpToPlayer: 7, pendingHelpToFellow: null, expectedPlayer: 7, expectedFellow: 10 },
    { pendingHelpToPlayer: null, pendingHelpToFellow: 8, expectedPlayer: 20, expectedFellow: 8 },
    { pendingHelpToPlayer: 0, pendingHelpToFellow: 0, expectedPlayer: 0, expectedFellow: 0 },
  ])("refills each empty direction independently: %j", (entry) => {
    const profile = { ...makeState().fellowProgressState[0]!, pendingHelpToPlayer: entry.pendingHelpToPlayer, pendingHelpToFellow: entry.pendingHelpToFellow };
    expect(advanceFellowCooperation(profile, 100, 10)).toMatchObject({
      pendingHelpToPlayer: entry.expectedPlayer, pendingHelpToFellow: entry.expectedFellow,
    });
  });

  it("does not grow rapport when completing cooperation", () => {
    const profile = { ...makeState().fellowProgressState[0]!, affinity: 19 };
    const partial = advanceFellowCooperation(profile, 99, 10);
    expect(partial.affinity).toBe(19);
    const completed = advanceFellowCooperation(partial, 201, 10);
    expect(completed).toMatchObject({ taskProgress: 0, affinity: 19 });
    expect(advanceFellowCooperation(completed, 100, 10).affinity).toBe(19);
  });

  it.each([{ roll: 0, gain: 10 }, { roll: 0.999, gain: 15 }])("uses full player research and a zero-to-five roll: %j", ({ roll, gain }) => {
    const state = makeState();
    const next = advanceFellowTask(state, state.fellowProgressState[0]!.id, () => roll);
    expect(next.fellowProgressState[0]!.taskProgress).toBe(gain);
    expect(advanceFellowTask(next, next.fellowProgressState[0]!.id, () => roll)).toBe(next);
  });
});

describe("automatic reciprocal help", () => {
  it("helps the player while the fellow is reviewing and retains only the other direction", () => {
    const base = withPending(makeState("senior"), { pendingHelpToPlayer: 7, pendingHelpToFellow: 8 });
    const reviewing = prepareConferenceSubmission({ ...base.fellowPapers![0]!, idea: 10, experiment: 10, writing: 10 }, "A", 1, 1);
    expect(reviewing.status).toBe("reviewing");
    const state = { ...base, fellowPapers: [reviewing] };
    const next = settlePendingFellowHelp(state, () => 0);
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 10, collaboration: 7, total: 17 });
    expect(next.fellowPapers![0]).toEqual(reviewing);
    expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBeNull();
    expect(next.fellowProgressState[0]!.pendingHelpToFellow).toBe(8);
    const repeated = settlePendingFellowHelp(next, () => 0);
    expect(repeated.papers).toEqual(next.papers);
    expect(repeated.fellowProgressState).toEqual(next.fellowProgressState);
    expect(state.papers[0]!.idea).toBe(10);
  });

  it("helps the fellow without a player draft and automatically retries after creating one", () => {
    const state = { ...withPending(makeState("senior"), { pendingHelpToPlayer: 7, pendingHelpToFellow: 8 }), papers: [] };
    const next = settlePendingFellowHelp(state, () => 0);
    expect(getPaperScoreBreakdown(next.fellowPapers![0]!, "idea")).toEqual({ own: 0, collaboration: 8, total: 8 });
    expect(next.fellowPapers![0]!.collaborators).toEqual([{ id: "player", name: "张明" }]);
    expect(next.fellowProgressState[0]!.pendingHelpToFellow).toBeNull();
    expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBe(7);
    const created = dispatchAction(next, "create-paper", { paperSlotIndex: 0 });
    expect(created.papers[0]).toMatchObject({ idea: 7, experiment: 0, writing: 0 });
    expect(created.fellowProgressState[0]!.pendingHelpToPlayer).toBeNull();
    expect(created.fellowPapers).toEqual(next.fellowPapers);
    expect(dispatchAction(created, "select-paper", { paperId: created.papers[0]!.id }).papers).toEqual(created.papers);
  });

  it("settles despite blocking events, without charging SAN or monthly actions", () => {
    const base = withPending(makeState(), { pendingHelpToPlayer: 20, pendingHelpToFellow: 10 });
    const state = { ...base, eventQueue: [createEventQueueItem({
      id: "pending-help", title: "待办", description: "", source: "system", blocking: true,
      deadlineMonths: 0, chainId: "pending-help", stage: "act1",
      choices: [{ id: "continue", label: "继续", outcome: "", effects: {} }],
    }, 1)] };
    const next = settlePendingFellowHelp(state, () => 0);
    expect(next.papers[0]!.idea).toBe(30);
    expect(next.fellowPapers![0]!.idea).toBe(10);
    expect(next.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null });
    expect(next.eventQueue).toEqual(state.eventQueue);
    expect(next.player).toEqual(state.player);
    expect(next.actionState).toEqual(state.actionState);
  });

  it("consumes zero snapshots without adding authors or scores", () => {
    const state = withPending(makeState(), { pendingHelpToPlayer: 0, pendingHelpToFellow: 0 });
    const next = settlePendingFellowHelp(state, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null });
    expect(next.papers).toEqual(state.papers);
    expect(next.fellowPapers).toEqual(state.fellowPapers);
    expect(next.papers[0]!.collaborators ?? []).toEqual([]);
    expect(next.fellowPapers![0]!.collaborators ?? []).toEqual([]);
  });

  it("uses saved amounts after abilities change and stacks collaboration without a score cap", () => {
    const base = makeState("senior");
    const profile = advanceFellowCooperation(base.fellowProgressState[0]!, 100, 10);
    const state = { ...base, player: { ...base.player, research: 1 },
      fellowProgressState: [{ ...profile, research: 1 }], papers: [makePaper(0, 100, 100, 100)] };
    const first = settlePendingFellowHelp(state, () => 0);
    const next = settlePendingFellowHelp(withPending(first, { pendingHelpToPlayer: 20, pendingHelpToFellow: 10 }), () => 0);
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 100, collaboration: 40, total: 140 });
    expect(next.papers[0]!.collaborators).toHaveLength(1);
    expect(next.fellowPapers![0]!.collaborators).toHaveLength(1);
    expect(next.fellowPapers![0]!.collaborationScores).toEqual({ idea: 10, experiment: 10, writing: 0 });
  });

  it("preserves both pending amounts and all review snapshots until papers become editable", () => {
    const base = withPending(makeState(), { pendingHelpToPlayer: 7, pendingHelpToFellow: 8 });
    const playerDraft = addPaperCollaboration(base.papers[0]!, {
      paperId: base.papers[0]!.id, collaborator: { id: "prior", name: "旧合作者" }, scores: { idea: 4 },
    });
    const state = { ...base,
      papers: [prepareConferenceSubmission(playerDraft, "A", 1, 1)],
      fellowPapers: [prepareConferenceSubmission({ ...base.fellowPapers![0]!, idea: 10, experiment: 10, writing: 10 }, "A", 1, 1)],
    };
    const snapshot = structuredClone(state);
    const next = settlePendingFellowHelp(state, () => 0);
    expect(next.papers).toEqual(snapshot.papers);
    expect(next.fellowPapers).toEqual(snapshot.fellowPapers);
    expect(next.fellowProgressState).toEqual(snapshot.fellowProgressState);
    expect(state).toEqual(snapshot);
  });
});

describe("cooperation field routing", () => {
  it.each([
    { type: "senior" as const, expected: [[10, 40, 5], [20, 3, 70]] },
    { type: "junior" as const, expected: [[10, 40, 5], [20, 23, 50]] },
  ])("chooses one global field for $type across drafts and journal revisions", ({ type, expected }) => {
    const base = withPending(makeState(type), { pendingHelpToPlayer: 20 });
    const state = { ...base, papers: [makePaper(0, 10, 40, 5), { ...makePaper(1, 20, 3, 50), status: "journal-reviewing" as const, journalTarget: "nmi" as const, submittedIdea: 20, submittedExperiment: 3, submittedWriting: 50 }] };
    const next = settlePendingFellowHelp(state, () => 0);
    expect(next.papers.map(scores)).toEqual(expected);
    expect(next.papers[0]!.collaborators ?? []).toEqual([]);
    expect(next.papers[1]).toMatchObject({ submittedIdea: 20, submittedExperiment: 3, submittedWriting: 50 });
  });

  it.each(["senior", "junior"] as const)("breaks %s ties by array paper order then idea, experiment, writing", (type) => {
    const base = withPending(makeState(type), { pendingHelpToPlayer: 20 });
    const state = { ...base, papers: [makePaper(2, 10, 10, 10), makePaper(0, 10, 10, 10)] };
    const next = settlePendingFellowHelp(state, () => 0.999);
    expect(next.papers.map(scores)).toEqual([[30, 10, 10], [10, 10, 10]]);
  });

  it.each([
    { roll: 0, expected: [[20, 0, 0], [10, 0, 0]] },
    { roll: 0.4, expected: [[0, 0, 0], [30, 0, 0]] },
    { roll: 0.999, expected: [[0, 0, 0], [10, 20, 0]] },
  ])("samples peers over all eligible paper-field pairs: $roll", ({ roll, expected }) => {
    const state = { ...withPending(makeState("peer"), { pendingHelpToPlayer: 20 }), papers: [makePaper(0, 0, 0, 0), makePaper(1, 10, 0, 0)] };
    expect(settlePendingFellowHelp(state, () => roll).papers.map(scores)).toEqual(expected);
  });

  it("excludes non-first-author, published and conference-reviewing papers", () => {
    const base = withPending(makeState("senior"), { pendingHelpToPlayer: 20 });
    const excluded = [
      { ...makePaper(0, 900, 900, 900), nonFirstAuthor: true },
      { ...makePaper(1, 800, 800, 800), status: "published" as const },
      prepareConferenceSubmission(makePaper(2, 700, 700, 700), "A", 1, 1),
    ];
    const next = settlePendingFellowHelp({ ...base, papers: [...excluded, makePaper(3, 1, 1, 1)] }, () => 0);
    expect(next.papers.slice(0, 3)).toEqual(excluded);
    expect(scores(next.papers[3]!)).toEqual([21, 1, 1]);
  });

  it("uses combined scores and preserves the player's own contribution", () => {
    const base = withPending(makeState("senior"), { pendingHelpToPlayer: 20 });
    const paper = addPaperCollaboration(makePaper(0, 1, 15, 15), { paperId: base.papers[0]!.id, collaborator: { id: "prior", name: "旧合作者" }, scores: { idea: 20 } });
    const next = settlePendingFellowHelp({ ...base, papers: [paper] }, () => 0);
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 1, collaboration: 40, total: 41 });
    expect(scores(next.papers[0]!)).toEqual([41, 15, 15]);
  });

  it.each([
    { idea: 5, experiment: 5, writing: 5, collaborationScores: undefined, field: "idea" as const },
    { idea: 30, experiment: 8, writing: 8, collaborationScores: { idea: 25 }, field: "experiment" as const },
    { idea: 0, experiment: 0, writing: 0, collaborationScores: undefined, field: "idea" as const },
  ])("helps the fellow's minimum combined eligible field: $field", ({ field, ...patch }) => {
    const base = withPending(makeState(), { pendingHelpToFellow: 10 });
    const paper = { ...base.fellowPapers![0]!, ...patch };
    const next = settlePendingFellowHelp({ ...base, fellowPapers: [paper] }, () => 0);
    const expected = addPaperCollaboration(paper, { paperId: paper.id, collaborator: { id: "player", name: "张明" }, scores: { [field]: 10 } });
    expect(next.fellowPapers![0]).toEqual(expected);
  });
});

describe("engine and research lifecycle retries", () => {
  it("retries after research unlocks another field without consuming the same help twice", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = { ...withPending(makeState("junior"), { pendingHelpToPlayer: 20 }), papers: [makePaper(0, 0, 0, 0)] };
    const next = dispatchAction(state, "research-paper", { paperId: state.papers[0]!.id, paperActionType: "idea" });
    expect(next.papers[0]!.idea).toBeGreaterThan(0);
    expect(getPaperScoreBreakdown(next.papers[0]!, "experiment")).toEqual({ own: 0, collaboration: 20, total: 20 });
    expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBeNull();
    expect(dispatchAction(next, "select-paper", { paperId: next.papers[0]!.id }).papers).toEqual(next.papers);
  });

  it("resumes player help automatically when conference review ends in rejection", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = withPending(makeState("senior"), { pendingHelpToPlayer: 20 });
    const submitted = { ...prepareConferenceSubmission(makePaper(0, 1, 1, 1), "A", 1, 1), reviewMonthsLeft: 1 };
    let next = dispatchAction({ ...base, papers: [submitted] }, "next-month");
    for (const stage of ["act1", "act2", "result"]) {
      const event = next.eventQueue.find((entry) => entry.chainId === `paper-review-result-${submitted.id}`)!;
      expect(event.stage).toBe(stage);
      expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBe(20);
      next = dispatchAction(next, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    expect(next.papers[0]).toMatchObject({ status: "draft", lastReview: { accepted: false } });
    expect(Object.values(next.papers[0]!.collaborationScores ?? {}).reduce((total, amount) => total + amount, 0)).toBe(20);
    expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBeNull();
  });

  it.each([true, false])("resumes player-to-fellow help after review acceptance=%s", (accepted) => {
    const base = withPending(makeState(), { pendingHelpToFellow: 10 });
    const score = accepted ? 100 : 1;
    const submitted = { ...prepareConferenceSubmission({ ...base.fellowPapers![0]!, idea: score, experiment: score, writing: score }, "A", 1, 1), reviewMonthsLeft: 1 };
    const next = advanceFellowResearch({ ...base, totalMonths: 2, month: 2, fellowPapers: [submitted] }, () => 0);
    const draft = getFellowCurrentPaper(next, base.fellowProgressState[0]!.id)!;
    expect(draft.status).toBe(accepted ? "draft" : "reviewing");
    expect(draft.id === submitted.id).toBe(!accepted);
    expect(Object.values(draft.collaborationScores ?? {}).reduce((total, amount) => total + amount, 0)).toBe(10);
    expect(draft.collaborators).toEqual([{ id: "player", name: "张明" }]);
    expect(next.fellowProgressState[0]!.pendingHelpToFellow).toBeNull();
  });

  it("settles help before choosing automatic research and freezes it into submission", () => {
    const base = withPending(makeState(), { pendingHelpToFellow: 10, nextMonthlyAction: "project" });
    const paper = { ...base.fellowPapers![0]!, idea: 0, experiment: 100, writing: 100, prepublicationDecayRate: 0 };
    const helped = advanceFellowResearch({ ...base, totalMonths: 2, month: 2, fellowPapers: [paper] }, () => 0);
    expect(helped.fellowPapers![0]).toMatchObject({ status: "draft", idea: 10 });
    expect(getPaperScoreBreakdown(helped.fellowPapers![0]!, "idea")).toEqual({ own: 0, collaboration: 10, total: 10 });
    expect(helped.fellowProgressState[0]!.pendingHelpToFellow).toBeNull();
    const next = advanceFellowResearch({ ...helped, totalMonths: 3, month: 3 }, () => 0);
    const submitted = next.fellowPapers![0]!;
    expect(submitted.status).toBe("reviewing");
    expect(submitted.submittedCollaborationScores).toEqual({ idea: 9, experiment: 0, writing: 0 });
    expect(getPaperScoreBreakdown(submitted, "idea")).toEqual({ own: 10, collaboration: 9, total: 19 });
    expect(submitted.submittedIdea).toBe(19);
    expect(next.fellowProgressState[0]!.pendingHelpToFellow).toBeNull();
  });

  it.each(["research", "project"] as const)("settles newly completed monthly help before the %s action", (nextMonthlyAction) => {
    const base = withPending(makeState(), { taskProgress: 99, nextMonthlyAction });
    const next = advanceFellowResearch({ ...base, totalMonths: 2, month: 2,
      fellowPapers: [{ ...base.fellowPapers![0]!, prepublicationDecayRate: 0 }],
    }, () => 0);
    expect(next.fellowPapers![0]).toMatchObject({ idea: 10, experiment: nextMonthlyAction === "research" ? 10 : 0, writing: 0 });
    expect(next.fellowProgressState[0]).toMatchObject({ taskProgress: 1, affinity: 2, pendingHelpToPlayer: null, pendingHelpToFellow: null });
    expect(advanceFellowResearch(next, () => 0).fellowPapers).toEqual(next.fellowPapers);
  });

  it("archives a journal revision when automatic help reaches the acceptance threshold", () => {
    const base = withPending(makeState("senior"), { pendingHelpToPlayer: 20 });
    const paper = { ...makePaper(0, 40, 40, 40), status: "journal-reviewing" as const,
      journalTarget: "pami" as const, submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40,
    };
    const next = dispatchAction({ ...base, papers: [paper] }, "select-paper", { paperId: paper.id });
    expect(next.papers).toHaveLength(0);
    const published = next.externalPublications.find((entry) => entry.id === paper.id)!;
    expect(published).toMatchObject({ status: "published", journalTarget: "pami", idea: 60, experiment: 40, writing: 40 });
    expect(published.collaborators).toEqual([{ id: base.fellowProgressState[0]!.id, name: "林青" }]);
    expect(next.fellowProgressState[0]!.pendingHelpToPlayer).toBeNull();
    expect(dispatchAction(next, "select-paper", { paperId: paper.id }).externalPublications).toEqual(next.externalPublications);
  });

  it("credits a journal accepted through monthly cooperation before checking graduation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = withPending(makeState("senior"), { taskProgress: 99 });
    const paper = { ...makePaper(0, 40, 40, 40), status: "journal-reviewing" as const,
      journalTarget: "pami" as const, submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40,
    };
    const next = dispatchAction({ ...base, totalMonths: 35, year: 3, month: 11,
      maxMonths: 36, graduationScoreTarget: 5, papers: [paper],
    }, "next-month");
    expect(next.externalPublications.find((entry) => entry.id === paper.id)?.status).toBe("published");
    expect(next.totalResearchScore).toBe(5);
    expect(next.ending).not.toBe("delay");
  });

  it("settles pending journal help before graduation when resolving the final event", () => {
    const base = withPending(makeState("senior"), { pendingHelpToPlayer: 20 });
    const paper = { ...makePaper(0, 40, 40, 40), status: "journal-reviewing" as const,
      journalTarget: "pami" as const, submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40,
    };
    const event = createEventQueueItem({
      id: "final-cooperation", title: "最后一件事", description: "", source: "system", blocking: true,
      deadlineMonths: 0, chainId: "final-cooperation", stage: "result",
      choices: [{ id: "finish", label: "完成", outcome: "", effects: {} }],
    }, 36);
    const next = dispatchAction({ ...base, totalMonths: 36, maxMonths: 36, graduationScoreTarget: 5,
      papers: [paper], eventQueue: [event],
    }, "resolve-event", { eventId: event.id, eventChoiceId: "finish" });
    expect(next.externalPublications.find((entry) => entry.id === paper.id)?.status).toBe("published");
    expect(next.ending).toBe("master");
  });
});
