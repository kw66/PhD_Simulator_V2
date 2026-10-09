import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import { settleConferenceRegistrationFees, settleFellowConferenceFees } from "../src/core/v2-lab-publication-costs";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { applyPaperReviewSettlement, projectPaperReviewSettlement, refreshPaperReviewEvents, resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { endRelationship } from "../src/core/v2-relationship-actions";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import type { GameState, Paper, PaperReviewSettlement } from "../src/core/v2-types";

function paper(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...prepareConferenceSubmission({ ...createDraftPaper(3, 0, () => 0), id, title: id,
    idea: 100, experiment: 100, writing: 100 }, "A", 3, 1), reviewMonthsLeft: 0, ...patch };
}

function makeState(papers = [paper("first"), paper("second")]): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", month: 6, year: 1, totalMonths: 6,
    eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [], illnessProbability: 0,
    player: { ...base.player, san: 20, money: 30, social: 6, favor: 6 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 }, papers };
}

function chooseReview(state: GameState, paperId: string): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId === `paper-review-result-${paperId}`)!;
  expect(event).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("pure review settlement projection", () => {
  it.each([false, true])("matches actual full settlement without logs, mutation or global RNG, accepted=%s", (accepted) => {
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 3,
      affinity: 6, startTotalMonths: 1, name: "合作同学" });
    const state = makeState([paper("projected", { imageMisusePending: true, rejectionCount: 3,
      collaborators: [{ id: fellow.id, name: fellow.name! }] })]);
    state.fellowProgressState = [fellow];
    state.player = { ...state.player, san: 1, favor: 11.75, research: 20 };
    state.buffs = [{ id: "next-publication", name: "发表加成", source: "测试", timing: "next-action", remainingMonths: null,
      publicationEffects: { nextPromotionMultiplier: 2 } }];
    const settlement: PaperReviewSettlement = { paperId: "projected", target: "A", accepted, acceptType: "Best Paper",
      submittedScore: 300, totalReviewScore: accepted ? 3 : -3, borderlineChance: null,
      venueInfluence: 1, reviewStrictnessMultiplier: 1, scoreGain: accepted ? 4 : 0, reviewerSanChange: -999,
      reports: [{ reviewer: "测试审稿人", focus: "idea", effectiveScore: 100, reviewScore: 1,
        decision: "Accept", baseSanChange: -2, sanChange: -100 }] };
    const before = structuredClone(state);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Projection consumed global RNG"); });
    const projected = projectPaperReviewSettlement(state, settlement);
    expect(projectPaperReviewSettlement(state, settlement)).toEqual(projected);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(projected.log).toBe(state.log);
    expect(projected.eventHistory).toBe(state.eventHistory);
    expect(state).toEqual(before);
    const actual = applyPaperReviewSettlement(state, settlement);
    expect({ ...actual, log: state.log, eventHistory: state.eventHistory }).toEqual(projected);
    expect(projected.player.san).toBe(accepted ? 17 : -1);
    if (accepted) {
      expect(projected.researchCapacityState.otherCapBonus).toBe(1);
      expect(projected.player.research).toBe(21);
      expect(projected.fellowProgressState[0]!.affinity).toBe(6.75);
      expect(projected.buffs.some((buff) => buff.id === "image-misuse")).toBe(true);
      expect(projected.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["projected"]);
      expect(projectPaperReviewSettlement(projected, settlement)).toBe(projected);
    }
  });
});

