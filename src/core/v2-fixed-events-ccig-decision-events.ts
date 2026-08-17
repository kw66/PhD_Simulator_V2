import { createFixedEvent } from "./v2-fixed-events-shared";
import {
  getCcigLocation,
  getCcigRealYear,
  getCcigSelfPayCost,
  type CcigParticipationMode,
} from "./v2-fixed-events-ccig-shared";
import { createCcigActivityAct1Event } from "./v2-fixed-events-ccig-activity-events";
import type { GameState, PendingEvent } from "./v2-types";

export function createCcigDecisionEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const { hasFullGear, discount, actualCost } = getCcigSelfPayCost(state);
  const fullGearHint = hasFullGear
    ? `整装待发减免 ${discount}，自费需 ${actualCost} 金钱。`
    : "";

  return createFixedEvent({
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 参会决定",
    description: `CCIG ${realYear} 在${location}。机会难得，出行也要成本。${fullGearHint}怎么安排？`,
    preview: `CCIG ${realYear} · ${location}，决定是否参加`,
    chainId: "ccig-decision",
    stage: "act2",
    choices: [
      {
        id: `ccig-skip-y${state.year}-m${state.month}`,
        label: "不去参加",
        outcome: "本次不参会。",
        effects: {
          fixedEventResolution: { kind: "ccig-skip" },
        },
      },
      {
        id: `ccig-advisor-y${state.year}-m${state.month}`,
        label: "请导师报销",
        outcome: "申请导师报销。",
        effects: {
          fixedEventResolution: { kind: "ccig-advisor" },
        },
      },
      {
        id: actualCost === 0 ? `ccig-self-free-y${state.year}-m${state.month}` : `ccig-self-y${state.year}-m${state.month}`,
        label: actualCost === 0 ? "自费参会（本次免费）" : `自费参会（${actualCost} 金钱）`,
        outcome: actualCost === 0 ? "装备减免生效，本次免费。" : `金钱 -${actualCost}。`,
        effects: {
          fixedEventResolution: { kind: "ccig-self" },
        },
      },
    ],
  });
}

export function createCcigAttendResultEvent(
  state: GameState,
  mode: Exclude<CcigParticipationMode, "skip">,
  actualCost: number,
): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const { hasFullGear } = getCcigSelfPayCost(state);
  const costText = mode === "advisor"
    ? "关系成本已结算：导师好感 -1。"
    : hasFullGear
      ? actualCost === 0
        ? "出行花费：免费（整装待发减免生效）。"
        : `出行花费：金钱 -${actualCost}（整装待发减免生效）。`
      : `出行花费：金钱 -${actualCost}。`;

  return createFixedEvent({
    id: `ccig-attend-result-y${state.year}-m${state.month}-${mode}`,
    title: "领域年会 ➜ 参会决定 ➜ 参会确认",
    description: `抵达${location}，准备参会。${costText}`,
    preview: `CCIG ${realYear} · ${location}，准备进入会场`,
    chainId: "ccig-decision",
    stage: "act3",
    choices: [
      {
        id: `ccig-enter-venue-y${state.year}-m${state.month}-${mode}`,
        label: "进入会场安排",
        outcome: "进入会场。",
        effects: {
          enqueueEvents: [createCcigActivityAct1Event(state)],
        },
      },
    ],
  });
}

export function createCcigSkipResultEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createFixedEvent({
    id: `ccig-skip-result-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 参会决定 ➜ 暂不参会",
    description: `没有参会。时间留给手头的课题。`,
    preview: `CCIG ${realYear} · ${location}，本次不参会`,
    chainId: "ccig-decision",
    stage: "act3",
    choices: [
      {
        id: `ccig-skip-finish-y${state.year}-m${state.month}`,
        label: "继续本月安排",
        outcome: "本次无直接数值变化。",
        effects: {},
      },
    ],
  });
}

export function createCcigEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createFixedEvent({
    id: `ccig-y${state.year}-m${state.month}`,
    title: "领域年会",
    description: `导师转来 CCIG ${realYear} 通知，会址${location}。你想出去看看，又有些舍不得时间和钱。`,
    preview: `CCIG ${realYear} · ${location}，是否参加？`,
    chainId: "ccig-decision",
    choices: [
      {
        id: `ccig-open-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "选择是否参会。",
        effects: {
          fixedEventResolution: { kind: "ccig-open" },
        },
      },
    ],
  });
}
