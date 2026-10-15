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
    expect(calculateMonthlyCareerProgress(state, "civilService", () => 0)).toBe(10);
    expect(calculateMonthlyCareerProgress(state, "academic", () => 0)).toBe(2);
    expect(getCareerSuccessChance("internet", 180, CAREER_JOBS.internet[1]!)).toBe(50);
    expect(getCareerSuccessChance("stateOwned", 160, CAREER_JOBS.stateOwned[1]!)).toBe(50.5);
    expect(getCareerSuccessChance("civilService", 90, CAREER_JOBS.civilService[0]!)).toBe(42.5);
    expect(getCareerSuccessChance("academic", 90, CAREER_JOBS.academic[0]!)).toBe(44);
  });

  it("cuts off impossible interviews at zero instead of keeping a one-percent lottery", () => {
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      const job = CAREER_JOBS[type].at(-1)!;
      expect(getCareerSuccessChance(type, 0, job)).toBe(0);
      expect(getCareerSuccessChance(type, job.threshold - 200, job)).toBe(0);
      expect(getCareerSuccessChance(type, job.threshold, job)).toBeGreaterThan(0);
      expect(getCareerSuccessChance(type, job.threshold + 1000, job)).toBe(95);
    }
    const job = CAREER_JOBS.internet[0]!;
    expect(getCareerSuccessChance("internet", job.threshold - 100, job)).toBe(0);
    expect(getCareerSuccessChance("internet", job.threshold - 99, job)).toBe(0.5);
  });

  it("offers three distinct nearby thresholds and hides teaching from master's students", () => {
    const initial = createStartedGameState("normal");
    const state = { ...initial, degree: "phd" as const, careerProgress: { ...initial.careerProgress, internet: 74 } };
    expect(getCareerCandidates(state, "internet").map((job) => job.threshold)).toEqual([80, 180, 280]);
    expect(getCareerCandidates({ ...state, degree: "master" }, "academic")).toEqual([]);
    expect(getCareerCandidates(state, "academic").map((job) => job.name)).toEqual([
      "双非讲师", "211讲师", "985讲师",
    ]);
    expect(CAREER_JOBS.academic.find((job) => job.name === "世界名校长聘教授")?.threshold).toBe(1100);
    expect(CAREER_JOBS.civilService.find((job) => job.name === "中央部委 · 四级调研员")?.threshold).toBe(400);
  });

  it.each([
    ["internet", ["大厂开发岗", "大厂算法岗", "人才计划", "顶尖人才计划", "技术负责人", "首席科学家"], [80, 180, 280, 400, 650, 1000]],
    ["stateOwned", ["地方国企技术岗", "省属国企研发岗", "央企研究院研发岗", "央企总部业务主管", "央企二级公司副总经理", "央企总部部门负责人"], [70, 150, 210, 280, 380, 550]],
    ["civilService", ["乡镇机关 · 四级主任科员", "县区机关 · 四级主任科员", "市直机关 · 二级主任科员", "省直机关 · 二级主任科员", "直辖市机关 · 二级主任科员", "中央部委 · 四级调研员"], [80, 150, 210, 260, 330, 400]],
    ["academic", ["双非讲师", "211讲师", "985讲师", "985副教授", "985教授", "世界名校长聘教授"], [80, 180, 300, 450, 700, 1100]],
  ] as const)("keeps exactly the six agreed %s tiers and lowered reference scores", (type, names, scores) => {
    expect(CAREER_JOBS[type].map((job) => job.name)).toEqual(names);
    expect(CAREER_JOBS[type].map((job) => job.threshold)).toEqual(scores);
    expect(new Set(CAREER_JOBS[type].map((job) => job.id)).size).toBe(6);
  });

  it("keeps three adjacent fixed jobs at both score extremes without monthly combinations", () => {
    const initial = createStartedGameState("normal");
    const state = {
      ...initial,
      degree: "phd" as const,
      totalMonths: 24,
      careerProgress: { ...initial.careerProgress, civilService: 20, academic: 90 },
    };
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      const first = getCareerCandidates(state, type);
      const next = getCareerCandidates({ ...state, totalMonths: 25 }, type);
      expect(next.map((job) => job.threshold)).toEqual(first.map((job) => job.threshold));
      expect(next.map((job) => job.id)).toEqual(first.map((job) => job.id));
      expect(getCareerCandidates({ ...state, degree: "phd", totalResearchScore: 0,
        careerProgress: { ...state.careerProgress, [type]: 0 } }, type)).toEqual(CAREER_JOBS[type].slice(0, 3));
      expect(getCareerCandidates({ ...state, careerProgress: { ...state.careerProgress, [type]: 9999 } }, type))
        .toEqual(CAREER_JOBS[type].slice(-3));
    }
  });
});
