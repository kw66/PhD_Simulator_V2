import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getEventNarrativeNames } from "../src/core/v2-event-narrative";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createBeforeGradSchoolAct1Event, resolveAdvisorConfirmation } from "../src/core/v2-fixed-events-before-grad-school";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function makeState(full = false): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    year: 2,
    month: 6,
    totalMonths: 18,
    eventQueue: [],
    fellowProgressState: [],
    relationshipState: {
      ...base.relationshipState,
      unlockedSlots: 5,
      occupiedSlots: full ? 4 : 0,
      peerCount: full ? 4 : 0,
    },
  };
}

function eventTree(event: PendingEvent): PendingEvent[] {
  return [event, ...event.choices.flatMap((choice) => (choice.effects.enqueueEvents ?? []).flatMap(eventTree))];
}

describe("event character names", () => {
  it.each([1, 10, 11, 14])("keeps event %s candidates before recruitment and in full-capacity results", (eventId) => {
    const state = makeState(true);
    const event = createRandomEventById(eventId, state, () => 0.9).event!;
    const names = event.narrativeNames!;
    expect(names).toHaveLength(1);
    expect(event.description).toContain(names[0]);
    expect(getEventNarrativeNames(event, state)).toContain(names[0]);
    const scenes = eventTree(event);
    expect(scenes.filter((scene) => scene.stage === "result").length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.narrativeNames).toEqual(names);
      expect(scene.choices.every((choice) => !choice.effects.fellowAdditions?.length)).toBe(true);
    }
    const openEvent = createRandomEventById(eventId, makeState(), () => 0.9).event!;
    expect(openEvent.narrativeNames).toEqual(names);
    expect(eventTree(openEvent).filter((scene) => scene.stage === "result").every((scene) =>
      scene.narrativeNames?.includes(names[0]!)
    )).toBe(true);
  });

  it.each([1, 2, 4, 12])("preserves borrowed junior names in event %s after removal", (eventId) => {
    const state = makeState();
    state.fellowProgressState = [createCustomFellowProgressProfile({
      type: "junior", gender: "female", name: "林青", research: 4, affinity: 2, startTotalMonths: 1,
    })];
    const event = createRandomEventById(eventId, state, () => 0.9).event!;
    const results = eventTree(event).filter((scene) => scene.stage === "result" && scene.description.includes("林青"));
    expect(results.length).toBeGreaterThan(0);
    const removed = { ...state, fellowProgressState: [] };
    for (const result of results) {
      expect(getEventNarrativeNames(result, removed)).toContain("林青");
      expect(result.narrativeNames).toContain("林青");
    }
  });

  it("stores student and advisor candidates before confirmation and the accepted advisor in the result", () => {
    const state = makeState();
    const event = createBeforeGradSchoolAct1Event(state, () => 0.9, "林青", "陈明");
    expect(event.narrativeNames).toEqual(["林青"]);
    const advisor = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(advisor.narrativeNames).toEqual(["陈明"]);
    const result = resolveAdvisorConfirmation(state, { kind: "advisor-confirm", advisorCandidate: { advisorName: "陈明" } });
    expect(result.enqueueEvents![0]!.narrativeNames).toEqual(["陈明"]);
  });

  it("keeps all four mentor candidates when none can join", () => {
    const event = createMentorAssignEvent(makeState(true), () => 0.9);
    expect(event.narrativeNames).toHaveLength(4);
    const decision = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(getEventNarrativeNames(decision)).toEqual(event.narrativeNames);
    for (const choice of decision.choices) {
      expect(choice.effects.fellowAdditions).toBeUndefined();
      expect(choice.effects.enqueueEvents![0]!.narrativeNames).toEqual(event.narrativeNames);
    }
  });

  it("marks Li Mu without treating course, theory, model or project titles as people", () => {
    const event = createRandomEventById(9, makeState(), () => 0.9).event!;
    expect(event.narrativeNames).toEqual(["李沐"]);
    for (const scene of eventTree(event)) {
      expect(scene.narrativeNames).toEqual(["李沐"]);
      expect(getEventNarrativeNames(scene)).toEqual(scene.description.includes("李沐") ? ["李沐"] : []);
    }
  });
});
