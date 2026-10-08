import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import {
  activateLoverMonthlyDiscount, advanceLoverDate, advanceLoverMonth, createLoverProgressState, getLoverDateFailure,
  getLoverNextReward, getLoverPassiveGains, getLoverRouteCost, getLoverRouteGain, LOVER_ROUTES, LOVER_TASK_MAX,
  settlePendingLoverHelp,
} from "../src/core/v2-lover-progression";
import type { LoverRoute } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation, previewResearchOperation } from "../src/core/v2-research-operation";
import { getReadPaperSanCost } from "../src/core/v2-reading-system";
import type { GameState, LoverTypeId, Paper } from "../src/core/v2-types";

function makeState(type: LoverTypeId = "smart"): GameState {
  const base = createStartedGameState("normal");
  return { ...base, totalMonths: 8, month: 8, year: 1, eventQueue: [], availableRandomEvents: [], buffs: [],
    papers: [], sanCap: 20, player: { ...base.player, research: 8, social: 6, san: 10, money: 20 },
    loverState: { ...activateLover(type, 7, "male"), name: "林青" },
    loverProgressState: { ...createLoverProgressState(type, () => 0), research: 10, intimacy: 5 },
  };
}

function withRoute(state: GameState, route: LoverRoute, progress: number, completed = 0): GameState {
  return { ...state, loverProgressState: { ...state.loverProgressState,
    routes: { ...state.loverProgressState.routes!, [route]: { progress, completed } },
  } };
}

function makePaper(patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), idea: 10, experiment: 10, writing: 10, ...patch };
}

function nextMonth(state: GameState): GameState {
  return dispatchAction({ ...state, eventQueue: [] }, "next-month");
}

function nextDateMonth(state: GameState): GameState {
  return { ...state, totalMonths: state.totalMonths + 1, month: state.month + 1,
    loverProgressState: { ...state.loverProgressState, taskUsedThisMonth: false },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("lover completion announcements", () => {
  it("retains the play rewards when SAN and intimacy are already capped", () => {
    const base = withRoute(makeState(), "play", 99);
    base.player.san = 20;
    base.loverProgressState.intimacy = 20;
    const next = advanceLoverDate(base, "play");
    const effects = next.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.effects ?? []));
    expect(effects).toContain("SAN +6（20→20）");
    expect(effects).toContain("亲密 +0（20→20，抵抗0.75，上限）");
    expect(next.player.san).toBe(20);
    expect(next.loverProgressState.intimacy).toBe(20);
  });

  it("keeps one manual completion record between the action and its actual paper help", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = withRoute(makeState(), "study", 99);
    const next = advanceLoverDate({ ...base, papers: [makePaper()], log: [] }, "study");
    expect(next.log).toHaveLength(3);
    expect(next.log[0]!.text).toContain("恋人帮助：林青");
    expect(next.log[1]!.eventHistoryId).toBeTruthy();
    expect(next.log[2]!.text).toContain("约会·学习：进度 +");
    const record = next.eventHistory.find((entry) => entry.id === next.log[1]!.eventHistoryId)!;
    expect(record.stages[0]!.talentTrigger!.reason).toBe("约会·学习进度满100，第1次");
    expect(next.loverProgressState.intimacy).toBe(6);
    expect(settlePendingLoverHelp(next)).toBe(next);
  });

  it("preserves both monthly route completions in engine logs without duplicate talent records", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = withRoute(withRoute(makeState(), "play", 99), "study", 99);
    const next = nextMonth({ ...base, papers: [makePaper()], log: [] });
    const completions = next.log.filter((entry) => entry.eventHistoryId?.startsWith("talent:lover:"));
    expect(completions).toHaveLength(2);
    const reasons = completions.map((entry) => next.eventHistory.find((record) => record.id === entry.eventHistoryId)!.stages[0]!.talentTrigger!.reason);
    expect(reasons).toEqual(["每月相处·学习进度满100，第1次", "每月相处·玩耍进度满100，第1次"]);
    expect(next.log.findIndex((entry) => entry.text.startsWith("恋人帮助："))).toBeLessThan(next.log.indexOf(completions[0]!));
    expect(next.loverProgressState.intimacy).toBe(6.75);
    expect(next.eventHistory.filter((record) => record.id.startsWith("talent:lover:"))).toHaveLength(2);
    expect(advanceLoverMonth(next)).toBe(next);
    const ordinary = advanceLoverMonth({ ...next, totalMonths: 10, month: 10 });
    expect(ordinary.log).toEqual(next.log);
  });

  it("reports pending help as stored and reports the original amount once when it settles", () => {
    const first = advanceLoverDate(withRoute({ ...makeState(), log: [] }, "study", 99), "study");
    expect(first.log.some((entry) => entry.text.startsWith("恋人帮助："))).toBe(false);
    expect(first.log[0]!.text).toContain("论文帮助已就绪");
    const repeated = advanceLoverDate(withRoute(nextDateMonth(first), "study", 99, 3), "study");
    expect(repeated.log[0]!.text).toContain("待生效（10分），不叠加");
    expect(repeated.loverProgressState.pendingPaperHelp).toEqual(first.loverProgressState.pendingPaperHelp);
    const ready = { ...repeated, papers: [makePaper()], loverProgressState: { ...repeated.loverProgressState, research: 1 } };
    const random = vi.spyOn(Math, "random");
    const settled = settlePendingLoverHelp(ready, () => 0);
    expect(settled.log[0]!.text).toContain("idea +10");
    expect(settled.log.filter((entry) => entry.text.startsWith("恋人帮助："))).toHaveLength(1);
    expect(settlePendingLoverHelp(settled, () => 0)).toBe(settled);
    expect(random).not.toHaveBeenCalled();
  });

  it("announces discount activation once in its effective month without changing preview or RNG", () => {
    const reward = advanceLoverDate(withRoute(makeState(), "play", 99, 2), "play");
    expect(reward.log.some((entry) => entry.text.startsWith("约会余韵生效："))).toBe(false);
    const ready = { ...reward, totalMonths: 9, month: 9 };
    const random = vi.spyOn(Math, "random");
    const active = activateLoverMonthlyDiscount(ready);
    expect(active.log[0]!.text).toContain("本月SAN消耗 -1");
    expect(active.log[0]!.month).toBe(9);
    expect(activateLoverMonthlyDiscount(active).log).toEqual(active.log);
    expect(advanceLoverMonth(active).log).toEqual(active.log);
    expect(random).not.toHaveBeenCalled();
    random.mockReturnValue(0.5);
    const snapshot = structuredClone(reward);
    previewNextMonthEffects(reward);
    expect(reward).toEqual(snapshot);
    const next = nextMonth(reward);
    expect(next.log.filter((entry) => entry.text.startsWith("约会余韵生效："))).toHaveLength(1);
  });
});

