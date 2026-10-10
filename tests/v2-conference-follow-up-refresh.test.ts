import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createConferenceMentorContact, createConferenceScholarContact } from "../src/core/v2-conference-contacts";
import { buildJointTrainingContext, createJointTrainingAct1, refreshJointTrainingEvent } from "../src/core/v2-joint-training-events";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1, refreshLoverDevelopmentEvent } from "../src/core/v2-lover-events";
import { activateLover } from "../src/core/v2-lover-system";
import type { GameState, LoverTypeId, PendingEvent } from "../src/core/v2-types";

function makeState(): GameState {
  const state = createInitialState();
  return {
    ...state, phase: "playing", totalMonths: 6, totalCitations: 399,
    conferenceEncounterState: {
      ...state.conferenceEncounterState,
      bigBull: { ...createConferenceMentorContact({ id: "mentor", levelRoll: 0.99 }), cooperationCount: 3 },
      scholars: {
        beautiful: { ...createConferenceScholarContact("beautiful", { id: "beautiful" }), encounterCount: 3 },
        smart: { ...createConferenceScholarContact("smart", { id: "smart" }), encounterCount: 4 },
      },
    },
  };
}

function next(event: PendingEvent, choice: string): PendingEvent {
  return event.choices.find((entry) => entry.id === choice)!.effects.enqueueEvents![0]!;
}

function loverRoot(state: GameState, type: LoverTypeId): PendingEvent {
  return createLoverDevelopmentAct1(buildLoverDevelopmentContext({
    state, conferenceEncounterState: state.conferenceEncounterState,
    type, totalMonths: state.totalMonths, playerGender: "male",
  }));
}

function choose(state: GameState, eventChoiceId: string): GameState {
  return dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]!.id, eventChoiceId });
}

afterEach(() => vi.restoreAllMocks());

