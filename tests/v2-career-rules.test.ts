import { describe, expect, it } from "vitest";

import {
  CAREER_DEFINITIONS,
  CAREER_OPTIONS,
  calculateCareerProgress,
  getCareerEventTargetYear,
  getCareerLevel,
} from "../src/core/v2-career-rules";

describe("v2 career rules", () => {
  it("提供稳定的求职配置与月度活跃窗口", () => {
    expect(CAREER_DEFINITIONS.internet.activeMonths).toEqual([11, 12, 1, 2]);
    expect(CAREER_OPTIONS.map((option) => option.baseProgress)).toEqual([0, 15, 35, 60]);
  });

  it("按当前规则计算求职目标年", () => {
    expect(getCareerEventTargetYear("master")).toBe(3);
    expect(getCareerEventTargetYear("phd")).toBe(5);
  });

  it("按当前权重公式计算求职进度", () => {
    const progress = calculateCareerProgress("internet", CAREER_OPTIONS[2], {
      research: 20,
      social: 10,
      publishedPaperCount: 3,
      internshipCount: 2,
    });
    expect(progress).toBe(78);
  });

  it("能根据进度映射当前 offer 层级", () => {
    expect(getCareerLevel("academic", 199).name).toBe("普本");
    expect(getCareerLevel("academic", 200).name).toBe("211");
  });
});
