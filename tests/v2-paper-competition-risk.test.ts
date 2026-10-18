import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { isLinearEvent } from "../src/core/v2-event-auto-resolution";
import { getEventChoiceRisk, getEventChoiceRiskDetails } from "../src/core/v2-event-choice-risk";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createPaperCompetitionRandomEvent } from "../src/core/v2-random-events-paper-competition";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function fixture(): GameState {
  const state = createStartedGameState("normal");
  return { ...state, year: 1, month: 6, totalMonths: 6, selectedAdvisorName: "导师", eventQueue: [],
    availableRandomEvents: [], player: { san: 0, research: 4, social: 4, favor: 4, money: 10 },
    advisorProgressState: { ...state.advisorProgressState, funding: 10 },
    papers: [{ ...createDraftPaper(6, 0, () => 0), idea: 40, experiment: 40, writing: 20 }] };
}

function stages(state: GameState, id: 17 | 18, index = 3) {
  const root = createPaperCompetitionRandomEvent(id, state, () => 0)!;
  const decision = root.choices[0]!.effects.enqueueEvents![0]!;
  const choice = decision.choices[index]!;
  const result = choice.effects.enqueueEvents![0]!;
  return { root, decision, choice, result };
}

function settle(state: GameState, event: PendingEvent, index = 0) {
  const queued = createEventQueueItem(event, state.totalMonths);
  return dispatchAction({ ...state, eventQueue: [queued] }, "resolve-event", {
    eventId: queued.id, eventChoiceId: queued.choices[index]!.id,
  });
}

afterEach(() => vi.restoreAllMocks());

describe.each([
  { id: 17 as const, title: "被抢发idea", costs: [0, 1, 2, 4] },
  { id: 18 as const, title: "新sota", costs: [0, 1, 3, 6] },
])("$title resource warnings", ({ id, costs }) => {
  it.each([0, 1, 2, 3])("matches actual settlement for option %i before choosing and confirming", index => {
    for (const san of new Set([0, costs[index]! - 0.01, costs[index]!, costs[index]! + 1])) {
      if (san < 0) continue;
      const current = fixture();
      current.player.san = san;
      const { root, decision, choice, result } = stages(current, id, index);
      const expected = san < costs[index]! ? "certain" : null;
      const snapshot = structuredClone({ current, decision, result });
      const rng = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("preview consumed RNG"); });
      expect(getEventChoiceRisk(current, root, root.choices[0]!)).toBeNull();
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(getEventChoiceRisk(current, decision, choice)).toBe(expected);
        expect(getEventChoiceRisk(current, result, result.choices[0]!)).toBe(expected);
      }
      expect({ current, decision, result }).toEqual(snapshot);
      expect(rng).not.toHaveBeenCalled();
      rng.mockRestore();
      const pending = settle(current, decision, index);
      expect(pending.player.san).toBe(san);
      const confirmation = getResolvableQueuedEvent(pending, pending.eventQueue[0]!);
      expect(getEventChoiceRisk(pending, confirmation, confirmation.choices[0]!)).toBe(expected);
      const finished = settle(pending, confirmation);
      expect(finished.player.san).toBeCloseTo(san - costs[index]!);
      expect(finished.phase).toBe(expected ? "finished" : "playing");
    }
  });

  it.each(["discarded", "accepted", "journal", "coauthor", "zero-score"] as const)("stops warning when its original target becomes %s", status => {
    const current = fixture();
    const { decision, choice, result } = stages(current, id);
    if (status === "discarded") current.papers = [];
    else if (status === "accepted") current.papers[0]!.status = "published";
    else if (status === "journal") current.papers[0]!.status = "journal-reviewing";
    else if (status === "coauthor") current.papers[0]!.nonFirstAuthor = true;
    else current.papers[0]![id === 17 ? "idea" : "experiment"] = 0;
    expect(getEventChoiceRisk(current, decision, choice)).toBeNull();
    expect(getEventChoiceRisk(current, result, result.choices[0]!)).toBeNull();
    // An already accepted paper can also award publication-talent SAN.
    const settled = settle(current, result);
    expect(settled.player.san).toBeGreaterThanOrEqual(current.player.san);
    expect(settled.phase).toBe("playing");
  });

  it("interrupts automatic event confirmation when the chosen branch would end the run", () => {
    const current = { ...fixture(), blockLinearEvents: false };
    const { decision, result } = stages(current, id);
    expect(isLinearEvent(current, createEventQueueItem(result, 6))).toBe(false);
    const pending = settle(current, decision, 3);
    expect(pending.phase).toBe("playing");
    expect(pending.player.san).toBe(0);
    const confirmation = getResolvableQueuedEvent(pending, pending.eventQueue[0]!);
    expect(confirmation.stage).toBe("result");
    expect(getEventChoiceRisk(pending, confirmation, confirmation.choices[0]!)).toBe("certain");
  });
});

describe("competition warning cost and rescue rules", () => {
  it.each([
    { research: 4, month: 6, multiplier: 1, cost: 6 },
    { research: 18, month: 6, multiplier: 1, cost: 3 },
    { research: 18, month: 7, multiplier: 1, cost: 2 },
    { research: 18, month: 10, multiplier: 2, cost: 10 },
  ])("uses the actual modified cost: $cost SAN", ({ research, month, multiplier, cost }) => {
    const current = fixture();
    current.player.research = research;
    current.month = month;
    current.totalMonths = month;
    current.buffs = [{ id: "risk-illness", name: "疾病", source: "疾病", timing: "monthly", remainingMonths: 1,
      activeOperationSanMultiplier: multiplier }];
    const { decision, choice, result } = stages(current, 18);
    expect(getEventChoiceRiskDetails(current, decision, choice)?.reasons).toEqual([
      expect.objectContaining({ resource: "san", projectedMin: -cost, projectedMax: -cost }),
    ]);
    current.player.san = cost;
    expect(getEventChoiceRisk(current, decision, choice)).toBeNull();
    expect(settle(current, result).player.san).toBe(0);
  });

  it.each(["gold", "beta", "spike"] as const)("honors %s rescue without spending it in previews", rescue => {
    const current = fixture();
    if (rescue === "gold") {
      current.selectedRoleId = "rich";
      current.player.money = 50;
      current.roleTalents = { levels: { "gold-power-alpha": 1 }, initialized: true };
    } else if (rescue === "beta") {
      current.degree = "phd";
      current.roleTalents = { levels: { "burning-life-beta": 1 }, initialized: true };
    } else current.shopState.chairUpgrade = "spike";
    const { decision, choice, result } = stages(current, 18, rescue === "spike" ? 2 : 3);
    const before = structuredClone(current);
    expect(getEventChoiceRisk(current, decision, choice)).toBeNull();
    expect(getEventChoiceRisk(current, result, result.choices[0]!)).toBeNull();
    expect(current).toEqual(before);
    expect(settle(current, result).phase).toBe("playing");
    if (rescue === "gold") current.player.money = 49;
    else if (rescue === "beta") current.roleTalents!.betaUsedMonth = current.totalMonths;
    else current.shopState.chairUpgrade = null;
    expect(getEventChoiceRisk(current, decision, choice)).toBe("certain");
  });
});
