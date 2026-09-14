import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createEventQueueItem, discardBlockingQueueEvents } from "../src/core/v2-event-queue";
import { createThreeStageEvent } from "../src/core/v2-random-events-core-shared";
import { createDataLossRandomEvent } from "../src/core/v2-random-events-core-progress";
import { addPaperCollaboration, getPaperScoreBreakdown, setPaperTotalScore } from "../src/core/v2-paper-collaboration";
import { applyPrepublicationPaperDecay, createDraftPaper, submitPaper, withdrawPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import { applyPaperCompetitionResolution } from "../src/core/v2-paper-competition";
import { getAcceptedPaperScore } from "../src/core/v2-publication-rules";
import { getJournalRevisionScore, submitJournalPaper } from "../src/core/v2-journal-system";
import { getAiModelForTotalMonths, polishUnsubmittedPapers } from "../src/core/v2-ai-shop";
import { endRelationship } from "../src/core/v2-relationship-actions";
import { activateLover } from "../src/core/v2-lover-system";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import type { GameState, Paper, PaperActionType, PaperCollaborationEffect, PendingEvent } from "../src/core/v2-types";

function makePaper(overrides: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(6, 0, () => 0), idea: 20, experiment: 20, writing: 20, prepublicationDecayRate: 0.1, ...overrides };
}

function makeState(paper = makePaper()): GameState {
  const state = createStartedGameState("normal");
  return {
    ...state, month: 6, totalMonths: 6, selectedAdvisorName: "测试导师", eventQueue: [],
    player: { ...state.player, research: 20, san: 20, money: 20 },
    papers: [paper], selectedPaperId: paper.id, buffs: [],
  };
}

function assistance(paper: Paper, scores: PaperCollaborationEffect["scores"], id = "peer-one"): PaperCollaborationEffect {
  return { paperId: paper.id, collaborator: { id, name: id === "peer-one" ? "林知远" : "陈思宁" }, scores };
}

function resolveFirst(state: GameState): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
}

function makeCollaborationEvent(paper: Paper): PendingEvent {
  return createThreeStageEvent({
    id: "collaboration", title: "合作", description: "", chainId: "collaboration", source: "system",
    stage: "act1", blocking: true, deadlineMonths: 0,
    choices: [{ id: "help", label: "合作", outcome: "SAN-1，idea+10", effects: { san: -1, paperCollaborations: [assistance(paper, { idea: 10 })] } }],
  }, {
    introDescription: "一起讨论", decisionTitle: "选择", decisionDescription: "讨论论文",
    results: { help: { title: "完成", description: "思路清晰了" } },
  });
}

