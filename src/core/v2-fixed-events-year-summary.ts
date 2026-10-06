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
    ? "翻到“休养生息”，眼前的字又有点发花，才想起这一年难得睡饱的那几个周末。"
    : state.player.san < 12
      ? "“休养生息”旁记着几次睡到自然醒的周末。你打个哈欠，那几天可真舒服。"
      : "看着“休养生息”，你想起那些按时关电脑的晚上。这一年倒没把精神熬垮。";
  const socialHint = socialCapped
    ? "“广交朋友”旁挤满了名字，几张活动票根都快夹不住了。"
    : state.player.social < 6
      ? "“广交朋友”下面只记了几个名字，好在不再每顿饭都一个人吃。"
      : "“广交朋友”旁夹着活动票根，那天从研究方向聊到各自家乡，散场了还舍不得走。";
  const favorHint = favorCapped
    ? "“取得导师信任”这一项，你想起老师那句“交给你我放心”，笔尖停了停。"
    : state.player.favor < 6
      ? "“取得导师信任”旁记着几件替老师办的小事。见老师居然还是这么拘谨，不过总算不只会回“收到”了。"
      : "“取得导师信任”让你想起几次替老师分担杂事的下午。如今老师有事，也渐渐愿意交给你办。";
  const partTimeHint = state.player.money < 3
    ? "“兼职挣钱”旁记着几笔报酬，钱早花了，到账时的高兴还记得。"
    : "“兼职挣钱”旁记着几笔报酬，数额不大，却实实在在替你付过几顿饭钱。";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年初的目标",
    description: [
      `${sleepHint}${socialHint}`,
      `${favorHint}${partTimeHint}`,
    ].join("\n\n"),
    chainId: "year-summary",
    stage: "act2",
    choices: [
      {
        id: `year-summary-sleep-y${state.year}-m${state.month}`,
        label: "休养生息",
        outcome: "回想这一年留给自己的休息时间。",
        effects: {
          fixedEventResolution: { kind: "year-summary-sleep" },
        },
      },
      {
        id: `year-summary-social-y${state.year}-m${state.month}`,
        label: "广交朋友",
        outcome: "回想这一年结识的朋友。",
        effects: {
          fixedEventResolution: { kind: "year-summary-social" },
        },
      },
      {
        id: `year-summary-favor-y${state.year}-m${state.month}`,
        label: "取得导师信任",
        outcome: "回想这一年替导师分担的事。",
        effects: {
          fixedEventResolution: { kind: "year-summary-favor" },
        },
      },
      {
        id: `year-summary-part-time-y${state.year}-m${state.month}`,
        label: "兼职挣钱",
        outcome: "回想这一年靠兼职挣来的钱。",
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
      `${yearLabel}接近尾声，你把桌上的日历翻回学年初。第一页还写着当时给自己定下的目标：休养生息、广交朋友、取得导师信任、兼职挣钱。字写得很用力，仿佛写下来就已经完成了一半。`,
      "往后翻，组会、截稿和随手记的备忘挤满了格子，连某天忘带钥匙都记着。你拿起笔，对照这一年的经历，准备把完成的目标一项项划掉。",
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
        outcome: "翻看日历，回顾年初定下的目标。",
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