describe("registration at acceptance confirmation", () => {
  it("keeps same-conference results independent and charges each paper only on final confirmation", () => {
    let state = resolveDuePaperReviews(makeState(), () => 0).state;
    expect(state.eventQueue.map((event) => event.title)).toEqual(["CVPR结果", "CVPR结果"]);
    expect(new Set(state.eventQueue.map((event) => event.id)).size).toBe(2);
    expect(new Set(state.eventQueue.map((event) => event.chainId)).size).toBe(2);
    state = chooseReview(chooseReview(state, "first"), "first");
    state = chooseReview(chooseReview(state, "second"), "second");
    expect(state.eventQueue).toHaveLength(2);
    expect(state.eventQueue.every((event) => event.stage === "result")).toBe(true);
    for (const event of state.eventQueue) {
      const presentation = event.paperReviewPresentation;
      if (presentation?.kind !== "decision") throw new Error("Expected a final review decision");
      expect(presentation.rewardText).toContain("注册费：科研经费 -1（导师支付）");
      expect(event.description).toContain("注册费：科研经费 -1（导师支付）");
      expect(event.choices[0]!.disabledReason).toBeUndefined();
    }
    expect(state.advisorProgressState.funding).toBe(100);
    for (const [index, paperId] of ["second", "first"].entries()) {
      const event = state.eventQueue.find((entry) => entry.chainId === `paper-review-result-${paperId}`)!;
      state = chooseReview(state, paperId);
      expect(state.advisorProgressState.funding).toBe(100 - index - 1);
      expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["second", "first"].slice(0, index + 1));
      expect(state.player.money).toBe(30);
      expect(state.externalPublications.find((entry) => entry.id === paperId))
        .toMatchObject({ acceptedTotalMonths: 6, conferenceAvailableAtTotalMonths: 9, conferenceHandled: false });
      expect(state.eventHistory.find((entry) => entry.chainId === event.chainId)?.stages).toHaveLength(3);
      const repeated = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
      expect(repeated.advisorProgressState).toEqual(state.advisorProgressState);
    }
    expect(state.eventQueue.filter((event) => event.source === "review")).toHaveLength(0);
    expect(settleConferenceRegistrationFees(state)).toBe(state);
    expect(state.log.filter((entry) => entry.id.startsWith("conference-registration-fee"))).toHaveLength(2);
  });

  it.each([0, 0.5, 1])("charges acceptance at current funding %s even if it causes bankruptcy", (funding) => {
    let state = resolveDuePaperReviews(makeState([paper("accepted")]), () => 0).state;
    state = chooseReview(chooseReview(state, "accepted"), "accepted");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding } };
    const before = structuredClone(state);
    expect(refreshPaperReviewEvents(state).advisorProgressState.funding).toBe(funding);
    expect(state).toEqual(before);
    const next = chooseReview(state, "accepted");
    expect(next.advisorProgressState.funding).toBe(funding - 1);
    expect(next.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["accepted"]);
    expect(next.player.money).toBe(30);
    expect(next.phase).toBe(funding < 1 ? "finished" : "playing");
    expect(next.ending).toBe(funding < 1 ? "lab-bankrupt" : null);
  });

  it("never charges rejected papers or player non-first-author publications", () => {
    const rejectedPaper = paper("rejected", { idea: 1, experiment: 1, writing: 1,
      submittedIdea: 1, submittedExperiment: 1, submittedWriting: 1 });
    let state = resolveDuePaperReviews(makeState([rejectedPaper]), () => 0.99).state;
    state = chooseReview(chooseReview(state, "rejected"), "rejected");
    const presentation = state.eventQueue[0]!.paperReviewPresentation;
    if (presentation?.kind !== "decision") throw new Error("Expected a final review decision");
    expect(presentation.accepted).toBe(false);
    expect(presentation.rewardText).not.toContain("注册费");
    state = chooseReview(state, "rejected");
    expect(state.advisorProgressState.funding).toBe(100);
    const external = { ...state, externalPublications: [
      { ...paper("coauthor"), status: "published" as const, nonFirstAuthor: true },
    ] };
    expect(settleConferenceRegistrationFees(external)).toBe(external);
  });

  it("anchors attendance to recorded acceptance when final confirmation is delayed", () => {
    const state = makeState([paper("late", { acceptedTotalMonths: 4, acceptedOrder: 1 })]);
    const settlement = { paperId: "late", target: "A" as const, accepted: true, acceptType: "Poster" as const,
      submittedScore: 300, totalReviewScore: 3, borderlineChance: null, venueInfluence: 1,
      reviewStrictnessMultiplier: 1, scoreGain: 4, reviewerSanChange: 0, reports: [] };
    const next = applyPaperReviewSettlement(state, settlement);
    expect(next.externalPublications[0]).toMatchObject({ acceptedTotalMonths: 4, conferenceAvailableAtTotalMonths: 7 });
    expect(next.advisorProgressState.funding).toBe(99);
    expect(applyPaperReviewSettlement(next, settlement)).toBe(next);
  });

  it("confirms proxy attendance early and settles three months later without paying registration again", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = resolveDuePaperReviews(makeState([paper("attendee")]), () => 0).state;
    state = chooseReview(chooseReview(chooseReview(state, "attendee"), "attendee"), "attendee");
    const attendance = state.eventQueue.find((event) => event.conferencePreview)!;
    expect(attendance).toMatchObject({ title: "CVPR参会", deadlineMonths: 3 });
    for (const choiceId of ["continue", "proxy", "proxy-finish"]) {
      const event = state.eventQueue.find((entry) => entry.chainId === attendance.chainId)!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId });
    }
    expect(state.advisorProgressState.funding).toBe(99);
    expect(state.player.money).toBe(30);
    expect(state.externalPublications[0]?.conferenceHandled).toBe(false);
    expect(state.conferenceAttendancePlans).toHaveLength(1);
    expect(state.conferenceAttendancePlans?.[0]).toMatchObject({ mode: "proxy", context: { availableAtTotalMonths: 9 } });
    for (const totalMonths of [7, 8, 9]) {
      const beforeFunding = state.advisorProgressState.funding;
      state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
      expect(state.totalMonths).toBe(totalMonths);
      expect(state.advisorProgressState.funding).toBe(beforeFunding - 1.5);
      expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["attendee"]);
      expect(state.eventQueue.filter((event) => event.conferencePreview)).toHaveLength(0);
      expect(state.externalPublications[0]?.conferenceHandled).toBe(totalMonths === 9);
      expect(state.conferenceAttendancePlans).toHaveLength(totalMonths === 9 ? 0 : 1);
      expect(state.eventCounters.meetingCount).toBe(0);
      expect(state.eventQueue.some((event) => event.chainId.endsWith("-activity"))).toBe(false);
    }
    expect(state.externalPublications[0]?.conferenceHandledAtTotalMonths).toBe(9);
  });
});

