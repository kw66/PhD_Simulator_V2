import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getCalendarForTotalMonths, getGraduationScoreTarget, getMonthLimitByDegree } from "../src/core/v2-progression";
import type { Degree, GameState } from "../src/core/v2-types";

function makeState(totalMonths: number, degree: Degree = "master"): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base, ...getCalendarForTotalMonths(totalMonths, degree), totalMonths, degree,
    maxMonths: getMonthLimitByDegree(degree), selectedAdvisorName: "测试导师",
    graduationScoreTarget: getGraduationScoreTarget(degree, "测试导师"),
    availableRandomEvents: [], eventQueue: [], buffs: [],
    player: { san: 20, research: 10, social: 5, favor: 5, money: 20 },
  };
}

function chooseTransferStage(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId === "phd-decision");
  expect(event).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event!.id, eventChoiceId: choiceId ?? event!.choices[0]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("June transfer priority", () => {
  it.each([
    [3, "transfer-phd", "phd"],
    [4, "transfer-phd", "phd"],
    [2, "transfer-phd", "master"],
    [3, "continue-master", "master"],
  ] as const)("resolves third-year score %s choice %s before the %s endpoint", (score, choice, degree) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const june = dispatchAction({ ...makeState(33), totalResearchScore: score }, "next-month");
    expect(june).toMatchObject({ phase: "playing", ending: null, totalMonths: 34, year: 3, month: 10, degree: "master", maxMonths: 34 });
    expect(june.eventQueue.find((event) => event.chainId === "phd-decision"))
      .toMatchObject({ stage: "act1", deadlineMonths: 0 });
    const blocked = dispatchAction(june, "next-month");
    expect(blocked).toMatchObject({ phase: "playing", ending: null, totalMonths: 34 });
    expect(blocked.eventQueue).toEqual(june.eventQueue);
    const skipped = dispatchAction(june, "force-next-month");
    expect(skipped).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34, degree: "master", maxMonths: 34 });
    expect(skipped.eventQueue).toHaveLength(0);
    const decision = chooseTransferStage(june);
    expect(decision.eventQueue.find((event) => event.chainId === "phd-decision")?.description).toContain("今年转博需要达到 3 分");
    const result = chooseTransferStage(decision, choice);
    expect(result).toMatchObject({ phase: "playing", ending: null, degree: "master", maxMonths: 34 });
    expect(result.eventQueue.find((event) => event.chainId === "phd-decision")?.stage).toBe("result");
    expect(dispatchAction(result, "next-month")).toMatchObject({ phase: "playing", ending: null, totalMonths: 34 });
    const settled = chooseTransferStage(result);
    expect(settled).toMatchObject({
      phase: "playing", ending: null, totalMonths: 34, degree,
      maxMonths: degree === "phd" ? 70 : 34, graduationScoreTarget: degree === "phd" ? 7 : 1,
    });
    expect(settled.eventQueue).toHaveLength(0);
    expect(dispatchAction(settled, "next-month")).toMatchObject(degree === "phd"
      ? { phase: "playing", ending: null, totalMonths: 35, year: 3, month: 11, degree: "phd", maxMonths: 70 }
      : { phase: "finished", ending: "master", totalMonths: 34, month: 10, maxMonths: 34 });
  });

  it.each([1, 2])("retains the second-year June threshold of two at score %s", (score) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const june = dispatchAction({ ...makeState(21), totalResearchScore: score }, "next-month");
    expect(june).toMatchObject({ phase: "playing", ending: null, totalMonths: 22, year: 2, month: 10 });
    const decision = chooseTransferStage(june);
    expect(decision.eventQueue.find((event) => event.chainId === "phd-decision")?.description).toContain("今年转博需要达到 2 分");
    const settled = chooseTransferStage(chooseTransferStage(decision, "transfer-phd"));
    expect(settled).toMatchObject({
      phase: "playing", ending: null, totalMonths: 22,
      degree: score === 2 ? "phd" : "master", maxMonths: score === 2 ? 70 : 34,
    });
    expect(dispatchAction(settled, "next-month")).toMatchObject({ phase: "playing", ending: null, totalMonths: 23 });
  });
});

