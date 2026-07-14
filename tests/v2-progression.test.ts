import { describe, expect, it } from "vitest";

import {
  createPhdDecision,
  getAdvisorDefinition,
  getAdvisorOptions,
  getAdvisorSalaryForMonth,
  getCalendarForTotalMonths,
  getGraduationScoreTarget,
  getMonthLimitByDegree,
  getPhdDecisionRequirement,
  getRoleDefinition,
  getRoleOptions,
} from "../src/core/v2-progression";

describe("v2 progression", () => {
  it("提供稳定的角色和导师定义访问", () => {
    expect(getRoleDefinition("normal").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("genius").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("social").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("rich").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("teacher-child").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("chosen").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("normal-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("genius-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("social-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("rich-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("rewinder").name).toBe("轮回者");
    expect(getRoleDefinition("research-captain").name).toBe("统御者");
    expect(getRoleDefinition("genius-reversed").name).toBe("愚钝·院士转世");
    expect(getRoleDefinition("social-reversed").name).toBe("嫉妒·社交达人");
    expect(getRoleDefinition("genius-reversed").initialPaperSlots).toBe(4);
    expect(getAdvisorDefinition("level5").requirements.masterGrad).toBe(1);
    expect(getRoleOptions()).toHaveLength(14);
    expect(getAdvisorOptions()).toHaveLength(5);
  });

  it("统一处理最后一年仅 10 个月的日历口径", () => {
    expect(getCalendarForTotalMonths(1)).toEqual({ year: 1, month: 1 });
    expect(getCalendarForTotalMonths(21)).toEqual({ year: 2, month: 9 });
    expect(getCalendarForTotalMonths(34, "master")).toEqual({ year: 3, month: 10 });
    expect(getCalendarForTotalMonths(35, "phd")).toEqual({ year: 3, month: 11 });
    expect(getCalendarForTotalMonths(58, "phd")).toEqual({ year: 5, month: 10 });
    expect(getMonthLimitByDegree("master")).toBe(34);
    expect(getMonthLimitByDegree("phd")).toBe(58);
  });

  it("统一给出毕业线和转博线", () => {
    expect(getGraduationScoreTarget("master", "level3")).toBe(2);
    expect(getGraduationScoreTarget("phd", "level3")).toBe(11);
    expect(getPhdDecisionRequirement("level5", 2)).toBe(2);
    expect(getPhdDecisionRequirement("level5", 3)).toBe(3);
    expect(getPhdDecisionRequirement("level5", 4)).toBeNull();
  });

  it("按旧版口径结算导师工资", () => {
    expect(getAdvisorSalaryForMonth("level2", "master", 1)).toBe(1);
    expect(getAdvisorSalaryForMonth("level2", "master", 2)).toBe(2);
    expect(getAdvisorSalaryForMonth("level3", "master", 3)).toBe(1);
    expect(getAdvisorSalaryForMonth("level3", "master", 4)).toBe(2);
    expect(getAdvisorSalaryForMonth("level1", "master", 7)).toBe(1);
    expect(getAdvisorSalaryForMonth("level2", "phd", 8)).toBe(3);
    expect(getAdvisorSalaryForMonth("level4", "phd", 6)).toBe(2);
  });

  it("创建转博抉择对象时保持统一结构", () => {
    expect(createPhdDecision(2, 3)).toEqual({ kind: "phd-transfer", year: 2, requiredScore: 3 });
  });
});
