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

function getActivityConditions(option: ConferenceActivityOptionDefinition): string[] {
  const conditions: string[] = [];
  const encounterUpdates = option.effects.conferenceEncounterUpdates;
  const addCountCondition = (label: string, nextCount: number | undefined): void => {
    if (nextCount !== undefined) {
      conditions.push(`条件：${label} ${nextCount} ${nextCount >= 2 ? "≥" : "<"} 2`);
    }
  };

  switch (option.id) {
    case "big-bull-joint-training":
      addCountCondition("深入合作次数", encounterUpdates?.bigBullDeepCount);
      break;
    case "beautiful-lover-development":
      addCountCondition("活泼学者交流次数", encounterUpdates?.beautifulCount);
      break;
    case "smart-lover-development":
      addCountCondition("聪慧学者交流次数", encounterUpdates?.smartCount);
      break;
  }
  return conditions;
}

function getActivityDecisionHint(option: ConferenceActivityOptionDefinition, state: ConferenceActivityBuildState): string {
  switch (option.id) {
    case "enterprise-networking":
      return state.internshipState.active
        ? "企业代表认出了你，问起你正在做的实习项目，还想听听实验中遇到的问题。"
        : state.conferenceCareerState.permanentlyBlockedInternship
          ? "企业代表记得你先前说暂不考虑实习，这回只问起了研究近况。"
          : "企业展台前的人翻着你的论文，问你有没有时间聊聊他们正在招的实习岗位。";
    case "big-bull-coop":
      return state.conferenceEncounterState.bigBullCooperation
        ? "联培合作的老师朝你招手，手里还拿着你前几天发去的草稿。"
        : "那位学者还在讲台边答疑，你把自己的论文翻出来，先在心里练了一遍开场白。";
    case "big-bull-joint-training":
      return option.effects.triggerJointTrainingInvite
        ? "前几次讨论的结果已经寄给对方，回信里除了改稿意见，还问起你能否来组里待一段时间。"
        : "上回聊过的学者还记得你的问题，说想看看你后来补的实验。";
    case "beautiful-lover-development":
      return option.effects.triggerLoverDevelopment
        ? "那位总能把你逗笑的同行发来消息，约你散场后单独走走，末尾还添了个有些害羞的表情。"
        : "上次聊得很投缘的同行认出了你，隔着人群挥了挥手。";
    case "smart-lover-development":
      return option.effects.triggerLoverDevelopment
        ? "那位常和你讨论问题的同行问起散场后的安排，又补了一句：“这回不聊论文也行。”"
        : "上次一起推过公式的同行发来座位号，说给你留了旁边的位置。";
    default:
      return "";
  }
}

export function createConferenceActivityResult(
  context: ConferenceActivityContext,
  option: ConferenceActivityOptionDefinition,
  _attendanceSummary: string,
  preview?: PendingEvent["conferenceActivityPreview"],
): PendingEvent {
  const activitySummary = trimOutcome(option.outcome);
  const activityChainId = getConferenceActivityChainId(context);
  return {
    id: `${activityChainId}-result-${option.id}`,
    title: `${context.conferenceName}活动 ➜ 选择安排 ➜ 活动结果`,
    description: [
      option.resultDescription,
      "回程时，你把胸牌塞进会务袋。下次再挂上它，又不知道会在哪座城市了。",
      "机制结算",
      ...getActivityConditions(option),
      ...getConferencePaperPresentationResults(context).map((result) => `结果：${result}`),
      ...activitySummary.split("；").map((result) => `结果：${result}`),
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: activityChainId,
    stage: "result",
    ...(preview ? { conferenceActivityPreview: { ...preview, selectedOptionId: option.id } } : {}),
    discardPaperUpdates: createDiscardPaperUpdates(context),
    completionLog: activitySummary,
    choices: [{
      id: "close",
      label: "确定",
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
  const rolls = Array.from({ length: 4 }, () => getRoll());
  let rollIndex = 0;
  const preview = { context, attendanceSummary, rolls };
  const selectedOptions = selectConferenceActivityOptions(
    context,
    { ...state, loverState: state.loverState ?? createLoverState() },
    () => rolls[rollIndex++] ?? 0,
  );
  const activityChainId = getConferenceActivityChainId(context);
  return {
    id: `${activityChainId}-act2`,
    title: `${context.conferenceName}活动 ➜ 选择安排`,
    description: [
      `你翻着${context.city}这场 ${context.conferenceName}（${getConferenceGradeLabel(context.grade)}）的议程，先前圈过的几项恰好撞了时间。` + (context.paperCount >= 2
        ? `忙完 ${context.paperCount} 篇论文的展示，你不想再赶场，只想好好参加一项。`
        : "展示忙完了，你准备挑一项参加。"),
      "收好讲稿，你看看周围。" + (selectedOptions.map((option) => getActivityDecisionHint(option, state)).filter(Boolean).join("")
        || "茶歇区还在聊刚才的报告，门外也透着阳光。忙了这么久，出去走走同样让人心动。"),
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: activityChainId,
    stage: "act2",
    conferenceActivityPreview: preview,
    discardPaperUpdates: createDiscardPaperUpdates(context),
    choices: selectedOptions.map((option) => ({
      id: option.id,
      label: option.label,
      outcome: option.outcome,
      effects: {
        enqueueEvents: [createConferenceActivityResult(context, option, attendanceSummary, preview)],
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
  const decision = createConferenceActivityDecisionEvent(context, state, attendanceSummary, getRoll);
  return {
    id: `${activityChainId}-act1`,
    title: `${context.conferenceName}活动`,
    description: [
      `在${context.city}的会场，你按 ${context.conferenceName} 的安排完成了论文展示。走出展示区时，肩膀才慢慢松下来。`,
      context.paperCount >= 2
        ? `同会的 ${context.paperCount} 篇论文让你忙得够呛，记下的问题也攒了几页。你把材料收好，终于有空听听周围的人在聊什么。`
        : "你把记着问题的纸收好。茶歇区飘来咖啡味，邻近海报前还围着几个人，你终于有心思看看周围。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: activityChainId,
    stage: "act1",
    conferenceActivityPreview: decision.conferenceActivityPreview,
    discardPaperUpdates: createDiscardPaperUpdates(context),
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "查看会场活动安排。",
      effects: {
        enqueueEvents: [decision],
      },
    }],
  };
}
