import * as gameRandomSource from "../src/core/v2-game-random";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
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
  it("exposes the real journal acceptance shortcut in the paper group", () => {
    const paperGroup = DEBUG_EVENT_GROUPS.find((group) => group.title === "论文相关")!;
    expect(paperGroup.buttons).toContainEqual({ id: "journal-accepted", label: "期刊中稿" });
  });

  it.each(["self", "advisor"] as const)("runs the journal acceptance shortcut through all three scenes and %s payment", (mode) => {
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0.99);
    const initial = startState();
    if (mode === "advisor") initial.selectedAdvisorName = "导师";
    let state = trigger(initial, "journal-accepted");
    const paper = state.externalPublications.find((entry) => entry.journalTarget === "pami")!;
    expect(paper).toMatchObject({ status: "published", target: null, journalTarget: "pami", nonFirstAuthor: false });
    expect(paper.publication?.journalTarget).toBe("pami");
    const root = state.eventQueue.find((event) => event.journalFeePreview?.paperId === paper.id)!;
    expect(root).toMatchObject({ stage: "act1", title: "期刊中稿", source: "fixed", blocking: true,
      journalFeePreview: { paperId: paper.id, stage: "act1" } });
    expect(root.choices.map((choice) => choice.id)).toEqual(["continue"]);

    state = choose(state, root.chainId, "continue");
    const decision = state.eventQueue.find((event) => event.chainId === root.chainId)!;
    expect(decision).toMatchObject({ stage: "act2", journalFeePreview: { paperId: paper.id, stage: "act2" } });
    expect(decision.choices.map((choice) => choice.id)).toEqual(["self", "advisor"]);
    if (mode === "advisor") expect(decision.choices.find((choice) => choice.id === "advisor")?.disabledReason).toBeUndefined();

    state = choose(state, root.chainId, mode);
    const confirmation = state.eventQueue.find((event) => event.chainId === root.chainId)!;
    expect(confirmation).toMatchObject({ stage: "act3", journalFeePreview: { paperId: paper.id, stage: "act3", paymentMode: mode } });
    expect(confirmation.choices.map((choice) => choice.id)).toEqual(["confirm"]);
    expect(state.advisorProgressState.paidJournalPaperIds ?? []).not.toContain(paper.id);

    state = choose(state, root.chainId, "confirm");
    expect(state.advisorProgressState.paidJournalPaperIds).toContain(paper.id);
    expect(state.eventQueue.some((event) => event.journalFeePreview?.paperId === paper.id)).toBe(false);
    expect(state.player.money).toBe(mode === "self" ? initial.player.money - 5 : initial.player.money);
    expect(state.advisorProgressState.funding).toBe(mode === "advisor" ? initial.advisorProgressState.funding - 5 : initial.advisorProgressState.funding);
  });

  it("deduplicates repeated journal acceptance triggers while the real fee event is pending", () => {
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0.99);
    const initial = startState();
    const once = trigger(initial, "journal-accepted");
    const twice = trigger(once, "journal-accepted");
    expect(twice.externalPublications).toHaveLength(once.externalPublications.length);
    expect(twice.eventQueue.filter((event) => event.journalFeePreview)).toHaveLength(1);
    expect(twice.log).toEqual(once.log);
    expect(twice.eventQueue[0]).toEqual(once.eventQueue[0]);
  });

  it.each([["a", "A", 5], ["b", "B", 4], ["c", "C", 3]] as const)("opens grade %s activities with the matching option pool", (suffix, grade, count) => {
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0.99);
    const initial = startState();
    initial.player.social = 6;
    const state = trigger(initial, `conference-activity-${suffix}`);
    const event = state.eventQueue.find((entry) => entry.conferenceActivityPreview)!;
    expect(event.conferenceActivityPreview?.context.grade).toBe(grade);
    expect(event.replayContext?.debugEventId).toBe(`conference-activity-${suffix}`);
    const opened = choose(state, event.chainId);
    const choices = opened.eventQueue.find((entry) => entry.chainId === event.chainId)!.choices;
    expect(choices).toHaveLength(count);
    expect(choices.some((choice) => choice.id === "big-bull-coop")).toBe(grade !== "C");
    expect(state.player).toEqual(initial.player);
  });

  it("returns to the new decision menu when replay redraws the previously selected gift", () => {
    const random = vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
    let state = trigger({ ...startState(), debugEventReplayEnabled: true }, "teachers-day");
    state = choose(state, "teachers-day");
    const decision = state.eventQueue.find((event) => event.chainId === "teachers-day")!;
    const gift = decision.choices.find((choice) => choice.label === "送茶叶")!;
    expect(gift).toBeDefined();
    state = choose(state, "teachers-day", gift.id);
    const result = state.eventQueue.find((event) => event.chainId === "teachers-day")!;
    expect(result.stage).toBe("result");
    const before = { ...state.player };
    random.mockReturnValue(0.99);
    state = dispatchAction(state, "debug-replay-event", {
      eventId: result.id, eventHistoryIndex: 1, eventChoiceId: gift.id,
    });
    const replayed = state.eventQueue.find((event) => event.chainId === "teachers-day")!;
    expect(replayed.stage).toBe("act2");
    expect(replayed.choices.some((choice) => choice.label === "送鲜花")).toBe(true);
    expect(replayed.choices.some((choice) => choice.id === gift.id)).toBe(false);
    expect(state.player).toEqual(before);
    state = choose(state, "teachers-day", replayed.choices.find((choice) => choice.label === "送鲜花")!.id);
    expect(state.eventQueue.find((event) => event.chainId === "teachers-day")?.stage).toBe("result");
    expect(state.player).toEqual(before);
  });

  it.each([0, 1, 2])("queues independent same-venue results while the first is at scene %i", (advancedScenes) => {
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
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
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
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
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
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
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
    const initial = startState([createDraftPaper(6, 0, () => 0)]);
    let state = trigger(initial, "conference-activity-c");
    const activity = state.eventQueue.find((event) => event.chainId.endsWith("-activity"))!;
    expect(activity.stage).toBe("act1");
    expect(activity.choices[0]?.label).toBe("继续");
    expect(activity.replayContext?.debugEventId).toBe("conference-activity-c");
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
    const region = activity.conferenceActivityPreview!.context.region!;
    expect(state.player.san).toBe(Math.min(initial.sanCap, 15 + { domestic: 4, asia: 5, west: 6 }[region]));
    expect(state.player.money).toBe(initial.player.money);
    expect(state.advisorProgressState.funding).toBe(initial.advisorProgressState.funding);
    expect(state.eventCounters.meetingCount).toBe(initial.eventCounters.meetingCount);
    expect(state.papers).toEqual(initial.papers);
    expect(state.externalPublications).toEqual(initial.externalPublications);
    expect(state.eventHistory.find((event) => event.chainId === activity.chainId)?.stages).toHaveLength(3);
  });

  it.each(["a", "b", "c"])("preserves grade %s menus, rolls and contacts when replaying act2 after a JSON roundtrip", (grade) => {
    const random = vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0.99);
    const initial = startState();
    initial.player.social = 6;
    let state = trigger(initial, `conference-activity-${grade}`);
    const activity = state.eventQueue.find((event) => event.chainId.endsWith("-activity"))!;
    state = choose(state, activity.chainId);
    const menu = state.eventQueue.find((event) => event.chainId === activity.chainId)!;
    const selectedId = grade === "c" ? menu.choices[0]!.id : "big-bull-coop";
    state = choose(state, activity.chainId, selectedId);
    state = dispatchAction(state, "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    state = JSON.parse(JSON.stringify(state)) as GameState;
    const before = structuredClone(state);
    const originalResult = state.eventQueue.find((event) => event.chainId === activity.chainId)!;
    expect(originalResult.history?.[1]?.selectedChoiceId).toBe(selectedId);
    expect(menu.conferenceActivityPreview?.contacts?.bigBull?.id).toBeTruthy();
    random.mockClear().mockReturnValue(0);

    for (const withChoice of [false, true, false, true]) {
      const current = state.eventQueue.find((event) => event.chainId === activity.chainId)!;
      state = dispatchAction(state, "debug-replay-event", {
        eventId: current.id,
        eventHistoryIndex: 1,
        ...(withChoice ? { eventChoiceId: selectedId } : {}),
      });
      if (!withChoice) {
        const replayed = state.eventQueue.find((event) => event.chainId === activity.chainId)!;
        expect(replayed.stage).toBe("act2");
        expect(replayed.choices).toEqual(menu.choices);
        expect(replayed.conferenceActivityPreview).toEqual(menu.conferenceActivityPreview);
        expect(replayed.history).toEqual(originalResult.history?.slice(0, 1));
        expect(replayed.queueOrder).toBe(originalResult.queueOrder);
        state = choose(state, activity.chainId, selectedId);
      }
      const replayedResult = state.eventQueue.find((event) => event.chainId === activity.chainId)!;
      expect(replayedResult.stage).toBe("result");
      expect(replayedResult.description).toBe(originalResult.description);
      expect(replayedResult.choices).toEqual(originalResult.choices);
      expect(replayedResult.conferenceActivityPreview).toEqual(originalResult.conferenceActivityPreview);
      expect(replayedResult.history?.map((scene) => scene.selectedChoiceId)).toEqual(["continue", selectedId]);
      expect(replayedResult.history?.[1]?.choices).toEqual(originalResult.history?.[1]?.choices);
      expect(replayedResult.history?.[1]?.replayEvent?.conferenceActivityPreview).toEqual(menu.conferenceActivityPreview);
      expect(replayedResult.replayContext).toEqual(originalResult.replayContext);
      expect(state.player).toEqual(before.player);
      expect(state.conferenceEncounterState).toEqual(before.conferenceEncounterState);
      expect(state.eventHistory).toEqual(before.eventHistory);
      expect(random).not.toHaveBeenCalled();
      state = JSON.parse(JSON.stringify(state)) as GameState;
    }
    expect(before.eventQueue.find((event) => event.chainId === activity.chainId)).toEqual(originalResult);
  });

  it.each(["replay-choice", "restore-then-continue"])("rerolls only on act1 Continue via %s", (route) => {
    const random = vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
    let state = trigger({ ...startState(), debugEventReplayEnabled: true }, "conference-activity-c");
    const root = state.eventQueue.find((event) => event.chainId.endsWith("-activity"))!;
    random.mockClear();
    state = choose(state, root.chainId);
    expect(random).not.toHaveBeenCalled();
    const menu = state.eventQueue.find((event) => event.chainId === root.chainId)!;
    state = choose(state, root.chainId, menu.choices[0]!.id);
    const result = state.eventQueue.find((event) => event.chainId === root.chainId)!;
    const before = structuredClone(state);
    random.mockClear().mockReturnValue(0.99);

    state = dispatchAction(state, "debug-replay-event", {
      eventId: result.id,
      eventHistoryIndex: 0,
      ...(route === "replay-choice" ? { eventChoiceId: "continue" } : {}),
    });
    if (route === "restore-then-continue") {
      const restored = state.eventQueue.find((event) => event.chainId === root.chainId)!;
      expect(restored.stage).toBe("act1");
      expect(restored.history).toEqual([]);
      expect(restored.choices).toEqual(root.choices);
      expect(restored.conferenceActivityPreview).toEqual(root.conferenceActivityPreview);
      expect(random).not.toHaveBeenCalled();
      state = JSON.parse(JSON.stringify(state)) as GameState;
      state = dispatchAction(state, "resolve-event", { eventId: restored.id, eventChoiceId: "invalid-choice" });
      expect(state.eventQueue.find((event) => event.chainId === root.chainId)?.conferenceActivityPreview)
        .toEqual(restored.conferenceActivityPreview);
      expect(state.eventQueue.find((event) => event.chainId === root.chainId)?.choices).toEqual(restored.choices);
      random.mockClear();
      state = choose(state, root.chainId, "continue");
    }

    const rerolled = state.eventQueue.find((event) => event.chainId === root.chainId)!;
    expect(rerolled.stage).toBe("act2");
    expect(random).toHaveBeenCalled();
    expect(rerolled.choices.map((choice) => choice.id)).not.toEqual(menu.choices.map((choice) => choice.id));
    expect(rerolled.conferenceActivityPreview?.rolls).not.toEqual(menu.conferenceActivityPreview?.rolls);
    expect(rerolled.conferenceActivityPreview?.context).toEqual(menu.conferenceActivityPreview?.context);
    expect(rerolled.history).toHaveLength(1);
    expect(rerolled.history?.[0]?.selectedChoiceId).toBe("continue");
    expect(rerolled.history?.[0]?.replayEvent?.conferenceActivityPreview).toEqual(rerolled.conferenceActivityPreview);
    expect(rerolled.replayContext?.rootEvent.conferenceActivityPreview).toEqual(rerolled.conferenceActivityPreview);
    expect(state.player).toEqual(before.player);
    expect(state.conferenceEncounterState).toEqual(before.conferenceEncounterState);
    expect(state.eventHistory).toEqual(before.eventHistory);

    random.mockClear().mockReturnValue(0);
    const selectedId = rerolled.choices[0]!.id;
    state = choose(state, root.chainId, selectedId);
    const rerolledResult = state.eventQueue.find((event) => event.chainId === root.chainId)!;
    state = dispatchAction(state, "debug-replay-event", {
      eventId: rerolledResult.id, eventHistoryIndex: 1, eventChoiceId: selectedId,
    });
    expect(state.eventQueue.find((event) => event.chainId === root.chainId)?.conferenceActivityPreview)
      .toEqual(rerolledResult.conferenceActivityPreview);
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps the original attendance shortcut separate from the activity shortcut", () => {
    vi.spyOn(gameRandomSource, "gameRandom").mockReturnValue(0);
    const initial = startState();
    let state = trigger(initial, "conference");
    const attendance = state.eventQueue.find((event) => event.conferencePreview)!;
    expect(attendance.stage).toBe("act1");
    expect(state.externalPublications).toHaveLength(1);
    state = trigger(state, "conference-activity-c");
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