describe("fellow acceptance registration and later free proxy", () => {
  it.each([false, true])("charges once at acceptance and retains it after departure, player coauthor=%s", (coauthored) => {
    const state = makeState([]);
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 0,
      affinity: 0, startTotalMonths: 1, name: "同学甲" });
    state.fellowProgressState = [fellow];
    state.fellowPapers = [paper("fellow-accepted", { leadAuthorId: fellow.id, leadAuthorName: fellow.name,
      createdTotalMonths: 1, reviewMonthsLeft: 1, collaborators: coauthored ? [{ id: "player", name: "你" }] : [] })];
    const next = advanceFellowResearch(state, () => 0);
    expect(next.advisorProgressState.funding).toBe(99);
    expect(next.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["fellow-accepted"]);
    expect(next.fellowProgressState[0]!.monthlyPublicationCosts)
      .toEqual({ totalMonths: 6, registration: 1, journal: 0, sharedTravel: 0 });
    const accepted = [...next.fellowPapers!, ...next.externalPublications].find((entry) => entry.id === "fellow-accepted")!;
    expect(accepted).toMatchObject({ acceptedTotalMonths: 6, conferenceAvailableAtTotalMonths: 9, conferenceHandled: false });
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
    const departed = endRelationship(next, fellow.id);
    expect(settleFellowConferenceFees({ ...departed, totalMonths: 8 }).advisorProgressState.funding).toBe(99);
    const handled = settleFellowConferenceFees({ ...departed, totalMonths: 9, month: 9 });
    expect(handled.advisorProgressState.funding).toBe(99);
    expect(handled.player).toEqual(departed.player);
    expect(handled.fellowFinanceAccounts).toEqual(departed.fellowFinanceAccounts);
    expect([...handled.fellowPapers!, ...handled.externalPublications].find((entry) => entry.id === accepted.id))
      .toMatchObject({ conferenceHandled: true, conferenceHandledAtTotalMonths: 9 });
    expect(settleFellowConferenceFees(handled)).toBe(handled);
    expect(handled.log.some((entry) => entry.text.includes("同学甲") && entry.text.includes("注册费"))).toBe(true);
  });

  it("charges every simultaneous acceptance even when their total exceeds available funding", () => {
    const state = makeState([]);
    state.advisorProgressState.funding = 0.5;
    state.fellowPapers = ["departed-one", "departed-two"].map((id) => paper(id, {
      leadAuthorId: id, reviewMonthsLeft: 1, createdTotalMonths: 1,
    }));
    const next = advanceFellowResearch(state, () => 0);
    expect(next.advisorProgressState.funding).toBe(-1.5);
    expect(next.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["departed-one", "departed-two"]);
    expect(evaluateCoreEndings(next)).toMatchObject({ phase: "finished", ending: "lab-bankrupt" });
  });
});
