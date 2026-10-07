import { describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import type { GameState } from "../src/core/v2-types";

function juneState(score: number): GameState {
  const base = createStartedGameState("normal");
  return { ...base, totalMonths: 10, month: 10, year: 1, selectedAdvisorName: "导师", eventQueue: [],
    fellowProgressState: [createCustomFellowProgressProfile({ type: "senior", gender: "female", research: 8,
      affinity: 3, academicYear: 3, degree: "master", initialResearchScore: score, startTotalMonths: 1,
      longTermMentoring: true })],
    relationshipState: { ...base.relationshipState, occupiedSlots: 1, seniorCount: 1 },
  };
}

describe("next-month preview at academic boundaries", () => {
  it.each([0, 1])("excludes June departing fellows from July wages and SAN at score %s", (score) => {
    const state = juneState(score);
    const before = structuredClone(state);
    const random = vi.spyOn(Math, "random");
    const preview = previewNextMonthEffects(state);
    expect(preview.items.some((item) => item.id.startsWith("fellow-mentoring-"))).toBe(false);
    expect(preview.items.find((item) => item.id === "advisor-salary")?.note).toBe("学生工资：科研经费 -1");
    expect(state).toEqual(before);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("keeps successful transfer fellows and previews their new doctoral salary", () => {
    const preview = previewNextMonthEffects(juneState(3));
    expect(preview.items.some((item) => item.id.startsWith("fellow-mentoring-"))).toBe(true);
    expect(preview.items.find((item) => item.id === "advisor-salary")?.note).toBe("学生工资：科研经费 -4");
  });

  it.each([34, 70])("does not promise a month-start settlement beyond the final month %s", (limit) => {
    const state = { ...juneState(1), totalMonths: limit, maxMonths: limit, year: limit === 34 ? 3 : 6 };
    const preview = previewNextMonthEffects(state);
    expect(preview.items).toEqual([]);
    expect(preview.player).toEqual(state.player);
    expect(previewNextMonthEffects({ ...state, degree: "phd", maxMonths: 70, totalMonths: 34 }).items.length).toBeGreaterThan(0);
  });
});
