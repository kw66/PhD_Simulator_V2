import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import type { GameState } from "../src/core/v2-types";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { createEventQueueItem } from "../src/core/v2-event-queue";

afterEach(() => vi.restoreAllMocks());

function start(eventId: string, roll = 0.4): GameState {
  vi.spyOn(Math, "random").mockReturnValue(roll);
  const base = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  return dispatchAction({
    ...base, selectedAdvisorName: "测试导师", year: 2, month: 5, totalMonths: 17, eventQueue: [],
    player: { ...base.player, san: 10, money: 20 },
  }, "debug-trigger-event", { eventId });
}

function choose(state: GameState, match?: string): GameState {
  const event = state.eventQueue[0]!;
  const choice = match ? event.choices.find((entry) => entry.id.includes(match))! : event.choices[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

describe("pending fixed-event decisions use current state without rerolling", () => {
  it("updates winter lover narrative, envelopes and SAN both ways before confirmation", () => {
    let state = choose(start("winter-vacation"));
    state = refreshPendingEventDecisions({ ...state, loverState: { ...state.loverState, active: true } });
    expect(state.eventQueue[0]!.description).toContain("带恋人回来");
    state = choose(state);
    expect(state.eventQueue[0]!.description).toContain("金币 +4");
    expect(state.player.money).toBe(20);
    state = refreshPendingEventDecisions({ ...state, loverState: { ...state.loverState, active: false }, player: { ...state.player, san: 0 } });
    expect(state.eventQueue[0]!.description).toContain("家庭聚餐（30%）；无恋人");
    expect(state.eventQueue[0]!.description).toContain("金币 +2");
    expect(state.eventQueue[0]!.description).toContain("SAN +4（已损SAN20%）");
    expect(state.eventQueue[0]!.description).not.toContain("你带恋人");
    const random = vi.mocked(Math.random);
    random.mockClear();
    state = refreshPendingEventDecisions(JSON.parse(JSON.stringify(state)));
    state = refreshPendingEventDecisions(state);
    expect(random).not.toHaveBeenCalled();
    state = { ...state, loverState: { ...state.loverState, active: true } };
    state = choose(state);
    expect(state.player.money).toBe(24);
    expect(state.player.san).toBe(4);
    expect(state.log[0]!.text).toContain("金币 +4");
  });

  it("rechecks reunion resistance using the saved roll when the social tier changes", () => {
    let state = start("winter-vacation", 0.1);
    state = { ...state, player: { ...state.player, social: 5 } };
    state = choose(choose(state));
    expect(state.eventQueue[0]!.description).toContain("社交 +1");
    state = refreshPendingEventDecisions({ ...state, player: { ...state.player, social: 6 } });
    expect(state.eventQueue[0]!.description).toContain("社交 +0（抵抗1）");
    expect(state.eventQueue[0]!.description).not.toContain("抵抗概率");
    state = choose(state);
    expect(state.player.social).toBe(6);
    expect(state.player.money).toBe(22);
  });

  it("replaces the Teacher's Day deferred errand with the current high-favor outcome", () => {
    let state = choose(choose(start("teachers-day", 0.1)));
    expect(state.eventQueue[0]!.description).toContain("报销跑腿");
    expect(state.eventCounters.teachersDayErrandCount).toBe(0);
    state = refreshPendingEventDecisions({ ...state, player: { ...state.player, favor: 6 } });
    expect(state.eventQueue[0]!.description).toContain("分享想法（50%）");
    state = choose(state);
    expect(state.eventCounters.teachersDayErrandCount).toBe(0);
    expect(state.player.san).toBe(10);
    expect(state.player.favor).toBe(6);
    expect(state.buffs.filter((buff) => buff.actionEffects?.idea?.bonus === 4)).toHaveLength(1);
  });

  it("updates annual social reward but keeps CCIG fees fixed after attendance changes", () => {
    let state = choose(start("year-summary", 0.1));
    state = choose(state, "-social-");
    state = refreshPendingEventDecisions({ ...state, player: { ...state.player, social: 6 } });
    expect(state.eventQueue[0]!.description).toContain("社交 +0（抵抗1）");
    expect(choose(state).player.social).toBe(6);
    state = choose(start("ccig"));
    state = choose(state, "-self-");
    expect(state.eventQueue[0]!.description).toContain("金币 -2");
    state = refreshPendingEventDecisions({ ...state, eventCounters: { ...state.eventCounters, domesticMeetingCount: 3 } });
    expect(state.eventQueue[0]!.description).toContain("金币 -2");
    state = choose(state);
    expect(state.player.money).toBe(18);
    expect(state.eventCounters.domesticMeetingCount).toBe(4);
  });

  it("updates a PhD application failure after the player earns enough research score", () => {
    let state = choose(start("phd-choice"));
    state = choose(state, "transfer-phd");
    expect(state.eventQueue[0]!.title).toContain("转博失败");
    state = refreshPendingEventDecisions({ ...state, totalResearchScore: 2 });
    expect(state.eventQueue[0]!.description).toContain("转为博士");
    expect(state.degree).toBe("master");
    state = choose(state);
    expect(state.degree).toBe("phd");
    expect(state.buffs.filter((buff) => buff.id === "phd-pressure")).toHaveLength(1);
  });

  it("updates newcomer capacity without changing the selected candidate", () => {
    let state = choose(start("mentor-assign"));
    const decision = state.eventQueue[0]!;
    const candidate = decision.choices[0]!.effects.fellowAdditions![0]!;
    state = choose(state);
    const resultId = state.eventQueue[0]!.id;
    state = refreshPendingEventDecisions({ ...state, relationshipState: { ...state.relationshipState, occupiedSlots: 4, unlockedSlots: 5 } });
    expect(state.eventQueue[0]!.description).toContain("条件：人际栏已满");
    expect(state.eventQueue[0]!.deferredStatePatch?.some((entry) => entry.path[0] === "fellowProgressState")).not.toBe(true);
    state = refreshPendingEventDecisions({ ...state, relationshipState: { ...state.relationshipState, occupiedSlots: 0 } });
    const refreshed = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(refreshed.id).toBe(resultId);
    expect(refreshed.description).toContain(candidate.name);
    expect(refreshed.description).toContain(`科研能力 ${candidate.research}/20`);
    state = choose(state);
    expect(state.fellowProgressState).toHaveLength(1);
    expect(state.fellowProgressState[0]).toMatchObject({ name: candidate.name, research: candidate.research });
  });

  it("refreshes paper conference fees without charging on preview or redrawing activities", () => {
    let state = start("ccig");
    const root = createConferenceDecisionAct1({
      id: "conference-refresh", conferenceName: "CVPR", conferenceYear: 2026,
      city: "合肥", country: "中国", region: "domestic", grade: "A", paperCount: 1, paperIds: [],
    }, { ...state, research: state.player.research, social: state.player.social, favor: state.player.favor }, () => 0.4);
    state = { ...state, eventQueue: [createEventQueueItem(root, state.totalMonths)] };
    state = choose(choose(state), "self");
    const oldCost = -(state.eventQueue[0]!.choices[0]!.effects.money ?? 0);
    const random = vi.mocked(Math.random);
    random.mockClear();
    state = refreshPendingEventDecisions({ ...state, eventCounters: { ...state.eventCounters, domesticMeetingCount: 3 } });
    const newCost = -(state.eventQueue[0]!.choices[0]!.effects.money ?? 0);
    expect(newCost).toBe(oldCost);
    expect(state.player.money).toBe(20);
    expect(random).not.toHaveBeenCalled();
    state = choose(state);
    expect(state.player.money).toBe(20 - newCost);
    expect(state.eventCounters.domesticMeetingCount).toBe(4);
  });
});
