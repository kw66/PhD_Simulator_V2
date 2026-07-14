import { describe, expect, it } from "vitest";

import {
  CAREER_DEFINITIONS,
  CAREER_OPTIONS,
  calculateCareerProgress,
  canTriggerCareerEventsThisMonth,
  getActiveCareerTypes,
  getCareerEventTargetYear,
  getCareerLevel,
  updateBestCareerOffer,
} from "../src/core/v2-career-rules";

describe("v2 career rules", () => {
  it("提供稳定的求职配置与月度活跃窗口", () => {
    expect(CAREER_DEFINITIONS.internet.activeMonths).toEqual([11, 12, 1, 2]);
    expect(CAREER_OPTIONS.map((option) => option.baseProgress)).toEqual([0, 15, 35, 60]);
    expect(getActiveCareerTypes(3)).toEqual(["stateOwned", "civilService"]);
  });

  it("按旧版规则计算求职目标年", () => {
    expect(getCareerEventTargetYear("master", false, false)).toBe(3);
    expect(getCareerEventTargetYear("master", true, false)).toBeNull();
    expect(getCareerEventTargetYear("phd", false, false)).toBe(5);
    expect(getCareerEventTargetYear("phd", false, true)).toBe(6);
    expect(canTriggerCareerEventsThisMonth(3, "master", false, false)).toBe(true);
    expect(canTriggerCareerEventsThisMonth(2, "master", false, false)).toBe(false);
  });

  it("按旧版权重公式计算求职进度", () => {
    const progress = calculateCareerProgress("internet", CAREER_OPTIONS[2], {
      research: 20,
      social: 10,
      publishedPaperCount: 3,
      internshipCount: 2,
    });
    expect(progress).toBe(78);
  });

  it("能根据进度映射当前 offer 层级，并维护最佳 offer", () => {
    expect(getCareerLevel("academic", 199).name).toBe("普本");
    expect(getCareerLevel("academic", 200).name).toBe("211");

    const firstOffer = updateBestCareerOffer(null, "stateOwned", 230);
    expect(firstOffer.level).toBe("优质国企");

    const betterOffer = updateBestCareerOffer(firstOffer, "internet", 320);
    expect(betterOffer.type).toBe("internet");
    expect(betterOffer.level).toBe("大厂");

    const worseOffer = updateBestCareerOffer(betterOffer, "civilService", 120);
    expect(worseOffer).toEqual(betterOffer);
  });
});
