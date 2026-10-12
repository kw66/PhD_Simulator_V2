import { describe, expect, it } from "vitest";
import {
  CAREER_DEFINITIONS,
  CAREER_JOBS,
  calculateMonthlyCareerProgress,
  getCareerAbility,
  getCareerBaseScore,
  getCareerCandidates,
  getCareerSuccessChance,
} from "../src/core/v2-career-rules";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";

describe("career scoring and job candidates", () => {
  it("opens each track only during its agreed final-year months", () => {
    expect(CAREER_DEFINITIONS.internet.activeMonths).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(CAREER_DEFINITIONS.stateOwned.activeMonths).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(CAREER_DEFINITIONS.civilService.activeMonths).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(CAREER_DEFINITIONS.academic.activeMonths).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it("separates live resume score from accumulated preparation and counts only player projects", () => {
    const initial = createStartedGameState("normal");
    const state = {
      ...initial,
      degree: "phd" as const,
      totalResearchScore: 20,
      totalCitations: 250,
      internshipCount: 2,
      scholarshipState: { ...initial.scholarshipState, awardCount: 2 },
      careerProgress: { ...initial.careerProgress, internet: 7 },
      advisorProgressState: {
        ...initial.advisorProgressState,
        playerProjectCompletions: { horizontal: 4, vertical: 3 },
        awards: [
          { id: "general" as const, awardedYear: 3, startYear: 4, endYear: 7 },
          { id: "excellent" as const, awardedYear: 4, startYear: 5, endYear: 8 },
        ],
      },
    };
    expect(getCareerBaseScore(state, "internet")).toBe(174);
    expect(getCareerAbility(state, "internet")).toBe(181);
    expect(getCareerBaseScore(state, "stateOwned")).toBe(130);
    expect(getCareerBaseScore(state, "civilService")).toBe(90);
    expect(getCareerBaseScore(state, "academic")).toBe(166);
    expect(getCareerBaseScore({ ...state, degree: "master" }, "academic")).toBe(-999);
  });

  it("applies each monthly gain and interview curve independently", () => {
    const initial = createStartedGameState("normal");
    const state = { ...initial, degree: "phd" as const, player: { ...initial.player, research: 11 } };
    expect(calculateMonthlyCareerProgress(state, "internet", () => 0)).toBe(5);
    expect(calculateMonthlyCareerProgress(state, "stateOwned", () => 0.99)).toBe(7);
    expect(calculateMonthlyCareerProgress(state, "civilService", () => 0)).toBe(5);
    expect(calculateMonthlyCareerProgress(state, "academic", () => 0)).toBe(2);
    expect(getCareerSuccessChance("internet", 80, CAREER_JOBS.internet[1]!)).toBe(50);
    expect(getCareerSuccessChance("stateOwned", 70, CAREER_JOBS.stateOwned[1]!)).toBe(50.5);
    expect(getCareerSuccessChance("civilService", 35, CAREER_JOBS.civilService[0]!)).toBe(42.5);
    expect(getCareerSuccessChance("academic", 40, CAREER_JOBS.academic[0]!)).toBe(44);
  });

  it("offers three distinct nearby thresholds and hides teaching from master's students", () => {
    const initial = createStartedGameState("normal");
    const state = { ...initial, degree: "phd" as const, careerProgress: { ...initial.careerProgress, internet: 74 } };
    expect(getCareerCandidates(state, "internet").map((job) => job.threshold)).toEqual([80, 120, 170]);
    expect(getCareerCandidates({ ...state, degree: "master" }, "academic")).toEqual([]);
    expect(getCareerCandidates(state, "academic").map((job) => job.name)).toEqual([
      "二本博后", "二本讲师", "双非一本讲师",
    ]);
    expect(CAREER_JOBS.academic.find((job) => job.name === "985特聘教授")?.threshold).toBe(650);
    expect(CAREER_JOBS.civilService.find((job) => job.name === "中央机关 · 二级调研员")?.threshold).toBe(365);
  });

  it("rotates equal-threshold combinations across months without changing the three grades", () => {
    const initial = createStartedGameState("normal");
    const state = {
      ...initial,
      degree: "phd" as const,
      totalMonths: 24,
      careerProgress: { ...initial.careerProgress, civilService: 20, academic: 90 },
    };
    for (const type of ["civilService", "academic"] as const) {
      const first = getCareerCandidates(state, type);
      const next = getCareerCandidates({ ...state, totalMonths: 25 }, type);
      expect(next.map((job) => job.threshold)).toEqual(first.map((job) => job.threshold));
      expect(next.some((job, index) => job.id !== first[index]!.id)).toBe(true);
    }
  });
});
