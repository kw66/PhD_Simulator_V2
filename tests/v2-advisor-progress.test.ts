import { describe, expect, it } from "vitest";
import { createAdvisorProgressState, resolveAdvisorTaskAdvance, tickAdvisorProgressForMonth } from "../src/core/v2-advisor-progress";

describe("v2 advisor progress", () => {
  it("uses the former associate-professor ranges for every lecturer", () => {
    const advisorIds = ["chen-ming", "zhou-lan", "lin-hao", "zhao-ning"] as const;

    for (const advisorId of advisorIds) {
      expect(createAdvisorProgressState(advisorId, () => 0)).toMatchObject({
        researchResource: 3,
        affinity: 3,
        taskMultiplier: 6,
        taskMax: 38,
      });
      expect(createAdvisorProgressState(advisorId, () => 0.999999)).toMatchObject({
        researchResource: 6,
        affinity: 5,
        taskMultiplier: 10,
        taskMax: 80,
      });
    }
  });

  it("unlocks interaction with overflow during monthly relation growth", () => {
    const state = {
      ...createAdvisorProgressState("zhao-ning", () => 0),
      affinity: 4,
      relationProgress: 38,
      taskUsedThisMonth: true,
    };

    const next = tickAdvisorProgressForMonth(state, 3);

    expect(next.relationProgress).toBe(5);
    expect(next.canInteract).toBe(true);
    expect(next.taskUsedThisMonth).toBe(false);
  });

  it("cycles completion rewards and recalculates taskMax", () => {
    const base = {
      ...createAdvisorProgressState("zhao-ning", () => 0),
      researchResource: 3,
      affinity: 4,
      taskMultiplier: 6,
      taskMax: 38,
      taskProgress: 34,
      completedProjectCount: 0,
    };

    const first = resolveAdvisorTaskAdvance(base, 10, {
      isFree: false,
      consumeInteraction: false,
      getRoll: () => 0,
    });

    expect(first.completed).toBe(true);
    expect(first.growth).toBe(5);
    expect(first.moneyDelta).toBe(5);
    expect(first.researchDelta).toBe(0);
    expect(first.paperBonus).toBe(4);
    expect(first.advisorProgressState).toMatchObject({
      researchResource: 4,
      affinity: 5,
      taskProgress: 1,
      taskMax: 44,
      completedProjectCount: 1,
    });

    const second = resolveAdvisorTaskAdvance(
      {
        ...first.advisorProgressState,
        taskProgress: 40,
      },
      10,
      {
        isFree: false,
        consumeInteraction: false,
        getRoll: () => 0,
      },
    );

    expect(second.completed).toBe(true);
    expect(second.moneyDelta).toBe(0);
    expect(second.researchDelta).toBe(1);
    expect(second.paperBonus).toBe(5);
    expect(second.advisorProgressState).toMatchObject({
      researchResource: 5,
      taskProgress: 1,
      taskMax: 50,
      completedProjectCount: 2,
    });
  });
});
