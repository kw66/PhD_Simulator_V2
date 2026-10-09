import { afterEach, describe, expect, it, vi } from "vitest";
import { createConferenceActivityEvent } from "../src/core/v2-conference-activity-events";
import { refreshConferenceActivityEvent } from "../src/core/v2-conference-activity-refresh";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, PendingEvent } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

function fixture(grade: "A" | "B" | "C" = "C", social = 5, roll = 0) {
  const base = createStartedGameState("normal");
  const state: GameState = {
    ...base, selectedAdvisorName: "测试导师", year: 2, month: 3, totalMonths: 15,
    player: { ...base.player, social, research: 12, san: 10, money: 30 },
  };
  const context = { id: "test-cvpr", conferenceName: "CVPR", conferenceYear: 2025,
    city: "测试城", country: "测试国", paperCount: 1, grade };
  const root = createConferenceActivityEvent(context, { ...state, research: 12, social }, [], () => roll);
  return { state, root };
}

function decision(root: PendingEvent) {
  return root.choices[0]!.effects.enqueueEvents![0]!;
}

function result(menu: PendingEvent, id: string) {
  return menu.choices.find((choice) => choice.id === id)!.effects.enqueueEvents![0]!;
}

function choose(state: GameState, id: string) {
  return dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]!.id, eventChoiceId: id });
}

