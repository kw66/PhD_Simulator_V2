import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowCooperation } from "../src/core/v2-fellow-cooperation";
import { advanceLoverDate, createLoverProgressState, getLoverNextReward, getLoverRouteGain, settlePendingLoverHelp } from "../src/core/v2-lover-progression";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { activateLover } from "../src/core/v2-lover-system";
import { generateRelationshipResearch } from "../src/core/v2-relationship-research";
import { clampResearchToCap, createResearchCapacityState } from "../src/core/v2-research-cap-system";
import { refreshSummerVacationEvent, resolveSummerVacationFixedEvent } from "../src/core/v2-fixed-events-summer";
import { createBaseConferenceActivityOptions } from "../src/core/v2-conference-activity-base-options";
import { createAdvancedConferenceActivityOptions } from "../src/core/v2-conference-activity-advanced-options";
import { createConferenceDecisionAct1, refreshConferenceDecision } from "../src/core/v2-conference-events";
import { scheduleConferenceAttendance, settleDueConferenceAttendance } from "../src/core/v2-conference-attendance";
import { createSocialCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import type { GameState, PendingEvent } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

function stateWithDecimals(): GameState {
  const state = createStartedGameState("normal");
  return { ...state, eventQueue: [], buffs: [], year: 2, month: 7, totalMonths: 19,
    player: { ...state.player, research: 6.75, social: 12.5, favor: 18.25, san: 10, money: 30 } };
}

const conference = {
  id: "decimal-conference", conferenceName: "CVPR", conferenceYear: 2026,
  city: "合肥", country: "中国", region: "domestic" as const, grade: "A" as const,
  paperCount: 1, paperIds: [],
};

function conferenceState(state: GameState) {
  return { ...state, research: state.player.research, social: state.player.social,
    favor: state.player.favor, money: state.player.money };
}

function resultChoices(event: PendingEvent): PendingEvent["choices"] {
  return event.stage === "act2" ? event.choices
    : event.choices.flatMap((choice) => (choice.effects.enqueueEvents ?? []).flatMap(resultChoices));
}

describe("decimal attributes across module boundaries", () => {
  it("preserves fractional research through caps and fellow recruitment", () => {
    const research = generateRelationshipResearch(2, () => 0.99);
    expect(research).toBe(6.75);
    expect(clampResearchToCap(research, createResearchCapacityState())).toBe(research);
    expect(clampResearchToCap(20.75, { ...createResearchCapacityState(), otherCapBonus: 0.5 })).toBe(20.5);
    const state = stateWithDecimals();
    const next = applyChoiceEffectsToState(state, { id: "recruit", label: "recruit", outcome: "",
      effects: { fellowAdditions: [{ type: "peer", name: "陈青", gender: "male", research, affinity: 1.25 }] } }).nextState;
    expect(next.fellowProgressState[0]).toMatchObject({ research: 6.75, affinity: 1.25 });
  });

  it("retains fractional cooperation progress while keeping integer paper output", () => {
    const fellow = createCustomFellowProgressProfile({ type: "peer", research: 6.75, affinity: 1.25,
      gender: "male", name: "陈青", startTotalMonths: 1, identitySeed: "decimal" });
    const next = advanceFellowCooperation({ ...fellow, taskProgress: 99.5 }, 1.25, 12.5);
    expect(next).toMatchObject({ research: 6.75, affinity: 1.25, taskProgress: 0.75,
      pendingHelpToPlayer: 6.75, pendingHelpToFellow: 12.5 });
  });

  it.each(["player", "lover"] as const)("settles the lower %s research once without truncating", (recipient) => {
    const state = stateWithDecimals();
    state.loverState = activateLover("smart", 1, "male");
    state.loverProgressState = { ...createLoverProgressState("smart", () => 0.99, 2),
      research: recipient === "lover" ? 6.75 : 8.25,
      routes: { play: { progress: 0, completed: 0 }, study: { progress: 99, completed: 2 }, shopping: { progress: 0, completed: 0 } } };
    if (recipient === "lover") state.player.research = 8.25;
    expect(getLoverRouteGain(state, "study")).toBe(7);
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const next = advanceLoverDate(state, "study");
    expect(recipient === "player" ? next.player.research : next.loverProgressState.research).toBe(7.5);
    expect(recipient === "lover" ? next.player.research : next.loverProgressState.research).toBe(8.25);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("applies already resolved positive, negative and zero effects without another resistance pass", () => {
    const state = stateWithDecimals();
    const random = vi.spyOn(Math, "random");
    const next = applyChoiceEffectsToState(state, { id: "resolved", label: "finish", outcome: "",
      effects: { research: 0.75, social: -0.5, favor: 0 } }).nextState;
    expect(next.player).toMatchObject({ research: 7.5, social: 12, favor: 18.25 });
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps lover research decimal while previewing and logging integer paper output", () => {
    const state = stateWithDecimals();
    state.loverState = activateLover("smart", 1, "male");
    state.loverProgressState = { ...createLoverProgressState("smart", () => 0), research: 6.75,
      routes: { play: { progress: 0, completed: 0 }, study: { progress: 99, completed: 0 }, shopping: { progress: 0, completed: 0 } } };
    state.papers = [];
    expect(getLoverNextReward(state, "study")).toContain("论文最低项 +6分");
    const pending = advanceLoverDate(state, "study");
    expect(pending.loverProgressState.research).toBe(6.75);
    expect(pending.loverProgressState.pendingPaperHelp?.amount).toBe(6.75);
    const helped = settlePendingLoverHelp({ ...pending, papers: [createDraftPaper(1, 0, () => 0)] }, () => 0);
    expect(helped.papers[0]!.idea).toBe(6);
    expect(helped.log[0]!.text).toContain("idea +6");
    expect(helped.log[0]!.text).not.toContain("6.75");
  });

  it("refreshes summer from the raw reward, including a previously capped zero", () => {
    const state = stateWithDecimals();
    state.player.social = 20;
    const initial = resolveSummerVacationFixedEvent(state, { kind: "summer-vacation-travel" }, () => 0)!.enqueueEvents![0]!;
    expect(initial.choices[0]!.effects.social).toBe(0);
    state.player.social = 12.5;
    const random = vi.spyOn(Math, "random");
    const refreshed = refreshSummerVacationEvent(state, initial);
    expect(refreshed.choices[0]!.effects.social).toBe(0.5);
    expect(refreshSummerVacationEvent(state, refreshed)).toEqual(refreshed);
    expect(refreshed.description).toContain("社交 +0.5");
    expect(refreshed.description).not.toContain("抵抗1");
    const next = applyChoiceEffectsToState(state, refreshed.choices[0]!).nextState;
    expect(next.player).toMatchObject({ social: 13, money: 26 });
    expect(random).not.toHaveBeenCalled();
  });

  it("refreshes queued summer results from current decimals without settling during preview", () => {
    const state = stateWithDecimals();
    const result = resolveSummerVacationFixedEvent(state, { kind: "summer-vacation-travel" }, () => 0)!.enqueueEvents![0]!;
    const queued = createEventQueueItem({ ...result,
      fixedResultPreview: { resolution: { kind: "summer-vacation-travel" }, rolls: [0.1] } }, state.totalMonths);
    state.player.social = 19.9;
    const refreshed = getResolvableQueuedEvent(state, queued);
    expect(refreshed.choices[0]!.effects.social).toBeCloseTo(0.1);
    expect(state.player.social).toBe(19.9);
    expect(applyChoiceEffectsToState(state, refreshed.choices[0]!).nextState.player.social).toBe(20);
  });

  it("resolves conference raw attributes once and respects research above the base cap", () => {
    const state = stateWithDecimals();
    const tea = createBaseConferenceActivityOptions(conference, conferenceState(state)).find((option) => option.id === "tea-break")!;
    expect(tea.effects.social).toBe(0.5);
    expect(tea.outcome).toContain("社交 +0.5");
    expect(applyChoiceEffectsToState(state, { ...tea }).nextState.player.social).toBe(13);
    state.player.research = 20.25;
    state.researchCapacityState.otherCapBonus = 2;
    state.conferenceEncounterState.metSmart = true;
    const smart = createAdvancedConferenceActivityOptions(conferenceState(state)).find((option) => option.id === "smart-lover-development")!;
    expect(smart.effects.research).toBe(0.25);
    expect(applyChoiceEffectsToState(state, { ...smart }).nextState.player.research).toBe(20.5);
  });

  it("keeps campus social event random partitions stable across attribute tiers", () => {
    const build = (social: number, favor: number) => {
      const state = stateWithDecimals();
      state.player.social = social;
      state.player.favor = favor;
      const values = [0.8, 0.05, 0.1, 0.95, 0.8];
      const random = vi.fn(() => values.shift()!);
      const event = createSocialCampusRandomEvent(state, random);
      expect(random).toHaveBeenCalledTimes(5);
      return resultChoices(event);
    };
    const low = build(5.75, 5.75);
    const high = build(18.25, 18.25);
    expect(high.map((choice) => choice.id)).toEqual(low.map((choice) => choice.id));
    expect(high.map((choice) => choice.effects.money)).toEqual(low.map((choice) => choice.effects.money));
    expect(high.map((choice) => choice.effects.counterDeltas)).toEqual(low.map((choice) => choice.effects.counterDeltas));
    expect(high.some((choice) => choice.effects.social === 0.25)).toBe(true);
  });

  it("preserves conference option draws while refreshing decimal favor costs", () => {
    const state = stateWithDecimals();
    const values = Array.from({ length: 51 }, (_, index) => (index + 1) / 52);
    const random = vi.fn(() => values.shift() ?? 0.4);
    const root = createConferenceDecisionAct1(conference, conferenceState(state), random);
    expect(random).toHaveBeenCalledTimes(51);
    const confirmation = root.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "advisor")!.effects.enqueueEvents![0]!;
    const optionIds = (event: PendingEvent) => {
      const plan = event.choices[0]!.effects.scheduleConferenceAttendance!;
      const attended = settleDueConferenceAttendance(scheduleConferenceAttendance(state, plan));
      return attended.eventQueue[0]!.choices[0]!.effects.enqueueEvents![0]!.choices.map((choice) => choice.id);
    };
    state.player.favor = 6.25;
    const liveRandom = vi.spyOn(Math, "random");
    const refreshed = refreshConferenceDecision(state, confirmation);
    expect(refreshed.choices[0]!.effects.scheduleConferenceAttendance).toEqual(confirmation.choices[0]!.effects.scheduleConferenceAttendance);
    expect(optionIds(refreshed)).toEqual(optionIds(confirmation));
    expect(refreshed.choices[0]!.effects.favor).toBe(-0.75);
    expect(liveRandom).not.toHaveBeenCalled();
  });
});
