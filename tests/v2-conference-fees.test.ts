import { describe, expect, it } from "vitest";
import { buildConferenceDecisionEventsForAcceptedPapers, createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import type { ConferenceEventBuilderState } from "../src/core/v2-conference-events";
import type { ConferenceDecisionMode, ConferenceRegionId } from "../src/core/v2-conference-system";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem, discardBlockingQueueEvents } from "../src/core/v2-event-queue";
import { createCcigEvent } from "../src/core/v2-fixed-events-ccig-decision-events";
import { getCcigSelfPayCost } from "../src/core/v2-fixed-events-ccig-shared";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import type { GameState } from "../src/core/v2-types";

function playingState(): GameState {
  const initial = createInitialState();
  return {
    ...initial,
    phase: "playing",
    year: 1,
    month: 1,
    totalMonths: 1,
    selectedAdvisorName: "测试导师",
    player: { ...initial.player, money: 30, favor: 12, social: 12 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 30 },
    eventCounters: { ...initial.eventCounters, domesticMeetingCount: 30, asiaMeetingCount: 30, westMeetingCount: 30 },
  };
}

function builderState(state: GameState): ConferenceEventBuilderState {
  return { ...state, research: state.player.research, favor: state.player.favor, social: state.player.social, advisorFunding: state.advisorProgressState.funding };
}

function conferenceState(region: ConferenceRegionId, paperCount: number): GameState {
  const state = playingState();
  const event = createConferenceDecisionAct1({
    id: "conference-fees", conferenceName: "CVPR", conferenceYear: 2026,
    city: "测试会址", country: "测试国家", region, grade: "A", paperCount,
    paperIds: Array.from({ length: paperCount }, (_, index) => `paper-${index}`),
  }, builderState(state), () => 0.99);
  return { ...state, eventQueue: [createEventQueueItem(event, state.totalMonths)] };
}

