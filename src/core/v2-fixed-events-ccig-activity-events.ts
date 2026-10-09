import {
  createCcigFixedEvent,
  getCcigActivityChainId,
  getCcigLocation,
  getCcigPosterPaper,
  getCcigRealYear,
  type CcigActivityMode,
  type CcigParticipationMode,
} from "./v2-fixed-events-ccig-shared";
import type { GameState, PendingEvent } from "./v2-types";
import { formatActualSanChange } from "./v2-sanity-rules";

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
    ? `报销手续办妥后，你来到${location}参加 VALSE ${realYear}，在签到处出示凭证和证件，领到胸牌与手册。`
    : `行程安排妥当后，你来到${location}参加 VALSE ${realYear}，在签到处出示凭证和证件，领到胸牌与手册。`;
  return { ...createCcigFixedEvent(state, {
    id: `${activityChainId}-act1`,
    title: "VALSE活动",
    description: [
      arrivalText,
      "这就是前些天群里商量出行的那场领域年会。走廊里挤满了挂胸牌的人，主会场还没开门，门口已经排起队；有人聊起往届院士的主旨报告，有人正对着会场分布图找下一场的入口。",
      `海报区汇集着近年的顶会顶刊工作，刚读过的论文作者就站在展板前。${posterPaper ? "你会前已报了海报展示，正好照着通知找找自己的展板。" : "你翻开手册，盘算这几天听什么、和谁聊。"}`,
      ...(posterPaper ? [`涉及论文：**《${posterPaper.title}》**`] : []),
    ].join("\n\n"),
    chainId: activityChainId,
    stage: "act1",
    choices: [{
      id: `ccig-activity-open-y${state.year}-m${state.month}`,
      label: "继续",
      outcome: "查看VALSE活动安排。",
      effects: {
        enqueueEvents: [createCcigActivityDecisionEvent(state, participationMode, attendanceSettlementItems)],
      },
    }],
  }), ccigActivityPreview: { year: state.year, month: state.month, participationMode, attendanceSettlementItems } };
}

export function createCcigActivityDecisionEvent(
  state: GameState,
  participationMode: Exclude<CcigParticipationMode, "skip">,
  attendanceSettlementItems: string[],
): PendingEvent {
  const activityChainId = getCcigActivityChainId(state);
  const location = getCcigLocation(state.year);
  const realYear = getCcigRealYear(state.year, state.month);
  const posterPaper = getCcigPosterPaper(state);
  const attendanceSummary = attendanceSettlementItems.join("，");
  return { ...createCcigFixedEvent(state, {
    id: `${activityChainId}-act2`,
    title: "VALSE活动 ➜ 选择安排",
    description: [
      `你在${location}的 VALSE ${realYear} 会场外圈好日程：多模态大模型、视频生成、三维视觉与空间智能。Tutorial 讲方法，Workshop 讨论数据和评测，偏偏几场撞了时间。`,
      "同学发来餐馆定位，约大家 AA 聚餐，人均 2 金币。有人想听完报告再去，有人准备先逛逛。你看看日程，再看看美食照片，开始重新安排今天。",
      posterPaper
        ? "海报展示在会前就报了名，展板位置也分好了。想到同行会来听，你又默念了一遍开场白。"
        : "会前报名时，你没有适合展示的论文，这次便没有报名海报展示。眼前几张展板倒是和课题有关，正好去听作者讲讲。",
      ...(posterPaper ? [`涉及论文：**《${posterPaper.title}》**`] : []),
    ].filter(Boolean).join("\n\n"),
    chainId: activityChainId,
    stage: "act2",
    choices: [
      {
        id: `ccig-activity-listen-y${state.year}-m${state.month}`,
        label: "认真听报告",
        outcome: "下次想 idea 获得额外灵感，永久 idea +1。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-listen", ccigAttendanceSummary: attendanceSummary },
        },
      },
      ...(posterPaper ? [{
        id: `ccig-activity-poster-y${state.year}-m${state.month}`,
        label: "海报展示",
        outcome: `${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}；论文宣传倍率 +25%。`,
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
        outcome: "SAN +5。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-travel", ccigAttendanceSummary: attendanceSummary },
        },
      },
      {
        id: `ccig-activity-food-y${state.year}-m${state.month}`,
        label: "品尝当地美食",
        outcome: "金币 -2，SAN +2；席间交流能否带来新的长进，要看已有的交往积累。",
        effects: {
          fixedEventResolution: { kind: "ccig-activity-food", ccigAttendanceSummary: attendanceSummary },
        },
      },
    ],
  }), ccigActivityPreview: { year: state.year, month: state.month, participationMode, attendanceSettlementItems } };
}

export function createCcigActivityResultEvent(params: {
  state: GameState;
  mode: CcigActivityMode;
  title: string;
  description: string;
  outcome: string;
  completionLog: string;
  condition?: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createCcigFixedEvent(params.state, {
    id: `ccig-activity-result-y${params.state.year}-m${params.state.month}-${params.mode}`,
    title: params.title.includes("➜") ? params.title : `VALSE活动 ➜ 选择安排 ➜ ${params.title}`,
    description: [params.description, "机制结算", ...(params.condition ? [`条件：${params.condition}`] : []), `结果：${params.outcome}`].join("\n\n"),
    chainId: getCcigActivityChainId(params.state),
    stage: "result",
    completionLog: params.completionLog,
    choices: [
      {
        id: `ccig-activity-finish-y${params.state.year}-m${params.state.month}-${params.mode}`,
        label: "确定",
        outcome: params.outcome,
        effects: params.effects,
      },
    ],
  });
}
