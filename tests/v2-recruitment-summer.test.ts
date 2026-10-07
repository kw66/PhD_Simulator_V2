import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { createGeneratedFellowProfileAddition } from "../src/core/v2-fellow-progression";
import { getFellowAcademicYear } from "../src/core/v2-fellow-academic";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { createRandomEventById, isRandomEventEligible } from "../src/core/v2-random-event-router";
import { getActualResearchMiscSanChange } from "../src/core/v2-sanity-rules";
import type { FellowProfileAddition, GameState, PendingEvent } from "../src/core/v2-types";

function makeState(year: number, month: number, serial = 0): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base, year, month, totalMonths: (year - 1) * 12 + month,
    degree: "phd", maxMonths: 70, totalRandomEventCount: serial, eventQueue: [], availableRandomEvents: [],
    player: { san: 20, research: 10, social: 6, favor: 5, money: 20 },
    relationshipState: { ...base.relationshipState, unlockedSlots: 3 },
  };
}

function additions(event: PendingEvent): FellowProfileAddition[] {
  return event.choices.flatMap((choice) => [
    ...(choice.effects.fellowAdditions ?? []), ...(choice.effects.enqueueEvents ?? []).flatMap(additions),
  ]);
}

function queueEvent(state: GameState, eventId: number): GameState {
  const rolls: number[] = [];
  const event = createRandomEventById(eventId, state, () => { rolls.push(0.1); return 0.1; }).event!;
  expect(event).not.toBeNull();
  return { ...state, eventQueue: [createEventQueueItem({
    ...event, randomReplay: { eventId, serial: state.totalRandomEventCount, rolls },
  }, 1)] };
}

function choose(state: GameState, match?: string): GameState {
  const event = state.eventQueue[0]!;
  const choice = match ? event.choices.find((entry) => entry.id.includes(match)) : event.choices[0];
  expect(choice).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("summer recruitment generation", () => {
  it.each([11, 12])("excludes departing master and PhD cohorts in month %s", (month) => {
    for (const year of [1, 2, 3, 4, 5, 6]) {
      for (let seed = 0; seed < 24; seed += 1) {
        const junior = createGeneratedFellowProfileAddition("junior", seed, undefined, [], undefined, { year, month });
        expect(junior.academicYear).toBeLessThan(Math.min(year, 3));
        expect(junior.degree).toBe("master");
        if (year < 5) {
          const senior = createGeneratedFellowProfileAddition("senior", seed, undefined, [], undefined, { year, month });
          expect(senior.academicYear).toBeGreaterThan(year);
          expect(senior.academicYear).not.toBe(3);
          expect(senior.academicYear).not.toBe(6);
        }
      }
    }
  });

  it.each([1, 10])("retains terminal cohorts from September through June at month %s", (month) => {
    expect(createGeneratedFellowProfileAddition("peer", 0, undefined, [], undefined, { year: 3, month }))
      .toMatchObject({ academicYear: 3, degree: "master" });
    expect(createGeneratedFellowProfileAddition("peer", 0, undefined, [], undefined, { year: 6, month }))
      .toMatchObject({ academicYear: 6, degree: "phd" });
    expect(createGeneratedFellowProfileAddition("senior", 0, undefined, [], undefined, { year: 5, month }))
      .toMatchObject({ academicYear: 6, degree: "phd" });
    expect(createGeneratedFellowProfileAddition("junior", 3, undefined, [], undefined, { year: 4, month }))
      .toMatchObject({ academicYear: 3, degree: "master" });
  });

  it.each([[3, 10], [6, 10], [5, 11]] as const)("blocks year %s summer event %s before candidate generation", (year, eventId) => {
    for (const month of [11, 12]) {
      const state = makeState(year, month);
      expect(isRandomEventEligible(state, eventId)).toBe(false);
      const random = vi.fn(() => 0.99);
      expect(createRandomEventById(eventId, state, random).event).toBeNull();
      expect(random).not.toHaveBeenCalled();
    }
  });

  it("defers a terminal peer draw during August and activates it in September through dispatch", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const initial = { ...makeState(3, 12), availableRandomEvents: [10] };
    const drawn = collectRandomEventsForMonth(initial, () => 0.8);
    expect(drawn.events).toHaveLength(0);
    expect(drawn.nextState.pendingRandomEvents).toEqual([{ eventId: 10, serial: 1 }]);
    expect(drawn.nextState.usedRandomEvents).not.toContain(10);
    const september = dispatchAction({ ...drawn.nextState, availableRandomEvents: [] }, "next-month");
    expect(september).toMatchObject({ year: 4, month: 1, totalMonths: 37 });
    const event = september.eventQueue.find((entry) => entry.chainId === "random-10");
    expect(event).toBeDefined();
    expect(additions(event!)[0]).toMatchObject({ academicYear: 4, degree: "phd", academicStartTotalMonths: 37 });
    expect(september.pendingRandomEvents).toEqual([]);
  });

  it.each([["peer", 3], ["peer", 6], ["senior", 5], ["senior", 6]] as const)("prevents debug recruitment of %s in summer year %s", (type, year) => {
    const state = makeState(year, 11);
    const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: type });
    expect(next.fellowProgressState).toHaveLength(0);
    expect(next.relationshipState).toEqual(state.relationshipState);
  });
});

