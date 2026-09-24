import { describe, expect, it, vi } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { renderApp } from "../src/app/v2-render";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { enqueuePendingEvents } from "../src/core/v2-event-enqueue";

function startGame() {
  return dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
}

function resolveFirstChoice(state: ReturnType<typeof startGame>, chainId = "teachers-day") {
  const event = state.eventQueue.find((entry) => entry.chainId === chainId);
  const choice = event?.choices[0];
  if (!event || !choice) throw new Error("debug event scene is missing");
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

describe("debug event scene replay", () => {
  it("rerolls random outcomes when replaying a debug event", () => {
    let state = dispatchAction(startGame(), "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.01);

    state = dispatchAction(state, "debug-trigger-event", { eventId: "random-10" });
    const intro = state.eventQueue.find((event) => event.chainId === "random-10");
    if (!intro) throw new Error("debug random event is missing");
    state = dispatchAction(state, "resolve-event", {
      eventId: intro.id,
      eventChoiceId: intro.choices[0]?.id,
    });
    const originalDecision = state.eventQueue.find((event) => event.chainId === "random-10");
    if (!originalDecision) throw new Error("original random decision is missing");
    const originalOutcomes = originalDecision.choices.map((choice) => choice.outcome);

    state = dispatchAction(state, "resolve-event", {
      eventId: originalDecision.id,
      eventChoiceId: originalDecision.choices[0]?.id,
    });
    const result = state.eventQueue.find((event) => event.chainId === "random-10");
    if (!result) throw new Error("random result is missing");

    random.mockReturnValue(0.99);
    const replayed = dispatchAction(state, "debug-replay-event", { eventId: result.id, eventHistoryIndex: 1 });
    const rerolledDecision = replayed.eventQueue.find((event) => event.chainId === "random-10");
    expect(rerolledDecision?.choices.map((choice) => choice.outcome)).not.toEqual(originalOutcomes);
    random.mockRestore();
  });

  it("reopens an earlier scene with active choices and keeps ordinary history read-only", () => {
    let state = dispatchAction(startGame(), "debug-trigger-event", { eventId: "teachers-day" });
    state = dispatchAction(state, "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    expect(state.eventQueue.find((event) => event.chainId === "teachers-day")?.replayContext).toBeDefined();

    state = resolveFirstChoice(state);
    state = resolveFirstChoice(state);
    const thirdScene = state.eventQueue.find((event) => event.chainId === "teachers-day");
    if (!thirdScene) throw new Error("third debug scene is missing");
    expect(thirdScene.history).toHaveLength(2);

    const historicalHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: thirdScene.id,
      activeEventHistoryIndex: 1,
    });
    const historicalButtons = historicalHtml.match(/<div class="event-content-buttons[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(historicalButtons).toContain('data-action="debug-replay-event"');
    expect(historicalButtons).toContain(`data-event-id="${thirdScene.id}"`);
    expect(historicalButtons).toContain('data-event-choice-id=');
    expect(historicalButtons).not.toContain("disabled");

    const replayed = dispatchAction(state, "debug-replay-event", {
      eventId: thirdScene.id,
      eventHistoryIndex: 1,
    });
    const firstScene = replayed.eventQueue.find((event) => event.chainId === "teachers-day");
    expect(firstScene?.stage).toBe("act2");
    expect(firstScene?.history).toHaveLength(1);
    expect(firstScene?.choices[1]).toBeDefined();

    const alternateChoice = firstScene!.choices[1]!;
    const branched = dispatchAction(replayed, "resolve-event", {
      eventId: firstScene!.id,
      eventChoiceId: alternateChoice.id,
    });
    expect(branched.eventQueue.find((event) => event.chainId === "teachers-day")?.history?.[1]?.selectedChoiceId)
      .toBe(alternateChoice.id);

    const selectedChoiceId = thirdScene.history?.[1]?.selectedChoiceId;
    const replayedAndResolved = dispatchAction(state, "debug-replay-event", {
      eventId: thirdScene.id,
      eventHistoryIndex: 1,
      eventChoiceId: selectedChoiceId,
    });
    expect(replayedAndResolved.eventQueue.find((event) => event.chainId === "teachers-day")?.stage).toBe("result");

    const ordinary = {
      ...state,
      debugEventReplayEnabled: false,
    };
    const unchanged = dispatchAction(ordinary, "debug-replay-event", { eventHistoryIndex: 0 });
    expect(unchanged).toEqual(ordinary);
  });

  it("marks ordinary pending chains only when the debug switch is enabled and locks them after confirmation", () => {
    let state = startGame();
    state = { ...state, eventQueue: [] };
    state = dispatchAction(state, "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    state = enqueuePendingEvents(state, [createTeachersDayEvent(state, () => 0)]).nextState;
    expect(state.eventQueue.find((event) => event.chainId === "teachers-day")?.replayContext).toBeDefined();

    state = resolveFirstChoice(state);
    state = resolveFirstChoice(state);
    const thirdScene = state.eventQueue.find((event) => event.chainId === "teachers-day");
    if (!thirdScene) throw new Error("ordinary event third scene is missing");
    const replayed = dispatchAction(state, "debug-replay-event", { eventHistoryIndex: 1 });
    expect(replayed.eventQueue.find((event) => event.chainId === "teachers-day")?.stage).toBe("act2");

    const choiceEvent = replayed.eventQueue.find((event) => event.chainId === "teachers-day");
    if (!choiceEvent) throw new Error("ordinary event choice scene is missing");
    state = dispatchAction(replayed, "resolve-event", {
      eventId: choiceEvent.id,
      eventChoiceId: choiceEvent.choices[0]?.id,
    });
    const resultEvent = state.eventQueue.find((event) => event.chainId === "teachers-day");
    if (!resultEvent) throw new Error("ordinary event result scene is missing");
    state = dispatchAction(state, "resolve-event", {
      eventId: resultEvent.id,
      eventChoiceId: resultEvent.choices[0]?.id,
    });
    expect(state.eventQueue.some((event) => event.chainId === "teachers-day")).toBe(false);
    expect(dispatchAction(state, "debug-replay-event", { eventHistoryIndex: 0 })).toEqual(state);
    const completedEvent = state.eventHistory.at(-1);
    if (!completedEvent) throw new Error("ordinary event history is missing");
    const completedHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventHistoryId: completedEvent.id,
      activeEventHistoryIndex: 0,
    });
    expect(completedHtml).not.toContain('data-action="debug-replay-event"');
  });

  it("adjusts the monthly action-point limit through debug actions", () => {
    let state = startGame();
    state = dispatchAction(state, "debug-adjust-action-points", { delta: 1 });
    expect(state.actionState).toMatchObject({ limit: 2, used: 0 });
    state = { ...state, actionState: { ...state.actionState, used: 1 } };
    state = dispatchAction(state, "debug-adjust-action-points", { delta: -1 });
    expect(state.actionState).toMatchObject({ limit: 1, used: 1 });
  });

  it("can opt into replay after the opening event was already queued", () => {
    let state = startGame();
    const opening = state.eventQueue.find((event) => event.chainId === "before-grad-school");
    expect(opening?.replayContext).toBeUndefined();

    state = dispatchAction(state, "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    const markedOpening = state.eventQueue.find((event) => event.chainId === "before-grad-school");
    expect(state.debugEventReplayEnabled).toBe(true);
    expect(markedOpening?.replayContext).toBeDefined();

    state = dispatchAction(state, "resolve-event", {
      eventId: markedOpening?.id,
      eventChoiceId: "before-grad-school-reroll-name",
    });
    expect(state.eventQueue.find((event) => event.chainId === "before-grad-school")?.replayContext).toBeDefined();

    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue.find((event) => event.chainId === "before-grad-school")?.id,
      eventChoiceId: "before-grad-school-open-advisor-info",
    });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue.find((event) => event.chainId === "before-grad-school")?.id,
      eventChoiceId: "before-grad-school-confirm",
    });
    const replayedAndResolved = dispatchAction(state, "debug-replay-event", {
      eventHistoryIndex: 1,
      eventChoiceId: "before-grad-school-confirm",
    });
    expect(replayedAndResolved.eventQueue.find((event) => event.chainId === "before-grad-school")?.stage).toBe("result");
  });
});
