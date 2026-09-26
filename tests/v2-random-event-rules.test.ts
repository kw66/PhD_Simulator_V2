import { describe, expect, it } from "vitest";
import {
  BASE_RANDOM_EVENT_IDS,
  buildWeightedRandomEventPool,
  calculateRandomEventCount,
  createInitialRandomEventState,
  drawRandomEvent,
  getAttributeTier,
  isRandomEventProtectionWindow,
  yearlyResetRandomEventState,
} from "../src/core/v2-random-event-rules";
import { applyTierResist } from "../src/core/v2-sanity-rules";

describe("v2 random event rules", () => {
  it("uses the confirmed 6 / 12 / 18 tier thresholds", () => {
    expect(getAttributeTier(0)).toBe(0);
    expect(getAttributeTier(5)).toBe(0);
    expect(getAttributeTier(6)).toBe(1);
    expect(getAttributeTier(11)).toBe(1);
    expect(getAttributeTier(12)).toBe(2);
    expect(getAttributeTier(17)).toBe(2);
    expect(getAttributeTier(18)).toBe(3);
  });

  it("matches the confirmed random event count probabilities", () => {
    expect(calculateRandomEventCount(0)).toBe(0);
    expect(calculateRandomEventCount(0.6999)).toBe(0);
    expect(calculateRandomEventCount(0.70)).toBe(1);
    expect(calculateRandomEventCount(0.8499)).toBe(1);
    expect(calculateRandomEventCount(0.85)).toBe(2);
    expect(calculateRandomEventCount(0.9499)).toBe(2);
    expect(calculateRandomEventCount(0.95)).toBe(3);
  });

  it("uses one-event protection at the start and end of a run", () => {
    const protection = { totalMonths: 1, maxMonths: 68 };
    expect(isRandomEventProtectionWindow(protection)).toBe(true);
    expect(calculateRandomEventCount(0.69, protection)).toBe(0);
    expect(calculateRandomEventCount(0.70, protection)).toBe(1);
    expect(calculateRandomEventCount(0.99, protection)).toBe(1);
    expect(isRandomEventProtectionWindow({ totalMonths: 3, maxMonths: 68 })).toBe(true);
    expect(isRandomEventProtectionWindow({ totalMonths: 4, maxMonths: 68 })).toBe(false);
    expect(isRandomEventProtectionWindow({ totalMonths: 59, maxMonths: 68 })).toBe(false);
    expect(isRandomEventProtectionWindow({ totalMonths: 60, maxMonths: 68 })).toBe(true);
    expect(calculateRandomEventCount(0.99, { totalMonths: 60, maxMonths: 68 })).toBe(1);
    expect(calculateRandomEventCount(0.99, { totalMonths: 59, maxMonths: 68 })).toBe(3);
  });

  it("initializes and yearly resets the pool using published paper state", () => {
    const initialState = createInitialRandomEventState();
    expect(initialState.availableRandomEvents).toEqual([...BASE_RANDOM_EVENT_IDS]);
    expect(initialState.availableRandomEvents).toContain(14);
    expect(initialState.availableRandomEvents).toContain(16);

    const resetState = yearlyResetRandomEventState(
      {
        ...initialState,
        availableRandomEvents: [2, 5],
        usedRandomEvents: [1, 3],
        totalRandomEventCount: 4,
      },
      1,
    );

    expect(resetState.availableRandomEvents).toContain(14);
    expect(resetState.usedRandomEvents).toEqual([]);
    expect(resetState.totalRandomEventCount).toBe(4);
  });

  it("keeps every ordinary event in the same pool and excludes only disease", () => {
    const snapshot = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(),
      social: 6,
    });

    expect(snapshot.candidateEventIds).toEqual([...BASE_RANDOM_EVENT_IDS]);
    expect(snapshot.candidateEventIds).not.toContain(3);
    expect(snapshot.weightedPool.filter((eventId) => eventId === 3)).toHaveLength(0);
  });

  it("does not change the ordinary pool when prerequisites become available", () => {
    const gameMonthSeven = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(1),
      social: 6,
    });
    expect(gameMonthSeven.candidateEventIds).toEqual([...BASE_RANDOM_EVENT_IDS]);

    const gameMonthEleven = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(1),
      social: 6,
    });
    expect(gameMonthEleven.candidateEventIds).not.toContain(3);
    expect(gameMonthEleven.candidateEventIds).toEqual([...BASE_RANDOM_EVENT_IDS]);
  });

  it("prefers event categories that have not appeared in the same month", () => {
    const base = {
      ...createInitialRandomEventState(),
      availableRandomEvents: [1, 2, 7, 13],
      social: 0,
    };
    expect(buildWeightedRandomEventPool({ ...base, excludedCategories: ["guidance"] }).candidateEventIds)
      .toEqual([2, 7, 13]);
    expect(buildWeightedRandomEventPool({
      ...base,
      excludedCategories: ["guidance", "balance", "reward", "punishment"],
    }).candidateEventIds).toEqual([1, 2, 7, 13]);
  });

  it("does not advertise a resisted gain that the stat cap will discard", () => {
    expect(applyTierResist(1, 20, () => 0.99)).toMatchObject({
      effectiveChange: 0,
      resistedCount: 0,
      cappedCount: 1,
    });
    expect(applyTierResist(1, 21, () => 0.99, 22)).toMatchObject({
      effectiveChange: 1,
    });
  });

  it("keeps all ordinary random events at equal weight", () => {
    const snapshot = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(),
      social: 0,
    });

    const counts = new Map<number, number>();
    for (const eventId of snapshot.weightedPool) counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
    expect(new Set(counts.values())).toEqual(new Set([10]));
  });

  it.each([12, 13])("removes event %i after its first draw in an academic year", (eventId) => {
    const context = {
      ...createInitialRandomEventState(),
      availableRandomEvents: [eventId],
      social: 0,
      hasAuthorshipEligibleDraftPaper: true,
    };
    const first = drawRandomEvent(context, 0);
    expect(first.eventId).toBe(eventId);
    expect(first.nextState.availableRandomEvents).toEqual([]);
    expect(first.nextState.usedRandomEvents).toEqual([]);

    const second = drawRandomEvent({ ...context, ...first.nextState }, 0);
    expect(second.outcome).toBe("none");
    expect(second.eventId).toBeNull();
    expect(second.nextState.availableRandomEvents).toEqual([]);
    expect(second.nextState.usedRandomEvents).toEqual([]);
  });

  it("never draws the removed illness event from the ordinary pool", () => {
    const result = drawRandomEvent(
      {
        availableRandomEvents: [3],
        usedRandomEvents: [],
        illnessProbability: 4,
        totalRandomEventCount: 4,
        social: 0,
      },
      0.5,
    );

    expect(result.outcome).toBe("none");
    expect(result.eventId).toBeNull();
    expect(result.nextState.totalRandomEventCount).toBe(4);
  });

  it("keeps data-loss in the ordinary pool and defers its prerequisite check", () => {
    const base = {
      ...createInitialRandomEventState(),
      social: 0,
    };
    expect(buildWeightedRandomEventPool({ ...base, hasRecoverableDraftPaper: false }).candidateEventIds).toContain(16);
    expect(buildWeightedRandomEventPool({ ...base, hasRecoverableDraftPaper: true }).candidateEventIds).toContain(16);
  });

  it("keeps junior mentoring in the ordinary pool before its prerequisite is met", () => {
    const base = {
      ...createInitialRandomEventState(),
      social: 0,
    };
    expect(buildWeightedRandomEventPool({ ...base, publishedPaperCount: 0 }).candidateEventIds).toContain(14);
    expect(buildWeightedRandomEventPool({ ...base, publishedPaperCount: 1 }).candidateEventIds).toContain(14);
    expect(buildWeightedRandomEventPool({
      ...base,
      publishedPaperCount: 1,
      usedRandomEvents: [14],
    }).candidateEventIds).not.toContain(14);
  });
});