describe("departed candidates in pending events", () => {
  it("preserves references for unchanged events and updates SAN using the live season", () => {
    const state = makeState(2, 9);
    const plain = createEventQueueItem({
      id: "plain", title: "普通事件", description: "", source: "system", blocking: false, deadlineMonths: 0,
      chainId: "plain", stage: "result", choices: [{ id: "confirm", label: "确认", outcome: "完成", effects: {} }],
    }, 1);
    expect(getResolvableQueuedEvent(state, plain)).toBe(plain);
    const plainState = { ...state, eventQueue: [plain] };
    expect(refreshPendingEventDecisions(plainState)).toBe(plainState);
    const queued = choose(queueEvent(state, 10));
    const candidate = additions(queued.eventQueue[0]!)[0]!;
    const june = { ...queued, month: 10, totalMonths: 22 };
    const decision = getResolvableQueuedEvent(june, queued.eventQueue[0]!);
    const choice = decision.choices.find((entry) => entry.id.includes("-short-term-"))!;
    expect(choice.effects.fellowAdditions![0]).toEqual(candidate);
    expect(choice.effects.san).toBe(getActualResearchMiscSanChange(-5, june.player.research, 10, june.eventSupport, june.buffs));
    expect(choice.effects.san).not.toBe(queued.eventQueue[0]!.choices.find((entry) => entry.id.includes("-short-term-"))!.effects.san);
  });

  it("keeps a surviving June candidate in July and charges the current July SAN cost", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const june = queueEvent(makeState(2, 10), 10);
    const candidate = additions(june.eventQueue[0]!)[0]!;
    const advanced = dispatchAction(june, "next-month");
    expect(advanced).toMatchObject({ year: 2, month: 11, totalMonths: 23 });
    const july = {
      ...advanced,
      eventSupport: { ...advanced.eventSupport, hasParasol: true },
      eventQueue: [advanced.eventQueue.find((event) => event.chainId === "random-10")!],
    };
    const decision = choose(july);
    const choice = decision.eventQueue[0]!.choices.find((entry) => entry.id.includes("-short-term-"))!;
    const cost = getActualResearchMiscSanChange(-5, july.player.research, july.month, july.eventSupport, july.buffs);
    expect(choice.effects.fellowAdditions![0]).toEqual(candidate);
    expect(choice.outcome).not.toContain("同学已离校");
    expect(choice.effects.san).toBe(cost);
    const accepted = choose(choose(decision, "-short-term-"));
    expect(accepted.player.san).toBe(july.player.san + cost);
    expect(accepted.fellowProgressState[0]).toMatchObject({ ...candidate, startTotalMonths: 23 });
  });

  it.each([[10, 3, 0, "-short-term-"], [10, 6, 0, "-short-term-"], [11, 5, 0, "-deep-"], [14, 4, 3, "-idea-"]] as const)(
    "turns event %s year %s candidate %s into an explicit no-op after June", (eventId, year, serial, choice) => {
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      const june = queueEvent(makeState(year, 10, serial), eventId);
      const original = additions(june.eventQueue[0]!)[0]!;
      expect(original.academicYear).toBe(eventId === 11 || year === 6 ? 6 : 3);
      const july = year === 6 ? { ...june, month: 11, totalMonths: 71 }
        : dispatchAction(june, "next-month");
      expect(july).toMatchObject({ month: 11, year });
      const pending = { ...july, eventQueue: [july.eventQueue.find((event) => event.chainId === `random-${eventId}`)!] };
      const decision = choose(pending);
      const recruit = decision.eventQueue[0]!.choices.find((entry) => entry.id.includes(choice))!;
      expect(recruit.outcome).toContain("同学已离校");
      expect(recruit.effects.san).toBeUndefined();
      expect(recruit.effects.fellowAdditions).toBeUndefined();
      const result = choose(decision, choice);
      expect(result.eventQueue[0]!.description).toContain("同学已离校");
      expect(result.eventQueue[0]!.description).toContain("无事发生");
      const accepted = choose(result);
      expect(accepted.fellowProgressState).toHaveLength(0);
      expect(accepted.player).toEqual(pending.player);
      expect(accepted.relationshipState).toEqual(pending.relationshipState);
      expect(accepted.log[0]?.text).toContain("同学已离校");
    },
  );

  it("drops stale recruitment and SAN deltas when a pending result crosses the June cutoff", () => {
    const june = queueEvent(makeState(3, 10), 10);
    const result = choose(choose(june), "-short-term-");
    expect(result.eventQueue[0]!.deferredStatePatch?.some((entry) => entry.path[0] === "fellowProgressState")).toBe(true);
    const july = dispatchAction(result, "debug-shift-month", { delta: 1 });
    const refreshed = refreshPendingEventDecisions(JSON.parse(JSON.stringify(july)));
    expect(refreshed.eventQueue[0]!.description).toContain("同学已离校");
    expect(refreshed.eventQueue[0]!.deferredStatePatch?.some((entry) => entry.path[0] === "fellowProgressState"
      || entry.path.join(".") === "player.san")).not.toBe(true);
    const accepted = choose(refreshed);
    expect(accepted.player).toEqual(july.player);
    expect(accepted.fellowProgressState).toHaveLength(0);
  });

  it("allows an older offer until its original cohort's final June and blocks it afterward", () => {
    const queued = queueEvent(makeState(2, 12), 10);
    const original = additions(queued.eventQueue[0]!)[0]!;
    const atJune = { ...queued, ...getCalendarForTotalMonths(34, "phd"), totalMonths: 34 };
    expect(additions(getResolvableQueuedEvent(atJune, queued.eventQueue[0]!))[0]).toEqual(original);
    const accepted = choose(choose(choose(atJune), "-short-term-"));
    expect(accepted.fellowProgressState[0]).toMatchObject({ ...original, startTotalMonths: 34 });
    expect(getFellowAcademicYear(accepted, accepted.fellowProgressState[0]!)).toBe(3);
    const atJuly = { ...queued, ...getCalendarForTotalMonths(35, "phd"), totalMonths: 35 };
    const blocked = choose(choose(choose(atJuly), "-short-term-"));
    expect(blocked.fellowProgressState).toHaveLength(0);
    expect(blocked.player).toEqual(atJuly.player);
  });

  it.each(["-exchange-", "-reject-"])("preserves the non-recruitment %s choice for a departed peer", (choice) => {
    const queued = queueEvent(makeState(3, 10), 10);
    const july = { ...queued, totalMonths: 35, month: 11 };
    const decision = choose(july);
    const selected = decision.eventQueue[0]!.choices.find((entry) => entry.id.includes(choice))!;
    expect(selected.outcome).not.toContain("同学已离校");
    const result = choose(decision, choice);
    const finished = result.eventQueue.length ? choose(result) : result;
    expect(finished.fellowProgressState).toHaveLength(0);
    expect(finished.player).toEqual(july.player);
    if (choice === "-exchange-") {
      expect(finished.buffs.some((buff) => buff.actionEffects?.idea?.bonus === 5)).toBe(true);
    }
  });
});
