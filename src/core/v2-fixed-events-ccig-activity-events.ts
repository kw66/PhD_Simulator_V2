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
      `你在${location}的 CCIG ${realYear} 会场翻着日程，几项安排撞在一起，总得有所取舍。`,
      "坐下听报告、出去走走，或是请同学吃顿饭，你想先挑一件。",
      posterPaper ? `你也可以留在海报区，介绍 A 类论文《${posterPaper.title}》。` : "",
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
