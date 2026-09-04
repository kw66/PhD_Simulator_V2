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
  const { hasMeetingExperience, discount, actualCost } = getCcigSelfPayCost(state);
  const meetingExperienceHint = hasMeetingExperience
      ? `会务经验生效：自费参会可减免 ${discount} 金币。`
    : "";
  const advisorHint = state.player.favor >= 6
    ? "“和导师关系不错，让他报销应该没问题吧……”"
    : "“让导师报销的话……他会不会不太高兴？毕竟最近好像没什么成果……”";
  const selfPayHint = state.player.favor >= 6
    ? actualCost === 0
      ? "“会务经验已经帮我省下一笔，这次自费不用花金币，也不用欠人情……”"
      : `“自己掏钱的话有点肉疼，要花 ${actualCost} 金币，但也不用欠人情……”`
    : actualCost === 0
      ? "“会务经验帮我省下了费用，这次自费不用花金币，至少不用看导师脸色……”"
      : `“自己掏钱比较省心，需要 ${actualCost} 金币，不用看导师脸色……”`;

  return createFixedEvent({
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "年会 ➜ 参会决定",
    description: [
      "报告名单里有几场正好和你的方向相关，错过有点可惜。",
      advisorHint,
      selfPayHint,
      ...(meetingExperienceHint ? [meetingExperienceHint] : []),
      "你把日程和预算对了几遍，还是得决定这趟值不值得去。",
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
        effects: {
          fixedEventResolution: { kind: "ccig-advisor" },
        },
      },
      {
        id: actualCost === 0 ? `ccig-self-free-y${state.year}-m${state.month}` : `ccig-self-y${state.year}-m${state.month}`,
        label: "自费参会",
        outcome: actualCost === 0 ? "装备减免生效，本次免费。" : `金币 -${actualCost}。`,
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
  settlementItems: string[],
  narrative = "",
  deferredEffects: PendingEvent["choices"][number]["effects"] = {},
): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const { hasMeetingExperience, actualCost } = getCcigSelfPayCost(state);
  const gearNarrative = mode === "self" && hasMeetingExperience
    ? actualCost === 0
      ? "会务经验帮你免掉了这次参会费用。"
      : "会务经验替你分担了一部分参会费用。"
    : "";

  return createFixedEvent({
    id: `ccig-attend-result-y${state.year}-m${state.month}-${mode}`,
    title: "年会 ➜ 参会决定 ➜ 参会确认",
    description: [
      `参会方式定下来后，你订好前往${location}参加 CCIG ${realYear} 的车票和住宿。`,
      "群里几位同行约你到了以后碰面，你也把电脑、充电器和换洗衣物塞进行李箱。",
      ...(narrative ? [narrative] : []),
      ...(gearNarrative ? [gearNarrative] : []),
      "出发前的事情都准备好了，接下来就等会期开始。",
      "机制结算",
      ...settlementItems,
    ].join("\n\n"),
    chainId: getCcigChainId(state),
    stage: "act3",
    completionLog: `${settlementItems.join("，")}；年会参会已确认`,
    choices: [
      {
        id: `ccig-enter-venue-y${state.year}-m${state.month}-${mode}`,
        label: "安排行程",
        outcome: "进入行程安排。",
        effects: {
          ...deferredEffects,
          counterDeltas: { ...(deferredEffects.counterDeltas ?? {}), meetingCount: 1 },
          enqueueEvents: [createCcigActivityEvent(state, mode, settlementItems)],
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
    title: "年会 ➜ 参会决定 ➜ 暂不参会",
    description: [
      `你最终决定不去${location}参加 CCIG ${realYear}。`,
      "省下来的时间继续做实验、看文献和整理代码。",
      "路费和来回奔波都省了，现场报告和交流也只能错过。",
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
      `导师把 CCIG ${realYear} 的通知转进群里，会址是${location}。消息一出来，组里立刻热闹起来，有人开始订票，有人已经在翻分论坛名单。`,
      "除了报告和海报，现场还能见到不少同行，也有人准备顺便逛企业展台。",
      "去一趟要花时间和钱，请导师报销的话也得开口。",
      "你准备先做第一个决定：去，还是不去。",
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
