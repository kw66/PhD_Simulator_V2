import { describe, expect, it, vi } from "vitest";
import { ADVISOR_GRANTS, getAdvisorGrantResultContext, getAdvisorGrantSuccessChance, getAdvisorMonthlySalary, settleAdvisorGrantResult, settleAdvisorMonth } from "../src/core/v2-advisor-progress";
import { createAdvisorGrantResultEvent } from "../src/core/v2-advisor-grant-events";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { enqueueEventQueueItem } from "../src/core/v2-event-queue";
import { settleLinearEvents } from "../src/core/v2-event-auto-resolution";
import { resolveMonthlyEffects } from "../src/core/v2-monthly-effects";
import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import { renderApp } from "../src/app/v2-render";
import type { AdvisorGrantApplication, GameState } from "../src/core/v2-types";

function playing(month = 12): GameState {
  const initial = createInitialState();
  return {
    ...initial, phase: "playing", month, year: 1, totalMonths: month, selectedAdvisorName: "林老师",
    player: { ...initial.player, san: 20, money: 100, research: 10, social: 10, favor: 10 },
    relationshipState: { ...initial.relationshipState, advisorCount: 1 },
    eventQueue: [], availableRandomEvents: [],
  };
}

function queued(snapshot = 25): GameState {
  const state = playing();
  const application: AdvisorGrantApplication = { id: "youth", calendarYear: 2024, researchSnapshot: snapshot, resultRoll: 0.99 };
  state.advisorProgressState.pendingApplication = application;
  return enqueueEventQueueItem(state, createAdvisorGrantResultEvent(getAdvisorGrantResultContext(state, application)));
}

function nextScene(state: GameState): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId?.startsWith("advisor-grant-"))!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
}