describe("lover initialization and monthly progression", () => {
  it("initializes inactive routes without consuming randomness", () => {
    const random = vi.fn(() => 0.5);
    expect(createLoverProgressState(undefined, random)).toMatchObject({
      active: false, research: 0, intimacy: 0, taskProgress: 0, taskMax: 100, taskUsedThisMonth: false,
      routes: { play: { progress: 0, completed: 0 }, study: { progress: 0, completed: 0 }, shopping: { progress: 0, completed: 0 } },
      giftCoupons: 0, pendingPaperHelp: null, sanDiscountMonths: [],
    });
    expect(random).not.toHaveBeenCalled();
    expect(LOVER_TASK_MAX).toBe(100);
  });

  it.each(["beautiful", "smart"] as const)("independently samples all four initialization values for %s", (type) => {
    for (const researchOffset of [0, 1, 2, 3]) {
      for (const intimacyOffset of [0, 1, 2, 3]) {
        const rawResearch = (type === "smart" ? 5 : 2) + researchOffset;
        const expectedIntimacy = type === "beautiful" ? [6, 6.75, 7.5, 8.25][intimacyOffset] : 3 + intimacyOffset;
        const random = vi.fn().mockReturnValueOnce(researchOffset / 4);
        random.mockReturnValueOnce((intimacyOffset + 0.999) / 4);
        expect(createLoverProgressState(type, random)).toMatchObject({ active: true,
          research: Math.min(6, rawResearch) + Math.max(0, rawResearch - 6) * 0.75,
          intimacy: expectedIntimacy,
          giftCoupons: 0, pendingPaperHelp: null,
        });
        expect(random).toHaveBeenCalledTimes(2);
      }
    }
  });

  it.each(["beautiful", "smart"] as const)("generates %s research for the joining cohort with resistance", (type) => {
    expect(createLoverProgressState(type, () => 0, 4)).toMatchObject({ research: type === "smart" ? 9.75 : 7.5,
      intimacy: type === "beautiful" ? 6 : 3 });
    expect(createLoverProgressState(type, () => 0.99, 4)).toMatchObject({ research: type === "smart" ? 12 : 9.75,
      intimacy: type === "beautiful" ? 8.25 : 6 });
  });

  it.each(["beautiful", "smart"] as const)("uses one intimacy snapshot for both %s passive routes and preserves excess", (type) => {
    const state = withRoute(withRoute(makeState(type), "play", 99), "study", 99);
    const before = structuredClone(state);
    expect(getLoverPassiveGains(state)).toEqual(type === "beautiful" ? { play: 4, study: 2 } : { play: 2, study: 4 });
    const next = advanceLoverMonth(state);
    expect(next.loverProgressState.routes).toEqual({
      play: { progress: type === "beautiful" ? 3 : 1, completed: 1 },
      study: { progress: type === "beautiful" ? 1 : 3, completed: 1 },
      shopping: { progress: 0, completed: 0 },
    });
    expect(next.loverProgressState).toMatchObject({ intimacy: 6.75, lastAdvancedTotalMonths: 8, pendingPaperHelp: { amount: 10 } });
    expect(next.loverProgressState.monthlyActivity).toContain(type === "beautiful" ? "玩耍进度 +4，学习进度 +2" : "玩耍进度 +2，学习进度 +4");
    expect(next.loverProgressState.monthlyActivity).toContain("SAN +6");
    expect(next.loverProgressState.monthlyActivity).toContain("论文帮助已就绪");
    expect(advanceLoverDate(next, "study").loverProgressState.monthlyActivity).toBe(next.loverProgressState.monthlyActivity);
    expect(next.player).toEqual({ ...state.player, san: 16 });
    expect(advanceLoverMonth(next)).toBe(next);
    expect(state).toEqual(before);
  });

  it("skips the joining month, inactive relationships, finished games and already settled months", () => {
    const base = makeState();
    const cases: GameState[] = [
      { ...base, totalMonths: 7 },
      { ...base, loverState: { ...base.loverState, active: false } },
      { ...base, loverProgressState: { ...base.loverProgressState, active: false } },
      { ...base, phase: "finished" },
      { ...base, loverProgressState: { ...base.loverProgressState, lastAdvancedTotalMonths: 8 } },
      { ...base, loverProgressState: { ...base.loverProgressState, lastAdvancedTotalMonths: 9 } },
    ];
    for (const state of cases) expect(advanceLoverMonth(state)).toBe(state);
  });

  it("advances passive routes through the real month pipeline without consuming a manual date", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState();
    state.loverState.startTotalMonths = state.totalMonths;
    const next = nextMonth(state);
    expect(next.totalMonths).toBe(9);
    expect(next.loverProgressState.routes).toEqual({
      play: { progress: 2, completed: 0 }, study: { progress: 4, completed: 0 }, shopping: { progress: 0, completed: 0 },
    });
    expect(getLoverDateFailure(next, "study")).toBeNull();
    expect(advanceLoverMonth(next)).toBe(next);
  });
});

