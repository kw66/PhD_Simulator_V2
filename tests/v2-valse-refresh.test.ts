import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyQueuedEventEffects, getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCcigEvent } from "../src/core/v2-fixed-events-ccig-decision-events";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

function choose(state: GameState, label: string): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId === "ccig-y3-m9-activity")
    ?? state.eventQueue.find((entry) => entry.chainId === "ccig-y3-m9");
  expect(event).toBeDefined();
  if (!event) throw new Error("Expected a pending VALSE event");
  const choice = event.choices.find((entry) => entry.label === label)!;
  expect(choice).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

function activityState(stage: "act1" | "act2" = "act2", mode = "自费参会"): GameState {
  vi.spyOn(Math, "random").mockReturnValue(0.4);
  const initial = createInitialState();
  let state: GameState = {
    ...initial, phase: "playing", degree: "phd", maxMonths: 70,
    year: 3, month: 9, totalMonths: 33, selectedAdvisorName: "测试导师",
    player: { ...initial.player, money: 20, favor: 6, san: 10 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 20 },
  };
  state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), 7)] };
  state = choose(choose(choose(state, "继续"), mode), "确定");
  return stage === "act1" ? state : choose(state, "继续");
}

function publishedPaper(id = "new-paper", score = 50): Paper {
  return {
    ...createDraftPaper(33, 0, () => 0), id, title: `论文-${id}`,
    status: "published", target: "A", conferenceHandled: true,
    publication: { citations: 0, effectiveScore: score, citationDebuffMultiplier: 1, promotionMultiplier: 1 },
  };
}

