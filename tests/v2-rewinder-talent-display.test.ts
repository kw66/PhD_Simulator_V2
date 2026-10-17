import { describe, expect, it } from "vitest";
import { getTalentTriggerDisplay } from "../src/app/v2-talent-trigger-display";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { initializeRewinder } from "../src/core/v2-rewinder";
import { captureRewinderGrowth } from "../src/core/v2-rewinder-growth";
import { captureRewinderRelationships } from "../src/core/v2-rewinder-relationships";
import { recordTalentTransitions } from "../src/core/v2-talent-transitions";

function inheritedReading() {
  let state = createStartedGameState("rewinder");
  state = { ...state, totalMonths: 12, year: 1, month: 12, eventQueue: [], availableRandomEvents: [],
    randomState: { seed: 1700000000, cursor: 0 } };
  const historical = structuredClone(state);
  historical.readingState.readCount = 30;
  state = initializeRewinder(state, { years: { 1: {
    growth: captureRewinderGrowth(historical), relationships: captureRewinderRelationships(historical),
  } } });
  state = dispatchAction(state, "next-month");
  const event = state.eventQueue.find(item => item.rewinderPresentation)!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: "confirm-rewinder-year" });
}

describe("Rewinder reading reward presentation", () => {
  it("corrects inherited counters without modifying old replay evidence or granting research", () => {
    const state = inheritedReading();
    const record = state.eventHistory.find(item => item.chainId.startsWith("talent:reading-growth:"))!;
    const original = structuredClone(state);
    expect(state.player.research).toBe(1);
    expect(state.readingState.readCount).toBe(30);
    expect(getTalentTriggerDisplay(record, state.eventHistory)?.effects).toContain("继承阅读积累，不重复发放科研奖励");
    expect(getTalentTriggerDisplay(record, state.eventHistory)?.effects.join(" ")).not.toContain("科研奖励 +3");
    expect(state).toEqual(original);
  });

  it("keeps a real new milestone in the same month and ordinary reading rewards", () => {
    const inherited = inheritedReading();
    const before = { ...inherited, readingState: { ...inherited.readingState, readCount: 39 } };
    const after = recordTalentTransitions(before, { ...before, readingState: { ...before.readingState, readCount: 40 } });
    const actual = after.eventHistory.at(-1)!;
    expect(getTalentTriggerDisplay(actual, after.eventHistory)?.effects[0]).toContain("科研奖励 +1");
    const regular = createStartedGameState("normal");
    const advanced = recordTalentTransitions(regular, { ...regular, readingState: { ...regular.readingState, readCount: 10 } });
    const regularRecord = advanced.eventHistory.at(-1)!;
    expect(getTalentTriggerDisplay(regularRecord, advanced.eventHistory)?.effects[0]).toContain("科研奖励 +1");
  });
});
