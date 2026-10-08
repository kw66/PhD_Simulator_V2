import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { applyPaperReviewSettlement } from "../src/core/v2-publication-system";
import * as conferenceCatalog from "../src/core/v2-conference-catalog";
import type { GameState } from "../src/core/v2-types";

function paper(id: string, due: number) {
  return { ...createGrantedPublishedPaper(3, 0, { target: "C", acceptedScore: 50 }), id,
    submittedMonth: 1, submittedYear: 1, conferenceHandled: false, conferenceAvailableAtTotalMonths: due };
}

function stateWithPapers(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", month: 3, year: 1, totalMonths: 3,
    eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [], illnessProbability: 0,
    player: { ...base.player, san: 20, money: 30, social: 6, favor: 6 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    externalPublications: [paper("first", 6), paper("second", 6)] };
}

function chooseConference(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue.find((entry) => entry.conferencePreview)!;
  expect(event).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("publication funding through monthly progression", () => {
  it("groups both papers three months after acceptance and pays lab registration only when proxy is confirmed", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = stateWithPapers();
    for (const month of [4, 5]) {
      state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
      expect(state.totalMonths).toBe(month);
      expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toBeUndefined();
      expect(state.eventQueue.some((event) => event.conferencePreview)).toBe(false);
    }
    state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
    expect(state.totalMonths).toBe(6);
    expect(state.advisorProgressState.funding).toBe(95.5);
    expect(state.advisorProgressState.paidConferenceRegistrationPaperIds ?? []).toEqual([]);
    expect(state.eventQueue.filter((event) => event.conferencePreview)).toHaveLength(1);
    expect(state.eventQueue.find((event) => event.conferencePreview)!.conferencePreview!.context.paperIds).toEqual(["first", "second"]);
    const beforeMoney = state.player.money;
    state = chooseConference(chooseConference(state), "proxy");
    expect(state.player.money).toBe(beforeMoney);
    expect(state.advisorProgressState.funding).toBe(95.5);
    const favor = state.player.favor;
    state = chooseConference(state);
    expect(state.player.money).toBe(beforeMoney);
    expect(state.player.favor).toBe(favor);
    expect(state.advisorProgressState.funding).toBe(93.5);
    expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "second"]);
    expect(state.advisorProgressState.paidPlayerConferenceTrips ?? []).toEqual([]);
    const beforeFunding = state.advisorProgressState.funding;
    state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
    expect(state.totalMonths).toBe(7);
    expect(state.advisorProgressState.funding).toBe(beforeFunding - 1.5);
    expect(state.player.money).toBe(beforeMoney + 0.5);
    expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "second"]);
    expect(state.externalPublications.every((entry) => entry.conferenceHandled)).toBe(true);
    expect(state.eventQueue.some((event) => event.conferencePreview)).toBe(false);
  });

  it("keeps the conference date anchored to the recorded acceptance month rather than confirmation", () => {
    const state = stateWithPapers();
    state.totalMonths = 5;
    state.month = 5;
    state.papers = [{ ...paper("pending-result", 6), status: "reviewing", acceptedTotalMonths: 3, acceptedOrder: 1 }];
    state.externalPublications = [];
    const confirmed = applyPaperReviewSettlement(state, {
      paperId: "pending-result", target: "C", accepted: true, acceptType: "Poster", submittedScore: 50,
      totalReviewScore: 3, borderlineChance: null, venueInfluence: 1, reviewStrictnessMultiplier: 1,
      scoreGain: 1, reviewerSanChange: 0, reports: [],
    });
    expect(confirmed.externalPublications[0]).toMatchObject({ acceptedTotalMonths: 3, conferenceAvailableAtTotalMonths: 6 });
  });

  it("keeps registration pending when lab funding is insufficient instead of bankrupting on arrival", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const base = stateWithPapers();
    const next = dispatchAction({ ...base, month: 5, totalMonths: 5,
      advisorProgressState: { ...base.advisorProgressState, funding: 2 },
    }, "next-month");
    expect(next).toMatchObject({ phase: "playing", ending: null, totalMonths: 6,
      advisorProgressState: { funding: 1 } });
    expect(next.advisorProgressState.paidConferenceRegistrationPaperIds ?? []).toEqual([]);
    expect(next.player.money).toBe(30);
    const decision = chooseConference(next);
    for (const mode of ["self", "advisor", "proxy"]) {
      expect(decision.eventQueue.find((event) => event.conferencePreview)!.choices.find((choice) => choice.id === mode)!.disabledReason).toBeTruthy();
      const blocked = chooseConference(decision, mode);
      expect(blocked.advisorProgressState.funding).toBe(1);
      expect(blocked.player.money).toBe(30);
    }
  });

  it.each([["domestic", 2, 1], ["asia", 4, 2], ["west", 6, 3]] as const)
    ("settles two registrations and %s travel %s with favor base %s only once at confirmation", (region, travel, favorBase) => {
      vi.spyOn(Math, "random").mockReturnValue(0.99);
      vi.spyOn(conferenceCatalog, "getConferenceLocation").mockReturnValue({ region, city: "测试城市", country: "测试国家" });
      for (const mode of ["self", "advisor", "proxy"] as const) {
        const initial = stateWithPapers();
        initial.totalMonths = 5;
        initial.month = 5;
        initial.player.favor = 5;
        const arrived = dispatchAction(initial, "next-month");
        const before = { money: arrived.player.money, favor: arrived.player.favor, funding: arrived.advisorProgressState.funding };
        expect(before.favor).toBe(6);
        const confirmation = chooseConference(chooseConference(arrived), mode);
        expect(confirmation.player.money).toBe(before.money);
        expect(confirmation.player.favor).toBe(before.favor);
        expect(confirmation.advisorProgressState.funding).toBe(before.funding);
        expect(confirmation.advisorProgressState.paidConferenceRegistrationPaperIds ?? []).toEqual([]);
        const event = confirmation.eventQueue.find((entry) => entry.conferencePreview)!;
        const paid = chooseConference(confirmation);
        expect(paid.player.money).toBe(before.money - (mode === "self" ? travel : 0));
        expect(paid.advisorProgressState.funding).toBe(before.funding - 2 - (mode === "advisor" ? travel : 0));
        expect(paid.player.favor).toBe(before.favor - (mode === "advisor" ? 0.75 + favorBase - 1 : 0));
        expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "second"]);
        if (mode === "proxy") {
          expect(paid.eventQueue.some((entry) => entry.conferencePreview)).toBe(false);
          expect(paid.eventCounters.meetingCount).toBe(arrived.eventCounters.meetingCount);
          expect(paid.externalPublications.every((entry) => entry.conferenceHandled)).toBe(true);
        }
        const replayed = dispatchAction(JSON.parse(JSON.stringify(paid)) as GameState, "resolve-event", {
          eventId: event.id, eventChoiceId: event.choices[0]!.id,
        });
        expect(replayed.player).toEqual(paid.player);
        expect(replayed.advisorProgressState).toEqual(paid.advisorProgressState);
      }
    });

  it.each(["self", "advisor", "proxy"] as const)("refreshes %s confirmation after balances change and charges exactly once", (mode) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    vi.spyOn(conferenceCatalog, "getConferenceLocation").mockReturnValue({ region: "domestic", city: "北京", country: "中国" });
    const initial = stateWithPapers();
    const arrived = dispatchAction({ ...initial, month: 5, totalMonths: 5 }, "next-month");
    const confirmation = chooseConference(chooseConference(arrived), mode);
    const depleted = { ...confirmation,
      player: { ...confirmation.player, money: mode === "self" ? 1.99 : confirmation.player.money },
      advisorProgressState: { ...confirmation.advisorProgressState, funding: mode === "advisor" ? 3.99 : 1.99 },
    };
    const blocked = chooseConference(depleted);
    expect(blocked.player).toEqual(depleted.player);
    expect(blocked.advisorProgressState).toEqual(depleted.advisorProgressState);
    expect(blocked.advisorProgressState.paidConferenceRegistrationPaperIds ?? []).toEqual([]);
    const decision = chooseConference(blocked, "change-payment-method");
    const refreshed = { ...decision, player: { ...decision.player, money: 2 },
      advisorProgressState: { ...decision.advisorProgressState, funding: 4 } };
    const selected = chooseConference(refreshed, mode);
    const paid = chooseConference(selected);
    expect(paid.player.money).toBe(mode === "self" ? 0 : 2);
    expect(paid.advisorProgressState.funding).toBe(mode === "advisor" ? 0 : 2);
    expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "second"]);
    const event = selected.eventQueue.find((entry) => entry.conferencePreview)!;
    const repeated = dispatchAction(paid, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    expect(repeated.advisorProgressState).toEqual(paid.advisorProgressState);
    expect(repeated.player).toEqual(paid.player);
  });
});
