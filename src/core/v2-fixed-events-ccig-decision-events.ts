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
  const advisorHint = state.player.favor >= 6
    ? "“和导师关系不错，让他报销应该没问题吧……”"
    : "“让导师报销的话……他会不会不太高兴？毕竟最近好像没什么成果……”";
  const selfPayHint = state.player.favor >= 6
    ? "“自己掏钱的话有点肉疼，但也不用欠人情……”"
    : "“自己掏钱比较省心，不用看导师脸色……”";
  const fullGearHint = hasFullGear
    ? `整装待发生效：自费路径本次减免 ${discount} 金钱，实际只需 ${actualCost} 金钱。`
    : "当前没有触发整装待发减免。";

  return createFixedEvent({
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 参会决定",
    description: `导师把 CCIG ${realYear} 的通知转进群里，会址是 ${location}。你把参会方案拆开来看，发现本质上是三种代价模型：不去最省资源，但会直接错过线下窗口；导师报销现金压力最低，却要消耗关系资本；自费最干净，也最直接地消耗预算。${advisorHint}${selfPayHint}${fullGearHint}`,
    preview: `CCIG ${realYear} · ${location}，决定是否参加`,
    chainId: "ccig-decision",
    stage: "act2",
    choices: [
      {
        id: `ccig-skip-y${state.year}-m${state.month}`,
        label: "不去参加",
        outcome: "你决定把这次窗口让给更可控的本地节奏。",
        effects: {
          fixedEventResolution: { kind: "ccig-skip" },
        },
      },
      {
        id: `ccig-advisor-y${state.year}-m${state.month}`,
        label: "请导师报销",
        outcome: "你决定动用一次导师关系额度。",
        effects: {
          fixedEventResolution: { kind: "ccig-advisor" },
        },
      },
      {
        id: actualCost === 0 ? `ccig-self-free-y${state.year}-m${state.month}` : `ccig-self-y${state.year}-m${state.month}`,
        label: actualCost === 0 ? "自费参会（本次免费）" : `自费参会（${actualCost} 金钱）`,
        outcome: "你决定自己承担这次出行成本。",
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
    description: `你最终决定参加 CCIG ${realYear}，按计划抵达 ${location}。路上你反复翻看议程，把和课题最相关的报告、海报和交流时段都提前标记出来。签到后胸牌、手册、会场地图一起塞满背包，你能感到“出发决策”已经完成，而“收益决策”才刚开始。${costText}`,
    preview: `CCIG ${realYear} · ${location}，准备进入会场`,
    chainId: "ccig-decision",
    stage: "act3",
    choices: [
      {
        id: `ccig-enter-venue-y${state.year}-m${state.month}-${mode}`,
        label: "进入会场安排",
        outcome: "你准备正式进入会场活动。",
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
    description: `你最终决定不去 ${location} 的 CCIG ${realYear}，把这次窗口主动让给了更可控的本地节奏。原本用于出行的时间被你切回实验、文献与代码整理，计划先把手头课题做到更扎实。这个决定更稳，但你也明确接受了它的机会成本。`,
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
    description: `导师把 CCIG ${realYear} 的通知转进群里，会址是 ${location}。消息一出来，组里立刻热闹起来，有人开始订票，有人已经在翻分论坛名单。这类会议的价值从来不止一场报告：主旨演讲、企业展台、同行交流、临时约谈，很多关键机会都藏在议程之外。`,
    preview: `CCIG ${realYear} · ${location}，是否参加？`,
    chainId: "ccig-decision",
    choices: [
      {
        id: `ccig-open-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "你准备先做第一个决定：去，还是不去。",
        effects: {
          fixedEventResolution: { kind: "ccig-open" },
        },
      },
    ],
  });
}