function choose(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

describe("conference fee settlement", () => {
  it.each(["act1", "act2", "self", "advisor", "proxy"] as const)("preserves unpaid registration when discarding %s", (stage) => {
    let state = conferenceState("domestic", 2);
    const papers = [0, 1].map((index) => ({
      ...createGrantedPublishedPaper(1, index, { target: "C", acceptedScore: 4 }),
      id: `paper-${index}`, submittedMonth: 10, submittedYear: 1,
      conferenceHandled: false, conferenceAvailableAtTotalMonths: 0,
    }));
    state = { ...state, papers: [papers[0]!], externalPublications: [papers[1]!] };
    if (stage !== "act1") state = choose(state);
    if (stage !== "act1" && stage !== "act2") state = choose(state, stage);
    const discarded = discardBlockingQueueEvents(state);
    expect(discarded.eventQueue).toHaveLength(0);
    expect(discarded.papers[0]!.conferenceHandled).toBe(false);
    expect(discarded.externalPublications[0]!.conferenceHandled).toBe(false);
    expect(discarded.player.money).toBe(30);
    expect(discarded.advisorProgressState.funding).toBe(30);
    const advanced = dispatchAction(state, "force-next-month");
    const restored = advanced.eventQueue.filter((event) => event.conferencePreview);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.conferencePreview!.context.paperIds).toEqual(["paper-0", "paper-1"]);
    const decision = restored[0]!.choices[0]!.effects.enqueueEvents![0]!;
    const proxy = decision.choices.find((choice) => choice.id === "proxy")!.effects.enqueueEvents![0]!;
    const serviceFee = restored[0]!.conferencePreview!.context.region === "domestic" ? 0 : 1;
    expect(proxy.choices[0]!.effects.money).toBe(-(2 + serviceFee));
  });

  it("does not charge again when discarding an activity after paying attendance", () => {
    let state = conferenceState("domestic", 1);
    state = { ...state, papers: [{
      ...createGrantedPublishedPaper(1, 0, { target: "C", acceptedScore: 4 }),
      id: "paper-0", submittedMonth: 10, submittedYear: 1,
      conferenceHandled: false, conferenceAvailableAtTotalMonths: 0,
    }] };
    state = choose(choose(choose(state), "self"));
    expect(state.player.money).toBe(28);
    const discarded = discardBlockingQueueEvents(state);
    expect(discarded.papers[0]!.conferenceHandled).toBe(true);
    expect(discarded.player.money).toBe(28);
    const advanced = dispatchAction(state, "force-next-month");
    expect(advanced.eventQueue.some((event) => event.conferencePreview)).toBe(false);
  });

  it.each([
    ["domestic", 1, 0, 1], ["asia", 3, 1, 2], ["west", 5, 1, 3],
  ] as const)("charges registration per paper and travel once in %s", (region, travel, service, favor) => {
    for (const paperCount of [1, 3]) {
      for (const mode of ["self", "advisor", "proxy"] as ConferenceDecisionMode[]) {
        let state = conferenceState(region, paperCount);
        state = choose(choose(state), mode);
        expect(state.player.money).toBe(30);
        expect(state.advisorProgressState.funding).toBe(30);
        expect(state.player.favor).toBe(12);
        expect(state.eventQueue[0]!.description).not.toMatch(/会务经验|减免|同学代参会/);
        const confirmation = state.eventQueue[0]!;
        state = choose(state);
        expect(state.player.money).toBe(30 - (mode === "advisor" ? 0 : paperCount + (mode === "self" ? travel : service)));
        expect(state.advisorProgressState.funding).toBe(30 - (mode === "advisor" ? paperCount + travel : 0));
        expect(state.player.favor).toBe(12 - (mode === "advisor" ? favor : 0));
        expect(state.player.social).toBe(12);
        expect(state.eventCounters.meetingCount).toBe(mode === "proxy" ? 0 : 1);
        expect(state.eventQueue).toHaveLength(mode === "proxy" ? 0 : 1);
        const duplicate = dispatchAction(state, "resolve-event", { eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id });
        expect(duplicate.player.money).toBe(state.player.money);
        expect(duplicate.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
      }
    }
  });

  it("groups papers before calculating one trip and individual registrations", () => {
    const state = playingState();
    const events = buildConferenceDecisionEventsForAcceptedPapers([
      { id: "one", target: "C", submittedMonth: 10, submittedYear: 1 },
      { id: "two", target: "C", submittedMonth: 10, submittedYear: 1 },
    ], builderState(state), () => 0.99);
    expect(events).toHaveLength(1);
    const context = events[0]!.conferencePreview!.context;
    const trip = { domestic: 1, asia: 3, west: 5 }[context.region];
    const decision = events[0]!.choices[0]!.effects.enqueueEvents![0]!;
    const result = decision.choices.find((choice) => choice.id === "self")!.effects.enqueueEvents![0]!;
    expect(result.choices[0]!.effects.money).toBe(-(2 + trip));
  });

  it("disables and rechecks lab funding at both conference decision and final confirmation", () => {
    let state = choose(conferenceState("west", 3));
    const insufficient = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 7 } };
    expect(getResolvableQueuedEvent(insufficient, insufficient.eventQueue[0]!).choices.find((choice) => choice.id === "advisor")!.disabledReason).toContain("8");
    const blockedDecision = choose(insufficient, "advisor");
    expect(blockedDecision.player).toEqual(insufficient.player);
    expect(blockedDecision.advisorProgressState).toEqual(insufficient.advisorProgressState);
    expect(blockedDecision.eventQueue[0]!.id).toBe(insufficient.eventQueue[0]!.id);
    state = choose(state, "advisor");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 7 } };
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).choices[0]!.disabledReason).toContain("8");
    const blockedConfirmation = choose(state);
    expect(blockedConfirmation.player).toEqual(state.player);
    expect(blockedConfirmation.advisorProgressState).toEqual(state.advisorProgressState);
    expect(blockedConfirmation.eventQueue[0]!.id).toBe(state.eventQueue[0]!.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 8 } };
    const confirmed = choose(state);
    expect(confirmed.advisorProgressState.funding).toBe(0);
    expect(confirmed.player.money).toBe(30);
  });

  it("honors optional builder funding without requiring it for standalone construction", () => {
    const state = conferenceState("domestic", 1);
    const context = state.eventQueue[0]!.conferencePreview!.context;
    for (const funding of [undefined, 1, 2]) {
      const root = createConferenceDecisionAct1(context, { ...builderState(state), advisorFunding: funding }, () => 0.99);
      const decision = root.choices[0]!.effects.enqueueEvents![0]!;
      expect(Boolean(decision.choices.find((choice) => choice.id === "advisor")!.disabledReason)).toBe(funding === 1);
    }
  });

  it.each(["self", "proxy"] as const)("lets an unfunded mentor confirmation switch to %s without losing the fee", (mode) => {
    let state = choose(choose(conferenceState("west", 3)), "advisor");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 1 } };
    state = choose(state, "change-payment-method");
    expect(state.eventQueue[0]!.stage).toBe("act2");
    expect(state.eventQueue[0]!.choices.find((choice) => choice.id === "advisor")!.disabledReason).toContain("8");
    expect(state.player.money).toBe(30);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(1);
    state = choose(state, mode);
    expect(state.eventQueue[0]!.conferencePreview?.mode).toBe(mode);
    state = choose(state);
    expect(state.player.money).toBe(mode === "self" ? 22 : 26);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(1);
    expect(state.eventCounters.meetingCount).toBe(mode === "self" ? 1 : 0);
  });

  it.each(["skip", "self"] as const)("lets an unfunded CCIG confirmation return and choose %s", (mode) => {
    let state = playingState();
    state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
    state = choose(state);
    state = choose(state, state.eventQueue[0]!.choices.find((choice) => choice.id.includes("-advisor-"))!.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 1 } };
    const refreshed = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    state = choose(state, refreshed.choices.find((choice) => choice.id.includes("-change-payment-"))!.id);
    expect(state.eventQueue[0]!.stage).toBe("act2");
    expect(state.player.money).toBe(30);
    expect(state.player.favor).toBe(12);
    state = choose(state, state.eventQueue[0]!.choices.find((choice) => choice.id.includes(`-${mode}-`))!.id);
    state = choose(state);
    expect(state.player.money).toBe(mode === "skip" ? 30 : 28);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(1);
    expect(state.eventCounters.meetingCount).toBe(mode === "skip" ? 0 : 1);
    if (mode === "skip") expect(state.eventQueue).toHaveLength(0);
  });

  it.each([0, 3])("charges CCIG two coins with %i papers, for either personal or lab funding", (paperCount) => {
    for (const mode of ["self", "advisor"] as const) {
      let state = playingState();
      state.papers = Array.from({ length: paperCount }, (_, index) => createGrantedPublishedPaper(1, index, { target: "A", acceptedScore: 4 }));
      expect(getCcigSelfPayCost(state)).toEqual({ actualCost: 2, discount: 0, hasMeetingExperience: false });
      state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
      state = choose(state);
      state = choose(state, state.eventQueue[0]!.choices.find((choice) => choice.id.includes(`-${mode}-`))!.id);
      expect(state.player.money).toBe(30);
      expect(state.advisorProgressState.funding).toBe(30);
      expect(state.eventQueue[0]!.description).not.toMatch(/会务经验|减免/);
      state = choose(state);
      expect(state.player.money).toBe(mode === "self" ? 28 : 30);
      expect(state.advisorProgressState.funding).toBe(mode === "advisor" ? 28 : 30);
      expect(state.eventCounters.meetingCount).toBe(1);
    }
  });

  it("revalidates CCIG lab funding after selecting reimbursement", () => {
    let state = playingState();
    state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
    state = choose(state);
    const advisorChoice = state.eventQueue[0]!.choices.find((choice) => choice.id.includes("-advisor-"))!;
    const insufficient = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 1 } };
    expect(getResolvableQueuedEvent(insufficient, insufficient.eventQueue[0]!).choices.find((choice) => choice.id === advisorChoice.id)!.disabledReason).toContain("2");
    const blockedDecision = choose(insufficient, advisorChoice.id);
    expect(blockedDecision.player).toEqual(insufficient.player);
    expect(blockedDecision.advisorProgressState).toEqual(insufficient.advisorProgressState);
    expect(blockedDecision.eventQueue[0]!.id).toBe(insufficient.eventQueue[0]!.id);
    state = choose(state, advisorChoice.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 1 } };
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).choices[0]!.disabledReason).toContain("2");
    const blockedConfirmation = choose(state);
    expect(blockedConfirmation.player).toEqual(state.player);
    expect(blockedConfirmation.advisorProgressState).toEqual(state.advisorProgressState);
    expect(blockedConfirmation.eventQueue[0]!.id).toBe(state.eventQueue[0]!.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 2 } };
    expect(choose(state).advisorProgressState.funding).toBe(0);
  });
});