describe("fellow June-end settlement through the engine", () => {
  it.each([
    [2, 2, "master", "transfer"],
    [3, 3, "master", "transfer"],
    [3, 1, "master", "graduation"],
    [3, 0, "master", "withdrawal"],
    [6, 7, "phd", "graduation"],
    [6, 6, "phd", "withdrawal"],
  ] as const)("settles year %s score %s %s %s only when leaving June", (academicYear, score, degree, outcome) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(9);
    const fellow = createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: "林青", research: 0, affinity: 1,
      startTotalMonths: 1, academicYear, degree, initialResearchScore: score,
    });
    state.fellowProgressState = [fellow];
    state.relationshipState = { ...state.relationshipState, occupiedSlots: 1, peerCount: 1 };
    const june = dispatchAction(state, "next-month");
    expect(june).toMatchObject({ phase: "playing", totalMonths: 10, month: 10 });
    expect(june.fellowProgressState).toHaveLength(1);
    expect(june.fellowProgressState[0]).toMatchObject({ id: fellow.id, degree });
    expect(june.log.some((entry) => entry.id.startsWith("fellow-transfer-")
      || entry.id.startsWith("fellow-graduation-") || entry.id.startsWith("fellow-withdrawal-"))).toBe(false);
    const rested = dispatchAction(june, "rest");
    expect(rested.fellowProgressState).toHaveLength(1);
    expect(rested.fellowProgressState[0]?.degree).toBe(degree);
    const july = dispatchAction(rested, "next-month");
    expect(july).toMatchObject({ phase: "playing", totalMonths: 11, month: 11 });
    const lifecycleLogs = july.log.filter((entry) => entry.id.startsWith(`fellow-${outcome}-`));
    expect(lifecycleLogs).toHaveLength(1);
    expect(lifecycleLogs[0]?.month).toBe(10);
    if (outcome === "transfer") {
      expect(july.fellowProgressState).toHaveLength(1);
      expect(july.fellowProgressState[0]).toMatchObject({ id: fellow.id, degree: "phd" });
      expect(july.relationshipState).toMatchObject({ occupiedSlots: 1, peerCount: 1 });
    } else {
      expect(july.fellowProgressState).toHaveLength(0);
      expect(july.relationshipState).toMatchObject({ occupiedSlots: 0, peerCount: 0 });
    }
  });

  it.each(["next-month", "force-next-month"] as const)("%s waits for June choices and uses the latest fellow score before final graduation", (action) => {
    const state = makeState(34);
    state.totalResearchScore = 1;
    const fellow = createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: "林青", research: 0, affinity: 1,
      startTotalMonths: 25, academicYear: 3, degree: "master", initialResearchScore: 2,
    });
    state.fellowProgressState = [fellow];
    state.relationshipState = { ...state.relationshipState, occupiedSlots: 1, peerCount: 1 };
    state.eventQueue = [createEventQueueItem({
      id: "june-result", title: "六月结果", description: "", source: "system", blocking: false,
      deadlineMonths: 0, chainId: "june-result", stage: "result",
      choices: [{ id: "confirm", label: "确认", outcome: "确认六月成果", effects: {} }],
    }, 1)];
    const blocked = dispatchAction(state, action);
    expect(blocked).toMatchObject({ phase: "playing", ending: null, totalMonths: 34 });
    expect(blocked.fellowProgressState[0]).toMatchObject({ id: fellow.id, degree: "master" });
    const resolved = dispatchAction(blocked, "resolve-event", { eventId: "june-result", eventChoiceId: "confirm" });
    expect(resolved.fellowProgressState[0]).toMatchObject({ id: fellow.id, degree: "master" });
    const withJuneScore = { ...resolved, fellowProgressState: resolved.fellowProgressState.map((profile) => ({ ...profile, initialResearchScore: 3 })) };
    const finished = dispatchAction(withJuneScore, action);
    expect(finished).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
    expect(finished.fellowProgressState[0]).toMatchObject({ id: fellow.id, degree: "phd" });
    expect(finished.log.filter((entry) => entry.id.startsWith("fellow-transfer-"))).toHaveLength(1);
    expect(dispatchAction(finished, action)).toBe(finished);
  });
});
