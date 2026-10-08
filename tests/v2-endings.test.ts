import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_ACTION_IDS } from "../src/core/v2-action-ids";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
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

function resolveDueEvents(state: GameState): GameState {
  let current = state;
  for (let count = 0; count < 30; count += 1) {
    const event = current.eventQueue.find((entry) => entry.deadlineMonths <= 0);
    if (!event) return current;
    const choice = event.choices.find((entry) => entry.id === "continue-master") ?? event.choices[0]!;
    current = dispatchAction(current, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
  }
  throw new Error("Due events did not finish");
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
    ["san", "burnout"], ["money", "poor"], ["favor", "expelled"], ["social", "isolated"], ["research", "overthinking"],
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
    [{ san: 0, money: 0, favor: 0, social: 0, research: -1 }, "overthinking"],
  ] as const)("prioritizes failures before graduation: %j", (stats, ending) => {
    const state = makeState(getMonthLimitByDegree("master"));
    const next = dispatchAction({ ...state, totalResearchScore: 10, player: { ...state.player, ...stats } }, "next-month");
    expect(next.ending).toBe(ending);
    expect(next.totalMonths).toBe(34);
  });

  it("applies spike protection centrally after advisor work and counts recovery once", () => {
    const state = makeState();
    state.player.san = 6;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    const next = dispatchAction(state, "advisor-project", { projectType: "horizontal" });
    expect(next.player.san).toBe(3);
    expect(next.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
    expect(next.shopState.chairSanRecovered).toBe(3);
    expect(next.phase).toBe("playing");
    expect(next.log.filter((entry) => entry.id.startsWith("chair-emergency-")).map((entry) => entry.text))
      .toEqual(["锥刺股椅触发：SAN +3（0→3）"]);
    const repeated = dispatchAction(next, "advisor-project", { projectType: "horizontal" });
    expect(repeated.shopState.chairSanRecovered).toBe(3);
    expect(repeated.log.filter((entry) => entry.id.startsWith("chair-emergency-"))).toHaveLength(1);
    const failed = resolveEvent({ ...next, eventQueue: [makeEvent("双重损失", { san: -20, money: -100 })] }, "双重损失");
    expect(failed.player.san).toBe(3);
    expect(failed.ending).toBe("poor");
    expect(failed.log.filter((entry) => entry.id.startsWith("chair-emergency-")).map((entry) => entry.text))
      .toEqual(["锥刺股椅触发：SAN +20（-17→3）", "锥刺股椅触发：SAN +3（0→3）"]);
    expect(failed.endingCause?.text).toBe("双重损失：事件结算");
  });

  it.each([0, -2])("logs actual spike-chair recovery once at SAN %s without consuming random rolls", (san) => {
    const state = makeState();
    state.player.san = san;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    const original = structuredClone(state);
    const random = vi.spyOn(Math, "random");
    const next = evaluateCoreEndings(state);
    expect(next.log[0]?.text).toBe(`锥刺股椅触发：SAN +${3 - san}（${san}→3）`);
    expect(next.shopState.chairSanRecovered).toBe(3 - san);
    expect(evaluateCoreEndings(next)).toBe(next);
    expect(state).toEqual(original);
    expect(random).not.toHaveBeenCalled();
  });

  it("logs spike-chair recovery only after the final event confirmation", () => {
    const state = makeState();
    state.player.san = 2;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    const result = makeEvent("chair-result", {}, { chainId: "chair-event" });
    state.eventQueue = [makeEvent("chair-decision", { san: -5, enqueueEvents: [result] }, { chainId: "chair-event", stage: "act2" })];
    const pending = resolveEvent(state, "chair-decision");
    expect(pending.player.san).toBe(2);
    expect(pending.log.some((entry) => entry.id.startsWith("chair-emergency-"))).toBe(false);
    const settled = resolveEvent(pending, "chair-result");
    expect(settled.player.san).toBe(3);
    expect(settled.log.filter((entry) => entry.id.startsWith("chair-emergency-")).map((entry) => entry.text))
      .toEqual(["锥刺股椅触发：SAN +6（-3→3）"]);
    expect(settled.log.findIndex((entry) => entry.id.startsWith("chair-emergency-")))
      .toBeLessThan(settled.log.findIndex((entry) => entry.text.startsWith("chair-decision：")));
  });

  it("does not trigger spike recovery or its log through debug stat adjustments", () => {
    const state = makeState();
    state.player.san = 2;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    const adjusted = dispatchAction(state, "debug-adjust-stat", { debugStatId: "san", delta: -2 });
    expect(adjusted.player.san).toBe(0);
    expect(adjusted.shopState.chairSanRecovered).toBe(0);
    expect(adjusted.log.some((entry) => entry.id.startsWith("chair-emergency-"))).toBe(false);
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

  it("preserves a negative research value through month-start settlement and freezes subsequent months", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(9);
    state.player.research = 0;
    state.buffs = [{ id: "research-loss", name: "科研损失", source: "测试", timing: "permanent", remainingMonths: null, monthlyStats: { research: -1 } }];
    const finished = dispatchAction(state, "next-month");
    expect(finished).toMatchObject({ phase: "finished", ending: "overthinking", player: { research: -1 } });
    expect(dispatchAction(finished, "next-month")).toEqual(finished);
  });

  it("applies research loss only after confirming the third act", () => {
    const state = makeState();
    state.player.research = 0;
    const result = makeEvent("research-result", {}, { chainId: "research-deferred" });
    state.eventQueue = [makeEvent("research-choice", { research: -1, enqueueEvents: [result] }, { chainId: "research-deferred", stage: "act2" })];
    const pending = resolveEvent(state, "research-choice");
    expect(pending).toMatchObject({ phase: "playing", ending: null, player: { research: 0 } });
    const finished = resolveEvent(pending, "research-result");
    expect(finished).toMatchObject({ phase: "finished", ending: "overthinking", player: { research: -1 } });
    expect(finished.endingCause?.text).toContain("research-choice");
  });

  it("honors monthly spike protection before other failures without double counting recovery", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(9);
    state.player.san = 1;
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };
    state.buffs = [{ id: "monthly-loss", name: "月度压力", source: "测试", timing: "permanent", remainingMonths: null, monthlyStats: { san: -4 } }];
    const survived = dispatchAction(state, "next-month");
    expect(survived).toMatchObject({ phase: "playing", player: { san: 3 }, shopState: { chairSanRecovered: 5 } });
    expect(survived.log.filter((entry) => entry.text.includes("锥刺股椅"))).toHaveLength(1);
    expect(survived.log.find((entry) => entry.text.includes("锥刺股椅"))?.text).toContain("锥刺股椅 SAN +5");
    const failed = dispatchAction({ ...state, buffs: [{ ...state.buffs[0]!, monthlyStats: { san: -4, money: -100 } }] }, "next-month");
    expect(failed).toMatchObject({ phase: "finished", ending: "poor", player: { san: 3 }, shopState: { chairSanRecovered: 5 } });
    expect(failed.log.filter((entry) => entry.text.includes("锥刺股椅"))).toHaveLength(1);
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

describe.each(["master", "phd"] as const)("%s graduation settlement", (degree) => {
  const limit = degree === "master" ? 34 : 70;

  it.each(["next-month", "force-next-month"] as const)("keeps final June playable until %s is pressed again", (actionId) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(limit - 1, degree);
    state.totalResearchScore = state.graduationScoreTarget!;
    state.player.san = 10;
    const advanced = dispatchAction(state, actionId);
    const ready = resolveDueEvents(advanced);
    expect(ready.eventQueue).toHaveLength(0);
    expect(advanced).toMatchObject({ phase: "playing", ending: null, totalMonths: limit, year: degree === "master" ? 3 : 6, month: 10 });
    const rested = dispatchAction(ready, "rest");
    expect(rested).toMatchObject({ phase: "playing", ending: null, totalMonths: limit });
    expect(rested.player.san).toBeGreaterThan(advanced.player.san);
    expect(rested.actionState.used).toBe(advanced.actionState.used + 1);
    const finished = dispatchAction(rested, actionId);
    expect(finished).toMatchObject({ phase: "finished", ending: degree, totalMonths: limit });
    expect(finished.player).toEqual(rested.player);
    expect(finished.actionState).toEqual(rested.actionState);
  });

  it("checks the degree-specific limit and current target", () => {
    const state = makeState(limit, degree);
    expect(state.maxMonths).toBe(limit);
    expect(state.graduationScoreTarget).toBe(degree === "master" ? 1 : 7);
    for (const offset of [-1, 0, 1]) {
      const finished = dispatchAction({ ...state, totalResearchScore: state.graduationScoreTarget! + offset }, "next-month");
      expect(finished.ending).toBe(offset < 0 ? "delay" : degree);
      expect(finished.totalMonths).toBe(limit);
      expect(dispatchAction(finished, "next-month")).toBe(finished);
    }
  });

  it("allows paper research in final June before settling a delayed graduation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(limit, degree);
    const paper = createDraftPaper(1, 0, () => 0);
    state.papers = [paper];
    const researched = dispatchAction(state, "research-paper", { paperId: paper.id, paperActionType: "idea" });
    expect(researched).toMatchObject({ phase: "playing", ending: null, totalMonths: limit });
    expect(researched.papers[0]!.idea).toBeGreaterThan(paper.idea);
    expect(researched.actionState.used).toBe(state.actionState.used + 1);
    expect(dispatchAction(researched, "force-next-month")).toMatchObject({ phase: "finished", ending: "delay", totalMonths: limit });
  });

  it("settles final June without adding a month or ending before due choices", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(limit - 1, degree);
    state.eventQueue = [makeEvent("last-choice", { score: state.graduationScoreTarget! }, { deadlineMonths: 1 })];
    const advanced = dispatchAction(state, "next-month");
    expect(advanced).toMatchObject({ phase: "playing", totalMonths: limit });
    expect(advanced.eventQueue.find((event) => event.id === "last-choice")?.deadlineMonths).toBe(0);
    let current = advanced;
    for (let count = 0; count < 30 && current.phase === "playing" && current.eventQueue.some((event) => event.deadlineMonths <= 0); count += 1) {
      const event = current.eventQueue.find((entry) => entry.deadlineMonths <= 0)!;
      current = dispatchAction(current, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    expect(current).toMatchObject({ phase: "playing", ending: null, totalMonths: limit });
    expect(current.eventQueue.some((event) => event.deadlineMonths <= 0)).toBe(false);
    expect(dispatchAction(current, "next-month")).toMatchObject({ phase: "finished", ending: degree, totalMonths: limit });
  });

  it.each(["next-month", "force-next-month"] as const)("%s waits for due nonblocking results but ignores unreachable future events", (actionId) => {
    const state = makeState(limit, degree);
    state.eventQueue = [makeEvent("due-result", { score: state.graduationScoreTarget! }, { blocking: false }), makeEvent("future", { money: -100 }, { deadlineMonths: 1 })];
    const blocked = dispatchAction(state, actionId);
    expect(blocked).toMatchObject({ phase: "playing", ending: null, totalMonths: limit });
    const resolved = resolveEvent(blocked, "due-result");
    expect(resolved).toMatchObject({ phase: "playing", ending: null, totalMonths: limit, totalResearchScore: state.graduationScoreTarget! });
    const finished = dispatchAction(resolved, actionId);
    expect(finished).toMatchObject({ phase: "finished", ending: degree, totalMonths: limit });
    expect(finished.player.money).toBe(20);
    expect(finished.eventQueue.map((event) => event.id)).toEqual(["future"]);
    expect(dispatchAction({ ...state, blockLinearEvents: false, eventQueue: [makeEvent("future", {}, { deadlineMonths: 1 })] }, "next-month").ending).toBe("delay");
  });

  it.each(["lover", "fellow"] as const)("credits %s journal help on both final-event and final-month routes", (helper) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = withPendingJournalHelp(makeState(limit, degree), helper);
    state.totalResearchScore = Math.max(0, state.graduationScoreTarget! - 5);
    for (const route of ["event", "month"] as const) {
      let current = state;
      if (route === "event") {
        current = resolveEvent({ ...state, eventQueue: [makeEvent("last-result")] }, "last-result");
        expect(current).toMatchObject({ phase: "playing", ending: null, totalMonths: limit, totalResearchScore: Math.max(5, state.graduationScoreTarget!) });
        expect(current.externalPublications).toHaveLength(1);
        if (helper === "fellow") expect(current.fellowProgressState[0]?.pendingHelpToPlayer).toBeNull();
      }
      for (const actionId of ["next-month", "force-next-month"] as const) {
        const awaitingPayment = dispatchAction(current, actionId);
        expect(awaitingPayment.phase).toBe("playing");
        expect(awaitingPayment.eventQueue.some((event) => event.journalFeePreview)).toBe(true);
        expect(awaitingPayment.advisorProgressState.paidJournalPaperIds ?? []).not.toContain(state.papers[0]!.id);
        const next = dispatchAction(resolveDueEvents(awaitingPayment), actionId);
        expect(next.advisorProgressState.paidJournalPaperIds).toContain(state.papers[0]!.id);
        expect(next).toMatchObject({ phase: "finished", ending: degree, totalMonths: limit, totalResearchScore: Math.max(5, state.graduationScoreTarget!) });
        expect(next.externalPublications).toHaveLength(1);
        expect(next.externalPublications[0]).toMatchObject({ id: state.papers[0]!.id, status: "published", journalTarget: "pami" });
        expect(next.papers).toHaveLength(0);
        if (helper === "lover") expect(next.loverProgressState.pendingPaperHelp).toBeNull();
        else expect(next.fellowProgressState).toHaveLength(0);
        expect(dispatchAction(next, actionId)).toBe(next);
      }
    }
  });

  it("waits for month-end after action-triggered journal publication", () => {
    const state = withPendingJournalHelp(makeState(limit, degree), "lover");
    const next = dispatchAction({ ...state, totalResearchScore: Math.max(0, state.graduationScoreTarget! - 5) }, "select-paper", { paperId: state.papers[0]!.id });
    expect(next).toMatchObject({ phase: "playing", ending: null, totalMonths: limit, totalResearchScore: Math.max(5, state.graduationScoreTarget!) });
    expect(next.externalPublications).toHaveLength(1);
    expect(next.advisorProgressState.paidJournalPaperIds ?? []).not.toContain(state.papers[0]!.id);
    const paid = resolveDueEvents(next);
    expect(paid.advisorProgressState.paidJournalPaperIds).toContain(state.papers[0]!.id);
    expect(dispatchAction(paid, "next-month")).toMatchObject({ phase: "finished", ending: degree, totalMonths: limit, totalResearchScore: Math.max(5, state.graduationScoreTarget!) });
  });

  it.each([
    ["san", "burnout"], ["money", "poor"], ["favor", "expelled"], ["social", "isolated"], ["research", "overthinking"],
  ] as const)("still ends immediately when a final-June event drops %s below zero", (stat, ending) => {
    const state = makeState(limit, degree);
    state.totalResearchScore = 10;
    state.player[stat] = 0;
    state.eventQueue = [makeEvent("fatal", { [stat]: -1 })];
    expect(resolveEvent(state, "fatal")).toMatchObject({ phase: "finished", ending, totalMonths: limit, player: { [stat]: -1 } });
  });

  it("still checks failures before an ordinary final-June action", () => {
    const state = makeState(limit, degree);
    state.totalResearchScore = 10;
    state.player.san = -1;
    expect(dispatchAction(state, "rest")).toMatchObject({ phase: "finished", ending: "burnout", totalMonths: limit, player: { san: -1 } });
  });

  it("settles due automatic events before checking graduation at month-end", () => {
    const state = makeState(limit, degree);
    state.blockLinearEvents = false;
    state.eventQueue = [makeEvent("automatic-result", { score: state.graduationScoreTarget! })];
    const finished = dispatchAction(state, "next-month");
    expect(finished).toMatchObject({ phase: "finished", ending: degree, totalMonths: limit, totalResearchScore: state.graduationScoreTarget! });
    expect(finished.eventQueue).toHaveLength(0);
  });

  it("does not award graduation with an undetermined target", () => {
    expect(dispatchAction({ ...makeState(limit, degree), graduationScoreTarget: null, totalResearchScore: 100 }, "next-month").ending).toBe("delay");
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
    const state = makeState(getMonthLimitByDegree("master"));
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
