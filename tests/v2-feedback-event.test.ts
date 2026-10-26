import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { collectFixedEventsForState } from "../src/core/v2-fixed-events";
import { createFeedbackEvent, FEEDBACK_EVENT_ID } from "../src/core/v2-fixed-events-feedback";
import { createEventQueueItem, decrementEventQueueDeadlines } from "../src/core/v2-event-queue";
import { canAutoResolveLinearEvent, isEventBlocking } from "../src/core/v2-event-auto-resolution";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import type { Degree, GameState } from "../src/core/v2-types";

function playing(degree: Degree = "master"): GameState {
  return { ...createInitialState(), phase: "playing", year: 3, month: 4, totalMonths: 28, degree,
    selectedAdvisorName: "马海斌", blockLinearEvents: false };
}

describe("optional third-year feedback event", () => {
  it.each(["master", "phd"] as const)("schedules in year 3 month 4 for %s, with no early or repeated invitation", degree => {
    const state = playing(degree);
    expect(collectFixedEventsForState(state).map(e => e.id)).toContain(FEEDBACK_EVENT_ID);
    for (const [year, month] of [[3, 3], [3, 5], [2, 4], [4, 4]]) {
      expect(collectFixedEventsForState({ ...state, year: year!, month: month! }).some(e => e.id === FEEDBACK_EVENT_ID)).toBe(false);
    }
    const queued = { ...state, eventQueue: [createEventQueueItem(createFeedbackEvent(), 1)] };
    const skipped = dispatchAction(queued, "resolve-event", { eventId: FEEDBACK_EVENT_ID, eventChoiceId: "midterm-message-skip" });
    expect(skipped.eventQueue).toHaveLength(0);
    expect(skipped.eventHistory.at(-1)?.stages).toHaveLength(1);
    expect(skipped.player).toEqual(queued.player);
    expect(skipped.actionState).toEqual(queued.actionState);
    expect(collectFixedEventsForState(skipped).some(e => e.id === FEEDBACK_EVENT_ID)).toBe(false);
  });

  it("is one scene, optional, expires this month and never auto-submits", () => {
    const event = createEventQueueItem(createFeedbackEvent(), 1);
    expect(event.deadlineMonths).toBe(0);
    expect(event.choices.every(c => !c.effects.enqueueEvents)).toBe(true);
    expect(isEventBlocking(playing(), event)).toBe(false);
    expect(canAutoResolveLinearEvent(playing(), event)).toBe(false);
    const other = { ...event, id: "unrelated", expiresAtMonthEnd: undefined };
    expect(decrementEventQueueDeadlines([event, other])).toEqual([other]);
  });

  it("keeps prior rules and official replays unchanged", () => {
    withGameplayRuleset("20261026-r56", () => {
      expect(collectFixedEventsForState(playing()).some(e => e.id === FEEDBACK_EVENT_ID)).toBe(false);
      expect(buildFutureTodoPreviewItems({ ...playing(), month: 3, totalMonths: 27 }).some(e => e.title === "游玩感想")).toBe(false);
    });
    expect(buildFutureTodoPreviewItems({ ...playing(), month: 3, totalMonths: 27 }).some(e => e.title === "游玩感想" && e.monthsLater === 1)).toBe(true);
  });
});
