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
    ? "你对着报告日程算了算预算：“老师平时挺支持我，这次问问能不能报销？”"
    : "你对着报告日程算了算预算：“和老师说话还有点拘谨，这次要开口问报销吗？”";
  const selfPayHint = state.player.favor >= 6
    ? actualCost === 0
      ? "“这次参会不用自己花金币，倒是不用再麻烦老师。”"
      : `“自己出 ${actualCost} 金币也行，就是这趟得从生活费里匀了。”`
    : actualCost === 0
      ? "“这次参会不用自己花金币，那就不用开口问老师了。”"
      : `“自己出 ${actualCost} 金币，至少不用为报销来回琢磨了。”`;

  return createFixedEvent({
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "年会 ➜ 参会决定",
    description: [
      advisorHint,
      selfPayHint,
      ...(meetingExperienceHint ? [meetingExperienceHint] : []),
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
      "几位同学在群里约好到时碰面。你把电脑、充电器和证件装进包，又摸了一遍侧袋，生怕落下最常用的东西。",
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
      "你点开日程，找到几场和课题有关的报告，顺手把页面存了下来。难得有机会见见文献里的作者，不过出门前还得把行程和预算算清楚。",
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
