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
    ...initial, phase: "playing", year, month: 9, totalMonths: (year - 1) * 12 + 9,
    selectedAdvisorName: "测试导师",
    player: { ...initial.player, money: 2, favor: 6, san: 10 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 2 },
  };
  return { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), state.totalMonths)] };
}

function choose(state: GameState, label = "继续"): GameState {
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
    state = choose(state, "安排行程");
    expect(state.eventQueue[0]!.description).toContain(`VALSE ${realYear}`);
    expect(state.eventQueue[0]!.description).toContain(city);
    if (year > 3) expect(state.eventQueue[0]!.description).not.toMatch(/重庆|珠海|武汉/u);
  });

  it.each(["act2", "act3"])("blocks zero personal money at %s and accepts exactly two coins", (stage) => {
    let state = choose(queuedState());
    if (stage === "act3") state = choose(state, "自费参会");
    const label = stage === "act2" ? "自费参会" : "安排行程";
    const empty = { ...state, player: { ...state.player, money: 0 } };
    const blocked = choose(empty, label);
    expect(blocked.eventQueue[0]!.id).toBe(empty.eventQueue[0]!.id);
    expect(blocked.player).toEqual(empty.player);
    expect(blocked.advisorProgressState).toEqual(empty.advisorProgressState);
    expect(blocked.eventCounters.meetingCount).toBe(0);
    if (stage === "act2") state = choose(state, "自费参会");
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).choices[0]!.disabledReason).toBeUndefined();
    expect(choose(state, "安排行程").player.money).toBe(0);
  });

  it.each([
    { mode: "自费参会", favor: 6, roll: 0, change: 0 },
    { mode: "请导师报销", favor: 5, roll: 0, change: -1 },
    { mode: "请导师报销", favor: 6, roll: 0.1, change: -0.75 },
    { mode: "请导师报销", favor: 6, roll: 0.99, change: -0.75 },
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
      ["is-relationship", `导师好感 ${change}`],
      ["is-advisor-funding", "科研经费 -2"],
    ]);
    const unstyled = result!
      .replace(/<span class="event-settlement-effect [^"]+"[^>]*>[^<]*<\/span>/gu, "")
      .replace(/<span class="event-settlement-label">结果<\/span>/gu, "")
      .replace(/<[^>]+>/gu, "").replace(/\s/gu, "");
    expect(unstyled).toBe("");
    expect(confirmation.description).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
    expect(confirmation.completionLog).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
    state = choose(state, "安排行程");
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
      expect(state.eventQueue[0]!.title).toContain("领域年会活动");
      expect(state.eventQueue[0]!.description).not.toMatch(/机制结算|结果：|金币 -2|科研经费 -2|导师好感|CCIG/u);
      expect(renderCurrentEvent(state)).not.toContain('class="event-settlement-row is-result"');
      state = choose(state, stage === "act1" ? "继续" : "趁机旅游");
    }
    expect(state.eventQueue[0]!.stage).toBe("result");
    expect(state.player.san).toBe(10);
    state = choose(state);
    expect(state.player).toMatchObject({ money: paidMoney, favor: favor + change, san: 15 });
    expect(state.advisorProgressState.funding).toBe(paidFunding);
    expect(state.eventCounters).toMatchObject({ meetingCount: 1, domesticMeetingCount: 1 });
    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory.map((entry) => entry.stages.length)).toEqual([3, 3]);
    expect(state.log.map((entry) => entry.text).join("\n")).not.toMatch(/参会次数|(?:国内|亚太|欧美)参会\s*\d|实验室经费/u);
  });
});
