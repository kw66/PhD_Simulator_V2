import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { enqueueMonthlyEventsForMonth, collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { createRandomEventById, isRandomEventEligible } from "../src/core/v2-random-event-router";
import { canAddRelationship } from "../src/core/v2-relationship-rules";
import { yearlyResetRandomEventState } from "../src/core/v2-random-event-rules";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { hasRecruitLeft } from "../src/core/v2-recruitment-eligibility";
import { withGameRandom } from "../src/core/v2-game-random";
import { syncCaptainMembers } from "../src/core/v2-captain-runtime";
import type { FellowProfileAddition, GameState, PendingEvent, RoleId } from "../src/core/v2-types";

const EVENT_IDS = [14, 10, 11];
function state(year = 1, month = 1, role: RoleId = "research-captain"): GameState {
  const initial = createStartedGameState(role);
  return { ...initial, year, month, totalMonths: (year - 1) * 12 + month,
    degree: "phd", maxMonths: 70, selectedAdvisorName: "测试导师", blockLinearEvents: true,
    availableRandomEvents: [10, 11, 14], eventQueue: [], pendingRandomEvents: [],
    player: { ...initial.player, research: 0, social: 0, money: 20, favor: 5 },
    randomState: { seed: 1700000000, cursor: 0 } };
}
function recruitments(event: PendingEvent): FellowProfileAddition[] {
  return event.choices.flatMap(choice => [...(choice.effects.fellowAdditions ?? []),
    ...(choice.effects.enqueueEvents ?? []).flatMap(recruitments)]);
}
function resolve(state: GameState, eventId: number, label?: string): GameState {
  const event = state.eventQueue.find(item => item.chainId === `random-${eventId}`)!;
  expect(event).toBeDefined();
  const choice = label ? event.choices.find(item => item.label === label) : event.choices[0];
  expect(choice).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice!.id });
}

