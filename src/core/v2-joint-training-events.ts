import { createConferenceMentorContact, getConferenceMentorContact, replaceConferenceMentorContact } from "./v2-conference-contacts";
import { getJointTrainingCitationCapBonus } from "./v2-joint-training-system";
import type { ConferenceMentorContact, EventChoice, GameState, PendingEvent } from "./v2-types";

export interface JointTrainingContext {
  rejectedBigBullCoopCount: number;
  pendingCitationCapBonus: number;
  origin?: string;
  contact?: ConferenceMentorContact;
  replacement?: ConferenceMentorContact;
  invitationCitations?: number;
  active?: boolean;
  contactAvailable?: boolean;
}

export function buildJointTrainingContext(
  state: Pick<GameState, "conferenceEncounterState" | "totalCitations">,
  contact = getConferenceMentorContact(state.conferenceEncounterState),
): JointTrainingContext {
  return normalizeContext({
    rejectedBigBullCoopCount: state.conferenceEncounterState.rejectedBigBullCoopCount,
    pendingCitationCapBonus: getJointTrainingCitationCapBonus(state.totalCitations, contact.level),
    invitationCitations: state.totalCitations,
    contact: { ...contact },
    active: state.conferenceEncounterState.bigBullCooperation || !!state.conferenceEncounterState.jointTrainingReward,
  });
}

function normalizeContext(context: JointTrainingContext): JointTrainingContext & { contact: ConferenceMentorContact; replacement: ConferenceMentorContact } {
  const contact = context.contact ?? createConferenceMentorContact();
  let replacementSeed = 2166136261;
  for (const character of `${contact.id}:replacement`) replacementSeed = Math.imul(replacementSeed ^ character.charCodeAt(0), 16777619);
  return {
    ...context,
    contact,
    replacement: context.replacement ?? replaceConferenceMentorContact(contact, { id: `${contact.id}:replacement`, levelRoll: (replacementSeed >>> 0) / 4294967296 }),
  };
}

function unavailableText(context: JointTrainingContext): string | undefined {
  if (context.active) return "你已有联培安排，两边的课题也已开始推进，这份邀请便先放下了。";
  if (context.contactAvailable === false) return "你已与新的学者建立联系，这份旧邀请就此放下。";
  return undefined;
}

function createJointTrainingResult(input: JointTrainingContext, decision: "accept" | "decline"): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const bonus = 4 + context.contact.level;
  const reward = {
    mentorId: context.contact.id,
    mentorName: context.contact.name,
    ideaBonus: bonus,
    writingBonus: bonus,
    capBonus: context.pendingCitationCapBonus,
  };
  const effects: EventChoice["effects"] = unavailable ? {} : decision === "accept" ? {
    conferenceEncounterUpdates: { bigBullCooperation: true, bigBull: context.contact, jointTrainingReward: reward },
    researchCapacityStateDeltas: { jointTrainingCitationCapBonus: reward.capBonus },
    ideaBonus: reward.ideaBonus,
    writingBonus: reward.writingBonus,
  } : {
    conferenceEncounterUpdates: {
      bigBull: context.replacement,
      bigBullCoopCount: 0,
      bigBullDeepCount: 0,
      metBigBullCoop: false,
      rejectedBigBullCoopCount: 0,
      permanentlyBlockedBigBullCoop: false,
    },
  };
  const resultText = unavailable ? "结果：无事发生" : decision === "accept"
    ? `结果：科研上限 +${reward.capBonus}\n\n结果：idea +${bonus}（永久）｜写作 +${bonus}（永久）`
    : `结果：合作学者：${context.replacement.name}`;
  return {
    id: `joint-training-result-${decision}`,
    title: `联合培养 ➜ 联培抉择 ➜ ${unavailable ? "暂时放下" : decision === "accept" ? "已确认" : "委婉拒绝"}`,
    description: [...(unavailable ? [
      `📩${unavailable}你重新读了一遍与${context.contact.name}往来的邮件，把需要说明的近况写清楚，免得对方还按之前的讨论替你预留时间。`,
      "附件里的批注仍有值得参考的地方，你把它们归进课题文件夹，没有再承诺新的安排。关掉邮件后，桌上的实验记录还停在昨天那一页；先把正在推进的事情接好，比再排满一张日程表更要紧。",
    ] : decision === "accept" ? [
      `你回信确认了与${context.contact.name}的联培安排，🤝也抄送给导师。写到自己的研究计划时，你停下来改了几处过于笼统的表述：既然对方愿意投入时间，你也得说明白准备带着什么问题去，而不只是期待一个更好的研究环境。`,
      `${context.contact.name}回信后，你把其中的批注和原方案并排打开。参考文献里的名字，如今成了可以讨论实验失败原因的人。你整理出一份待核查的设置清单，准备从分歧最大的那组结果入手，把对方的建议真正接进自己的课题。`,
      "新的合作让人兴奋，也意味着以后要把进展讲给两边听。你在日历上留出整理材料的时间，把还没想明白的问题单独列了一页。机会已经接住了，接下来要学的，是带着具体的问题去讨论，而不是等到每张图都漂亮了才敢发邮件。",
    ] : [
      `📩你给${context.contact.name}认真写了回信，感谢对方把你的课题放进合作计划，也解释了眼下难以兼顾两边进度的顾虑。措辞改了几遍，你还是删掉了含糊的承诺：不想因为舍不得这次机会，让双方之后都被一份难落实的计划拖住。`,
      `${context.contact.name}理解了你的选择，随后转来另一位学者${context.replacement.name}的相关工作，提到对方正在关注你邮件里那个尚未解决的问题。你读过摘要和实验部分，把自己的疑问整理成一封简短的介绍信；从一个具体问题开始联系，远比空泛地说“希望合作”自然。`,
      `${context.replacement.name}回复了你的问题，💬还反问了一处实验设置。你翻出记录，把当时的取舍解释清楚，新的交流就这样有了开头。与${context.contact.name}的联培计划到此告一段落，接下来你会与${context.replacement.name}继续了解彼此的研究，看看有没有适合一起做的事。`,
    ]),
    "机制结算", resultText].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "result",
    narrativeNames: !unavailable && decision === "decline" ? [context.contact.name, context.replacement.name] : [context.contact.name],
    jointTrainingPreview: { context, decision },
    completionLog: unavailable ?? (decision === "accept"
      ? `你接受了与${context.contact.name}的联合培养，科研上限 +${reward.capBonus}。`
      : `你婉拒了${context.contact.name}的联培邀请，经引荐结识${context.replacement.name}；合作学者：${context.replacement.name}。`),
    choices: [{ id: "close", label: "确定", outcome: resultText, effects }],
  };
}

