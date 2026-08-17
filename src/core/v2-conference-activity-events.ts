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
    description: "会场议程排得很满，不可能全顾上。选一个重点。",
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
    description: `论文录用后，终于到了开会这一步。${context.conferenceName}（${getConferenceGradeLabel(context.grade)}），${context.city}。${getPaperScaleText(context.paperCount)}`,
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
