import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import {
  createBeforeGradSchoolAct1Event,
  resolveAdvisorConfirmation,
} from "../src/core/v2-fixed-events-before-grad-school";
import type { PendingEvent } from "../src/core/v2-types";

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
      title: "读研之始",
      chainId: "before-grad-school",
      stage: "act1",
    });
    expect(state.log[0]?.text).toContain("触发事件：读研之始");
  });

  it("puts summer camp and pre-admission before contacting a lecturer", () => {
    const act1 = createBeforeGradSchoolAct1Event(createInitialState(), () => 0);

    expect(act1.description).toContain("大三下");
    expect(act1.description).toContain("个人陈述");
    expect(act1.description).toContain("夏令营");
    expect(act1.description).toContain("预推免");
    expect(act1.description).toContain("心仪学校的预录取");
    expect(act1.description).toContain("保上了最想去的学校");
    expect(act1.description.indexOf("夏令营")).toBeLessThan(act1.description.lastIndexOf("预推免"));
    expect(act1.description).not.toContain("年级群");
    expect(act1.description).not.toContain("推免资格名单");
    expect(act1.description).not.toContain("九推系统");
    expect(act1.description).not.toContain("接受待录取");
    expect(act1.description).not.toContain("公告栏");
    expect(act1.preview).toBe("拿到梦校预录取，准备联系导师");
    expect(act1.choices.map((choice) => choice.label)).toEqual(["联系导师"]);
  });

  it("combines random lecturer names at the roll boundaries", () => {
    const firstInfo = getAdvisorInfoEvent(0);
    const lastInfo = getAdvisorInfoEvent(0.999999);

    expect(firstInfo.id).toBe("before-grad-school-advisor-info-chen-ming");
    expect(firstInfo.description).toContain("李旭旭讲师回了信");
    expect(lastInfo.id).toBe("before-grad-school-advisor-info-zhao-ning");
    expect(lastInfo.description).toContain("章名讲师回了信");
  });

  it("uses active contact instead of assignment and shows one lecturer's relevant information", () => {
    const act1 = createBeforeGradSchoolAct1Event(createInitialState(), () => 0.6);
    const advisorInfo = act1.choices[0]?.effects.enqueueEvents?.[0] as PendingEvent;
    const resolution = advisorInfo.choices[0]?.effects.fixedEventResolution;
    const visibleCopy = `${act1.description}\n${advisorInfo.description}`;

    expect(advisorInfo.stage).toBe("act2");
    expect(advisorInfo.title).toBe("读研之始");
    expect(advisorInfo.description).toContain("给对应的老师发了邮件");
    expect(advisorInfo.description).toContain("辛英英讲师回了信");
    expect(advisorInfo.description).toContain("导师评价网");
    expect(advisorInfo.description).toContain("即使暂时没结果，也要把卡在哪里讲清楚");
    expect(advisorInfo.description).toContain("赶项目节点时会忙一阵");
    expect(advisorInfo.description).not.toContain("游戏数据");
    expect(advisorInfo.description).not.toContain("科研资源");
    expect(advisorInfo.description).not.toContain("项目任务倍率");
    expect(advisorInfo.description).not.toContain("做项目消耗 SAN");
    expect(advisorInfo.description).toContain("月工资：硕士 1　博士 3");
    expect(advisorInfo.description).toContain("毕业线：硕士 1 分　博士 7 分");
    expect(advisorInfo.description).toContain("转博线：第 2 年 2 分　第 3 年 3 分");
    expect(advisorInfo.choices.map((choice) => choice.label)).toEqual(["回复导师"]);
    expect(resolution).toEqual({
      kind: "advisor-confirm",
      advisorCandidate: {
        advisorId: "lin-hao",
        advisorName: "辛英英",
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
    expect(resolved.nextState.selectedAdvisorName).toBe("李旭旭");
    expect(resolved.nextState.graduationScoreTarget).toBe(1);
    expect(resolved.nextState.relationshipState.advisorCount).toBe(1);
    expect(resolved.nextState.advisorProgressState).toMatchObject({
      researchResource: 4,
      affinity: 4,
      taskMultiplier: 6,
      taskMax: 44,
      relationMax: 40,
    });
    expect(resolved.outcome).toContain("回复了李旭旭讲师，表示希望加入课题组");
    expect(resolved.outcome).not.toContain("分配");
    expect(summerEvent).toMatchObject({
      title: "读研之始",
      chainId: "before-grad-school",
      stage: "result",
    });
    expect(summerEvent?.description).toContain("收到，开学见");
    expect(summerEvent?.description).toContain("推免资格名单");
    expect(summerEvent?.description).toContain("九推系统");
    expect(summerEvent?.description).toContain("接受待录取");
    expect(summerEvent?.description.indexOf("推免资格名单") ?? -1).toBeLessThan(
      summerEvent?.description.indexOf("九推系统") ?? -1,
    );
    expect(summerEvent?.description.indexOf("九推系统") ?? -1).toBeLessThan(
      summerEvent?.description.indexOf("接受待录取") ?? -1,
    );
    expect(summerEvent?.description).toContain("暑假");
    expect(summerEvent?.description).toContain("第一次组会");
    expect(summerEvent?.description).toContain("第一篇投稿");
    expect(summerEvent?.choices[0]?.label).toBe("准备报到");
  });

});
