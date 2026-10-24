import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { canRewindPendingEvent } from "../src/core/v2-event-replay";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { hasRandomOutcome, randomOutcome } from "../src/core/v2-event-choice-random";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function base(): GameState {
  const state = createInitialState();
  return { ...state, phase: "playing", selectedRoleId: "normal", year: 2, month: 1, totalMonths: 13,
    randomState: { seed: 1234, cursor: 0 }, eventQueue: [], pendingRandomEvents: [],
    player: { ...state.player, san: 20, research: 10, social: 10, favor: 10, money: 20 } };
}

function current(state: GameState) {
  const event = state.eventQueue.find(item => ["teachers-day", "probability-fixture", "before-grad-school"].includes(item.chainId ?? ""));
  if (!event) throw new Error("Expected pending test event");
  return event;
}

function choose(state: GameState, choiceId?: string): GameState {
  const event = current(state);
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

function teachersDay(): GameState {
  const state = base();
  return { ...state, eventQueue: [createEventQueueItem(createTeachersDayEvent(state, () => 0, "tea"), 1)] };
}

function rewind(state: GameState, index: number, alias: "replay-event" | "rewinder-replay-event" = "replay-event"): GameState {
  return dispatchAction(state, alias, { eventId: current(state).id, eventHistoryIndex: index });
}

function multiStage(): GameState {
  const state = base();
  const result: PendingEvent = { id: "probability-result", chainId: "probability-fixture", stage: "result",
    title: "Result", description: "", source: "fixed", blocking: true, deadlineMonths: 0,
    choices: [{ id: "finish", label: "Finish", outcome: "", effects: { money: 1 } }] };
  const later: PendingEvent = { ...result, id: "probability-later", stage: "act2",
    choices: [{ id: "later-deterministic", label: "Continue", outcome: "", effects: { enqueueEvents: [result] } }] };
  const decision: PendingEvent = { ...result, id: "probability-decision", stage: "act2", choices: [
    { id: "certain", label: "Conditional result", outcome: "", effects: { money: state.player.research >= 6 ? 2 : -2, enqueueEvents: [later] } },
    { id: "random", label: "Probabilistic result", outcome: "", ...randomOutcome(), effects: { enqueueEvents: [later] } },
  ] };
  const intro: PendingEvent = { ...result, id: "probability-intro", stage: "act1",
    choices: [{ id: "continue", label: "Continue", outcome: "", effects: { enqueueEvents: [decision] } }] };
  return { ...state, eventQueue: [createEventQueueItem(intro, 1)] };
}

describe("probabilistic event choices commit the revealed branch", () => {
  it.each(["replay-event", "rewinder-replay-event"] as const)("blocks %s to every earlier scene after the real teacher greeting", alias => {
    const decision = choose(teachersDay());
    const greeting = current(decision).choices.find(choice => choice.id.startsWith("teachers-day-message"))!;
    expect(greeting.outcomeRandom).toBe(true);
    const result = choose(decision, greeting.id);
    expect(current(result).stage).toBe("result");
    expect(current(result).history).toHaveLength(2);
    for (const index of [0, 1]) {
      expect(canRewindPendingEvent(result, current(result), index)).toBe(false);
      const attempted = rewind(result, index, alias);
      expect(current(attempted)).toEqual(current(result));
      expect(attempted.player).toEqual(result.player);
    }
  });

  it("keeps a deterministic gift replayable, then locks after switching to a greeting", () => {
    const decision = choose(teachersDay());
    const gift = current(decision).choices.find(choice => choice.id.startsWith("teachers-day-gift"))!;
    expect(gift.outcomeRandom).not.toBe(true);
    const result = choose(decision, gift.id);
    expect(canRewindPendingEvent(result, current(result), 0)).toBe(true);
    expect(canRewindPendingEvent(result, current(result), 1)).toBe(true);
    const revisited = rewind(result, 1);
    expect(current(revisited).stage).toBe("act2");
    const greeting = current(revisited).choices.find(choice => choice.id.startsWith("teachers-day-message"))!;
    const locked = choose(revisited, greeting.id);
    expect(canRewindPendingEvent(locked, current(locked), 0)).toBe(false);
    expect(canRewindPendingEvent(locked, current(locked), 1)).toBe(false);
  });

  it("preserves the random barrier through JSON reload and a later deterministic scene", () => {
    let state = choose(choose(multiStage()), "random");
    state = JSON.parse(JSON.stringify(state)) as GameState;
    state = choose(state, "later-deterministic");
    expect(current(state).history).toHaveLength(3);
    expect(canRewindPendingEvent(state, current(state), 0)).toBe(false);
    expect(canRewindPendingEvent(state, current(state), 1)).toBe(false);
    // A later deterministic step may be reviewed without changing the revealed random decision.
    expect(canRewindPendingEvent(state, current(state), 2)).toBe(true);
    expect(current(rewind(state, 2)).id).toContain("probability-later");
    for (const alias of ["replay-event", "rewinder-replay-event"] as const) {
      expect(current(rewind(state, 0, alias))).toEqual(current(state));
      expect(current(rewind(state, 1, alias))).toEqual(current(state));
    }
  });

  it("permits deterministic conditional outcomes to return to any previous scene", () => {
    let state = choose(choose(multiStage()), "certain");
    state = choose(state, "later-deterministic");
    for (const index of [0, 1, 2]) expect(canRewindPendingEvent(state, current(state), index)).toBe(true);
    const decision = rewind(state, 1);
    expect(current(decision).choices.find(choice => choice.id === "certain")?.outcomeRandom).not.toBe(true);
    const changed = choose(decision, "random");
    expect(canRewindPendingEvent(changed, current(changed), 1)).toBe(false);
  });

  it("leaves r20 generated event fields and old probabilistic replay behavior unchanged", () => {
    withGameplayRuleset("20261022-r20", () => {
      const decision = choose(teachersDay());
      const greeting = current(decision).choices.find(choice => choice.id.startsWith("teachers-day-message"))!;
      expect(Object.hasOwn(greeting, "outcomeRandom")).toBe(false);
      const result = choose(decision, greeting.id);
      for (const index of [0, 1]) {
        expect(canRewindPendingEvent(result, current(result), index)).toBe(true);
        expect(current(rewind(result, index)).stage).toBe(index === 0 ? "act1" : "act2");
      }
      expect(randomOutcome()).toEqual({});
    });
  });

  it.each(["normal", "research-captain"] as const)("keeps intentional advisor redraws unlocked for %s", roleId => {
    let state = dispatchAction({ ...createInitialState(), randomState: { seed: 1234, cursor: 0 } }, "start-game", { roleId });
    state = choose(state, "before-grad-school-open-advisor-info");
    const rerollId = "before-grad-school-reroll";
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(current(state).choices.find(choice => choice.id === rerollId)?.outcomeRandom).not.toBe(true);
      state = choose(state, rerollId);
      expect(current(state).rewinderReplay?.barrierHistoryIndex).toBeUndefined();
      expect(canRewindPendingEvent(state, current(state), 0)).toBe(true);
    }
    state = JSON.parse(JSON.stringify(state)) as GameState;
    for (const alias of ["replay-event", "rewinder-replay-event"] as const) {
      expect(current(rewind(state, 0, alias)).stage).toBe("act1");
    }
    const candidate = current(state).choices.find(choice => choice.id === "before-grad-school-confirm")!
      .effects.fixedEventResolution!.advisorCandidate!;
    state = choose(state, "before-grad-school-confirm");
    expect(canRewindPendingEvent(state, current(state), 0)).toBe(true);
    expect(canRewindPendingEvent(state, current(state), 1)).toBe(true);
    const returned = rewind(state, 1);
    expect(current(returned).choices.find(choice => choice.id === "before-grad-school-confirm")!
      .effects.fixedEventResolution!.advisorCandidate).toEqual(candidate);
    state = choose(state, "before-grad-school-finish");
    expect(state.selectedAdvisorName).toBe(candidate.advisorName);
    if (roleId === "research-captain") expect(state.captainState!.tags.advisor).toBe(candidate.captainTag);
  });

  it("unlocks a pending captain advisor redraw that already carries the old barrier", () => {
    let state = withGameplayRuleset("20261024-r47", () => {
      let started = dispatchAction({ ...createInitialState(), randomState: { seed: 1234, cursor: 0 } }, "start-game", { roleId: "research-captain" });
      started = choose(started, "before-grad-school-open-advisor-info");
      return choose(started, "before-grad-school-reroll");
    });
    state = JSON.parse(JSON.stringify(state)) as GameState;
    expect(current(state).rewinderReplay?.barrierHistoryIndex).toBe(1);
    const reroll = current(state).choices.find(choice => choice.id === "before-grad-school-reroll")!;
    expect(reroll.outcomeRandom).toBe(true);
    expect(hasRandomOutcome(reroll)).toBe(false);
    for (const alias of ["replay-event", "rewinder-replay-event"] as const) {
      expect(canRewindPendingEvent(state, current(state), 0)).toBe(true);
      expect(current(rewind(state, 0, alias)).stage).toBe("act1");
    }
    state = choose(state, "before-grad-school-confirm");
    for (const index of [0, 1]) expect(canRewindPendingEvent(state, current(state), index)).toBe(true);
  });

  it("retains the captain advisor reroll barrier in r47 recordings", () => withGameplayRuleset("20261024-r47", () => {
    let state = dispatchAction({ ...createInitialState(), randomState: { seed: 1234, cursor: 0 } }, "start-game", { roleId: "research-captain" });
    state = choose(state, "before-grad-school-open-advisor-info");
    expect(current(state).history).toHaveLength(1);
    expect(canRewindPendingEvent(state, current(state), 0)).toBe(true);
    const reroll = current(state).choices.find(choice => choice.id === "before-grad-school-reroll")!;
    expect(reroll.outcomeRandom).toBe(true);
    state = choose(state, reroll.id);
    expect(current(state).stage).toBe("act2");
    expect(current(state).rewinderReplay?.barrierHistoryIndex).toBe(1);
    state = JSON.parse(JSON.stringify(state)) as GameState;
    for (const alias of ["replay-event", "rewinder-replay-event"] as const) {
      expect(canRewindPendingEvent(state, current(state), 0)).toBe(false);
      expect(current(rewind(state, 0, alias))).toEqual(current(state));
    }
    state = choose(state, "before-grad-school-confirm");
    expect(current(state).history).toHaveLength(2);
    expect(canRewindPendingEvent(state, current(state), 0)).toBe(false);
    // The confirmed choice may be reconsidered without resurrecting the pre-reroll advisor.
    expect(canRewindPendingEvent(state, current(state), 1)).toBe(true);
    const afterReturn = rewind(state, 1);
    expect(canRewindPendingEvent(afterReturn, current(afterReturn), 0)).toBe(false);
  }));
});
