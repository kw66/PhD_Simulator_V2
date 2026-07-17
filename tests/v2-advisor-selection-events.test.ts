import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyFixedEventResolution } from "../src/core/v2-fixed-events";
import {
  createAdvisorSelectionAct1Event,
  resolveAdvisorSelection,
} from "../src/core/v2-fixed-events-advisor-selection";
import type { FixedEventResolution } from "../src/core/v2-types";

describe("v2 advisor selection events", () => {
  it("always triggers advisor selection when a new game has no advisor", () => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });

    expect(state.eventQueue).toHaveLength(1);
    expect(state.eventQueue[0]?.chainId).toBe("advisor-selection");
    expect(state.eventQueue[0]?.stage).toBe("act1");
  });

  it("uses four lecturer candidates whose buttons contain names only", () => {
    const act1 = createAdvisorSelectionAct1Event(createInitialState());
    const act2 = act1.choices[0]?.effects.enqueueEvents?.[0];

    expect(act2?.stage).toBe("act2");
    expect(act2?.description).toContain("四位讲师");
    expect(act2?.choices.map((choice) => choice.label)).toEqual(["陈明", "周岚", "林浩", "赵宁"]);
    expect(act2?.choices).toHaveLength(4);

    const advisorIds = act2?.choices.map(
      (choice) => choice.effects.fixedEventResolution?.advisorCandidate?.advisorId,
    ) ?? [];
    expect(advisorIds).toEqual(["chen-ming", "zhou-lan", "lin-hao", "zhao-ning"]);
    expect(act2?.choices.map((choice) => choice.effects.fixedEventResolution?.advisorCandidate)).toEqual([
      { advisorId: "chen-ming", researchResource: 4, affinity: 4, taskMultiplier: 6 },
      { advisorId: "zhou-lan", researchResource: 4, affinity: 4, taskMultiplier: 6 },
      { advisorId: "lin-hao", researchResource: 4, affinity: 4, taskMultiplier: 6 },
      { advisorId: "zhao-ning", researchResource: 4, affinity: 4, taskMultiplier: 6 },
    ]);

    const visibleCopy = `${act1.description}\n${act2?.description ?? ""}`;
    expect(visibleCopy).not.toContain("真正影响未来三到五年体验");
    expect(visibleCopy).not.toContain("人生的十字路口");
    expect(visibleCopy).not.toContain("未来生活方式");
  });

  it("uses the shared lecturer profile after choosing a name", () => {
    const act1 = createAdvisorSelectionAct1Event(createInitialState());
    const act2 = act1.choices[0]?.effects.enqueueEvents?.[0];
    const chenMingChoice = act2?.choices.find((choice) => choice.label === "陈明");
    const resolution = chenMingChoice?.effects.fixedEventResolution;

    expect(resolution).toBeDefined();
    if (!resolution) return;

    const result = resolveAdvisorSelection(
      { ...createInitialState(), phase: "playing" },
      resolution,
    );
    const resultEvent = result.enqueueEvents?.[0];

    expect(result.nextState.selectedAdvisorId).toBe("chen-ming");
    expect(result.nextState.graduationScoreTarget).toBe(1);
    expect(result.nextState.relationshipState.advisorCount).toBe(1);
    expect(result.nextState.advisorProgressState).toMatchObject({
      researchResource: 4,
      affinity: 4,
      taskMultiplier: 6,
      taskMax: 44,
    });
    expect(result.outcome).toContain("陈明讲师");
    expect(resultEvent?.description).toContain("导师：陈明 | 职称：讲师");
    expect(resultEvent?.description).toContain("月工资：硕士 1 | 博士 3");
    expect(resultEvent?.description).toContain("毕业要求：硕士 1 分 | 博士 7 分");
    expect(resultEvent?.description).toContain("下周一上午九点是第一次组会");
    expect(resultEvent?.choices[0]?.label).toBe("确认并入学");
    expect(resultEvent?.description).not.toContain("锚定");
    expect(resultEvent?.description).not.toContain("真实现场");
  });

  it("migrates an old tier-based event choice when resolving a legacy save", () => {
    const legacyResolution = {
      kind: "advisor-select-tier",
      advisorCandidate: {
        advisorId: "level5",
        researchResource: 4,
        affinity: 4,
        taskMultiplier: 6,
      },
    } as unknown as FixedEventResolution;

    const result = applyFixedEventResolution(
      { ...createInitialState(), phase: "playing" },
      legacyResolution,
    );

    expect(result.nextState.selectedAdvisorId).toBe("zhao-ning");
    expect(result.outcome).toContain("赵宁讲师");
  });
});
