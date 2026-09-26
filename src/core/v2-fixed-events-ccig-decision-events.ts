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
      ? `凭之前攒下的会务经验，自费能省 ${discount} 金币。`
    : "";
  const advisorHint = state.player.favor >= 6
    ? "你把几场想听的报告圈了出来，越看越想去。报销能办下来，只是要麻烦老师；好在平时的交情在，这点开销未必会让老师介意。"
    : "日程上有好几场你想听的报告。报销能办下来，只是你和老师还不熟，这次让老师承担开销，难免欠下一点人情。";
  const selfPayHint = state.player.favor >= 6
    ? actualCost === 0
      ? "预算算到最后，自费也不用花金币。你一下轻松了，刚才还在盘算的开销终于可以划掉。"
      : `自费要 ${actualCost} 金币。你对着这个数又算了一遍生活费，刚才看报告日程的兴奋里，添了一点心疼。`
    : actualCost === 0
      ? "再核对预算，自费居然也不用花金币。你松了口气，刚才琢磨半天的那句报销申请终于用不上了。"
      : `自费要 ${actualCost} 金币。你在余额和聊天框之间切了两回：钱花出去心疼，申请报销这几个字也真难开口。`;

  return createFixedEvent({
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "年会 ➜ 参会决定",
    description: [
      advisorHint,
      `${selfPayHint}${meetingExperienceHint}`,
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
        outcome: actualCost === 0 ? "会务经验抵扣，本次免费。" : `金币 -${actualCost}。`,
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
      `参会方式定下来后，你订好前往${location}参加 CCIG ${realYear} 的车票和住宿，又核对了一遍日期。`,
      "几位同学在群里约好到时碰面。你把电脑、充电器和证件装进包，拉上拉链后又打开看了一眼——充电器确实带了，这才放心。",
      ...(narrative ? [narrative] : []),
      ...(gearNarrative ? [gearNarrative] : []),
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
