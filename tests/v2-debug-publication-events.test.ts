import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

function startState(papers: Paper[] = []): GameState {
  const state = createStartedGameState("normal");
  return {
    ...state,
    year: 1,
    month: 6,
    totalMonths: 6,
    eventQueue: [],
    availableRandomEvents: [],
    pendingRandomEvents: [],
    illnessProbability: 0,
    player: { ...state.player, san: 15, money: 30 },
    advisorProgressState: { ...state.advisorProgressState, funding: 100 },
    papers,
    selectedPaperId: papers[0]?.id ?? null,
  };
}

function reviewingPaper(id: string): Paper {
  return prepareConferenceSubmission({
    ...createDraftPaper(3, 0, () => 0),
    id,
    title: id,
    idea: 100,
    experiment: 100,
    writing: 100,
  }, "A", 3, 1);
}

function trigger(state: GameState, eventId: string): GameState {
  return dispatchAction(state, "debug-trigger-event", { eventId });
}

function choose(state: GameState, chainId: string, choiceId?: string): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId === chainId)!;
  expect(event).toBeDefined();
  const choice = choiceId ? event.choices.find((entry) => entry.id === choiceId)! : event.choices[0]!;
  expect(choice).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

describe("debug publication shortcuts", () => {
  it.each([0, 1, 2])("queues independent same-venue results while the first is at scene %i", (advancedScenes) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = startState([reviewingPaper("first"), reviewingPaper("second")]);
    let state = trigger(initial, "review-result");
    expect(state.eventQueue.filter((event) => event.source === "review")).toHaveLength(1);
    expect(state.papers[1]).toEqual(initial.papers[1]);
    for (let scene = 0; scene < advancedScenes; scene += 1) {
      state = choose(state, "paper-review-result-first");
    }
    const firstEvent = state.eventQueue.find((event) => event.chainId === "paper-review-result-first")!;
    const firstPaper = state.papers[0];
    state = trigger(state, "review-result");
    const results = state.eventQueue.filter((event) => event.source === "review");
    expect(results).toHaveLength(2);
    expect(results.every((event) => event.paperReviewPresentation?.conferenceName === "CVPR")).toBe(true);
    expect(new Set(results.map((event) => event.id)).size).toBe(2);
    expect(new Set(results.map((event) => event.chainId)).size).toBe(2);
    expect(results.find((event) => event.chainId === firstEvent.chainId)).toEqual(firstEvent);
    expect(state.papers[0]).toEqual(firstPaper);
    expect(state.papers.map((paper) => paper.acceptedOrder)).toEqual([1, 2]);
    expect(state.papers.every((paper) => paper.status === "reviewing")).toBe(true);
    expect(state.externalPublications).toEqual(initial.externalPublications);
    expect(state.advisorProgressState.funding).toBe(100);
    expect(state.eventQueue.some((event) => event.conferencePreview)).toBe(false);
  });

  it("appends unique result papers with full slots without replacing drafts or queued decisions", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = startState([createDraftPaper(6, 0, () => 0)]);
    initial.paperSlotsUnlocked = 1;
    let state = initial;
    for (let count = 0; count < 3; count += 1) state = trigger(state, "review-result");
    expect(state.papers).toHaveLength(4);
    expect(state.papers[0]).toEqual(initial.papers[0]);
    expect(new Set(state.papers.map((paper) => paper.id)).size).toBe(4);
    const results = state.eventQueue.filter((event) => event.source === "review");
    expect(results).toHaveLength(3);
    expect(new Set(results.map((event) => event.id)).size).toBe(3);
    expect(new Set(results.map((event) => event.paperReviewPresentation?.conferenceName)).size).toBe(1);
    expect(state.externalPublications).toEqual(initial.externalPublications);
    expect(state.paperSlotsUnlocked).toBe(1);
    expect(state.totalMonths).toBe(6);
  });

  it("queues merged attendance on result confirmation with a three-month decision deadline", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = trigger(trigger(startState([reviewingPaper("first"), reviewingPaper("second")]), "review-result"), "review-result");
    for (const paperId of ["first", "second"]) {
      const chainId = `paper-review-result-${paperId}`;
      state = choose(choose(state, chainId), chainId);
      expect(state.papers.find((paper) => paper.id === paperId)?.status).toBe("reviewing");
      expect(state.externalPublications.some((paper) => paper.id === paperId)).toBe(false);
      state = choose(state, chainId);
      expect(state.externalPublications.find((paper) => paper.id === paperId)).toMatchObject({
        status: "published", acceptedTotalMonths: 6, conferenceAvailableAtTotalMonths: 9, conferenceHandled: false,
      });
      const attendance = state.eventQueue.filter((event) => event.conferencePreview);
      expect(attendance).toHaveLength(1);
      expect(attendance[0]).toMatchObject({ title: "CVPR参会", deadlineMonths: 3 });
      expect(attendance[0]?.conferencePreview?.context.paperIds)
        .toEqual(paperId === "first" ? ["first"] : ["first", "second"]);
    }
    for (let month = 7; month <= 9; month += 1) {
      state = dispatchAction(state, "force-next-month");
      expect(state.totalMonths).toBe(month);
      const conferences = state.eventQueue.filter((event) => event.conferencePreview);
      expect(conferences).toHaveLength(1);
      expect(conferences[0]?.deadlineMonths).toBe(9 - month);
      expect(state.eventQueue.some((event) => event.chainId.endsWith("-activity"))).toBe(false);
      expect(state.externalPublications.every((paper) => paper.conferenceHandled === false)).toBe(true);
    }
    expect(state.eventQueue.find((event) => event.conferencePreview)?.conferencePreview?.context.paperIds)
      .toEqual(["first", "second"]);
  });

  it("opens an independent activity chain without publishing or paying and supports scene replay", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = startState([createDraftPaper(6, 0, () => 0)]);
    let state = trigger(initial, "conference-activity");
    const activity = state.eventQueue.find((event) => event.chainId.endsWith("-activity"))!;
    expect(activity.stage).toBe("act1");
    expect(activity.choices[0]?.label).toBe("继续");
    expect(activity.replayContext?.debugEventId).toBe("conference-activity");
    expect(state.eventQueue.some((event) => event.conferencePreview)).toBe(false);
    expect(state.papers).toEqual(initial.papers);
    expect(state.externalPublications).toEqual(initial.externalPublications);
    expect(state.player).toEqual(initial.player);
    state = choose(state, activity.chainId);
    state = choose(state, activity.chainId, "tour-local");
    expect(state.player.san).toBe(15);
    expect(state.eventQueue.find((event) => event.chainId === activity.chainId)?.stage).toBe("result");
    state = dispatchAction(state, "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    const result = state.eventQueue.find((event) => event.chainId === activity.chainId)!;
    state = dispatchAction(state, "debug-replay-event", { eventId: result.id, eventHistoryIndex: 1 });
    expect(state.eventQueue.find((event) => event.chainId === activity.chainId)?.stage).toBe("act2");
    state = choose(state, activity.chainId, "tour-local");
    state = choose(state, activity.chainId);
    expect(state.player.san).toBe(20);
    expect(state.player.money).toBe(initial.player.money);
    expect(state.advisorProgressState.funding).toBe(initial.advisorProgressState.funding);
    expect(state.eventCounters.meetingCount).toBe(initial.eventCounters.meetingCount);
    expect(state.papers).toEqual(initial.papers);
    expect(state.externalPublications).toEqual(initial.externalPublications);
    expect(state.eventHistory.find((event) => event.chainId === activity.chainId)?.stages).toHaveLength(3);
  });

  it("keeps the original attendance shortcut separate from the activity shortcut", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = startState();
    let state = trigger(initial, "conference");
    const attendance = state.eventQueue.find((event) => event.conferencePreview)!;
    expect(attendance.stage).toBe("act1");
    expect(state.externalPublications).toHaveLength(1);
    state = trigger(state, "conference-activity");
    expect(state.eventQueue.find((event) => event.id === attendance.id)).toEqual(attendance);
    expect(state.eventQueue.filter((event) => event.chainId.endsWith("-activity"))).toHaveLength(1);
    expect(state.externalPublications).toHaveLength(1);
    expect(state.player.money).toBe(initial.player.money);
    expect(state.advisorProgressState.funding).toBe(initial.advisorProgressState.funding);
    state = choose(state, attendance.chainId);
    expect(state.eventQueue.find((event) => event.chainId === attendance.chainId)?.choices.map((choice) => choice.id))
      .toEqual(["self", "advisor", "proxy"]);
  });
});
