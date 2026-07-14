import { describe, expect, it } from "vitest";

import {
  collectCareerEventsForMonth,
  collectFixedEventsForMonth,
  collectRandomEventsForMonth,
  collectThesisEventForMonth,
  enqueueFixedEventsForMonth,
  enqueueMonthlyEventsForMonth,
  type RandomRollProvider,
} from "../src/core/v2-event-scheduler";
import { createInitialState } from "../src/core/v2-engine";

function fromRolls(rolls: number[]): RandomRollProvider {
  let index = 0;
  return () => {
    const roll = rolls[index] ?? 0;
    index += 1;
    return roll;
  };
}

describe("v2 event scheduler", () => {
  it("collects fixed events by month", () => {
    const initial = createInitialState();

    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 1, month: 1, totalMonths: 1 }).map((event) => event.chainId)).toEqual(["teachers-day"]);
    expect(collectFixedEventsForMonth({ ...initial, phase: "playing" as const, year: 2, month: 2, totalMonths: 14 }).map((event) => event.chainId)).toEqual(["scholarship"]);
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

  it("creates thesis events from year 2 month 7 onward", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 2,
      month: 7,
      totalMonths: 19,
    };

    const thesisResult = collectThesisEventForMonth(baseState);
    expect(thesisResult.nextState.thesis.started).toBe(true);
    expect(thesisResult.event?.source).toBe("thesis");
    expect(thesisResult.event?.id).toBe("thesis-progress-y2-m7");
  });

  it("creates career events on active months in the target graduation year", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      degree: "master" as const,
      year: 3,
      month: 3,
      totalMonths: 27,
    };

    const careerEvents = collectCareerEventsForMonth(baseState);
    expect(careerEvents.map((event) => event.source)).toEqual(["career", "career"]);
    expect(careerEvents.map((event) => event.id)).toEqual(["career-stateOwned-y3-m3", "career-civilService-y3-m3"]);
  });

  it("builds the real event 3 choices and applies entry-side cold state updates", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 8,
      totalMonths: 20,
      player: { ...initial.player, san: 0, money: 1 },
      availableRandomEvents: [3],
      usedRandomEvents: [],
      coldWeight: 4,
      totalRandomEventCount: 0,
      eventCounters: { ...initial.eventCounters, coldCount: 2 },
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.source).toBe("random");
    expect(result.events[0]?.title).toBe("疾病来袭");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["硬撑工作", "先买药", "去医院", "休息一天"]);
    expect(result.events[0]?.choices[0]?.effects.sanCapDelta).toBe(-4);
    expect(result.events[0]?.choices[1]?.effects.stayOnEvent).toBe(true);
    expect(result.events[0]?.choices[2]?.effects.stayOnEvent).toBe(true);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(-7);
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.usedRandomEvents).toEqual([3]);
    expect(result.nextState.coldWeight).toBe(1);
    expect(result.nextState.totalRandomEventCount).toBe(1);
    expect(result.nextState.eventCounters.coldCount).toBe(3);
    expect(result.nextState.achievementFlags.sickly).toBe(true);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("不断学习");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["基础知识", "最新技术", "代码知识", "深奥理论"]);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("毕设辅导");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["委婉拒绝", "亲自指导", "转给师弟"]);
    expect(result.events[0]?.choices[0]?.effects.favor).toBe(-1);
    expect(result.events[0]?.choices[0]?.effects.counterDeltas).toEqual({ rejectedMentoringCount: 1 });
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-3);
    expect(result.events[0]?.choices[1]?.effects.research).toBe(1);
    expect(result.events[0]?.choices[1]?.effects.relationshipAdditions).toEqual(["junior"]);
    expect(result.events[0]?.choices[2]?.effects.social).toBe(-1);
  });

  it("builds the real event 2 choices with inspiration and social threshold", () => {
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("帮忙审稿");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["婉言推辞", "认真审稿", "交给师弟"]);
    expect(result.events[0]?.choices[0]?.effects.favor).toBe(-1);
    expect(result.events[0]?.choices[0]?.effects.counterDeltas).toEqual({ rejectedReviewCount: 1 });
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-2);
    expect(result.events[0]?.choices[1]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(4);
    expect(result.events[0]?.choices[2]?.effects.social).toBe(-1);
  });

  it("builds the real event 4 choices with project king and learn-to-say-no hooks", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      eventCounters: {
        ...initial.eventCounters,
        projectCompletedCount: 2,
        rejectedMentoringCount: 1,
        rejectedReviewCount: 1,
      },
      availableRandomEvents: [4],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师项目");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["接横向项目", "接纵向项目", "婉言拒绝", "让师弟分担"]);
    expect(result.events[0]?.choices[0]?.effects.counterDeltas).toEqual({ projectCompletedCount: 1 });
    expect(result.events[0]?.choices[0]?.effects.achievementFlags).toEqual(["projectKing"]);
    expect(result.events[0]?.choices[1]?.effects.research).toBe(1);
    expect(result.events[0]?.choices[2]?.effects.counterDeltas).toEqual({ rejectedProjectCount: 1 });
    expect(result.events[0]?.choices[2]?.effects.achievementFlags).toEqual(["learnToSayNo"]);
    expect(result.events[0]?.choices[2]?.effects.favor).toBe(-2);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(-2);
    expect(result.events[0]?.choices[3]?.effects.social).toBe(-1);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events[0]?.choices[0]?.effects.san).toBe(-6);
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-4);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(-1);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师约谈");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["认真汇报", "请教推进方法", "提出去实习"]);
    expect(result.events[0]?.choices[0]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(5);
    expect(result.events[0]?.choices[1]?.effects.research).toBe(1);
    expect(result.events[0]?.choices[2]?.effects.money).toBe(5);
    expect(result.events[0]?.choices[2]?.effects.san).toBe(-6);
    expect(result.events[0]?.choices[2]?.effects.temporaryActionEffectUpdates?.experiment?.bonus).toBe(5);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("组会汇报");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["讲深奥论文", "讲系列论文", "随便水一下"]);
    expect(result.events[0]?.choices[0]?.effects.favor).toBe(-1);
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-3);
    expect(result.events[0]?.choices[1]?.effects.favor).toBe(2);
    expect(result.events[0]?.choices[2]?.effects.favor).toBe(-1);
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
        pokerWinCount: 2,
        pokerTotalEarnings: 8,
        ktvCount: 2,
      },
      availableRandomEvents: [7],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0.1, 0.1, 0.1, 0.9]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("实验室团建");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["打羽毛球", "打德州扑克", "KTV唱歌", "聚餐"]);
    expect(result.events[0]?.choices[0]?.effects.san).toBe(2);
    expect(result.events[0]?.choices[0]?.effects.social).toBe(1);
    expect(result.events[0]?.choices[0]?.effects.counterDeltas).toEqual({ badmintonCount: 1 });
    expect(result.events[0]?.choices[0]?.effects.eventSupportUpdates).toEqual({ hasStrongBodyTalent: true });
    expect(result.events[0]?.choices[0]?.effects.achievementFlags).toEqual(["badmintonChampion"]);
    expect(result.events[0]?.choices[0]?.effects.setBadmintonYearToCurrent).toBe(true);
    expect(result.events[0]?.choices[1]?.effects.money).toBe(6);
    expect(result.events[0]?.choices[1]?.effects.counterDeltas).toEqual({ pokerWinCount: 1, pokerTotalEarnings: 6 });
    expect(result.events[0]?.choices[1]?.effects.eventSupportUpdates).toEqual({ hasFinanceTalent: true });
    expect(result.events[0]?.choices[1]?.effects.achievementFlags).toEqual(["pokerGod"]);
    expect(result.events[0]?.choices[2]?.effects.social).toBe(1);
    expect(result.events[0]?.choices[2]?.effects.counterDeltas).toEqual({ ktvCount: 1 });
    expect(result.events[0]?.choices[2]?.effects.achievementFlags).toEqual(["ktvKing"]);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(5);
    expect(result.events[0]?.choices[3]?.effects.favor).toBe(1);
    expect(result.events[0]?.choices[3]?.effects.counterDeltas).toEqual({ dinnerCount: 1 });
  });

  it("builds the real event 8 choices with gpu, salary and renovate routes", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, favor: 12 },
      availableRandomEvents: [8],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("导师经费");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["买GPU服务器", "多发劳务费", "装修工位"]);
    expect(result.events[0]?.choices[0]?.effects.experimentBonus).toBe(3);
    expect(result.events[0]?.choices[0]?.effects.persistentExtraActionDeltas).toEqual({ experiment: 3 });
    expect(result.events[0]?.choices[1]?.effects.money).toBe(6);
    expect(result.events[0]?.choices[2]?.effects.ideaBonus).toBe(1);
    expect(result.events[0]?.choices[2]?.effects.writingBonus).toBe(1);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u540c\u95e8\u5408\u4f5c");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["\u5b66\u672f\u4ea4\u6d41", "\u4e92\u6302\u8bba\u6587", "\u5a49\u62d2\u5408\u4f5c", "\u5168\u9762\u5408\u4f5c"]);
    expect(result.events[0]?.choices[0]?.effects.temporaryActionEffectUpdates?.idea).toEqual({ bonus: 5, multiplier: 0.5 });
    expect(result.events[0]?.choices[1]?.effects.nextPublicationCitationMultiplier).toBe(2);
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-2);
    expect(result.events[0]?.choices[3]?.effects.temporaryActionEffectUpdates?.idea?.extraActions).toBe(1);
    expect(result.events[0]?.choices[3]?.effects.temporaryActionEffectUpdates?.writing?.extraActions).toBe(1);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(-2);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u5e08\u5144\u6307\u5bfc");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["\u5148\u89c2\u671b", "\u6d45\u6d45\u5408\u4f5c", "\u6df1\u5165\u5408\u4f5c", "\u62dc\u5165\u95e8\u4e0b"]);
    expect(result.events[0]?.choices[1]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(10);
    expect(result.events[0]?.choices[2]?.effects.research).toBe(1);
    expect(result.events[0]?.choices[3]?.effects.writingBonus).toBe(5);
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-2);
  });

  it("builds the real event 12 choices with favor and teacher-child branching", () => {
    const initial = createInitialState();
    const baseState = {
      ...initial,
      phase: "playing" as const,
      selectedRoleId: "teacher-child" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      player: { ...initial.player, favor: 5 },
      availableRandomEvents: [12],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("署名风波");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["向导师诉苦", "转移到别人", "据理力争", "极端施压"]);
    expect(result.events[0]?.choices[0]?.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(-5);
    expect(result.events[0]?.choices[1]?.effects.social).toBe(-2);
    expect(result.events[0]?.choices[1]?.effects.score).toBe(1);
    expect(result.events[0]?.choices[1]?.effects.grantedPublication).toEqual({ target: "C", acceptedScore: 15 });
    expect(result.events[0]?.choices[2]?.effects.san).toBe(-2);
    expect(result.events[0]?.choices[3]?.effects.money).toBe(2);
    expect(result.events[0]?.choices[3]?.effects.favor).toBe(-2);
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
    const talkResult = collectRandomEventsForMonth(talkState, 0, fromRolls([0.7, 0]));
    expect(talkResult.events[0]?.choices[2]?.effects.san).toBe(-7);

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
    const meetingResult = collectRandomEventsForMonth(meetingState, 0, fromRolls([0.7, 0, 0, 0]));
    expect(meetingResult.events[0]?.choices[1]?.effects.san).toBe(-4);

    const authorshipState = {
      ...initial,
      phase: "playing" as const,
      selectedRoleId: "teacher-child" as const,
      year: 2,
      month: 10,
      totalMonths: 22,
      player: { ...initial.player, favor: 5 },
      availableRandomEvents: [12],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const authorshipResult = collectRandomEventsForMonth(authorshipState, 0, fromRolls([0.7, 0]));
    expect(authorshipResult.events[0]?.choices[2]?.effects.san).toBe(-3);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0.8, 0.8]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("服务器宕机");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["催导师修", "举报挖矿", "自己重装", "淘宝找人"]);
    expect(result.events[0]?.choices[0]?.effects.experimentBonus).toBe(-2);
    expect(result.events[0]?.choices[1]?.effects.social).toBe(-2);
    expect(result.events[0]?.choices[2]?.effects.san).toBe(-3);
    expect(result.events[0]?.choices[2]?.effects.social).toBe(-1);
    expect(result.events[0]?.choices[2]?.effects.temporaryActionEffectUpdates?.experiment?.multiplier).toBe(0.5);
    expect(result.events[0]?.choices[3]?.effects.money).toBe(-4);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(-2);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("\u6307\u5bfc\u5e08\u5f1f");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["\u7cbe\u529b\u6709\u9650\uff0c\u5a49\u62d2\u62d2\u7edd", "\u77ed\u671f\u5408\u4f5c\uff0c\u5206\u4eabidea", "\u957f\u671f\u5408\u4f5c\uff0c\u5171\u540c\u6210\u957f"]);
    expect(result.events[0]?.choices[1]?.effects.social).toBe(1);
    expect(result.events[0]?.choices[1]?.effects.relationshipAdditions).toEqual(["junior"]);
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-5);
    expect(result.events[0]?.choices[2]?.effects.mentorshipStacks).toBe(1);
    expect(result.events[0]?.choices[2]?.effects.relationshipAdditions).toEqual(["junior"]);
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
      eventSupport: { hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, hasFinanceTalent: false },
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("游戏放松");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["玩泰拉瑞亚", "玩魔塔50层", "玩研究生模拟器", "打王者荣耀"]);
    expect(result.events[0]?.choices[0]?.effects.san).toBe(-3);
    expect(result.events[0]?.choices[1]?.effects.san).toBe(-5);
    expect(result.events[0]?.choices[2]?.effects.san).toBe(2);
    expect(result.events[0]?.choices[3]?.effects.san).toBe(-4);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("数据丢失");
    expect(result.events[0]?.choices.map((choice) => choice.label)).toEqual(["熬夜补数据", "从头再来", "花钱恢复", "伪造数据"]);
    expect(result.events[0]?.choices[0]?.effects.san).toBe(-6);
    expect(result.events[0]?.choices[1]?.effects.clearDraftProgress).toBe(true);
    expect(result.events[0]?.choices[2]?.effects.money).toBe(-6);
    expect(result.events[0]?.choices[3]?.effects.publicationPenaltyMultiplier).toBe(0.5);
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

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toEqual([]);
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.usedRandomEvents).toEqual([16]);
    expect(result.nextState.totalRandomEventCount).toBe(1);
    expect(result.nextState.achievementFlags.narrowEscape).toBe(true);
  });

  it("queues an immunity skeleton when badminton blocks a cold event", () => {
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
      coldWeight: 2,
      badmintonYear: 2,
      totalRandomEventCount: 0,
    };

    const result = collectRandomEventsForMonth(baseState, 0, fromRolls([0.7, 0]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.title).toBe("💪 抵抗感冒");
    expect(result.nextState.availableRandomEvents).toEqual([]);
    expect(result.nextState.usedRandomEvents).toEqual([3]);
    expect(result.nextState.coldWeight).toBe(2);
    expect(result.nextState.totalRandomEventCount).toBe(1);
  });

  it("enqueues random events after fixed events in the monthly pipeline", () => {
    const baseState = {
      ...createInitialState(),
      phase: "playing" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      availableRandomEvents: [1],
      usedRandomEvents: [],
    };

    const result = enqueueMonthlyEventsForMonth(baseState, fromRolls([0.7, 0]));
    expect(result.queuedEvents.map((event) => event.source)).toEqual(["fixed", "random"]);
    expect(result.queuedEvents[0]?.chainId).toBe("teachers-day");
    expect(result.queuedEvents[1]?.title).toBe("毕设辅导");
    expect(result.nextState.eventQueue).toHaveLength(2);
  });

  it("does not enqueue fixed events when blocked or pending decision exists", () => {
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
          preview: "existing blocking event",
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

    const blockedByDecision = enqueueFixedEventsForMonth({
      ...playingState,
      pendingDecision: { kind: "phd-transfer", requiredScore: 2, year: 2 },
    });
    expect(blockedByDecision.queuedEvents).toHaveLength(0);
  });
});
