import { describe, expect, it } from "vitest";

import {
  collectFixedEventsForMonth,
  collectIllnessEventForMonth,
  collectRandomEventsForMonth,
  enqueueFixedEventsForMonth,
  enqueueMonthlyEventsForMonth,
  type RandomRollProvider,
} from "../src/core/v2-event-scheduler";
import { createInitialState } from "../src/core/v2-engine";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createScholarshipEvent } from "../src/core/v2-fixed-events-scholarship";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createTeachersDayEvent, resolveTeachersDayFixedEvent } from "../src/core/v2-fixed-events-teachers-day";
import { createCareerEventForType } from "../src/core/v2-monthly-career-events";
import { collectThesisEventForMonth } from "../src/core/v2-monthly-thesis-events";
import { createFundingCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import type { EventChoice, PendingEvent } from "../src/core/v2-types";

function fromRolls(rolls: number[]): RandomRollProvider {
  let index = 0;
  return () => {
    const roll = rolls[index] ?? 0;
    index += 1;
    return roll;
  };
}

function getDecisionChoices(event: PendingEvent | undefined): EventChoice[] {
  expect(event?.stage).toBe("act1");
  const decisionEvent = event?.choices[0]?.effects.enqueueEvents?.[0];
  expect(decisionEvent?.stage).toBe("act2");
  for (const choice of decisionEvent?.choices ?? []) {
    const enqueuedEvents = choice.effects.enqueueEvents ?? [];
    expect(enqueuedEvents[enqueuedEvents.length - 1]?.stage).toBe("result");
  }
  return decisionEvent?.choices ?? [];
}

describe("v2 event scheduler", () => {
  it("randomizes one unified Teacher's Day gift without the removed stamp choice", () => {
    const state = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...createInitialState().player, favor: 1, money: 10 },
    };
    const cases = [
      { roll: 0, giftId: "tea" as const, label: "送茶叶", name: "茶叶" },
      { roll: 0.4, giftId: "mooncake" as const, label: "送月饼", name: "月饼" },
      { roll: 0.99, giftId: "flower" as const, label: "送鲜花", name: "鲜花" },
    ];

    for (const item of cases) {
      const event = createTeachersDayEvent(state, () => item.roll);
      const choiceEvent = event.choices[0]?.effects.enqueueEvents?.[0];
      expect(event.description).toContain("你和导师关系一般（当前好感等级：陌生），也开始琢磨该怎么表示一下。");
      expect(event.description).not.toContain("分寸感");
      expect(choiceEvent?.description).toContain("“发个祝福就好，简单自然也挺好。”");
      expect(choiceEvent?.description).not.toContain("万一导师正好有事找我帮忙");
      expect(choiceEvent?.description).not.toContain("不会显得空手");
      expect(choiceEvent?.description).not.toContain("不会显得敷衍");
      expect(choiceEvent?.choices).toHaveLength(3);
      expect(choiceEvent?.choices.map((choice) => choice.label)).toEqual(["发祝福", item.label, "送邮票"]);
      const giftResolution = choiceEvent?.choices[1]?.effects.fixedEventResolution;
      expect(giftResolution).toEqual({ kind: "teachers-day-gift", teachersDayGift: item.giftId });

      if (!giftResolution) throw new Error("教师节礼物结算缺失");
      const result = resolveTeachersDayFixedEvent(state, giftResolution, () => 0.99);
      expect(result.nextState.player.money).toBe(9);
      expect(result.nextState.player.favor).toBe(2);
      expect(result.outcome).toContain(`送了${item.name}`);
      expect(result.enqueueEvents?.[0]?.description).toContain(item.name);
    }
  });

  it("keeps one-time stamp gifting without the removed consecutive counter", () => {
    const state = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...createInitialState().player, favor: 1, money: 10 },
    };
    const choiceEvent = createTeachersDayEvent(state, () => 0).choices[0]?.effects.enqueueEvents?.[0];
    const stampResolution = choiceEvent?.choices[2]?.effects.fixedEventResolution;
    expect(stampResolution).toEqual({ kind: "teachers-day-stamp" });
    if (!stampResolution) throw new Error("教师节送邮票结算缺失");
    const result = resolveTeachersDayFixedEvent(state, stampResolution, () => 0.99);
    expect(result.nextState.player.money).toBe(7);
    expect(result.nextState.player.favor).toBe(3);
    expect(result.outcome).toContain("送了邮票");
    expect(result.outcome).not.toContain("连续");
  });

  it("resolves each point of the stamp's favor +2 independently", () => {
    const base = createInitialState();
    const state = {
      ...base,
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...base.player, favor: 12, money: 10 },
    };
    const resolution = { kind: "teachers-day-stamp" as const };
    const resolveWith = (rolls: number[]) => {
      let index = 0;
      return resolveTeachersDayFixedEvent(state, resolution, () => rolls[index++] ?? 0);
    };

    const gains = [
      resolveWith([0, 0]),
      resolveWith([0, 0.99]),
      resolveWith([0.99, 0.99]),
    ].map((result) => result.nextState.player.favor - state.player.favor);

    expect(gains).toEqual([0, 1, 2]);
  });

  it("omits the settlement block when a Teacher's Day result changes no values", () => {
    const lowFavorState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...createInitialState().player, favor: 1 },
    };
    const highFavorState = {
      ...lowFavorState,
      player: { ...lowFavorState.player, favor: 6 },
    };

    const lowFavorResult = resolveTeachersDayFixedEvent(
      lowFavorState,
      { kind: "teachers-day-message" },
      () => 0.99,
    );
    const highFavorResult = resolveTeachersDayFixedEvent(
      highFavorState,
      { kind: "teachers-day-message" },
      () => 0.99,
    );

    expect(lowFavorResult.enqueueEvents?.[0]?.description).not.toContain("机制结算");
    expect(lowFavorResult.enqueueEvents?.[0]?.description).not.toContain("无直接数值变化");
    expect(highFavorResult.enqueueEvents?.[0]?.description).not.toContain("机制结算");
    expect(highFavorResult.enqueueEvents?.[0]?.description).not.toContain("无直接数值变化");
  });

  it("adds favor when the Teacher's Day message leads to an errand", () => {
    const state = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...createInitialState().player, san: 20, favor: 1 },
    };

    const result = resolveTeachersDayFixedEvent(
      state,
      { kind: "teachers-day-message" },
      () => 0,
    );

    expect(result.nextState.player.san).toBe(17);
    expect(result.nextState.player.favor).toBe(2);
    expect(result.outcome).toContain("SAN -3，导师好感+1");
    expect(result.enqueueEvents?.[0]?.description).toContain("SAN -3\n导师好感+1");
    expect(result.enqueueEvents?.[0]?.completionLog).toContain("SAN -3，导师好感+1");
  });

  it("collects fixed events by month", () => {
    const initial = createInitialState();

    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 1, month: 1, totalMonths: 1 }).map((event) => event.chainId)).toEqual(["teachers-day"]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 2, month: 2, totalMonths: 14 }).map((event) => event.chainId)).toEqual(["scholarship"]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 3, month: 3, totalMonths: 27 })).toEqual([]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, degree: "phd" as const, phdStartYear: 3, year: 3, month: 1, totalMonths: 25 }).map((event) => event.chainId)).toEqual(["teachers-day", "mentor-assign"]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, degree: "phd" as const, phdStartYear: 3, year: 4, month: 1, totalMonths: 37 }).map((event) => event.chainId)).toEqual(["teachers-day"]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 1, month: 11, totalMonths: 11 }).map((event) => event.chainId)).toEqual(["summer-vacation", "year-summary"]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 1, month: 4, totalMonths: 4 })).toEqual([]);
  });

  it("enqueues fixed events without duplication", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 1,
      totalMonths: 13,
    };

    const firstRun = enqueueFixedEventsForMonth(baseState);
    expect(firstRun.queuedEvents.map((event) => event.chainId)).toEqual(["teachers-day"]);
    expect(firstRun.nextState.eventQueue).toHaveLength(1);

    const secondRun = enqueueFixedEventsForMonth(firstRun.nextState);
    expect(secondRun.queuedEvents).toHaveLength(0);
    expect(secondRun.nextState.eventQueue).toHaveLength(1);
  });

  it("collects disease independently from the ordinary random pool", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      player: { ...initial.player, san: 0, money: 1 },
      illnessProbability: 100,
    };

    const illnessCases = [
      [0, "肚子虚弱", "蒙脱石散"],
      [0.34, "流感来袭", "磷酸奥司他韦"],
      [0.99, "高烧不退", "布洛芬"],
    ] as const;
    for (const [typeRoll, title, medicineName] of illnessCases) {
      const illness = collectIllnessEventForMonth(baseState, fromRolls([0, typeRoll]));
      expect(illness).toHaveLength(1);
      expect(illness[0]?.title).toBe(title);
      expect(illness[0]?.stage).toBe("act1");
      expect(illness[0]?.choices[0]?.label).toBe("继续");
      const decision = illness[0]?.choices[0]?.effects.enqueueEvents?.[0];
      const hardChoice = decision?.choices.find((choice) => choice.label === "硬撑工作");
      const hardResult = hardChoice?.effects.enqueueEvents?.at(-1);
      const medicineChoice = decision?.choices.find((choice) => choice.label === "先买药");
      const medicineResult = medicineChoice?.effects.enqueueEvents?.at(-1);
      expect(decision?.description).toContain(medicineName);
      expect(hardChoice?.outcome).toMatch(/^SAN 上限 -[234]｜生病概率 ×0\.5$/u);
      expect(hardChoice?.outcome).not.toContain("大病一场");
      expect(hardResult?.description.split("机制结算")[0]).toContain("连休了几天");
      expect(hardResult?.description.split("机制结算")[1]).not.toContain("连休");
      expect(medicineResult?.description).toContain(medicineName);
    }
    const ordinary = collectRandomEventsForMonth({ ...baseState, availableRandomEvents: [3] }, fromRolls([0.7, 0]));
    expect(ordinary.events).toHaveLength(0);
  });

  it("does not rebuild a removed disease event from a queued ordinary draw", () => {
    const initial = createInitialState();
    const scheduled = collectRandomEventsForMonth({
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      player: { ...initial.player, san: 0, money: 1 },
      availableRandomEvents: [3],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    }, fromRolls([0.7, 0, 0.1, 0.2, 0.3]));
    expect(scheduled.events).toHaveLength(0);
  });

  it("builds the real event 9 choices instead of a placeholder skeleton", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      availableRandomEvents: [9],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("不断学习");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["基础知识", "最新技术", "代码知识", "深奥理论"]);
  });

  it("builds the real event 1 choices with junior and rejection hooks", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, social: 0 },
      availableRandomEvents: [1],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("毕设辅导");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["委婉拒绝", "亲自指导", "转给师弟师妹"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.favor).toBe(-1);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBe(-4);
    expect(getDecisionChoices(result.events[0])[1]?.effects.research).toBeUndefined();
    const selfGuidanceChoice = getDecisionChoices(result.events[0])[1];
    const newJunior = selfGuidanceChoice?.effects.fellowAdditions?.[0];
    expect(newJunior).toMatchObject({ type: "junior" });
    expect(newJunior?.name).toBeTruthy();
    const selfGuidanceResult = selfGuidanceChoice?.effects.enqueueEvents?.at(-1);
    expect(selfGuidanceResult?.description).toContain(newJunior?.name ?? "");
    expect(selfGuidanceResult?.description).toContain(newJunior?.gender === "male" ? "师弟" : "师妹");
    expect(selfGuidanceResult?.description).toContain("谢谢师兄");

    const femalePlayerState = { ...baseState, selectedRoleId: "rich" as const, totalRandomEventCount: 1 };
    const femalePlayerResult = collectRandomEventsForMonth(femalePlayerState, fromRolls([0.7, 0, 0]));
    const femalePlayerSelfChoice = getDecisionChoices(femalePlayerResult.events[0])[1];
    const femalePlayerJunior = femalePlayerSelfChoice?.effects.fellowAdditions?.[0];
    const femalePlayerCopy = femalePlayerSelfChoice?.effects.enqueueEvents?.at(-1)?.description ?? "";
    expect(femalePlayerJunior?.name).toBeTruthy();
    expect(femalePlayerCopy).toContain(femalePlayerJunior?.name ?? "");
    expect(femalePlayerCopy).toContain(femalePlayerJunior?.gender === "male" ? "师弟" : "师妹");
    expect(femalePlayerCopy).toContain("谢谢师姐");
    expect(femalePlayerCopy).not.toContain("小红");
    expect(selfGuidanceResult?.description).toContain(newJunior?.gender === "male" ? "师弟" : "师妹");
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(-2);
  });

  it("builds the real event 2 choices with independent review effects and junior hooks", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, social: 5 },
      availableRandomEvents: [2],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("帮忙审稿");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["婉言推辞", "认真审稿", "交给师弟师妹"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.favor).toBe(-1);
    expect(getDecisionChoices(result.events[0])[1]?.effects).toMatchObject({
      readPaperActions: 2,
    });
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[1]?.outcome).toContain("额外看论文 +2 次");
    expect(getDecisionChoices(result.events[0])[1]?.outcome).toContain("阅读累计 +2");
    expect(getDecisionChoices(result.events[0])[1]?.outcome).toContain("下次想 idea +2分");
    expect(getDecisionChoices(result.events[0])[1]?.outcome).not.toContain("审稿灵感");
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(-2);
  });

  it("uses the shared reading cost without research-chore discounts", () => {
    const initial = createInitialState();

    for (const [index, research] of [1, 6, 12, 18].entries()) {
      const state = {
        ...initial,
        phase: "playing" as const,
        year: 2,
        month: 1,
        totalMonths: 13,
        player: { ...initial.player, research },
        availableRandomEvents: [2],
        usedRandomEvents: [],
        totalRandomEventCount: 0,
      };
      const result = collectRandomEventsForMonth(state, fromRolls([0.7, 0, 0, 0]));
      const choice = getDecisionChoices(result.events[0])[1];
      expect(choice?.effects.readPaperActions, `research index ${index}`).toBe(2);
      expect(choice?.effects.san, `research index ${index}`).toBeUndefined();
      expect(choice?.outcome).toContain("SAN -4");
    }
  });

  it("describes event 2 as a formula-heavy deep-learning paper with weak explanations", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      availableRandomEvents: [2],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const result = collectRandomEventsForMonth(state, fromRolls([0.7, 0, 0]));
    const intro = result.events[0]?.description ?? "";
    const decision = result.events[0]?.choices[0]?.effects.enqueueEvents?.[0]?.description ?? "";

    expect(`${intro}\n${decision}`).toContain("深度学习论文");
    expect(intro).toContain("理论公式很多");
    expect(intro).toContain("解释比较牵强");
    expect(decision).not.toContain("篇幅长、信息密");
    expect(intro).not.toContain("认真审能学到些东西");
    expect(decision).toContain("认真审，得把公式、实验和结论逐项过一遍");
  });

  it("separates familiar and unfamiliar junior delegation in mentoring", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, social: 0 },
      availableRandomEvents: [1],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const unfamiliar = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    const familiar = collectRandomEventsForMonth({
      ...baseState,
      relationshipState: { ...baseState.relationshipState, juniorCount: 1 },
      fellowProgressState: [createCustomFellowProgressProfile({
        type: "junior",
        gender: "male",
        startTotalMonths: baseState.totalMonths,
        research: 3,
        affinity: 3,
      })],
    }, fromRolls([0.7, 0, 0]));

    const unfamiliarChoice = getDecisionChoices(unfamiliar.events[0])[2];
    const familiarChoice = getDecisionChoices(familiar.events[0])[2];
    const unfamiliarDecision = unfamiliar.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const familiarDecision = familiar.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    expect(unfamiliarChoice?.effects.social).toBe(-2);
    expect(familiarChoice?.effects.social).toBe(-1);
    expect(unfamiliarDecision?.description).not.toMatch(/社交.*\d/);
    expect(familiarDecision?.description).not.toMatch(/社交.*\d/);
    expect(unfamiliarChoice?.effects.enqueueEvents?.[0]?.description).toContain("没有熟悉的师弟师妹");
    expect(familiarChoice?.effects.enqueueEvents?.[0]?.description).toContain("师弟");
  });

  it("uses familiar junior status rather than social level for peer-review delegation copy", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, social: 0 },
      availableRandomEvents: [2],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const unfamiliar = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    const familiar = collectRandomEventsForMonth({
      ...baseState,
      relationshipState: { ...baseState.relationshipState, juniorCount: 1 },
      fellowProgressState: [createCustomFellowProgressProfile({
        type: "junior",
        gender: "female",
        startTotalMonths: baseState.totalMonths,
        research: 3,
        affinity: 3,
      })],
    }, fromRolls([0.7, 0, 0]));

    const unfamiliarChoice = getDecisionChoices(unfamiliar.events[0])[2];
    const familiarChoice = getDecisionChoices(familiar.events[0])[2];
    const unfamiliarDecision = unfamiliar.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const familiarDecision = familiar.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    expect(unfamiliarChoice?.effects.social).toBe(-2);
    expect(familiarChoice?.effects.social).toBe(-1);
    expect(unfamiliarDecision?.description).not.toMatch(/社交.*\d/);
    expect(familiarDecision?.description).not.toMatch(/社交.*\d/);
    expect(unfamiliarChoice?.effects.enqueueEvents?.[0]?.description).toContain("没有熟悉的师弟师妹");
    expect(familiarChoice?.effects.enqueueEvents?.[0]?.description).toContain("师妹");
  });

  it("applies seasonal SAN modifiers to mentoring and review choices", () => {
    const initial = createInitialState();
    const springState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      availableRandomEvents: [1],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const mentoringResult = collectRandomEventsForMonth(springState, fromRolls([0.7, 0, 0]));
    expect(getDecisionChoices(mentoringResult.events[0])[1]?.effects.san).toBe(-3);

    const summerState = {
      ...springState,
      month: 10,
      totalMonths: 22,
      availableRandomEvents: [2],
    };
    const reviewResult = collectRandomEventsForMonth(summerState, fromRolls([0.7, 0, 0]));
    expect(getDecisionChoices(reviewResult.events[0])[1]?.effects).toMatchObject({ readPaperActions: 2 });
    expect(getDecisionChoices(reviewResult.events[0])[1]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(reviewResult.events[0])[1]?.outcome).toContain("SAN -6");
  });

  it("builds the real event 4 choices with project king and learn-to-say-no hooks", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      availableRandomEvents: [4],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师项目");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["接横向项目", "接纵向项目", "申请调整", "让师弟师妹分担"]);
    expect(getDecisionChoices(result.events[0])[1]?.effects.research).toBe(1);
    expect(getDecisionChoices(result.events[0])[2]?.effects.favor).toBe(-2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(-2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.social).toBe(-2);
    expect(result.events[0]?.choices[0]?.effects.enqueueEvents?.[0]?.description).not.toMatch(/社交.*\d/);
    const adjustmentResult = getDecisionChoices(result.events[0])[2]?.effects.enqueueEvents?.[0];
    expect(adjustmentResult?.description).toContain("导师皱了下眉");
    expect(adjustmentResult?.description).not.toContain("已经有些熟悉");

    const familiarResult = collectRandomEventsForMonth({
      ...baseState,
      relationshipState: { ...baseState.relationshipState, juniorCount: 1 },
      fellowProgressState: [createCustomFellowProgressProfile({
        type: "junior",
        gender: "male",
        startTotalMonths: baseState.totalMonths,
        research: 3,
        affinity: 3,
      })],
    }, fromRolls([0.7, 0]));
    const familiarShare = getDecisionChoices(familiarResult.events[0])[3];
    expect(familiarShare?.effects.social).toBe(-1);
    expect(familiarResult.events[0]?.choices[0]?.effects.enqueueEvents?.[0]?.description).not.toMatch(/社交.*\d/);
    expect(familiarShare?.effects.enqueueEvents?.[0]?.description).toContain("师弟");
  });

  it("applies spring season SAN relief to advisor project branches", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      availableRandomEvents: [4],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(-7);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBe(-5);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(-1);
  });

  it("builds the real event 5 choices with research and favor thresholds", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, research: 6, favor: 6 },
      availableRandomEvents: [5],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0, 0, 0.99, 0.99, 0.99, 0.99]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师约谈");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["认真汇报", "请教推进方法", "提出远程实习"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(4);
    expect(getDecisionChoices(result.events[0])[1]?.effects.research).toBe(1);
    expect(getDecisionChoices(result.events[0])[2]?.effects.money).toBe(3);
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-4);
    expect(getDecisionChoices(result.events[0])[2]?.effects.temporaryActionEffectUpdates?.experiment?.bonus).toBe(4);
  });

  it("builds the real event 6 choices with research threshold and meeting attendance rolls", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, research: 5 },
      availableRandomEvents: [6],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("组会汇报");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["认真准备", "讲系列论文", "随便水一下"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.favor).toBe(1);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBe(-4);
    expect(getDecisionChoices(result.events[0])[1]?.effects.favor).toBe(1);
    expect(getDecisionChoices(result.events[0])[2]?.effects.favor).toBe(-1);
  });

  it("builds the real event 7 choices with sports, poker, ktv and dinner effects", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, san: 12, money: 8 },
      eventCounters: {
        ...initial.eventCounters,
      },
      availableRandomEvents: [7],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0.1, 0.1, 0.1, 0.9]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("组内团建");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["打羽毛球", "打德州扑克", "KTV 唱歌", "聚餐"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[0]?.effects.social).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[0]?.effects.counterDeltas).toEqual({ badmintonCount: 1 });
    expect(getDecisionChoices(result.events[0])[0]?.effects.eventSupportUpdates).toEqual({ hasStrongBodyTalent: true });
    expect(getDecisionChoices(result.events[0])[1]?.effects.money).toBe(5);
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(1);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(5);
    expect(getDecisionChoices(result.events[0])[3]?.effects.favor).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.money).toBe(-2);
  });

  it("builds the real event 8 choices with gpu, salary and renovate routes", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, research: 12, favor: 12 },
      availableRandomEvents: [8],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0, 0, 0, 0.9]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师经费");
    const choices = getDecisionChoices(result.events[0]);
    expect(choices.map((choice) => choice.label)).toEqual(["买显卡", "发劳务费", "装修工位", "报销 AI 费用"]);
    expect(choices[0]?.effects.shopEntitlementDeltas).toEqual({ gpuTransaction: 1 });
    expect(choices[1]?.effects.money).toBe(7);
    expect(choices[2]?.effects.shopEntitlementDeltas).toEqual({
      keyboardPurchase: 1,
      monitorPurchase: 1,
      chairPurchase: 1,
      chairUpgrade: 1,
      coffeeMachinePurchase: 1,
      coffeeMachineUpgrade: 1,
    });
    const funded = applyChoiceEffectsToState(baseState, choices[2]!).nextState;
    expect(funded.shopState.entitlements).toEqual({
      gpuTransaction: 0,
      keyboardPurchase: 1,
      monitorPurchase: 1,
      chairPurchase: 1,
      chairUpgrade: 1,
      coffeeMachinePurchase: 1,
      coffeeMachineUpgrade: 1,
    });
    const fundedTwice = applyChoiceEffectsToState(funded, choices[2]!).nextState;
    expect(fundedTwice.shopState.entitlements.keyboardPurchase).toBe(2);
    expect(fundedTwice.shopState.entitlements.chairUpgrade).toBe(2);
    expect(fundedTwice.shopState.entitlements.coffeeMachineUpgrade).toBe(2);
    expect(choices[3]?.outcome).toContain("AI");
    expect(choices[3]?.effects.addBuffs).toBeUndefined();
    expect(choices[3]?.effects.eventSupportUpdates).toEqual({ aiCostsCoveredUntilTotalMonths: 17 });
    const aiResult = choices[3]?.effects.enqueueEvents?.at(-1);
    expect(aiResult?.title).toContain("报销 AI 费用");
    expect(aiResult?.description).toContain("你提议把一部分经费用来报销本月的 AI 订阅");
    expect(aiResult?.description).toContain("所有 AI 模型都显示为 0 金币");
  });

  it("maps all four advisor-favor tiers to the new funding salary values", () => {
    const initial = createInitialState();
    for (const [favor, expectedMoney] of [[0, 3], [6, 5], [12, 7], [18, 9]] as const) {
      const event = createFundingCampusRandomEvent({
        ...initial,
        player: { ...initial.player, favor },
      }, () => 0);
      expect(getDecisionChoices(event)[1]?.effects.money).toBe(expectedMoney);
    }
  });

  it("builds the real event 10 choices with publication and one-shot effects", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, social: 5 },
      availableRandomEvents: [10],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u540c\u95e8\u5408\u4f5c");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["\u5b66\u672f\u4ea4\u6d41", "\u4e92\u6302\u8bba\u6587", "\u5a49\u62d2\u5408\u4f5c", "\u5168\u9762\u5408\u4f5c"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.temporaryActionEffectUpdates?.idea).toEqual({ bonus: 4 });
    expect(getDecisionChoices(result.events[0])[1]?.effects.grantedPublication?.nonFirstAuthor).toBe(true);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.temporaryActionEffectUpdates?.idea?.extraActions).toBe(1);
    expect(getDecisionChoices(result.events[0])[3]?.effects.temporaryActionEffectUpdates?.writing?.extraActions).toBe(1);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(-2);

    const rejectResult = getDecisionChoices(result.events[0])[2]?.effects.enqueueEvents?.at(-1);
    expect(rejectResult?.completionLog).toBe("婉拒合作：没有后续波澜（50%）｜无事发生。");
  });

  it("builds the real event 11 choices with one-shot action effects", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      availableRandomEvents: [11],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u5e08\u5144\u6307\u5bfc");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["\u5148\u89c2\u671b", "\u6d45\u6d45\u5408\u4f5c", "\u6df1\u5165\u5408\u4f5c", "\u62dc\u5165\u95e8\u4e0b"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(3);
    expect(getDecisionChoices(result.events[0])[1]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(6);
    expect(getDecisionChoices(result.events[0])[2]?.effects.research).toBe(1);
    expect(getDecisionChoices(result.events[0])[3]?.effects.writingBonus).toBe(4);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBeUndefined();
  });

  it("builds the real event 12 choices with favor-dependent outcomes", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, favor: 5 },
      availableRandomEvents: [12],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("署名风波");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["向导师诉苦", "转移到别人", "据理力争", "极端施压"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(-5);
    expect(getDecisionChoices(result.events[0])[1]?.effects.social).toBe(-1);
    expect(getDecisionChoices(result.events[0])[1]?.effects.score).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[1]?.effects.grantedPublication).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.money).toBe(2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.favor).toBe(-2);

    const highFavorState = {
      ...baseState,
      player: { ...baseState.player, favor: 6 },
    };
    const highFavorResult = collectRandomEventsForMonth(highFavorState, fromRolls([0.7, 0]));
    const highFavorChoices = getDecisionChoices(highFavorResult.events[0]);
    expect(highFavorChoices[0]?.outcome).toBe("导师好感 ≥ 6｜无变化。");
    expect(highFavorChoices[2]?.outcome).toBe("导师好感 ≥ 6｜无变化。");
    const complainResult = highFavorChoices[0]?.effects.enqueueEvents?.at(-1);
    expect(complainResult?.description.split("机制结算")[0]).toContain("一作按原来的安排");
    expect(complainResult?.description.split("机制结算")[1]).not.toContain("安抚");
  });

  it("applies summer season SAN penalty to advisor talk, meeting and authorship branches", () => {
    const initial = createInitialState();

    const talkState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 10,
      totalMonths: 22,
      player: { ...initial.player, research: 6, favor: 6 },
      availableRandomEvents: [5],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const talkResult = collectRandomEventsForMonth(talkState, fromRolls([0.7, 0]));
    expect(getDecisionChoices(talkResult.events[0])[2]?.effects.san).toBe(-5);

    const meetingState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 10,
      totalMonths: 22,
      player: { ...initial.player, research: 5 },
      availableRandomEvents: [6],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const meetingResult = collectRandomEventsForMonth(meetingState, fromRolls([0.7, 0, 0, 0]));
    expect(getDecisionChoices(meetingResult.events[0])[1]?.effects.san).toBe(-5);

    const authorshipState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 10,
      totalMonths: 22,
      player: { ...initial.player, favor: 5 },
      availableRandomEvents: [12],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const authorshipResult = collectRandomEventsForMonth(authorshipState, fromRolls([0.7, 0]));
    expect(getDecisionChoices(authorshipResult.events[0])[2]?.effects.san).toBe(-3);
  });

  it("applies seasonal SAN changes to every event operation with a direct SAN cost", () => {
    const initial = createInitialState();
    const spring = {
      ...initial,
      phase: "playing" as const,
      year: 3,
      month: 8,
      totalMonths: 32,
    };

    expect(createScholarshipEvent(spring, () => 0).choices[0]?.effects.san).toBe(-1);
    expect(getDecisionChoices(createCareerEventForType(spring, "academic"))[1]?.effects.san).toBe(-2);
    expect(getDecisionChoices(collectThesisEventForMonth(spring).event ?? undefined)[1]?.effects.san).toBe(-1);
  });

  it("builds the real event 13 choices with persistent and temporary experiment effects", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      availableRandomEvents: [13],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0.8, 0.8]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("显卡故障");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["催导师修", "举报挖矿", "自己重装", "淘宝找人"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.experimentBonus).toBe(-2);
    expect(getDecisionChoices(result.events[0])[1]?.effects.social).toBe(-2);
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-3);
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(-1);
    expect(getDecisionChoices(result.events[0])[2]?.effects.temporaryActionEffectUpdates?.experiment?.multiplier).toBe(0.25);
    expect(getDecisionChoices(result.events[0])[3]?.effects.money).toBe(-4);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(-2);

    const serverDecision = result.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const serverCopy = [
      result.events[0]?.description,
      serverDecision?.description,
      ...(serverDecision?.choices.flatMap((choice) => choice.effects.enqueueEvents?.map((event) => event.description) ?? []) ?? []),
    ].join("\n");
    expect(serverCopy).toContain("显卡");
    expect(serverCopy).not.toMatch(/数据丢失|备份|文件受损|进度受损|目录/);
  });

  it("builds the real event 14 choices with mentorship hooks", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      availableRandomEvents: [14],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u6307\u5bfc\u5e08\u5f1f");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["精力有限，委婉拒绝", "短期合作，分享idea", "长期合作，共同成长"]);
    expect(getDecisionChoices(result.events[0])[1]?.effects.social).toBe(1);
    expect(getDecisionChoices(result.events[0])[1]?.effects.fellowAdditions?.[0]).toMatchObject({
      type: "junior",
      gender: "male",
    });
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBe(-5);
    expect(getDecisionChoices(result.events[0])[2]?.effects.mentorshipStacks).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.addBuffs?.[0]?.monthlyStats).toEqual({ san: -2 });
    expect(getDecisionChoices(result.events[0])[2]?.effects.addBuffs?.[0]?.scheduledPublication).toEqual({
      intervalMonths: 12,
      nonFirstAuthor: true,
      targetWeights: { A: 0.2, B: 0.3, C: 0.5 },
    });
    expect(getDecisionChoices(result.events[0])[2]?.effects.fellowAdditions?.[0]).toMatchObject({
      type: "junior",
      gender: "male",
    });
  });

  it("builds the real event 15 choices with seasonal SAN modifiers", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      availableRandomEvents: [15],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
      eventSupport: { hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false },
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("游戏放松");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["玩泰拉瑞亚", "玩魔塔50层", "玩研究生模拟器", "打王者荣耀"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(-3);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBe(-5);
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(-4);
  });

  it("builds the real event 16 choices when there is in-progress draft work", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      papers: [
        {
          id: "draft-paper",
          title: "Draft Paper",
          topicId: "test",
          topicLabel: "测试方向",
          heatMultiplier: 1,
          prepublicationDecayRate: 0.1,
          idea: 4,
          experiment: 3,
          writing: 2,
          status: "draft" as const,
          target: null,
          reviewMonthsLeft: 0,
          submittedIdea: null,
          submittedExperiment: null,
          submittedWriting: null,
          publication: null,
        },
      ],
      availableRandomEvents: [16],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("数据丢失");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["熬夜补数据", "从头再来", "花钱恢复", "伪造数据"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(-6);
    expect(getDecisionChoices(result.events[0])[1]?.effects.clearDraftProgress).toBe(true);
    expect(getDecisionChoices(result.events[0])[2]?.effects.money).toBe(-4);
    expect(getDecisionChoices(result.events[0])[3]?.effects.draftCitationDebuffMultiplier).toBe(0.5);
    expect(getDecisionChoices(result.events[0])[3]?.effects).not.toHaveProperty("otherCitationPenaltyMultiplier");

    const dataLossDecision = result.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const dataLossCopy = [
      result.events[0]?.description,
      dataLossDecision?.description,
      ...(dataLossDecision?.choices.flatMap((choice) => choice.effects.enqueueEvents?.map((event) => event.description) ?? []) ?? []),
    ].join("\n");
    expect(dataLossCopy).toContain("**自己的电脑**");
    expect(dataLossCopy).not.toContain("服务器");
  });

  it("applies seasonal SAN modifiers to data-loss recovery", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      papers: [
        {
          id: "draft-paper",
          title: "Draft Paper",
          topicId: "test",
          topicLabel: "测试方向",
          heatMultiplier: 1,
          prepublicationDecayRate: 0.1,
          idea: 1,
          experiment: 0,
          writing: 0,
          status: "draft" as const,
          target: null,
          reviewMonthsLeft: 0,
          submittedIdea: null,
          submittedExperiment: null,
          submittedWriting: null,
          publication: null,
        },
      ],
      availableRandomEvents: [16],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(-5);
  });

  it("skips event 16 when there is no recoverable draft progress but still consumes the draw", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      papers: [
        {
          id: "empty-draft",
          title: "Empty Draft",
          topicId: "test",
          topicLabel: "测试方向",
          heatMultiplier: 1,
          prepublicationDecayRate: 0.1,
          idea: 0,
          experiment: 0,
          writing: 0,
          status: "draft" as const,
          target: null,
          reviewMonthsLeft: 0,
          submittedIdea: null,
          submittedExperiment: null,
          submittedWriting: null,
          publication: null,
        },
      ],
      availableRandomEvents: [16],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toEqual([]);
    expect(result.nextState.availableRandomEvents).toEqual([16]);
    expect(result.nextState.usedRandomEvents).toEqual([]);
    expect(result.nextState.totalRandomEventCount).toBe(0);
  });

  it("does not queue a disease event from the ordinary random pool", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      player: { ...initial.player, san: 0 },
      availableRandomEvents: [3],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(0);
    expect(result.nextState.availableRandomEvents).toEqual([3]);
    expect(result.nextState.usedRandomEvents).toEqual([]);
    expect(result.nextState.totalRandomEventCount).toBe(0);
  });

  it("enqueues random events after fixed events in the monthly pipeline", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      illnessProbability: 0,
      availableRandomEvents: [1],
      usedRandomEvents: [],
    };

    const result = enqueueMonthlyEventsForMonth(baseState, fromRolls([0, 0.7, 0]));
    expect(result.queuedEvents.map((event) => event.source)).toEqual(["fixed", "random"]);
    expect(result.queuedEvents[0]?.chainId).toBe("teachers-day");
    expect(result.queuedEvents[1]?.title).toBe("毕设辅导");
    expect(result.nextState.eventQueue).toHaveLength(2);
  });

  it("does not enqueue fixed events while a blocking queue event exists", () => {
    const playingState = {
      ...createInitialState(),
      phase: "playing" as const,
      month: 6,
      totalMonths: 6,
    };

    const blockedByQueue = enqueueFixedEventsForMonth({
      ...playingState,
      eventQueue: [
        {
          id: "existing",
          title: "existing event",
          description: "existing blocking event",
          source: "fixed" as const,
          blocking: true,
          deadlineMonths: 0,
          chainId: "existing",
          stage: "act1" as const,
          queueOrder: 1,
          choices: [{ id: "ok", label: "continue", outcome: "done", effects: {} }],
        },
      ],
    });
    expect(blockedByQueue.queuedEvents).toHaveLength(0);

  });

  it("still schedules the new month's events when an older deferred event becomes due", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 2,
      totalMonths: 14,
      eventQueue: [{
        id: "deferred-now-due",
        title: "已到期事件",
        description: "上个月留下的事件",
        source: "random" as const,
        blocking: true,
        deadlineMonths: 0,
        chainId: "deferred-now-due",
        stage: "act1" as const,
        queueOrder: 1,
        choices: [{ id: "continue", label: "继续", outcome: "继续", effects: {} }],
      }],
      illnessProbability: 0,
    };

    const result = enqueueMonthlyEventsForMonth(state, fromRolls([0, 0]));
    expect(result.queuedEvents.some((event) => event.chainId === "scholarship")).toBe(true);
    expect(result.nextState.eventQueue.some((event) => event.chainId === "deferred-now-due")).toBe(true);
  });
});
