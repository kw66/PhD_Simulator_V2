import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { canAutoResolveLinearEvent, isEventBlocking, isLinearEvent, settleLinearEvents } from "../src/core/v2-event-auto-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createStore } from "../src/core/v2-store";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

function event(id: string, effects: EventChoice["effects"] = {}): PendingEvent {
  return { id, title: id, description: id, source: "system", blocking: true, deadlineMonths: 0,
    chainId: id, stage: "result", choices: [{ id: `${id}-confirm`, label: "确认", outcome: "结算", effects }] };
}

function stateWith(events: PendingEvent[] = []): GameState {
  return { ...createStartedGameState("normal"), blockLinearEvents: false, year: 1, month: 4, totalMonths: 4,
    availableRandomEvents: [], illnessProbability: 0,
    eventQueue: events.map((item, index) => createEventQueueItem(item, index + 1)) };
}

function resolve(state: GameState, eventId: string, eventChoiceId: string): GameState {
  return dispatchAction(state, "resolve-event", { eventId, eventChoiceId });
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.3);
  vi.spyOn(Date, "now").mockReturnValue(1000);
});
afterEach(() => vi.restoreAllMocks());

describe("automatic linear event resolution", () => {
  it.each(["opening", "advisor"])("completes enrollment from %s without rerolling cosmetic choices", (stage) => {
    let initial = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    initial = dispatchAction(initial, "set-linear-event-blocking", { blockLinearEvents: false });
    const opening = initial.eventQueue[0]!;
    const studentName = opening.choices[0]!.effects.fixedEventResolution!.studentName;
    const advisorInfo = opening.choices[0]!.effects.enqueueEvents![0]!;
    const advisorName = advisorInfo.choices.find((choice) => choice.id === "before-grad-school-confirm")!.effects.fixedEventResolution!.advisorCandidate!.advisorName;
    if (stage === "advisor") initial = resolve(initial, opening.id, "before-grad-school-open-advisor-info");
    let manual = initial;
    for (const choiceId of stage === "opening"
      ? ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]
      : ["before-grad-school-confirm", "before-grad-school-finish"]) {
      manual = resolve(manual, manual.eventQueue.find((item) => item.chainId === "before-grad-school")!.id, choiceId);
    }
    manual = dispatchAction(manual, "next-month");
    const automatic = dispatchAction(initial, "next-month");
    expect(automatic).toEqual(manual);
    expect(automatic.totalMonths).toBe(1);
    expect(automatic.playerName).toBe(studentName);
    expect(automatic.selectedAdvisorName).toBe(advisorName);
    const history = automatic.eventHistory.find((item) => item.chainId === "before-grad-school")!;
    expect(history.stages.map((item) => item.selectedChoiceId)).toEqual([
      "before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish",
    ]);
    const button = renderApp(initial).match(/<button\s+class="center-tab-btn center-tab-btn-next"[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(button).not.toContain("disabled");
  });

  it("defaults to manual blocking and changing the switch does not settle events", () => {
    const initial = { ...stateWith([event("reward", { money: 2 })]), blockLinearEvents: true };
    expect(createStartedGameState("normal").blockLinearEvents).toBe(true);
    expect(dispatchAction(initial, "next-month")).toEqual(initial);
    const changed = dispatchAction(initial, "set-linear-event-blocking", { blockLinearEvents: false });
    expect(changed).toEqual({ ...initial, blockLinearEvents: false });
    expect(dispatchAction(changed, "set-linear-event-blocking", { blockLinearEvents: true })).toEqual(initial);
  });

  it("runs every stage through the manual path with identical effects, history and logs", () => {
    const final = { ...event("final", { money: 3 }), chainId: "chain" };
    const middle = { ...event("middle", { money: -1, enqueueEvents: [final] }), chainId: "chain", stage: "act2" as const };
    const first = { ...event("first", { enqueueEvents: [middle] }), chainId: "chain", stage: "act1" as const };
    const initial = stateWith([first, event("after", { san: -2 })]);
    let manual = resolve(initial, "first", "first-confirm");
    manual = resolve(manual, "middle", "middle-confirm");
    manual = resolve(manual, "final", "final-confirm");
    manual = resolve(manual, "after", "after-confirm");
    const automatic = settleLinearEvents(initial, resolve);
    expect(automatic).toEqual(manual);
    expect(automatic.eventHistory.map((item) => item.chainId)).toEqual(["chain", "after"]);
    expect(automatic.eventHistory[0]?.stages).toHaveLength(3);
    expect(initial.eventHistory).toHaveLength(0);
    expect(settleLinearEvents(automatic, resolve)).toBe(automatic);
  });

  it("detects a later branch before advancing its introduction or settling other events", () => {
    const branch = event("branch");
    branch.choices.push({ id: "disabled", label: "另一选择", outcome: "", disabledReason: "条件不足", effects: {} });
    const initial = stateWith([{ ...event("intro", { enqueueEvents: [branch] }), chainId: "branch", stage: "act1" }, event("later", { money: 4 })]);
    const next = dispatchAction(initial, "next-month");
    expect(next.totalMonths).toBe(initial.totalMonths);
    expect(next.player).toEqual(initial.player);
    expect(next).toEqual(initial);
    expect(isLinearEvent(initial, initial.eventQueue[0]!)).toBe(false);
    expect(next.eventQueue.some((item) => item.id === "later")).toBe(true);
    expect(next.eventHistory).toHaveLength(0);
  });

  it.each(["disabled", "empty", "stay"])("does not loop or resolve an unusable %s event", (kind) => {
    const item = event("blocked", { money: 10 });
    if (kind === "disabled") item.choices[0]!.disabledReason = "条件不足";
    if (kind === "empty") item.choices = [];
    if (kind === "stay") item.choices[0]!.effects.stayOnEvent = true;
    const initial = stateWith([item]);
    expect(dispatchAction(initial, "next-month")).toEqual(initial);
  });

  it("settles due nonblocking events and leaves future events alone", () => {
    const initial = stateWith([{ ...event("due", { money: 2 }), blocking: false }, { ...event("future", { money: 5 }), deadlineMonths: 2 }]);
    const next = settleLinearEvents(initial, resolve);
    expect(next.player.money).toBe(initial.player.money + 2);
    expect(next.eventQueue.map((item) => item.id)).toEqual(["future"]);
    expect(next.eventQueue[0]?.deadlineMonths).toBe(2);
  });

  it("can leave optional branches pending while settling later linear events", () => {
    const optional = { ...event("optional"), blocking: false };
    optional.choices.push({ id: "second", label: "另一个", outcome: "", effects: {} });
    const next = settleLinearEvents(stateWith([optional, event("reward", { money: 2 })]), resolve);
    expect(next.eventQueue.map((item) => item.id)).toEqual(["optional"]);
    expect(next.eventHistory[0]?.chainId).toBe("reward");
  });

  it("automatically settles a paper review on the month it becomes due and preserves all scenes", () => {
    const initial = stateWith();
    initial.papers = [{ ...createDraftPaper(1, 0), status: "reviewing", target: "A", reviewMonthsLeft: 1,
      idea: 100, experiment: 100, writing: 100, submittedIdea: 100, submittedExperiment: 100,
      submittedWriting: 100, submittedMonth: 1, submittedYear: 1, rejectionCount: 3 }];
    const next = dispatchAction(initial, "next-month");
    expect(next.totalMonths).toBe(5);
    expect(next.papers).toHaveLength(0);
    expect(next.externalPublications).toHaveLength(1);
    expect(next.publicationTalentState?.claimedIds).toContain("perseverance");
    const record = next.eventHistory.find((item) => item.source === "review")!;
    expect(record.completedAtTotalMonths).toBe(5);
    expect(record.stages.map((item) => item.paperReviewPresentation?.kind)).toEqual(["overview", "reviewers", "decision"]);
    const presentation = record.stages.at(-1)?.paperReviewPresentation;
    expect(presentation).not.toHaveProperty("talentRewards");
    expect(next.eventHistory.flatMap((entry) => entry.stages).some((stage) => stage.talentTrigger?.name === "越挫越勇")).toBe(true);
    expect(next.eventQueue.some((item) => item.source === "review")).toBe(false);
  });

  it("stops immediately on an ending instead of advancing the calendar or resolving later rewards", () => {
    const initial = stateWith([event("fatal", { san: -30 }), event("recovery", { san: 20 })]);
    const next = dispatchAction(initial, "next-month");
    expect(next.phase).toBe("finished");
    expect(next.ending).toBe("burnout");
    expect(next.totalMonths).toBe(4);
    expect(next.eventHistory.map((item) => item.chainId)).toEqual(["fatal"]);
  });

  it("keeps the setting across restarting and returning to the lobby", () => {
    const store = createStore();
    store.dispatch("set-linear-event-blocking", { blockLinearEvents: false });
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().blockLinearEvents).toBe(false);
    store.dispatch("restart-game");
    expect(store.getState().blockLinearEvents).toBe(false);
    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().blockLinearEvents).toBe(false);
  });

  it("enables Next Month for automatic events while keeping branching blockers disabled", () => {
    const initial = stateWith([event("reward")]);
    const nextButton = (state: GameState) => renderApp(state).match(/<button\s+class="center-tab-btn center-tab-btn-next"[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(nextButton(initial)).not.toContain("disabled");
    expect(nextButton({ ...initial, blockLinearEvents: true })).toContain("disabled");
    initial.eventQueue[0]!.choices.push({ id: "branch", label: "分支", outcome: "", effects: {} });
    expect(nextButton(initial)).toContain("disabled");
    expect(renderApp(initial)).toContain('data-ui-event-blocking="linear"');
  });

  it.each([true, false])("does not partially settle an automatic event before a blocker (automatic first: %s)", (automaticFirst) => {
    const automatic = event("automatic", { money: 4 });
    const branch = event("manual");
    branch.choices.push({ id: "second", label: "另一选择", outcome: "", effects: {} });
    const initial = stateWith(automaticFirst ? [automatic, branch] : [branch, automatic]);
    const button = renderApp(initial).match(/<button\s+class="center-tab-btn center-tab-btn-next"[\s\S]*?<\/button>/)?.[0];
    expect(button).toContain("disabled");
    expect(dispatchAction(initial, "next-month")).toEqual(initial);
    const manualResolved = resolve(initial, "manual", "manual-confirm");
    expect(dispatchAction(manualResolved, "next-month").totalMonths).toBe(initial.totalMonths + 1);
  });

  it.each([true, false])("combines event and global blocking flags when the global switch is %s", (blockLinearEvents) => {
    const state = { ...stateWith(), blockLinearEvents };
    const linear = createEventQueueItem(event("linear"), 1);
    const branch = { ...linear, choices: [...linear.choices, { id: "second", label: "另一选择", outcome: "", effects: {} }] };
    expect(isEventBlocking(state, linear)).toBe(blockLinearEvents);
    expect(isEventBlocking(state, branch)).toBe(true);
    expect(isEventBlocking(state, { ...linear, blocking: false })).toBe(false);
    expect(isEventBlocking(state, { ...branch, blocking: false })).toBe(false);
    expect(isEventBlocking(state, { ...branch, deadlineMonths: 1 })).toBe(false);
  });

  it.each(["illness-stomach", "teachers-day", "year-summary"])("keeps debug-added %s blocking before and during the choice scene", (eventId) => {
    const initial = dispatchAction(stateWith(), "debug-trigger-event", { eventId });
    const first = initial.eventQueue[0]!;
    expect(first).toBeDefined();
    expect(isEventBlocking(initial, first)).toBe(true);
    expect(canAutoResolveLinearEvent(initial, first)).toBe(false);
    expect(renderApp(initial).split(`data-ui-open-event-id="${first.id}"`)[1]?.split("</article>")[0]).toContain('data-deadline="blocking"');
    const second = resolve(initial, first.id, first.choices[0]!.id);
    expect(isEventBlocking(second, second.eventQueue[0]!)).toBe(true);
  });

  it("sorts by deadline before prioritizing branches and marks only events that can currently auto-resolve", () => {
    const branch = event("branch");
    branch.choices.push({ id: "second", label: "另一选择", outcome: "", effects: {} });
    const futureBranch = { ...branch, id: "future-branch", deadlineMonths: 1 };
    const initial = stateWith([futureBranch, event("automatic"), branch]);
    const html = renderApp(initial);
    const agenda = html.split('id="pending-event-list"')[1]!.split('</aside>')[0]!;
    expect(agenda.indexOf('data-ui-open-event-id="branch"')).toBeLessThan(agenda.indexOf('data-ui-open-event-id="automatic"'));
    expect(agenda.indexOf('data-ui-open-event-id="automatic"')).toBeLessThan(agenda.indexOf('data-ui-open-event-id="future-branch"'));
    expect(agenda.match(/class="event-auto-indicator"/g)).toHaveLength(1);
    expect(agenda.split('data-ui-open-event-id="automatic"')[1]?.split('</article>')[0]).toContain('data-deadline="pending"');
    expect(renderApp({ ...initial, blockLinearEvents: true })).not.toContain('class="event-auto-indicator"');
  });
});
