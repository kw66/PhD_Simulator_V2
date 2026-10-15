import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

function initial(): GameState {
  const state = createStartedGameState("normal");
  return { ...state, phase: "playing", blockLinearEvents: true, totalMonths: 1, month: 1, year: 1,
    eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    player: { san: 20, research: 5, social: 5, favor: 5, money: 10 },
    advisorProgressState: { ...state.advisorProgressState, funding: 100 } };
}

function event(id: string, stage: PendingEvent["stage"], effects: EventChoice["effects"], chainId = id): PendingEvent {
  return { id, chainId, source: "fixed", title: id, description: "", blocking: true, deadlineMonths: 0, stage,
    choices: [{ id: "confirm", label: "确定", outcome: "", effects }] };
}

function resolve(state: GameState, id: string, choice = "confirm"): GameState {
  return dispatchAction(state, "resolve-event", { eventId: id, eventChoiceId: choice });
}

describe("achievement event commit boundaries", () => {
  it("does not record speculative income, SAN cap gains or attribute peaks; final applies once", () => {
    const finish = event("income-final", "result", {}, "income");
    const decision = event("income-decision", "act2", { money: 100, rawResearch: 2, sanCapDelta: 3, enqueueEvents: [finish] }, "income");
    let current: GameState = { ...initial(), eventQueue: [createEventQueueItem(decision, 1)] };
    current = resolve(current, decision.id);
    expect(current.player.money).toBe(10);
    expect(current.player.research).toBe(5);
    expect(current.sanCap).toBe(initial().sanCap);
    expect(current.achievementProgress?.counters["income:1"] ?? 0).toBe(0);
    expect(current.achievementProgress?.counters["san-cap-gain"] ?? 0).toBe(0);
    expect(current.achievementProgress?.peaks.research).toBe(5);
    expect(current.achievementProgress?.satisfied).not.toContain("global:windfall");
    current = resolve(current, finish.id);
    expect(current.player.money).toBe(110);
    expect(current.achievementProgress?.counters["income:1"]).toBe(100);
    expect(current.achievementProgress?.counters["san-cap-gain"]).toBe(3);
    expect(current.achievementProgress?.peaks.research).toBe(current.player.research);
    expect(current.achievementProgress?.satisfied).toContain("global:windfall");
    current = resolve(current, finish.id);
    expect(current.achievementProgress?.counters["income:1"]).toBe(100);
    expect(current.achievementProgress?.counters["san-cap-gain"]).toBe(3);
  });

  it("preserves another event settled while the first result awaits confirmation", () => {
    const finish = event("first-final", "result", {}, "first");
    const decision = event("first-decision", "act2", { money: 20, rawResearch: 1, sanCapDelta: 2, enqueueEvents: [finish] }, "first");
    const other = event("other-final", "result", { money: 30, rawSocial: 2, sanCapDelta: 3 });
    let current: GameState = { ...initial(), eventQueue: [createEventQueueItem(decision, 1), createEventQueueItem(other, 2)] };
    current = resolve(current, decision.id);
    current = resolve(current, other.id);
    expect(current.achievementProgress?.counters["income:1"]).toBe(30);
    expect(current.achievementProgress?.counters["san-cap-gain"]).toBe(3);
    const social = current.player.social;
    current = resolve(current, finish.id);
    expect(current.player.money).toBe(60);
    expect(current.player.social).toBe(social);
    expect(current.achievementProgress?.peaks.social).toBe(social);
    expect(current.achievementProgress?.counters["income:1"]).toBe(50);
    expect(current.achievementProgress?.counters["san-cap-gain"]).toBe(5);
    expect(current.eventHistory).toHaveLength(2);
  });

  it("does not mistake transfer talent growth for master-stage gains or grant early achievements in preview", () => {
    let current: GameState = { ...initial(), year: 2, month: 9, totalMonths: 21, totalResearchScore: 7,
      roleTalents: { levels: { "self-determination": 12 }, initialized: true } };
    current = { ...current, eventQueue: [createEventQueueItem(createPhdDecisionEvent(current), 1)] };
    current = resolve(current, current.eventQueue[0]!.id, current.eventQueue[0]!.choices[0]!.id);
    current = resolve(current, current.eventQueue.find(e => e.chainId === "phd-decision")!.id, "transfer-phd");
    expect(current.degree).toBe("master");
    expect(current.player.research).toBe(5);
    expect(current.achievementProgress?.satisfied).not.toContain("global:young-genius");
    const result = current.eventQueue.find(e => e.chainId === "phd-decision")!;
    current = resolve(current, result.id, result.choices[0]!.id);
    expect(current.degree).toBe("phd");
    expect(current.player.research).toBeGreaterThan(6);
    expect(current.achievementProgress?.peaks["master:research"]).toBe(5);
    expect(current.achievementProgress?.peaks["master:social"]).toBe(5);
    expect(current.achievementProgress?.peaks["master:favor"]).toBe(5);
    expect(current.achievementProgress?.satisfied).not.toContain("normal:self-reliance");
    expect(current.achievementProgress?.satisfied).toContain("global:young-genius");
  });
});
