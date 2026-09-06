import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { getBadmintonStrength, getPokerWinRate } from "../src/core/v2-growth-system";
import type { GameState, PendingEvent } from "../src/core/v2-types";

const RANDOM_EVENT_IDS = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

function createReplayReadyState(): GameState {
  const started = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  const draft = {
    ...createDraftPaper(6, 0),
    idea: 4,
    experiment: 4,
    writing: 4,
  };

  return {
    ...started,
    eventQueue: [],
    log: [],
    selectedAdvisorName: "测试导师",
    availableRandomEvents: [],
    usedRandomEvents: [],
    illnessProbability: 0,
    year: 1,
    month: 6,
    totalMonths: 6,
    totalRandomEventCount: 7,
    player: {
      ...started.player,
      money: 20,
      san: 20,
      research: 8,
      social: 8,
      favor: 8,
    },
    papers: [draft],
    selectedPaperId: draft.id,
  };
}

function buildReplayEvent(eventId: number, state: GameState): PendingEvent {
  const rolls: number[] = [];
  const built = createRandomEventById(eventId, state, () => {
    rolls.push(0.25);
    return 0.25;
  });
  if (!built.event) throw new Error(`random event ${eventId} could not be created`);

  return {
    ...built.event,
    randomReplay: {
      eventId,
      serial: state.totalRandomEventCount,
      rolls,
    },
  };
}

function hasInvalidChoiceLog(state: GameState): boolean {
  return state.log.some((entry) => entry.text.includes("当前事件选择无效"));
}