describe("VALSE activity live refresh", () => {
  it.each([
    ["act1", "papers"], ["act1", "externalPublications"],
    ["act2", "papers"], ["act2", "externalPublications"],
  ] as const)("refreshes %s after a first-author A paper appears in %s without changing state or consuming RNG", (stage, collection) => {
    const pending = activityState(stage);
    const paper = publishedPaper();
    const state = { ...pending, [collection]: [paper] };
    const before = structuredClone(state);
    const random = vi.mocked(Math.random).mockClear();
    const refreshed = refreshPendingEventDecisions(state);
    const event = refreshed.eventQueue[0]!;
    expect(event.description).toContain(paper.title);
    expect(event.description).not.toContain("这次便没有报名海报展示");
    const decision = stage === "act1" ? event.choices[0]!.effects.enqueueEvents![0]! : event;
    expect(decision.choices.find((choice) => choice.label === "海报展示")?.effects.fixedEventResolution).toMatchObject({
      kind: "ccig-activity-poster", ccigPaperId: paper.id, ccigCalendar: { year: 3, month: 9 },
    });
    expect(event).toMatchObject({
      id: before.eventQueue[0]!.id, chainId: before.eventQueue[0]!.chainId,
      queueOrder: before.eventQueue[0]!.queueOrder, deadlineMonths: before.eventQueue[0]!.deadlineMonths,
    });
    expect(event.history).toEqual(before.eventQueue[0]!.history);
    expect({ ...refreshed, eventQueue: state.eventQueue }).toEqual(before);
    expect(state).toEqual(before);
    expect(refreshPendingEventDecisions(JSON.parse(JSON.stringify(refreshed)))).toEqual(refreshed);
    expect(random).not.toHaveBeenCalled();
  });

  it("updates the already-open decision through the real paper publication action", () => {
    let state = activityState();
    const original = state.eventQueue[0]!;
    expect(original.description).toContain("会前报名时，你没有适合展示的论文，这次便没有报名海报展示");
    expect(original.choices.some((choice) => choice.label === "海报展示")).toBe(false);
    state = dispatchAction(state, "debug-add-paper", { debugPaperTarget: "A", debugPaperAuthorship: "first" });
    const paper = state.externalPublications[0]!;
    expect(state.eventQueue[0]!.id).toBe(original.id);
    expect(state.eventQueue[0]!.description).toContain(paper.title);
    expect(state.eventQueue[0]!.description).not.toContain("这次便没有报名海报展示");
    expect(state.eventQueue[0]!.choices.some((choice) => choice.label === "海报展示")).toBe(true);
    state = choose(choose(state, "海报展示"), "确定");
    expect(state.externalPublications[0]!.publication!.promotionMultiplier).toBe(1.25);
    const history = state.eventHistory.find((entry) => entry.chainId === original.chainId)!;
    expect(history.stages).toHaveLength(3);
    expect(history.stages[1]!.description).toContain(paper.title);
    expect(history.stages[1]!.selectedChoiceId).toBe("ccig-activity-poster-y3-m9");
    expect(history.stages[2]!.description).toContain(paper.title);
  });

  it("refreshes both ways with unchanged eligibility rules and stable remaining choice IDs", () => {
    let state = activityState();
    const originalChoices = state.eventQueue[0]!.choices;
    const eligible = publishedPaper();
    const ineligible: Paper[] = [
      { ...publishedPaper("coauthor", 100), nonFirstAuthor: true },
      { ...publishedPaper("draft", 100), status: "draft" },
      { ...publishedPaper("grade-b", 100), target: "B" },
      { ...publishedPaper("no-publication", 100), publication: null },
    ];
    state = refreshPendingEventDecisions({ ...state, papers: [...ineligible, eligible] });
    expect(state.eventQueue[0]!.description).toContain(eligible.title);
    expect(state.eventQueue[0]!.choices.filter((choice) => choice.label !== "海报展示")).toEqual(originalChoices);
    state = refreshPendingEventDecisions({ ...state, papers: ineligible });
    expect(state.eventQueue[0]!.choices).toEqual(originalChoices);
    expect(state.eventQueue[0]!.description).not.toContain(eligible.title);
    state = refreshPendingEventDecisions({ ...state, externalPublications: [eligible, publishedPaper("better", 90)] });
    expect(state.eventQueue[0]!.choices.find((choice) => choice.label === "海报展示")?.effects.fixedEventResolution?.ccigPaperId).toBe("better");
  });

  it.each(["自费参会", "请导师报销"])("preserves %s, event calendar, settled attendance and historical stages across refresh", (mode) => {
    const resolveActivity = (current: GameState, label: string): GameState => {
      const event = getResolvableQueuedEvent(current, current.eventQueue[0]!);
      return applyQueuedEventEffects(current, event, event.choices.find((choice) => choice.label === label)!.id, {
        evaluateImmediateEndings: (resolved) => resolved,
        runPostQueuePipeline: (resolved) => resolved,
      });
    };
    let state = activityState("act1", mode);
    const attendanceHistory = structuredClone(state.eventHistory);
    state = dispatchAction(state, "debug-shift-month", { delta: 12 });
    const paidPlayer = structuredClone(state.player);
    const paidFunding = state.advisorProgressState.funding;
    const shiftedCalendar = { year: state.year, month: state.month, totalMonths: state.totalMonths };
    state = refreshPendingEventDecisions({ ...state, papers: [publishedPaper()] });
    expect(state.eventQueue[0]!.description).toContain(mode === "请导师报销" ? "报销手续办妥" : "行程安排妥当");
    expect(state.eventQueue[0]!.description).toContain("VALSE 2026");
    expect(state.eventQueue[0]!.description).toContain("武汉");
    state = resolveActivity(state, "继续");
    expect(state.eventQueue[0]!.description).toContain("VALSE 2026");
    expect(state.eventQueue[0]!.choices.map((choice) => choice.id).every((id) => id.endsWith("y3-m9"))).toBe(true);
    state = resolveActivity(resolveActivity(state, "认真听报告"), "确定");
    expect(state).toMatchObject(shiftedCalendar);
    expect(state.player).toEqual(paidPlayer);
    expect(state.advisorProgressState.funding).toBe(paidFunding);
    expect(state.eventCounters).toMatchObject({ meetingCount: 1, domesticMeetingCount: 1 });
    expect(state.eventHistory[0]).toEqual(attendanceHistory[0]);
    expect(state.eventHistory[1]!.stages).toHaveLength(3);
    expect(state.log[0]!.text).toContain(mode === "请导师报销" ? "导师报销" : "自费参会");
  });

  it("rechecks eligibility at resolution even when the queue has not yet refreshed", () => {
    const pending = activityState();
    const state = { ...pending, papers: [publishedPaper()] };
    const resolved = dispatchAction(state, "resolve-event", {
      eventId: pending.eventQueue[0]!.id, eventChoiceId: "ccig-activity-poster-y3-m9",
    });
    expect(resolved.eventQueue[0]!.stage).toBe("result");
    expect(resolved.eventQueue[0]!.history![1]!.description).toContain("论文-new-paper");
    const unavailable = { ...refreshPendingEventDecisions(state), papers: [] };
    const blocked = dispatchAction(unavailable, "resolve-event", {
      eventId: pending.eventQueue[0]!.id, eventChoiceId: "ccig-activity-poster-y3-m9",
    });
    expect(blocked.eventQueue[0]!.stage).toBe("act2");
    expect(blocked.player).toEqual(unavailable.player);
  });

  it.each(["海报展示", "趁机旅游", "品尝当地美食"])("keeps selected %s and saved rolls after a better paper appears", (label) => {
    let state = activityState();
    state = refreshPendingEventDecisions({ ...state, papers: [publishedPaper()] });
    const chosenDecision = structuredClone(state.eventQueue[0]!);
    state = choose(state, label);
    const result = structuredClone(state.eventQueue[0]!);
    const random = vi.mocked(Math.random).mockClear();
    state = refreshPendingEventDecisions({ ...state, papers: [...state.papers, publishedPaper("better", 100)] });
    state = refreshPendingEventDecisions(JSON.parse(JSON.stringify(state)));
    expect(getResolvableQueuedEvent(state, state.eventQueue[0]!)).toEqual(state.eventQueue[0]);
    expect(state.eventQueue[0]!.fixedResultPreview).toEqual(result.fixedResultPreview);
    expect(state.eventQueue[0]!.history).toEqual(result.history);
    expect(state.eventQueue[0]!.description).not.toContain("论文-better");
    expect(random).not.toHaveBeenCalled();
    state = choose(state, "确定");
    expect(state.papers[0]!.publication!.promotionMultiplier).toBe(label === "海报展示" ? 1.25 : 1);
    expect(state.papers[1]!.publication!.promotionMultiplier).toBe(1);
    const history = state.eventHistory.find((entry) => entry.chainId === chosenDecision.chainId)!;
    expect(history.stages[1]!.description).toBe(chosenDecision.description);
    expect(history.stages[1]!.selectedChoiceId).toBe(chosenDecision.choices.find((choice) => choice.label === label)!.id);
    expect(history.stages).toHaveLength(3);
  });
});
