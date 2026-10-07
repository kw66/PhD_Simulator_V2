import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "../src/core/v2-lover-events";
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
    const expectedLover = activateLover(type, context.totalMonths, context.playerGender);
    state.eventQueue = [createEventQueueItem(createLoverDevelopmentAct1(context), 1)];

    for (const eventChoiceId of ["continue", "accept"]) {
      const eventId = state.eventQueue[0]?.id;
      state = dispatchAction(state, "resolve-event", { eventId, eventChoiceId });
    }
    expect(state.loverState.active).toBe(false);
    expect(state.eventQueue[0]?.description.split("机制结算")[1]?.trim()).toBe(
      `结果：恋人 +1（${type === "beautiful" ? "活泼" : "聪慧"}）`,
    );
    state = dispatchAction(state, "resolve-event", { eventId: state.eventQueue[0]?.id, eventChoiceId: "close" });

    expect(state.loverState).toEqual(expectedLover);
    expect(state.loverProgressState.active).toBe(true);
    expect(state.relationshipState.loverCount).toBe(1);
    const progressed = dispatchAction(state, "next-month");
    expect(progressed.totalMonths).toBe(7);
    expect(progressed.loverState.name).toBe(expectedLover.name);
    expect(getLoverName(progressed.loverState)).toBe(expectedLover.name);
  });

  it.each([
    ["beautiful", 0], ["beautiful", 1], ["smart", 0], ["smart", 1],
  ] as const)("retains the %s relationship closure rule after %s previous refusals", (type, rejectCount) => {
    const event = createLoverDevelopmentAct1({ type, rejectCount, totalMonths: 6, playerGender: "male", loverGender: "female" });
    const decline = event.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "decline")!;
    expect(decline.effects.conferenceEncounterUpdates).toEqual(type === "beautiful"
      ? { rejectedBeautifulLoverCount: rejectCount + 1, permanentlyBlockedBeautifulLover: rejectCount === 1 }
      : { rejectedSmartLoverCount: rejectCount + 1, permanentlyBlockedSmartLover: rejectCount === 1 });
    expect(decline.effects.enqueueEvents![0]!.description.split("机制结算")[1]?.trim()).toBe(
      `结果：${type === "beautiful" ? "活泼" : "聪慧"}恋人机会${rejectCount === 1 ? "永久关闭" : "剩余1次"}`,
    );
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
    expect(result.description).toContain("不计拒绝次数");
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: "close" });

    expect(state.eventQueue.filter((event) => event.chainId === "lover-development")).toHaveLength(0);
    expect(state.loverState).toEqual(existingLover);
    expect(state.relationshipState.loverCount).toBe(1);
    expect(state.conferenceEncounterState.rejectedBeautifulLoverCount).toBe(0);
    expect(state.conferenceEncounterState.rejectedSmartLoverCount).toBe(0);
  });
});
