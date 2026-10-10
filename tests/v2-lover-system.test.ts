import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1, refreshLoverDevelopmentEvent } from "../src/core/v2-lover-events";
import {
  activateLover,
  getLoverName,
  getOppositeGender,
} from "../src/core/v2-lover-system";
import { getRoleDefinition } from "../src/core/v2-progression";
import { pickStableRandomName } from "../src/core/v2-random-name";
import type { GameState } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());

describe("v2 lover system", () => {
  it("always derives the lover as the selected role's opposite gender", () => {
    expect(getOppositeGender("male")).toBe("female");
    expect(getOppositeGender("female")).toBe("male");
    expect(activateLover("smart", 8, "male").gender).toBe("female");
    expect(activateLover("beautiful", 8, "female").gender).toBe("male");
  });

  it.each(["beautiful", "smart"] as const)("stores deterministic full names for %s lovers without drawing global randomness", (type) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.123);
    for (const playerGender of ["male", "female"] as const) {
      const lover = activateLover(type, 10, playerGender);
      expect(lover.name).toBe(pickStableRandomName(`lover:${type}:10:${getOppositeGender(playerGender)}`));
      expect(lover.name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
      expect(getLoverName(lover)).toBe(lover.name);
      expect(activateLover(type, 10, playerGender)).toEqual(lover);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps custom lover names and uses stable fallbacks for absent or blank names", () => {
    const original = activateLover("smart", 8, "male");
    const random = vi.spyOn(Math, "random");
    expect(getLoverName({ ...original, name: "  林知远  " })).toBe("林知远");
    for (const name of [undefined, "", " \t "]) {
      const lover = { ...original, name };
      const before = structuredClone(lover);
      expect(getLoverName(lover)).toBe(original.name);
      expect(getLoverName(lover)).toBe(original.name);
      expect(lover).toEqual(before);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["beautiful", "smart"] as const)("stores the %s lover name when accepting the natural event and preserves it next month", (type) => {
    const started = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    let state: GameState = {
      ...started, year: 1, month: 6, totalMonths: 6, eventQueue: [], availableRandomEvents: [],
    };
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: state.conferenceEncounterState,
      type,
      totalMonths: state.totalMonths,
      playerGender: getRoleDefinition(state.selectedRoleId).gender,
    });
    const expectedLover = { ...activateLover(type, context.totalMonths, context.playerGender),
      name: context.contact!.name, contactId: context.contact!.id };
    state.eventQueue = [createEventQueueItem(createLoverDevelopmentAct1(context), 1)];

    for (const eventChoiceId of ["continue", "accept"]) {
      expect(getResolvableQueuedEvent(state, state.eventQueue[0]!).narrativeNames).toEqual([expectedLover.name]);
      const eventId = state.eventQueue[0]?.id;
      state = dispatchAction(state, "resolve-event", { eventId, eventChoiceId });
    }
    expect(state.loverState.active).toBe(false);
    expect(state.eventQueue[0]?.narrativeNames).toEqual([expectedLover.name]);
    expect(state.eventQueue[0]?.description.split("机制结算")[1]?.trim()).toContain(
      `结果：恋人 +1（${type === "beautiful" ? "活泼" : "聪慧"}）`,
    );
    state = dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]?.id, eventChoiceId: "close" });

    expect(state.loverState).toEqual(expectedLover);
    expect(state.loverProgressState.active).toBe(true);
    expect(state.relationshipState.loverCount).toBe(1);
    const history = state.eventHistory.find((event) => event.chainId === "lover-development")!;
    expect(history.stages).toHaveLength(3);
    expect(history.stages.map((stage) => stage.narrativeNames)).toEqual(Array.from({ length: 3 }, () => [expectedLover.name]));
    const progressed = dispatchAction(state, "next-month");
    expect(progressed.totalMonths).toBe(7);
    expect(progressed.loverState.name).toBe(expectedLover.name);
    expect(getLoverName(progressed.loverState)).toBe(expectedLover.name);
  });

  it.each(["beautiful", "smart"] as const)("keeps %s scenes personal with inline emoji and separate settlement", (type) => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: state.conferenceEncounterState, type, totalMonths: 6, playerGender: "male",
      origin: "A类会议", state,
    }, () => 0.25);
    for (const availability of [{}, { canAddRelationship: false }, { contactAvailable: false }]) {
      const act1 = createLoverDevelopmentAct1({ ...context, ...availability });
      const act2 = act1.choices[0]!.effects.enqueueEvents![0]!;
      const results = act2.choices.map((choice) => choice.effects.enqueueEvents![0]!);
      expect(act1.description).toContain(`小提示：出现条件：与${context.contact!.name}搭讪≥3次（含本次），社交≥12，且没有恋人。`);
      expect(act1.choices[0]!.outcome).not.toContain("确认彼此心意");
      for (const scene of [act1, act2, ...results]) {
        const replacesContact = scene.loverDevelopmentPreview?.decision === "decline" && Object.keys(availability).length === 0;
        expect(scene.narrativeNames).toEqual(replacesContact ? [context.contact!.name, context.replacement!.name] : [context.contact!.name]);
        const story = scene.description.split(/小提示：|机制结算/u)[0]!.trim();
        expect(story.split("\n\n").length, scene.id).toBeGreaterThanOrEqual(2);
        expect(story.split("\n\n").length, scene.id).toBeLessThanOrEqual(3);
        expect([...story].length, scene.id).toBeGreaterThanOrEqual(100);
        expect([...story].length, scene.id).toBeLessThanOrEqual(360);
        expect(story, scene.id).toMatch(/\p{Extended_Pictographic}/u);
        expect(story, scene.id).not.toMatch(/[。！？]\s*\p{Extended_Pictographic}|\p{Extended_Pictographic}[\uFE0F\u200D]*\s*(?:[。！？]|\n|$)/u);
        expect(story).toContain(context.contact!.name);
        expect(story).not.toMatch(/SAN|科研\s*[+＋]|恋人\s*[+＋]|拒绝次数|永久封锁|替换|社交[≥＞]|搭讪≥/u);
        if (scene.stage === "result") {
          const settlement = scene.description.split("机制结算")[1]!.trim();
          expect(settlement.split("\n")).toHaveLength(1);
          expect(settlement.length).toBeLessThan(50);
          if (replacesContact) {
            expect(settlement).toBe(`结果：${type === "beautiful" ? "活泼" : "聪慧"}学者：${context.replacement!.name}`);
            expect(story).toContain("后来");
            expect(story).toContain("学术交流");
            expect(story).toContain(context.replacement!.name);
          }
        }
      }
    }
  });

  it.each(["beautiful", "smart"] as const)("retains %s preview rolls and rewards through narrative refresh", (type) => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const getRoll = vi.fn().mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: state.conferenceEncounterState, type, totalMonths: 6, playerGender: "male", state,
    }, getRoll);
    const act1 = createLoverDevelopmentAct1(context);
    const act2 = act1.choices[0]!.effects.enqueueEvents![0]!;
    const result = act2.choices.find((choice) => choice.id === "accept")!.effects.enqueueEvents![0]!;
    const effects = result.choices[0]!.effects;
    expect(effects).toMatchObject({
      ...(type === "beautiful" ? { sanCapDelta: 3 } : { research: 1 }),
      loverStateUpdates: { name: context.contact!.name, contactId: context.contact!.id },
      activateLoverProgress: type, loverProgressRolls: [0.2, 0.8], relationshipAdditions: ["lover"],
    });
    expect(refreshLoverDevelopmentEvent(state, result).choices[0]!.effects).toEqual(effects);
    expect(getRoll).toHaveBeenCalledTimes(2);
  });

  it.each(["beautiful", "smart"] as const)("retains the declined %s contact's name in all recorded scenes after replacement", (type) => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: state.conferenceEncounterState, type, totalMonths: 6, playerGender: "male",
    }, () => 0.5);
    state = { ...state, year: 1, month: 6, totalMonths: 6, availableRandomEvents: [],
      eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(context), 1)] };
    for (const eventChoiceId of ["continue", "decline"]) {
      state = dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]!.id, eventChoiceId });
    }
    const result = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    const replacement = context.replacement!;
    const summary = `${type === "beautiful" ? "活泼" : "聪慧"}学者：${replacement.name}`;
    expect(result.description.split("机制结算")[1]!.trim()).toBe(`结果：${summary}`);
    expect(result.choices[0]!.outcome).toBe(`结果：${summary}`);
    expect(result.choices[0]!.effects.conferenceEncounterUpdates?.scholars?.[type]).toEqual(replacement);
    expect(state.conferenceEncounterState.scholars?.[type]?.id).not.toBe(replacement.id);
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: "close" });
    expect(state.loverState.active).toBe(false);
    expect(state.conferenceEncounterState.scholars![type]).toEqual(replacement);
    const log = state.log.find((entry) => entry.text.includes(summary));
    expect(log?.text).toContain(context.contact!.name);
    expect(log?.text).toContain(replacement.name);
    expect(log?.text).not.toMatch(/重计|归零|次数/);
    const history = state.eventHistory.find((event) => event.chainId === "lover-development")!;
    expect(history.stages).toHaveLength(3);
    for (const [index, scene] of history.stages.entries()) {
      expect(scene.narrativeNames).toEqual(index === 2 ? [context.contact!.name, replacement.name] : [context.contact!.name]);
      expect(scene.description).toContain(context.contact!.name);
    }
  });

  it.each([
    ["beautiful", 0], ["beautiful", 1], ["smart", 0], ["smart", 1],
  ] as const)("keeps %s relationship opportunities open after %s previous refusals", (type, rejectCount) => {
    const event = createLoverDevelopmentAct1({ type, rejectCount, totalMonths: 6, playerGender: "male", loverGender: "female" });
    const decline = event.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "decline")!;
    expect(decline.effects.conferenceEncounterUpdates).toBeUndefined();
    expect(decline.effects.enqueueEvents![0]!.choices[0]!.effects.conferenceEncounterUpdates).toMatchObject(type === "beautiful"
      ? { rejectedBeautifulLoverCount: 0, permanentlyBlockedBeautifulLover: false, beautifulCount: 0 }
      : { rejectedSmartLoverCount: 0, permanentlyBlockedSmartLover: false, smartCount: 0 });
    const result = decline.effects.enqueueEvents![0]!;
    const replacement = result.loverDevelopmentPreview!.context.replacement!;
    expect(decline.outcome).toBe(`${type === "beautiful" ? "活泼" : "聪慧"}学者：${replacement.name}`);
    expect(result.description.split("机制结算")[1]?.trim()).toBe(`结果：${decline.outcome}`);
  });

  it.each(["beautiful", "smart"] as const)("keeps unavailable %s invitations inert on either decision through refresh", (type) => {
    const started = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: started.conferenceEncounterState, type, totalMonths: 6, playerGender: "male",
    }, () => 0.5);
    const act1 = createLoverDevelopmentAct1(context);
    const act2 = act1.choices[0]!.effects.enqueueEvents![0]!;
    for (const unavailable of ["occupied", "expired"] as const) {
      const state: GameState = unavailable === "occupied"
        ? { ...started, loverState: activateLover("smart", 2, "male"), relationshipState: { ...started.relationshipState, loverCount: 1 } }
        : { ...started, conferenceEncounterState: { ...started.conferenceEncounterState, scholars: {
          ...started.conferenceEncounterState.scholars, [type]: context.replacement!,
        } } };
      for (const choice of act2.choices) {
        const result = refreshLoverDevelopmentEvent(state, choice.effects.enqueueEvents![0]!);
        expect(result.choices[0]!.effects).toEqual({});
        expect(result.choices[0]!.outcome).toBe("结果：无事发生");
        expect(result.narrativeNames).toEqual([context.contact!.name]);
        expect(result.description).not.toContain(context.replacement!.name);
        expect(result.completionLog).not.toContain(context.replacement!.name);
        expect(result.description).not.toMatch(/学者：|重计|归零|拒绝次数/);
      }
    }
  });

  it.each(["beautiful", "smart"] as const)("lets a player who already has a lover set the %s confession aside without a rejection", (type) => {
    const started = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const existingLover = activateLover("smart", 2, "male");
    // The confession was generated before the player found a lover.
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: started.conferenceEncounterState, type, totalMonths: 6, playerGender: "male",
    });
    let state: GameState = {
      ...started, year: 1, month: 6, totalMonths: 6, availableRandomEvents: [],
      loverState: existingLover,
      relationshipState: { ...started.relationshipState, loverCount: 1 },
      eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(context), 1)],
    };
    state = dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]!.id, eventChoiceId: "continue" });

    const act2 = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    const setAside = act2.choices.find((choice) => choice.id === "accept")!;
    expect(setAside).toMatchObject({ label: "暂时放下" });
    expect(setAside.disabledReason).toBeUndefined();
    expect(act2.description).toContain("可你已经有了恋人");
    expect(act2.description).not.toMatch(/“我好像真的有点喜欢/u);

    state = dispatchAction(state, "resolve-event", { eventId: act2.id, eventChoiceId: "accept" });
    const result = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(result.title).toContain("暂时放下");
    expect(result.description).toContain("你已有恋人");
    expect(result.description.split("机制结算")[1]?.trim()).toBe("结果：无事发生");
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: "close" });

    expect(state.eventQueue.filter((event) => event.chainId === "lover-development")).toHaveLength(0);
    expect(state.loverState).toEqual(existingLover);
    expect(state.relationshipState.loverCount).toBe(1);
    expect(state.conferenceEncounterState.rejectedBeautifulLoverCount).toBe(0);
    expect(state.conferenceEncounterState.rejectedSmartLoverCount).toBe(0);
  });
});