describe("paper collaboration scores", () => {
  it("treats legacy scores as personal work without changing the paper", () => {
    const paper = makePaper({ collaborationScores: undefined, collaborators: undefined });
    expect(getPaperScoreBreakdown(paper, "idea")).toEqual({ own: 20, collaboration: 0, total: 20 });
    expect(paper.collaborationScores).toBeUndefined();
  });

  it("stacks repeated help and different collaborators in one pool with a unique name list", () => {
    const paper = makePaper();
    const first = addPaperCollaboration(paper, assistance(paper, { experiment: 6 }));
    const second = addPaperCollaboration(first, assistance(paper, { experiment: 8, writing: 3 }));
    const third = addPaperCollaboration(second, assistance(paper, { experiment: 5 }, "peer-two"));
    expect(getPaperScoreBreakdown(third, "experiment")).toEqual({ own: 20, collaboration: 19, total: 39 });
    expect(third.collaborationScores).toEqual({ idea: 0, experiment: 19, writing: 3 });
    expect(third.collaborators).toEqual([{ id: "peer-one", name: "林知远" }, { id: "peer-two", name: "陈思宁" }]);
    expect(paper.experiment).toBe(20);
    let repeated = third;
    for (let iteration = 0; iteration < 100; iteration++) {
      repeated = addPaperCollaboration(repeated, assistance(paper, { experiment: 10 }));
    }
    expect(repeated.experiment).toBe(1039);
    expect(repeated.collaborators).toHaveLength(2);
  });

  it.each(["idea", "experiment", "writing"] as const)("compares only personal %s scores and keeps collaboration outside buffs", (field) => {
    const paper = addPaperCollaboration(makePaper(), assistance(makePaper(), { [field]: 15 }));
    const next = applyResearchOperation(makeState(paper), paper.id, field, () => 0.8);
    expect(getPaperScoreBreakdown(next.papers[0]!, field)).toEqual({ own: 30, collaboration: 15, total: 45 });
    const lowerRoll = applyResearchOperation({ ...next, actionState: { ...next.actionState, used: 0 } }, paper.id, field, () => 0);
    expect(getPaperScoreBreakdown(lowerRoll.papers[0]!, field)).toEqual({ own: 31, collaboration: 15, total: 46 });
    const buffedState = { ...makeState(paper), buffs: [{ id: "boost", name: "boost", source: "test", timing: "permanent" as const, remainingMonths: null, actionEffects: { [field]: { multiplier: 2 } } }] };
    const buffed = applyResearchOperation(buffedState, paper.id, field, () => 0.8);
    expect(getPaperScoreBreakdown(buffed.papers[0]!, field)).toEqual({ own: 60, collaboration: 15, total: 75 });
  });

  it("uses successive personal scores for extra research executions", () => {
    const paper = addPaperCollaboration(makePaper(), assistance(makePaper(), { idea: 15 }));
    const state = makeState(paper);
    state.buffs = [{ id: "extra", name: "extra", source: "test", timing: "permanent", remainingMonths: null, actionEffects: { idea: { extraActions: 1 } } }];
    const next = applyResearchOperation(state, paper.id, "idea", () => 0.8);
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 31, collaboration: 15, total: 46 });
    expect(next.actionState.used).toBe(state.actionState.used + 1);
    expect(next.player.san).toBe(state.player.san - 2);
  });

  it("decays the combined score once and apportions integer loss between two pools", () => {
    const paper = makePaper({ idea: 40, experiment: 10, writing: 4, collaborationScores: { idea: 20, experiment: 3, writing: 2 } });
    const next = applyPrepublicationPaperDecay(makeState(paper)).papers[0]!;
    expect(getPaperScoreBreakdown(next, "idea")).toEqual({ own: 18, collaboration: 18, total: 36 });
    expect(getPaperScoreBreakdown(next, "experiment")).toEqual({ own: 6, collaboration: 3, total: 9 });
    expect(getPaperScoreBreakdown(next, "writing")).toEqual({ own: 1, collaboration: 2, total: 3 });
    expect(paper.collaborationScores).toEqual({ idea: 20, experiment: 3, writing: 2 });
  });

  it("keeps only one point per combined score, permits empty pools, and retains names", () => {
    let paper = makePaper({ idea: 2, experiment: 2, writing: 0, collaborationScores: { idea: 1, experiment: 2 }, collaborators: [{ id: "peer-one", name: "林知远" }] });
    for (let month = 0; month < 12; month++) paper = applyPrepublicationPaperDecay(makeState(paper)).papers[0]!;
    expect(paper).toMatchObject({ idea: 1, experiment: 1, writing: 0 });
    expect(getPaperScoreBreakdown(paper, "idea").own).toBe(0);
    expect(paper.collaborators).toEqual([{ id: "peer-one", name: "林知远" }]);
    for (const own of [0, 1, 2, 7, 20, 100]) {
      for (const collaboration of [0, 1, 3, 20, 70]) {
        const total = own + collaboration;
        const sample = makePaper({ idea: total, collaborationScores: { idea: collaboration } });
        const next = applyPrepublicationPaperDecay(makeState(sample)).papers[0]!;
        const breakdown = getPaperScoreBreakdown(next, "idea");
        expect(breakdown.own + breakdown.collaboration).toBe(next.idea);
        expect(breakdown.own).toBeGreaterThanOrEqual(0);
        expect(breakdown.collaboration).toBeGreaterThanOrEqual(0);
        expect(breakdown.own).toBeLessThanOrEqual(own);
        expect(breakdown.collaboration).toBeLessThanOrEqual(collaboration);
        expect(next.idea).toBeGreaterThanOrEqual(total > 0 ? 1 : 0);
      }
    }
  });

  it.each(["reviewing", "published"] as const)("does not add active assistance to a %s manuscript", (status) => {
    const paper = makePaper({ status });
    expect(addPaperCollaboration(paper, assistance(paper, { idea: 10 }))).toBe(paper);
  });

  it("does not credit empty, negative or invalid assistance, nonfirst papers or the wrong paper", () => {
    const paper = makePaper();
    expect(addPaperCollaboration(paper, assistance(paper, { idea: 0, experiment: -3, writing: NaN }))).toBe(paper);
    expect(addPaperCollaboration(paper, { ...assistance(paper, { idea: 3 }), paperId: "missing" })).toBe(paper);
    expect(addPaperCollaboration(paper, { ...assistance(paper, { idea: 3 }), collaborator: { id: "", name: "" } })).toBe(paper);
    const nonFirst = { ...paper, nonFirstAuthor: true };
    expect(addPaperCollaboration(nonFirst, assistance(paper, { idea: 3 }))).toBe(nonFirst);
  });

  it("preserves submitted totals during proportional competition events and monthly decay", () => {
    const paper = addPaperCollaboration(makePaper(), assistance(makePaper(), { idea: 20, experiment: 10 }));
    const submitted = submitPaper(makeState(paper), paper.id, "A");
    const decayed = applyPrepublicationPaperDecay(submitted);
    const adjusted = applyPaperCompetitionResolution(decayed, { paperId: paper.id, field: "idea", multiplier: 0.5, sanCost: 1 }).nextState;
    expect(getPaperScoreBreakdown(adjusted.papers[0]!, "idea")).toEqual({ own: 9, collaboration: 9, total: 18 });
    expect(getAcceptedPaperScore(adjusted.papers[0]!)).toBe(90);
    const withdrawn = withdrawPaper(adjusted, paper.id).papers[0]!;
    expect(withdrawn).toMatchObject({ idea: 18, collaborationScores: { idea: 9 }, status: "draft" });
    expect(withdrawn.collaborators).toEqual(paper.collaborators);
    expect(withdrawn.submittedCollaborationScores).toBeNull();
  });

  it("applies increases and decreases to collaboration when an event scales the whole score", () => {
    const paper = makePaper({ idea: 40, collaborationScores: { idea: 20 } });
    const next = applyPaperCompetitionResolution(makeState(paper), { paperId: paper.id, field: "idea", multiplier: 1.25, sanCost: 6 }).nextState.papers[0]!;
    expect(getPaperScoreBreakdown(next, "idea")).toEqual({ own: 25, collaboration: 25, total: 50 });
    expect(getPaperScoreBreakdown(setPaperTotalScore(next, "idea", 0), "idea")).toEqual({ own: 0, collaboration: 0, total: 0 });
  });

  it("retains review feedback as personal improvement after rejection", () => {
    const paper = makePaper({ idea: 2, experiment: 2, writing: 2, collaborationScores: { idea: 1, experiment: 1, writing: 1 } });
    const submitted = submitPaper(makeState(paper), paper.id, "A");
    submitted.papers[0]!.reviewMonthsLeft = 0;
    let queued = resolveDuePaperReviews(submitted, () => 0.65).state;
    for (let stage = 0; stage < 3; stage++) queued = resolveFirst(queued);
    expect(queued.papers[0]!.status).toBe("draft");
    expect(queued.papers[0]!.collaborationScores).toEqual(paper.collaborationScores);
    expect(queued.papers[0]!.lastReview?.accepted).toBe(false);
    expect(["idea", "experiment", "writing"].some((field) => getPaperScoreBreakdown(queued.papers[0]!, field as PaperActionType).own > 1)).toBe(true);
  });

  it("keeps journal revision work additive, decay-free and restores the split on withdrawal", () => {
    const paper = makePaper({ idea: 40, experiment: 40, writing: 40, collaborationScores: { idea: 10, experiment: 10, writing: 10 } });
    const submitted = submitJournalPaper(makeState(paper), paper.id, "nmi");
    const helped = addPaperCollaboration(submitted.papers[0]!, assistance(paper, { idea: 10 }));
    expect(getJournalRevisionScore(helped)).toBe(130);
    const researched = applyResearchOperation({ ...submitted, papers: [helped] }, paper.id, "idea", () => 0);
    expect(getJournalRevisionScore(researched.papers[0]!)).toBe(131);
    const decayed = applyPrepublicationPaperDecay(researched);
    expect(decayed.papers[0]).toEqual(researched.papers[0]);
    const withdrawn = withdrawPaper(decayed, paper.id).papers[0]!;
    expect(withdrawn).toMatchObject({ idea: 40, experiment: 40, writing: 40, collaborationScores: { idea: 10, experiment: 10, writing: 10 } });
    expect(withdrawn.collaborators).toEqual(helped.collaborators);
  });

  it("lets collaboration complete journal revision through the event settlement pipeline", () => {
    const paper = makePaper({ idea: 40, experiment: 40, writing: 40 });
    const state = submitJournalPaper(makeState(paper), paper.id, "nmi");
    const event = {
      id: "help-journal", title: "合作", description: "共同修改", source: "system" as const,
      chainId: "help-journal", stage: "result" as const, blocking: true, deadlineMonths: 0,
      choices: [{ id: "confirm", label: "确认", outcome: "修改完成", effects: { paperCollaborations: [assistance(paper, { idea: 130 })] } }],
    };
    const next = resolveFirst({ ...state, eventQueue: [createEventQueueItem(event, 1)] });
    expect(next.papers).toHaveLength(0);
    expect(next.externalPublications[0]).toMatchObject({ status: "published", collaborationScores: { idea: 130 }, collaborators: [{ id: "peer-one", name: "林知远" }] });
    expect(next.externalPublications[0]?.publication?.effectiveScore).toBe(250);
  });

  it("clears both score pools on data loss and apportions general paper updates", () => {
    const paper = addPaperCollaboration(makePaper(), assistance(makePaper(), { idea: 20 }));
    const state = makeState(paper);
    const updated = applyChoiceEffectsToState(state, { id: "update", label: "update", outcome: "", effects: { paperUpdates: [{ id: paper.id, idea: 20 }] } }).nextState;
    expect(getPaperScoreBreakdown(updated.papers[0]!, "idea")).toEqual({ own: 10, collaboration: 10, total: 20 });
    const cleared = applyChoiceEffectsToState(state, { id: "clear", label: "clear", outcome: "", effects: { clearDraftProgress: true } }).nextState;
    expect(cleared.papers[0]).toMatchObject({ idea: 0, experiment: 0, writing: 0, collaborationScores: { idea: 0, experiment: 0, writing: 0 } });
    expect(cleared.papers[0]!.collaborators).toEqual(paper.collaborators);
  });

  it("does not apply AI polish to the collaboration pool", () => {
    const paper = addPaperCollaboration(makePaper(), assistance(makePaper(), { idea: 20 }));
    const model = getAiModelForTotalMonths(0, "claude");
    const polished = polishUnsubmittedPapers([paper], model).papers[0]!;
    expect(polished.collaborationScores).toEqual(paper.collaborationScores);
    expect(getPaperScoreBreakdown(polished, "idea").own).toBe(20 + (model.researchEffects.idea?.bonus ?? 0));
  });

  it("retains paper contributions and the name list after ending the relationship", () => {
    const paper = addPaperCollaboration(makePaper(), assistance(makePaper(), { idea: 10 }, "lover"));
    const state = makeState(paper);
    const next = endRelationship({ ...state, loverState: activateLover("smart", 6, "male"), relationshipState: { ...state.relationshipState, loverCount: 1 } }, "lover");
    expect(next.papers[0]).toEqual(paper);
    expect(next.loverState.active).toBe(false);
  });

  it("commits collaboration on the final event click without overwriting intervening own work", () => {
    const paper = makePaper();
    const event = makeCollaborationEvent(paper);
    let state = { ...makeState(paper), eventQueue: [createEventQueueItem(event, 1)] };
    state = resolveFirst(resolveFirst(state));
    expect(state.papers[0]!.idea).toBe(20);
    expect(state.papers[0]!.collaborators).toEqual([]);
    state = applyResearchOperation(state, paper.id, "idea", () => 0.8);
    expect(state.papers[0]!.idea).toBe(30);
    const resultEvent = state.eventQueue[0]!;
    const next = resolveFirst(state);
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 30, collaboration: 10, total: 40 });
    expect(next.papers[0]!.collaborators).toHaveLength(1);
    expect(dispatchAction(next, "resolve-event", { eventId: resultEvent.id, eventChoiceId: resultEvent.choices[0]!.id }).papers).toEqual(next.papers);
  });

  it.each([0, 1, 2])("reserves a collaboration target after discarding it in event stage %s", (stage) => {
    const paper = makePaper();
    let state = { ...makeState(paper), eventQueue: [createEventQueueItem(makeCollaborationEvent(paper), 1)] };
    for (let step = 0; step < stage; step++) state = resolveFirst(state);
    state = dispatchAction(state, "discard-paper", { paperId: paper.id });
    expect(state.papers).toHaveLength(0);
    state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
    expect(state.papers[0]!.id).not.toBe(paper.id);
    for (let step = stage; step < 3; step++) state = resolveFirst(state);
    expect(state.papers[0]).toMatchObject({ idea: 0, collaborators: [], collaborationScores: { idea: 0 } });
  });

  it("rechecks eligibility if a conference paper is submitted before confirming help", () => {
    const paper = makePaper();
    let state = { ...makeState(paper), eventQueue: [createEventQueueItem(makeCollaborationEvent(paper), 1)] };
    state = resolveFirst(resolveFirst(state));
    state = dispatchAction(state, "submit-paper", { paperId: paper.id, paperTarget: "A" });
    expect(state.papers[0]!.status).toBe("reviewing");
    const next = resolveFirst(state);
    expect(next.papers[0]).toMatchObject({ idea: 20, collaborators: [], submittedIdea: 20 });
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 20, collaboration: 0, total: 20 });
  });

  it("clears current score pools after a competing event changes a pending data-loss result", () => {
    const paper = makePaper({ collaborationScores: { idea: 10, experiment: 10, writing: 10 }, collaborators: [{ id: "peer-one", name: "林知远" }] });
    const initial = makeState(paper);
    const event = createDataLossRandomEvent(initial).event!;
    let state = resolveFirst({ ...initial, eventQueue: [createEventQueueItem(event, 1)] });
    const decision = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: decision.choices[1]!.id });
    expect(state.papers[0]!.idea).toBe(20);
    state = applyPaperCompetitionResolution(state, { paperId: paper.id, field: "idea", multiplier: 0.25, sanCost: 0 }).nextState;
    expect(state.papers[0]!.idea).toBe(5);
    const next = resolveFirst(state);
    expect(next.papers[0]).toMatchObject({ idea: 0, experiment: 0, writing: 0, collaborationScores: { idea: 0, experiment: 0, writing: 0 } });
    expect(next.papers[0]!.collaborators).toEqual(paper.collaborators);
  });

  it("applies successive paper updates and normalizes totals before retaining score proportions", () => {
    const paper = makePaper({ collaborationScores: { idea: 10, experiment: 10 } });
    const updates = [{ id: paper.id, idea: 10.9 }, { id: paper.id, experiment: -5 }];
    const updated = applyChoiceEffectsToState(makeState(paper), { id: "update", label: "更新", outcome: "", effects: { paperUpdates: updates } }).nextState;
    expect(getPaperScoreBreakdown(updated.papers[0]!, "idea")).toEqual({ own: 5, collaboration: 5, total: 10 });
    expect(updated.papers[0]!.experiment).toBe(0);
    const event = { ...makeCollaborationEvent(paper), discardPaperUpdates: updates };
    const discarded = discardBlockingQueueEvents({ ...makeState(paper), eventQueue: [createEventQueueItem(event, 1)] });
    expect(discarded.papers).toEqual(updated.papers);
  });
});