describe("conference follow-up invitation refresh", () => {
  it.each([0, 1, 2] as const)("freezes the level %s mentor and invitation citation reward across all stages", (level) => {
    const state = makeState();
    state.conferenceEncounterState.bigBull!.level = level;
    const root = createJointTrainingAct1(buildJointTrainingContext(state));
    const act2 = next(root, "continue");
    const result = next(act2, "accept");
    const original = structuredClone(root);
    state.totalCitations = 9000;
    state.conferenceEncounterState.bigBull = { ...state.conferenceEncounterState.bigBull!, name: "不会覆盖邀请姓名", level: 2, cooperationCount: 7 };
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("refresh must not reroll"); });
    for (const event of [root, act2, result]) {
      const refreshed = refreshJointTrainingEvent(state, { ...event, queueOrder: 7 });
      expect(refreshed.queueOrder).toBe(7);
      expect(refreshed.jointTrainingPreview?.context).toMatchObject({
        invitationCitations: 399, pendingCitationCapBonus: level + 1,
        contact: { name: root.jointTrainingPreview!.context.contact!.name, level, cooperationCount: 7 },
      });
    }
    expect(refreshJointTrainingEvent(state, result).choices[0]!.effects).toMatchObject({
      ideaBonus: 4 + level, writingBonus: 4 + level,
      researchCapacityStateDeltas: { jointTrainingCitationCapBonus: level + 1 },
    });
    expect(root).toEqual(original);
    expect(random).not.toHaveBeenCalled();
    expect(act2.description).not.toContain("机制结算");
  });

  it("commits a joint-training reward once on the third-stage confirmation", () => {
    const base = makeState();
    const root = createJointTrainingAct1(buildJointTrainingContext(base));
    const act2 = next(root, "continue");
    expect(Object.keys(act2.choices.find((choice) => choice.id === "accept")!.effects)).toEqual(["enqueueEvents"]);
    let state = choose(choose({ ...base, eventQueue: [createEventQueueItem(root, 1)] }, "continue"), "accept");
    expect(state.buffs).toEqual(base.buffs);
    expect(state.conferenceEncounterState.jointTrainingReward).toBeUndefined();
    expect(state.eventQueue[0]!.deferredStatePatch).toBeUndefined();
    const result = state.eventQueue[0]!;
    state = choose(state, "close");
    expect(state.conferenceEncounterState.jointTrainingReward).toEqual({
      mentorId: base.conferenceEncounterState.bigBull!.id, mentorName: base.conferenceEncounterState.bigBull!.name,
      ideaBonus: 6, writingBonus: 6, capBonus: 3,
    });
    expect(state.researchCapacityState.jointTrainingCitationCapBonus).toBe(3);
    expect(state.buffs).toHaveLength(base.buffs.length + 2);
    expect(refreshJointTrainingEvent(state, result).choices[0]!.effects).toEqual({});
    const replay = choose({ ...state, eventQueue: [result] }, "close");
    expect(replay.buffs).toEqual(state.buffs);
    expect(replay.researchCapacityState).toEqual(state.researchCapacityState);
  });

  it("supports repeated joint-training refusals and replaces only at confirmation", () => {
    let state = makeState();
    for (let rejection = 0; rejection < 4; rejection += 1) {
      const previous = state.conferenceEncounterState.bigBull!;
      const root = createJointTrainingAct1(buildJointTrainingContext(state));
      state = choose(choose({ ...state, eventQueue: [createEventQueueItem(root, 1)] }, "continue"), "decline");
      expect(state.conferenceEncounterState.bigBull).toEqual(previous);
      expect(state.eventQueue[0]!.deferredStatePatch).toBeUndefined();
      const replacement = state.eventQueue[0]!.jointTrainingPreview!.context.replacement;
      state = choose(state, "close");
      expect(state.conferenceEncounterState.bigBull).toEqual(replacement);
      expect(replacement?.id).not.toBe(previous.id);
      expect(replacement?.name).not.toBe(previous.name);
      expect(state.conferenceEncounterState).toMatchObject({ bigBullCoopCount: 0, bigBullDeepCount: 0, rejectedBigBullCoopCount: 0, permanentlyBlockedBigBullCoop: false });
      expect(replacement?.cooperationCount).toBe(0);
    }
  });

  it.each(["beautiful", "smart"] as const)("accepts %s with a frozen identity, a one-time reward, and a new conference contact", (type) => {
    const base = makeState();
    base.totalCitations = 0;
    base.player.research = 20.9;
    base.researchCapacityState.otherCapBonus = 1;
    const contact = base.conferenceEncounterState.scholars![type]!;
    const otherType = type === "beautiful" ? "smart" : "beautiful";
    const root = loverRoot(base, type);
    const act2 = next(root, "continue");
    expect(act2.description).toContain(contact.name);
    expect(Object.keys(act2.choices.find((choice) => choice.id === "accept")!.effects)).toEqual(["enqueueEvents"]);
    let state = choose(choose({ ...base, eventQueue: [createEventQueueItem(root, 1)] }, "continue"), "accept");
    expect(state.loverState.active).toBe(false);
    expect(state.player.research).toBe(base.player.research);
    expect(state.sanCap).toBe(base.sanCap);
    expect(state.conferenceEncounterState).toEqual(base.conferenceEncounterState);
    expect(state.eventQueue[0]!.deferredStatePatch).toBeUndefined();
    const result = state.eventQueue[0]!;
    state = choose(state, "close");
    expect(state.loverState).toMatchObject({ active: true, contactId: contact.id, name: contact.name, gender: contact.gender });
    expect(state.relationshipState.loverCount).toBe(1);
    expect(state.loverProgressState.active).toBe(true);
    expect(state.sanCap).toBe(base.sanCap + (type === "beautiful" ? 3 : 0));
    expect(state.player.research).toBe(type === "smart" ? 21 : 20.9);
    expect(state.conferenceEncounterState.scholars![type]).toMatchObject({ encounterCount: 0 });
    expect(state.conferenceEncounterState.scholars![type]!.id).not.toBe(contact.id);
    expect(state.conferenceEncounterState.scholars![type]!.name).not.toBe(contact.name);
    expect(state.conferenceEncounterState.scholars![otherType]).toEqual(base.conferenceEncounterState.scholars![otherType]);
    expect(refreshLoverDevelopmentEvent(state, result).choices[0]!.effects).toEqual({});
  });

  it.each(["beautiful", "smart"] as const)("replaces only the refused %s contact repeatedly, preserving live other-type progress", (type) => {
    let state = makeState();
    const otherType = type === "beautiful" ? "smart" : "beautiful";
    for (let rejection = 0; rejection < 4; rejection += 1) {
      const previous = state.conferenceEncounterState.scholars![type]!;
      const root = loverRoot(state, type);
      state = choose(choose({ ...state, eventQueue: [createEventQueueItem(root, 1)] }, "continue"), "decline");
      expect(state.conferenceEncounterState.scholars![type]).toEqual(previous);
      const other = { ...state.conferenceEncounterState.scholars![otherType]!, encounterCount: 40 + rejection };
      state = { ...state, conferenceEncounterState: { ...state.conferenceEncounterState,
        scholars: { ...state.conferenceEncounterState.scholars, [otherType]: other } } };
      state = choose(state, "close");
      expect(state.conferenceEncounterState.scholars![type]!.id).not.toBe(previous.id);
      expect(state.conferenceEncounterState.scholars![type]!.name).not.toBe(previous.name);
      expect(state.conferenceEncounterState.scholars![type]!.encounterCount).toBe(0);
      expect(state.conferenceEncounterState.scholars![otherType]).toEqual(other);
      expect(state.conferenceEncounterState.permanentlyBlockedBeautifulLover).toBe(false);
      expect(state.conferenceEncounterState.permanentlyBlockedSmartLover).toBe(false);
    }
  });

  it("refreshes smart rewards using the current resistance tier and player cap without random draws", () => {
    const state = makeState();
    const root = loverRoot(state, "smart");
    const act2 = next(root, "continue");
    const result = next(act2, "accept");
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("refresh must not reroll"); });
    for (const [research, bonus, expected] of [[6, 0, 0.8], [20, 2, 0.4], [21.9, 2, 0.1], [22, 2, 0]] as const) {
      const current = { ...state, player: { ...state.player, research }, researchCapacityState: { ...state.researchCapacityState, otherCapBonus: bonus } };
      for (const event of [root, act2, result]) {
        let refreshed = refreshLoverDevelopmentEvent(current, event);
        if (refreshed.stage === "act1") refreshed = next(refreshed, "continue");
        if (refreshed.stage === "act2") refreshed = next(refreshed, "accept");
        expect(refreshed.choices[0]!.effects.research).toBe(expected);
        expect(refreshed.loverDevelopmentPreview!.context.contact).toEqual(root.loverDevelopmentPreview!.context.contact);
      }
    }
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["beautiful", "smart"] as const)("suppresses %s rewards and replacements when another lover appears at any stage", (type) => {
    const state = makeState();
    const root = loverRoot(state, type);
    const act2 = next(root, "continue");
    const result = next(act2, "accept");
    const occupied = { ...state, loverState: activateLover("smart", 1, "male"), relationshipState: { ...state.relationshipState, loverCount: 1 } };
    for (const event of [root, act2, result]) {
      let refreshed = refreshLoverDevelopmentEvent(occupied, event);
      if (refreshed.stage === "act1") refreshed = next(refreshed, "continue");
      if (refreshed.stage === "act2") {
        expect(refreshed.choices.find((choice) => choice.id === "accept")!.label).toBe("暂时放下");
        refreshed = next(refreshed, "accept");
      }
      expect(refreshed.choices[0]!.effects).toEqual({});
      expect(refreshed.description).toContain("不计拒绝次数");
    }
    const resumed = refreshLoverDevelopmentEvent(state, refreshLoverDevelopmentEvent(occupied, result));
    expect(resumed.choices[0]!.effects.relationshipAdditions).toEqual(["lover"]);
    const occupiedDecision = refreshLoverDevelopmentEvent(occupied, act2);
    const setAsideResult = next(occupiedDecision, "accept");
    expect(setAsideResult.loverDevelopmentPreview?.context.setAside).toBe(true);
    const afterBreakup = refreshLoverDevelopmentEvent(state, setAsideResult);
    expect(afterBreakup.description).not.toContain("已有恋人");
    expect(afterBreakup.choices[0]!.effects.relationshipAdditions).toEqual(["lover"]);
  });

  it("suppresses old contact decisions once another contact has replaced that person", () => {
    const state = makeState();
    const joint = createJointTrainingAct1(buildJointTrainingContext(state));
    const lover = loverRoot(state, "smart");
    state.conferenceEncounterState.bigBull = createConferenceMentorContact({ id: "new-mentor" });
    state.conferenceEncounterState.scholars!.smart = createConferenceScholarContact("smart", { id: "new-smart" });
    for (const decision of ["accept", "decline"]) {
      expect(refreshJointTrainingEvent(state, next(next(joint, "continue"), decision)).choices[0]!.effects).toEqual({});
      expect(refreshLoverDevelopmentEvent(state, next(next(lover, "continue"), decision)).choices[0]!.effects).toEqual({});
    }
  });

  it("samples lover initialization once and clears stale deferred patches during refresh", () => {
    const state = makeState();
    const getRoll = vi.fn().mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
    const context = buildLoverDevelopmentContext({ state, conferenceEncounterState: state.conferenceEncounterState,
      type: "smart", totalMonths: 6, playerGender: "male" }, getRoll);
    expect(getRoll).toHaveBeenCalledTimes(2);
    const result = next(next(createLoverDevelopmentAct1(context), "continue"), "accept");
    expect(result.choices[0]!.label).toBe("确定");
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("refresh must not reroll"); });
    const refreshed = refreshLoverDevelopmentEvent(state, { ...result, deferredStatePatch: [] });
    expect(refreshed.deferredStatePatch).toBeUndefined();
    expect(refreshed.choices[0]!.effects.loverProgressRolls).toEqual([0.9, 0.1]);
    const joint = createJointTrainingAct1(buildJointTrainingContext(state));
    expect(refreshJointTrainingEvent(state, { ...joint, deferredStatePatch: [] }).deferredStatePatch).toBeUndefined();
    expect(random).not.toHaveBeenCalled();
  });

  it("freezes deterministic replacement mentor levels without collapsing every replacement to level one", () => {
    const levels = new Set<number>();
    const state = makeState();
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replacement must not reroll"); });
    for (let index = 0; index < 30; index += 1) {
      state.conferenceEncounterState.bigBull = createConferenceMentorContact({ id: `mentor-${index}` });
      const context = buildJointTrainingContext(state);
      levels.add(context.replacement!.level);
      expect(buildJointTrainingContext(state).replacement).toEqual(context.replacement);
      expect(context.replacement!.name).not.toBe(context.contact!.name);
    }
    expect([...levels].sort()).toEqual([0, 1, 2]);
    expect(random).not.toHaveBeenCalled();
  });
});
