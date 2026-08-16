import { describe, expect, it } from "vitest";

import {
  createPhdDecision,
  getAdvisorDefinition,
  getAdvisorSalaryForMonth,
  getCalendarForTotalMonths,
  getGraduationScoreTarget,
  getMonthLimitByDegree,
  getPhdDecisionRequirement,
  getRoleDefinition,
  getRoleOptions,
} from "../src/core/v2-progression";

const ADVISOR_PROFILE_IDS = ["chen-ming", "zhou-lan", "lin-hao", "zhao-ning"] as const;

describe("v2 progression", () => {
  it("提供稳定的角色和导师内部配置访问", () => {
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
    expect(getAdvisorDefinition("zhao-ning").id).toBe("zhao-ning");
    expect(getRoleOptions()).toHaveLength(14);
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
    for (const advisorId of ADVISOR_PROFILE_IDS) {
      expect(getGraduationScoreTarget("master", advisorId)).toBe(1);
      expect(getGraduationScoreTarget("phd", advisorId)).toBe(7);
      expect(getPhdDecisionRequirement(advisorId, 2)).toBe(2);
      expect(getPhdDecisionRequirement(advisorId, 3)).toBe(3);
      expect(getPhdDecisionRequirement(advisorId, 4)).toBeNull();
    }
  });

  it("四位讲师都按旧副教授口径结算工资", () => {
    for (const advisorId of ADVISOR_PROFILE_IDS) {
      expect(getAdvisorSalaryForMonth(advisorId, "master", 1)).toBe(1);
      expect(getAdvisorSalaryForMonth(advisorId, "master", 8)).toBe(1);
      expect(getAdvisorSalaryForMonth(advisorId, "phd", 1)).toBe(3);
      expect(getAdvisorSalaryForMonth(advisorId, "phd", 8)).toBe(3);
    }
  });

  it("创建转博抉择对象时保持统一结构", () => {
    expect(createPhdDecision(2, 3)).toEqual({ kind: "phd-transfer", year: 2, requiredScore: 3 });
  });
});