describe("manual lover dates", () => {
  it.each(LOVER_ROUTES)("charges the %s cost once and shares the monthly limit across all routes", (route) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = { ...makeState(), totalMonths: 14, month: 2, year: 2 };
    const before = structuredClone(state);
    const cost = { play: { money: 2, san: 0 }, study: { money: 0, san: 4 }, shopping: { money: 3, san: 0 } }[route];
    const gain = { play: 5, study: 9, shopping: 12 }[route];
    expect(getLoverRouteCost(state, route)).toEqual(cost);
    expect(getLoverRouteGain(state, route)).toBe(gain);
    const dated = dispatchAction(state, `lover-${route}`);
    expect(dated.player).toEqual({ ...state.player, money: state.player.money - cost.money, san: state.player.san - cost.san });
    expect(dated.loverProgressState.routes![route]).toEqual({ progress: gain, completed: 0 });
    expect(dated.loverProgressState).toMatchObject({ lastDateTotalMonths: 14, taskUsedThisMonth: true });
    expect(dated.actionState).toEqual(state.actionState);
    for (const other of LOVER_ROUTES) {
      expect(getLoverDateFailure(dated, other)).toBe("本月已约会，下月恢复");
      const repeated = dispatchAction(dated, `lover-${other}`);
      expect(repeated.player).toEqual(dated.player);
      expect(repeated.loverProgressState).toEqual(dated.loverProgressState);
    }
    const next = nextMonth(dated);
    expect(next.loverProgressState.taskUsedThisMonth).toBe(false);
    expect(getLoverDateFailure(next, route)).toBeNull();
    expect(dispatchAction(next, `lover-${route}`).loverProgressState.lastDateTotalMonths).toBe(15);
    expect(state).toEqual(before);
  });

  it.each(LOVER_ROUTES)("rejects unaffordable %s dates without consuming the monthly opportunity", (route) => {
    const state = { ...makeState(), totalMonths: 14, month: 2, year: 2 };
    state.player.money = route === "play" ? 1 : 2;
    state.player.san = 3;
    const next = advanceLoverDate(state, route);
    expect(getLoverDateFailure(state, route)).not.toBeNull();
    expect(next.player).toEqual(state.player);
    expect(next.loverProgressState).toEqual(state.loverProgressState);
  });

  it("requires active states and rejects either monthly-use marker", () => {
    const base = makeState();
    for (const state of [
      { ...base, phase: "setup" as const },
      { ...base, loverState: { ...base.loverState, active: false } },
      { ...base, loverProgressState: { ...base.loverProgressState, active: false } },
      { ...base, loverProgressState: { ...base.loverProgressState, taskUsedThisMonth: true } },
      { ...base, loverProgressState: { ...base.loverProgressState, lastDateTotalMonths: 8 } },
    ]) {
      for (const route of LOVER_ROUTES) {
        expect(getLoverDateFailure(state, route)).not.toBeNull();
        expect(advanceLoverDate(state, route).loverProgressState).toEqual(state.loverProgressState);
      }
    }
  });

  it.each([
    { month: 8, hasParasol: false, cost: 3 },
    { month: 11, hasParasol: false, cost: 5 },
    { month: 11, hasParasol: true, cost: 4 },
  ])("uses the adjusted study cost for affordability in month $month with parasol $hasParasol", ({ month, hasParasol, cost }) => {
    const state = { ...makeState(), month, totalMonths: month };
    state.eventSupport.hasParasol = hasParasol;
    state.buffs = [
      { id: "illness", name: "Illness", source: "test", timing: "monthly", remainingMonths: 1, activeOperationSanMultiplier: 1.5 },
      { id: "lover-play-discount", name: "Date", source: "test", timing: "monthly", remainingMonths: 1, activeOperationSanDelta: -1 },
      { id: "gemini", name: "Gemini", source: "test", timing: "monthly", remainingMonths: 1, relationshipOperationSanDelta: -1 },
      { id: "expired", name: "Expired", source: "test", timing: "monthly", remainingMonths: 0, relationshipOperationSanDelta: -10 },
    ];
    state.player.san = cost - 1;
    expect(getLoverRouteCost(state, "study")).toEqual({ money: 0, san: cost });
    expect(getLoverRouteCost(state, "play")).toEqual({ money: 2, san: 0 });
    expect(getLoverRouteCost(state, "shopping")).toEqual({ money: 3, san: 0 });
    expect(getLoverDateFailure(state, "study")).toBe(`SAN不足，需要${cost}`);
    const rejected = advanceLoverDate(state, "study");
    expect(rejected.player).toEqual(state.player);
    expect(rejected.loverProgressState).toEqual(state.loverProgressState);
    const affordable = { ...rejected, player: { ...rejected.player, san: cost } };
    expect(getLoverDateFailure(affordable, "study")).toBeNull();
    const dated = advanceLoverDate(affordable, "study");
    expect(dated.player.san).toBe(0);
    expect(dated.loverProgressState).toMatchObject({ lastDateTotalMonths: month, taskUsedThisMonth: true });
    expect(dated.loverProgressState.routes!.study).toEqual({ progress: 9, completed: 0 });
    expect(dated.actionState).toEqual(state.actionState);
  });
});

