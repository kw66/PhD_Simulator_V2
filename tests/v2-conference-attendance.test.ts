import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { getPaperCitationMultiplierBreakdown, settlePaperCitationMonth } from "../src/core/v2-publication-system";
import { settleDueConferenceAttendance } from "../src/core/v2-conference-attendance";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import type { GameState } from "../src/core/v2-types";

function fixture(): GameState {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const base = createStartedGameState("normal");
  const paper = { ...createGrantedPublishedPaper(6, 0, { target: "A", acceptedScore: 100 }),
    id: "early-conference", submittedMonth: 3, submittedYear: 1, acceptedTotalMonths: 6,
    conferenceAvailableAtTotalMonths: 9, conferenceHandled: false };
  if (paper.publication) paper.publication = { ...paper.publication, acceptType: "Oral" };
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 6, totalMonths: 6,
    degree: "phd", maxMonths: 70, eventQueue: [], pendingRandomEvents: [], availableRandomEvents: [], illnessProbability: 0,
    player: { ...base.player, money: 100, favor: 12, san: 20 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 }, externalPublications: [paper] };
}

function refresh(state: GameState): GameState {
  return dispatchAction(state, "set-linear-event-blocking", { blockLinearEvents: true });
}

function choose(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue.find((entry) => entry.conferencePreview)!;
  expect(event).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("conference attendance calendar", () => {
  it.each(["self", "advisor"] as const)("confirms %s early and activates saved activities once only in the meeting month", (mode) => {
    let state = refresh(fixture());
    const original = state.eventQueue.find((entry) => entry.conferencePreview)!;
    expect(original.title).toBe("CVPR参会");
    expect(original.deadlineMonths).toBe(3);
    expect(buildFutureTodoPreviewItems(state).some((item) => item.title === "CVPR活动")).toBe(false);
    state = choose(choose(state), mode);
    expect(state.eventQueue.find((entry) => entry.conferencePreview)!.deadlineMonths).toBe(3);
    state = choose(state);
    expect(state.conferenceAttendancePlans).toHaveLength(1);
    expect(state.externalPublications[0]!.conferenceHandled).toBe(false);
    expect(getPaperCitationMultiplierBreakdown(state, state.externalPublications[0]!).promotion).toBe(1);
    expect(settlePaperCitationMonth(state, state.externalPublications[0]!).amount).toBe(0);
    expect(state.eventCounters.meetingCount).toBe(0);
    expect(state.eventQueue.some((entry) => entry.chainId.endsWith("-activity"))).toBe(false);
    expect(buildFutureTodoPreviewItems(state)).toEqual(expect.arrayContaining([expect.objectContaining({ title: "CVPR活动", monthsLater: 3 })]));
    const paidMoney = state.player.money;
    const paidFunding = state.advisorProgressState.funding;
    expect(mode === "self" ? paidMoney < 100 : paidFunding < 100).toBe(true);
    state = JSON.parse(JSON.stringify(state));
    for (const totalMonths of [7, 8]) {
      state = refresh({ ...state, totalMonths, month: totalMonths });
      expect(state.eventQueue.some((entry) => entry.title === "CVPR活动")).toBe(false);
      expect(state.externalPublications[0]!.conferenceHandled).toBe(false);
    }
    state = refresh({ ...state, month: 9, totalMonths: 9 });
    expect(state.eventQueue.filter((entry) => entry.title === "CVPR活动")).toHaveLength(1);
    expect(state.externalPublications[0]).toMatchObject({ conferenceHandled: true, conferenceHandledAtTotalMonths: 9 });
    expect(getPaperCitationMultiplierBreakdown(state, state.externalPublications[0]!).promotion).toBe(1.5);
    expect(state.eventCounters.meetingCount).toBe(1);
    expect(state.player.money).toBe(paidMoney);
    expect(state.advisorProgressState.funding).toBe(paidFunding);
    expect(state.conferenceAttendancePlans).toEqual([]);
    expect(settleDueConferenceAttendance(state)).toBe(state);
    expect(refresh(state).eventQueue.filter((entry) => entry.title === "CVPR活动")).toHaveLength(1);
  });

  it("keeps the pending decision due at the conference month without unlocking activities before confirmation", () => {
    let state = refresh(fixture());
    state = choose(state);
    for (const month of [7, 8, 9]) {
      state = refresh({ ...state, month, totalMonths: month });
      expect(state.eventQueue.find((entry) => entry.conferencePreview)!.deadlineMonths).toBe(9 - month);
      expect(state.eventQueue.some((entry) => entry.title === "CVPR活动")).toBe(false);
      expect(buildFutureTodoPreviewItems(state).some((item) => item.title === "CVPR活动")).toBe(false);
    }
    state = choose(choose(state, "self"));
    expect(state.eventQueue.filter((entry) => entry.title === "CVPR活动")).toHaveLength(1);
  });

  it("schedules free proxy attendance without early exposure or player activity", () => {
    let state = choose(choose(choose(refresh(fixture())), "proxy"));
    expect(state.player.money).toBe(100);
    expect(state.advisorProgressState.funding).toBe(100);
    expect(state.externalPublications[0]!.conferenceHandled).toBe(false);
    expect(buildFutureTodoPreviewItems(state).some((item) => item.title === "CVPR活动")).toBe(false);
    state = refresh({ ...state, totalMonths: 9, month: 9 });
    expect(state.externalPublications[0]!.conferenceHandled).toBe(true);
    expect(state.eventCounters.meetingCount).toBe(0);
    expect(state.eventQueue.some((entry) => entry.title === "CVPR活动")).toBe(false);
    expect(state.log.filter((entry) => entry.text.startsWith("CVPR代贴完成"))).toHaveLength(1);
  });

  it("merges another confirmed same-conference paper into a saved plan without a second payment", () => {
    let state = choose(choose(choose(refresh(fixture())), "self"));
    const paid = state.player.money;
    state = refresh({ ...state, externalPublications: [...state.externalPublications,
      { ...state.externalPublications[0]!, id: "second", title: "同会第二篇" }] });
    expect(state.eventQueue.some((entry) => entry.conferencePreview)).toBe(false);
    expect(state.conferenceAttendancePlans![0]!.context.paperIds).toEqual(["early-conference", "second"]);
    expect(state.conferenceAttendancePlans![0]!.context.paperCount).toBe(2);
    state = refresh({ ...state, totalMonths: 9, month: 9 });
    expect(state.externalPublications.every((paper) => paper.conferenceHandled)).toBe(true);
    expect(state.eventQueue.filter((entry) => entry.title === "CVPR活动")).toHaveLength(1);
    expect(state.player.money).toBe(paid);
  });
});
