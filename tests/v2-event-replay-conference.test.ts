import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { isEventBlocking } from "../src/core/v2-event-auto-resolution";
import { canRewindPendingEvent } from "../src/core/v2-event-replay";
import type { EventQueueItem, GameState } from "../src/core/v2-types";

describe("pending conference replay across months", () => {
  it("keeps rolls and the elapsed deadline while refreshing costs and committing travel once", () => {
    const started = dispatchAction({ ...createInitialState(), randomState: { seed: 123, cursor: 0 } }, "start-game", { roleId: "normal" });
    let state: GameState = {
      ...started, month: 6, totalMonths: 6, selectedAdvisorName: "测试导师",
      eventQueue: [], pendingRandomEvents: [],
      player: { ...started.player, san: 30, money: 30, favor: 5 },
      advisorProgressState: { ...started.advisorProgressState, funding: 50 },
    };
    const chain = "conference-replay-next-month";
    let rollIndex = 0;
    const root = createConferenceDecisionAct1({
      id: chain, conferenceName: "CVPR", conferenceYear: 2026, city: "测试城", country: "测试国",
      paperCount: 1, grade: "A", region: "domestic", paperIds: [], availableAtTotalMonths: 8,
    }, { ...state, research: state.player.research, social: state.player.social,
      favor: state.player.favor, playerAttributeState: state }, () => (++rollIndex % 13) / 13);
    state = { ...state, eventQueue: [createEventQueueItem(root, 1)] };
    const current = (): EventQueueItem => {
      const event = state.eventQueue.find((entry) => entry.chainId === chain);
      if (!event) throw new Error("Missing conference decision");
      return event;
    };
    const choose = (eventChoiceId: string): void => {
      state = dispatchAction(state, "resolve-event", { eventId: current().id, eventChoiceId });
    };
    const rewind = (eventHistoryIndex: number): void => {
      state = dispatchAction(state, "replay-event", { eventId: current().id, eventHistoryIndex });
    };
    choose(current().choices[0]!.id);
    choose("advisor");
    const originalResult = structuredClone(current());
    const originalPlan = originalResult.choices[0]!.effects.scheduleConferenceAttendance!;
    expect(originalResult.deadlineMonths).toBe(2);
    expect(new Set(originalPlan.rolls).size).toBeGreaterThan(1);

    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(7);
    expect(current().stage).toBe("act3");
    expect(current().deadlineMonths).toBe(1);
    expect(canRewindPendingEvent(state, current(), 1)).toBe(true);
    // Other decisions can change live resistance while this conference remains pending.
    state = { ...state, player: { ...state.player, favor: 18 } };
    const beforeConfirmation = structuredClone(state);

    for (let attempt = 0; attempt < 3; attempt++) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      rewind(0);
      expect(current().stage).toBe("act1");
      expect(current().deadlineMonths).toBe(1);
      expect(isEventBlocking(state, current())).toBe(false);
      choose(current().choices[0]!.id);
      expect(current().deadlineMonths).toBe(1);
      choose("proxy");
      rewind(1);
      choose("advisor");
      expect(current().deadlineMonths).toBe(1);
      expect(current().conferencePreview?.rolls).toEqual(originalResult.conferencePreview?.rolls);
      expect(current().choices[0]!.effects.scheduleConferenceAttendance?.rolls).toEqual(originalPlan.rolls);
      expect(current().choices[0]!.effects.favor).not.toBe(originalResult.choices[0]!.effects.favor);
      expect(state.player).toEqual(beforeConfirmation.player);
      expect(state.advisorProgressState).toEqual(beforeConfirmation.advisorProgressState);
      expect(state.eventCounters).toEqual(beforeConfirmation.eventCounters);
      expect(state.conferenceAttendancePlans).toEqual(beforeConfirmation.conferenceAttendancePlans);
      expect(state.eventHistory).toEqual(beforeConfirmation.eventHistory);
      expect(state.randomState).toEqual(beforeConfirmation.randomState);
    }

    const result = structuredClone(current());
    const effects = result.choices[0]!.effects;
    choose(result.choices[0]!.id);
    expect(state.player.favor).toBeCloseTo(beforeConfirmation.player.favor + effects.favor!);
    expect(state.advisorProgressState.funding).toBeCloseTo(
      beforeConfirmation.advisorProgressState.funding + effects.advisorProgressStateDeltas!.funding!,
    );
    expect(state.conferenceAttendancePlans?.filter((plan) => plan.context.id === chain)).toHaveLength(1);
    expect(state.conferenceAttendancePlans?.find((plan) => plan.context.id === chain)?.rolls).toEqual(originalPlan.rolls);
    expect(state.eventHistory.filter((event) => event.chainId === chain)).toHaveLength(1);
    expect(state.eventCounters.meetingCount).toBe(beforeConfirmation.eventCounters.meetingCount);
    expect(dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id })).toEqual(state);
    expect(dispatchAction(state, "replay-event", { eventId: result.id, eventHistoryIndex: 1 })).toEqual(state);
  });
});
