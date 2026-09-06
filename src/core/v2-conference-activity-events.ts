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
      "收拾东西时，你把胸牌和会议手册放在一起。今天的安排告一段落，回去再慢慢整理。",
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
      `你翻着${context.city}这场 ${context.conferenceName}（${getConferenceGradeLabel(context.grade)}）的议程，一边看时间，一边盘算先去哪里。`,
      context.paperCount >= 2
        ? `忙完 ${context.paperCount} 篇论文的展示，你不想再来回赶场，准备挑一项好好参加。`
        : "你不想再把空当塞满。接下来想留在会场交流，还是出去透口气？",
      ...getConferencePaperPresentationResults(context),
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
      `在${context.city}的会场，你按 ${context.conferenceName} 的安排完成了论文展示。走出展示区时，肩膀才慢慢松下来。`,
      `参会安排：${attendanceSummary}`,
      context.paperCount >= 2
        ? `同会的 ${context.paperCount} 篇论文让你忙得够呛，记下的问题也攒了几页。你把材料收好，终于有空听听周围的人在聊什么。`
        : "你把记着问题的纸收好。茶歇区飘来咖啡味，邻近海报前还围着几个人，你终于有心思看看周围。",
      ...getConferencePaperPresentationResults(context),
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
