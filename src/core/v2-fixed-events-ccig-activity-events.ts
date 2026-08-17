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
    description: `进入 CCIG ${realYear} 主会场。分会很多，时间不够全听。`,
    preview: `CCIG ${realYear} · ${location} 会场安排`,
    chainId: "ccig-activity",
    choices: [
      {
        id: `ccig-activity-open-y${state.year}-m${state.month}`,
        label: "规划当天行程",
        outcome: "选择会场安排。",
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
    ? "导师关系已经十分紧张。"
    : state.player.money < 0
      ? "你的现金已经见底。"
      : state.player.favor >= 0 && state.player.money >= 0
        ? hasFullGear && actualCost === 0
          ? "整装待发让本次出行免费。"
          : ""
        : "";

  return createFixedEvent({
    id: `ccig-activity-act2-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 会场入场 ➜ 参会活动",
    description: `${arrivalText}难得出来一趟，听报告、逛城市，还是请同学吃饭？`,
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
