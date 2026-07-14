import { createLoverState } from "./v2-lover-system";
import type { PendingEvent } from "./v2-types";
import {
  getConferenceGradeLabel,
  getPaperScaleText,
  type ConferenceActivityBuildState,
  type ConferenceActivityContext,
  type ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";
import { selectConferenceActivityOptions } from "./v2-conference-activity-options";

function createConferenceActivityResult(
  context: ConferenceActivityContext,
  option: ConferenceActivityOptionDefinition,
): PendingEvent {
  return {
    id: `${context.id}-activity-result-${option.id}`,
    title: "论文参会会场活动 ➜ 结果",
    description: `${context.conferenceName} ${context.conferenceYear} @ ${context.city}。${option.resultDescription}`,
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-activity",
    stage: "result",
    choices: [{
      id: "close",
      label: "结束",
      outcome: "本次会场活动结束。",
      effects: {},
    }],
  };
}

function createConferenceActivityAct2(
  context: ConferenceActivityContext,
  selectedOptions: ConferenceActivityOptionDefinition[],
): PendingEvent {
  return {
    id: `${context.id}-activity-act2`,
    title: "论文参会会场活动 ➜ 会场决策",
    description: "会场的时间被切得很碎，报告、海报、茶歇和临时交流几乎无缝衔接。你不可能把每条线都做到位，因此必须选出今天最值得投入的一条主线。",
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-activity",
    stage: "act2",
    choices: selectedOptions.map((option) => ({
      id: option.id,
      label: option.label,
      outcome: option.outcome,
      effects: {
        ...option.effects,
        enqueueEvents: [...(option.effects.enqueueEvents ?? []), createConferenceActivityResult(context, option)],
      },
    })),
  };
}

export function createConferenceActivityAct1(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  getRoll: () => number = Math.random,
): PendingEvent {
  const selectedOptions = selectConferenceActivityOptions(
    context,
    { ...state, loverState: state.loverState ?? createLoverState() },
    getRoll,
  );
  return {
    id: `${context.id}-activity-act1`,
    title: "论文参会会场活动",
    description: `你抵达 ${context.city}，正式进入 ${context.conferenceName}（${getConferenceGradeLabel(context.grade)}）会场。${getPaperScaleText(context.paperCount)} 报告、海报、茶歇和临时交流挤在同一天里，你得先决定今天的主攻方向。`,
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-activity",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "进入会场活动决策。",
      effects: {
        enqueueEvents: [createConferenceActivityAct2(context, selectedOptions)],
      },
    }],
  };
}
