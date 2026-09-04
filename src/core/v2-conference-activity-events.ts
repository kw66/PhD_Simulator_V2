import { createLoverState } from "./v2-lover-system";
import type { PendingEvent } from "./v2-types";
import {
  getConferenceActivityChainId,
  getConferenceGradeLabel,
  getConferencePaperPresentationResults,
  type ConferenceActivityBuildState,
  type ConferenceActivityContext,
  type ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";
import { selectConferenceActivityOptions } from "./v2-conference-activity-options";

function trimOutcome(value: string): string {
  return value.trim().replace(/[。.]+$/u, "");
}

function createDiscardPaperUpdates(context: ConferenceActivityContext) {
  return (context.paperIds ?? []).map((id) => ({ id, conferenceHandled: true }));
}

export function createConferenceActivityResult(
  context: ConferenceActivityContext,
  option: ConferenceActivityOptionDefinition,
  attendanceSummary: string,
): PendingEvent {
  const activitySummary = trimOutcome(option.outcome);
  const activityChainId = getConferenceActivityChainId(context);
  return {
    id: `${activityChainId}-result-${option.id}`,
    title: "会场活动 ➜ 选择安排 ➜ 活动结果",
    description: [
      option.resultDescription,
      "散场广播响起时，当天的报告和交流也告一段落。",
      "你收好胸牌和会议手册，这趟行程也到了尾声。",
      "机制结算",
      activitySummary,
      ...getConferencePaperPresentationResults(context),
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: activityChainId,
    stage: "result",
    discardPaperUpdates: createDiscardPaperUpdates(context),
    completionLog: [attendanceSummary, activitySummary].filter(Boolean).join("；"),
    choices: [{
      id: "close",
      label: "结束",
      outcome: "本次会场活动结束。",
      effects: {
        ...option.effects,
        followUpContext: `${context.conferenceName} ${context.conferenceYear} 会场交流`,
        paperUpdates: createDiscardPaperUpdates(context),
      },
    }],
  };
}

export function createConferenceActivityDecisionEvent(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  attendanceSummary: string,
  getRoll: () => number = Math.random,
): PendingEvent {
  const selectedOptions = selectConferenceActivityOptions(
    context,
    { ...state, loverState: state.loverState ?? createLoverState() },
    getRoll,
  );
  const activityChainId = getConferenceActivityChainId(context);
  return {
    id: `${activityChainId}-act2`,
    title: "会场活动 ➜ 选择安排",
    description: [
      "论文已经按会议安排完成展示，接下来的时间可以自己安排。",
      `你抵达${context.city}，在 ${context.conferenceName}（${getConferenceGradeLabel(context.grade)}）签到处领到胸牌和议程。`,
      context.paperCount >= 2
        ? `这次有 ${context.paperCount} 篇论文已经完成展示，你终于可以把注意力放到会场活动上。`
        : "这次的论文展示已经完成。",
      ...getConferencePaperPresentationResults(context),
      "报告、海报、茶歇和临时交流有不少撞在同一时段，你只能挑一项最想参加的安排。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: activityChainId,
    stage: "act2",
    discardPaperUpdates: createDiscardPaperUpdates(context),
    choices: selectedOptions.map((option) => ({
      id: option.id,
      label: option.label,
      outcome: option.outcome,
      effects: {
        enqueueEvents: [createConferenceActivityResult(context, option, attendanceSummary)],
      },
    })),
  };
}

export function createConferenceActivityEvent(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  attendanceSettlementItems: string[],
  getRoll: () => number = Math.random,
): PendingEvent {
  const activityChainId = getConferenceActivityChainId(context);
  const attendanceSummary = attendanceSettlementItems.join("，");
  return {
    id: `${activityChainId}-act1`,
    title: "会场活动",
    description: [
      `会议当天，你带着论文来到${context.city}，展示已经按 ${context.conferenceName} 的安排完成。`,
      `前一幕参会确认：${attendanceSummary}`,
      context.paperCount >= 2
        ? `同会的 ${context.paperCount} 篇论文都展示完了，剩下的时间由你安排。`
        : "论文展示顺利结束，剩下的时间由你安排。",
      ...getConferencePaperPresentationResults(context),
      "主旨报告、分论坛、茶歇和城市活动同时开放，挑一项最想参加的吧。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: activityChainId,
    stage: "act1",
    discardPaperUpdates: createDiscardPaperUpdates(context),
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "查看会场活动安排。",
      effects: {
        enqueueEvents: [createConferenceActivityDecisionEvent(context, state, attendanceSummary, getRoll)],
      },
    }],
  };
}
