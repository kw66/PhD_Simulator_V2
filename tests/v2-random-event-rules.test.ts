import { describe, expect, it } from "vitest";
import {
  BASE_RANDOM_EVENT_IDS,
  advanceColdWeight,
  buildWeightedRandomEventPool,
  calculateRandomEventCount,
  createInitialRandomEventState,
  drawRandomEvent,
  getAttributeTier,
  unlockMentoringRandomEvent,
  yearlyResetRandomEventState,
} from "../src/core/v2-random-event-rules";

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

  it("matches the legacy random event count probabilities", () => {
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

    const resetState = yearlyResetRandomEventState(
      {
        ...initialState,
        availableRandomEvents: [2, 5],
        usedRandomEvents: [1, 3],
        coldWeight: 2.4,
        badmintonYear: 2,
        totalRandomEventCount: 4,
      },
      1,
    );

    expect(resetState.availableRandomEvents).toContain(14);
    expect(resetState.usedRandomEvents).toEqual([]);
    expect(resetState.coldWeight).toBe(2.4);
    expect(resetState.badmintonYear).toBe(2);
    expect(resetState.totalRandomEventCount).toBe(4);
  });

  it("unlocks event 14 only once", () => {
    const unlocked = unlockMentoringRandomEvent(createInitialRandomEventState());
    expect(unlocked.availableRandomEvents).toContain(14);
    expect(unlocked.availableRandomEvents.filter((eventId) => eventId === 14)).toHaveLength(1);

    const unlockedAgain = unlockMentoringRandomEvent(unlocked);
    expect(unlockedAgain.availableRandomEvents.filter((eventId) => eventId === 14)).toHaveLength(1);
  });

  it("applies first semester protection but still allows dynamic event 11", () => {
    const snapshot = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(),
      social: 6,
      san: 3,
      year: 1,
      month: 2,
    });

    expect(snapshot.isFirstSemester).toBe(true);
    expect(snapshot.candidateEventIds).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 15, 11]);
    expect(snapshot.candidateEventIds).not.toContain(3);
    expect(snapshot.coldActualWeight).toBe(0);
  });

  it("uses the cooperation pool only in in-game month 7", () => {
    const gameMonthSeven = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(1),
      social: 6,
      san: 10,
      year: 2,
      month: 7,
    });
    expect(gameMonthSeven.isCooperationMonth).toBe(true);
    expect(gameMonthSeven.candidateEventIds).toEqual([1, 10, 14, 11]);

    const gameMonthEleven = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(1),
      social: 6,
      san: 10,
      year: 2,
      month: 11,
    });
    expect(gameMonthEleven.isCooperationMonth).toBe(false);
    expect(gameMonthEleven.candidateEventIds).toContain(3);
    expect(gameMonthEleven.candidateEventIds).not.toEqual([1, 10, 14, 11]);
  });

  it("applies SAN tier weighting and monthly coldWeight growth", () => {
    const snapshot = buildWeightedRandomEventPool({
      ...createInitialRandomEventState(),
      social: 0,
      san: 0,
      year: 2,
      month: 8,
      coldWeight: 2,
    });

    expect(snapshot.coldActualWeight).toBe(8);
    expect(snapshot.weightedPool.filter((eventId) => eventId === 3)).toHaveLength(80);
    expect(advanceColdWeight(1)).toBeCloseTo(1.2);
    expect(advanceColdWeight(8)).toBe(8);
  });

  it("resets coldWeight only when the actual cold event resolves", () => {
    const result = drawRandomEvent(
      {
        availableRandomEvents: [3],
        usedRandomEvents: [],
        coldWeight: 2,
        badmintonYear: -1,
        totalRandomEventCount: 4,
        social: 0,
        san: 0,
        year: 2,
        month: 8,
      },
      0.5,
    );

    expect(result.outcome).toBe("event");
    expect(result.eventId).toBe(3);
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.usedRandomEvents).toEqual([3]);
    expect(result.nextState.coldWeight).toBe(1);
    expect(result.nextState.totalRandomEventCount).toBe(5);
  });

  it("keeps coldWeight when badminton immunity blocks the cold event", () => {
    const result = drawRandomEvent(
      {
        availableRandomEvents: [3],
        usedRandomEvents: [],
        coldWeight: 2,
        badmintonYear: 2,
        totalRandomEventCount: 1,
        social: 0,
        san: 0,
        year: 2,
        month: 8,
      },
      0.5,
    );

    expect(result.outcome).toBe("immune-cold");
    expect(result.eventId).toBe(3);
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.usedRandomEvents).toEqual([3]);
    expect(result.nextState.coldWeight).toBe(2);
    expect(result.nextState.totalRandomEventCount).toBe(2);
  });
});