describe("random event replay", () => {
  it("normalizes badminton strength inputs without capping strength", () => {
    expect(getBadmintonStrength(-2, 0, false)).toBe(0);
    expect(getBadmintonStrength(20, -2, false)).toBe(60);
    expect(getBadmintonStrength(20, 1.9, false)).toBe(80);
    expect(getBadmintonStrength(20, 0, true)).toBe(100);
    expect(getBadmintonStrength(18, 4, true)).toBe(166);
  });

  it("normalizes poker participation counts and caps the win rate at 100%", () => {
    expect(getPokerWinRate(-1)).toBe(40);
    expect(getPokerWinRate(0)).toBe(40);
    expect(getPokerWinRate(3.8)).toBe(70);
    expect(getPokerWinRate(5)).toBe(90);
    expect(getPokerWinRate(6)).toBe(100);
    expect(getPokerWinRate(7)).toBe(100);
    expect(getPokerWinRate(99)).toBe(100);
  });

  it.each([
    { participations: 5, roll: 0.899, winRate: 90, money: 5 },
    { participations: 5, roll: 0.9, winRate: 90, money: -5 },
    { participations: 6, roll: 0.999, winRate: 100, money: 5 },
    { participations: 99, roll: 0.999, winRate: 100, money: 5 },
  ])("preserves poker effects at $participations participations with roll $roll", ({ participations, roll, winRate, money }) => {
    const state = createReplayReadyState();
    state.eventCounters = { ...state.eventCounters, pokerCount: participations };
    const event = createRandomEventById(7, state, () => roll).event;
    const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
    const poker = choiceEvent?.choices.find((choice) => choice.label === "打德州扑克");

    expect(poker?.outcome).toContain(`${money > 0 ? "获胜" : "落败"}（胜率 ${winRate}%）`);
    expect(poker?.effects.money).toBe(money);
    expect(poker?.effects.counterDeltas).toEqual({ pokerCount: 1, pokerProfit: money });
  });

  it("uses SAN-based badminton strength and poker win rate", () => {
    const state = createReplayReadyState();
    state.player = { ...state.player, san: 20 };
    state.eventCounters = { ...state.eventCounters, badmintonCount: 0, pokerCount: 0 };
    const event = createRandomEventById(7, state, () => 0.5).event;
    const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
    const badminton = choiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"));
    const poker = choiceEvent?.choices.find((choice) => choice.label === "打德州扑克");

    expect(badminton?.outcome).toContain("实力 60/100");
    expect(poker?.outcome).toContain("胜率 40%");
  });

  it("shows the probability beside every audited conditional result", () => {
    const state = createReplayReadyState();
    const getChoices = (eventId: number, roll = 0.5) => createRandomEventById(eventId, state, () => roll)
      .event?.choices[0]?.effects.enqueueEvents?.[0]?.choices ?? [];

    expect(getChoices(6).every((choice) => choice.outcome.includes("导师缺席（50%）"))).toBe(true);
    expect(getChoices(7, 0.4).find((choice) => choice.label === "聚餐")?.outcome).toContain("AA 聚餐（50%）");
    expect(getChoices(10).find((choice) => choice.label === "互挂论文")?.outcome).toContain("互挂未成（50%）");
    expect(getChoices(13).find((choice) => choice.label === "自己重装")?.outcome).toContain("重装失败（50%）");
    expect(getChoices(13).find((choice) => choice.label === "淘宝找人")?.outcome).toContain("维修翻车（50%）");
    expect(getChoices(1).find((choice) => choice.label === "亲自指导")?.outcome).toContain("对方毕业离组（50%）");
  });

  it("adds SAN multiplier and racket bonuses to badminton strength", () => {
    const cases = [5, 6, 12, 18] as const;

    for (const san of cases) {
      const state = createReplayReadyState();
      state.player = { ...state.player, san };
      state.eventCounters = { ...state.eventCounters, badmintonCount: 0 };
      const event = createRandomEventById(7, state, () => 0.99).event;
      const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
      expect(choiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"))?.outcome)
        .toContain(`实力 ${san * 3}/100`);
    }

    const experienced = createReplayReadyState();
    experienced.player = { ...experienced.player, san: 20 };
    experienced.eventCounters = { ...experienced.eventCounters, badmintonCount: 2 };
    const experiencedEvent = createRandomEventById(7, experienced, () => 0.99).event;
    const experiencedChoiceEvent = experiencedEvent?.choices[0]?.effects.enqueueEvents?.[0];
    expect(experiencedChoiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"))?.outcome)
      .toContain("实力 100/100");

    const boosted = createReplayReadyState();
    boosted.player = { ...boosted.player, san: 18 };
    boosted.eventCounters = { ...boosted.eventCounters, badmintonCount: 4 };
    boosted.eventSupport = { ...boosted.eventSupport, hasBadmintonRacket: true };
    const boostedEvent = createRandomEventById(7, boosted, () => 0.99).event;
    const boostedChoiceEvent = boostedEvent?.choices[0]?.effects.enqueueEvents?.[0];
    expect(boostedChoiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"))?.outcome)
      .toContain("实力 166/100");
  });

  it.each([
    { san: 33, participations: 0, strength: 99, wins: false },
    { san: 20, participations: 2, strength: 100, wins: true },
    { san: 34, participations: 0, strength: 102, wins: true },
  ])("preserves badminton effects at strength $strength regardless of random roll", ({ san, participations, strength, wins }) => {
    for (const roll of [0, 0.999]) {
      const state = createReplayReadyState();
      state.player = { ...state.player, san };
      state.eventCounters = { ...state.eventCounters, badmintonCount: participations };
      const event = createRandomEventById(7, state, () => roll).event;
      const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
      const badminton = choiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"));

      expect(badminton?.outcome).toContain(`${wins ? "获胜" : "落败"}（实力 ${strength}/100）`);
      expect(badminton?.outcome.includes("解锁每月 SAN +1")).toBe(wins);
      expect(badminton?.effects.illnessProbabilityDelta).toBe(-10);
      expect(badminton?.effects.counterDeltas).toEqual({ badmintonCount: 1 });
      expect(badminton?.effects.eventSupportUpdates).toEqual(wins ? { hasStrongBodyTalent: true } : {});
    }
  });

  it("unlocks monthly SAN recovery on the first badminton win", () => {
    const state = createReplayReadyState();
    state.player = { ...state.player, san: 20 };
    state.eventCounters = { ...state.eventCounters, badmintonCount: 0 };
    state.eventSupport = { ...state.eventSupport, hasBadmintonRacket: true };
    const event = createRandomEventById(7, state, () => 0).event;
    const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
    const badminton = choiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"));

    expect(badminton?.outcome).toContain("获胜（实力 100/100）");
    expect(badminton?.outcome).toContain("解锁每月 SAN +1");
    expect(badminton?.effects.eventSupportUpdates).toEqual({ hasStrongBodyTalent: true });
  });

  it("does not unlock or announce monthly SAN recovery again after a badminton win", () => {
    const state = createReplayReadyState();
    state.player = { ...state.player, san: 20 };
    state.eventCounters = { ...state.eventCounters, badmintonCount: 2 };
    state.eventSupport = { ...state.eventSupport, hasStrongBodyTalent: true };
    const event = createRandomEventById(7, state, () => 0.999).event;
    const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
    const badminton = choiceEvent?.choices.find((choice) => choice.id.includes("-badminton-"));

    expect(badminton?.outcome).toContain("获胜（实力 100/100）");
    expect(badminton?.outcome).not.toContain("解锁每月 SAN +1");
    expect(badminton?.effects.illnessProbabilityDelta).toBe(-10);
    expect(badminton?.effects.counterDeltas).toEqual({ badmintonCount: 1 });
    expect(badminton?.effects.eventSupportUpdates).toEqual({});
  });

  it("applies the research-chore discount to long-term senior mentorship", () => {
    const state = createReplayReadyState();
    const event = createRandomEventById(11, state, () => 0.5).event;
    const choiceEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
    const mentorship = choiceEvent?.choices.find((choice) => choice.label === "拜入门下");

    expect(mentorship?.outcome).toContain("SAN -3（减免1）");
    expect(mentorship?.outcome).not.toContain("任务量");
    expect(mentorship?.outcome).not.toContain("科研达到");
    expect(mentorship?.outcome).not.toContain("最终 SAN");
    expect(mentorship?.effects.san).toBe(-3);
  });

  it("applies research-chore discounts to the confirmed research-related event work", () => {
    const state = createReplayReadyState();
    state.player = { ...state.player, research: 18, favor: 18 };
    const getChoices = (eventId: number) => createRandomEventById(eventId, state, () => 0.5)
      .event?.choices[0]?.effects.enqueueEvents?.[0]?.choices ?? [];

    expect(getChoices(5).find((choice) => choice.label === "提出远程实习")?.effects.san).toBe(-2);
    expect(getChoices(10).find((choice) => choice.label === "全面合作")?.effects.san).toBe(0);
    expect(getChoices(11).find((choice) => choice.label === "深入合作")?.effects.san).toBe(0);
    expect(getChoices(11).find((choice) => choice.label === "拜入门下")?.effects.san).toBe(-1);
    expect(getChoices(14).find((choice) => choice.label === "短期合作，分享idea")?.effects.san).toBe(-2);
    expect(getChoices(16).find((choice) => choice.label === "熬夜补数据")?.effects.san).toBe(-3);
  });

  it("recalculates a deferred research chore using the handling month's season", () => {
    const base = createReplayReadyState();
    base.year = 1;
    base.month = 9;
    base.totalMonths = 9;
    base.player = { ...base.player, research: 18 };
    const event = buildReplayEvent(4, base);
    const originalDecision = event.choices[0]?.effects.enqueueEvents?.[0];
    expect(originalDecision?.choices.find((choice) => choice.label === "让师弟师妹分担")?.effects.san).toBe(0);

    const queuedState: GameState = {
      ...base,
      eventQueue: [createEventQueueItem(event, 1)],
    };
    const delayedState = dispatchAction(queuedState, "next-month");
    expect(delayedState.month).toBe(10);
    const handlingState = {
      ...delayedState,
      player: { ...delayedState.player, research: 12 },
    };
    const afterIntro = dispatchAction(handlingState, "resolve-event", {
      eventId: event.id,
      eventChoiceId: event.choices[0]?.id,
    });
    const currentDecision = afterIntro.eventQueue.find((item) => item.chainId === event.chainId && item.stage === "act2");

    expect(currentDecision?.choices.find((choice) => choice.label === "让师弟师妹分担")?.effects.san).toBe(-1);
    expect(currentDecision?.choices.find((choice) => choice.label === "让师弟师妹分担")?.outcome)
      .toContain("SAN -1（减免2）");
  });

  it.each(RANDOM_EVENT_IDS)("keeps every choice valid when random event %i is handled in a later month", (eventId) => {
    const base = createReplayReadyState();
    const event = buildReplayEvent(eventId, base);
    const introChoice = event.choices[0];
    if (!introChoice) throw new Error(`random event ${eventId} has no opening choice`);

    const queuedState: GameState = {
      ...base,
      eventQueue: [createEventQueueItem(event, 1)],
    };
    const delayedState = dispatchAction(queuedState, "next-month");
    expect(delayedState.eventQueue.find((item) => item.chainId === event.chainId)?.deadlineMonths).toBe(0);
    const afterIntro = dispatchAction(delayedState, "resolve-event", {
      eventId: event.id,
      eventChoiceId: introChoice.id,
    });

    expect(hasInvalidChoiceLog(afterIntro)).toBe(false);
    const decision = afterIntro.eventQueue.find((item) => item.chainId === event.chainId && item.stage === "act2");
    expect(decision, `random event ${eventId} did not open its choice scene`).toBeDefined();
    if (!decision) return;

    for (const choice of decision.choices) {
      if (choice.disabledReason) continue;
      const choiceState = structuredClone(afterIntro);
      choiceState.log = [];
      const afterChoice = dispatchAction(choiceState, "resolve-event", {
        eventId: decision.id,
        eventChoiceId: choice.id,
      });

      expect(hasInvalidChoiceLog(afterChoice), `random event ${eventId}, choice ${choice.id}`).toBe(false);
      expect(afterChoice.eventQueue.some((item) => item.id === decision.id)).toBe(false);
      const result = afterChoice.eventQueue.find((item) => item.chainId === event.chainId && item.stage === "result");
      expect(result, `random event ${eventId}, choice ${choice.id} did not open its result`).toBeDefined();
      const confirmChoice = result?.choices[0];
      if (!result || !confirmChoice) continue;

      const completed = dispatchAction(afterChoice, "resolve-event", {
        eventId: result.id,
        eventChoiceId: confirmChoice.id,
      });
      expect(hasInvalidChoiceLog(completed), `random event ${eventId}, result ${result.id}`).toBe(false);
      expect(completed.eventQueue.some((item) => item.id === result.id)).toBe(false);
    }
  });
});
