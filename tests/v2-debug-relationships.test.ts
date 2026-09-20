import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import * as fellowProgression from "../src/core/v2-fellow-progression";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { getRoleDefinition } from "../src/core/v2-progression";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { RANDOM_ADVISOR_GIVEN_CHARS, RANDOM_ADVISOR_SURNAMES } from "../src/core/v2-random-name";
import type { DispatchPayload, GameState, RoleId } from "../src/core/v2-types";

const fellowCountKeys = { senior: "seniorCount", junior: "juniorCount", peer: "peerCount" } as const;
const relationshipTypes = ["senior", "junior", "peer", "lover"] as const;

function startGame(roleId: RoleId = "normal") {
  return dispatchAction(createInitialState(), "start-game", { roleId });
}

function admittedState() {
  let state = startGame();
  for (const eventChoiceId of [
    "before-grad-school-open-advisor-info",
    "before-grad-school-confirm",
    "before-grad-school-finish",
  ]) {
    state = dispatchAction(state, "resolve-event", { eventChoiceId });
  }
  return dispatchAction(state, "next-month");
}

function fillFellowCards(state: GameState) {
  for (const debugRelationshipType of ["senior", "junior", "peer", "senior"] as const) {
    state = dispatchAction(state, "debug-add-relationship", { debugRelationshipType });
  }
  return state;
}

