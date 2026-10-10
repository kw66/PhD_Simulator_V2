import { describe, expect, it } from "vitest";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { applyQueuedEventEffects } from "../src/core/v2-engine-event-resolution";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { activateInternship, activateRemoteInternship } from "../src/core/v2-internship-system";
import { createCareerEventForType } from "../src/core/v2-monthly-career-events";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import type { CareerType } from "../src/core/v2-career-rules";
import type { GameState } from "../src/core/v2-types";

function startInternship(kind: "conference6" | "remote3", initial = createStartedGameState("normal")): GameState {
  return applyChoiceEffectsToState({ ...initial, totalResearchScore: 2 }, {
    id: "accept", label: "确定", outcome: "实习开始", effects: {
      internshipStateUpdates: kind === "remote3" ? activateRemoteInternship(initial.totalMonths) : activateInternship(),
    },
  }).nextState;
}

function advanceMonth(state: GameState): GameState {
  const totalMonths = state.totalMonths + 1;
  return applyMonthlyEffects({ ...state, totalMonths, ...getCalendarForTotalMonths(totalMonths, state.degree) }).nextState;
}

function settleCareer(state: GameState, careerType: CareerType): number {
  let current = { ...state, eventQueue: [createEventQueueItem(createCareerEventForType(state, careerType), 1)] };
  for (const choiceId of [current.eventQueue[0]!.choices[0]!.id, "light", "light-finish"]) {
    current = applyQueuedEventEffects(current, current.eventQueue[0]!, choiceId, {
      evaluateImmediateEndings: (next) => next,
      runPostQueuePipeline: (next) => next,
    });
  }
  return current.careerProgress[careerType] - state.careerProgress[careerType];
}

describe("internship completion and career experience", () => {
  it.each(["conference6", "remote3"] as const)("counts %s only once after completion, including repeated settlement and reload", (kind) => {
    let state = startInternship(kind);
    expect(state.conferenceCareerState.hasInternshipExperience).toBe(true);
    expect(state.internshipCount).toBe(0);
    const completionMonth = kind === "conference6" ? 6 : 4;
    for (let elapsed = 1; elapsed <= completionMonth; elapsed += 1) {
      const before = structuredClone(state);
      previewNextMonthEffects(state);
      previewNextMonthEffects(state);
      expect(state).toEqual(before);
      state = advanceMonth(state);
      expect(state.internshipState.active).toBe(elapsed < completionMonth);
      expect(state.internshipCount).toBe(elapsed < completionMonth ? 0 : 1);
    }
    state = JSON.parse(JSON.stringify(state)) as GameState;
    expect(applyMonthlyEffects(state).nextState.internshipCount).toBe(1);
    expect(advanceMonth(state).internshipCount).toBe(1);
  });

  it("accumulates separate completed placements without counting acceptance twice", () => {
    let state = startInternship("conference6");
    for (let elapsed = 0; elapsed < 6; elapsed += 1) state = advanceMonth(state);
    state = startInternship("remote3", state);
    expect(state.internshipCount).toBe(1);
    for (let elapsed = 1; elapsed <= 4; elapsed += 1) {
      state = advanceMonth(state);
      expect(state.internshipCount).toBe(elapsed < 4 ? 1 : 2);
    }
    expect(advanceMonth(state).internshipCount).toBe(2);
  });

  it.each(["conference6", "remote3"] as const)("applies the completed %s experience to actual recruitment settlements", (kind) => {
    let state = startInternship(kind);
    expect(settleCareer(state, "internet")).toBe(settleCareer({ ...state, internshipCount: 0 }, "internet"));
    for (let elapsed = 0; elapsed < (kind === "conference6" ? 6 : 4); elapsed += 1) state = advanceMonth(state);
    for (const [careerType, bonus] of [["internet", 15], ["stateOwned", 5], ["civilService", 0], ["academic", 0]] as const) {
      expect(settleCareer(state, careerType) - settleCareer({ ...state, internshipCount: 0 }, careerType)).toBe(bonus);
    }
  });
});
