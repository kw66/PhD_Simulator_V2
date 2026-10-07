import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "../src/core/v2-lover-events";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../src/core/v2-progression";
import type { GameState, LoverTypeId } from "../src/core/v2-types";

function makeState(year: number): GameState {
  const base = createStartedGameState("normal");
  const totalMonths = (year - 1) * 12 + 6;
  const degree = year > 3 ? "phd" : "master";
  return {
    ...base, ...getCalendarForTotalMonths(totalMonths, degree), totalMonths, degree,
    maxMonths: getMonthLimitByDegree(degree), eventQueue: [], availableRandomEvents: [],
    player: { san: 10, research: 10, social: 5, favor: 5, money: 20 },
  };
}

function queueConfession(state: GameState, type: LoverTypeId): GameState {
  const context = buildLoverDevelopmentContext({
    conferenceEncounterState: state.conferenceEncounterState,
    totalMonths: state.totalMonths, type, playerGender: "male",
  });
  return { ...state, eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(context), 1)] };
}

function choose(state: GameState, eventChoiceId: string): GameState {
  expect(state.eventQueue).toHaveLength(1);
  return dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]!.id, eventChoiceId });
}

function acceptConfession(state: GameState, type: LoverTypeId): GameState {
  return choose(choose(choose(queueConfession(state, type), "continue"), "accept"), "close");
}

afterEach(() => vi.restoreAllMocks());

describe("lover cohort initialization through dispatch", () => {
  it.each([
    ["beautiful", 0, 2, 6, 6],
    ["beautiful", 0.99, 5, 11, 9],
    ["smart", 0, 6, 6, 3],
    ["smart", 0.3, 7, 12, 4],
    ["smart", 0.99, 9, 15, 6],
  ] as const)("initializes natural %s at roll %s with cohort research %s / %s", (type, roll, firstYearResearch, fourthYearResearch, intimacy) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    expect(createLoverProgressState(type, () => roll)).toMatchObject({ research: firstYearResearch, intimacy });
    for (const [year, research] of [[1, firstYearResearch], [4, fourthYearResearch]] as const) {
      const initial = makeState(year);
      const snapshot = structuredClone(initial);
      const decision = choose(queueConfession(initial, type), "continue");
      expect(decision.eventQueue[0]?.stage).toBe("act2");
      const pending = choose(decision, "accept");
      expect(pending.eventQueue[0]?.stage).toBe("result");
      expect(pending.loverState.active).toBe(false);
      expect(pending.loverProgressState).toEqual(initial.loverProgressState);
      const accepted = choose(pending, "close");
      expect(accepted).toMatchObject({
        phase: "playing", year, totalMonths: initial.totalMonths,
        loverState: { active: true, type, startTotalMonths: initial.totalMonths },
        loverProgressState: { active: true, research, intimacy, giftCoupons: 0, pendingPaperHelp: null },
        relationshipState: { loverCount: 1 },
      });
      expect(accepted.loverProgressState.routes).toEqual({
        play: { progress: 0, completed: 0 }, study: { progress: 0, completed: 0 }, shopping: { progress: 0, completed: 0 },
      });
      expect(accepted.player).toEqual(initial.player);
      expect(initial).toEqual(snapshot);
    }
  });

  it.each([
    [0, 6, 6, 3],
    [0.3, 7, 12, 4],
    [0.99, 9, 15, 6],
  ] as const)("uses the current year for debug smart lovers at roll %s", (roll, firstYearResearch, fourthYearResearch, intimacy) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    for (const [year, research] of [[1, firstYearResearch], [4, fourthYearResearch]] as const) {
      const initial = makeState(year);
      const added = dispatchAction(initial, "debug-add-relationship", { debugRelationshipType: "lover" });
      expect(added).toMatchObject({
        phase: "playing", year,
        loverState: { active: true, type: "smart", startTotalMonths: initial.totalMonths },
        loverProgressState: { active: true, research, intimacy },
        relationshipState: { loverCount: 1 },
      });
      expect(added.player).toEqual(initial.player);
      expect(added.buffs).toEqual(initial.buffs);
    }
  });

  it("resists the smart bonus point by point and samples intimacy independently afterward", () => {
    const random = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    expect(createLoverProgressState("smart", random, 4)).toMatchObject({ research: 7, intimacy: 6 });
    expect(random).toHaveBeenCalledTimes(8);
  });

  it.each(["beautiful", "smart"] as const)("commits the sampled %s profile without rerolling when its result is confirmed", (type) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const pending = choose(choose(queueConfession(makeState(4), type), "continue"), "accept");
    random.mockReturnValue(0);
    const accepted = choose(pending, "close");
    expect(accepted.loverProgressState).toMatchObject({
      active: true, research: type === "smart" ? 15 : 11, intimacy: type === "beautiful" ? 9 : 6,
    });
  });

  it.each(["natural-beautiful", "natural-smart", "debug"] as const)("preserves an existing %s lover through unrelated events and actions", (route) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState(4);
    const accepted = route === "debug"
      ? dispatchAction(initial, "debug-add-relationship", { debugRelationshipType: "lover" })
      : acceptConfession(initial, route === "natural-smart" ? "smart" : "beautiful");
    const lover = structuredClone(accepted.loverState);
    const progress = structuredClone(accepted.loverProgressState);
    random.mockReturnValue(0);
    const unrelated = createEventQueueItem({
      id: "unrelated-result", title: "额外收入", description: "", source: "system",
      chainId: "unrelated-result", stage: "result", blocking: true, deadlineMonths: 0,
      choices: [{ id: "confirm", label: "确认", outcome: "金币 +1", effects: { money: 1 } }],
    }, 1);
    const resolved = choose({ ...accepted, eventQueue: [unrelated] }, "confirm");
    expect(resolved.player.money).toBe(accepted.player.money + 1);
    const rested = dispatchAction(resolved, "rest");
    expect(rested.player.san).toBeGreaterThan(resolved.player.san);
    const repeated = dispatchAction(rested, "debug-add-relationship", { debugRelationshipType: "lover" });
    for (const state of [resolved, rested, repeated]) {
      expect(state.loverState).toEqual(lover);
      expect(state.loverProgressState).toEqual(progress);
      expect(state.relationshipState.loverCount).toBe(1);
    }
  });
});
