import { describe, expect, it } from "vitest";
import { MASTER_TOTAL_MONTHS, PHD_TOTAL_MONTHS } from "../src/core/v2-content";
import { getAcademicCalendarMonth } from "../src/core/v2-calendar";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";

import {
  getCalendarForTotalMonths,
  getGraduationScoreTarget,
  getMonthLimitByDegree,
  getRoleDefinition,
  getRoleOptions,
} from "../src/core/v2-progression";

describe("v2 progression", () => {
  it("提供稳定的角色内部配置访问", () => {
    expect(getRoleDefinition("rewinder").name).toBe("轮回者");
    expect(getRoleDefinition("research-captain").name).toBe("统御者");
    expect(getRoleDefinition("genius-reversed").name).toBe("愚钝·院士转世");
    expect(getRoleDefinition("social-reversed").name).toBe("嫉妒·社交达人");
    expect(getRoleOptions()).toHaveLength(18);
    expect(getRoleDefinition("special-finite-life").name).toBe("有限人生");
    expect(getRoleDefinition("special-fading-genius").name).toBe("天才迟暮");
    expect(getRoleOptions().map(role => role.id)).not.toContain("special-dandan");
    expect(getRoleOptions().map(role => role.id)).not.toContain("special-daji");
    expect(getRoleDefinition("cursed-frail").name).toBe("体弱多病");
    expect(getRoleDefinition("cursed-debt").name).toBe("寒门负重");
  });

  it.each(getRoleOptions())("共享基础属性，并应用特殊角色的开局规则：$id", (role) => {
    const startingStats = { san: 20, research: 1, social: 1, favor: 1, money: 1 };
    const state = createStartedGameState(role.id);
    expect(role.startingStats).toEqual(startingStats);
    expect(state.player).toEqual({ ...startingStats,
      ...(role.id === "special-finite-life" ? { san: 400 } : {}),
      ...(role.id === "special-fading-genius" ? { research: 20 } : {}),
    });
    expect(state.sanCap).toBe(role.id === "special-finite-life" ? 400 : 20);
    expect(state.paperSlotsUnlocked).toBe(role.id === "special-fading-genius" ? 4 : 1);
    expect(state.actionState.limit).toBe(role.id === "research-captain" ? 0 : 1);
    if (role.id === "normal-reversed") {
      expect(state.buffs).toEqual([expect.objectContaining({ id: "role-sloth-san", activeOperationSanMultiplier: 2 })]);
    } else expect(state.buffs).toEqual([]);
    expect(state.researchCapacityState).toEqual(createStartedGameState("normal").researchCapacityState);
  });

  it("按学位分别在第三年和第六年六月结束培养", () => {
    expect(MASTER_TOTAL_MONTHS).toBe(34);
    expect(PHD_TOTAL_MONTHS).toBe(70);
    expect(getMonthLimitByDegree("master")).toBe(34);
    expect(getMonthLimitByDegree("phd")).toBe(70);
    expect(getAcademicCalendarMonth(10)).toBe(6);
  });

  it.each(["master", "phd"] as const)("保留 %s 的绝对日历映射，不按硕士毕业月截断", (degree) => {
    expect(getCalendarForTotalMonths(-1, degree)).toEqual({ year: 1, month: 0 });
    expect(getCalendarForTotalMonths(0, degree)).toEqual({ year: 1, month: 0 });
    expect(getCalendarForTotalMonths(1)).toEqual({ year: 1, month: 1 });
    expect(getCalendarForTotalMonths(21)).toEqual({ year: 2, month: 9 });
    expect(getCalendarForTotalMonths(22, degree)).toEqual({ year: 2, month: 10 });
    expect(getCalendarForTotalMonths(34, degree)).toEqual({ year: 3, month: 10 });
    expect(getCalendarForTotalMonths(35, degree)).toEqual({ year: 3, month: 11 });
    expect(getCalendarForTotalMonths(36, degree)).toEqual({ year: 3, month: 12 });
    expect(getCalendarForTotalMonths(37, degree)).toEqual({ year: 4, month: 1 });
    expect(getCalendarForTotalMonths(58, degree)).toEqual({ year: 5, month: 10 });
    expect(getCalendarForTotalMonths(68, degree)).toEqual({ year: 6, month: 8 });
    expect(getCalendarForTotalMonths(69, degree)).toEqual({ year: 6, month: 9 });
    expect(getCalendarForTotalMonths(70, degree)).toEqual({ year: 6, month: 10 });
    expect(getCalendarForTotalMonths(71, degree)).toEqual({ year: 6, month: 10 });
    expect(getCalendarForTotalMonths(100, degree)).toEqual({ year: 6, month: 10 });
  });

  it("统一给出毕业线和转博线", () => {
    expect(getGraduationScoreTarget("master", "李旭霖")).toBe(1);
    expect(getGraduationScoreTarget("phd", "李旭霖")).toBe(7);
    expect(getGraduationScoreTarget("master", null)).toBeNull();
  });

});
