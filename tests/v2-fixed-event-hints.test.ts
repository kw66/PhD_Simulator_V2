import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { collectFixedEventsForState } from "../src/core/v2-fixed-events";
import { DEBUG_COMPLETED_EVENT_IDS, DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState } from "../src/core/v2-types";

function playingState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...dispatchAction(createInitialState(), "start-game", { roleId: "normal" }),
    selectedAdvisorName: "测试导师",
    year: 2,
    month: 1,
    totalMonths: 13,
    eventQueue: [],
    ...overrides,
  };
}

function resolveChoice(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", {
    eventId: event.id,
    eventChoiceId: choiceId ?? event.choices[0]!.id,
  });
}

describe("fixed-event appearance hints and debug entry", () => {
  it.each([
    [1, "teachers-day", "每年9月"],
    [2, "scholarship", "第2学年起，每年10月"],
    [5, "winter-vacation", "每年1月"],
    [9, "ccig-y2-m9", "每年5月"],
    [11, "summer-vacation", "每年7月"],
    [11, "year-summary", "每年7月"],
  ] as const)("matches the natural schedule for %s / %s", (month, chainId, condition) => {
    const state = playingState({ month, totalMonths: 12 + month });
    const event = collectFixedEventsForState(state, () => 0).find((entry) => entry.chainId === chainId)!;
    expect(event.description).toContain(`小提示：出现条件：${condition}`);
    expect(event.description.match(/小提示：出现条件：/gu)).toHaveLength(1);
    const decision = resolveChoice({ ...state, eventQueue: [createEventQueueItem(event, state.totalMonths)] }).eventQueue[0]!;
    expect(decision.description).not.toContain("小提示：出现条件：");
    expect(collectFixedEventsForState({ ...state, month: 3 }, () => 0).some((entry) => entry.chainId === chainId)).toBe(false);
  });

  it("schedules newcomer mentoring only in the first September after transfer", () => {
    const state = playingState({ degree: "phd", year: 3, phdStartYear: 3, totalMonths: 25 });
    const event = collectFixedEventsForState(state).find((entry) => entry.chainId === "mentor-assign")!;
    expect(event.description).toContain("小提示：出现条件：转博后的首个9月");
    for (const changed of [{ month: 2 }, { year: 4 }, { degree: "master" as const }]) {
      expect(collectFixedEventsForState({ ...state, ...changed }).some((entry) => entry.chainId === "mentor-assign")).toBe(false);
    }
    expect(DEBUG_COMPLETED_EVENT_IDS).toContain("mentor-assign");
  });

  it.each([[2, 2], [3, 3]])("keeps year %s PhD applications visible below the %s-point threshold", (year, threshold) => {
    let state = playingState({ year, month: 10, totalMonths: (year - 1) * 12 + 10, totalResearchScore: threshold - 1 });
    const event = collectFixedEventsForState(state).find((entry) => entry.chainId === "phd-decision")!;
    expect(event.description).toContain("硕士第2、3年6月");
    expect(event.description).not.toContain("转博要求");
    state = resolveChoice({ ...state, eventQueue: [createEventQueueItem(event, state.totalMonths)] });
    expect(state.eventQueue[0]!.choices.map((choice) => choice.id)).toContain("transfer-phd");
    state = resolveChoice(state, "transfer-phd");
    expect(state.eventQueue[0]!.title).toContain("转博失败");
    expect(state.eventQueue[0]!.description).toContain(`条件：科研分 ${threshold - 1} < ${threshold}`);
    state = resolveChoice(state);
    expect(state.degree).toBe("master");
    expect(state.phdStartYear).toBeNull();
    expect(state.buffs.some((buff) => buff.id === "phd-pressure")).toBe(false);
    expect(state.log[0]!.text).toContain("转博失败");
  });

  it("opens VALSE activities directly, settles only on confirmation, and supports replay", () => {
    expect(DEBUG_EVENT_GROUPS.find((group) => group.title === "固定事件")!.buttons).toContainEqual({ id: "ccig-activity", label: "领域年会活动" });
    const initial = playingState({ month: 9, totalMonths: 21, debugEventReplayEnabled: true });
    let state = dispatchAction(initial, "debug-trigger-event", { eventId: "ccig-activity" });
    expect(state.eventQueue[0]!.description).toContain("每年5月，确认参加领域年会后");
    expect(state.eventQueue[0]!.description).not.toContain("参会确认：");
    expect(state.player).toEqual(initial.player);
    state = resolveChoice(state);
    state = resolveChoice(state);
    expect(state.eventQueue[0]!.stage).toBe("result");
    expect(state.buffs).toEqual(initial.buffs);
    state = dispatchAction(state, "debug-replay-event", { eventId: state.eventQueue[0]!.id, eventHistoryIndex: 0 });
    expect(state.eventQueue[0]!.stage).toBe("act1");
    state = resolveChoice(resolveChoice(state));
    expect(state.buffs).toEqual(initial.buffs);
    state = resolveChoice(state);
    expect(state.buffs.filter((buff) => buff.timing === "permanent" && buff.actionEffects?.idea?.bonus === 1)).toHaveLength(1);
    expect(state.player.money).toBe(initial.player.money);
    expect(state.eventQueue).toHaveLength(0);
  });
});
