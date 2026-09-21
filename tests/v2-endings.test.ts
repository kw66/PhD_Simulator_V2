import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_ACTION_IDS } from "../src/core/v2-action-ids";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getCalendarForTotalMonths, getGraduationScoreTarget, getMonthLimitByDegree } from "../src/core/v2-progression";
import type { Degree, EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

function makeState(totalMonths = 10, degree: Degree = "master"): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    ...getCalendarForTotalMonths(totalMonths, degree),
    totalMonths,
    degree,
    maxMonths: getMonthLimitByDegree(degree),
    selectedAdvisorName: "测试导师",
    graduationScoreTarget: getGraduationScoreTarget(degree, "测试导师"),
    availableRandomEvents: [],
    eventQueue: [],
    buffs: [],
    player: { san: 20, research: 10, social: 5, favor: 5, money: 20 },
  };
}

function makeEvent(id: string, effects: EventChoice["effects"] = {}, patch: Partial<PendingEvent> = {}) {
  return createEventQueueItem({
    id, title: id, description: "", source: "system", blocking: true, deadlineMonths: 0,
    chainId: id, stage: "result",
    choices: [{ id: "confirm", label: "确认", outcome: "事件结算", effects }],
    ...patch,
  }, 1);
}

function resolveEvent(state: GameState, eventId: string): GameState {
  return dispatchAction(state, "resolve-event", { eventId, eventChoiceId: "confirm" });
}

