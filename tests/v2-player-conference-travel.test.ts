import { afterEach, describe, expect, it, vi } from "vitest";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import type { ConferenceEventContext } from "../src/core/v2-conference-events";
import type { ConferenceDecisionMode, ConferenceRegionId } from "../src/core/v2-conference-system";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem, discardBlockingQueueEvents } from "../src/core/v2-event-queue";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, year: 1, month: 4, totalMonths: 4, selectedAdvisorName: "导师", eventQueue: [],
    player: { ...base.player, money: 100, favor: 20, san: 20 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
  };
}

function queueBatch(state: GameState, batch: string, patch: Partial<ConferenceEventContext> = {}): GameState {
  const event = createConferenceDecisionAct1({
    id: `conference-${batch}`, conferenceName: "CVPR", conferenceYear: 2026,
    city: "西雅图", country: "美国", region: "west", grade: "A", paperCount: 1,
    paperIds: [`paper-${batch}`], ...patch,
  }, { ...state, research: state.player.research, favor: state.player.favor, social: state.player.social }, () => 0.99);
  return { ...state, eventQueue: [createEventQueueItem(event, state.totalMonths)] };
}

function choose(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue.find((entry) => entry.conferencePreview)!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

function pay(state: GameState, mode: ConferenceDecisionMode): GameState {
  return choose(choose(choose(state), mode));
}

afterEach(() => vi.restoreAllMocks());

describe("player conference travel across paper batches", () => {
  it.each([
    ["domestic", 1], ["asia", 3], ["west", 5],
  ] as const)("shares one %s trip across self and advisor payments", (region: ConferenceRegionId, travel) => {
    for (const firstMode of ["self", "advisor"] as const) {
      for (const secondMode of ["self", "advisor"] as const) {
        const first = pay(queueBatch(makeState(), "first", { region }), firstMode);
        expect(first.advisorProgressState.paidPlayerConferenceTrips).toHaveLength(1);
        const saved = JSON.parse(JSON.stringify(first)) as GameState;
        const queued = queueBatch({ ...saved, totalMonths: 5, month: 5 }, "second", { region, paperCount: 2, paperIds: ["second-1", "second-2"] });
        const decision = choose(queued);
        expect(decision.eventQueue[0]!.description).toContain("本次 0 金币");
        const pending = choose(decision, secondMode);
        expect(pending.player.money).toBe(first.player.money);
        expect(pending.advisorProgressState).toEqual(first.advisorProgressState);
        const paymentText = secondMode === "advisor" ? "实验室经费 -2" : "金币 -2";
        expect(pending.eventQueue[0]!.description).toContain(paymentText);
        const paid = choose(pending);
        expect(paid.player.money).toBe(100 - (firstMode === "self" ? 1 + travel : 0) - (secondMode === "self" ? 2 : 0));
        expect(paid.advisorProgressState.funding).toBe(100 - (firstMode === "advisor" ? 1 + travel : 0) - (secondMode === "advisor" ? 2 : 0));
        expect(paid.advisorProgressState.paidPlayerConferenceTrips).toEqual(first.advisorProgressState.paidPlayerConferenceTrips);
        expect(paid.player.favor).toBe(first.player.favor - (secondMode === "advisor" ? { domestic: 1, asia: 2, west: 3 }[region] : 0));
        expect(paid.log.some((entry) => entry.text.includes(paymentText))).toBe(true);
        const confirmation = pending.eventQueue[0]!;
        const duplicate = dispatchAction(paid, "resolve-event", { eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id });
        expect(duplicate.player.money).toBe(paid.player.money);
        expect(duplicate.advisorProgressState).toEqual(paid.advisorProgressState);
      }
    }
  });

  it.each(["self", "advisor"] as const)("does not consume a physical trip for proxy registration before %s attendance", (mode) => {
    const proxy = pay(queueBatch(makeState(), "proxy", { paperCount: 2, paperIds: ["proxy-1", "proxy-2"] }), "proxy");
    expect(proxy.player.money).toBe(97);
    expect(proxy.advisorProgressState.paidPlayerConferenceTrips).toBeUndefined();
    const physical = pay(queueBatch(proxy, "physical"), mode);
    expect(physical.player.money).toBe(mode === "self" ? 91 : 97);
    expect(physical.advisorProgressState.funding).toBe(mode === "advisor" ? 94 : 100);
    expect(physical.advisorProgressState.paidPlayerConferenceTrips).toHaveLength(1);
    const nextProxy = pay(queueBatch(physical, "next-proxy"), "proxy");
    expect(nextProxy.player.money).toBe(physical.player.money - 2);
    expect(nextProxy.advisorProgressState).toEqual(physical.advisorProgressState);
  });

  it.each(["self", "advisor"] as const)("does not record unpaid %s previews, rejected funding, or discarded confirmations", (mode) => {
    const pending = choose(choose(queueBatch(makeState(), "unpaid")), mode);
    expect(pending.advisorProgressState.paidPlayerConferenceTrips).toBeUndefined();
    if (mode === "advisor") {
      const insufficient = { ...pending, advisorProgressState: { ...pending.advisorProgressState, funding: 5 } };
      const rejected = choose(insufficient);
      expect(rejected.advisorProgressState).toEqual(insufficient.advisorProgressState);
      expect(rejected.player).toEqual(insufficient.player);
    }
    const discarded = discardBlockingQueueEvents(pending);
    expect(discarded.advisorProgressState.paidPlayerConferenceTrips).toBeUndefined();
    const paid = pay(queueBatch(discarded, "replacement"), "self");
    expect(paid.player.money).toBe(94);
    expect(discardBlockingQueueEvents(paid).advisorProgressState.paidPlayerConferenceTrips).toHaveLength(1);
  });

  it("refreshes an old final confirmation after another batch pays the same trip", () => {
    const pending = choose(choose(queueBatch(makeState(), "pending")), "advisor");
    expect(pending.eventQueue[0]!.choices[0]!.effects.advisorProgressStateDeltas?.funding).toBe(-6);
    const first = pay(queueBatch(pending, "paid-first"), "self");
    const restored = { ...first, eventQueue: pending.eventQueue,
      advisorProgressState: { ...first.advisorProgressState, funding: 2 } };
    const snapshot = structuredClone(restored);
    const refreshed = getResolvableQueuedEvent(restored, restored.eventQueue[0]!);
    expect(refreshed.choices[0]!.disabledReason).toBeUndefined();
    expect(refreshed.choices[0]!.effects.advisorProgressStateDeltas?.funding).toBe(-1);
    expect(restored).toEqual(snapshot);
    const paid = choose(restored);
    expect(paid.advisorProgressState.funding).toBe(1);
    expect(paid.advisorProgressState.paidPlayerConferenceTrips).toEqual(first.advisorProgressState.paidPlayerConferenceTrips);
  });

  it.each([
    { conferenceName: "ICCV" }, { conferenceYear: 2027 }, { city: "巴黎" },
  ])("charges distinct trips for $conferenceName $conferenceYear $city", (patch) => {
    const first = pay(queueBatch(makeState(), "first"), "self");
    const second = pay(queueBatch(first, "different", patch), "self");
    expect(second.player.money).toBe(88);
    expect(second.advisorProgressState.paidPlayerConferenceTrips).toHaveLength(2);
  });

  it("uses the recorded trip when the engine schedules a later paper from the same conference", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState();
    let state: GameState = { ...initial, externalPublications: [5, 6].map((month, index) => ({
      ...createGrantedPublishedPaper(1, index, { target: "A", acceptedScore: 4 }),
      id: `engine-paper-${index}`, submittedMonth: 3, submittedYear: 1,
      conferenceHandled: false, conferenceAvailableAtTotalMonths: month,
    })) };
    state = dispatchAction(state, "force-next-month");
    const firstEvent = state.eventQueue.find((event) => event.conferencePreview)!;
    expect(firstEvent.conferencePreview!.context.paperIds).toEqual(["engine-paper-0"]);
    const travel = { domestic: 1, asia: 3, west: 5 }[firstEvent.conferencePreview!.context.region];
    const firstMoney = state.player.money;
    state = pay(state, "self");
    expect(state.player.money).toBe(firstMoney - 1 - travel);
    state = dispatchAction(JSON.parse(JSON.stringify(state)), "force-next-month");
    const secondEvent = state.eventQueue.find((event) => event.conferencePreview)!;
    expect(secondEvent.conferencePreview!.context.paperIds).toEqual(["engine-paper-1"]);
    const secondFunding = state.advisorProgressState.funding;
    state = pay(state, "advisor");
    expect(state.advisorProgressState.funding).toBe(secondFunding - 1);
    expect(state.advisorProgressState.paidPlayerConferenceTrips).toHaveLength(1);
  });
});
