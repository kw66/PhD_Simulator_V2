import { describe, expect, it } from "vitest";
import {
  activateLoverProgress,
  buildLoverPaperBonusUpdate,
  createLoverProgressState,
  resolveLoverTaskAdvance,
  tickLoverProgressForMonth,
} from "../src/core/v2-lover-progression";

describe("v2 lover progression", () => {
  it("activates smart and beautiful lovers with audited initial stats", () => {
    const smart = activateLoverProgress("smart", 10, () => 0);
    const beautiful = activateLoverProgress("beautiful", 10, () => 0);

    expect(smart).toMatchObject({ active: true, research: 11, intimacy: 9, taskMax: 100, relationMax: 40 });
    expect(beautiful).toMatchObject({ active: true, research: 7, intimacy: 12, taskMax: 100, relationMax: 40 });
  });

  it("unlocks interaction with overflow during monthly relation growth", () => {
    const state = {
      ...createLoverProgressState(),
      active: true,
      intimacy: 12,
      relationProgress: 35,
      taskUsedThisMonth: true,
    };

    const next = tickLoverProgressForMonth(state);

    expect(next.relationProgress).toBe(7);
    expect(next.canInteract).toBe(true);
    expect(next.taskUsedThisMonth).toBe(false);
  });

  it("applies beautiful lover cycle rewards", () => {
    const state = {
      ...activateLoverProgress("beautiful", 10, () => 0),
      taskProgress: 95,
      intimacy: 12,
    };

    const first = resolveLoverTaskAdvance(state, {
      type: "beautiful",
      currentSan: 10,
      sanCap: 20,
      persistentExtraActions: { idea: 0, experiment: 0, writing: 0 },
      isFree: false,
      consumeInteraction: false,
      getRoll: () => 0,
    });

    expect(first.completed).toBe(true);
    expect(first.moneyCost).toBe(2);
    expect(first.sanDelta).toBe(1);
    expect(first.sanCapDelta).toBe(0);
    expect(first.beautifulExtraRecoveryRateDelta).toBe(0);

    const third = resolveLoverTaskAdvance(
      {
        ...state,
        completedTaskCount: 2,
      },
      {
        type: "beautiful",
        currentSan: 10,
        sanCap: 20,
        persistentExtraActions: { idea: 0, experiment: 0, writing: 0 },
        isFree: false,
        consumeInteraction: false,
        getRoll: () => 0,
      },
    );

    expect(third.completed).toBe(true);
    expect(third.beautifulExtraRecoveryRateDelta).toBe(2);
  });

  it("does not grant duplicate smart permanent actions after acceptance buffs already exist", () => {
    const state = {
      ...activateLoverProgress("smart", 10, () => 0),
      taskProgress: 96,
    };

    const result = resolveLoverTaskAdvance(state, {
      type: "smart",
      currentSan: 20,
      sanCap: 20,
      persistentExtraActions: { idea: 1, experiment: 1, writing: 1 },
      isFree: false,
      consumeInteraction: false,
      getRoll: () => 0,
    });

    expect(result.completed).toBe(true);
    expect(result.persistentExtraActionDeltas).toEqual({});
    expect(result.paperBonusTotal).toBe(Math.floor(result.loverProgressState.research * 1.5));
  });

  it("distributes lover paper bonus to the current lowest stat first", () => {
    const update = buildLoverPaperBonusUpdate(
      {
        id: "paper-1",
        title: "Paper 1",
        idea: 1,
        experiment: 5,
        writing: 9,
        status: "draft",
        target: null,
        reviewMonthsLeft: 0,
        submittedIdea: null,
        submittedExperiment: null,
        submittedWriting: null,
      },
      4,
    );

    expect(update).toEqual({ idea: 4, experiment: 0, writing: 0 });
  });
});