describe("lover route reward cycles", () => {
  it("cycles play through SAN, cap, next-month discount and SAN again", () => {
    const first = advanceLoverDate(withRoute(makeState(), "play", 99), "play");
    expect(first.player.san).toBe(16);
    expect(first.sanCap).toBe(20);
    expect(first.loverProgressState.routes!.play).toEqual({ progress: 4, completed: 1 });
    expect(first.loverProgressState.intimacy).toBe(6);
    const second = advanceLoverDate(withRoute(nextDateMonth(first), "play", 99, 1), "play");
    expect(second.player.san).toBe(16);
    expect(second.sanCap).toBe(21);
    expect(second.loverProgressState.intimacy).toBe(6.75);
    const third = advanceLoverDate(withRoute(nextDateMonth(second), "play", 99, 2), "play");
    expect(third.loverProgressState.sanDiscountMonths).toEqual([11]);
    expect(third.buffs.some((buff) => buff.id === "lover-play-discount")).toBe(false);
    const fourth = advanceLoverDate(withRoute(nextDateMonth(third), "play", 99, 3), "play");
    expect(fourth.player.san).toBe(21);
    expect(fourth.sanCap).toBe(21);
    expect(fourth.loverProgressState.intimacy).toBe(8.25);
  });

  it("activates the play discount next month, floors costs at zero and expires it the following month", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = { ...makeState(), totalMonths: 26, month: 2, year: 3 };
    const reward = advanceLoverDate(withRoute(state, "play", 99, 2), "play");
    expect(getLoverRouteCost(reward, "study").san).toBe(4);
    const discounted = nextMonth(reward);
    expect(discounted.totalMonths).toBe(27);
    expect(discounted.buffs.find((buff) => buff.id === "lover-play-discount")).toMatchObject({ activeOperationSanDelta: -1, remainingMonths: 1 });
    expect(discounted.loverProgressState.sanDiscountMonths).toEqual([]);
    expect(getLoverRouteCost(discounted, "study").san).toBe(3);
    const withoutDiscount = { ...discounted, buffs: discounted.buffs.filter((buff) => buff.id !== "lover-play-discount") };
    expect(previewResearchOperation(discounted, "idea", 2).sanCost).toBe(previewResearchOperation(withoutDiscount, "idea", 2).sanCost - 1);
    expect(previewResearchOperation(discounted, "idea", 0).sanCost).toBe(0);
    expect(dispatchAction(discounted, "lover-study").player.san).toBe(discounted.player.san - 3);
    const later = nextMonth(discounted);
    expect(later.totalMonths).toBe(28);
    expect(later.buffs.some((buff) => buff.id === "lover-play-discount")).toBe(false);
    expect(getLoverRouteCost(later, "study").san).toBe(4);
  });

  it("retains the same fractional study reward with randomness used only for the action log ID", () => {
    const thirdStudy = withRoute(makeState(), "study", 99, 2);
    const effectsOf = (state: GameState) => state.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.effects ?? []));

    const random = vi.spyOn(Math, "random");
    for (const roll of [0, 0.99]) {
      random.mockClear();
      random.mockReturnValue(roll);
      const next = advanceLoverDate(thirdStudy, "study");
      expect(next.player.research).toBe(8.75);
      expect(effectsOf(next)).toContain("你的科研 +0.75（8→8.75，抵抗0.25）");
      expect(random).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    { research: 5, expected: 6, effect: "恋人科研 +1（5→6）" },
    { research: 8, expected: 8.75, effect: "恋人科研 +0.75（8→8.75，抵抗0.25）" },
    { research: 12, expected: 12.5, effect: "恋人科研 +0.5（12→12.5，抵抗0.5）" },
    { research: 18, expected: 18.25, effect: "恋人科研 +0.25（18→18.25，抵抗0.75）" },
    { research: 19.875, expected: 20, effect: "恋人科研 +0.125（19.875→20，抵抗0.75，上限）" },
    { research: 20, expected: 20, effect: "恋人科研 +0（20→20，抵抗0.75，上限）" },
  ])("uses the lover's own research tier and partial cap room at $research", ({ research, expected, effect }) => {
    const state = withRoute(makeState(), "study", 99, 2);
    state.player.research = 25;
    state.researchCapacityState = { baseCap: 25, jointTrainingCitationCapBonus: 0, otherCapBonus: 0 };
    state.loverProgressState.research = research;
    const snapshot = structuredClone(state);
    const random = vi.spyOn(Math, "random");
    const next = advanceLoverDate(state, "study");
    expect(random).toHaveBeenCalledTimes(1);
    const effects = next.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.effects ?? []));
    expect(next.loverProgressState.research).toBe(expected);
    expect(effects).toContain(effect);
    expect(next.log.some((entry) => entry.text.includes(effect))).toBe(true);
    expect(next.player).toEqual({ ...state.player, san: state.player.san - getLoverRouteCost(state, "study").san });
    expect(next.loverProgressState.intimacy).toBe(6);
    expect(next.buffs).toEqual(state.buffs);
    expect(next.actionState).toEqual(state.actionState);
    expect(state).toEqual(snapshot);
  });

  it.each([
    { research: 20, expected: 20.25, effect: "你的科研 +0.25（20→20.25，抵抗0.75）" },
    { research: 24, expected: 24.25, effect: "你的科研 +0.25（24→24.25，抵抗0.75）" },
    { research: 24.875, expected: 25, effect: "你的科研 +0.125（24.875→25，抵抗0.75，上限）" },
    { research: 25, expected: 25, effect: "你的科研 +0（25→25，抵抗0.75，上限）" },
  ])("uses the player's expanded cap and resistance at $research", ({ research, expected, effect }) => {
    const state = withRoute(makeState(), "study", 99, 2);
    state.player.research = research;
    state.researchCapacityState = { baseCap: 20, jointTrainingCitationCapBonus: 3, otherCapBonus: 2 };
    state.loverProgressState.research = research + 1;
    const snapshot = structuredClone(state);
    const random = vi.spyOn(Math, "random");
    const next = advanceLoverDate(state, "study");
    expect(random).toHaveBeenCalledTimes(1);
    const effects = next.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.effects ?? []));
    expect(next.player).toEqual({ ...state.player, research: expected, san: state.player.san - getLoverRouteCost(state, "study").san });
    expect(next.loverProgressState.research).toBe(state.loverProgressState.research);
    expect(next.loverProgressState.intimacy).toBe(6);
    expect(effects).toContain(effect);
    expect(next.log.some((entry) => entry.text.includes(effect))).toBe(true);
    expect(next.buffs).toEqual(state.buffs);
    expect(next.actionState).toEqual(state.actionState);
    expect(state).toEqual(snapshot);
  });

  it.each([5, 10, 20, 25])("keeps tied research at %s without research gains", (research) => {
    const state = withRoute(makeState(), "study", 99, 2);
    state.player.research = research;
    state.loverProgressState.research = research;
    state.researchCapacityState = { baseCap: 25, jointTrainingCitationCapBonus: 0, otherCapBonus: 0 };
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const next = advanceLoverDate(state, "study");
    const effects = next.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.effects ?? []));
    expect(next.player).toEqual({ ...state.player, san: state.player.san - getLoverRouteCost(state, "study").san });
    expect(next.loverProgressState.research).toBe(research);
    expect(next.loverProgressState.intimacy).toBe(6);
    expect(effects).toContain("双方科研相同，本次不提升科研");
  });

  it("stacks permanent study score bonuses without extra operations", () => {
    const first = advanceLoverDate(withRoute(makeState(), "study", 99, 1), "study");
    const second = advanceLoverDate(withRoute(nextDateMonth(first), "study", 99, 4), "study");
    expect(second.buffs.filter((buff) => buff.id === "lover-study-score")).toHaveLength(1);
    expect(second.buffs.find((buff) => buff.id === "lover-study-score")).toMatchObject({ timing: "permanent", remainingMonths: null,
      actionEffects: { idea: { bonus: 2 }, experiment: { bonus: 2 }, writing: { bonus: 2 } },
    });
    const paper = makePaper();
    const ready = { ...second, papers: [paper], player: { ...second.player, san: 20 } };
    for (const field of ["idea", "experiment", "writing"] as const) {
      expect(previewResearchOperation(ready, field, 0)).toMatchObject({ scoreBonus: 2, extraActions: 0 });
      const baseline = applyResearchOperation({ ...ready, buffs: [] }, paper.id, field, () => 0.99);
      const improved = applyResearchOperation(ready, paper.id, field, () => 0.99);
      expect(improved.papers[0]![field]).toBe(baseline.papers[0]![field] + 2);
      expect(improved.actionState.used).toBe(ready.actionState.used + 1);
    }
    expect(advanceLoverMonth({ ...second, totalMonths: 10 }).buffs).toEqual(second.buffs);
  });

  it("applies next-month discounts before automatic reading in both preview and the engine, then expires", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const base = { ...makeState(), totalMonths: 26, month: 2, year: 3 };
    const purchased = dispatchAction(base, "buy-ai-month", { aiSlotId: "kimi" });
    const subscribed = dispatchAction(purchased, "toggle-ai-subscription", { aiSlotId: "kimi" });
    expect(subscribed.readingState.readCount).toBe(1);
    const reward = advanceLoverDate(withRoute(subscribed, "play", 99, 2), "play");
    expect(reward.loverProgressState.sanDiscountMonths).toEqual([27]);
    expect(getReadPaperSanCost(reward).sanCost).toBe(1);
    const snapshot = structuredClone(reward);
    const preview = previewNextMonthEffects(reward);
    expect(preview.items.find((item) => item.id === "ai-automatic-reading")?.appliedStats.san).toBe(0);
    expect(reward).toEqual(snapshot);
    const discounted = nextMonth(reward);
    expect(discounted.totalMonths).toBe(27);
    expect(discounted.readingState.readCount).toBe(2);
    expect(discounted.player.san).toBe(preview.player.san);
    expect(getReadPaperSanCost(discounted).sanCost).toBe(0);
    expect(discounted.buffs.filter((buff) => buff.id === "lover-play-discount")).toHaveLength(1);
    const expiryPreview = previewNextMonthEffects(discounted);
    expect(expiryPreview.items.find((item) => item.id === "ai-automatic-reading")?.appliedStats.san).toBe(-1);
    const expired = nextMonth(discounted);
    expect(expired.totalMonths).toBe(28);
    expect(expired.readingState.readCount).toBe(3);
    expect(expired.player.san).toBe(expiryPreview.player.san);
    expect(getReadPaperSanCost(expired).sanCost).toBe(1);
    expect(expired.buffs.some((buff) => buff.id === "lover-play-discount")).toBe(false);
  });

  it.each([
    [8, 10, 20, 8.75, 10], [10, 8, 20, 10, 8.75], [10, 10, 20, 10, 10],
    [8, 10, 8, 8, 10], [19, 20, 25, 19.25, 20], [20, 21, 25, 20.25, 21],
    [21, 20, 25, 21, 20], [19, 18, 20, 19, 18.25],
  ])("raises only the lower research with player=%s lover=%s cap=%s", (player, lover, cap, expectedPlayer, expectedLover) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const state = withRoute(makeState(), "study", 99, 2);
    state.player.research = player;
    state.loverProgressState.research = lover;
    state.researchCapacityState = { baseCap: cap, jointTrainingCitationCapBonus: 0, otherCapBonus: 0 };
    const next = advanceLoverDate(state, "study");
    expect(next.player.research).toBe(expectedPlayer);
    expect(next.loverProgressState.research).toBe(expectedLover);
    expect(next.loverProgressState.intimacy).toBe(6);
  });

  it.each(LOVER_ROUTES)("caps intimacy at 20 on the %s route", (route) => {
    const state = withRoute(makeState(), route, 99);
    state.loverProgressState.intimacy = 19.9;
    const next = advanceLoverDate(state, route);
    expect(next.loverProgressState.intimacy).toBe(20);
    const again = advanceLoverDate(withRoute(nextDateMonth(next), route, 99, 1), route);
    expect(again.loverProgressState.intimacy).toBe(20);
  });

  it("stacks shopping gifts across completions and preserves leftover progress", () => {
    const base = makeState();
    base.loverProgressState.intimacy = 18;
    base.loverProgressState.giftCoupons = 2;
    const first = advanceLoverDate(withRoute(base, "shopping", 95), "shopping");
    expect(first.loverProgressState).toMatchObject({ intimacy: 18.5, giftCoupons: 3, routes: { shopping: { progress: 14, completed: 1 } } });
    const second = advanceLoverDate(withRoute(nextDateMonth(first), "shopping", 99, 1), "shopping");
    expect(second.loverProgressState).toMatchObject({ intimacy: 19, giftCoupons: 4, routes: { shopping: { progress: 18, completed: 2 } } });
    expect(second.player.money).toBe(base.player.money - 6);
    expect(second.loverProgressState.routes!.play).toEqual(base.loverProgressState.routes!.play);
    expect(second.loverProgressState.routes!.study).toEqual(base.loverProgressState.routes!.study);
  });
});

