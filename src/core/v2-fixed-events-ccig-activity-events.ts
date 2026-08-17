import { createFixedEvent } from "./v2-fixed-events-shared";
import {
  getCcigLocation,
  getCcigRealYear,
  getCcigSelfPayCost,
  type CcigActivityMode,
  type CcigParticipationMode,
} from "./v2-fixed-events-ccig-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createCcigActivityAct1Event(
  state: GameState,
  participationMode: Exclude<CcigParticipationMode, "skip">,
  actualCost: number,
): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createFixedEvent({
    id: `ccig-activity-act1-y${state.year}-m${state.month}`,
    title: "领域年会会场活动",
    description: [
      `你进入 CCIG ${realYear} 主会场，签到区和海报区都很拥挤，信息量几乎在第一分钟就把人淹没。`,
      `${location}的会场节奏很快，同一时间有多条分会并行进行，任何一个时段的选择都意味着对其他机会的主动放弃。`,
      "你不可能把所有内容都吃下，只能围绕自己当前课题与近期目标做取舍。",
      "今天真正要定下来的，是你的资源分配策略。",
    ].join("\n\n"),
    preview: `CCIG ${realYear} · ${location} 会场安排`,
    chainId: "ccig-activity",
    choices: [
      {
        id: `ccig-activity-open-y${state.year}-m${state.month}`,
        label: "规划当天行程",
        outcome: "选择会场安排。",
        effects: {
          enqueueEvents: [createCcigActivityDecisionEvent(state, participationMode, actualCost)],
        },
      },
    ],
  });
}

function createCcigActivityDecisionEvent(
  state: GameState,
  participationMode: Exclude<CcigParticipationMode, "skip">,
  paidCost: number,
): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const { hasFullGear } = getCcigSelfPayCost(state);
  const arrivalText = participationMode === "advisor"
    ? `导师同意了报销，你顺利来到了${location}。`
    : `你自掏腰包买了车票，独自来到了${location}。${hasFullGear && paidCost === 0 ? "整装待发让本次出行免费。" : ""}`;

  return createFixedEvent({
    id: `ccig-activity-act2-y${state.year}-m${state.month}`,
    title: "领域年会会场活动 ➜ 参会选择",
    description: [
      arrivalText,
      "会场日程被塞得很满，你不可能全都参加，只能抓最关键的一段收益。",
      "认真听报告更偏向学术积累，短期会更疲惫，但后续课题收益通常更高；趁机旅游更偏向状态恢复，能快速回血，但学术收益相对有限；请同学吃饭属于关系经营，需要预算投入，通常换来更稳的协作氛围。",
      "你盯着手里的议程表，明白今天不是“把每件事都做一点”，而是“选一条主线做深”。",
    ].join("\n\n"),
    preview: `CCIG ${realYear} · ${location}，会场主线抉择`,
    chainId: "ccig-activity",
    stage: "act2",
    choices: [
      {
        id: `ccig-activity-listen-y${state.year}-m${state.month}`,
        label: "认真听报告",
        outcome: "认真听报告。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-listen" },
        },
      },
      {
        id: `ccig-activity-travel-y${state.year}-m${state.month}`,
        label: "趁机旅游",
        outcome: "抽空逛城市。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-travel" },
        },
      },
      {
        id: `ccig-activity-food-y${state.year}-m${state.month}`,
        label: "请同学吃饭",
        outcome: "请同学吃饭。",
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
