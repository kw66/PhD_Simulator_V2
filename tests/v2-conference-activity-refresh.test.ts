import { afterEach, describe, expect, it, vi } from "vitest";
import { createConferenceActivityEvent } from "../src/core/v2-conference-activity-events";
import { refreshConferenceActivityEvent } from "../src/core/v2-conference-activity-refresh";
import { replaceConferenceMentorContact, replaceConferenceScholarContact } from "../src/core/v2-conference-contacts";
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
  it.each(["big-bull-coop", "opposite-scholar"])("never restores a replaced person from a queued %s result", (optionId) => {
    const { state, root } = fixture("A", 12, 0.99);
    const final = result(decision(root), optionId);
    const contacts = final.conferenceActivityPreview!.contacts!;
    const replacementMentor = replaceConferenceMentorContact(contacts.bigBull!);
    const replacementScholar = replaceConferenceScholarContact(contacts.scholars!.smart!, "smart");
    const current = { ...state, conferenceEncounterState: { ...state.conferenceEncounterState,
      bigBull: replacementMentor, scholars: { smart: replacementScholar },
    }, eventQueue: [createEventQueueItem(final, 1)] };
    const before = structuredClone(current);
    const refreshed = refreshConferenceActivityEvent(current, final);
    expect(refreshed.choices[0]!.id).toBe("change-activity");
    expect(refreshed.choices[0]!.effects.conferenceEncounterUpdates).toBeUndefined();
    expect(choose(current, "close").conferenceEncounterState).toEqual(current.conferenceEncounterState);
    const menu = refreshed.choices[0]!.effects.enqueueEvents![0]!;
    expect(menu.conferenceActivityPreview!.contacts!.bigBull).toEqual(replacementMentor);
    expect(menu.conferenceActivityPreview!.contacts!.scholars!.smart).toEqual(replacementScholar);
    expect(current).toEqual(before);
  });

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
    expect(final.choices[0]!.effects.social).toBe(0.6);
    expect(final.description).toContain("社交 +0.6（抵抗0.4）");
    expect(updated.history).toEqual(event.history);
    expect(updated.queueOrder).toBe(8);
    expect(updated.conferenceActivityPreview?.rolls).toEqual(source.conferenceActivityPreview?.rolls);
    expect(updated.conferenceActivityPreview?.context).toEqual(root.conferenceActivityPreview?.context);
    expect(refreshPendingEventDecisions(JSON.parse(JSON.stringify(refreshed)))).toEqual(refreshed);
    expect(current).toEqual(before);
    expect(random).not.toHaveBeenCalled();
  });

  it("recomputes social eligibility using the same rolls, and restores the original menu when stats return", () => {
    const { state, root } = fixture("A", 5, 0.99);
    const higher = { ...state, player: { ...state.player, social: 6 } };
    const updated = refreshConferenceActivityEvent(higher, decision(root));
    expect(updated.choices.map((choice) => choice.id)).toContain("big-bull-coop");
    expect(updated.choices.map((choice) => choice.id)).toContain("opposite-scholar");
    expect(refreshConferenceActivityEvent(state, updated).choices).toEqual(decision(root).choices);
  });

  it("retains scholar contact but removes invitations when a lover is added", () => {
    const { state, root } = fixture("B", 12, 0.99);
    expect(decision(root).choices.some((choice) => choice.id === "opposite-scholar")).toBe(true);
    const current = { ...state, loverState: { ...state.loverState, active: true } };
    const updated = refreshConferenceActivityEvent(current, decision(root));
    expect(updated.choices.some((choice) => choice.id === "opposite-scholar")).toBe(true);
    expect(result(updated, "opposite-scholar").choices[0]!.effects.triggerLoverDevelopment).toBeUndefined();
    expect(result(updated, "opposite-scholar").choices[0]!.effects.loverIntimacyDelta).toBeLessThan(0);
  });

  it("recalculates selected results by ID even when the refreshed menu would no longer draw them", () => {
    const { state, root } = fixture("B", 5, 0.6);
    const final = result(decision(root), "tea-break");
    const current = { ...state, player: { ...state.player, social: 12 }, conferenceCareerState: { ...state.conferenceCareerState, enterpriseCount: 3 } };
    const freshMenu = refreshConferenceActivityEvent(current, decision(root));
    expect(freshMenu.choices.some((choice) => choice.id === "tea-break")).toBe(false);
    const updated = refreshConferenceActivityEvent(current, final);
    expect(updated.conferenceActivityPreview?.selectedOptionId).toBe("tea-break");
    expect(updated.choices[0]!.effects.social).toBe(0.6);
  });

  it("preserves the selected contact and type while reading current counts and resistance", () => {
    const { state, root } = fixture("B", 12, 0.99);
    const final = result(decision(root), "opposite-scholar");
    const contact = final.conferenceActivityPreview!.contacts!.scholars!.smart!;
    const current = { ...state, conferenceEncounterState: { ...state.conferenceEncounterState,
      scholars: { smart: { ...contact, encounterCount: 7 } },
    }, player: { ...state.player, social: 18 }, loverState: { ...state.loverState, active: true },
    loverProgressState: { ...state.loverProgressState, intimacy: 12 } };
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("rerolled"); });
    const updated = refreshConferenceActivityEvent(current, final);
    const effects = updated.choices[0]!.effects;
    expect(effects.conferenceEncounterUpdates?.scholars?.smart).toEqual({ ...contact, encounterCount: 8 });
    expect(effects.social).toBe(0.4);
    expect(effects.loverIntimacyDelta).toBe(-4.6);
    expect(effects.triggerLoverDevelopment).toBeUndefined();
    expect(effects.temporaryActionEffectUpdates).toEqual({ idea: { bonus: 2, extraActions: 2 } });
    expect(updated.conferenceActivityPreview).toEqual(final.conferenceActivityPreview);
    expect(refreshConferenceActivityEvent(current, JSON.parse(JSON.stringify(updated)))).toEqual(updated);
    expect(random).not.toHaveBeenCalled();
  });

  it("blocks a stale result when eligibility is lost and allows reselecting without settling it", () => {
    const { state, root } = fixture("B", 12, 0.99);
    const final = result(decision(root), "opposite-scholar");
    let current = { ...state, player: { ...state.player, social: 5 }, eventQueue: [createEventQueueItem(final, 1)] };
    const unchanged = choose(current, "close");
    expect(unchanged.player).toEqual(current.player);
    expect(unchanged.conferenceEncounterState).toEqual(current.conferenceEncounterState);
    expect(unchanged.eventQueue[0]!.choices[0]!.id).toBe("change-activity");
    current = choose(unchanged, "change-activity");
    expect(current.eventQueue[0]!.stage).toBe("act2");
    expect(current.eventQueue[0]!.choices.some((choice) => choice.id === "opposite-scholar")).toBe(false);
    expect(current.player).toEqual({ ...state.player, social: 5 });
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
    expect(current.player.social).toBe(12.6);
    expect(current.player.san).toBe(10);
    const repeated = dispatchAction(current, "resolve-event", { eventId: finalId, eventChoiceId: "close" });
    expect(repeated.player).toEqual(current.player);
  });

  it("refreshes an already-open menu through debug attribute changes", () => {
    const { state, root } = fixture();
    const current = { ...state, eventQueue: [createEventQueueItem(decision(root), 1)] };
    const updated = dispatchAction(current, "debug-adjust-stat", { debugStatId: "social", delta: 7 });
    expect(result(updated.eventQueue[0]!, "tea-break").choices[0]!.effects.social).toBe(0.6);
  });

  it("uses the same extra-action wording in the event result and the earned Buff", () => {
    const { state, root } = fixture();
    let current = { ...state, eventQueue: [createEventQueueItem(root, 1)] };
    current = choose(current, "continue");
    current = choose(current, "experiment-discussion");
    expect(current.eventQueue[0]!.description).toContain("下次做实验 +3 次");
    current = choose(current, "close");
    expect(current.buffs).toContainEqual(expect.objectContaining({
      name: "下次做实验 +3 次",
      timing: "next-action",
      actionEffects: { experiment: { extraActions: 3 } },
    }));
    expect(current.player.san).toBe(state.player.san);
  });

  it("removes experiment experience and enterprise networking from the base menu", () => {
    const { state, root } = fixture("C", 5, 0.7);
    const menu = getResolvableQueuedEvent(state, createEventQueueItem(decision(root), 1));
    expect(menu.choices.some((entry) => entry.id === "peer-collaboration" || entry.id === "enterprise-networking")).toBe(false);
  });

  it("freezes person identity across all stages and creates no persisted contacts before confirmation", () => {
    const { state, root } = fixture("A", 6, 0.99);
    const before = structuredClone(state);
    const contact = root.conferenceActivityPreview!.contacts!.bigBull!;
    for (const source of [root, decision(root), result(decision(root), "big-bull-coop")]) {
      const updated = refreshConferenceActivityEvent(state, source);
      expect(updated.conferenceActivityPreview!.contacts!.bigBull).toEqual(contact);
      expect(refreshConferenceActivityEvent(state, JSON.parse(JSON.stringify(updated)))).toEqual(updated);
    }
    expect(state).toEqual(before);
    expect(state.conferenceEncounterState.bigBull).toBeUndefined();
    const queued = { ...state, eventQueue: [createEventQueueItem(result(decision(root), "big-bull-coop"), 1)] };
    expect(choose(queued, "close").conferenceEncounterState.bigBull).toEqual({ ...contact, cooperationCount: 1 });
  });
});
