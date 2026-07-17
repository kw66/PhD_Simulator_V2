import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyFixedEventResolution } from "../src/core/v2-fixed-events";
import {
  createSeniorSummerAct1Event,
  resolveAdvisorAssignment,
} from "../src/core/v2-fixed-events-senior-summer";
import type { FixedEventResolution, PendingEvent } from "../src/core/v2-types";

function getAdvisorReviewEvent(roll: number): PendingEvent {
  const act1 = createSeniorSummerAct1Event(createInitialState(), () => roll);
  const reviewEvent = act1.choices[0]?.effects.enqueueEvents?.[0];
  expect(reviewEvent).toBeDefined();
  return reviewEvent as PendingEvent;
}

describe("v2 senior summer events", () => {
  it("always starts one senior-summer event when a new game has no advisor", () => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });

    expect(state.eventQueue).toHaveLength(1);
    expect(state.eventQueue[0]).toMatchObject({
      id: "senior-summer-act1",
      title: "大四暑假",
      chainId: "senior-summer",
      stage: "act1",
    });
    expect(state.log[0]?.text).toContain("触发事件：大四暑假");
  });

  it("writes the opening from a graduating undergraduate's point of view", () => {
    const act1 = createSeniorSummerAct1Event(createInitialState(), () => 0);

    expect(act1.description).toContain("拍毕业照那天太阳很大");
    expect(act1.description).toContain("桌上还堆着没寄走的书");
    expect(act1.description).toContain("第一次在组会上讲实验");
    expect(act1.description).toContain("收到录用邮件");
    expect(act1.description).toContain("导师由系统统一分配");
    expect(act1.choices.map((choice) => choice.label)).toEqual(["看看分到了哪位老师"]);
  });

  it("uses the first and last lecturer at the random roll boundaries", () => {
    const firstReview = getAdvisorReviewEvent(0);
    const lastReview = getAdvisorReviewEvent(0.999999);

    expect(firstReview.id).toBe("senior-summer-advisor-review-chen-ming");
    expect(firstReview.description).toContain("陈明，讲师");
    expect(lastReview.id).toBe("senior-summer-advisor-review-zhao-ning");
    expect(lastReview.description).toContain("赵宁，讲师");
  });

  it("shows one assigned lecturer and the relevant game data on the review site", () => {
    const reviewEvent = getAdvisorReviewEvent(0.3);
    const resolution = reviewEvent.choices[0]?.effects.fixedEventResolution;

    expect(reviewEvent.stage).toBe("act2");
    expect(reviewEvent.title).toBe("大四暑假");
    expect(reviewEvent.description).toContain("导师评价网");
    expect(reviewEvent.description).toContain("周岚讲师");
    expect(reviewEvent.description).toContain("匿名评价：");
    expect(reviewEvent.description).toContain("科研资源 4　初始亲和度 4");
    expect(reviewEvent.description).toContain("项目任务倍率 6　上限 44　做项目消耗 SAN 5");
    expect(reviewEvent.description).toContain("月工资：硕士 1　博士 3");
    expect(reviewEvent.description).toContain("毕业线：硕士 1 分　博士 7 分");
    expect(reviewEvent.description).toContain("转博线：第 2 年 2 分　第 3 年 3 分");
    expect(reviewEvent.choices.map((choice) => choice.label)).toEqual(["记下这些信息"]);
    expect(resolution).toEqual({
      kind: "advisor-assign",
      advisorCandidate: {
        advisorId: "zhou-lan",
        researchResource: 4,
        affinity: 4,
        taskMultiplier: 6,
      },
    });
  });

  it("writes the assigned lecturer and shared progression values after confirmation", () => {
    const reviewEvent = getAdvisorReviewEvent(0);
    const resolution = reviewEvent.choices[0]?.effects.fixedEventResolution;

    expect(resolution).toBeDefined();
    if (!resolution) return;

    const result = resolveAdvisorAssignment(
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
      relationMax: 40,
    });
    expect(result.outcome).toContain("系统将你分配给了陈明讲师");
    expect(resultEvent).toMatchObject({
      title: "大四暑假",
      chainId: "senior-summer",
      stage: "result",
    });
    expect(resultEvent?.description).toContain("开学前要读");
    expect(resultEvent?.description).toContain("第一次把论文投出去");
    expect(resultEvent?.description).toContain("截图发给家里");
    expect(resultEvent?.choices[0]?.label).toBe("收拾行李，准备报到");
  });

  it("keeps old tier-based event choices resolvable for legacy saves", () => {
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