function expectFullGeneratedName(name: string | undefined) {
  expect(name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
  expect(RANDOM_ADVISOR_SURNAMES).toContain(name?.[0]);
  for (const character of name?.slice(1) ?? "") {
    expect(RANDOM_ADVISOR_GIVEN_CHARS).toContain(character);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("v2 debug relationship additions", () => {
  it.each(relationshipTypes)("randomizes each new %s name even when month and occupancy stay the same", (type) => {
    const initial = admittedState();
    const state: GameState = { ...initial, month: 6, totalMonths: 6, eventQueue: [], availableRandomEvents: [] };
    const random = vi.spyOn(Math, "random").mockReturnValue(0.2);
    const first = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: type });
    const firstName = type === "lover" ? first.loverState.name : first.fellowProgressState[0]?.name;
    const relationshipId = type === "lover" ? "lover" : first.fellowProgressState[0]!.id;
    const removed = dispatchAction(first, "end-relationship", { relationshipId });

    random.mockReturnValue(0.8);
    for (const base of [state, removed]) {
      const added = dispatchAction(base, "debug-add-relationship", { debugRelationshipType: type });
      const name = type === "lover" ? added.loverState.name : added.fellowProgressState[0]?.name;
      expectFullGeneratedName(name);
      expect(name).not.toBe(firstName);
      expect(added.totalMonths).toBe(state.totalMonths);
    }
    expectFullGeneratedName(firstName);
    expect(type === "lover" ? first.loverState.name : first.fellowProgressState[0]?.name).toBe(firstName);
  });

  it.each(["setup", "finished"] as const)("keeps debug tools inactive during %s", (phase) => {
    const state: GameState = phase === "setup"
      ? createInitialState()
      : { ...admittedState(), phase, ending: "burnout" };
    const before = structuredClone(state);

    for (const debugRelationshipType of relationshipTypes) {
      const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType });

      expect(next).toEqual(phase === "finished" ? before : {
        ...before,
        log: [expect.objectContaining({ text: "开始本轮后才能使用测试工具。" }), ...before.log],
      });
      expect(state).toEqual(before);
    }
  });

  it.each(["senior", "junior", "peer"] as const)("adds a generated %s with an untouched paper before and after enrollment", (type) => {
    const generated = fellowProgression.createGeneratedFellowProfileAddition(type, 23);
    const generator = vi.spyOn(fellowProgression, "createGeneratedFellowProfileAddition").mockReturnValue(generated);
    const preEnrollment = startGame();
    const admitted = admittedState();
    expect(preEnrollment.eventQueue[0]?.chainId).toBe("before-grad-school");
    expect(admitted.relationshipState.advisorCount).toBe(1);
    expect(admitted.totalMonths).toBeGreaterThan(0);

    for (const state of [preEnrollment, admitted]) {
      const before = structuredClone(state);
      const expectedProfile = fellowProgression.createCustomFellowProgressProfile({
        ...generated,
        startTotalMonths: before.totalMonths,
      });
      const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: type });

      expect(generator).toHaveBeenLastCalledWith(type, expect.any(Number));
      expect(next).toEqual({
        ...before,
        fellowProgressState: [...before.fellowProgressState, { ...expectedProfile, id: expect.any(String), researchTopic: fellowProgression.getFellowResearchTopic({ ...next.fellowProgressState.at(-1)!, researchTopic: undefined }) }],
        fellowPapers: [...(before.fellowPapers ?? []), expect.objectContaining({
          leadAuthorId: next.fellowProgressState.at(-1)!.id,
          leadAuthorName: expectedProfile.name,
          createdTotalMonths: before.totalMonths,
          status: "draft", idea: 0, experiment: 0, writing: 0,
        })],
        relationshipState: {
          ...before.relationshipState,
          [fellowCountKeys[type]]: before.relationshipState[fellowCountKeys[type]] + 1,
          occupiedSlots: before.relationshipState.occupiedSlots + 1,
          unlockedSlots: Math.max(before.relationshipState.unlockedSlots, before.fellowProgressState.length + 2),
        },
        log: next.log,
      });
      expect(next.log).toHaveLength(before.log.length + 1);
      expect(state).toEqual(before);
    }
  });

  it("unlocks up to four fellow cards without social gains or resetting advisor counters, then rejects overflow", () => {
    const admitted = admittedState();
    let state: GameState = {
      ...admitted,
      player: { ...admitted.player, social: 0 },
      relationshipState: { ...admitted.relationshipState, mentorshipStacks: 3 },
      actionState: { used: 1, limit: 2, aiResearchBonusUsed: true },
    };
    expect(state.relationshipState.advisorCount).toBe(1);

    for (const type of ["senior", "junior", "peer", "senior"] as const) {
      const before = structuredClone(state);
      const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: type });

      expect(next).toEqual({
        ...before,
        fellowProgressState: [...before.fellowProgressState, expect.objectContaining({ type })],
        fellowPapers: [...(before.fellowPapers ?? []), expect.objectContaining({
          leadAuthorId: next.fellowProgressState.at(-1)!.id,
          status: "draft", idea: 0, experiment: 0, writing: 0,
        })],
        relationshipState: {
          ...before.relationshipState,
          [fellowCountKeys[type]]: before.relationshipState[fellowCountKeys[type]] + 1,
          occupiedSlots: before.relationshipState.occupiedSlots + 1,
          unlockedSlots: before.fellowProgressState.length + 2,
        },
        log: next.log,
      });
      expect(state).toEqual(before);
      state = next;
    }
    expect(state.relationshipState).toMatchObject({ occupiedSlots: 4, unlockedSlots: 5, advisorCount: 1 });
    expect(new Set(state.fellowProgressState.map((profile) => profile.id)).size).toBe(4);

    const before = structuredClone(state);
    for (const debugRelationshipType of ["senior", "junior", "peer"] as const) {
      const overflow = dispatchAction(state, "debug-add-relationship", { debugRelationshipType });
      expect(overflow).toEqual({ ...before, log: overflow.log });
      expect(overflow.log).toHaveLength(before.log.length + 1);
      expect(overflow.log[0]?.text).toMatch(/4|四|已满|上限/);
      expect(state).toEqual(before);
    }
  });

  it("creates only the smart lover fixtures before and after enrollment using the role's gender", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const state of [startGame("rich"), admittedState()]) {
      const before = structuredClone(state);
      const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: "lover" });

      expect(next).toEqual({
        ...before,
        relationshipState: { ...before.relationshipState, loverCount: 1 },
        loverState: {
          ...activateLover("smart", before.totalMonths, getRoleDefinition(before.selectedRoleId).gender),
          name: expect.any(String),
        },
        loverProgressState: createLoverProgressState("smart", () => 0.5),
        log: next.log,
      });
      expect(next.log).toHaveLength(before.log.length + 1);
      expectFullGeneratedName(next.loverState.name);
      expect(state).toEqual(before);
    }
  });

  it.each(["senior", "junior", "peer"] as const)("stores full names through real debug %s additions for both genders and preserves them next month", (type) => {
    const initial = admittedState();
    const totalMonths = 6;
    for (const seed of [6, 7]) {
      const state: GameState = {
        ...initial, month: totalMonths, totalMonths, eventQueue: [], availableRandomEvents: [],
      };
      vi.spyOn(Math, "random").mockReturnValueOnce(seed / 0x100000000);
      const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: type });
      const profile = next.fellowProgressState[0];

      expect(profile?.gender).toBe(seed === 6 ? "male" : "female");
      expect(profile?.name).toBe(fellowProgression.getStableGeneratedFellowName(seed, profile!.gender));
      expectFullGeneratedName(profile?.name);
      const progressed = dispatchAction(next, "next-month");
      expect(progressed.totalMonths).toBe(totalMonths + 1);
      expect(progressed.fellowProgressState[0]?.name).toBe(profile?.name);
      expect(progressed.fellowProgressState[0]?.id).toBe(profile?.id);
    }
  });

  it("preserves the real debug lover's stored name after monthly progression", () => {
    const initial = admittedState();
    const state: GameState = { ...initial, month: 6, totalMonths: 6, eventQueue: [], availableRandomEvents: [] };
    const added = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: "lover" });
    const progressed = dispatchAction(added, "next-month");

    expectFullGeneratedName(added.loverState.name);
    expect(progressed.totalMonths).toBe(7);
    expect(progressed.loverState.name).toBe(added.loverState.name);
  });

  it("adds an independent lover when the advisor and all four fellow cards are occupied", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = fillFellowCards(admittedState());
    const before = structuredClone(state);
    expect(before.fellowProgressState).toHaveLength(4);
    expect(before.relationshipState).toMatchObject({ occupiedSlots: 4, unlockedSlots: 5 });

    const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: "lover" });

    expect(next).toEqual({
      ...before,
      relationshipState: { ...before.relationshipState, loverCount: 1 },
      loverState: {
        ...activateLover("smart", before.totalMonths, getRoleDefinition(before.selectedRoleId).gender),
        name: expect.any(String),
      },
      loverProgressState: createLoverProgressState("smart", () => 0.5),
      log: next.log,
    });
    expect(state).toEqual(before);
  });

  it("keeps an existing lover and all accumulated progress on repeated additions", () => {
    const admitted = admittedState();
    const state: GameState = {
      ...admitted,
      relationshipState: { ...admitted.relationshipState, loverCount: 1 },
      loverState: { ...activateLover("beautiful", 0, "male"), beautifulExtraRecoveryRate: 7 },
      loverProgressState: {
        ...createLoverProgressState(),
        active: true,
        research: 5,
        intimacy: 8,
        taskProgress: 23,
        relationProgress: 17,
        canInteract: true,
        taskUsedThisMonth: true,
        completedTaskCount: 2,
      },
    };
    const before = structuredClone(state);
    const next = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: "lover" });
    const repeated = dispatchAction(next, "debug-add-relationship", { debugRelationshipType: "lover" });

    for (const result of [next, repeated]) {
      expect(result).toEqual({ ...before, log: result.log });
      expect(result.loverState).toBe(state.loverState);
      expect(result.loverProgressState).toBe(state.loverProgressState);
      expect(result.log[0]?.text).toMatch(/已有.*恋人|恋人.*已|重复/);
    }
    expect(next.log).toHaveLength(before.log.length + 1);
    expect(state).toEqual(before);
  });

  it("returns the same playing state for missing or invalid runtime relationship types", () => {
    for (const state of [startGame(), admittedState()]) {
      const before = structuredClone(state);
      expect(dispatchAction(state, "debug-add-relationship")).toBe(state);

      for (const invalidType of [undefined, null, "", "advisor", "invalid", "toString", 1, {}]) {
        const payload = { debugRelationshipType: invalidType } as DispatchPayload;
        expect(dispatchAction(state, "debug-add-relationship", payload)).toBe(state);
      }
      expect(state).toEqual(before);
    }
  });
});

