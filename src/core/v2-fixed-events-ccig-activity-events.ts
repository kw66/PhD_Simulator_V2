import { createFixedEvent } from "./v2-fixed-events-shared";
import {
  getCcigLocation,
  getCcigRealYear,
  getCcigSelfPayCost,
  type CcigActivityMode,
} from "./v2-fixed-events-ccig-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createCcigActivityAct1Event(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createFixedEvent({
    id: `ccig-activity-act1-y${state.year}-m${state.month}`,
    title: "领域年会会场活动",
    description: `你进入 CCIG ${realYear} 主会场，签到区和海报区都很拥挤，信息量几乎在第一分钟就把人淹没。${location} 的会场节奏很快，同一时间有多条分会并行进行，任何一个时段的选择都意味着对其他机会的主动放弃。你不可能把所有内容都吃下，只能围绕自己当前课题与近期目标做取舍。`,
    preview: `CCIG ${realYear} · ${location} 会场安排`,
    chainId: "ccig-activity",
    choices: [
      {
        id: `ccig-activity-open-y${state.year}-m${state.month}`,
        label: "规划当天行程",
        outcome: "你准备先定下今天的主线。",
        effects: {
          enqueueEvents: [createCcigActivityDecisionEvent(state)],
        },
      },
    ],
  });
}

function createCcigActivityDecisionEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const { hasFullGear, actualCost } = getCcigSelfPayCost(state);
  const arrivalText = state.player.favor < 0
    ? `你勉强来到 ${location}，但关系代价已经把这次出行推到危险边缘。`
    : state.player.money < 0
      ? `你硬着头皮来到 ${location}，可现金已经被压到了警戒线以下。`
      : state.player.favor >= 0 && state.player.money >= 0
        ? hasFullGear && actualCost === 0
          ? `你几乎零成本地来到 ${location}，整装待发让这次出行轻松了很多。`
          : `你顺利来到了 ${location}，现在真正要决定的是如何把这次参会“用回本”。`
        : `你来到了 ${location}。`;

  return createFixedEvent({
    id: `ccig-activity-act2-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 会场入场 ➜ 参会活动",
    description: `${arrivalText}会场日程被塞得很满，你不可能全都参加，只能抓最关键的一段收益。认真听报告更偏向学术积累；趁机旅游更偏向状态恢复；请同学吃饭属于关系经营，需要预算投入。你明白今天不是“把每件事都做一点”，而是“选一条主线做深”。`,
    preview: `CCIG ${realYear} · ${location}，会场主线抉择`,
    chainId: "ccig-activity",
    stage: "act2",
    choices: [
      {
        id: `ccig-activity-listen-y${state.year}-m${state.month}`,
        label: "认真听报告",
        outcome: "你决定把今天主要押在学术积累上。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-listen" },
        },
      },
      {
        id: `ccig-activity-travel-y${state.year}-m${state.month}`,
        label: "趁机旅游",
        outcome: "你决定把一部分时间留给这座城市本身。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-travel" },
        },
      },
      {
        id: `ccig-activity-food-y${state.year}-m${state.month}`,
        label: "请同学吃饭",
        outcome: "你准备花点预算去经营这一圈更松弛的关系。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-food" },
        },
      },
    ],
  });
}

export function createCcigActivityResultEvent(params: {
  state: GameState;
  mode: CcigActivityMode;
  title: string;
  description: string;
  preview: string;
  outcome: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `ccig-activity-result-y${params.state.year}-m${params.state.month}-${params.mode}`,
    title: params.title,
    description: params.description,
    preview: params.preview,
    chainId: "ccig-activity",
    stage: "act3",
    choices: [
      {
        id: `ccig-activity-finish-y${params.state.year}-m${params.state.month}-${params.mode}`,
        label: "继续",
        outcome: params.outcome,
        effects: params.effects,
      },
    ],
  });
}