describe("advisor grant result events", () => {
  it.each(ADVISOR_GRANTS)("scales %s funding odds from zero at 80 percent to certain at 100 percent", (grant) => {
    for (const [ratio, chance] of [[0, 0], [0.79, 0], [0.8, 0], [0.9, 0.5], [1, 1], [1.5, 1]]) {
      expect(getAdvisorGrantSuccessChance(grant.threshold * ratio!, grant)).toBeCloseTo(chance!);
    }
  });

  it.each([[19, 0, false], [20, 0, false], [22.5, 0.499, true], [22.5, 0.5, false], [25, 0.999, true]] as const)(
    "submits accumulation %i and preserves roll %f through the result (success %s)",
    (accumulation, roll, success) => {
      const initial = playing(7);
      initial.advisorProgressState.researchAccumulation = accumulation;
      const random = vi.fn(() => roll);
      const march = settleAdvisorMonth(initial, random);
      expect(random).toHaveBeenCalledTimes(1);
      expect(march.advisorProgressState.pendingApplication).toEqual({
        id: "youth", calendarYear: 2024, researchSnapshot: accumulation, resultRoll: roll,
      });
      expect(settleAdvisorMonth(march, random)).toBe(march);
      expect(random).toHaveBeenCalledTimes(1);
      const restored = JSON.parse(JSON.stringify(march)) as GameState;
      restored.advisorProgressState.researchAccumulation = 1000;
      const noRoll = () => { throw new Error("Grant result must not reroll"); };
      const august = settleAdvisorMonth({ ...restored, month: 12, totalMonths: 12 }, noRoll);
      const application = august.advisorProgressState.pendingApplication!;
      expect(getAdvisorGrantResultContext(august, application).success).toBe(success);
      const third = nextScene(nextScene(august));
      expect(third.advisorProgressState.awards).toHaveLength(0);
      const final = nextScene(third);
      expect(final.advisorProgressState.awards).toHaveLength(success ? 1 : 0);
      expect(final.advisorProgressState.funding).toBe(success ? 20 : 10);
      expect(final.advisorProgressState.pendingApplication).toBeNull();
      if (!success) {
        const retry = settleAdvisorMonth({ ...final, year: 2, month: 7, totalMonths: 19,
          advisorProgressState: { ...final.advisorProgressState, researchAccumulation: 25 },
        }, () => 0.99);
        expect(retry.advisorProgressState.pendingApplication?.id).toBe("youth");
        expect(getAdvisorGrantResultContext(retry, retry.advisorProgressState.pendingApplication!).success).toBe(true);
      }
    },
  );

  it("queues only an actual March application in August and does not settle twice", () => {
    const initial = playing(7);
    initial.advisorProgressState.researchAccumulation = 25;
    const march = settleAdvisorMonth(initial, () => 0);
    expect(march.advisorProgressState.pendingApplication?.id).toBe("youth");
    expect(march.eventQueue).toHaveLength(0);
    const july = settleAdvisorMonth({ ...march, month: 11, totalMonths: 11 }, () => 0);
    expect(july.eventQueue).toHaveLength(0);
    const august = settleAdvisorMonth({ ...july, month: 12, totalMonths: 12 }, () => 0);
    expect(august.advisorProgressState.awards).toHaveLength(0);
    expect(august.advisorProgressState.funding).toBe(initial.advisorProgressState.funding);
    expect(august.eventQueue).toHaveLength(1);
    expect(august.eventQueue[0]).toMatchObject({ title: "基金结果", stage: "act1", deadlineMonths: 0 });
    expect(settleAdvisorMonth(august)).toBe(august);
    expect(settleAdvisorMonth(playing()).eventQueue).toHaveLength(0);
  });

  it("commits funding and promotion only on the final scene and records a separate salary talent", () => {
    const initial = queued();
    const second = nextScene(initial);
    const third = nextScene(second);
    expect(second.eventQueue[0]?.stage).toBe("act2");
    expect(third.eventQueue[0]?.stage).toBe("result");
    expect(third.advisorProgressState).toEqual(initial.advisorProgressState);
    expect(third.player).toEqual(initial.player);
    const pendingResult = third.eventQueue[0]!;
    const beforeFinish = { ...third, advisorProgressState: { ...third.advisorProgressState, funding: 7, horizontalProgress: 42 } };
    const final = nextScene(beforeFinish);
    expect(final.advisorProgressState).toMatchObject({ funding: 17, horizontalProgress: 42, pendingApplication: null });
    expect(final.player.money).toBe(initial.player.money);
    expect(getAdvisorMonthlySalary(final.advisorProgressState, "master")).toBe(1.25);
    expect(final.eventHistory.find((entry) => entry.chainId === "advisor-grant-2024-youth")?.stages).toHaveLength(3);
    expect(final.eventHistory.filter((entry) => entry.id === "talent:advisor-salary:youth:2024")).toHaveLength(1);
    expect(final.log.some((entry) => entry.text.includes("青基获批") && entry.eventHistoryId)).toBe(true);
    const repeated = dispatchAction(final, "resolve-event", { eventId: pendingResult.id, eventChoiceId: pendingResult.choices[0]!.id });
    expect(repeated.advisorProgressState.funding).toBe(17);
    expect(settleAdvisorGrantResult(final, initial.advisorProgressState.pendingApplication!)).toBe(final);
  });

  it("uses the application snapshot and hears unsuccessful results from fellow students", () => {
    let state = queued(24);
    state.advisorProgressState.researchAccumulation = 400;
    state = nextScene(nextScene(state));
    expect(state.eventQueue[0]?.description).toContain("听组里的同学说起");
    expect(state.eventQueue[0]?.description).toContain("未获批（20%）\n结果：无事发生");
    const final = nextScene(state);
    expect(final.advisorProgressState).toMatchObject({ funding: 10, awards: [], pendingApplication: null });
    expect(final.eventHistory.some((entry) => entry.id.startsWith("talent:advisor-salary"))).toBe(false);
  });

  it("ignores stale results for another application", () => {
    const state = queued();
    const application = state.advisorProgressState.pendingApplication!;
    const other = { ...state, advisorProgressState: { ...state.advisorProgressState, pendingApplication: { ...application, calendarYear: 2025 } } };
    expect(settleAdvisorGrantResult(other, application)).toBe(other);
  });

  it("recovers an overdue result after a forced debug month and allows later applications", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const august = queued();
      const september = dispatchAction(august, "force-next-month");
      expect(september.totalMonths).toBe(13);
      expect(september.eventQueue.filter((event) => event.chainId === "advisor-grant-2024-youth")).toHaveLength(1);
      const nextMarch = settleAdvisorMonth({ ...september, year: 2, month: 7, totalMonths: 19, eventQueue: [],
        advisorProgressState: { ...september.advisorProgressState, researchAccumulation: 400 },
      });
      expect(nextMarch.eventQueue.filter((event) => event.chainId === "advisor-grant-2024-youth")).toHaveLength(1);
      const recovered = nextScene(nextScene(nextScene(nextMarch)));
      expect(recovered.advisorProgressState.pendingApplication).toBeNull();
      const laterMarch = settleAdvisorMonth({ ...recovered, year: 3, month: 7, totalMonths: 31 });
      expect(laterMarch.advisorProgressState.pendingApplication).toMatchObject({ id: "distinguished", calendarYear: 2026 });
      expect(laterMarch.advisorProgressState.awards.filter((award) => award.id === "youth")).toHaveLength(1);
    } finally {
      random.mockRestore();
    }
  });

  it.each(ADVISOR_GRANTS)("grants %s once with correct funding and no immediate player cash", (grant) => {
    const state = playing();
    if (grant.id === "academician") state.advisorProgressState.awards = [{ id: "distinguished", awardedYear: 2023, startYear: 2024, endYear: 2028 }];
    const application = { id: grant.id, calendarYear: 2024, researchSnapshot: grant.threshold, resultRoll: 0.99 };
    state.advisorProgressState.pendingApplication = application;
    const event = createAdvisorGrantResultEvent(getAdvisorGrantResultContext(state, application));
    const final = nextScene(nextScene(nextScene(enqueueEventQueueItem(state, event))));
    expect(final.advisorProgressState.funding).toBe(10 + grant.funding);
    expect(final.advisorProgressState.awards.at(-1)).toMatchObject({ id: grant.id, awardedYear: 2024 });
    expect(final.player.money).toBe(state.player.money);
    if (grant.id === "academician") {
      expect(event.title).toBe("导师增选结果");
      expect(event.description).not.toContain("基金");
    }
  });

  it("matches manual completion in nonblocking mode with a reviewable three-scene history", () => {
    const initial = queued();
    const manual = nextScene(nextScene(nextScene(initial)));
    const automatic = settleLinearEvents({ ...initial, blockLinearEvents: false }, (state, eventId, eventChoiceId) => dispatchAction(state, "resolve-event", { eventId, eventChoiceId }));
    expect(automatic.advisorProgressState).toEqual(manual.advisorProgressState);
    expect(automatic.player).toEqual(manual.player);
    expect(automatic.eventHistory).toEqual(manual.eventHistory);
    expect(automatic.eventQueue).toHaveLength(0);
  });

  it("uses the old salary in August and the promoted salary from September", () => {
    const state = playing(11);
    state.advisorProgressState.pendingApplication = { id: "youth", calendarYear: 2024, researchSnapshot: 25, resultRoll: 0.99 };
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const august = dispatchAction(state, "next-month");
      expect(august.totalMonths).toBe(12);
      expect(august.player.money).toBe(101);
      expect(august.advisorProgressState.awards).toHaveLength(0);
      const completed = nextScene(nextScene(nextScene(august)));
      const september = dispatchAction({ ...completed, eventQueue: [] }, "next-month");
      expect(september.advisorProgressState.salaryRemainder).toBe(0.25);
      expect(resolveMonthlyEffects(september).items.find((entry) => entry.id === "advisor-salary")?.stats.money).toBe(1);
    } finally {
      random.mockRestore();
    }
  });

  it.each(["success", "failure"])("exposes the %s debug event without a debug log", (outcome) => {
    const id = `advisor-grant-${outcome}`;
    expect(DEBUG_EVENT_GROUPS.flatMap((group) => group.buttons).some((button) => button.id === id)).toBe(true);
    const initial = playing();
    const triggered = dispatchAction(initial, "debug-trigger-event", { eventId: id });
    expect(triggered.log).toEqual(initial.log);
    expect(triggered.eventQueue[0]?.stage).toBe("act1");
    const final = nextScene(nextScene(nextScene(triggered)));
    expect(final.advisorProgressState.funding).toBe(outcome === "success" ? 20 : 10);
  });

  it("switches debug outcomes within the same event without leaving a stale pending result", () => {
    let state = dispatchAction(playing(), "debug-trigger-event", { eventId: "advisor-grant-success" });
    state = nextScene(state);
    state = dispatchAction(state, "debug-trigger-event", { eventId: "advisor-grant-failure" });
    expect(state.eventQueue.filter((event) => event.chainId?.startsWith("advisor-grant-"))).toHaveLength(1);
    expect(state.eventQueue[0]).toMatchObject({ title: "基金结果", stage: "act1" });
    const failed = nextScene(nextScene(nextScene(state)));
    expect(failed.advisorProgressState.funding).toBe(10);
    const retried = dispatchAction(failed, "debug-trigger-event", { eventId: "advisor-grant-success" });
    const accepted = nextScene(nextScene(nextScene(retried)));
    expect(accepted.advisorProgressState.funding).toBe(20);
  });

  it("previews the August result and shows it as announced when waiting for confirmation", () => {
    const state = playing(10);
    state.advisorProgressState.pendingApplication = { id: "youth", calendarYear: 2024, researchSnapshot: 25, resultRoll: 0.99 };
    expect(buildFutureTodoPreviewItems(state)).toContainEqual(expect.objectContaining({ title: "基金结果", monthsLater: 2 }));
    const august = settleAdvisorMonth({ ...state, totalMonths: 12, month: 12 });
    const html = renderApp(august, undefined, { activePlayTab: "relationship" });
    expect(html).toContain("青基结果已公布");
    expect(html).not.toContain("青基申请·12月后公布");
    expect(buildFutureTodoPreviewItems(nextScene(nextScene(nextScene(august))))).not.toContainEqual(expect.objectContaining({ title: "基金结果" }));
  });
});
