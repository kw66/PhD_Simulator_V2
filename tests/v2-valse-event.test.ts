import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCcigEvent } from "../src/core/v2-fixed-events-ccig-decision-events";
import type { GameState } from "../src/core/v2-types";

function queuedState(year = 1): GameState {
  const initial = createInitialState();
  const state: GameState = {
    ...initial, phase: "playing", degree: "phd", maxMonths: 70, year, month: 9, totalMonths: (year - 1) * 12 + 9,
    selectedAdvisorName: "测试导师",
    player: { ...initial.player, money: 2, favor: 6, san: 10 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 2 },
  };
  return { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
}

function choose(state: GameState, label = state.eventQueue[0]?.stage === "result" ? "确定" : "继续"): GameState {
  const event = state.eventQueue[0]!;
  const choice = event.choices.find((entry) => entry.label === label)!;
  expect(choice).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

function renderCurrentEvent(state: GameState): string {
  return renderApp(state, undefined, { isEventContentOpen: true, activeEventId: state.eventQueue[0]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("VALSE annual conference", () => {
  it("splits the local-food meal bill and preserves its deferred two-coin settlement", () => {
    let state = queuedState();
    state.player.social = 2;
    state = choose(choose(choose(choose(state), "请导师报销"), "确定"));
    expect(state.eventQueue[0]!.description).toContain("AA 聚餐，人均 2 金币");
    expect(state.eventQueue[0]!.choices.map((choice) => choice.label)).toContain("品尝当地美食");
    const beforeMeal = state.player;
    state = choose(state, "品尝当地美食");
    expect(state.eventQueue[0]!.description).toContain("AA 聚餐");
    expect(state.eventQueue[0]!.description).toContain("各付各的，你付了自己那份 2 金币");
    expect(state.eventQueue[0]!.description).not.toContain("你买了单");
    expect(state.eventQueue[0]!.choices[0]!.effects).toMatchObject({ money: -2, san: 2, social: 1 });
    expect(state.player).toEqual(beforeMeal);
    state = choose(state);
    expect(state.player).toMatchObject({ money: beforeMeal.money - 2, san: beforeMeal.san + 2, social: 3 });
  });

  it.each([
    ["act1", 0], ["act1", 1], ["act1", 12],
    ["act2", 1], ["act2", 12], ["act3", 1], ["act3", 12],
  ] as const)("keeps the original conference chain through all three scenes after shifting %s by %i months", (stage, delta) => {
    let state = queuedState(3);
    const chainId = state.eventQueue[0]!.chainId;
    if (stage !== "act1") state = choose(state);
    if (stage === "act3") state = choose(state, "自费参会");
    state = dispatchAction(state, "debug-shift-month", { delta });
    const calendar = { year: state.year, month: state.month, totalMonths: state.totalMonths };
    expect(state.totalMonths).toBe(33 + delta);
    if (stage === "act1") state = choose(state);
    if (stage !== "act3") {
      expect(state.eventQueue[0]).toMatchObject({ chainId, stage: "act2" });
      expect(state.eventHistory.filter((entry) => entry.chainId === chainId)).toHaveLength(0);
      state = choose(state, "自费参会");
    }
    expect(state.eventQueue[0]).toMatchObject({ chainId, stage: "act3" });
    expect(state.eventQueue[0]!.description).toContain("VALSE 2026");
    expect(state.eventQueue[0]!.description).toContain("武汉");
    expect(state.player.money).toBe(2);
    expect(state.eventCounters.meetingCount).toBe(0);
    expect(state.eventHistory.filter((entry) => entry.chainId === chainId)).toHaveLength(0);
    state = choose(state, "确定");
    expect(state).toMatchObject(calendar);
    expect(state.player.money).toBe(0);
    expect(state.advisorProgressState.funding).toBe(2);
    expect(state.eventCounters.meetingCount).toBe(1);
    const history = state.eventHistory.filter((entry) => entry.chainId === chainId);
    expect(history).toHaveLength(1);
    expect(history[0]!.stages).toHaveLength(3);
    expect(state.eventQueue[0]).toMatchObject({ chainId: `${chainId}-activity`, stage: "act1" });
    expect(state.eventQueue[0]!.description).toContain("VALSE 2026");
    expect(state.eventQueue[0]!.description).toContain("武汉");
  });

  it.each([1, 12])("refreshes decision and final confirmation from live balances and favor after a %i-month shift", (delta) => {
    let state = choose(queuedState(3));
    const chainId = state.eventQueue[0]!.chainId;
    state = dispatchAction(state, "debug-shift-month", { delta });
    state = { ...state, player: { ...state.player, money: 0, favor: 5 },
      advisorProgressState: { ...state.advisorProgressState, funding: 0 } };
    const before = structuredClone(state);
    const blocked = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(blocked.chainId).toBe(chainId);
    expect(blocked.choices.find((choice) => choice.label === "自费参会")?.disabledReason).toBeUndefined();
    expect(blocked.choices.find((choice) => choice.label === "请导师报销")?.disabledReason).toBeUndefined();
    expect(blocked.description).toContain("和导师还没那么熟");
    expect(state).toEqual(before);
    state = { ...state, player: { ...state.player, money: 2, favor: 12 },
      advisorProgressState: { ...state.advisorProgressState, funding: 2 } };
    const available = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(available.choices.find((choice) => choice.label === "自费参会")?.disabledReason).toBeUndefined();
    expect(available.choices.find((choice) => choice.label === "请导师报销")?.disabledReason).toBeUndefined();
    expect(available.description).toContain("和导师平时还算熟");
    state = choose(state, "请导师报销");
    expect(state.player.favor).toBe(12);
    expect(state.advisorProgressState.funding).toBe(2);
    state = { ...state, player: { ...state.player, favor: 6 },
      advisorProgressState: { ...state.advisorProgressState, funding: 0 } };
    const confirmation = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(confirmation.choices.find((choice) => choice.label === "确定")?.disabledReason).toBeUndefined();
    expect(confirmation.choices.map((choice) => choice.label)).toEqual(["确定"]);
    expect(confirmation.description).toContain("导师好感 -0.8");
    expect(confirmation.description).toContain("VALSE 2026");
    expect(confirmation.description).toContain("武汉");
    const bankrupt = choose(state, "确定");
    expect(bankrupt.advisorProgressState.funding).toBe(-2);
    expect(bankrupt.player.favor).toBe(5.2);
    expect(bankrupt).toMatchObject({ phase: "finished", ending: "lab-bankrupt" });
    state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 2 } };
    state = choose(state, "确定");
    expect(state.player).toMatchObject({ money: 2, favor: 5.2 });
    expect(state.advisorProgressState.funding).toBe(0);
    expect(state.eventCounters.meetingCount).toBe(1);
    expect(state.eventHistory.find((entry) => entry.chainId === chainId)?.stages).toHaveLength(3);
  });

  it.each([1, 12])("retains the original activity chain and city after shifting another %i months", (delta) => {
    let state = choose(choose(choose(queuedState(3)), "自费参会"), "确定");
    const chainId = state.eventQueue[0]!.chainId;
    state = dispatchAction(state, "debug-shift-month", { delta });
    state = choose(state);
    expect(state.eventQueue[0]).toMatchObject({ chainId, stage: "act2" });
    state = choose(state, "顺便旅游");
    expect(state.eventQueue[0]).toMatchObject({ chainId, stage: "result" });
    expect(state.eventQueue[0]!.description).toContain("沿着江滩散步");
    expect(state.player.money).toBe(0);
    state = choose(state);
    expect(state.player).toMatchObject({ money: 0, san: 14 });
    expect(state.eventCounters.meetingCount).toBe(1);
    expect(state.eventHistory.find((entry) => entry.chainId === chainId)?.stages).toHaveLength(3);
  });

  it.each([1, 12])("rechecks self-payment at final confirmation after a %i-month shift without charging twice", (delta) => {
    let state = choose(choose(queuedState(3)), "自费参会");
    state = dispatchAction(state, "debug-shift-month", { delta });
    expect(state.totalMonths).toBe(33 + delta);
    state = { ...state, player: { ...state.player, money: 1 } };
    const confirmation = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(confirmation).toMatchObject({ chainId: "ccig-y3-m9", stage: "act3" });
    expect(confirmation.choices.find((choice) => choice.label === "确定")?.disabledReason).toBeUndefined();
    const overdrawn = choose(state, "确定");
    expect(overdrawn.player.money).toBe(-1);
    expect(overdrawn).toMatchObject({ phase: "finished", ending: "poor" });
    const ready = { ...state, player: { ...state.player, money: 2 } };
    const paid = choose(ready, "确定");
    expect(paid.player.money).toBe(0);
    expect(paid.advisorProgressState.funding).toBe(2);
    expect(paid.eventCounters.meetingCount).toBe(1);
    const repeated = dispatchAction(paid, "resolve-event", { eventId: confirmation.id,
      eventChoiceId: confirmation.choices.find((choice) => choice.label === "确定")!.id });
    expect(repeated.player).toEqual(paid.player);
    expect(repeated.eventCounters).toEqual(paid.eventCounters);
  });

  it("keeps the original skip-result city and three-scene history across years", () => {
    const shifted = dispatchAction(queuedState(3), "debug-shift-month", { delta: 12 });
    const skipped = choose(choose(shifted), "不去参加");
    expect(skipped.eventQueue[0]).toMatchObject({ chainId: "ccig-y3-m9", stage: "act3" });
    expect(skipped.eventQueue[0]!.description).toContain("武汉参加 VALSE 2026");
    const completed = choose(skipped, "确定");
    expect(completed.player).toEqual(shifted.player);
    expect(completed.advisorProgressState).toEqual(shifted.advisorProgressState);
    expect(completed.eventCounters.meetingCount).toBe(0);
    expect(completed.eventHistory.find((entry) => entry.chainId === "ccig-y3-m9")?.stages).toHaveLength(3);
  });

  it.each([
    [1, 2024, "重庆"], [2, 2025, "珠海"], [3, 2026, "武汉"],
    [4, 2027, "外地"], [6, 2029, "外地"],
  ] as const)("uses the actual host city in academic year %i", (year, realYear, city) => {
    let state = queuedState(year);
    expect(state.eventQueue[0]!.title).toBe("领域年会");
    expect(state.eventQueue[0]!.description).toContain(`VALSE ${realYear}`);
    expect(state.eventQueue[0]!.description).toContain(city);
    expect(state.eventQueue[0]!.description).not.toContain("CCIG");
    state = choose(state);
    expect(state.eventQueue[0]!.description).toMatch(/(?:免费注册|不收注册费|注册免费)/u);
    expect(state.eventQueue[0]!.description).toMatch(/差旅[^。]*2 金币/u);
    state = choose(state, "自费参会");
    expect(state.eventQueue[0]!.description).toContain(`VALSE ${realYear}`);
    expect(state.eventQueue[0]!.description).toContain(city);
    state = choose(state, "确定");
    expect(state.eventQueue[0]!.description).toContain(`VALSE ${realYear}`);
    expect(state.eventQueue[0]!.description).toContain(city);
    if (year > 3) expect(state.eventQueue[0]!.description).not.toMatch(/重庆|珠海|武汉/u);
  });

  it.each(["act2", "act3"])("keeps zero-money choices clickable at %s and charges only on confirmation", (stage) => {
    let state = choose(queuedState());
    if (stage === "act3") state = choose(state, "自费参会");
    const label = stage === "act2" ? "自费参会" : "确定";
    const empty = { ...state, player: { ...state.player, money: 0 } };
    const selected = choose(empty, label);
    if (stage === "act2") {
      expect(selected.eventQueue[0]!.stage).toBe("act3");
      expect(selected.player).toEqual(empty.player);
      expect(selected.advisorProgressState).toEqual(empty.advisorProgressState);
      expect(selected.eventCounters.meetingCount).toBe(0);
    }
    const overdrawn = stage === "act2" ? choose(selected, "确定") : selected;
    expect(overdrawn.player.money).toBe(-2);
    expect(overdrawn).toMatchObject({ phase: "finished", ending: "poor" });
    if (stage === "act2") state = choose(state, "自费参会");
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).choices[0]!.disabledReason).toBeUndefined();
    expect(choose(state, "确定").player.money).toBe(0);
  });

  it.each([
    { mode: "自费参会", favor: 6, roll: 0, change: 0 },
    { mode: "请导师报销", favor: 5, roll: 0, change: -1 },
    { mode: "请导师报销", favor: 6, roll: 0.1, change: -0.8 },
    { mode: "请导师报销", favor: 6, roll: 0.99, change: -0.8 },
  ])("settles $mode once with favor $favor independently of roll $roll", ({ mode, favor, roll, change }) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    let state = queuedState();
    state = { ...state, player: { ...state.player, favor } };
    expect(state.eventQueue[0]!.stage).toBe("act1");
    state = choose(state);
    expect(state.eventQueue[0]!.stage).toBe("act2");
    state = choose(state, mode);
    const confirmation = state.eventQueue[0]!;
    expect(confirmation.stage).toBe("act3");
    expect(state.player.money).toBe(2);
    expect(state.player.favor).toBe(favor);
    expect(state.advisorProgressState.funding).toBe(2);
    expect(state.eventCounters.meetingCount).toBe(0);
    const html = renderCurrentEvent(state);
    const result = html.match(/<div class="event-settlement-row is-result">([\s\S]*?)<\/div>/u)?.[1];
    expect(result).toBeDefined();
    const effects = [...result!.matchAll(/<span class="event-settlement-effect ([^"]+)"[^>]*>([^<]+)<\/span>/gu)]
      .map((match) => [match[1], match[2]]);
    expect(effects).toEqual(mode === "自费参会" ? [["is-money", "金币 -2"]] : [
      ["is-relationship", `导师好感 ${change}${change === -0.8 ? "（抵抗0.2）" : ""}`],
      ["is-advisor-funding", "科研经费 -2"],
    ]);
    const unstyled = result!
      .replace(/<span class="event-settlement-effect [^"]+"[^>]*>[^<]*<\/span>/gu, "")
      .replace(/<span class="event-settlement-label">结果<\/span>/gu, "")
      .replace(/<[^>]+>/gu, "").replace(/\s/gu, "");
    expect(unstyled).toBe("");
    expect(confirmation.description).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
    expect(confirmation.completionLog).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
    state = choose(state, "确定");
    const paidMoney = mode === "自费参会" ? 0 : 2;
    const paidFunding = mode === "请导师报销" ? 0 : 2;
    expect(state.player.money).toBe(paidMoney);
    expect(state.player.favor).toBe(favor + change);
    expect(state.advisorProgressState.funding).toBe(paidFunding);
    expect(state.eventCounters).toMatchObject({ meetingCount: 1, domesticMeetingCount: 1 });
    const duplicate = dispatchAction(state, "resolve-event", {
      eventId: confirmation.id, eventChoiceId: confirmation.choices[0]!.id,
    });
    expect(duplicate.player).toEqual(state.player);
    expect(duplicate.advisorProgressState).toEqual(state.advisorProgressState);
    expect(duplicate.eventCounters).toEqual(state.eventCounters);
    for (const stage of ["act1", "act2"]) {
      expect(state.eventQueue[0]!.stage).toBe(stage);
      expect(state.eventQueue[0]!.title).toContain("VALSE活动");
      expect(state.eventQueue[0]!.description).not.toMatch(/机制结算|结果：|金币 -2|科研经费 -2|导师好感|CCIG/u);
      expect(renderCurrentEvent(state)).not.toContain('class="event-settlement-row is-result"');
      state = choose(state, stage === "act1" ? "继续" : "顺便旅游");
    }
    expect(state.eventQueue[0]!.stage).toBe("result");
    expect(state.player.san).toBe(10);
    state = choose(state);
    expect(state.player).toMatchObject({ money: paidMoney, favor: favor + change, san: 14 });
    expect(state.advisorProgressState.funding).toBe(paidFunding);
    expect(state.eventCounters).toMatchObject({ meetingCount: 1, domesticMeetingCount: 1 });
    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory.map((entry) => entry.stages.length)).toEqual([3, 3]);
    expect(state.log.map((entry) => entry.text).join("\n")).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
  });
});
