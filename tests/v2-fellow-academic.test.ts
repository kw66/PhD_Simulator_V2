import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile, createGeneratedFellowProfileAddition } from "../src/core/v2-fellow-progression";
import { getFellowAcademicLabel, getFellowAcademicYear, getFellowResearchScore } from "../src/core/v2-fellow-academic";
import { settleFellowAcademicYear } from "../src/core/v2-fellow-lifecycle";
import { settleLabResearchGrowth } from "../src/core/v2-lab-talent";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { isRandomEventEligible, createRandomEventById } from "../src/core/v2-random-event-router";
import type { Degree, GameState } from "../src/core/v2-types";

function makeState(academicYear = 1, score = 0, degree: Degree = "master"): GameState {
  const base = createStartedGameState("normal");
  return { ...base, totalMonths: 10, year: 1, month: 10, eventQueue: [],
    fellowProgressState: [createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 3,
      affinity: 1, startTotalMonths: 1, academicYear, degree, initialResearchScore: score })],
    relationshipState: { ...base.relationshipState, occupiedSlots: 1, peerCount: 1 },
  };
}

describe("fellow academic lifecycle", () => {
  it("advances by school year rather than time known", () => {
    const state = makeState(2);
    const fellow = { ...state.fellowProgressState[0]!, startTotalMonths: 12, academicStartTotalMonths: 12 };
    expect(getFellowAcademicYear({ year: 2 }, fellow)).toBe(3);
    expect(getFellowAcademicLabel({ year: 1 }, fellow)).toBe("第二年硕士");
    expect(getFellowAcademicLabel({ year: 5 }, { ...fellow, degree: "phd" })).toBe("第六年博士");
  });

  it("generates terminal-year students with graduation scores and younger masters", () => {
    expect(createGeneratedFellowProfileAddition("peer", 0, undefined, [], undefined, { year: 3 }))
      .toMatchObject({ academicYear: 3, degree: "master", initialResearchScore: 1 });
    expect(createGeneratedFellowProfileAddition("peer", 0, undefined, [], undefined, { year: 6 }))
      .toMatchObject({ academicYear: 6, degree: "phd", initialResearchScore: 7 });
    for (let seed = 0; seed < 20; seed += 1) {
      const junior = createGeneratedFellowProfileAddition("junior", seed, undefined, [], undefined, { year: 6 });
      expect(junior.degree).toBe("master");
      expect(junior.academicYear).toBeLessThan(4);
    }
  });

  it.each([[2, 2], [3, 3]])("transfers year %s before testing graduation", (year, score) => {
    const state = makeState(year, score);
    const next = settleFellowAcademicYear(state);
    expect(next.fellowProgressState[0]?.degree).toBe("phd");
    expect(next.relationshipState.occupiedSlots).toBe(1);
    expect(settleFellowAcademicYear(next)).toBe(next);
  });

  it.each([[3, 1, "master", "毕业"], [3, 0, "master", "退学"], [6, 7, "phd", "毕业"], [6, 6, "phd", "退学"]] as const)
    ("removes year %s score %s %s with %s in June", (year, score, degree, outcome) => {
      const state = makeState(year, score, degree);
      const profile = state.fellowProgressState[0]!;
      const paper = { ...createDraftPaper(1, 0, () => 0), leadAuthorId: profile.id, status: "reviewing" as const };
      state.fellowPapers = [paper];
      expect(settleFellowAcademicYear({ ...state, month: 9 }).fellowProgressState).toHaveLength(1);
      const next = settleFellowAcademicYear(state);
      expect(next.fellowProgressState).toHaveLength(0);
      expect(next.relationshipState).toMatchObject({ occupiedSlots: 0, peerCount: 0 });
      expect(next.fellowPapers).toEqual([paper]);
      expect(next.player).toEqual(state.player);
      expect(next.log[0]?.text).toContain(outcome);
    });

  it("counts a coauthored fellow paper once across collections", () => {
    const state = makeState(2, 1);
    const paper = { ...createDraftPaper(1, 0, () => 0), leadAuthorId: state.fellowProgressState[0]!.id,
      status: "published" as const, target: "A" as const };
    state.fellowPapers = [paper];
    state.externalPublications = [{ ...paper, nonFirstAuthor: true }];
    expect(getFellowResearchScore(state, state.fellowProgressState[0]!)).toBe(5);
  });

  it("settles inheritance at August end including fellows who joined that month", () => {
    const state = makeState();
    state.player.research = 10;
    state.fellowProgressState[0]!.startTotalMonths = 12;
    const august = { ...state, totalMonths: 12, month: 12 };
    const next = settleLabResearchGrowth(august, () => 0.99);
    expect(next.fellowProgressState[0]!.research).toBe(6);
    expect(next.fellowProgressState[0]!.lastAnnualGrowthTotalMonths).toBe(12);
    expect(next.eventHistory.some((entry) => entry.id === "talent:inheritance:player:12")).toBe(true);
    expect(settleLabResearchGrowth(next)).toBe(next);
    const september = { ...next, totalMonths: 13, year: 2, month: 1 };
    expect(settleLabResearchGrowth(september)).toBe(september);
  });

  it("excludes senior guidance in the sixth year", () => {
    const state = { ...makeState(), year: 6 };
    state.player.research = 20;
    expect(isRandomEventEligible(state, 11)).toBe(false);
    expect(createRandomEventById(11, state, () => 0).event).toBeNull();
  });
});
