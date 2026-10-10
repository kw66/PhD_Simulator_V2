import { createLoverState } from "./v2-lover-system";
import { getConferenceMentorContact, getConferenceScholarContact } from "./v2-conference-contacts";
import type { PendingEvent } from "./v2-types";
import {
  getConferenceActivityChainId,
  getConferenceGradeLabel,
  getConferencePaperPresentationResults,
  type ConferenceActivityBuildState,
  type ConferenceActivityContext,
  type ConferenceActivityOptionDefinition,
  type ConferenceActivityPreview,
} from "./v2-conference-activity-shared";
import { selectConferenceActivityOptions } from "./v2-conference-activity-options";

function trimOutcome(value: string): string {
  return value.trim().replace(/[。.]+$/u, "");
}

function createDiscardPaperUpdates(context: ConferenceActivityContext) {
  return (context.paperIds ?? []).map((id) => ({ id, conferenceHandled: true }));
}

function getActivityConditions(option: ConferenceActivityOptionDefinition): string[] {
  const updates = option.effects.conferenceEncounterUpdates;
  if (option.id === "big-bull-coop" && updates?.bigBull) {
    return [`条件：与${updates.bigBull.name}合作次数 ${updates.bigBull.cooperationCount}`];
  }
  if (option.id === "enterprise-networking") {
    return [`条件：企业交流次数 ${option.effects.conferenceCareerUpdates?.enterpriseCount ?? 0}`];
  }
  return [];
}

function getActivityDecisionHint(option: ConferenceActivityOptionDefinition, state: ConferenceActivityBuildState): string {
  switch (option.id) {
    case "enterprise-networking":
      return state.internshipState.active
        ? "企业代表问起你正在做的实习项目，也想听听实验中遇到的问题。"
        : "企业展台前的人翻着你的论文，等你过去聊聊研究近况。";
    case "big-bull-coop":
      return `${option.effects.conferenceEncounterUpdates?.bigBull?.name ?? "那位学者"}还在讲台边答疑，你把自己的论文翻了出来。`;
    case "opposite-scholar":
      return "邻座的异性学者收起报告笔记，你考虑过去打个招呼。";
    default:
      return "";
  }
}

export function createConferenceActivityResult(
  context: ConferenceActivityContext,
  option: ConferenceActivityOptionDefinition,
  _attendanceSummary: string,
  preview?: ConferenceActivityPreview,
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
  frozenPreview?: ConferenceActivityPreview,
): PendingEvent {
  const rolls = frozenPreview?.rolls ?? Array.from({ length: 32 }, () => getRoll());
  let rollIndex = 0;
  const seed = { id: context.id, roll: rolls[10] ?? 0.5, levelRoll: rolls[9] ?? 0.5,
    selectedRoleId: state.selectedRoleId, playerGender: state.playerGender };
  const encounter = state.conferenceEncounterState;
  const contacts = {
    bigBull: encounter.bigBull ?? frozenPreview?.contacts?.bigBull ?? getConferenceMentorContact(encounter, seed),
    scholars: {
      beautiful: encounter.scholars?.beautiful ?? frozenPreview?.contacts?.scholars?.beautiful ?? getConferenceScholarContact(encounter, "beautiful", seed),
      smart: encounter.scholars?.smart ?? frozenPreview?.contacts?.scholars?.smart ?? getConferenceScholarContact(encounter, "smart", seed),
    },
  };
  const preview: ConferenceActivityPreview = { context, attendanceSummary, rolls, contacts };
  const scholarType = (rolls[8] ?? 0.5) < 0.5 ? "beautiful" : "smart";
  const selectedOptions = selectConferenceActivityOptions(
    context,
    { ...state, conferenceEncounterState: { ...encounter, bigBull: contacts.bigBull,
      scholars: { ...encounter.scholars, [scholarType]: contacts.scholars[scholarType] },
    }, loverState: state.loverState ?? createLoverState() },
    () => rolls[rollIndex++] ?? 0.5,
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
  frozenPreview?: ConferenceActivityPreview,
): PendingEvent {
  const activityChainId = getConferenceActivityChainId(context);
  const attendanceSummary = attendanceSettlementItems.join("，");
  const decision = createConferenceActivityDecisionEvent(context, state, attendanceSummary, getRoll, frozenPreview);
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
