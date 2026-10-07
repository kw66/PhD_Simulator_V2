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
import { createScholarshipEvent, resolveScholarshipApplication } from "../src/core/v2-fixed-events-scholarship";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createTeachersDayEvent, resolveTeachersDayFixedEvent } from "../src/core/v2-fixed-events-teachers-day";
import { createCareerEventForType } from "../src/core/v2-monthly-career-events";
import { collectThesisEventForMonth } from "../src/core/v2-monthly-thesis-events";
import { createFundingCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { createAdvisorTalkRandomEvent } from "../src/core/v2-random-events-lab-advisor-talk";
import { createAdvisorMeetingRandomEvent } from "../src/core/v2-random-events-lab-advisor-meeting";
import { createAdvisorAuthorshipRandomEvent } from "../src/core/v2-random-events-lab-advisor-authorship";
import { ADVISOR_GRANTS } from "../src/core/v2-advisor-progress";
import { activatePendingRandomEvents } from "../src/core/v2-paper-competition-waiting";
import { createDraftPaper } from "../src/core/v2-paper-rules";
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
  it.each([
    { research: 5, favor: 5 },
    { research: 5, favor: 6 },
    { research: 6, favor: 5 },
    { research: 6, favor: 6 },
  ])("keeps advisor preparation and familiarity hints independent at $research/$favor", ({ research, favor }) => {
    const initial = createInitialState();
    const event = createAdvisorTalkRandomEvent({ ...initial, totalResearchScore: 2, player: { ...initial.player, research, favor } }, () => 0.99);
    const decision = event.choices[0]!.effects.enqueueEvents![0]!;
    const paragraphs = decision.description.split(/\n\s*\n/u);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain(research >= 6 ? "依据都能对上" : "对照也没补齐");
    expect(paragraphs[1]).toContain(favor >= 6 ? "记得你上次卡住的地方" : "还在问课题何时做完");
    expect(paragraphs[0]!.length).toBeLessThanOrEqual(90);
    expect(paragraphs[1]!.length).toBeLessThanOrEqual(130);
    expect(decision.description).not.toMatch(/科研\s*[≥<]|好感\s*[≥<]|\d+%/u);
    expect(decision.choices[0]!.outcome).toContain(research >= 6 ? "科研 ≥ 6" : "科研 < 6");
    expect(decision.choices[1]!.outcome).toContain(favor >= 6 ? "导师好感 ≥ 6" : "导师好感 < 6");
    expect(decision.choices[2]!.outcome).toContain("科研分 ≥ 2");
    for (const choice of decision.choices.slice(1, 3)) {
      expect(choice.effects.enqueueEvents!.at(-1)!.description).toContain(choice.outcome);
    }
    expect(decision.choices[0]!.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(research >= 6 ? 5 : undefined);
    expect(decision.choices[0]!.effects.favor).toBe(research < 6 ? -1 : undefined);
    expect(decision.choices[1]!.effects.research).toBe(favor >= 6 ? 1 : undefined);
    expect(decision.choices[1]!.effects.favor).toBe(favor < 6 ? -1 : undefined);
  });

  it.each([5, 6, 18])("keeps advisor talk narrative within two natural paragraphs at favor %i", (favor) => {
    const initial = createInitialState();
    const event = createAdvisorTalkRandomEvent({ ...initial, totalResearchScore: 2, player: { ...initial.player, favor, research: favor } }, () => 0.99);
    const decision = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(event.description).toContain("群");
    expect(event.description).toContain("PPT");
    expect(event.description).toContain("开场白");
    expect(decision.description).toContain("招聘");
    expect(decision.description).toContain("三个月");
    expect(decision.description).toContain("实验室");
    const results = decision.choices.map((choice) => choice.effects.enqueueEvents!.at(-1)!);
    for (const scene of [event, decision, ...results]) {
      const story = scene.description.split("机制结算")[0]!.trim();
      expect(story.split(/\n\s*\n/u).length).toBeLessThanOrEqual(2);
      expect(story).not.toMatch(/SAN|倍率|金币|科研\s*[≥<]|好感\s*[≥<]/u);
    }
    const confirmation = results[2]!.choices[0]!.effects;
    expect(Boolean(confirmation.internshipStateUpdates)).toBe(true);
    expect(confirmation.temporaryActionEffectUpdates).toBeUndefined();
    expect(confirmation.san).toBeUndefined();
    expect(confirmation.money).toBeUndefined();
  });

  it("prefers different event categories for multiple ordinary events in one month", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      totalMonths: 20,
      maxMonths: 68,
      availableRandomEvents: [1, 2, 7, 13],
      usedRandomEvents: [],
    };
    let firstRoll = true;
    const result = collectRandomEventsForMonth(state, () => {
      if (firstRoll) {
        firstRoll = false;
        return 0.95;
      }
      return 0;
    });

    expect(result.events.map((event) => event.chainId)).toEqual(["random-1", "random-2", "random-7"]);
  });

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
      expect(event.description).toContain("导师在群里回了句“谢谢大家”");
      expect(event.description).not.toContain("好感等级");
      expect(choiceEvent?.description).toContain("聊天记录几乎全是“收到”");
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
      expect(result.outcome).toBe(`送${item.name}：金币 -1｜导师好感 +1。`);
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
    expect(result.outcome).toBe("送邮票：金币 -3｜导师好感 +2。");
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

  it("keeps the resolved condition when a Teacher's Day result changes no values", () => {
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

    expect(lowFavorResult.enqueueEvents?.[0]?.description).toContain("条件：导师好感 < 6；普通回复（60%）");
    expect(lowFavorResult.enqueueEvents?.[0]?.description).not.toContain("无直接数值变化");
    expect(highFavorResult.enqueueEvents?.[0]?.description).toContain("条件：导师好感 ≥ 6；普通回复（50%）");
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
    expect(result.outcome).toBe("报销跑腿：SAN -3｜导师好感 +1。");
    expect(result.enqueueEvents?.[0]?.description).toContain("SAN -3");
    expect(result.enqueueEvents?.[0]?.description).toContain("导师好感 +1");
    expect(result.enqueueEvents?.[0]?.completionLog).toBe("报销跑腿：SAN -3｜导师好感 +1。");
    expect(result.outcome).toContain("报销跑腿");
    expect(result.enqueueEvents?.[0]?.description.split("机制结算")[0]).not.toMatch(/透明概率|好感\s*[≥<]|\d+%/u);
    expect(result.enqueueEvents?.[0]?.description.split("机制结算")[1]).toContain("条件：导师好感 < 6；报销跑腿（40%）");
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 9])("uses completed errands to set Teacher's Day odds after %i errands", (count) => {
    const initial = createInitialState();
    const state = {
      ...initial,
      player: { ...initial.player, favor: 1 },
      eventCounters: { ...initial.eventCounters, teachersDayErrandCount: count },
    };
    const percent = Math.min(100, 40 + count * 10);
    const errand = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, () => percent / 100 - 0.000001);
    expect(errand.enqueueEvents?.[0]?.description).toContain(`报销跑腿（${percent}%）`);
    expect(errand.nextState.eventCounters.teachersDayErrandCount).toBe(count + 1);
    expect(state.eventCounters.teachersDayErrandCount).toBe(count);
    if (percent < 100) {
      expect(errand.enqueueEvents?.[0]?.description).toContain(`报销跑腿 ${percent}%→${percent + 10}%`);
      const reply = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, () => percent / 100);
      expect(reply.enqueueEvents?.[0]?.description).toContain(`普通回复（${100 - percent}%）`);
      expect(reply.nextState.eventCounters.teachersDayErrandCount).toBe(count);
    }
    const gift = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-gift", teachersDayGift: "tea" }, () => 0);
    expect(gift.nextState.eventCounters.teachersDayErrandCount).toBe(count);
    const familiar = resolveTeachersDayFixedEvent({ ...state, player: { ...state.player, favor: 6 } }, { kind: "teachers-day-message" }, () => 0);
    expect(familiar.enqueueEvents?.[0]?.description).toContain("分享想法（50%）");
    expect(familiar.nextState.eventCounters.teachersDayErrandCount).toBe(count);
    expect(familiar.nextState.buffs.at(-1)?.actionEffects?.idea?.bonus).toBe(4);
    const familiarReply = resolveTeachersDayFixedEvent({ ...state, player: { ...state.player, favor: 6 } }, { kind: "teachers-day-message" }, () => 0.5);
    expect(familiarReply.enqueueEvents?.[0]?.description).toContain("普通回复（50%）");
    expect(familiarReply.nextState.eventCounters.teachersDayErrandCount).toBe(count);
  });

  it("hints at Teacher's Day branches through familiarity without numerical odds", () => {
    const base = createInitialState();
    const state = {
      ...base,
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...base.player, favor: 6 },
    };
    const choiceEvent = createTeachersDayEvent(state, () => 0).choices[0]?.effects.enqueueEvents?.[0];
    expect(choiceEvent?.description).not.toContain("报销");
    expect(choiceEvent?.description).toContain("研究想法");
    expect(choiceEvent?.description).toContain("忙起来可能只回一句谢谢");
    expect(choiceEvent?.description.split(/\n\s*\n/u)).toHaveLength(2);
    expect(choiceEvent?.description).not.toMatch(/透明概率|好感\s*[≥<]|\d+%/u);
    const result = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, () => 0);
    expect(result.outcome).toBe("教师节祝福：下次想 idea +4。");
    expect(result.outcome).toContain("下次想 idea +4");
    expect(result.outcome).not.toMatch(/\d+%/u);
    expect(result.enqueueEvents?.[0]?.description.split("机制结算")[0]).not.toMatch(/透明概率|好感\s*[≥<]|\d+%/u);
    expect(result.enqueueEvents?.[0]?.description.split("机制结算")[1]).toContain("条件：导师好感 ≥ 6；分享想法（50%）");
    const lowFavorState = { ...state, player: { ...state.player, favor: 5 } };
    const lowFavorChoice = createTeachersDayEvent(lowFavorState, () => 0).choices[0]?.effects.enqueueEvents?.[0];
    expect(lowFavorChoice?.description).toContain("报销");
    expect(lowFavorChoice?.description).toContain("也可能只回一句谢谢");
    expect(lowFavorChoice?.description).toContain("1 金币");
    expect(lowFavorChoice?.description).toContain("3 金币");
    expect(lowFavorChoice?.description.split(/\n\s*\n/u)).toHaveLength(2);
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
    for (const [typeRoll, title] of illnessCases) {
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
      expect(decision?.description).toContain("买药");
      expect(hardChoice?.outcome).toMatch(/^SAN 上限 -[123]｜生病概率 ×0\.5$/u);
      expect(hardChoice?.outcome).not.toContain("大病一场");
      expect(hardResult?.description.split("机制结算")[0]).toContain("去了实验室");
      expect(hardResult?.description.split("机制结算")[1]).not.toContain("连休");
      expect(medicineResult?.description).toContain("买了药");
    }
    const exhausted = collectIllnessEventForMonth({
      ...baseState,
      actionState: { used: 1, limit: 1, aiResearchBonusUsed: false },
    }, fromRolls([0, 0]));
    const exhaustedDecision = exhausted[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const exhaustedRest = exhaustedDecision?.choices.find((choice) => choice.label === "休息");
    expect(exhaustedRest?.disabledReason).toBe("本月行动点已用尽，无法休息");
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
    expect(newJunior).toMatchObject({ type: "junior", research: 2, affinity: 3 });
    expect(selfGuidanceChoice?.outcome).toContain("默契 +2");
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

  it("can generate a female junior for the mentoring event", () => {
    const initial = createInitialState();
    const state = {
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
    const result = collectRandomEventsForMonth(state, fromRolls([0.7, 0, 0, 0.99, 0.99, 0.99]));
    const junior = getDecisionChoices(result.events[0])[1]?.effects.fellowAdditions?.[0];

    expect(junior?.gender).toBe("female");
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
    expect(result.events[0]?.title).toBe("审稿任务");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["婉言推辞", "认真审稿", "交给师弟师妹"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.favor).toBe(-1);
    expect(getDecisionChoices(result.events[0])[1]?.effects).toMatchObject({
      readPaperActions: 2,
    });
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[1]?.outcome).toContain("看论文 2 次");
    expect(getDecisionChoices(result.events[0])[1]?.outcome).not.toContain("阅读累计");
    expect(getDecisionChoices(result.events[0])[1]?.outcome).toContain("下次想 idea +2分");
    expect(getDecisionChoices(result.events[0])[1]?.outcome).not.toContain("审稿灵感");
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(-2);
  });

  it("settles the review reading research with the same rolls its preview showed", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 1,
      totalMonths: 13,
      readingState: { ...initial.readingState, readCount: 9 },
      player: { ...initial.player, research: 12, san: 10 },
      availableRandomEvents: [2],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    // Only the first roll picks the event; every later roll is 0, so the 50% research tier resists.
    const result = collectRandomEventsForMonth(state, fromRolls([0.7]));
    const choice = getDecisionChoices(result.events[0])[1]!;
    expect(choice.outcome).toContain("科研 +0（抵抗1）");
    expect(choice.effects.readPaperRolls).toEqual([0]);

    const realRandom = Math.random;
    Math.random = () => 0.99;
    try {
      const resolved = applyChoiceEffectsToState(state, choice).nextState;
      expect(resolved.readingState.readCount).toBe(11);
      expect(resolved.player.research).toBe(12);
    } finally {
      Math.random = realRandom;
    }
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
    expect(intro).toContain("公式一路排到附录");
    expect(intro).toContain("有两步怎么也找不到解释");
    expect(decision).not.toContain("篇幅长、信息密");
    expect(intro).not.toContain("认真审能学到些东西");
    expect(decision).toContain("核清这几步");
    expect(decision).toContain("参考文献");
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
    expect(unfamiliarChoice?.outcome).toContain("师弟师妹人数 = 0");
    expect(familiarChoice?.outcome).toContain("师弟师妹人数 > 0");
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
    expect(unfamiliarChoice?.outcome).toContain("师弟师妹人数 = 0");
    expect(familiarChoice?.outcome).toContain("师弟师妹人数 > 0");
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
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["接横向项目", "接纵向项目", "拒绝承担", "让师弟师妹分担"]);
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

  it("builds the real event 5 choices with research, favor and publication-score thresholds", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      totalResearchScore: 2,
      player: { ...initial.player, research: 6, favor: 6 },
      availableRandomEvents: [5],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0, 0, 0.99, 0.99, 0.99, 0.99]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师约谈");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["认真汇报", "请教推进方法", "提出远程实习"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(5);
    expect(getDecisionChoices(result.events[0])[1]?.effects.research).toBe(1);
    expect(getDecisionChoices(result.events[0])[2]?.effects.internshipStateUpdates).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.enqueueEvents?.at(-1)?.choices[0]?.effects.internshipStateUpdates).toMatchObject({
      active: true,
      kind: "remote3",
      startTotalMonths: 18,
      endTotalMonths: 20,
      remainingMonths: 3,
      experimentMultiplier: 1,
      experimentBonus: 4,
      experimentMoneyDiscount: 1,
    });
  });

  it.each([60, 50, 40, 30, 20, 10])("uses the advisor rank's %i percent attendance for every meeting option", (percent) => {
    const initial = createInitialState();
    const rank = (60 - percent) / 10;
    const grant = ADVISOR_GRANTS[rank - 1];
    const state = {
      ...initial,
      player: { ...initial.player, research: 1, favor: 1 },
      advisorProgressState: {
        ...initial.advisorProgressState,
        awards: grant ? [{ id: grant.id, awardedYear: 2023, startYear: 2024, endYear: 2025 }] : [],
      },
    };
    for (const present of [true, false]) {
      const threshold = percent / 100;
      const roll = present ? threshold - 0.000001 : threshold;
      const event = createAdvisorMeetingRandomEvent(state, () => roll);
      const choices = getDecisionChoices(event);
      expect(choices).toHaveLength(3);
      for (const [index, choice] of choices.entries()) {
        const probability = present ? `导师到场（${percent}%）` : `导师缺席（${100 - percent}%）`;
        expect(choice.outcome).toContain(probability);
        expect(choice.effects.enqueueEvents?.[0]?.description).toContain(probability);
        expect(choice.effects.favor ?? 0).toBe(present ? index === 2 ? -1 : 1 : 0);
      }
    }
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
    expect(getDecisionChoices(result.events[0])[0]?.effects.eventSupportUpdates).toEqual({});
    expect(getDecisionChoices(result.events[0])[1]?.effects.money).toBe(5);
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(1);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBe(5);
    expect(getDecisionChoices(result.events[0])[3]?.effects.favor).toBe(1);
    expect(getDecisionChoices(result.events[0])[3]?.effects.money).toBeUndefined();
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
      advisorProgressState: { ...initial.advisorProgressState, funding: 61 },
      availableRandomEvents: [8],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0, 0, 0, 0.9]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师经费");
    const decisions = getDecisionChoices(result.events[0]);
    const choices = decisions.map((choice) => ({
      ...choice,
      effects: { ...choice.effects, ...choice.effects.enqueueEvents![0]!.choices[0]!.effects },
    }));
    expect(decisions[0]?.effects.shopEntitlementDeltas).toBeUndefined();
    expect(decisions[2]?.effects.shopEntitlementDeltas).toBeUndefined();
    expect(decisions[3]?.effects.addBuffs).toBeUndefined();
    expect(choices.map((choice) => choice.label)).toEqual(["买显卡", "发劳务费", "装修工位", "报销 AI 费用"]);
    expect(choices[0]?.effects.shopEntitlementDeltas).toEqual({ gpuTransaction: 1 });
    expect(choices[0]?.outcome).toContain("结果：显卡报销：");
    expect(choices[2]?.outcome).toContain("结果：工位报销：");
    expect(choices[2]?.outcome).not.toContain("+1");
    expect(choices[1]?.effects.money).toBe(7);
    expect(choices[1]?.effects.advisorProgressStateDeltas).toBeUndefined();
    const salaryPaid = applyChoiceEffectsToState(baseState, choices[1]!).nextState;
    expect(salaryPaid.player.money).toBe(baseState.player.money + 7);
    expect(salaryPaid.advisorProgressState).toEqual(baseState.advisorProgressState);
    expect(choices[2]?.effects.shopEntitlementDeltas).toEqual({
      workstationTransaction: 1,
    });
    const funded = applyChoiceEffectsToState(baseState, choices[2]!).nextState;
    expect(funded.shopState.entitlements).toEqual({
      gpuTransaction: 0,
      workstationTransaction: 1,
    });
    const fundedTwice = applyChoiceEffectsToState(funded, choices[2]!).nextState;
    expect(fundedTwice.shopState.entitlements.workstationTransaction).toBe(2);
    expect(choices[3]?.outcome).toContain("AI");
    expect(choices[3]?.effects.addBuffs).toEqual([expect.objectContaining({
      id: "ai-reimbursement-18",
      name: "AI报销",
      timing: "monthly",
      remainingMonths: 2,
      shopEffects: { aiCostsCovered: true, aiCostsCoveredAtTotalMonths: 18 },
    })]);
    expect(choices[3]?.effects.eventSupportUpdates).toBeUndefined();
    const aiFunded = applyChoiceEffectsToState(baseState, choices[3]!).nextState;
    expect(aiFunded.buffs).toContainEqual(expect.objectContaining({ id: "ai-reimbursement-18", name: "AI报销" }));
    const aiResult = choices[3]?.effects.enqueueEvents?.at(-1);
    expect(aiResult?.title).toContain("报销 AI 费用");
    expect(aiResult?.description).toContain("下个月的费用");
    expect(aiResult?.description).toContain("AI报销：下月免费");
  });

  it("waits for advisor funding above the shared project threshold before showing event 8", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      advisorProgressState: { ...initial.advisorProgressState, funding: 60 },
      availableRandomEvents: [8],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const waiting = collectRandomEventsForMonth(state, fromRolls([0.7, 0]));
    expect(waiting.events).toEqual([]);
    expect(waiting.nextState.pendingRandomEvents).toEqual([{ eventId: 8, serial: 1 }]);

    const activated = activatePendingRandomEvents({
      ...waiting.nextState,
      advisorProgressState: { ...waiting.nextState.advisorProgressState, funding: 61 },
    }, () => 0);
    expect(activated.pendingRandomEvents).toEqual([]);
    expect(activated.eventQueue.some((event) => event.chainId === "random-8")).toBe(true);
  });

  it("maps all four advisor-favor tiers to the new funding salary values", () => {
    const initial = createInitialState();
    for (const [favor, expectedMoney] of [[0, 3], [6, 5], [12, 7], [18, 9]] as const) {
      const event = createFundingCampusRandomEvent({
        ...initial,
        player: { ...initial.player, favor },
      }, () => 0);
      expect(getDecisionChoices(event)[1]?.effects.enqueueEvents![0]!.choices[0]!.effects.money).toBe(expectedMoney);
    }
  });

  it("builds peer cooperation with discussion and real fellow additions", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, social: 6 },
      availableRandomEvents: [10],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u540c\u95e8\u5408\u4f5c");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["委婉拒绝", "学术交流", "尝试合作", "长期合作"]);
    expect(getDecisionChoices(result.events[0])[1]?.effects.temporaryActionEffectUpdates?.idea).toEqual({ bonus: 5 });
    expect(getDecisionChoices(result.events[0]).every((choice) => choice.effects.grantedPublication === undefined)).toBe(true);
    expect(getDecisionChoices(result.events[0])[1]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-5);
    expect(getDecisionChoices(result.events[0])[2]?.effects.fellowAdditions?.[0]).toMatchObject({ type: "peer", affinity: 1 });
    expect(getDecisionChoices(result.events[0])[3]?.effects.temporaryActionEffectUpdates).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.fellowAdditions?.[0]).toMatchObject({ type: "peer", longTermMentoring: true });

    const rejectResult = getDecisionChoices(result.events[0])[0]?.effects.enqueueEvents?.at(-1);
    expect(rejectResult?.completionLog).toBe("委婉拒绝：无事发生。");
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
      player: { ...createInitialState().player, research: 6 },
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u5e08\u5144\u6307\u5bfc");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["委婉拒绝", "学术交流", "尝试合作", "长期合作"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[1]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(8);
    expect(getDecisionChoices(result.events[0])[2]?.effects.research).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-4);
    expect(getDecisionChoices(result.events[0])[3]?.effects.writingBonus).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.fellowAdditions?.[0]).toMatchObject({ type: "senior", longTermMentoring: true });
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
      papers: [{ ...createDraftPaper(1, 1), idea: 1 }],
      availableRandomEvents: [12],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("署名风波");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["向导师诉苦", "转移到师弟师妹", "据理力争", "极端反抗"]);
    expect(getDecisionChoices(result.events[0])[0]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(-5);
    expect(getDecisionChoices(result.events[0])[1]?.effects.social).toBe(-2);
    expect(getDecisionChoices(result.events[0])[1]?.effects.score).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[1]?.effects.grantedPublication).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-3);
    expect(getDecisionChoices(result.events[0])[3]?.effects.money).toBe(2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.favor).toBe(-2);

    const highFavorState = {
      ...baseState,
      player: { ...baseState.player, favor: 6 },
    };
    const highFavorResult = collectRandomEventsForMonth(highFavorState, fromRolls([0.7, 0]));
    const highFavorChoices = getDecisionChoices(highFavorResult.events[0]);
    expect(highFavorChoices[0]?.outcome).toBe("导师好感 ≥ 6｜无事发生。");
    expect(highFavorChoices[2]?.outcome).toBe("导师好感 ≥ 6｜无事发生。");
    const complainResult = highFavorChoices[0]?.effects.enqueueEvents?.at(-1);
    expect(complainResult?.description.split("机制结算")[0]).toContain("按原来的分工重新核对");
    expect(complainResult?.description.split("机制结算")[1]).not.toContain("安抚");
  });

  it("keeps remote internship costs in monthly settlement", () => {
    const initial = createInitialState();

    const talkState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 10,
      totalMonths: 22,
      totalResearchScore: 2,
      player: { ...initial.player, research: 6, favor: 6 },
      availableRandomEvents: [5],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const talkResult = collectRandomEventsForMonth(talkState, fromRolls([0.7, 0]));
    expect(getDecisionChoices(talkResult.events[0])[2]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(talkResult.events[0])[2]?.effects.enqueueEvents?.at(-1)?.choices[0]?.effects.internshipStateUpdates?.remainingMonths).toBe(3);

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
      papers: [{ ...createDraftPaper(1, 1), idea: 1 }],
      availableRandomEvents: [12],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const authorshipResult = collectRandomEventsForMonth(authorshipState, fromRolls([0.7, 0]));
    expect(getDecisionChoices(authorshipResult.events[0])[2]?.effects.san).toBe(-4);
  });

  it.each(["none", "peer", "junior"] as const)("uses the actual %s relationship for authorship transfer", (type) => {
    const initial = createInitialState();
    const profile = createCustomFellowProgressProfile({ type: type === "none" ? "peer" : type, gender: "female", research: 3, affinity: 1, startTotalMonths: 1, name: "林晓" });
    const state = { ...initial, month: 6, totalMonths: 6, player: { ...initial.player, social: 5 }, fellowProgressState: type === "none" ? [] : [profile] };
    const transfer = getDecisionChoices(createAdvisorAuthorshipRandomEvent(state, () => 0.99))[1]!;
    expect(transfer.effects.social).toBe(type === "junior" ? -1 : -2);
    expect(transfer.outcome).toContain(type === "junior" ? "师弟师妹人数 > 0" : "师弟师妹人数 = 0");
    const story = transfer.effects.enqueueEvents![0]!.description.split("机制结算")[0]!;
    expect(story).toContain("另一篇论文");
    expect(story).toContain("毕业、找工作");
    if (type === "junior") expect(story).toContain("林晓");
    const resisted = getDecisionChoices(createAdvisorAuthorshipRandomEvent({ ...state, player: { ...state.player, social: 18 } }, () => 0))[1]!;
    expect(resisted.effects.social).toBeUndefined();
    expect(resisted.outcome).toContain(`社交 -0（抵抗${type === "junior" ? 1 : 2}）`);
  });

  it("uses three base SAN for arguing and a calming stipend for resistance", () => {
    const initial = createInitialState();
    for (const [month, cost] of [[6, 3], [7, 2], [10, 4]]) {
      const state = { ...initial, month: month!, player: { ...initial.player, favor: 1 } };
      const choices = getDecisionChoices(createAdvisorAuthorshipRandomEvent(state, () => 0.99));
      expect(choices[2]!.effects.san).toBe(-cost!);
      expect(choices[3]!.label).toBe("极端反抗");
      expect(choices[3]!.effects).toMatchObject({ money: 2, favor: -2 });
      const story = choices[3]!.effects.enqueueEvents![0]!.description.split("\n\n机制结算")[0]!;
      expect(story).toContain("找个由头安抚你");
      expect(story.split("\n\n")).toHaveLength(2);
    }
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

    const scholarshipDecision = createScholarshipEvent(spring, () => 0).choices[0]!.effects.enqueueEvents![0]!;
    const scholarshipResult = resolveScholarshipApplication(spring, scholarshipDecision.choices[0]!.effects.fixedEventResolution!, () => 0).enqueueEvents![0]!;
    expect(scholarshipResult.choices[0]?.effects.san).toBe(-1);
    expect(getDecisionChoices(createCareerEventForType(spring, "academic"))[1]?.effects.san).toBe(-2);
    expect(getDecisionChoices(collectThesisEventForMonth(spring).event ?? undefined)[1]?.effects.san).toBe(-1);
  });

  it("builds the real event 13 choices with a shared six-month rental surcharge", () => {
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
    expect(getDecisionChoices(result.events[0])[0]?.effects.experimentBonus).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[0]?.effects.addBuffs).toMatchObject([{ labExperimentMoneyDelta: 1, remainingMonths: 6 }]);
    expect(getDecisionChoices(result.events[0])[1]?.effects.social).toBe(-2);
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-3);
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBe(-1);
    expect(getDecisionChoices(result.events[0])[2]?.effects.temporaryActionEffectUpdates).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.addBuffs).toMatchObject([{ labExperimentMoneyDelta: 1, remainingMonths: 6 }]);
    expect(getDecisionChoices(result.events[0])[3]?.effects.money).toBe(-2);
    expect(getDecisionChoices(result.events[0])[3]?.effects.san).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.addBuffs).toMatchObject([{ labExperimentMoneyDelta: 1, remainingMonths: 6 }]);

    const serverDecision = result.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const serverCopy = [
      result.events[0]?.description,
      serverDecision?.description,
      ...(serverDecision?.choices.flatMap((choice) => choice.effects.enqueueEvents?.map((event) => event.description) ?? []) ?? []),
    ].join("\n");
    expect(serverCopy).toContain("显卡");
    expect(serverCopy).toContain("Linux");
    expect(serverCopy).toContain("租卡");
    expect(serverCopy).toContain("硬盘也格式化了");
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
      papers: [{ ...createDraftPaper(1, 0), status: "published" as const }],
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u6307\u5bfc\u5e08\u5f1f");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["委婉拒绝", "请客吃饭", "认真指导", "长期合作"]);
    expect(getDecisionChoices(result.events[0])[2]?.effects.social).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[2]?.effects.fellowAdditions?.[0]).toMatchObject({
      type: "junior",
      gender: "male",
    });
    expect(getDecisionChoices(result.events[0])[2]?.effects.san).toBe(-5);
    expect(getDecisionChoices(result.events[0])[3]?.effects.mentorshipStacks).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.addBuffs).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[3]?.effects.social).toBeUndefined();
    expect(getDecisionChoices(result.events[0])[1]?.effects).toMatchObject({ money: -2, social: 1 });
    expect(getDecisionChoices(result.events[0])[3]?.effects.fellowAdditions?.[0]).toMatchObject({
      type: "junior",
      gender: "male",
      longTermMentoring: true,
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
      eventSupport: { hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false },
    };

    const result = collectRandomEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("游戏放松");
    expect(getDecisionChoices(result.events[0]).map((choice) => choice.label)).toEqual(["玩泰拉瑞亚", "玩魔塔50层", "玩研究生模拟器", "玩洛克王国世界"]);
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
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(-5);
    expect(getDecisionChoices(result.events[0])[1]?.effects.clearDraftProgress).toBe(true);
    expect(getDecisionChoices(result.events[0])[2]?.effects.money).toBe(-3);
    expect(getDecisionChoices(result.events[0])[3]?.effects.draftCitationDebuffMultiplier).toBe(0.5);
    expect(getDecisionChoices(result.events[0])[3]?.effects).not.toHaveProperty("otherCitationPenaltyMultiplier");

    const dataLossDecision = result.events[0]?.choices[0]?.effects.enqueueEvents?.[0];
    const dataLossCopy = [
      result.events[0]?.description,
      dataLossDecision?.description,
      ...(dataLossDecision?.choices.flatMap((choice) => choice.effects.enqueueEvents?.map((event) => event.description) ?? []) ?? []),
    ].join("\n");
    expect(dataLossCopy).toContain("自己的电脑");
    expect(dataLossCopy).not.toContain("**自己的电脑**");
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
    expect(getDecisionChoices(result.events[0])[0]?.effects.san).toBe(-4);
  });

  it("hides event 16 when there is no recoverable draft progress", () => {
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
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.usedRandomEvents).toEqual([]);
    expect(result.nextState.totalRandomEventCount).toBe(1);
    expect(result.nextState.pendingRandomEvents).toEqual([{ eventId: 16, serial: 1 }]);
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
