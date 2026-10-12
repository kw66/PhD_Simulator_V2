import { describe, expect, it } from "vitest";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { activateInternship, activateRemoteInternship } from "../src/core/v2-internship-system";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { getCareerBaseScore } from "../src/core/v2-career-rules";
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

  it.each(["conference6", "remote3"] as const)("adds completed %s experience once to the live resume score", (kind) => {
    let state = startInternship(kind);
    expect(getCareerBaseScore(state, "internet")).toBe(getCareerBaseScore({ ...state, internshipCount: 0 }, "internet"));
    for (let elapsed = 0; elapsed < (kind === "conference6" ? 6 : 4); elapsed += 1) state = advanceMonth(state);
    for (const [careerType, bonus] of [["internet", 20], ["stateOwned", 0], ["civilService", 0], ["academic", 0]] as const) {
      expect(getCareerBaseScore(state, careerType) - getCareerBaseScore({ ...state, internshipCount: 0 }, careerType)).toBe(bonus);
    }
  });
});
