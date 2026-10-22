import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { getEventChoiceRiskDetails } from "../src/core/v2-event-choice-risk";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function fixture() {
  const initial = createStartedGameState("social-reversed", {
    "social-to-san": 3, "fellow-add-social": 2, "social-loss-coins": 3,
  });
  const state: GameState = { ...initial, totalMonths: 14, year: 2, month: 2,
    selectedAdvisorName: "导师", eventQueue: [], buffs: [],
    player: { ...initial.player, san: 2, social: 6, research: 1, favor: 6, money: 10 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 30 },
  };
  const root = createRandomEventById(10, state, () => 0.2).event!;
  const decision = root.choices[0]!.effects.enqueueEvents![0]!;
  const choice = decision.choices.find(c => c.id.includes("short-term"))!;
  return { state, decision, choice };
}

describe("recruitment talent risk previews", () => {
  it("includes immediate envy recovery in act two and agrees with the real confirmation", () => {
    const { state, decision, choice } = fixture();
    const before = structuredClone({ state, decision });
    expect(getEventChoiceRiskDetails(state, decision, choice)).toBeNull();
    expect(getEventChoiceRiskDetails(state, decision, choice)).toBeNull();
    expect({ state, decision }).toEqual(before);
    let next = dispatchAction({ ...state, eventQueue: [createEventQueueItem(decision, state.totalMonths)] },
      "resolve-event", { eventId: decision.id, eventChoiceId: choice.id });
    const result = next.eventQueue.find(e => e.stage === "result")!;
    expect(getEventChoiceRiskDetails(next, result, result.choices[0]!)).toBeNull();
    next = dispatchAction(next, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(next.player.san).toBe(0);
    expect(next.player.social).toBe(7.6);
    expect(next.fellowProgressState).toHaveLength(1);
    expect(next.phase).toBe("playing");
  });

  it.each(["full-slots", "social-cap", "no-recovery", "not-enough-recovery"] as const)("retains the warning when recruitment cannot cover the cost: %s", reason => {
    const { state, decision, choice } = fixture();
    if (reason === "full-slots") state.relationshipState = { ...state.relationshipState, unlockedSlots: 5, occupiedSlots: 4, peerCount: 4 };
    if (reason === "social-cap") state.player.social = 20;
    if (reason === "no-recovery") state.roleTalents!.levels["social-to-san"] = 0;
    if (reason === "not-enough-recovery") state.player.san = 1;
    const details = getEventChoiceRiskDetails(state, decision, choice)!;
    expect(details.risk).toBe("certain");
    expect(details.reasons.find(r => r.resource === "san")!.projectedMax).toBeLessThan(0);
  });

  it("counts only the recruits that fit and applies fractional social rewards sequentially", () => {
    const { state, choice } = fixture();
    state.roleTalents!.socialGainRemainder = 0.4;
    const effects = { ...choice.effects, enqueueEvents: undefined, san: -7,
      fellowAdditions: [choice.effects.fellowAdditions![0]!, choice.effects.fellowAdditions![0]!, choice.effects.fellowAdditions![0]!],
    };
    const event: PendingEvent = { id: "multiple", chainId: "multiple", title: "Multiple", description: "", source: "fixed",
      blocking: true, deadlineMonths: 0, stage: "result", choices: [{ id: "confirm", label: "确定", outcome: "", effects }] };
    // Social6 unlocks two fellow slots: 1.6+remainder gives6SAN, then1.6 gives3SAN.
    expect(getEventChoiceRiskDetails(state, event, event.choices[0]!)).toBeNull();
    const next = dispatchAction({ ...state, eventQueue: [createEventQueueItem(event, state.totalMonths)] },
      "resolve-event", { eventId: event.id, eventChoiceId: "confirm" });
    expect(next.fellowProgressState).toHaveLength(2);
    expect(next.player.san).toBe(4);
    expect(next.phase).toBe("playing");
  });
});
