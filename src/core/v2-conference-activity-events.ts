import { createLoverState } from "./v2-lover-system";
import type { PendingEvent } from "./v2-types";
import {
  getConferenceGradeLabel,
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
    title: "论文参会会场活动 ➜ 会场决策 ➜ 行程收获",
    description: [
      `你在会场选择了：${option.label}。`,
      option.resultDescription,
      "执行完这一轮安排后，你能明显感觉到今天的“收益形状”已经定型：有的回报立刻可见，有的会在后续几个月慢慢兑现。",
      "会场里的每一个决策都像提前埋下的分支，这次你已经把其中一条走到底。",
    ].join("\n\n"),
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
    description: [
      "会场的时间被切得很碎，报告、茶歇、海报、晚宴和临时交流挤在同一天里，你不可能把每条线都做到位。",
      "你翻着日程，脑中自动分成三类收益：立刻能落到课题上的学术收益、能缓冲长期压力的状态收益、以及可能在未来回本的人脉收益。",
      "每个选择都在提醒你同一件事：今天的“放弃项”与“投入项”一样重要。",
      "你决定不再贪多，而是选一条最符合当前阶段的主线，把有限精力砸出最大确定性。",
    ].join("\n\n"),
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
    description: [
      `你抵达${context.city}，正式进入 ${context.conferenceName}（${getConferenceGradeLabel(context.grade)}）会场，胸牌和议程一拿到手，时间就被切成了很多互相竞争的片段。`,
      context.paperCount >= 2
        ? `这次你有 ${context.paperCount} 篇论文展示任务，意味着你不仅要“出现”，还要反复切换表达策略和交流对象。`
        : "这次你有 1 篇论文展示任务，看似简单，但每一次沟通的质量都会被直接放大。",
      "会场流程很密，报告、海报、茶歇和临时交流几乎无缝衔接，你必须提前决定今天的主攻方向。",
    ].join("\n\n"),
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
