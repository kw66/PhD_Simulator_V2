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
  return createFixedEvent({
    id: `${activityChainId}-act1`,
    title: "领域年会活动",
    description: [
      arrivalText,
      `走廊里挤满了挂胸牌的人，海报区汇集着近年的顶会顶刊工作。你在手册上圈好想听的报告，抬头发现刚读过的论文作者就在旁边排队。${posterPaper ? `你带来的《${posterPaper.title}》也排进了展示，得找找自己的展板。` : ""}`,
    ].join("\n\n"),
    chainId: activityChainId,
    stage: "act1",
    choices: [{
      id: `ccig-activity-open-y${state.year}-m${state.month}`,
      label: "继续",
      outcome: "查看领域年会活动安排。",
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
    title: "领域年会活动 ➜ 选择安排",
    description: [
      `你在${location}的 VALSE ${realYear} 会场对着日程找路：Tutorial 想补基础，Workshop 又有贴近课题的讨论。同学偏偏这时发来餐馆定位，人均 2 金币。报告题目和美食照片来回切换，你突然很佩服出发前那份排满的学习计划。`,
      posterPaper
        ? `海报区也能展示《${posterPaper.title}》。想到同行会来听，你兴奋地默念了一遍开场白；总不能只让论文躺在网上，等别人碰巧翻到。`
        : "海报区贴着一排 A 类论文，你手头还没有适合这次展示的稿子。你把日程折好，准备先去听听同行都在做些什么。",
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
        outcome: `${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}；该论文宣传倍率 +50%。`,
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
        label: "请同学吃饭",
        outcome: "金币 -2，SAN +2；席间交流能否带来新的长进，要看已有的交往积累。",
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
  condition?: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `ccig-activity-result-y${params.state.year}-m${params.state.month}-${params.mode}`,
    title: params.title.includes("➜") ? params.title : `领域年会活动 ➜ 选择安排 ➜ ${params.title}`,
    description: [params.description, "机制结算", ...(params.condition ? [`条件：${params.condition}`] : []), `结果：${params.outcome}`].join("\n\n"),
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