describe("lover intimacy percentage resistance", () => {
  it.each(LOVER_ROUTES)("previews the actual next %s intimacy reward without mutation or random draws", (route) => {
    for (const intimacy of [5.5, 6, 11.5, 12, 17.5, 18, 19.9, 20]) {
      const state = withRoute(makeState(), route, 99);
      state.loverProgressState.intimacy = intimacy;
      const snapshot = structuredClone(state);
      const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Preview consumed randomness"); });
      const preview = getLoverNextReward(state, route);
      const gain = Number(preview.split("、亲密 +")[1]);
      expect(getLoverNextReward(state, route)).toBe(preview);
      expect(state).toEqual(snapshot);
      expect(random).not.toHaveBeenCalled();
      random.mockRestore();
      const next = advanceLoverDate(state, route);
      expect(next.loverProgressState.intimacy - intimacy).toBeCloseTo(gain, 10);
      expect(next.log[0]!.text).toContain(`亲密 +${gain}（`);
      if (intimacy === 20) expect(preview).toContain("亲密 +0");
    }
  });

  it("previews just the next completion when one study action completes the route twice", () => {
    const state = withRoute(makeState(), "study", 99);
    state.player.research = 250;
    state.researchCapacityState.otherCapBonus = 230;
    state.loverProgressState.intimacy = 11.75;
    expect(getLoverNextReward(state, "study")).toContain("亲密 +0.75");
    const next = advanceLoverDate(state, "study");
    expect(next.loverProgressState.routes!.study.completed).toBe(2);
    expect(next.loverProgressState.intimacy).toBe(13);
    const rewards = next.eventHistory.slice(state.eventHistory.length)
      .flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.effects ?? []))
      .filter((effect) => effect.startsWith("亲密"));
    expect(rewards).toEqual(["亲密 +0.75（11.75→12.5，抵抗0.25）", "亲密 +0.5（12.5→13，抵抗0.5）"]);
    expect(getLoverNextReward(next, "study")).toBe("双方科研较低者 +1，相同不提升、亲密 +0.5");
  });

  it.each([
    [0, 1, 1], [5.5, 6.5, 1], [6, 6.75, 0.75], [11.75, 12.5, 0.75],
    [12, 12.5, 0.5], [17.75, 18.25, 0.5], [18, 18.25, 0.25], [19.9, 20, 0.1], [20, 20, 0],
  ])("settles a one-point reward from intimacy %s as %s and logs actual gain", (before, after, gain) => {
    const state = withRoute(makeState(), "play", 99);
    state.loverProgressState.intimacy = before;
    const snapshot = structuredClone(state);
    const next = advanceLoverDate(state, "play");
    expect(next.loverProgressState.intimacy).toBe(after);
    expect(next.log[0]!.text).toContain(`亲密 +${gain}（${before}→${after}`);
    expect(state).toEqual(snapshot);
    expect(next.player.san).toBe(16);
  });

  it.each([
    [5.5, 7.25, 1.75], [6, 7.5, 1.5], [11.5, 12.75, 1.25],
    [12, 13, 1], [17.5, 18.25, 0.75], [18, 18.5, 0.5], [19.9, 20, 0.1], [20, 20, 0],
  ])("rereads the tier for each shopping reward point at intimacy %s", (before, after, gain) => {
    const state = withRoute(makeState(), "shopping", 99);
    state.loverProgressState.intimacy = before;
    const next = advanceLoverDate(state, "shopping");
    expect(next.loverProgressState.intimacy).toBe(after);
    expect(next.log[0]!.text).toContain(`亲密 +${gain}（${before}→${after}`);
    expect(next.loverProgressState.giftCoupons).toBe(1);
    expect(next.player.money).toBe(state.player.money - 3);
  });

  it.each(["beautiful", "smart"] as const)("floors each automatic action before totaling %s routes", (type) => {
    const state = makeState(type);
    for (const [intimacy, singleGain] of [[1.75, 0], [5, 2], [6.75, 3], [11.75, 5], [19.75, 9]] as const) {
      state.loverProgressState.intimacy = intimacy;
      const gains = getLoverPassiveGains(state);
      expect(gains).toEqual(type === "beautiful"
        ? { play: singleGain * 2, study: singleGain }
        : { play: singleGain, study: singleGain * 2 });
    }
  });

  it.each(["beautiful", "smart"] as const)("freezes both %s monthly gains before completion raises intimacy", (type) => {
    const state = withRoute(withRoute(withRoute(makeState(type), "play", 99), "study", 96), "shopping", 99);
    state.loverProgressState.intimacy = 5.5;
    const next = advanceLoverMonth(state);
    expect(next.loverProgressState.routes).toEqual({
      play: { progress: type === "beautiful" ? 3 : 1, completed: 1 },
      study: { progress: type === "beautiful" ? 98 : 0, completed: type === "beautiful" ? 0 : 1 },
      shopping: { progress: 99, completed: 0 },
    });
    expect(next.loverProgressState.intimacy).toBe(type === "beautiful" ? 6.5 : 7.25);
    expect(next.loverProgressState.taskUsedThisMonth).toBe(false);
    expect(next.loverProgressState.giftCoupons).toBe(0);
    expect(advanceLoverMonth(next)).toBe(next);
    const restored = JSON.parse(JSON.stringify(next)) as GameState;
    expect(advanceLoverMonth(restored)).toBe(restored);
    expect(restored.loverProgressState.intimacy).toBe(next.loverProgressState.intimacy);
  });
});

