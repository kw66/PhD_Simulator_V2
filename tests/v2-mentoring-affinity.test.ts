import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import * as fellowProgression from "../src/core/v2-fellow-progression";
import { createMentoringLabRandomEventById } from "../src/core/v2-random-events-lab-mentoring";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, month: 5, totalMonths: 17, year: 2, selectedAdvisorName: "导师", eventQueue: [],
    player: { ...base.player, money: 20, san: 20, favor: 3, research: 3, social: 3 } };
}

afterEach(() => vi.restoreAllMocks());

describe("mentoring affinity rewards", () => {
  it.each([
    [1, 2], [5, 1.75], [6, 1.5], [11.75, 1.25], [12, 1], [17.75, 0.75], [18, 0.5], [19.9, 0.1], [20, 0],
  ])("resists mentoring raw +2 at affinity %s once and reports actual gain %s", (affinity, gain) => {
    const state = makeState();
    vi.spyOn(fellowProgression, "createGeneratedFellowProfileAddition").mockReturnValue({
      type: "junior", gender: "male", name: "陈青", research: 2, affinity, academicYear: 0, degree: "master",
    });
    const root = createMentoringLabRandomEventById(1, state, () => 0)!;
    const decision = root.choices[0]!.effects.enqueueEvents![0]!;
    const choice = decision.choices.find((entry) => entry.label === "亲自指导")!;
    expect(choice.effects.fellowAdditions![0]!.affinity).toBeCloseTo(affinity + gain, 10);
    expect(choice.outcome).toContain(`默契 +${gain}`);
    const result = choice.effects.enqueueEvents!.at(-1)!;
    expect(result.description).toContain(`与你的默契 +${gain}`);
    const queued = { ...state, eventQueue: [createEventQueueItem(root, 1)] };
    const introduced = dispatchAction(queued, "resolve-event", { eventId: root.id, eventChoiceId: root.choices[0]!.id });
    const selected = dispatchAction(introduced, "resolve-event", { eventId: decision.id, eventChoiceId: choice.id });
    expect(selected.fellowProgressState).toHaveLength(0);
    const completed = dispatchAction(selected, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(completed.fellowProgressState).toHaveLength(1);
    expect(completed.fellowProgressState[0]!.affinity).toBeCloseTo(affinity + gain, 10);
    expect(completed.log.some((entry) => entry.text.includes(`默契 +${gain}`))).toBe(true);
    const repeated = dispatchAction(completed, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.fellowProgressState).toEqual(completed.fellowProgressState);
    expect(state.fellowProgressState).toEqual([]);
  });

  it("keeps natural initial affinity one and awards the unresisted two-point mentoring bonus", () => {
    const state = makeState();
    const root = createMentoringLabRandomEventById(1, state, () => 0)!;
    const decision = root.choices[0]!.effects.enqueueEvents![0]!;
    const choice = decision.choices.find((entry) => entry.label === "亲自指导")!;
    expect(choice.effects.fellowAdditions![0]).toMatchObject({ affinity: 3, academicYear: 0 });
    expect(choice.outcome).toContain("默契 +2");
  });

  it("preserves a resolved fractional initial profile without applying growth resistance", () => {
    const profile = fellowProgression.createCustomFellowProgressProfile({
      type: "peer", gender: "female", startTotalMonths: 1, research: 6.75, affinity: 12.5,
    });
    expect(profile.affinity).toBe(12.5);
  });
});
