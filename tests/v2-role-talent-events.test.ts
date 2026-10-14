import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectIllnessEventForMonth, collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { activatePendingRandomEvents } from "../src/core/v2-paper-competition-waiting";
import { buildWeightedRandomEventPool, createRandomEventPool, drawRandomEvent, normalizeRoleTalentIllnessProbability, yearlyResetRandomEventState } from "../src/core/v2-random-event-rules";
import { createSocialCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { createEntertainmentCampusRandomEvent } from "../src/core/v2-random-events-campus-entertainment";
import { createOpsCampusRandomEvent } from "../src/core/v2-random-events-campus-ops";
import type { GameState, PendingEvent, RoleId } from "../src/core/v2-types";

function state(role: RoleId, levels: Record<string, number> = {}): GameState {
  const initial = createStartedGameState(role);
  return { ...initial, roleTalents: { levels }, totalMonths: 6, month: 6, eventQueue: [], illnessProbability: 0 };
}

function branch(event: PendingEvent, name: string) {
  const decision = event.choices[0]!.effects.enqueueEvents![0]!;
  return decision.choices.find((choice) => choice.id.includes(`-${name}-`))!;
}

function oneDraw(current: GameState) {
  let calls = 0;
  return collectRandomEventsForMonth(current, () => calls++ === 0 ? 0.8 : 0);
}

describe("role talent event effects", () => {
  it("adds the correct annual tickets and preserves their draw weight", () => {
    const genius = state("genius", { "thirst-for-knowledge": 1 });
    expect(createRandomEventPool(genius).filter((id) => id === 9)).toHaveLength(2);
    const reversed = state("chosen-reversed", { "group-event-focus": 4, "game-event-focus": 2 });
    const pool = createRandomEventPool(reversed);
    expect(pool.filter((id) => id === 7)).toHaveLength(5);
    expect(pool.filter((id) => id === 15)).toHaveLength(3);
    expect(pool.filter((id) => id === 8)).toHaveLength(1);
    const weighted = buildWeightedRandomEventPool({ ...reversed, availableRandomEvents: pool, social: 1 });
    expect(weighted.weightedPool.filter((id) => id === 7)).toHaveLength(50);
  });

  it("presents each extra ticket once without the used-ID history suppressing it", () => {
    let current = { ...state("genius", { "thirst-for-knowledge": 1 }), availableRandomEvents: [9, 9] };
    for (let count = 0; count < 2; count++) {
      const draw = oneDraw(current);
      expect(draw.events).toHaveLength(1);
      current = { ...draw.nextState, totalMonths: current.totalMonths + 1 };
    }
    expect(current.usedRandomEvents).toEqual([9, 9]);
    expect(oneDraw(current).events).toEqual([]);
    expect(yearlyResetRandomEventState(current).availableRandomEvents.filter((id) => id === 9)).toHaveLength(2);
  });

  it("does not create concurrent duplicate chains or consume their remaining tickets", () => {
    const current = { ...state("chosen-reversed"), availableRandomEvents: [7, 7, 7] };
    const draw = collectRandomEventsForMonth(current, () => 0.99);
    expect(draw.events).toHaveLength(1);
    expect(draw.nextState.availableRandomEvents).toEqual([7, 7]);
  });

  it("reserves only one waiting ticket and counts it when it appears in the new year", () => {
    const current = { ...state("normal"), availableRandomEvents: [8, 8] };
    current.advisorProgressState = { ...current.advisorProgressState, funding: 0 };
    const hidden = oneDraw(current).nextState;
    expect(hidden.pendingRandomEvents).toHaveLength(1);
    expect(hidden.availableRandomEvents).toEqual([8]);
    expect(oneDraw(hidden).events).toEqual([]);
    const reset = { ...hidden, ...yearlyResetRandomEventState(hidden), year: 2 };
    expect(reset.usedRandomEvents).toEqual([]);
    expect(reset.availableRandomEvents).not.toContain(8);
    const awake = activatePendingRandomEvents({ ...reset, advisorProgressState: { ...reset.advisorProgressState, funding: 100 } }, () => 0);
    expect(awake.usedRandomEvents).toEqual([8]);
    expect(awake.pendingRandomEvents).toEqual([]);
    expect(awake.availableRandomEvents).not.toContain(8);
  });

  it("keeps remaining copies and previous presentations when a later ticket waits", () => {
    const current = { ...state("normal"), availableRandomEvents: [8, 8], usedRandomEvents: [8] };
    current.advisorProgressState = { ...current.advisorProgressState, funding: 0 };
    const hidden = oneDraw(current).nextState;
    expect(hidden.availableRandomEvents).toEqual([8]);
    expect(hidden.usedRandomEvents).toEqual([8]);
    const awake = activatePendingRandomEvents({ ...hidden, advisorProgressState: { ...hidden.advisorProgressState, funding: 100 } }, () => 0);
    expect(awake.availableRandomEvents).toEqual([8]);
    expect(awake.usedRandomEvents).toEqual([8, 8]);
  });

  it("adds sports strength, caps poker odds and keeps guaranteed outcomes at their original cost", () => {
    const chosen = state("chosen", { "athletic-prodigy": 2, "lucky-hand": 2, "rare-color-fate": 1, "effortless-reinstall": 1 });
    chosen.player = { ...chosen.player, san: 20, money: 10 };
    chosen.eventCounters = { ...chosen.eventCounters, pokerCount: 2 };
    const social = createSocialCampusRandomEvent(chosen, () => 0.999);
    expect(branch(social, "badminton").effects.eventSupportUpdates?.hasStrongBodyTalent).toBe(true);
    expect(branch(social, "poker").outcome).toContain("100%");
    expect(branch(social, "poker").effects.money).toBe(5);
    const game = branch(createEntertainmentCampusRandomEvent(chosen, () => 0.999), "kings");
    expect(game.outcome).toContain("100%");
    expect(game.effects.money).toBe(4);
    expect(game.effects.san).toBe(-5);
    const reinstall = branch(createOpsCampusRandomEvent(chosen, () => 0.999), "reinstall");
    expect(reinstall.outcome).toContain("100%");
    expect(reinstall.effects.san).toBe(-3);
    expect(reinstall.effects.addBuffs).toBeUndefined();
  });

  it("preserves chosen negative fractional illness through draws and annual refill without causing disease", () => {
    const chosen = { ...state("chosen", { "misfortune-to-fortune": 1 }), illnessProbability: -100.5, availableRandomEvents: [9] };
    expect(normalizeRoleTalentIllnessProbability(chosen, -100.5)).toBe(-100.5);
    const draw = drawRandomEvent({ ...chosen, social: 1 }, 0);
    expect(draw.nextState.illnessProbability).toBe(-100.5);
    expect(yearlyResetRandomEventState(chosen).illnessProbability).toBe(-100.5);
    expect(collectIllnessEventForMonth(chosen, () => 0)).toEqual([]);
    expect(normalizeRoleTalentIllnessProbability(state("chosen"), -1)).toBe(0);
    expect(normalizeRoleTalentIllnessProbability(state("normal", { "misfortune-to-fortune": 1 }), -1)).toBe(0);
  });

  it("preserves an event's negative illness result and settles its milestone only after confirmation", () => {
    const chosen = { ...state("chosen", { "misfortune-to-fortune": 1 }), illnessProbability: -95 };
    const event: PendingEvent = {
      id: "disease-milestone", title: "Health", description: "Health", source: "random", blocking: true,
      deadlineMonths: 0, chainId: "disease-milestone", stage: "result",
      choices: [{ id: "confirm", label: "Confirm", outcome: "Health improved", effects: { illnessProbabilityDelta: -10 } }],
    };
    const queued = { ...chosen, eventQueue: [createEventQueueItem(event, 1)] };
    expect(queued.roleTalents?.negativeDiseaseMilestone).toBeUndefined();
    const result = dispatchAction(queued, "resolve-event", { eventId: event.id, eventChoiceId: "confirm" });
    expect(result.illnessProbability).toBe(-105);
    expect(result.roleTalents?.negativeDiseaseMilestone).toBe(1);
    expect(dispatchAction(result, "resolve-event", { eventId: event.id, eventChoiceId: "confirm" }).player).toEqual(result.player);
  });
});