describe("v2 natural relationship names", () => {
  it.each([
    { eventId: 10, type: "peer", choice: "full" },
    { eventId: 11, type: "senior", choice: "deep" },
    { eventId: 14, type: "junior", choice: "idea" },
  ] as const)("stores the generated $type name only when its natural event is confirmed", ({ eventId, type, choice }) => {
    const initial = admittedState();
    for (const roll of [0.25, 0.75]) {
      const serial = 23;
      let state: GameState = {
        ...initial,
        month: 6,
        totalMonths: 6,
        totalRandomEventCount: serial,
        eventQueue: [],
        availableRandomEvents: [],
        player: { ...initial.player, social: 8 },
        relationshipState: { ...initial.relationshipState, unlockedSlots: 5 },
      };
      const event = createRandomEventById(eventId, state, () => roll).event;
      if (!event) throw new Error(`Missing relationship event ${eventId}`);
      state.eventQueue = [createEventQueueItem(event, 1)];

      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]?.id });
      state = dispatchAction(state, "resolve-event", {
        eventId: state.eventQueue[0]?.id,
        eventChoiceId: `random-${eventId}-${choice}-${serial}`,
      });
      expect(state.fellowProgressState).toHaveLength(0);
      expect(state.eventQueue[0]?.stage).toBe("result");
      state = dispatchAction(state, "resolve-event", {
        eventId: state.eventQueue[0]?.id,
        eventChoiceId: state.eventQueue[0]?.choices[0]?.id,
      });

      const profile = state.fellowProgressState[0];
      const gender = roll < 0.5 ? "male" : "female";
      expect(profile).toMatchObject({ type, gender, name: fellowProgression.getStableGeneratedFellowName(serial, gender) });
      expectFullGeneratedName(profile?.name);
      const progressed = dispatchAction(state, "next-month");
      expect(progressed.totalMonths).toBe(7);
      expect(progressed.fellowProgressState[0]?.name).toBe(profile?.name);
    }
  });
});
