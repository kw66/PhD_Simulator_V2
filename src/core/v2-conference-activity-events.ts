import { gameRandom } from "./v2-game-random";
import { getKnownPersonNames } from "./v2-person-names";
import { randomOutcome } from "./v2-event-choice-random";
import { createLoverState } from "./v2-lover-system";
import { getConferenceMentorContact, getConferenceScholarContact } from "./v2-conference-contacts";
import type { PendingEvent } from "./v2-types";
import {
  getConferenceActivityChainId,
  getConferenceRegionName,
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

const ADVANCED_ACTIVITY_IDS = new Set(["big-bull-coop", "opposite-scholar"]);

function getActivityDecisionHint(option: ConferenceActivityOptionDefinition, state: ConferenceActivityBuildState): string {
  switch (option.id) {
    case "tour-local":
      return "同行发来几张街景，你望向门外，这座城市还没好好逛过，🚶出去换换心情也不错。";
    case "tea-break":
      return "茶歇区有人端着咖啡找座位，胸牌上的方向很熟悉，☕一句“报告怎么样”或许就能聊起来。";
    case "experiment-discussion":
      return "几位同行正对照实验结果。听到“复现不出来”，你想起自己的难题，🔬也想凑过去问问。";
    case "idea-networking":
      return "邻近海报用了不同方法解决相似问题。挨个聊聊，💡也许能给自己的课题换个思路。";
    case "famous-scholar":
      return "报告结束，著名学者身边的人渐渐少了。你把疑问在心里过了一遍，💬犹豫要不要上前请教。";
    case "enterprise-networking":
      return state.internshipState.active
        ? "企业展台的演示让你想起实习中的难题，🛠️正好问问他们是怎么处理的。"
        : "企业展台旁贴着实习招聘。你想聊聊实际项目，💼也看看自己的研究能派上什么用场。";
    case "big-bull-coop":
      return (option.effects.conferenceEncounterUpdates?.bigBull?.cooperationCount ?? 1) >= 2
        ? `${option.effects.conferenceEncounterUpdates?.bigBull?.name ?? "那位学者"}认出你，问起上次的工作。新稿就在包里，🤝正好继续聊聊合作。`
        : `${option.effects.conferenceEncounterUpdates?.bigBull?.name ?? "那位学者"}还在答疑。你读过对方不少论文，🤝想拿着卡住的草稿争取一次合作。`;
    case "opposite-scholar":
      return "邻座的异性学者恰好看过来。你想搭句话，又怕一开口全是论文，😅像在追加一轮审稿。";
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
    title: `${context.conferenceName}活动 ➜ 选择安排 ➜ ${option.label}`,
    narrativeNames: [
      option.effects.conferenceEncounterUpdates?.bigBull?.name,
      ...Object.values(option.effects.conferenceEncounterUpdates?.scholars ?? {}).map((contact) => contact?.name),
    ].filter((name): name is string => Boolean(name)),
    description: [
      option.resultDescription,
      ...(ADVANCED_ACTIVITY_IDS.has(option.id) ? [`小提示：选项出现条件：${option.label}需A/B类会议、社交 ≥ 6，随机抽取。`] : []),
      "机制结算",
      ...getConferencePaperPresentationResults(context).map((result) => `结果：${result}`),
      ...(option.id === "tour-local" ? [`条件：${getConferenceRegionName(context.region)}参会`] : []),
      ...(option.settlementItems ?? activitySummary.split("；").map((result) => `结果：${result}`)),
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
  getRoll: () => number = gameRandom,
  frozenPreview?: ConferenceActivityPreview,
): PendingEvent {
  const rolls = frozenPreview?.rolls ?? Array.from({ length: 32 }, () => getRoll());
  let rollIndex = 0;
  const seed = { id: context.id, roll: rolls[10] ?? 0.5, levelRoll: rolls[9] ?? 0.5,
    selectedRoleId: state.selectedRoleId, playerGender: state.playerGender,
    usedNames: getKnownPersonNames(state.playerAttributeState ?? state) };
  const encounter = state.conferenceEncounterState;
  const bigBull = encounter.bigBull ?? frozenPreview?.contacts?.bigBull ?? getConferenceMentorContact(encounter, seed);
  const beautiful = encounter.scholars?.beautiful ?? frozenPreview?.contacts?.scholars?.beautiful
    ?? getConferenceScholarContact(encounter, "beautiful", { ...seed, usedNames: [...seed.usedNames, bigBull.name] });
  const smart = encounter.scholars?.smart ?? frozenPreview?.contacts?.scholars?.smart
    ?? getConferenceScholarContact(encounter, "smart", { ...seed, usedNames: [...seed.usedNames, bigBull.name, beautiful.name] });
  const contacts = {
    bigBull,
    scholars: {
      beautiful,
      smart,
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
  const hints = selectedOptions.map((option) => getActivityDecisionHint(option, state)).filter(Boolean);
  const sceneParagraphs: string[] = [];
  for (let hintIndex = 0; hintIndex < hints.length; hintIndex += 2) {
    sceneParagraphs.push(hints.slice(hintIndex, hintIndex + 2).join(""));
  }
  return {
    id: `${activityChainId}-act2`,
    title: `${context.conferenceName}活动 ➜ 选择安排`,
    narrativeNames: [contacts.bigBull.name, ...Object.values(contacts.scholars).map((contact) => contact.name)],
    description: [
      (context.paperCount >= 2
        ? `忙完 ${context.paperCount} 篇论文的展示，你嗓子都有些哑了。`
        : "自己的展示告一段落，你终于松了口气。")
        + "剩下的时间不够处处赶场，得挑一件最想做的事。",
      ...sceneParagraphs,
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
      ...randomOutcome(option.id === "opposite-scholar"),
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
  getRoll: () => number = gameRandom,
  frozenPreview?: ConferenceActivityPreview,
): PendingEvent {
  const activityChainId = getConferenceActivityChainId(context);
  const attendanceSummary = attendanceSettlementItems.join("，");
  const decision = createConferenceActivityDecisionEvent(context, state, attendanceSummary, getRoll, frozenPreview);
  return {
    id: `${activityChainId}-act1`,
    title: `${context.conferenceName}活动`,
    description: [
      `在${context.city}的 ${context.conferenceName} 会场，你按安排完成了论文展示。出发前背得滚瓜烂熟的介绍，真有人问起细节，还是得现翻图表。最后一位听众道谢离开，🥤你才发现手里的水早就凉了。`,
      context.paperCount >= 2
        ? `同会的 ${context.paperCount} 篇论文让你来回赶场，手机里存了几张同行画的草图，还有一串回去要核对的问题。 📝你给组里发了句“展示结束”，想了想，又补上一句“还挺有收获”。`
        : "有个问题问得很准，你在本子上打了个星；另一个没来得及回答的，约好会后发邮件。 📧你给组里报了平安，收起材料，肩膀才慢慢松下来。",
      context.grade === "A"
        ? "隔壁几场报告同时散场，走廊一下挤满了人。文献里熟悉的名字出现在胸牌上，有人讨论刚听到的方法，有人已经打开电脑争论起来。站在这里，💬你忽然觉得屏幕另一端的研究圈有了声音。"
        : context.grade === "B"
          ? "走廊里还在延续刚才专题的讨论。你听见一个熟悉的数据集名称，回头发现大家也在为同样的问题发愁。原来那些写得干净利落的论文背后，🌙也有没跑通的实验和来回修改的夜晚。"
          : "茶歇桌旁还有人在聊刚才的报告，海报前的讨论也没散。听见同行抱怨实验和截稿日，你忍不住笑了一下：换了座城市，😄大家过的研究生日子竟然差不多。",
      "小提示：出现条件：已安排亲自参会，且到达会议举办月。",
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
