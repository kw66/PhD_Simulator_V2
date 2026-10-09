import {
  createCcigFixedEvent,
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
    ? "你和导师平时还算熟，拿着日程去问报销，应该不至于太难开口。老师若同意，差旅就从科研经费里出。"
    : "你和导师还没那么熟，报销消息打到一半，又补上想听的报告，免得看起来只惦记着出去玩。老师若同意，差旅就从科研经费里出。";
  const selfPayHint = state.player.favor >= 6
    ? "自己出钱也行，只是算过生活费，又有些心疼。"
    : "你在余额和聊天框间切了两回：花钱心疼，报销也真难开口。";

  const event = createCcigFixedEvent(state, {
    id: `ccig-decision-act2-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 参会决定",
    description: [
      `你核对通知：VALSE 不收注册费，这趟差旅共 ${actualCost} 金币。有无论文都能报名参会；有已录用的一作 A 类论文，还可以提前报名 Poster 展示。`,
      advisorHint,
      selfPayHint,
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
        id: `ccig-self-y${state.year}-m${state.month}`,
        label: "自费参会",
        outcome: `金币 -${actualCost}。`,
        effects: {
          fixedEventResolution: { kind: "ccig-self" },
        },
      },
    ],
  });
  return { ...event, fixedResultPreview: { resolution: { kind: "ccig-open", ccigCalendar: { year: state.year, month: state.month } }, rolls: [] } };
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

  return createCcigFixedEvent(state, {
    id: `ccig-attend-result-y${state.year}-m${state.month}-${mode}`,
    title: "领域年会 ➜ 参会决定 ➜ 参会确认",
    description: [
      `你完成 VALSE ${realYear} 的参会确认，把签到凭证截好图，订好去${location}的车票和住宿。${mode === "advisor" ? "导师同意报销，这趟差旅从科研经费里支出。" : "这趟差旅由你自己出钱，订完才舍得关掉比价页面。"}`,
      `车票日期终于出现在日历上。你和同学约好碰面，把电脑、充电器和证件装进包，又把返程前能逛的地方存进收藏夹。总算有几天不用沿着宿舍、食堂和工位的老路线走了。${narrative}`,
      "机制结算",
      ...settlementItems.slice(1).map((item) => `结果：${item}`),
    ].join("\n\n"),
    chainId: getCcigChainId(state),
    stage: "act3",
    completionLog: `${settlementItems.join("，")}；领域年会参会已确认`,
    choices: [
      {
        id: `ccig-enter-venue-y${state.year}-m${state.month}-${mode}`,
        label: "确定",
        outcome: "进入行程安排。",
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
    ],
  });
}

export function createCcigSkipResultEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createCcigFixedEvent(state, {
    id: `ccig-skip-result-y${state.year}-m${state.month}`,
    title: "领域年会 ➜ 参会决定 ➜ 暂不参会",
    description: [
      `你决定不去${location}参加 VALSE ${realYear}，把会务通知暂时放到一边。`,
      "同学在群里聊起行程，你看了一会儿，还是打开了没读完的文献。错过现场交流有点可惜，但这趟就不折腾了。",
      "机制结算",
      "结果：不去参会",
    ].join("\n\n"),
    chainId: getCcigChainId(state),
    stage: "act3",
    completionLog: "不去参会",
    choices: [
      {
        id: `ccig-skip-finish-y${state.year}-m${state.month}`,
        label: "确定",
        outcome: "不去参会。",
        effects: {},
      },
    ],
  });
}

export function createCcigEvent(state: GameState): PendingEvent {
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  return createCcigFixedEvent(state, {
    id: `ccig-y${state.year}-m${state.month}`,
    title: "领域年会",
    description: [
      `导师把 VALSE ${realYear} 的通知转进群里，今年的领域年会在${location}举办。视觉与学习方向的同行会来听报告、聊论文，同学已经开始问谁去、能不能一起订房。`,
      "每天在宿舍、食堂和工位之间来回，连午饭都快不用挑了。你翻着通知，想到终于能换个城市待几天；要是能公费出行，听报告之外还能透透气，倒真有些期待。",
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
