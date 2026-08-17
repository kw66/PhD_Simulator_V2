import { describe, expect, it, vi } from "vitest";

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

function getAdvisorConfirmationResolution(event: PendingEvent) {
  return event.choices.find((choice) => (
    choice.effects.fixedEventResolution?.kind === "advisor-confirm"
  ))?.effects.fixedEventResolution;
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
    expect(act1.description).toContain("计算机类专业");
    expect(act1.description).toContain("你是计算机类专业");
    expect(act1.description).toContain("还没想清楚是否喜欢科研");
    expect(act1.description).toContain("准备随大流继续读研");
    expect(act1.description).toContain("随大流");
    expect(act1.description).not.toContain("机器学习和深度学习");
    expect(act1.description).not.toContain("招聘信息");
    expect(act1.description).not.toContain("本科学历不好找工作");
    expect(act1.description).not.toContain("准备继续读书");
    expect(act1.description).toContain("个人陈述");
    expect(act1.description).toContain("夏令营");
    expect(act1.description).toContain("预推免");
    expect(act1.description).toContain("心仪学校的预录取");
    expect(act1.description).toContain("接下来，该联系导师了");
    expect(act1.description.indexOf("夏令营")).toBeLessThan(act1.description.lastIndexOf("预推免"));
    expect(act1.description).not.toContain("年级群");
    expect(act1.description).not.toContain("推免资格名单");
    expect(act1.description).not.toContain("推免系统");
    expect(act1.description).not.toContain("接受待录取");
    expect(act1.description).not.toContain("公告栏");
    expect(act1.preview).toBe("拿到梦校预录取，准备联系导师");
    expect(act1.choices.map((choice) => choice.label)).toEqual(["联系导师"]);
  });

  it("draws lecturer names from the curated pool at the roll boundaries", () => {
    const firstInfo = getAdvisorInfoEvent(0);
    const lastInfo = getAdvisorInfoEvent(0.999999);

    expect(firstInfo.id).toBe("before-grad-school-advisor-info");
    expect(firstInfo.description).toContain("李旭旭 · 讲师");
    expect(lastInfo.id).toBe("before-grad-school-advisor-info");
    expect(lastInfo.description).toContain("王江 · 讲师");
  });

  it("uses active contact instead of assignment and shows one lecturer's relevant information", () => {
    const act1 = createBeforeGradSchoolAct1Event(createInitialState(), () => 0.6);
    const advisorInfo = act1.choices[0]?.effects.enqueueEvents?.[0] as PendingEvent;
    const resolution = getAdvisorConfirmationResolution(advisorInfo);
    const visibleCopy = `${act1.description}\n${advisorInfo.description}`;

    expect(advisorInfo.stage).toBe("act2");
    expect(advisorInfo.title).toBe("读研之始");
    expect(advisorInfo.description).toContain("你给感兴趣的老师发了邮件，又找组里的学生问了问。");
    expect(advisorInfo.description).toContain("梁哲哲 · 讲师");
    expect(advisorInfo.description).not.toContain("讲师回信后");
    expect(advisorInfo.description).not.toContain("搜集信息");
    expect(advisorInfo.description).toContain("每月组会｜横向较少｜研二可实习");
    expect(advisorInfo.description).toContain("定期反馈｜显卡需排队｜回复及时");
    expect(advisorInfo.description).toContain("合作较多｜选题较自由｜作息规律");
    expect(advisorInfo.description).not.toContain("评价网");
    expect(advisorInfo.description).not.toContain("匿名评价");
    expect(advisorInfo.description).not.toContain("游戏数据");
    expect(advisorInfo.description).not.toContain("科研资源");
    expect(advisorInfo.description).not.toContain("项目任务倍率");
    expect(advisorInfo.description).not.toContain("做项目消耗 SAN");
    expect(advisorInfo.description).toContain("工资：硕士 1 金币｜博士 3 金币");
    expect(advisorInfo.description).toContain("科研分：论文录用，C 类 +1｜B 类 +2｜A 类 +4");
    expect(advisorInfo.description).toContain("毕业：硕士 1 分｜博士 7 分");
    expect(advisorInfo.description).toContain("毕业：硕士 1 分｜博士 7 分\n转博士：第 2 年 2 分｜第 3 年 3 分");
    expect(advisorInfo.choices.map((choice) => choice.label)).toEqual(["换个导师", "回复导师"]);
    expect(resolution).toEqual({
      kind: "advisor-confirm",
      advisorCandidate: {
        advisorName: "梁哲哲",
        researchResource: 4,
        affinity: 4,
        taskMultiplier: 6,
      },
    });
    expect(visibleCopy).not.toContain("分配");
    expect(visibleCopy).not.toContain("分组名单");
  });

  it("keeps collected lecturer information separate from gameplay values", () => {
    const firstInfo = getAdvisorInfoEvent(0);
    const lastInfo = getAdvisorInfoEvent(0.999999);
    const firstCandidate = getAdvisorConfirmationResolution(firstInfo)?.advisorCandidate;
    const lastCandidate = getAdvisorConfirmationResolution(lastInfo)?.advisorCandidate;

    expect(firstInfo.description).toContain("周报 + 组会｜项目少｜可实习");
    expect(firstInfo.description).toContain("指导少｜资源较少｜老师宽和");
    expect(firstInfo.description).toContain("氛围好｜偏算法研究｜节奏平稳");
    expect(lastInfo.description).toContain("周报为主｜项目可选｜不限制实习");
    expect(lastInfo.description).toContain("同门带得多｜可借校内算力｜比较随和");
    expect(lastInfo.description).toContain("组内常交流｜方向较稳定｜平时较松");
    expect(firstCandidate).toMatchObject({ researchResource: 4, affinity: 4, taskMultiplier: 6 });
    expect(lastCandidate).toMatchObject({ researchResource: 4, affinity: 4, taskMultiplier: 6 });
  });

  it("provides six variants across every lecturer information category", () => {
    const intelSamples = [0, 0.2, 0.4, 0.6, 0.8, 0.999999].map((roll) => {
      const event = getAdvisorInfoEvent(roll);
      return event.choices.find((choice) => choice.label === "换个导师")
        ?.effects.fixedEventResolution?.advisorIntel;
    });

    const intelKeys = [
      "reporting",
      "projects",
      "internship",
      "guidance",
      "computing",
      "temperament",
      "atmosphere",
      "focus",
      "pace",
    ] as const;
    for (const key of intelKeys) {
      expect(new Set(intelSamples.map((intel) => intel?.[key])).size).toBe(6);
    }
  });

  it("rerolls only the lecturer name and description until the lecturer is confirmed", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
      state = dispatchAction(state, "resolve-event", {
        eventChoiceId: "before-grad-school-open-advisor-info",
      });

      const originalEvent = state.eventQueue[0];
      const rerollChoice = originalEvent?.choices.find((choice) => choice.label === "换个导师");
      if (!originalEvent || !rerollChoice) throw new Error("advisor reroll choice missing");

      const originalCandidate = getAdvisorConfirmationResolution(originalEvent)?.advisorCandidate;
      const originalPlayer = structuredClone(state.player);
      const originalAdvisorProgress = structuredClone(state.advisorProgressState);
      const originalRelationshipState = structuredClone(state.relationshipState);
      const originalHistory = structuredClone(originalEvent.history);
      const originalEventHistory = structuredClone(state.eventHistory);
      const originalLog = structuredClone(state.log);

      state = dispatchAction(state, "resolve-event", {
        eventId: originalEvent.id,
        eventChoiceId: rerollChoice.id,
      });

      const refreshedEvent = state.eventQueue[0];
      const refreshedCandidate = refreshedEvent
        ? getAdvisorConfirmationResolution(refreshedEvent)?.advisorCandidate
        : undefined;
      expect(refreshedEvent?.id).toBe(originalEvent.id);
      expect(refreshedEvent?.queueOrder).toBe(originalEvent.queueOrder);
      expect(refreshedEvent?.history).toEqual(originalHistory);
      expect(state.eventHistory).toEqual(originalEventHistory);
      expect(state.log).toEqual(originalLog);
      expect(refreshedEvent?.description).not.toBe(originalEvent.description);
      expect(refreshedCandidate?.advisorName).not.toBe(originalCandidate?.advisorName);
      expect(refreshedCandidate).toMatchObject({
        researchResource: 4,
        affinity: 4,
        taskMultiplier: 6,
      });
      expect(state.player).toEqual(originalPlayer);
      expect(state.advisorProgressState).toEqual(originalAdvisorProgress);
      expect(state.relationshipState).toEqual(originalRelationshipState);
      expect(state.selectedAdvisorName).toBeNull();

      const confirmChoice = refreshedEvent?.choices.find((choice) => choice.label === "回复导师");
      if (!refreshedEvent || !confirmChoice || !refreshedCandidate) {
        throw new Error("refreshed advisor confirmation missing");
      }
      state = dispatchAction(state, "resolve-event", {
        eventId: refreshedEvent.id,
        eventChoiceId: confirmChoice.id,
      });

      expect(state.selectedAdvisorName).toBe(refreshedCandidate.advisorName);
      expect(state.eventQueue[0]?.stage).toBe("result");
      expect(state.eventQueue[0]?.choices.map((choice) => choice.label)).toEqual(["准备报到"]);
    } finally {
      random.mockRestore();
    }
  });

  it("uses the third act for formal admission", () => {
    const advisorInfo = getAdvisorInfoEvent(0);
    const resolution = getAdvisorConfirmationResolution(advisorInfo);

    expect(resolution).toBeDefined();
    if (!resolution) return;

    const resolved = resolveAdvisorConfirmation(
      { ...createInitialState(), phase: "playing" },
      resolution,
    );
    const admissionEvent = resolved.enqueueEvents?.[0];

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
    expect(resolved.outcome).toContain("加入李旭旭讲师的课题组");
    expect(resolved.outcome).toContain("进了实验室群");
    expect(resolved.outcome).not.toContain("分配");
    expect(admissionEvent).toMatchObject({
      id: "before-grad-school-admission",
      title: "读研之始",
      chainId: "before-grad-school",
      stage: "result",
      preview: "收到录取通知书",
    });
    expect(admissionEvent?.description).toContain("录取通知书");
    expect(admissionEvent?.description).toContain("晒到朋友圈");
    expect(admissionEvent?.description).not.toContain("暑假");
    expect(admissionEvent?.description).not.toContain("第一次组会");
    expect(admissionEvent?.description).not.toContain("第一篇投稿");
    expect(admissionEvent?.choices[0]?.label).toBe("准备报到");
  });

});