describe("conference activity live previews", () => {
  it.each(["act1", "act2", "result"])("refreshes resistance at %s without RNG, mutation or losing queue/history", (stage) => {
    const { state, root } = fixture();
    const menu = decision(root);
    const source = stage === "act1" ? root : stage === "act2" ? menu : result(menu, "tea-break");
    const event = { ...createEventQueueItem(source, 8), history: [{ title: "参会已完成", description: "差旅费已经结算", choices: [], selectedChoiceId: "self" }] };
    const current = { ...state, player: { ...state.player, social: 12 }, eventQueue: [event] };
    const before = structuredClone(current);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("refresh rerolled"); });
    const refreshed = refreshPendingEventDecisions(current);
    const updated = refreshed.eventQueue[0]!;
    const final = stage === "result" ? updated : result(stage === "act1" ? decision(updated) : updated, "tea-break");
    expect(final.choices[0]!.effects.social).toBe(0.5);
    expect(final.description).toContain("社交 +0.5（抵抗0.5）");
    expect(updated.history).toEqual(event.history);
    expect(updated.queueOrder).toBe(8);
    expect(updated.conferenceActivityPreview?.rolls).toEqual(source.conferenceActivityPreview?.rolls);
    expect(updated.conferenceActivityPreview?.context).toEqual(root.conferenceActivityPreview?.context);
    expect(refreshPendingEventDecisions(JSON.parse(JSON.stringify(refreshed)))).toEqual(refreshed);
    expect(current).toEqual(before);
    expect(random).not.toHaveBeenCalled();
  });

  it("recomputes social eligibility using the same rolls, and restores the original menu when stats return", () => {
    const { state, root } = fixture("A");
    const higher = { ...state, player: { ...state.player, social: 6 } };
    const updated = refreshConferenceActivityEvent(higher, decision(root));
    expect(updated.choices.map((choice) => choice.id)).toContain("big-bull-coop");
    expect(updated.choices.map((choice) => choice.id)).toContain("beautiful-scholar");
    expect(refreshConferenceActivityEvent(state, updated).choices).toEqual(decision(root).choices);
  });

  it("removes romantic candidates immediately when a lover is added", () => {
    const { state, root } = fixture("B", 12, 0.99);
    expect(decision(root).choices.some((choice) => choice.id === "smart-scholar")).toBe(true);
    const current = { ...state, loverState: { ...state.loverState, active: true } };
    const updated = refreshConferenceActivityEvent(current, decision(root));
    expect(updated.choices.some((choice) => /smart|beautiful/.test(choice.id))).toBe(false);
  });

  it("recalculates selected results by ID even when the refreshed menu would no longer draw them", () => {
    const { state, root } = fixture("B", 5, 0.99);
    const final = result(decision(root), "famous-scholar");
    const current = { ...state, player: { ...state.player, social: 12 }, conferenceCareerState: { ...state.conferenceCareerState, enterpriseCount: 3 } };
    const freshMenu = refreshConferenceActivityEvent(current, decision(root));
    expect(freshMenu.choices.some((choice) => choice.id === "famous-scholar")).toBe(false);
    const updated = refreshConferenceActivityEvent(current, final);
    expect(updated.conferenceActivityPreview?.selectedOptionId).toBe("famous-scholar");
    expect(updated.choices[0]!.effects.temporaryActionEffectUpdates).toEqual({ idea: { multiplier: 1.25 } });
  });

  it("updates research-cap effects at result confirmation", () => {
    const { state, root } = fixture("A", 12, 0.99);
    const known = { ...state, conferenceEncounterState: { ...state.conferenceEncounterState, metSmart: true, smartCount: 1 } };
    const menu = refreshConferenceActivityEvent(known, decision(root));
    const final = result(menu, "smart-lover-development");
    const capped = { ...known, player: { ...known.player, research: 20 } };
    expect(refreshConferenceActivityEvent(capped, final).choices[0]!.effects.research).toBe(0);
    const uncapped = { ...capped, researchCapacityState: { ...capped.researchCapacityState, otherCapBonus: 1 } };
    expect(refreshConferenceActivityEvent(uncapped, final).choices[0]!.effects.research).toBe(0.25);
  });

  it("blocks a stale result when eligibility is lost and allows reselecting without settling it", () => {
    const { state, root } = fixture("B", 12, 0.99);
    const final = result(decision(root), "smart-scholar");
    let current = { ...state, loverState: { ...state.loverState, active: true }, eventQueue: [createEventQueueItem(final, 1)] };
    const unchanged = choose(current, "close");
    expect(unchanged.player).toEqual(current.player);
    expect(unchanged.conferenceEncounterState).toEqual(current.conferenceEncounterState);
    expect(unchanged.eventQueue[0]!.choices[0]!.id).toBe("change-activity");
    current = choose(unchanged, "change-activity");
    expect(current.eventQueue[0]!.stage).toBe("act2");
    expect(current.eventQueue[0]!.choices.some((choice) => /smart|beautiful/.test(choice.id))).toBe(false);
    expect(current.player).toEqual(state.player);
  });

  it("settles the live decimal reward once through the real engine, including a stale third act", () => {
    const { state, root } = fixture();
    let current = { ...state, eventQueue: [createEventQueueItem(root, 1)] };
    current = choose(current, "continue");
    current = choose(current, "tea-break");
    expect(current.player.social).toBe(5);
    const finalId = current.eventQueue[0]!.id;
    current = { ...current, player: { ...current.player, social: 12 } };
    current = choose(current, "close");
    expect(current.player.social).toBe(12.5);
    expect(current.player.san).toBe(11);
    const repeated = dispatchAction(current, "resolve-event", { eventId: finalId, eventChoiceId: "close" });
    expect(repeated.player).toEqual(current.player);
  });

  it("refreshes an already-open menu through debug attribute changes", () => {
    const { state, root } = fixture();
    const current = { ...state, eventQueue: [createEventQueueItem(decision(root), 1)] };
    const updated = dispatchAction(current, "debug-adjust-stat", { debugStatId: "social", delta: 7 });
    expect(result(updated.eventQueue[0]!, "tea-break").choices[0]!.effects.social).toBe(0.5);
  });

  it("uses the experiment-experience name without promising a relationship or future event", () => {
    const { state, root } = fixture("C", 5, 0.7);
    const menu = getResolvableQueuedEvent(state, createEventQueueItem(decision(root), 1));
    const choice = menu.choices.find((entry) => entry.id === "peer-collaboration")!;
    expect(choice.label).toBe("交流实验经验");
    const final = choice.effects.enqueueEvents![0]!;
    expect(final.description).not.toMatch(/后续合作|约好/);
    expect(final.choices[0]!.effects.temporaryActionEffectUpdates).toEqual({ experiment: { bonus: 5 } });
  });
});
