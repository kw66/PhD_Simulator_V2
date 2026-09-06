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
    ? "“最近真的累坏了，得先缓缓。”"
    : state.player.san < 12
      ? "“有点疲惫，想把欠的觉补上。”"
      : "“虽然精神还行，也想歇一歇。”";
  const socialHint = socialCapped
    ? "“熟人不少，先顾好已有来往。”"
    : state.player.social < 6
      ? "“平时来往不多，想认识些同学。”"
      : "“多参加活动，换个话题聊聊。”";
  const favorHint = favorCapped
    ? "“和老师沟通顺畅，保持就好。”"
    : state.player.favor < 6
      ? "“和导师最近有些生疏，找机会聊聊。”"
      : "“组里的事多承担一点，搭把手。”";
  const partTimeHint = state.player.money < 3
    ? "“手头有点紧，得找份兼职。”"
    : "“找份兼职，再攒点钱备用。”";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: [
      "翻过这一年的记录，你发现几件事总惦记着。趁这阵子有空，你想先顾哪一头？",
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
      "你把最近的日常也列在旁边：哪些事做着顺手，哪些一直让你头疼？趁这个空档，挑一件先调整看看。",
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
