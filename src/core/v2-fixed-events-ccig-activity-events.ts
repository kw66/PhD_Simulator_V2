import { createFixedEvent } from "./v2-fixed-events-shared";
import {
  getCcigActivityChainId,
  getCcigLocation,
  getCcigPosterPaper,
  getCcigRealYear,
  type CcigActivityMode,
  type CcigParticipationMode,
} from "./v2-fixed-events-ccig-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createCcigActivityEvent(
  state: GameState,
  participationMode: Exclude<CcigParticipationMode, "skip">,
  attendanceSettlementItems: string[],
): PendingEvent {
  const activityChainId = getCcigActivityChainId(state);
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const posterPaper = getCcigPosterPaper(state);
  const arrivalText = participationMode === "advisor"
    ? `报销手续办妥后，你来到${location}参加 CCIG ${realYear}，在签到处领了胸牌和手册。`
    : `行程安排妥当后，你来到${location}参加 CCIG ${realYear}，在签到处领了胸牌和手册。`;
  return createFixedEvent({
    id: `${activityChainId}-act1`,
    title: "年会活动",
    description: [
      arrivalText,
      `你在手册上圈出想听的报告，又看了看海报区的位置。${posterPaper ? `手头那篇 A 类论文《${posterPaper.title}》也能做成海报，趁这次和同行聊聊。` : ""}`,
      "机制结算",
      `参会确认：${attendanceSettlementItems.join("，")}`,
    ].join("\n\n"),
    chainId: activityChainId,
    stage: "act1",
    choices: [{
      id: `ccig-activity-open-y${state.year}-m${state.month}`,
      label: "继续",
      outcome: "查看年会活动安排。",
      effects: {
        enqueueEvents: [createCcigActivityDecisionEvent(state, participationMode, attendanceSettlementItems)],
      },
    }],
  });
}

export function createCcigActivityDecisionEvent(
  state: GameState,
  _participationMode: Exclude<CcigParticipationMode, "skip">,
  attendanceSettlementItems: string[],
): PendingEvent {
  const activityChainId = getCcigActivityChainId(state);
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const posterPaper = getCcigPosterPaper(state);
  const attendanceSummary = attendanceSettlementItems.join("，");
  return createFixedEvent({
    id: `${activityChainId}-act2`,
    title: "年会活动 ➜ 选择安排",
    description: [
      `你站在${location}的 CCIG ${realYear} 会场里，低头对着日程找分会场。广播开始提醒入场，同学却在群里发来餐馆定位，还问谁想顺路逛逛。`,
      "刚圈好的报告题目还在眼前，美食照片又一张接一张。你咽了咽口水，突然很佩服自己出发前那份排得满满当当的学习计划。",
      posterPaper ? `海报区也有展示 A 类论文《${posterPaper.title}》的机会。想到同行会停下来听自己讲，你既兴奋，又忍不住在心里过了一遍开场白。` : "",
      "机制结算",
      `参会确认：${attendanceSummary}`,
    ].filter(Boolean).join("\n\n"),
    chainId: activityChainId,
    stage: "act2",
    choices: [
      {
        id: `ccig-activity-listen-y${state.year}-m${state.month}`,
        label: "认真听报告",
        outcome: "认真听报告。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-listen", ccigAttendanceSummary: attendanceSummary },
        },
      },
      ...(posterPaper ? [{
        id: `ccig-activity-poster-y${state.year}-m${state.month}`,
        label: "海报展示",
        outcome: `展示《${posterPaper.title}》。`,
        effects: {
          fixedEventResolution: {
            kind: "ccig-activity-poster" as const,
            ccigAttendanceSummary: attendanceSummary,
            ccigPaperId: posterPaper.id,
          },
        },
      }] : []),
      {
        id: `ccig-activity-travel-y${state.year}-m${state.month}`,
        label: "趁机旅游",
        outcome: "抽空逛城市。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-travel", ccigAttendanceSummary: attendanceSummary },
        },
      },
      {
        id: `ccig-activity-food-y${state.year}-m${state.month}`,
        label: "请同学吃饭",
        outcome: "请同学吃饭。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-food", ccigAttendanceSummary: attendanceSummary },
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
  outcome: string;
  completionLog: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `ccig-activity-result-y${params.state.year}-m${params.state.month}-${params.mode}`,
    title: params.title.includes("➜") ? params.title : `年会活动 ➜ 选择安排 ➜ ${params.title}`,
    description: [params.description, "机制结算", params.outcome].join("\n\n"),
    chainId: getCcigActivityChainId(params.state),
    stage: "result",
    completionLog: params.completionLog,
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
