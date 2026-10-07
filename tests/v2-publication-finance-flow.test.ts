import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { applyPaperReviewSettlement } from "../src/core/v2-publication-system";
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
  it("charges both papers three months after acceptance and groups them into one conference", () => {
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
    expect(state.advisorProgressState.funding).toBe(95);
    expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "second"]);
    expect(state.eventQueue.filter((event) => event.conferencePreview)).toHaveLength(1);
    expect(state.eventQueue.find((event) => event.conferencePreview)!.conferencePreview!.context.paperIds).toEqual(["first", "second"]);
    const beforeMoney = state.player.money;
    state = chooseConference(chooseConference(state), "proxy");
    expect(state.player.money).toBe(beforeMoney);
    state = chooseConference(state);
    expect(state.player.money).toBe(beforeMoney - 1);
    expect(state.advisorProgressState.paidPlayerConferenceTrips ?? []).toEqual([]);
    const beforeFunding = state.advisorProgressState.funding;
    state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
    expect(state.totalMonths).toBe(7);
    expect(state.advisorProgressState.funding).toBe(beforeFunding - 1);
    expect(state.player.money).toBe(beforeMoney);
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

  it("ends before optional travel when mandatory registration exceeds available funding", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const base = stateWithPapers();
    const next = dispatchAction({ ...base, month: 5, totalMonths: 5,
      advisorProgressState: { ...base.advisorProgressState, funding: 2 },
    }, "next-month");
    expect(next).toMatchObject({ phase: "finished", ending: "lab-bankrupt", totalMonths: 6,
      advisorProgressState: { funding: -1, paidConferenceRegistrationPaperIds: ["first", "second"] } });
    expect(next.player.money).toBe(31);
    expect(next.eventQueue.some((event) => event.conferencePreview)).toBe(false);
  });
});