describe("captain relationship opening", () => {
  it("opens all four fellow slots at creation without granting people or changing other roles", () => {
    const captain = createStartedGameState("research-captain");
    expect(captain.relationshipState).toMatchObject({ unlockedSlots: 5, occupiedSlots: 0 });
    expect(captain.fellowProgressState).toEqual([]);
    expect(canAddRelationship({ ...captain.relationshipState, occupiedSlots: 3 }, "junior")).toBe(true);
    expect(canAddRelationship({ ...captain.relationshipState, occupiedSlots: 4 }, "junior")).toBe(false);
    expect(createStartedGameState("normal").relationshipState.unlockedSlots).toBe(2);
    const legacy = { ...captain, relationshipState: { ...captain.relationshipState, unlockedSlots: 2 } };
    expect(syncCaptainMembers(legacy).relationshipState.unlockedSlots).toBe(5);
    expect(legacy.relationshipState.unlockedSlots).toBe(2);
  });

  it("enqueues the guaranteed events through the actual enrollment action", () => {
    const initial = createStartedGameState("research-captain");
    const next = dispatchAction({ ...initial, selectedAdvisorName: "测试导师", eventQueue: [] }, "next-month");
    expect(next).toMatchObject({ year: 1, month: 1, totalMonths: 1 });
    for (const id of EVENT_IDS) expect(next.eventQueue.filter(event => event.randomReplay?.eventId === id)).toHaveLength(1);
  });

  it.each([1, 2, 3, 4, 5, 6])("guarantees all three in September of year %i even with zero ordinary event rolls", year => {
    const initial = state(year);
    const result = enqueueMonthlyEventsForMonth(initial, () => 0);
    const events = result.queuedEvents.filter(event => EVENT_IDS.includes(event.randomReplay?.eventId ?? -1));
    expect(events.map(event => event.randomReplay!.eventId)).toEqual(EVENT_IDS);
    expect(events.map(event => event.randomReplay!.serial)).toEqual([1, 2, 3]);
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.totalRandomEventCount).toBe(3);
    expect(result.nextState.usedRandomEvents).toEqual(EVENT_IDS);
    expect(result.nextState.pendingRandomEvents).toEqual([]);
    for (const event of events) {
      expect(event.description).not.toContain("出现条件");
      expect(recruitments(event).length).toBeGreaterThan(0);
      expect(recruitments(event).every(candidate => !hasRecruitLeft(initial, candidate))).toBe(true);
      expect(recruitments(event).every(candidate => candidate.academicYear! <= 6)).toBe(true);
    }
    const repeated = enqueueMonthlyEventsForMonth(JSON.parse(JSON.stringify(result.nextState)), () => 0);
    expect(repeated.queuedEvents.filter(event => EVENT_IDS.includes(event.randomReplay?.eventId ?? -1))).toEqual([]);
    expect(repeated.nextState.totalRandomEventCount).toBe(3);
  });

  it("does not force events before enrollment, in other months, or for ordinary roles", () => {
    for (const initial of [createStartedGameState("research-captain"), state(1, 2), state(2, 12), state(1, 1, "normal")]) {
      const next = enqueueMonthlyEventsForMonth(initial, () => 0);
      expect(next.queuedEvents.filter(event => EVENT_IDS.includes(event.randomReplay?.eventId ?? -1))).toEqual([]);
    }
  });

  it("refills at the next academic year and consumes each forced annual ticket once", () => {
    const first = enqueueMonthlyEventsForMonth(state(), () => 0).nextState;
    const nextYear: GameState = { ...first, ...yearlyResetRandomEventState(first), year: 2, month: 1, totalMonths: 13, eventQueue: [] };
    const second = enqueueMonthlyEventsForMonth(nextYear, () => 0).nextState;
    expect(second.eventQueue.filter(event => EVENT_IDS.includes(event.randomReplay?.eventId ?? -1))).toHaveLength(3);
    expect(second.totalRandomEventCount).toBe(6);
    for (const id of EVENT_IDS) expect(second.availableRandomEvents).not.toContain(id);
    const later = collectRandomEventsForMonth({ ...second, month: 2, totalMonths: 14, eventQueue: [], availableRandomEvents: [] }, () => 0.99);
    expect(later.events).toEqual([]);
  });

  it("does not double-book a pending previous-year scene or its waiting entry", () => {
    const first = enqueueMonthlyEventsForMonth(state(), () => 0).nextState;
    const older = first.eventQueue.find(event => event.randomReplay?.eventId === 10)!;
    const nextYear: GameState = { ...state(2), totalRandomEventCount: 3, eventQueue: [older],
      pendingRandomEvents: [{ eventId: 10, serial: 2 }, { eventId: 14, serial: 3 }] };
    const next = enqueueMonthlyEventsForMonth(nextYear, () => 0).nextState;
    for (const eventId of EVENT_IDS) {
      expect(next.eventQueue.filter(event => event.randomReplay?.eventId === eventId)).toHaveLength(1);
      expect(next.availableRandomEvents).not.toContain(eventId);
    }
    expect(next.pendingRandomEvents).toEqual([]);
    expect(next.totalRandomEventCount).toBe(5);
  });

  it("bypasses only these three appearance gates, including the late-cohort guard", () => {
    for (const year of [1, 3, 5, 6]) for (const month of [1, 11, 12]) {
      const captain = state(year, month);
      for (const eventId of EVENT_IDS) {
        expect(isRandomEventEligible(captain, eventId)).toBe(true);
        const event = createRandomEventById(eventId, captain, () => 0)!;
        expect(event.event).not.toBeNull();
        expect(recruitments(event.event!).every(candidate => !hasRecruitLeft(captain, candidate))).toBe(true);
      }
      expect(isRandomEventEligible(captain, 8)).toBe(false);
      expect(isRandomEventEligible(captain, 12)).toBe(false);
      expect(isRandomEventEligible(captain, 19)).toBe(false);
    }
    expect(EVENT_IDS.map(id => isRandomEventEligible(state(1, 1, "normal"), id))).toEqual([false, false, false]);
    const late = collectRandomEventsForMonth({ ...state(6, 2), availableRandomEvents: [11] }, () => 0.8);
    expect(late.events[0]?.chainId).toBe("random-11");
  });

  it("preserves choices, permits zero-action recruitment and retains normal SAN payment", () => {
    let current = enqueueMonthlyEventsForMonth(state(), () => 0).nextState;
    const startSan = current.player.san;
    current = resolve(current, 14);
    current = resolve(current, 14, "认真指导");
    current = resolve(current, 14);
    expect(current.fellowProgressState).toHaveLength(1);
    expect(current.player.san).toBeLessThan(startSan);
    expect(current.actionState).toMatchObject({ limit: 0, used: 0 });
    current = resolve(current, 10);
    current = resolve(current, 10, "长期合作");
    current = resolve(current, 10);
    expect(current.fellowProgressState).toHaveLength(2);
    current = resolve(current, 11);
    current = resolve(current, 11, "委婉拒绝");
    current = resolve(current, 11);
    expect(current.fellowProgressState).toHaveLength(2);
  });

  it("still respects the four-fellow capacity and refreshes a deferred invitation after freeing a slot", () => {
    const initial = state();
    initial.fellowProgressState = Array.from({ length: 4 }, (_, index) => createCustomFellowProgressProfile({
      type: "peer", gender: "male", research: 1, affinity: 1, startTotalMonths: 1, name: `同学${index}`, identitySeed: `test-${index}`,
    }));
    initial.relationshipState = { ...initial.relationshipState, occupiedSlots: 4, peerCount: 4 };
    let current = enqueueMonthlyEventsForMonth(initial, () => 0).nextState;
    current = resolve(current, 10);
    const full = current.eventQueue.find(event => event.chainId === "random-10")!;
    expect(full.choices.find(choice => choice.label === "长期合作")?.effects.fellowAdditions).toBeUndefined();
    const freed = { ...current, fellowProgressState: current.fellowProgressState.slice(1),
      relationshipState: { ...current.relationshipState, occupiedSlots: 3, peerCount: 3 } };
    const fresh = getResolvableQueuedEvent(freed, full);
    expect(fresh.choices.find(choice => choice.label === "长期合作")?.effects.fellowAdditions).toHaveLength(1);
  });

  it("preserves deterministic candidates and random position across JSON reload and decision previews", () => {
    const initial = state();
    const collect = (current: GameState) => withGameRandom(current, () => enqueueMonthlyEventsForMonth(current).nextState);
    const first = collect(initial);
    expect(collect(JSON.parse(JSON.stringify(initial)))).toEqual(first);
    const decision = resolve(first, 11);
    const unchanged = JSON.stringify(decision);
    const preview = refreshPendingEventDecisions(decision);
    const reloaded = refreshPendingEventDecisions(JSON.parse(unchanged));
    expect(reloaded).toEqual(preview);
    expect(decision.randomState).toEqual(preview.randomState);
    expect(JSON.stringify(decision)).toBe(unchanged);
  });
});
