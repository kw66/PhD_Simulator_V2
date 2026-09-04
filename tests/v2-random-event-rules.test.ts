import { describe, expect, it } from "vitest";
import {
  BASE_RANDOM_EVENT_IDS,
  buildWeightedRandomEventPool,
  calculateRandomEventCount,
  createInitialRandomEventState,
  drawRandomEvent,
  getAttributeTier,
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

  it("initializes and yearly resets the pool using published paper state", () => {
    const initialState = createInitialRandomEventState();
    expect(initialState.availableRandomEvents).toEqual([...BASE_RANDOM_EVENT_IDS]);
    expect(initialState.availableRandomEvents).not.toContain(14);
    expect(initialState.availableRandomEvents).not.toContain(16);

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

  it("keeps the normal pool in the first semester and still allows dynamic event 11", () => {
    const snapshot = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(),
      social: 6,
    });

    expect(snapshot.candidateEventIds).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 11]);
    expect(snapshot.candidateEventIds).not.toContain(3);
    expect(snapshot.weightedPool.filter((eventId) => eventId === 3)).toHaveLength(0);
  });

  it("does not replace the normal pool with a month-7 cooperation pool", () => {
    const gameMonthSeven = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(1),
      social: 6,
    });
    expect(gameMonthSeven.candidateEventIds).toContain(1);
    expect(gameMonthSeven.candidateEventIds).toContain(10);
    expect(gameMonthSeven.candidateEventIds).toContain(14);
    expect(gameMonthSeven.candidateEventIds).toContain(11);

    const gameMonthEleven = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(1),
      social: 6,
    });
    expect(gameMonthEleven.candidateEventIds).not.toContain(3);
    expect(gameMonthEleven.candidateEventIds).not.toEqual([1, 10, 14, 11]);
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
    };
    const first = drawRandomEvent(context, 0);
    expect(first.eventId).toBe(eventId);
    expect(first.nextState.availableRandomEvents).toEqual([]);
    expect(first.nextState.usedRandomEvents).toEqual([eventId]);

    const second = drawRandomEvent({ ...context, ...first.nextState }, 0);
    expect(second.outcome).toBe("none");
    expect(second.eventId).toBeNull();
    expect(second.nextState.availableRandomEvents).toEqual([]);
    expect(second.nextState.usedRandomEvents).toEqual([eventId]);
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

  it("adds data-loss to the ordinary pool only while a draft can be recovered", () => {
    const base = {
      ...createInitialRandomEventState(),
      social: 0,
    };
    expect(buildWeightedRandomEventPool({ ...base, hasRecoverableDraftPaper: false }).candidateEventIds).not.toContain(16);
    expect(buildWeightedRandomEventPool({ ...base, hasRecoverableDraftPaper: true }).candidateEventIds).toContain(16);
  });

  it("adds junior mentoring as soon as a first-author paper is published", () => {
    const base = {
      ...createInitialRandomEventState(),
      social: 0,
    };
    expect(buildWeightedRandomEventPool({ ...base, publishedPaperCount: 0 }).candidateEventIds).not.toContain(14);
    expect(buildWeightedRandomEventPool({ ...base, publishedPaperCount: 1 }).candidateEventIds).toContain(14);
    expect(buildWeightedRandomEventPool({
      ...base,
      publishedPaperCount: 1,
      usedRandomEvents: [14],
    }).candidateEventIds).not.toContain(14);
  });
});
