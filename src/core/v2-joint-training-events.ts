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
  if (context.active) return "你已经开始联合培养，本次不再重复领取奖励。";
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
  const resultText = unavailable ?? (decision === "accept"
    ? `科研上限 +${reward.capBonus}\n\nidea +${bonus}（永久）｜写作 +${bonus}（永久）`
    : "结果：未接受联培");
  return {
    id: `joint-training-result-${decision}`,
    title: `联合培养 ➜ 联培抉择 ➜ ${unavailable ? "暂时放下" : decision === "accept" ? "已确认" : "暂不接受"}`,
    description: [unavailable ?? (decision === "accept"
      ? `你回信确认了与${context.contact.name}的联培安排，也抄送给导师。参考文献里的名字，如今进了邮件收件人一栏。`
      : `你认真谢过${context.contact.name}，决定先把眼前的课题做好。`),
    unavailable ? "你把邮件收好，重新打开手头的实验记录。" : decision === "accept"
      ? "你把合作笔记放进课题文件夹，准备先核清后续实验的设置。新的条件落实了，该重跑的实验还是得重跑。"
      : "你们各自回到原来的研究安排。下一次走进会场，仍会有新的学者、新的问题等着你。",
    "机制结算", resultText].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "result",
    jointTrainingPreview: { context, decision },
    completionLog: unavailable ?? (decision === "accept"
      ? `你接受了联合培养，科研上限 +${reward.capBonus}。`
      : `你婉拒了${context.contact.name}的联培邀请，之后仍可结识新的学者。`),
    choices: [{ id: "close", label: "确定", outcome: resultText, effects }],
  };
}

function createJointTrainingAct2(input: JointTrainingContext): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const levelStory = [
    "对方在这个方向深耕多年，把眼前课题拆成了几步可行的计划。",
    "对方的几篇代表作你都读过，实验室里也常有人提起这个名字。",
    "会场报告厅座无虚席，连导师也特意向你提起了对方在领域里的影响。",
  ][context.contact.level];
  return {
    id: "joint-training-act2", title: "联合培养 ➜ 联培抉择",
    description: [`你拿${context.contact.name}的方案和导师商量。${levelStory}`,
      unavailable ?? "想到往后要和两边讨论进展，兴奋里又添了点紧张。你也可以婉拒，把时间留给眼前的课题。"].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "act2",
    jointTrainingPreview: { context },
    choices: (["decline", "accept"] as const).map((decision) => ({
      id: decision,
      label: decision === "decline" ? "暂不接受" : unavailable ? "暂时放下" : "接受联培",
      outcome: unavailable ?? (decision === "decline" ? "结束这段合作，之后仍可结识新的学者。"
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
      `${context.origin ? `${context.origin}结束后` : "会后"}，${context.contact.name}发来联培邀请，也把方案抄送给了你的导师。`,
      unavailableText(context) ?? "你点开附件，设备、课题和合作安排列了好几页。原以为会场上的“以后多联系”是句客气话，对方连方案都写好了。",
    ].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "act1",
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
