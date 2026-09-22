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
    ? "最近看几行字都累，想好好睡一觉。"
    : state.player.san < 12
      ? "这阵子总按掉闹钟，欠的觉该补补了。"
      : "精神还行，也想睡个不用定闹钟的觉。";
  const socialHint = socialCapped
    ? "熟人已经不少，约出来吃顿饭也好。"
    : state.player.social < 6
      ? "每天两点一线，也想认识些同学。"
      : "参加个活动，换个课题组的人聊聊。";
  const favorHint = favorCapped
    ? "和老师沟通顺畅，组里杂事也能搭把手。"
    : state.player.favor < 6
      ? "跟导师还不太熟，帮忙时能多聊两句。"
      : "组里的材料还要整理，帮老师分担一点也行。";
  const partTimeHint = state.player.money < 3
    ? "只是手头有些紧，找份兼职也挺迫切。"
    : "或者找份兼职，给日常开销多留点余地。";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: [
      "总结写了半页，你的笔慢下来。想调整的事不少，时间却只有这么多。",
      `${sleepHint}${socialHint}`,
      `${favorHint}${partTimeHint}`,
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
        outcome: "抽空参加活动，和同学聊聊。",
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
      `${yearLabel}接近尾声，你翻开月历，准备给这一学年写个总结。组会日期、任务节点和随手记的备忘挤在一起，当时嫌忙，回头看却有些记不清了。`,
      "几页纸翻过去，连某天忘带钥匙都记着，正经的学年总结却还只写了个标题。你重新摆好本子，把笔帽拔下来。",
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
        outcome: "回顾这一年，想想眼下先顾哪一头。",
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
