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
    ? "写着写着，眼前的字又有点发花。现在最想补上的，其实是一场好觉。"
    : state.player.san < 12
      ? "你打了个哈欠，想起这阵子每天都要按掉好几遍闹钟。连补觉都还欠着，难怪写总结也提不起劲。"
      : "这一年倒没把精神熬垮。可想到不用定闹钟、醒了也不急着出门，还是很向往。";
  const socialHint = socialCapped
    ? "往前翻几页，聚餐时记下的几个笑话又让你乐了，那帮人该再约一次。"
    : state.player.social < 6
      ? "再看月历，除了实验室就是宿舍。你停了一下，这一年居然没认识几个新朋友。"
      : "月历上夹着一张活动票根，那天聊得很开心。最近一忙起来，又只剩下同组的几张脸了。";
  const favorHint = favorCapped
    ? "组里的事情已经很熟，老师交代起事来也放心。你想到还有一摞材料没整理，顺手把它记在页边。"
    : state.player.favor < 6
      ? "写到导师时，你发现自己连平时该聊些什么都答不上来。一年过去，见老师居然还是这么拘谨。"
      : "组里那摞待整理的材料也浮上心头。平时老师没少操心，你也想把手边的事接过来一些。";
  const partTimeHint = state.player.money < 3
    ? "手机上的余额提醒又亮了。你叹口气，在旁边补上“找份兼职”，这件事实在拖不下去了。"
    : "写到开销，你又添了一行“找份兼职”。手头多攒点钱，花起来心里也踏实。";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: [
      "总结写了半页，你发现自己一直在写“忙”。可忙了一整年，有几件惦记的事还是没顾上。",
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
