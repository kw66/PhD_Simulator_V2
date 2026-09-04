import {
  createFixedEvent,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import {
  getYearSummaryLabel,
  resolveYearSummaryChoice,
} from "./v2-fixed-events-year-summary-helpers";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

function createYearSummaryChoiceEvent(state: GameState): PendingEvent {
  const socialCapped = state.player.social >= 20;
  const favorCapped = state.player.favor >= 20;
  const sleepHint = state.player.san < 6
    ? "“最近真的累坏了，再不休息感觉要撑不住了……”"
    : state.player.san < 12
      ? "“有点疲惫，好好休息一下也不错”"
      : "“虽然精神还行，但躺平也挺舒服的……”";
  const socialHint = socialCapped
    ? "“已经认识不少人了，先把现在的关系维护好。”"
    : state.player.social < 6
      ? "“除了组里几位同门，我几乎没认识什么人。”"
      : "“下学年可以多参加几次活动，认识些不同方向的同学。”";
  const favorHint = favorCapped
    ? "“和导师的沟通已经很顺畅，保持现在这样就好。”"
    : state.player.favor < 6
      ? "“和导师最近有些生疏，下学年得把沟通补回来。”"
      : "“组里的事多承担一点，沟通也许会更顺。”";
  const partTimeHint = state.player.money < 3
    ? "“手头有点紧，得想办法赚点钱……”"
    : "“找份兼职攒点钱，以后用得上”";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: [
      "你把这一年的月历、论文记录和账单都翻了出来。",
      "有些问题只是偶尔碰到，有些却几乎每个月都在重复。下学年能多分出来的时间有限，最好先改最影响自己的那一项。",
      sleepHint,
      socialHint,
      favorHint,
      partTimeHint,
      "你拿起笔，在四个方向里圈下一个。",
    ].join("\n\n"),
    chainId: "year-summary",
    stage: "act2",
    choices: [
      {
        id: `year-summary-sleep-y${state.year}-m${state.month}`,
        label: "休息调整",
        outcome: "先把状态养回来。",
        effects: {
          fixedEventResolution: { kind: "year-summary-sleep" },
        },
      },
      {
        id: `year-summary-social-y${state.year}-m${state.month}`,
        label: "经营社交",
        outcome: "多认识些人，也多做些合作。",
        effects: {
          fixedEventResolution: { kind: "year-summary-social" },
        },
      },
      {
        id: `year-summary-favor-y${state.year}-m${state.month}`,
        label: "服务导师",
        outcome: "多承担些组里的事。",
        effects: {
          fixedEventResolution: { kind: "year-summary-favor" },
        },
      },
      {
        id: `year-summary-part-time-y${state.year}-m${state.month}`,
        label: "兼职打工",
        outcome: "做份兼职，顺便攒点钱。",
        effects: {
          fixedEventResolution: { kind: "year-summary-part-time" },
        },
      },
    ],
  });
}

export function createYearSummaryEvent(state: GameState): PendingEvent {
  const yearLabel = getYearSummaryLabel(state.year);
  return createFixedEvent({
    id: `year-summary-y${state.year}-m${state.month}`,
    title: "学年总结",
    description: [
      `${yearLabel}接近尾声，你在月历上划掉了最后几项节点。`,
      "这一年里，有些实验顺利跑完，有些问题拖到现在也没有答案；组会、投稿和临时任务也填满了不少晚上。",
      "趁新学年还没开始，你准备回头看一遍：接下来最该先调整什么？",
    ].join("\n\n"),
    chainId: "year-summary",
    choices: [
      {
        id: `year-summary-open-y${state.year}-m${state.month}`,
        label: "回顾这一学年",
        outcome: "回顾这一学年。",
        effects: {
          fixedEventResolution: { kind: "year-summary-open" },
        },
      },
    ],
  });
}

export function resolveYearSummaryFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult | null {
  switch (resolution.kind) {
    case "year-summary-open":
      return {
        nextState: state,
        outcome: "想想下一年更该顾哪一头。",
        enqueueEvents: [createYearSummaryChoiceEvent(state)],
      };
    case "year-summary-sleep":
      return resolveYearSummaryChoice(state, "year-summary-sleep", getRoll);
    case "year-summary-social": {
      return resolveYearSummaryChoice(state, "year-summary-social", getRoll);
    }
    case "year-summary-favor": {
      return resolveYearSummaryChoice(state, "year-summary-favor", getRoll);
    }
    case "year-summary-part-time": {
      return resolveYearSummaryChoice(state, "year-summary-part-time", getRoll);
    }
    default:
      return null;
  }
}
