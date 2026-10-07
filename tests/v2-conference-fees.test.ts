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
  it.each(["self", "advisor", "proxy"] as const)("reports prepaid registration without charging again for %s", (mode) => {
    for (const paperCount of [1, 3]) {
      const paidIds = Array.from({ length: paperCount }, (_, index) => `paper-${index}`);
      let state = conferenceState("domestic", paperCount, paidIds);
      const registration = `科研经费 -${paperCount}（注册费，已支付）`;
      const narrative = `本场 ${paperCount} 篇共 ${paperCount} 金币已支付。`;
      expect(state.eventQueue[0]!.description).toContain(narrative);
      state = choose(state);
      state = choose(state, mode);
      const confirmation = state.eventQueue[0]!;
      expect(confirmation.description).toContain("注册费每篇 1 金币，录用满 3 个月时由导师科研经费自动支付。");
      expect(confirmation.description).toContain(narrative);
      expect(confirmation.description).toContain(registration);
      expect(confirmation.completionLog).toContain(registration);
      expect(state.player.money).toBe(30);
      expect(state.advisorProgressState.funding).toBe(30);
      const effects = confirmation.choices[0]!.effects;
      expect(effects.money ?? 0).toBe(mode === "self" ? -2 : mode === "proxy" ? -1 : 0);
      expect(effects.advisorProgressStateDeltas?.funding ?? 0).toBe(mode === "advisor" ? -2 : 0);
      const assertNoRegistration = (event: PendingEvent): void => {
        expect(event.description).not.toContain("注册费");
        expect(event.completionLog ?? "").not.toContain("注册费");
        for (const choice of event.choices) {
          for (const next of choice.effects.enqueueEvents ?? []) assertNoRegistration(next);
        }
      };
      for (const next of effects.enqueueEvents ?? []) assertNoRegistration(next);
      state = choose(state);
      expect(state.player.money).toBe(mode === "advisor" ? 30 : mode === "self" ? 28 : 29);
      expect(state.advisorProgressState.funding).toBe(mode === "advisor" ? 28 : 30);
      expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(paidIds);
      const duplicate = dispatchAction(state, "resolve-event", { eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id });
      expect(duplicate.player.money).toBe(state.player.money);
      expect(duplicate.advisorProgressState).toEqual(state.advisorProgressState);
    }
  });

  it.each([undefined, [], ["unrelated-paper"], ["paper-0", "paper-0", "unrelated-paper"]])(
    "reports only the current papers with a payment record: %j", (paidIds) => {
      const state = conferenceState("domestic", 3, paidIds);
      const original = state.eventQueue[0]!.conferencePreview!.context;
      const root = createConferenceDecisionAct1({ ...original, paperIds: [...original.paperIds, "paper-0"] }, builderState(state), () => 0.99);
      const paidCount = paidIds?.includes("paper-0") ? 1 : 0;
      const narrative = paidCount > 0
        ? "本场 3 篇中已支付 1 篇，共 1 金币，其余尚无支付记录。"
        : "本场 3 篇尚无注册费支付记录。";
      const selection = root.choices[0]!.effects.enqueueEvents![0]!;
      expect(root.description).toContain(narrative);
      for (const choice of selection.choices) {
        const confirmation = choice.effects.enqueueEvents![0]!;
        expect(confirmation.description).toContain(narrative);
        if (paidCount > 0) {
          expect(confirmation.description).toContain("科研经费 -1（注册费，已支付）");
          expect(confirmation.completionLog).toContain("科研经费 -1（注册费，已支付）");
        } else {
          expect(confirmation.description).not.toContain("已支付");
          expect(confirmation.completionLog).not.toContain("注册费");
        }
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
    expect(proxy.choices[0]!.effects.money).toBe(-1);
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
    ["domestic", 2, 1], ["asia", 4, 2], ["west", 6, 3],
  ] as const)("charges only one trip or proxy fee in %s", (region, travel, favor) => {
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
        if (mode === "advisor") expect(confirmation.description).toContain(`科研经费 -${travel}`);
        state = choose(state);
        expect(state.player.money).toBe(30 - (mode === "advisor" ? 0 : mode === "self" ? travel : 1));
        expect(state.advisorProgressState.funding).toBe(30 - (mode === "advisor" ? travel : 0));
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

  it("groups papers before calculating one trip without registration", () => {
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
  });

  it("disables and rechecks lab funding at both conference decision and final confirmation", () => {
    let state = choose(conferenceState("west", 3));
    const insufficient = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 5 } };
    expect(getResolvableQueuedEvent(insufficient, insufficient.eventQueue[0]!).choices.find((choice) => choice.id === "advisor")!.disabledReason).toContain("6");
    const blockedDecision = choose(insufficient, "advisor");
    expect(blockedDecision.player).toEqual(insufficient.player);
    expect(blockedDecision.advisorProgressState).toEqual(insufficient.advisorProgressState);
    expect(blockedDecision.eventQueue[0]!.id).toBe(insufficient.eventQueue[0]!.id);
    state = choose(state, "advisor");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 5 } };
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).choices[0]!.disabledReason).toContain("6");
    const blockedConfirmation = choose(state);
    expect(blockedConfirmation.player).toEqual(state.player);
    expect(blockedConfirmation.advisorProgressState).toEqual(state.advisorProgressState);
    expect(blockedConfirmation.eventQueue[0]!.id).toBe(state.eventQueue[0]!.id);
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 6 } };
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

  it.each(["self", "proxy"] as const)("rechecks personal money for %s before selection and confirmation", (mode) => {
    let state = choose(conferenceState("west", 3));
    const cost = mode === "self" ? 6 : 1;
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

  it.each(["self", "proxy"] as const)("uses optional builder money for the initial %s preview", (mode) => {
    const state = conferenceState("west", 1);
    const context = state.eventQueue[0]!.conferencePreview!.context;
    const root = createConferenceDecisionAct1(context, { ...builderState(state), money: 0 }, () => 0.99);
    const selected = root.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === mode)!;
    expect(selected.disabledReason).toContain("金币不足");
    expect(selected.effects.enqueueEvents![0]!.choices[0]!.disabledReason).toContain("金币不足");
  });

  it.each(["self", "proxy"] as const)("lets an unfunded mentor confirmation switch to %s without losing the fee", (mode) => {
    let state = choose(choose(conferenceState("west", 3)), "advisor");
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 1 } };
    state = choose(state, "change-payment-method");
    expect(state.eventQueue[0]!.stage).toBe("act2");
    expect(state.eventQueue[0]!.choices.find((choice) => choice.id === "advisor")!.disabledReason).toContain("6");
    expect(state.player.money).toBe(30);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(1);
    state = choose(state, mode);
    expect(state.eventQueue[0]!.conferencePreview?.mode).toBe(mode);
    state = choose(state);
    expect(state.player.money).toBe(mode === "self" ? 24 : 29);
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(1);
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
