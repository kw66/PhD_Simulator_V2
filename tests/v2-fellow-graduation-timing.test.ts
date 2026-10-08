import { afterEach, describe, expect, it, vi } from "vitest";
import { getAcademicCalendarMonth } from "../src/core/v2-calendar";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getFellowAcademicYear } from "../src/core/v2-fellow-academic";
import { settleFellowAcademicYear } from "../src/core/v2-fellow-lifecycle";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getNextMonthLabPayroll } from "../src/core/v2-lab-payroll";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import type { Degree, GameState } from "../src/core/v2-types";

function makeState(academicYear: number, score: number, degree: Degree, month = 9): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base, year: 2, month, totalMonths: 12 + month, degree: "phd", maxMonths: 70,
    selectedAdvisorName: "测试导师", availableRandomEvents: [], blockLinearEvents: false,
    player: { ...base.player, money: 100, social: 10, favor: 10 },
    advisorProgressState: { ...base.advisorProgressState, funding: 1000 },
    fellowProgressState: [createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: "林青", research: 0, affinity: 0,
      startTotalMonths: 13, academicYear, initialResearchScore: score, degree,
    })],
    relationshipState: { ...base.relationshipState, occupiedSlots: 1, peerCount: 1 },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("fellow graduation timing through month advancement", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12])(
    "does not settle a terminal-year fellow during academic month %s", (month) => {
      for (const [academicYear, score, degree] of [[3, 1, "master"], [6, 7, "phd"]] as const) {
        const state = makeState(academicYear, score, degree, month);
        expect(settleFellowAcademicYear(state)).toBe(state);
      }
    },
  );

  it.each([1, 2, 3, 4, 5])("keeps a year %s doctoral fellow with seven points even after June", (academicYear) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(academicYear, 7, "phd", 10);
    const next = dispatchAction(state, "next-month");
    expect(next.totalMonths).toBe(23);
    expect(next.fellowProgressState).toHaveLength(1);
    expect(next.fellowProgressState[0]?.degree).toBe("phd");
    expect(next.relationshipState.occupiedSlots).toBe(1);
    expect(next.log.some((entry) => entry.id.startsWith("fellow-graduation"))).toBe(false);
  });

  it.each([[3, 1, "master"], [6, 7, "phd"]] as const)(
    "keeps year %s %s-point %s through June actions and removes them only when leaving June", (academicYear, score, degree) => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const may = makeState(academicYear, score, degree);
      expect(getAcademicCalendarMonth(may.month)).toBe(5);
      const june = dispatchAction(may, "next-month");
      expect(getAcademicCalendarMonth(june.month)).toBe(6);
      expect(june.fellowProgressState).toHaveLength(1);
      expect(getFellowAcademicYear(june, june.fellowProgressState[0]!)).toBe(academicYear);
      const afterAction = dispatchAction(june, "rest");
      expect(afterAction.totalMonths).toBe(june.totalMonths);
      expect(afterAction.fellowProgressState).toHaveLength(1);
      const july = dispatchAction(afterAction, "next-month");
      expect(getAcademicCalendarMonth(july.month)).toBe(7);
      expect(july.fellowProgressState).toHaveLength(0);
      expect(july.relationshipState).toMatchObject({ occupiedSlots: 0, peerCount: 0 });
      expect(july.log.find((entry) => entry.id.startsWith("fellow-graduation")))
        .toMatchObject({ month: june.totalMonths });
    },
  );

  it.each([[2, 2], [3, 3], [3, 7]])("transfers year %s with %s points at June end before considering departure", (academicYear, score) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const june = dispatchAction(makeState(academicYear, score, "master"), "next-month");
    expect(june.fellowProgressState[0]?.degree).toBe("master");
    const july = dispatchAction(june, "next-month");
    expect(july.totalMonths).toBe(23);
    expect(july.fellowProgressState[0]?.degree).toBe("phd");
    expect(getFellowAcademicYear(july, july.fellowProgressState[0]!)).toBe(academicYear);
    expect(july.relationshipState.occupiedSlots).toBe(1);
    expect(july.log.filter((entry) => entry.id.startsWith("fellow-transfer"))).toHaveLength(1);
    expect(july.log.some((entry) => entry.id.startsWith("fellow-graduation"))).toBe(false);
  });

  it.each([
    [3, 1, "master", 9, "master", 1 + 0.5],
    [6, 7, "phd", 9, "phd", 2.5 + 1],
    [3, 1, "master", 10, null, 0],
    [6, 7, "phd", 10, null, 0],
    [5, 7, "phd", 10, "phd", 2.5 + 1],
    [2, 2, "master", 10, "phd", 2.5 + 1],
    [3, 3, "master", 10, "phd", 2.5 + 1],
  ] as const)("matches preview and actual payroll for year %s score %s %s in month %s", (academicYear, score, degree, month, nextDegree, salary) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState(academicYear, score, degree, month);
    const before = structuredClone(state);
    const payroll = getNextMonthLabPayroll(state);
    const preview = previewNextMonthEffects(state);
    expect(payroll.total).toBe(2.5 + 1 + salary);
    expect(preview.items.find((item) => item.id === "advisor-salary")?.note)
      .toBeUndefined();
    expect(getNextMonthLabPayroll(state)).toEqual(payroll);
    expect(previewNextMonthEffects(state)).toEqual(preview);
    expect(state).toEqual(before);
    const next = dispatchAction(state, "next-month");
    expect(next.totalMonths).toBe(state.totalMonths + 1);
    expect(next.fellowProgressState[0]?.degree ?? null).toBe(nextDegree);
    expect(next.fellowProgressState[0]?.monthlySalaryPaid ?? 0).toBe(salary);
    expect(next.player.money).toBe(preview.player.money);
    expect(next.player.money).toBe(state.player.money + 2.5 + 1 - 1);
    expect(next.advisorProgressState.funding).toBe(state.advisorProgressState.funding - payroll.total);
  });
});