function withPendingJournalHelp(state: GameState, helper: "lover" | "fellow"): GameState {
  const paper = {
    ...createDraftPaper(1, 0, () => 0), idea: 40, experiment: 40, writing: 40,
    status: "journal-reviewing" as const, journalTarget: "pami" as const,
    submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40,
  };
  if (helper === "fellow") {
    return {
      ...state, papers: [paper],
      fellowProgressState: [{
        ...createCustomFellowProgressProfile({ type: "senior", gender: "female", name: "林青", research: 20, affinity: 2, startTotalMonths: 1 }),
        pendingHelpToPlayer: 20,
      }],
    };
  }
  return {
    ...state, papers: [paper], loverState: activateLover("smart", 1, "male"),
    loverProgressState: {
      ...createLoverProgressState("smart", () => 0),
      pendingPaperHelp: { amount: 20, collaboratorId: "lover-test", name: "林青" },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("ending failure boundaries", () => {
  it.each([
    ["san", "burnout"], ["money", "poor"], ["favor", "expelled"], ["social", "isolated"],
  ] as const)("ends only below zero for %s and preserves the event cause", (stat, ending) => {
    const state = makeState();
    state.player[stat] = 0;
    state.eventQueue = [makeEvent("损失", { [stat]: -1 })];
    const finished = resolveEvent(state, "损失");
    expect(finished).toMatchObject({ phase: "finished", ending, player: { [stat]: -1 } });
    expect(finished.endingCause).toEqual({ text: "损失：事件结算", totalMonths: 10 });
    expect(finished.endingCause?.text).not.toBe(finished.log[0]?.text);
    const survived = resolveEvent({ ...state, eventQueue: [makeEvent("零值")] }, "零值");
    expect(survived.phase).toBe("playing");
    expect(survived.player[stat]).toBe(0);
  });

  it.each([
    [{ san: -1, money: -1, favor: -1, social: -1 }, "burnout"],
    [{ san: 0, money: -1, favor: -1, social: -1 }, "poor"],
    [{ san: 0, money: 0, favor: -1, social: -1 }, "expelled"],
    [{ san: 0, money: 0, favor: 0, social: -1 }, "isolated"],
  ] as const)("prioritizes failures before graduation: %j", (stats, ending) => {
    const state = makeState(68);
    const next = dispatchAction({ ...state, totalResearchScore: 10, player: { ...state.player, ...stats } }, "next-month");
    expect(next.ending).toBe(ending);
    expect(next.totalMonths).toBe(68);
  });

  it("applies spike protection centrally after advisor work and counts recovery once", () => {
    const state = makeState();
    state.player.san = 6;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    const next = dispatchAction(state, "advisor-horizontal");
    expect(next.player.san).toBe(3);
    expect(next.advisorProgressState.funding).toBe(state.advisorProgressState.funding + 1);
    expect(next.shopState.chairSanRecovered).toBe(3);
    expect(next.phase).toBe("playing");
    expect(dispatchAction(next, "advisor-horizontal").shopState.chairSanRecovered).toBe(3);
    const failed = resolveEvent({ ...next, eventQueue: [makeEvent("双重损失", { san: -20, money: -100 })] }, "双重损失");
    expect(failed.player.san).toBe(3);
    expect(failed.ending).toBe("poor");
  });

  it("keeps deferred effects and failures pending until the result is confirmed", () => {
    const state = makeState();
    state.player.money = 0;
    const result = makeEvent("result", {}, { chainId: "deferred" });
    state.eventQueue = [makeEvent("decision", { money: -1, enqueueEvents: [result] }, { chainId: "deferred", stage: "act2" })];
    const pending = resolveEvent(state, "decision");
    expect(pending).toMatchObject({ phase: "playing", player: { money: 0 }, ending: null });
    const finished = resolveEvent(pending, "result");
    expect(finished).toMatchObject({ phase: "finished", player: { money: -1 }, ending: "poor" });
    expect(finished.endingCause?.text).toContain("decision");
  });

  it("honors monthly spike protection before other failures without double counting recovery", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(9);
    state.player.san = 1;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    state.buffs = [{ id: "monthly-loss", name: "月度压力", source: "测试", timing: "permanent", remainingMonths: null, monthlyStats: { san: -4 } }];
    const survived = dispatchAction(state, "next-month");
    expect(survived).toMatchObject({ phase: "playing", player: { san: 3 }, shopState: { chairSanRecovered: 5 } });
    const failed = dispatchAction({ ...state, buffs: [{ ...state.buffs[0]!, monthlyStats: { san: -4, money: -100 } }] }, "next-month");
    expect(failed).toMatchObject({ phase: "finished", ending: "poor", player: { san: 3 }, shopState: { chairSanRecovered: 5 } });
  });

  it("does not let a pending publication reward rescue a fatal event", () => {
    const state = withPendingJournalHelp(makeState(), "lover");
    const finished = resolveEvent({ ...state, eventQueue: [makeEvent("fatal", { san: -21 })] }, "fatal");
    expect(finished).toMatchObject({ phase: "finished", ending: "burnout", player: { san: -1 } });
    expect(finished.papers).toEqual(state.papers);
    expect(finished.externalPublications).toHaveLength(0);
    expect(finished.loverProgressState.pendingPaperHelp).toEqual(state.loverProgressState.pendingPaperHelp);
    expect(finished.endingCause?.text).toBe("fatal：事件结算");
  });

  it.each(["lover", "fellow", "automatic-coffee", "coffee-subscription"])("stops monthly losses before %s can heal them", (recovery) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(9);
    state.player.san = 1;
    state.buffs = [{ id: "monthly-loss", name: "月度压力", source: "测试", timing: "permanent", remainingMonths: null, monthlyStats: { san: -4 } }];
    state.loverState = activateLover("beautiful", 1, "male");
    state.loverProgressState = {
      ...createLoverProgressState("beautiful", () => 0),
      routes: { play: { progress: 99, completed: 0 }, study: { progress: 0, completed: 0 }, shopping: { progress: 0, completed: 0 } },
    };
    if (recovery === "automatic-coffee" || recovery === "coffee-subscription") {
      state.coffeeState = { ...state.coffeeState, machineOwned: true,
        machineUpgrade: recovery === "automatic-coffee" ? "automatic" : null,
        subscriptionEnabled: recovery === "coffee-subscription" };
    }
    const next = dispatchAction(recovery === "fellow" ? withPendingJournalHelp(state, "fellow") : state, "next-month");
    expect(next.ending).toBe("burnout");
    expect(next.totalMonths).toBe(10);
    expect(next.player.san).toBeLessThan(0);
    expect(next.loverProgressState.routes?.play.completed).toBe(0);
    expect(next.coffeeState.coffeeProducedCountThisMonth).toBe(0);
    expect(next.externalPublications).toHaveLength(0);
    expect(next.endingCause).toMatchObject({ totalMonths: 10 });
    expect(next.endingCause?.text).toContain("月度压力 SAN -4");
  });
});

describe("graduation settlement", () => {
  it.each(["master", "phd"] as const)("keeps the %s limit at 68 and checks the current target", (degree) => {
    const state = makeState(68, degree);
    expect(state.maxMonths).toBe(68);
    expect(state.graduationScoreTarget).toBe(degree === "master" ? 1 : 7);
    for (const offset of [-1, 0, 1]) {
      const finished = dispatchAction({ ...state, totalResearchScore: state.graduationScoreTarget! + offset }, "next-month");
      expect(finished.ending).toBe(offset < 0 ? "delay" : degree);
      expect(finished.totalMonths).toBe(68);
      expect(dispatchAction(finished, "next-month")).toBe(finished);
    }
  });

  it("settles month 68 without adding a month or ending before due choices", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(67);
    state.eventQueue = [makeEvent("last-choice", { score: 1 }, { deadlineMonths: 1 })];
    const advanced = dispatchAction(state, "next-month");
    expect(advanced).toMatchObject({ phase: "playing", totalMonths: 68 });
    expect(advanced.eventQueue.find((event) => event.id === "last-choice")?.deadlineMonths).toBe(0);
    let current = advanced;
    for (let count = 0; count < 30 && current.phase === "playing" && current.eventQueue.some((event) => event.deadlineMonths <= 0); count += 1) {
      const event = current.eventQueue.find((entry) => entry.deadlineMonths <= 0)!;
      current = dispatchAction(current, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    expect(current).toMatchObject({ phase: "finished", ending: "master", totalMonths: 68 });
  });

  it("waits for due nonblocking results but ignores unreachable future events", () => {
    const state = makeState(68);
    state.eventQueue = [makeEvent("due-result", { score: 1 }, { blocking: false }), makeEvent("future", { money: -100 }, { deadlineMonths: 1 })];
    expect(dispatchAction(state, "next-month").phase).toBe("playing");
    const finished = resolveEvent(state, "due-result");
    expect(finished).toMatchObject({ phase: "finished", ending: "master", totalMonths: 68 });
    expect(finished.player.money).toBe(20);
    expect(finished.eventQueue.map((event) => event.id)).toEqual(["future"]);
    expect(dispatchAction({ ...state, blockLinearEvents: false, eventQueue: [makeEvent("future", {}, { deadlineMonths: 1 })] }, "next-month").ending).toBe("delay");
  });

  it.each(["lover", "fellow"] as const)("credits %s journal help on both final-event and final-month routes", (helper) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withPendingJournalHelp(makeState(68, "phd"), helper);
    state.totalResearchScore = 2;
    for (const route of ["event", "month"] as const) {
      const next = route === "event"
        ? resolveEvent({ ...state, eventQueue: [makeEvent("last-result")] }, "last-result")
        : dispatchAction(state, "next-month");
      expect(next).toMatchObject({ phase: "finished", ending: "phd", totalResearchScore: 7 });
      expect(next.externalPublications).toHaveLength(1);
    }
  });

  it("checks graduation after action-triggered journal publication", () => {
    const state = withPendingJournalHelp(makeState(68, "phd"), "lover");
    const next = dispatchAction({ ...state, totalResearchScore: 2 }, "select-paper", { paperId: state.papers[0]!.id });
    expect(next).toMatchObject({ phase: "finished", ending: "phd", totalResearchScore: 7 });
  });

  it("does not award graduation with an undetermined target", () => {
    expect(dispatchAction({ ...makeState(68), graduationScoreTarget: null, totalResearchScore: 100 }, "next-month").ending).toBe("delay");
  });
});

describe("terminal state and quitting", () => {
  it("quits without consuming pending help and records the previous meaningful log", () => {
    const state = withPendingJournalHelp(makeState(), "lover");
    state.log = [
      { id: "hint", month: 10, text: "必须先处理待办事件。" },
      { id: "cause", month: 9, text: "最近一次科研经历。" },
    ];
    const quit = dispatchAction(state, "quit-game");
    expect(quit).toMatchObject({ phase: "finished", ending: "quit", endingCause: { text: "最近一次科研经历。", totalMonths: 9 } });
    expect(quit.papers).toBe(state.papers);
    expect(quit.loverProgressState).toBe(state.loverProgressState);
    expect(dispatchAction(quit, "quit-game")).toBe(quit);
    const setup = createInitialState();
    expect(dispatchAction(setup, "quit-game")).toBe(setup);
  });

  it.each(["quit", "failure", "graduation"])("rejects all gameplay dispatches after %s, including queued events and debug actions", (reason) => {
    const state = makeState(68);
    state.eventQueue = [makeEvent("reward", { money: 10 })];
    const finished = reason === "quit" ? dispatchAction(state, "quit-game")
      : reason === "failure" ? resolveEvent({ ...state, eventQueue: [makeEvent("fatal", { san: -100 }), ...state.eventQueue] }, "fatal")
        : dispatchAction({ ...state, eventQueue: [], totalResearchScore: 1 }, "next-month");
    const snapshot = structuredClone(finished);
    for (const actionId of GAME_ACTION_IDS) {
      if (actionId === "restart-game" || actionId === "reset-game") continue;
      expect(dispatchAction(finished, actionId, {
        eventId: "reward", eventChoiceId: "confirm", roleId: "genius", relationshipId: "lover",
        debugStatId: "san", delta: 10, blockLinearEvents: false,
      }), actionId).toBe(finished);
    }
    expect(finished).toEqual(snapshot);
    const reset = dispatchAction(finished, "reset-game");
    expect(reset).toMatchObject({ phase: "setup", ending: null });
    expect(reset.endingCause).toBeUndefined();
    expect(dispatchAction(finished, "restart-game")).toMatchObject({ phase: "playing", ending: null, totalMonths: 0 });
  });
});
