import { createFixedEvent } from "./v2-fixed-events-shared";
import {
  getCcigChainId,
  getCcigLocation,
  getCcigRealYear,
  getCcigSelfPayCost,
  type CcigParticipationMode,
} from "./v2-fixed-events-ccig-shared";
import { createCcigActivityEvent } from "./v2-fixed-events-ccig-activity-events";
import type { GameState, PendingEvent } from "./v2-types";

export function createCcigDecisionEvent(state: GameState): PendingEvent {
  const { actualCost } = getCcigSelfPayCost(state);
  const advisorHint = state.player.favor >= 6
    ? "你圈出想听的报告，越看越想去。报销能办，只是得麻烦老师；好在平时有交情，这点开销老师未必介意。"
    : "日程上好几场报告都想听。报销能办，但你和老师还不熟，让老师承担开销，难免欠点人情。";
  const selfPayHint = state.player.favor >= 6
    ? `自费要 ${actualCost} 金币。你又算了一遍生活费，看报告日程的兴奋里，添了一点心疼。`
    : `自费要 ${actualCost} 金币。你在余额和聊天框间切了两回：花钱心疼，报销也真难开口。`;

  const event = createFixedEvent({
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "年会 ➜ 参会决定",
    description: [
      advisorHint,
      `${selfPayHint}年会固定收取注册费 1 金币、差旅费 1 金币，与论文篇数无关；导师报销则扣除实验室经费 ${actualCost} 金币。`,
    ].join("\n\n"),
    chainId: getCcigChainId(state),
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
        disabledReason: state.advisorProgressState.funding < actualCost ? `实验室经费不足，需要 ${actualCost} 金币。` : undefined,
        effects: {
          fixedEventResolution: { kind: "ccig-advisor" },
        },
      },
      {
        id: `ccig-self-y${state.year}-m${state.month}`,
        label: "自费参会",
        outcome: `金币 -${actualCost}。`,
        effects: {
          fixedEventResolution: { kind: "ccig-self" },
        },
      },
    ],
  });
  return { ...event, fixedResultPreview: { resolution: { kind: "ccig-open" }, rolls: [] } };
}

export function createCcigAttendResultEvent(
  state: GameState,
  mode: Exclude<CcigParticipationMode, "skip">,
  settlementItems: string[],
  narrative = "",
  deferredEffects: PendingEvent["choices"][number]["effects"] = {},
): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const { actualCost } = getCcigSelfPayCost(state);
  const currentDomesticCount = state.eventCounters.domesticMeetingCount ?? 0;
  const meetingGrowth = `国内参会 ${currentDomesticCount}→${currentDomesticCount + 1}次`;

  return createFixedEvent({
    id: `ccig-attend-result-y${state.year}-m${state.month}-${mode}`,
    title: "年会 ➜ 参会决定 ➜ 参会确认",
    description: [
      `你订好去${location}参加 CCIG ${realYear} 的车票和住宿，又核对了一遍日期。`,
      `和同学约好碰面后，你把电脑、充电器和证件装进包，拉上拉链又打开——充电器带了，这才放心。${narrative}`,
      "机制结算",
      "注册费 1 金币，差旅费 1 金币，与论文篇数无关。",
      ...settlementItems.slice(1).map((item) => `结果：${item}`),
      meetingGrowth,
    ].join("\n\n"),
    chainId: getCcigChainId(state),
    stage: "act3",
    completionLog: `${settlementItems.join("，")}；${meetingGrowth}；年会参会已确认`,
    choices: [
      {
        id: `ccig-enter-venue-y${state.year}-m${state.month}-${mode}`,
        label: "安排行程",
        outcome: "进入行程安排。",
        disabledReason: mode === "advisor" && state.advisorProgressState.funding < actualCost ? `实验室经费不足，需要 ${actualCost} 金币。` : undefined,
        effects: {
          ...deferredEffects,
          counterDeltas: {
            ...(deferredEffects.counterDeltas ?? {}),
            meetingCount: 1,
            domesticMeetingCount: 1,
          },
          enqueueEvents: [createCcigActivityEvent(state, mode, settlementItems)],
        },
      },
      ...(mode === "advisor" && state.advisorProgressState.funding < actualCost ? [{
        id: `ccig-change-payment-y${state.year}-m${state.month}`,
        label: "重新选择或取消参会",
        outcome: "实验室经费不足，重新选择自费或取消参会。",
        effects: { fixedEventResolution: { kind: "ccig-open" as const } },
      }] : []),
    ],
  });
}

export function createCcigSkipResultEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createFixedEvent({
    id: `ccig-skip-result-y${state.year}-m${state.month}`,
    title: "年会 ➜ 参会决定 ➜ 暂不参会",
    description: [
      `你决定不去${location}参加 CCIG ${realYear}，把会务通知暂时放到一边。`,
      "同学在群里聊起行程，你看了一会儿，还是打开了没读完的文献。错过现场交流有点可惜，但这趟就不折腾了。",
    ].join("\n\n"),
    chainId: getCcigChainId(state),
    stage: "act3",
    completionLog: "本次未参会，继续原来的安排",
    choices: [
      {
        id: `ccig-skip-finish-y${state.year}-m${state.month}`,
        label: "继续本月安排",
        outcome: "继续原来的安排。",
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
    title: "年会",
    description: [
      `导师把 CCIG ${realYear} 的通知转进群里，会址在${location}。有人翻分论坛名单，也有人开始查车票。`,
      "你点开日程，几位常在参考文献里见到的作者都在。群里很快又多了一份当地美食清单，下载的人一点不比报告日程少。",
    ].join("\n\n"),
    chainId: getCcigChainId(state),
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