describe("stored lover paper collaboration", () => {
  it("stores one help with the original research and identity until a paper becomes available", () => {
    const first = advanceLoverDate(withRoute(makeState(), "study", 99), "study");
    expect(first.loverProgressState.pendingPaperHelp).toEqual({ amount: 10, collaboratorId: "lover:7:林青", name: "林青" });
    const changed = { ...nextDateMonth(first),
      loverState: { ...first.loverState, name: "陈明" },
      loverProgressState: { ...first.loverProgressState, research: 15, taskUsedThisMonth: false },
    };
    const repeated = advanceLoverDate(withRoute(changed, "study", 99, 3), "study");
    expect(repeated.loverProgressState.pendingPaperHelp).toEqual(first.loverProgressState.pendingPaperHelp);
    const paper = makePaper({ idea: 0, experiment: 0, writing: 0 });
    const helped = settlePendingLoverHelp({ ...repeated, papers: [paper] }, () => 0.999);
    expect(getPaperScoreBreakdown(helped.papers[0]!, "idea")).toEqual({ own: 0, collaboration: 10, total: 10 });
    expect(helped.papers[0]!.collaborators).toEqual([{ id: "lover:7:林青", name: "林青" }]);
    expect(helped.loverProgressState.pendingPaperHelp).toBeNull();
    expect(settlePendingLoverHelp(helped)).toBe(helped);
  });

  it.each(["draft", "journal-reviewing"] as const)("breaks minimum-score ties randomly on a %s paper without consuming actions", (status) => {
    for (const [random, field] of [[0, "idea"], [0.5, "experiment"], [0.999, "writing"]] as const) {
      const base = makeState();
      base.loverProgressState.pendingPaperHelp = { amount: 10, collaboratorId: "lover:7:林青", name: "林青" };
      base.papers = [makePaper({ status, ...(status === "journal-reviewing" ? { journalTarget: "pami" as const } : {}) })];
      const next = settlePendingLoverHelp(base, () => random);
      expect(getPaperScoreBreakdown(next.papers[0]!, field)).toEqual({ own: 10, collaboration: 10, total: 20 });
      expect(next.papers[0]!.idea + next.papers[0]!.experiment + next.papers[0]!.writing).toBe(40);
      expect(next.papers[0]!.collaborators).toEqual([{ id: "lover:7:林青", name: "林青" }]);
      expect(next.player).toEqual(base.player);
      expect(next.actionState).toEqual(base.actionState);
      expect(next.loverProgressState.pendingPaperHelp).toBeNull();
    }
  });

  it("helps only the global minimum combined score across eligible papers", () => {
    const base = makeState();
    base.loverProgressState.pendingPaperHelp = { amount: 10, collaboratorId: "lover:7:林青", name: "林青" };
    base.papers = [
      makePaper({ id: "first", idea: 20, experiment: 15, writing: 12,
        collaborationScores: { idea: 19, experiment: 0, writing: 0 } }),
      makePaper({ id: "second", idea: 9, experiment: 4, writing: 8,
        collaborationScores: { idea: 0, experiment: 1, writing: 0 } }),
      makePaper({ id: "review", status: "reviewing", idea: 1, experiment: 1, writing: 1 }),
      makePaper({ id: "other", nonFirstAuthor: true, idea: 1, experiment: 1, writing: 1 }),
    ];
    const before = structuredClone(base);
    const next = settlePendingLoverHelp(base, () => 0.999);
    expect(next.papers[0]).toEqual(base.papers[0]);
    expect(next.papers.slice(2)).toEqual(base.papers.slice(2));
    expect(next.papers[1]).toMatchObject({ idea: 9, experiment: 14, writing: 8 });
    expect(getPaperScoreBreakdown(next.papers[1]!, "experiment")).toEqual({ own: 3, collaboration: 11, total: 14 });
    expect(next.loverProgressState.pendingPaperHelp).toBeNull();
    expect(settlePendingLoverHelp(next)).toBe(next);
    expect(base).toEqual(before);
  });

  it("retains help for locked papers and respects prerequisites when another draft appears", () => {
    const base = makeState();
    base.loverProgressState.pendingPaperHelp = { amount: 10, collaboratorId: "lover:7:林青", name: "林青" };
    base.papers = [makePaper({ id: "review", status: "reviewing" }), makePaper({ id: "published", status: "published" }), makePaper({ id: "other", nonFirstAuthor: true })];
    expect(settlePendingLoverHelp(base)).toBe(base);
    const eligible = makePaper({ id: "draft", idea: 1, experiment: 0, writing: 0 });
    const next = settlePendingLoverHelp({ ...base, papers: [...base.papers, eligible] }, () => 0.999);
    expect(next.papers.slice(0, 3)).toEqual(base.papers);
    expect(next.papers[3]).toMatchObject({ idea: 1, experiment: 10, writing: 0 });
  });

  it("automatically retries stored help when the engine creates a paper", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pending = advanceLoverDate(withRoute(makeState(), "study", 99), "study");
    const next = dispatchAction(pending, "create-paper", { paperSlotIndex: 0 });
    expect(next.papers).toHaveLength(1);
    expect(getPaperScoreBreakdown(next.papers[0]!, "idea")).toEqual({ own: 0, collaboration: 10, total: 10 });
    expect(next.loverProgressState.pendingPaperHelp).toBeNull();
    expect(next.actionState).toEqual(pending.actionState);
  });

  it("archives journal revisions accepted through stored help in the engine", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = makeState();
    base.loverProgressState.pendingPaperHelp = { amount: 20, collaboratorId: "lover:7:林青", name: "林青" };
    const paper = makePaper({ idea: 40, experiment: 40, writing: 40, status: "journal-reviewing", journalTarget: "pami",
      submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40 });
    const next = dispatchAction({ ...base, papers: [paper] }, "select-paper", { paperId: paper.id });
    expect(next.papers).toHaveLength(0);
    expect(next.externalPublications.find((entry) => entry.id === paper.id)).toMatchObject({
      status: "published", idea: 60, experiment: 40, writing: 40, collaborators: [{ id: "lover:7:林青", name: "林青" }],
    });
    expect(next.loverProgressState.pendingPaperHelp).toBeNull();
  });
});
