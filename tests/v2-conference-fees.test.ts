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
import type { GameState, PendingEvent } from "../src/core/v2-types";

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
  return { ...state, money: state.player.money, research: state.player.research, favor: state.player.favor, social: state.player.social, advisorFunding: state.advisorProgressState.funding };
}

function conferenceState(region: ConferenceRegionId, paperCount: number, paidPaperIds?: string[]): GameState {
  const initial = playingState();
  const state = { ...initial, advisorProgressState: { ...initial.advisorProgressState, paidConferenceRegistrationPaperIds: paidPaperIds } };
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
  it.each(["self", "advisor", "proxy"] as const)("collects the full fee only on confirmation for %s", (mode) => {
    for (const paperCount of [1, 3]) {
      const paperIds = Array.from({ length: paperCount }, (_, index) => `paper-${index}`);
      let state = conferenceState("domestic", paperCount);
      const personalCost = mode === "self" ? 2 : 0;
      const fundingCost = paperCount + (mode === "advisor" ? 2 : 0);
      expect(state.eventQueue[0]!.description).toContain(`注册费每篇 1 金币，本次需缴 ${paperCount} 篇`);
      expect(state.eventQueue[0]!.description).not.toMatch(/自动支付|已支付|预扣/u);
      state = choose(state);
      state = choose(state, mode);
      const confirmation = state.eventQueue[0]!;
      const payment = `科研经费 -${fundingCost}`;
      expect(confirmation.description).toContain(payment);
      expect(confirmation.completionLog).toContain(payment);
      expect(confirmation.description.split("机制结算")[1]).not.toContain("注册费");
      expect(confirmation.completionLog).not.toContain("注册费");
      expect(state.player.money).toBe(30);
      expect(state.advisorProgressState.funding).toBe(30);
      const effects = confirmation.choices[0]!.effects;
      expect(effects.money ?? 0).toBe(personalCost === 0 ? 0 : -personalCost);
      expect(effects.advisorProgressStateDeltas?.funding).toBe(-fundingCost);
      expect(effects.recordConferenceRegistrationPayment).toEqual(paperIds);
      const assertNoRegistration = (event: PendingEvent): void => {
        expect(event.description).not.toContain("注册费");
        expect(event.completionLog ?? "").not.toContain("注册费");
        for (const choice of event.choices) {
          for (const next of choice.effects.enqueueEvents ?? []) assertNoRegistration(next);
        }
      };
      for (const next of effects.enqueueEvents ?? []) assertNoRegistration(next);
      state = choose(state);
      expect(state.player.money).toBe(30 - personalCost);
      expect(state.advisorProgressState.funding).toBe(30 - fundingCost);
      expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(paperIds);
      const duplicate = dispatchAction(state, "resolve-event", { eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id });
      expect(duplicate.player.money).toBe(state.player.money);
      expect(duplicate.advisorProgressState).toEqual(state.advisorProgressState);
    }
  });

  it.each([
    { paidIds: undefined, unpaidCount: 3 },
    { paidIds: [], unpaidCount: 3 },
    { paidIds: ["unrelated-paper"], unpaidCount: 3 },
    { paidIds: ["paper-0", "paper-0", "unrelated-paper"], unpaidCount: 2 },
    { paidIds: ["paper-0", "paper-1", "paper-2"], unpaidCount: 0 },
  ])(
    "charges only $unpaidCount unpaid unique paper IDs without a prepaid narrative: $paidIds", ({ paidIds, unpaidCount }) => {
      const state = conferenceState("domestic", 3, paidIds);
      const original = state.eventQueue[0]!.conferencePreview!.context;
      const root = createConferenceDecisionAct1({ ...original, paperIds: [...original.paperIds, "paper-0"] }, builderState(state), () => 0.99);
      const selection = root.choices[0]!.effects.enqueueEvents![0]!;
      expect(root.description).toContain(`本次需缴 ${unpaidCount} 篇`);
      expect(root.description).not.toMatch(/自动支付|已支付|预扣/u);
      for (const choice of selection.choices) {
        const confirmation = choice.effects.enqueueEvents![0]!;
        const effects = confirmation.choices[0]!.effects;
        expect(effects.recordConferenceRegistrationPayment).toEqual(["paper-0", "paper-1", "paper-2"]);
        expect(effects.money ?? 0).toBe(choice.id === "self" ? -2 : 0);
        const fundingCost = unpaidCount + (choice.id === "advisor" ? 2 : 0);
        expect(effects.advisorProgressStateDeltas?.funding ?? 0).toBe(fundingCost === 0 ? 0 : -fundingCost);
        if (choice.id === "proxy" && unpaidCount === 0) expect(confirmation.description).toContain("结果：无额外费用");
        expect(confirmation.completionLog).not.toContain("注册费");
      }
    },
  );

  it.each(["act1", "act2", "self", "advisor", "proxy"] as const)("preserves pending attendance when discarding %s", (stage) => {
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
    expect(proxy.choices[0]!.effects.money).toBeUndefined();
    expect(proxy.choices[0]!.effects.advisorProgressStateDeltas?.funding).toBe(-2);
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
    expect(state.advisorProgressState.funding).toBe(29);
    const discarded = discardBlockingQueueEvents(state);
    expect(discarded.papers[0]!.conferenceHandled).toBe(true);
    expect(discarded.player.money).toBe(28);
    expect(discarded.advisorProgressState.funding).toBe(29);
    const advanced = dispatchAction(state, "force-next-month");
    expect(advanced.eventQueue.some((event) => event.conferencePreview)).toBe(false);
  });

  it.each([
    ["domestic", 2, 0.5], ["asia", 4, 1.25], ["west", 6, 2],
  ] as const)("charges one combined registration and travel fee in %s", (region, travel, favor) => {
    for (const paperCount of [1, 3]) {
      for (const mode of ["self", "advisor", "proxy"] as ConferenceDecisionMode[]) {
        let state = conferenceState(region, paperCount);
        state = choose(choose(state), mode);
        expect(state.player.money).toBe(30);
        expect(state.advisorProgressState.funding).toBe(30);
        expect(state.player.favor).toBe(12);
        expect(state.eventQueue[0]!.description).not.toMatch(/会务经验|减免|同学代参会/);
        const confirmation = state.eventQueue[0]!;
        expect(confirmation.description).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
        expect(confirmation.completionLog).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
        if (mode === "advisor") expect(confirmation.description).toContain(`科研经费 -${travel + paperCount}`);
        state = choose(state);
        expect(state.player.money).toBe(30 - (mode === "self" ? travel : 0));
        expect(state.advisorProgressState.funding).toBe(30 - paperCount - (mode === "advisor" ? travel : 0));
        expect(state.player.favor).toBe(12 - (mode === "advisor" ? favor : 0));
        expect(state.player.social).toBe(12);
        expect(state.eventCounters.meetingCount).toBe(mode === "proxy" ? 0 : 1);
        const regionCounter = { domestic: "domesticMeetingCount", asia: "asiaMeetingCount", west: "westMeetingCount" } as const;
        expect(state.eventCounters[regionCounter[region]]).toBe(mode === "proxy" ? 30 : 31);
        expect(state.log.map((entry) => entry.text).join("\n")).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
        expect(state.eventQueue).toHaveLength(mode === "proxy" ? 0 : 1);
        const duplicate = dispatchAction(state, "resolve-event", { eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id });
        expect(duplicate.player.money).toBe(state.player.money);
        expect(duplicate.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
      }
    }
  });

  it("groups unique papers before combining registration with one trip", () => {
    const state = playingState();
    const events = buildConferenceDecisionEventsForAcceptedPapers([
      { id: "one", target: "C", submittedMonth: 10, submittedYear: 1 },
      { id: "two", target: "C", submittedMonth: 10, submittedYear: 1 },
      { id: "one", target: "C", submittedMonth: 10, submittedYear: 1 },
    ], builderState(state), () => 0.99);
    expect(events).toHaveLength(1);
    const context = events[0]!.conferencePreview!.context;
    expect(context.paperIds).toEqual(["one", "two"]);
    expect(context.paperCount).toBe(2);
    expect(context.paperPresentations).toHaveLength(2);
    const trip = { domestic: 2, asia: 4, west: 6 }[context.region];
    const decision = events[0]!.choices[0]!.effects.enqueueEvents![0]!;
    const result = decision.choices.find((choice) => choice.id === "self")!.effects.enqueueEvents![0]!;
    expect(result.choices[0]!.effects.money).toBe(-trip);
    expect(result.choices[0]!.effects.advisorProgressStateDeltas?.funding).toBe(-2);
  });

  it.each(["self", "advisor", "proxy"] as const)("rechecks lab funding for %s at selection and confirmation without partial payment", (mode) => {
    let state = choose(conferenceState("west", 3));
    const fundingCost = mode === "advisor" ? 9 : 3;
    const insufficient = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: fundingCost - 0.25 } };
    expect(getResolvableQueuedEvent(insufficient, insufficient.eventQueue[0]!).choices.find((choice) => choice.id === mode)!.disabledReason).toContain(`${fundingCost}`);
    const blockedDecision = choose(insufficient, mode);
    expect(blockedDecision.player).toEqual(insufficient.player);
    expect(blockedDecision.advisorProgressState).toEqual(insufficient.advisorProgressState);
    expect(blockedDecision.eventQueue[0]!.id).toBe(insufficient.eventQueue[0]!.id);
    state = choose(state, mode);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: fundingCost - 0.25 } };
    const refreshed = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(refreshed.choices[0]!.disabledReason).toContain(`${fundingCost}`);
    expect(refreshed.choices.some((choice) => choice.id === "change-payment-method")).toBe(true);
    const blockedConfirmation = choose(state);
    expect(blockedConfirmation.player).toEqual(state.player);
    expect(blockedConfirmation.advisorProgressState).toEqual(state.advisorProgressState);
    expect(blockedConfirmation.eventQueue[0]!.id).toBe(state.eventQueue[0]!.id);
    expect(choose(state, "change-payment-method").eventQueue[0]!.stage).toBe("act2");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: fundingCost } };
    const confirmed = choose(state);
    expect(confirmed.advisorProgressState.funding).toBe(0);
    expect(confirmed.player.money).toBe(mode === "self" ? 24 : 30);
    expect(confirmed.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["paper-0", "paper-1", "paper-2"]);
  });

  it("honors optional builder funding without requiring it for standalone construction", () => {
    const state = conferenceState("domestic", 1);
    const context = state.eventQueue[0]!.conferencePreview!.context;
    for (const funding of [undefined, 2, 3]) {
      const root = createConferenceDecisionAct1(context, { ...builderState(state), advisorFunding: funding }, () => 0.99);
      const decision = root.choices[0]!.effects.enqueueEvents![0]!;
      expect(Boolean(decision.choices.find((choice) => choice.id === "advisor")!.disabledReason)).toBe(funding === 2);
    }
  });

  it("rechecks personal travel money before selection and confirmation", () => {
    const mode = "self";
    let state = choose(conferenceState("west", 3));
    const cost = 6;
    const insufficient = { ...state, player: { ...state.player, money: cost - 1 } };
    expect(getResolvableQueuedEvent(insufficient, insufficient.eventQueue[0]!).choices.find((choice) => choice.id === mode)!.disabledReason).toContain(`需要 ${cost}`);
    const blocked = choose(insufficient, mode);
    expect(blocked.player).toEqual(insufficient.player);
    expect(blocked.eventQueue[0]!.id).toBe(insufficient.eventQueue[0]!.id);
    state = choose(state, mode);
    state = { ...state, player: { ...state.player, money: cost - 1 } };
    const refreshed = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(refreshed.choices[0]!.disabledReason).toContain(`需要 ${cost}`);
    expect(refreshed.choices.some((choice) => choice.id === "change-payment-method")).toBe(true);
    expect(choose(state).player).toEqual(state.player);
    const reselected = choose(state, "change-payment-method");
    expect(reselected.eventQueue[0]!.stage).toBe("act2");
    expect(reselected.player.money).toBe(cost - 1);
    const paid = choose({ ...state, player: { ...state.player, money: cost } });
    expect(paid.player.money).toBe(0);
  });

  it.each(["self", "advisor", "proxy"] as const)("requires personal money only for self travel in the initial %s preview", (mode) => {
    const state = conferenceState("west", 1);
    const context = state.eventQueue[0]!.conferencePreview!.context;
    const root = createConferenceDecisionAct1(context, { ...builderState(state), money: 0 }, () => 0.99);
    const selected = root.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === mode)!;
    if (mode === "self") {
      expect(selected.disabledReason).toContain("金币不足");
      expect(selected.effects.enqueueEvents![0]!.choices[0]!.disabledReason).toContain("金币不足");
    } else {
      expect(selected.disabledReason).toBeUndefined();
      expect(selected.effects.enqueueEvents![0]!.choices[0]!.disabledReason).toBeUndefined();
    }
  });

  it.each(["self", "proxy"] as const)("lets an unfunded mentor confirmation switch to %s without losing the fee", (mode) => {
    let state = choose(choose(conferenceState("west", 3)), "advisor");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 3 } };
    state = choose(state, "change-payment-method");
    expect(state.eventQueue[0]!.stage).toBe("act2");
    expect(state.eventQueue[0]!.choices.find((choice) => choice.id === "advisor")!.disabledReason).toContain("9");
    expect(state.player.money).toBe(30);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(3);
    state = choose(state, mode);
    expect(state.eventQueue[0]!.conferencePreview?.mode).toBe(mode);
    state = choose(state);
    expect(state.player.money).toBe(mode === "self" ? 24 : 30);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(0);
    expect(state.eventCounters.meetingCount).toBe(mode === "self" ? 1 : 0);
  });

  it.each(["skip", "self"] as const)("lets an unfunded VALSE confirmation return and choose %s", (mode) => {
    let state = playingState();
    state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
    state = choose(state);
    state = choose(state, state.eventQueue[0]!.choices.find((choice) => choice.id.includes("-advisor-"))!.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } };
    const refreshed = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    state = choose(state, refreshed.choices.find((choice) => choice.id.includes("-change-payment-"))!.id);
    expect(state.eventQueue[0]!.stage).toBe("act2");
    expect(state.player.money).toBe(30);
    expect(state.player.favor).toBe(12);
    state = choose(state, state.eventQueue[0]!.choices.find((choice) => choice.id.includes(`-${mode}-`))!.id);
    state = choose(state);
    expect(state.player.money).toBe(mode === "skip" ? 30 : 28);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(0);
    expect(state.eventCounters.meetingCount).toBe(mode === "skip" ? 0 : 1);
    if (mode === "skip") expect(state.eventQueue).toHaveLength(0);
  });

  it.each([0, 3])("charges VALSE two travel coins with %i papers, for either personal or research funding", (paperCount) => {
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

  it("revalidates VALSE research funding after selecting reimbursement", () => {
    let state = playingState();
    state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
    state = choose(state);
    const advisorChoice = state.eventQueue[0]!.choices.find((choice) => choice.id.includes("-advisor-"))!;
    const insufficient = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } };
    expect(getResolvableQueuedEvent(insufficient, insufficient.eventQueue[0]!).choices.find((choice) => choice.id === advisorChoice.id)!.disabledReason).toContain("2");
    const blockedDecision = choose(insufficient, advisorChoice.id);
    expect(blockedDecision.player).toEqual(insufficient.player);
    expect(blockedDecision.advisorProgressState).toEqual(insufficient.advisorProgressState);
    expect(blockedDecision.eventQueue[0]!.id).toBe(insufficient.eventQueue[0]!.id);
    state = choose(state, advisorChoice.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } };
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).choices[0]!.disabledReason).toContain("2");
    const blockedConfirmation = choose(state);
    expect(blockedConfirmation.player).toEqual(state.player);
    expect(blockedConfirmation.advisorProgressState).toEqual(state.advisorProgressState);
    expect(blockedConfirmation.eventQueue[0]!.id).toBe(state.eventQueue[0]!.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 2 } };
    expect(choose(state).advisorProgressState.funding).toBe(0);
  });
});
