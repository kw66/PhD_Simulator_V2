import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createCcigActivityEvent } from "../src/core/v2-fixed-events-ccig-activity-events";
import { createCcigAttendResultEvent } from "../src/core/v2-fixed-events-ccig-decision-events";
import { createCcigEvent } from "../src/core/v2-fixed-events-ccig";
import { resolveCcigFixedEvent } from "../src/core/v2-fixed-events-ccig-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import {
  createScholarshipEvent,
  getScholarshipRequirement,
  getScholarshipReward,
} from "../src/core/v2-fixed-events-scholarship";
import {
  createYearSummaryEvent,
  resolveYearSummaryFixedEvent,
} from "../src/core/v2-fixed-events-year-summary";
import { resolveSummerVacationFixedEvent } from "../src/core/v2-fixed-events-summer";
import { resolveWinterVacationFixedEvent } from "../src/core/v2-fixed-events-winter";
import type { GameState } from "../src/core/v2-types";

function playingState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createInitialState(),
    phase: "playing",
    year: 2,
    month: 5,
    totalMonths: 17,
    ...overrides,
  };
}

describe("audited fixed-event rules", () => {
  it("uses uniform scholarship thresholds and the confirmed rewards", () => {
    expect([0, 0.34, 0.67].map((roll) => getScholarshipRequirement(3, () => roll))).toEqual([2, 3, 4]);
    expect([0, 0.25, 0.5, 0.75].map((roll) => getScholarshipRequirement(4, () => roll))).toEqual([5, 6, 7, 8]);
    expect([0, 0.2, 0.4, 0.6, 0.8].map((roll) => getScholarshipRequirement(5, () => roll))).toEqual([8, 9, 10, 11, 12]);
    expect([2, 3, 4, 5].map(getScholarshipReward)).toEqual([6, 6, 9, 9]);
  });

  it("offers scholarship application from an uncertain historical range", () => {
    const event = createScholarshipEvent(playingState({ year: 2, month: 2, totalMonths: 14 }), () => 0);
    expect(event.description).toContain("往年分数线");
    expect(event.description).toContain("具体门槛要等名单公布");
    expect(event.description).toContain("用于获奖的论文不能再次计入");
    expect(event.description).not.toContain("积分页面");
    expect(event.choices.map((choice) => choice.label)).toEqual(["准备材料并申报", "暂不申报"]);
    expect(event.choices[0]?.effects.san).toBe(-2);

    const scoreEvent = event.choices[0]?.effects.enqueueEvents?.[0];
    expect(scoreEvent?.title).toContain("自己估分");
    expect(scoreEvent?.description).toContain("这次能计入 0 分");
  });

  it("resets scholarship accumulation only after an award", () => {
    const firstPaper = createGrantedPublishedPaper(12, 0, { target: "B", acceptedScore: 2 });
    const secondPaper = createGrantedPublishedPaper(24, 1, { target: "B", acceptedScore: 2 });
    const state = playingState({
      year: 3,
      month: 2,
      totalMonths: 26,
      totalResearchScore: 4,
      externalPublications: [firstPaper],
      player: { ...createInitialState().player, san: 10 },
    });
    const application = createScholarshipEvent(state, () => 0);
    const applied = applyChoiceEffectsToState(state, application.choices[0]!).nextState;
    expect(applied.player.san).toBe(8);

    const scoreEvent = application.choices[0]?.effects.enqueueEvents?.[0];
    const resultEvent = scoreEvent?.choices[0]?.effects.enqueueEvents?.[0];
    const claim = resultEvent?.choices[0];
    expect(claim?.effects.scholarshipAward?.scoreBaseline).toBe(4);
    const awarded = applyChoiceEffectsToState(applied, claim!).nextState;
    expect(awarded.scholarshipState).toEqual({
      lastAwardYear: 3,
      scoreBaseline: 4,
      claimedPaperIds: [firstPaper.id],
    });

    const nextApplication = createScholarshipEvent({
      ...awarded,
      year: 4,
      totalResearchScore: 6,
      externalPublications: [firstPaper, secondPaper],
    }, () => 0);
    const nextScoreEvent = nextApplication.choices[0]?.effects.enqueueEvents?.[0];
    expect(nextScoreEvent?.description).toContain("这次能计入 2 分");

    const secondAwardState = applyChoiceEffectsToState({
      ...awarded,
    }, {
      id: "second-scholarship-award",
      label: "收下奖金",
      outcome: "拿到奖学金",
      effects: {
        scholarshipAward: {
          year: 4,
          scoreBaseline: 6,
          paperIds: [secondPaper.id],
        },
      },
    }).nextState;
    expect(secondAwardState.scholarshipState.claimedPaperIds).toEqual([firstPaper.id, secondPaper.id]);

    const thirdApplication = createScholarshipEvent({
      ...secondAwardState,
      year: 5,
      totalResearchScore: 8,
      externalPublications: [firstPaper, secondPaper],
    }, () => 0);
    const thirdScoreEvent = thirdApplication.choices[0]?.effects.enqueueEvents?.[0];
    const thirdResultEvent = thirdScoreEvent?.choices[0]?.effects.enqueueEvents?.[0];
    expect(thirdScoreEvent?.description).toContain("这次能计入 2 分");
    expect(thirdResultEvent?.choices[0]?.effects.scholarshipAward).toBeUndefined();
  });

  it("does not reserve non-first-author papers for scholarship claims", () => {
    const firstAuthor = createGrantedPublishedPaper(12, 0, { target: "B", acceptedScore: 2 });
    const nonFirstAuthor = createGrantedPublishedPaper(12, 1, {
      target: "A",
      acceptedScore: 4,
      nonFirstAuthor: true,
    });
    const event = createScholarshipEvent(playingState({
      year: 2,
      month: 2,
      totalMonths: 14,
      totalResearchScore: 2,
      externalPublications: [firstAuthor, nonFirstAuthor],
    }), () => 0);
    const scoreEvent = event.choices[0]?.effects.enqueueEvents?.[0];
    const resultEvent = scoreEvent?.choices[0]?.effects.enqueueEvents?.[0];
    const award = resultEvent?.choices[0]?.effects.scholarshipAward;
    expect(award?.paperIds).toEqual([firstAuthor.id]);
    expect(award?.paperIds).not.toContain(nonFirstAuthor.id);
  });

  it("uses uniform triplets for winter envelopes and CCIG ideas", () => {
    const state = playingState();
    const rolls = [0, 0.34, 0.67];
    const envelopes = rolls.map((roll) => resolveWinterVacationFixedEvent(
      state,
      { kind: "winter-vacation-rest" },
      (() => {
        const values = [roll, 0.99];
        return () => values.shift() ?? 0.99;
      })(),
    )?.outcome);
    expect(envelopes).toEqual([
      expect.stringContaining("金币 +1"),
      expect.stringContaining("金币 +2"),
      expect.stringContaining("金币 +3"),
    ]);

    const ideas = rolls.map((roll) => resolveCcigFixedEvent(
      state,
      { kind: "ccig-activity-listen" },
      () => roll,
    ).outcome);
    expect(ideas).toEqual([
      expect.stringContaining("+4"),
      expect.stringContaining("+5"),
      expect.stringContaining("+6"),
    ]);
  });

  it("adds a settlement block to fixed vacation and annual numeric results", () => {
    const winter = resolveWinterVacationFixedEvent(
      playingState(),
      { kind: "winter-vacation-rest" },
      () => 0,
    );
    expect(winter?.enqueueEvents?.[0]?.description).toContain("机制结算");
    expect(winter?.enqueueEvents?.[0]?.description).toContain("金币 +1");
    expect(winter?.enqueueEvents?.[0]?.description).toContain("SAN +");

    const summer = resolveSummerVacationFixedEvent(
      playingState({ month: 11 }),
      { kind: "summer-vacation-travel" },
      () => 0,
    );
    expect(summer?.enqueueEvents?.[0]?.description).toContain("机制结算");
    expect(summer?.enqueueEvents?.[0]?.description).toContain("金币 -4");

    const yearSummary = resolveYearSummaryFixedEvent(
      playingState({ month: 11 }),
      { kind: "year-summary-sleep" },
      () => 0,
    );
    expect(yearSummary?.enqueueEvents?.[0]?.description).toContain("机制结算");
    expect(yearSummary?.enqueueEvents?.[0]?.description).toContain("SAN +5");
  });

  it("separates CCIG travel preparation from on-site activity choices", () => {
    const state = playingState();
    const settlementItems = ["导师报销", "导师好感 -1"];
    const confirmation = createCcigAttendResultEvent(state, "advisor", settlementItems);
    const activity = createCcigActivityEvent(state, "advisor", settlementItems);

    expect(confirmation.description).toContain("车票和住宿");
    expect(confirmation.description).not.toContain("签到区");
    expect(confirmation.description).not.toContain("分论坛");
    expect(activity.description).toContain("签到区");
    expect(activity.description).toContain("分论坛");
    expect(activity.title).toBe("年会活动");
    const activityDecision = activity.choices[0]?.effects.enqueueEvents?.[0];
    expect(activityDecision?.description).toContain("导师报销");
    expect(activityDecision?.description).toContain("导师好感 -1");
    expect(activity.chainId).not.toBe(confirmation.chainId);
  });

  it("offers a poster activity for the strongest published first-author A paper", () => {
    const weakerPaper = createGrantedPublishedPaper(17, 0, {
      title: "较早的 A 类论文",
      target: "A",
      acceptedScore: 30,
    });
    const strongerPaper = createGrantedPublishedPaper(17, 1, {
      title: "准备展示的 A 类论文",
      target: "A",
      acceptedScore: 60,
    });
    const coauthorPaper = createGrantedPublishedPaper(17, 2, {
      title: "合作 A 类论文",
      target: "A",
      acceptedScore: 90,
      nonFirstAuthor: true,
    });
    let state: GameState = {
      ...playingState(),
      player: { ...createInitialState().player, san: 10 },
      externalPublications: [weakerPaper, strongerPaper, coauthorPaper],
    };
    const activity = createCcigActivityEvent(state, "advisor", ["导师报销"]);
    const activityDecision = activity.choices[0]?.effects.enqueueEvents?.[0];
    const posterChoice = activityDecision?.choices.find((choice) => choice.label === "海报展示");

    expect(posterChoice?.outcome).toContain("准备展示的 A 类论文");
    state = {
      ...state,
      eventQueue: [createEventQueueItem(activityDecision!, 1)],
    };
    state = dispatchAction(state, "resolve-event", {
      eventId: activityDecision!.id,
      eventChoiceId: posterChoice?.id,
    });

    expect(state.player.san).toBe(10);
    expect(state.externalPublications[1]?.publication?.promotionMultiplier).toBe(1);
    expect(state.eventQueue[0]?.description).toContain("宣传倍率 +50%");

    const resultEvent = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", {
      eventId: resultEvent.id,
      eventChoiceId: resultEvent.choices[0]?.id,
    });

    expect(state.player.san).toBe(8);
    expect(state.externalPublications[0]?.publication?.promotionMultiplier).toBe(1);
    expect(state.externalPublications[1]?.publication?.promotionMultiplier).toBe(1.5);
    expect(state.externalPublications[2]?.publication?.promotionMultiplier).toBe(1);
    expect(state.log.some((entry) => entry.text.includes("海报展示") && entry.text.includes("宣传倍率 +50%"))).toBe(true);
  });

  it("does not show poster activity without an eligible A paper and never gates dinner by money", () => {
    const state = playingState({
      player: { ...createInitialState().player, money: 0 },
      externalPublications: [createGrantedPublishedPaper(17, 0, {
        target: "A",
        acceptedScore: 60,
        nonFirstAuthor: true,
      })],
    });
    const activity = createCcigActivityEvent(state, "self", ["自费参会"]);
    const activityDecision = activity.choices[0]?.effects.enqueueEvents?.[0];
    const dinnerChoice = activityDecision?.choices.find((choice) => choice.label === "请同学吃饭");

    expect(activityDecision?.choices.map((choice) => choice.label)).not.toContain("海报展示");
    expect(dinnerChoice).toBeDefined();
    expect(dinnerChoice?.disabledReason).toBeUndefined();
    const resolution = dinnerChoice?.effects.fixedEventResolution;
    expect(resolution).toBeDefined();
    if (!resolution) return;
    expect(resolveCcigFixedEvent(state, resolution, () => 0.99).nextState.player.money).toBe(0);
  });

  it("keeps one CCIG history record and repeats attendance settlement before activity", () => {
    let state: GameState = {
      ...playingState({ year: 2, month: 9, totalMonths: 21 }),
      player: { ...createInitialState().player, san: 10, money: 10 },
    };
    state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), 1)] };

    const resolveByLabel = (label: string): void => {
      const event = state.eventQueue[0];
      const choice = event?.choices.find((item) => item.label === label);
      expect(choice).toBeDefined();
      state = dispatchAction(state, "resolve-event", { eventId: event?.id, eventChoiceId: choice?.id });
    };

    resolveByLabel("继续");
    resolveByLabel("自费参会");
    expect(state.eventQueue[0]?.description).toContain("金币 -2");
    expect(state.player.money).toBe(10);

    resolveByLabel("安排行程");
    expect(state.eventQueue[0]?.title).toBe("年会活动");
    expect(state.eventQueue[0]?.description).toContain("金币 -2");
    expect(state.player.money).toBe(8);
    expect(state.eventCounters.meetingCount).toBe(1);

    resolveByLabel("继续");
    resolveByLabel("趁机旅游");
    expect(state.eventQueue[0]?.stage).toBe("result");
    expect(state.player.san).toBe(10);
    resolveByLabel("继续");

    expect(state.player.money).toBe(8);
    expect(state.player.san).toBe(15);
    expect(state.eventHistory).toHaveLength(2);
    expect(state.eventHistory[0]?.stages).toHaveLength(3);
    expect(state.eventHistory[1]?.stages).toHaveLength(3);
    expect(state.log.some((entry) => entry.text.includes("自费参会") && entry.text.includes("SAN +5"))).toBe(true);
  });

  it("ends a skipped CCIG branch without creating an activity event", () => {
    let state: GameState = playingState({ year: 2, month: 9, totalMonths: 21 });
    state = { ...state, eventQueue: [createEventQueueItem(createCcigEvent(state), 1)] };

    const resolveByLabel = (label: string): void => {
      const event = state.eventQueue[0];
      const choice = event?.choices.find((item) => item.label === label);
      expect(choice).toBeDefined();
      state = dispatchAction(state, "resolve-event", { eventId: event?.id, eventChoiceId: choice?.id });
    };

    resolveByLabel("继续");
    resolveByLabel("不去参加");
    expect(state.eventQueue[0]?.title).toContain("暂不参会");
    resolveByLabel("继续本月安排");

    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory).toHaveLength(1);
    expect(state.eventHistory[0]?.stages).toHaveLength(3);
    expect(state.eventHistory[0]?.stages.some((stage) => stage.title.includes("行程安排"))).toBe(false);
  });

  it("uses one-point year-summary gains and the part-time-work wording", () => {
    const state = playingState({
      player: { ...createInitialState().player, social: 7, favor: 8, money: 2 },
    });
    const choiceEvent = resolveYearSummaryFixedEvent(state, { kind: "year-summary-open" }, () => 0)?.enqueueEvents?.[0];
    expect(createYearSummaryEvent(state).title).toBe("学年总结");
    expect(choiceEvent?.choices.map((choice) => choice.label)).toContain("兼职打工");
    expect(choiceEvent?.choices.map((choice) => choice.label)).not.toContain("外出实习");

    const socialResult = resolveYearSummaryFixedEvent(state, { kind: "year-summary-social" }, () => 0.99);
    const favorResult = resolveYearSummaryFixedEvent(state, { kind: "year-summary-favor" }, () => 0.99);
    const partTimeResult = resolveYearSummaryFixedEvent(state, { kind: "year-summary-part-time" }, () => 0);
    expect(socialResult?.enqueueEvents?.[0]?.choices[0]?.effects.social).toBe(1);
    expect(favorResult?.enqueueEvents?.[0]?.choices[0]?.effects.favor).toBe(1);
    expect(partTimeResult?.outcome).toContain("兼职攒下一笔钱");
  });

  it("uses the V2 stat scale for year-summary reflection hints", () => {
    const rested = playingState({
      player: { ...createInitialState().player, san: 20, favor: 1 },
    });
    const restedChoice = resolveYearSummaryFixedEvent(rested, { kind: "year-summary-open" }, () => 0)?.enqueueEvents?.[0];
    expect(restedChoice?.description).toContain("虽然精神还行");
    expect(restedChoice?.description).not.toContain("最近真的累坏了");
    expect(restedChoice?.description).toContain("和导师最近有些生疏");

    const exhausted = playingState({
      player: { ...createInitialState().player, san: 5, favor: 6 },
    });
    const exhaustedChoice = resolveYearSummaryFixedEvent(exhausted, { kind: "year-summary-open" }, () => 0)?.enqueueEvents?.[0];
    expect(exhaustedChoice?.description).toContain("最近真的累坏了");
    expect(exhaustedChoice?.description).toContain("组里的事多承担一点");
  });
});