function createJointTrainingAct2(input: JointTrainingContext): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const levelStory = [
    "对方把眼前课题拆成了几步可行的计划，连容易踩坑的实验细节也标了出来。",
    "你卡了很久的论证，对方换个角度就找到了突破口；那几篇代表作里的思路，这下真用上了。",
    "对方从你的小课题里挑出了一个整个领域都在追问的问题，连导师看完方案也说，这条路值得走。",
  ][context.contact.level];
  return {
    id: "joint-training-act2", title: "联合培养 ➜ 联培抉择",
    description: [`你带着${context.contact.name}的方案和导师商量，💬把自己最拿不准的地方标在页边。${levelStory}你原本只想补齐眼前的结果，讨论着才发现，有些问题值得重新设计实验，而不是再多跑几次。`,
      "接着要想的是自己能拿出多少时间。联培意味着接触不同的研究习惯，也意味着同一组实验可能要向两边解释清楚。你把当前稿件和后续计划分开列下，既想借这次合作把问题做深，又不愿让已经推进的工作因为铺得太开而半途搁置。",
      unavailable ? `📅${unavailable}你核对现有安排，决定把近况坦诚告诉对方；方案中的建议可以留作参考，时间上却不能再作重复承诺。`
        : "📅你试着给第一次讨论列一个提纲，发现最想请教的恰好也是自己最怕被追问的地方。接受，得带着这些不确定走出去；婉拒，则能给眼前的课题留出更完整的时间。你合上日历，想清楚哪一种安排是自己接下来真正做得下去的。"].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "act2",
    narrativeNames: [context.contact.name],
    jointTrainingPreview: { context },
    choices: (["decline", "accept"] as const).map((decision) => ({
      id: decision,
      label: decision === "decline" ? "委婉拒绝" : unavailable ? "暂时放下" : "接受联培",
      outcome: unavailable ? "无事发生" : (decision === "decline" ? "婉拒联培，结识新的合作学者。"
        : `科研上限 +${context.pendingCitationCapBonus}｜idea +${4 + context.contact.level}（永久）｜写作 +${4 + context.contact.level}（永久）。`),
      effects: { enqueueEvents: [createJointTrainingResult(context, decision)] },
    })),
  };
}

export function createJointTrainingAct1(input: JointTrainingContext): PendingEvent {
  const context = normalizeContext(input);
  return {
    id: "joint-training-act1", title: "联合培养",
    description: [
      `📩${context.origin ? `${context.origin}结束后` : "会后"}，${context.contact.name}发来联培邀请，也把方案抄送给了你的导师。你点开邮件时还在整理会上的笔记，看到附件里引用了你们此前讨论的问题，连当时没来得及解释的实验设置都留了批注。这次的“保持联系”，已经变成一份认真写下的合作计划。`,
      unavailableText(context)
        ? `${unavailableText(context)}你仍把附件从头看了一遍，记下几处对当前课题有帮助的建议。邀请需要一个明确的答复，你先整理好近况，免得让对方继续按旧安排等下去。`
        : "你往下翻，设备条件、课题分工和可讨论的方向列了好几页。有些是自己一直缺少的机会，有些却意味着要跳出熟悉的方法重新学起。你在附件旁开了个空文档，先记下想问的问题；要不要接受，得把期待和手头尚未完成的工作放在一起想。",
      `小提示：出现条件：与${context.contact.name}合作≥3次（含本次），科研≥12，且尚未联培。`,
    ].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "act1",
    narrativeNames: [context.contact.name],
    jointTrainingPreview: { context },
    choices: [{ id: "continue", label: "继续", outcome: "查看联培条件。", effects: { enqueueEvents: [createJointTrainingAct2(context)] } }],
  };
}

export function refreshJointTrainingEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.jointTrainingPreview;
  if (!preview) return event;
  const encounter = state.conferenceEncounterState;
  const currentContact = encounter.bigBull;
  const context = {
    ...preview.context,
    active: encounter.bigBullCooperation || !!encounter.jointTrainingReward,
    contactAvailable: !currentContact || currentContact.id === preview.context.contact?.id,
    contact: currentContact?.id === preview.context.contact?.id && currentContact
      ? { ...preview.context.contact!, cooperationCount: currentContact.cooperationCount } : preview.context.contact,
  };
  const refreshed = event.stage === "result" && preview.decision
    ? createJointTrainingResult(context, preview.decision)
    : event.stage === "act2" ? createJointTrainingAct2(context) : createJointTrainingAct1(context);
  return { ...event, ...refreshed, id: event.id, deferredStatePatch: undefined };
}
