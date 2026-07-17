import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyFixedEventResolution } from "../src/core/v2-fixed-events";
import {
  createBeforeGradSchoolAct1Event,
  resolveAdvisorConfirmation,
} from "../src/core/v2-fixed-events-before-grad-school";
import type { FixedEventResolution, PendingEvent } from "../src/core/v2-types";

function getAdvisorInfoEvent(roll: number): PendingEvent {
  const act1 = createBeforeGradSchoolAct1Event(createInitialState(), () => roll);
  const advisorInfo = act1.choices[0]?.effects.enqueueEvents?.[0];
  expect(advisorInfo).toBeDefined();
  return advisorInfo as PendingEvent;
}

describe("v2 before grad school events", () => {
  it("always starts one before-grad-school event when a new game has no advisor", () => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });

    expect(state.eventQueue).toHaveLength(1);
    expect(state.eventQueue[0]).toMatchObject({
      id: "before-grad-school-qualification",
      title: "读研之前",
      chainId: "before-grad-school",
      stage: "act1",
    });
    expect(state.log[0]?.text).toContain("触发事件：读研之前");
  });

  it("uses the first act for earning and confirming the recommendation qualification", () => {
    const act1 = createBeforeGradSchoolAct1Event(createInitialState(), () => 0);

    expect(act1.description).toContain("大四上学期");
    expect(act1.description).toContain("保研资格名单");
    expect(act1.description).toContain("看见了自己的名字");
    expect(act1.description).toContain("资格确认完成");
    expect(act1.description).toContain("打开学院网站");
    expect(act1.preview).toBe("保研资格名单已经公示");
    expect(act1.choices.map((choice) => choice.label)).toEqual(["去看看导师信息"]);
  });

  it("uses the first and last lecturer at the random roll boundaries", () => {
    const firstInfo = getAdvisorInfoEvent(0);
    const lastInfo = getAdvisorInfoEvent(0.999999);

    expect(firstInfo.id).toBe("before-grad-school-advisor-info-chen-ming");
    expect(firstInfo.description).toContain("陈明讲师回了信");
    expect(lastInfo.id).toBe("before-grad-school-advisor-info-zhao-ning");
    expect(lastInfo.description).toContain("赵宁讲师回了信");
  });

  it("uses active contact instead of assignment and shows one lecturer's game data", () => {
    const act1 = createBeforeGradSchoolAct1Event(createInitialState(), () => 0.3);
    const advisorInfo = act1.choices[0]?.effects.enqueueEvents?.[0] as PendingEvent;
    const resolution = advisorInfo.choices[0]?.effects.fixedEventResolution;
    const visibleCopy = `${act1.description}\n${advisorInfo.description}`;

    expect(advisorInfo.stage).toBe("act2");
    expect(advisorInfo.title).toBe("读研之前");
    expect(advisorInfo.description).toContain("给几位研究方向感兴趣的老师发了邮件");
    expect(advisorInfo.description).toContain("周岚讲师回了信");
    expect(advisorInfo.description).toContain("导师评价网");
    expect(advisorInfo.description).toContain("科研资源 4　初始亲和度 4");
    expect(advisorInfo.description).toContain("项目任务倍率 6　上限 44　做项目消耗 SAN 5");
    expect(advisorInfo.description).toContain("月工资：硕士 1　博士 3");
    expect(advisorInfo.description).toContain("毕业线：硕士 1 分　博士 7 分");
    expect(advisorInfo.description).toContain("转博线：第 2 年 2 分　第 3 年 3 分");
    expect(advisorInfo.choices.map((choice) => choice.label)).toEqual(["回复邮件，确认入组"]);
    expect(resolution).toEqual({
      kind: "advisor-confirm",
      advisorCandidate: {
        advisorId: "zhou-lan",
        researchResource: 4,
        affinity: 4,
        taskMultiplier: 6,
      },
    });
    expect(visibleCopy).not.toContain("分配");
    expect(visibleCopy).not.toContain("分组名单");
  });

  it("uses the third act for the summer before enrollment", () => {
    const advisorInfo = getAdvisorInfoEvent(0);
    const resolution = advisorInfo.choices[0]?.effects.fixedEventResolution;

    expect(resolution).toBeDefined();
    if (!resolution) return;

    const resolved = resolveAdvisorConfirmation(
      { ...createInitialState(), phase: "playing" },
      resolution,
    );
    const summerEvent = resolved.enqueueEvents?.[0];

    expect(resolved.nextState.selectedAdvisorId).toBe("chen-ming");
    expect(resolved.nextState.graduationScoreTarget).toBe(1);
    expect(resolved.nextState.relationshipState.advisorCount).toBe(1);
    expect(resolved.nextState.advisorProgressState).toMatchObject({
      researchResource: 4,
      affinity: 4,
      taskMultiplier: 6,
      taskMax: 44,
      relationMax: 40,
    });
    expect(resolved.outcome).toContain("和陈明讲师确认了入组意向");
    expect(resolved.outcome).not.toContain("分配");
    expect(summerEvent).toMatchObject({
      title: "读研之前",
      chainId: "before-grad-school",
      stage: "result",
    });
    expect(summerEvent?.description).toContain("收到，开学见");
    expect(summerEvent?.description).toContain("大四毕业后的暑假");
    expect(summerEvent?.description).toContain("第一次在组会上讲实验");
    expect(summerEvent?.description).toContain("录用邮件");
    expect(summerEvent?.choices[0]?.label).toBe("收拾行李，准备报到");
  });

  it("resolves advisor-assign choices persisted by the previous release", () => {
    const previousResolution: FixedEventResolution = {
      kind: "advisor-assign",
      advisorCandidate: {
        advisorId: "lin-hao",
        researchResource: 4,
        affinity: 4,
        taskMultiplier: 6,
      },
    };

    const result = applyFixedEventResolution(
      { ...createInitialState(), phase: "playing" },
      previousResolution,
    );

    expect(result.nextState.selectedAdvisorId).toBe("lin-hao");
    expect(result.outcome).toContain("和林浩讲师确认了入组意向");
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
