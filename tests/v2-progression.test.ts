import { describe, expect, it } from "vitest";

import {
  getCalendarForTotalMonths,
  getGraduationScoreTarget,
  getMonthLimitByDegree,
  getRoleDefinition,
  getRoleOptions,
} from "../src/core/v2-progression";

describe("v2 progression", () => {
  it("提供稳定的角色内部配置访问", () => {
    expect(getRoleDefinition("normal").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("genius").startingStats).toEqual({ san: 20, research: 6, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("social").startingStats).toEqual({ san: 20, research: 1, social: 6, favor: 1, money: 1 });
    expect(getRoleDefinition("rich").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 9 });
    expect(getRoleDefinition("teacher-child").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 6, money: 1 });
    expect(getRoleDefinition("chosen").startingStats).toEqual({ san: 20, research: 3, social: 3, favor: 3, money: 3 });
    expect(getRoleDefinition("normal-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("genius-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("social-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("rich-reversed").startingStats).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(getRoleDefinition("rewinder").name).toBe("轮回者");
    expect(getRoleDefinition("research-captain").name).toBe("统御者");
    expect(getRoleDefinition("genius-reversed").name).toBe("愚钝·院士转世");
    expect(getRoleDefinition("social-reversed").name).toBe("嫉妒·社交达人");
    expect(getRoleDefinition("genius-reversed").initialPaperSlots).toBe(4);
    expect(getRoleOptions()).toHaveLength(14);
  });

  it("统一处理 68 个月培养周期的日历口径", () => {
    expect(getCalendarForTotalMonths(1)).toEqual({ year: 1, month: 1 });
    expect(getCalendarForTotalMonths(21)).toEqual({ year: 2, month: 9 });
    expect(getCalendarForTotalMonths(34, "master")).toEqual({ year: 3, month: 10 });
    expect(getCalendarForTotalMonths(35, "phd")).toEqual({ year: 3, month: 11 });
    expect(getCalendarForTotalMonths(58, "phd")).toEqual({ year: 5, month: 10 });
    expect(getCalendarForTotalMonths(68, "master")).toEqual({ year: 6, month: 8 });
    expect(getCalendarForTotalMonths(68, "phd")).toEqual({ year: 6, month: 8 });
    expect(getMonthLimitByDegree("master")).toBe(68);
    expect(getMonthLimitByDegree("phd")).toBe(68);
  });

  it("统一给出毕业线和转博线", () => {
    expect(getGraduationScoreTarget("master", "李旭霖")).toBe(1);
    expect(getGraduationScoreTarget("phd", "李旭霖")).toBe(7);
    expect(getGraduationScoreTarget("master", null)).toBeNull();
  });

});
