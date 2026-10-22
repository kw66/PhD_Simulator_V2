import { gameRandom } from "./v2-game-random";
import { randomOutcome } from "./v2-event-choice-random";
import { createConferenceMentorContact, replaceConferenceMentorContact } from "./v2-conference-contacts";
import { getJointTrainingCitationCapBonus } from "./v2-joint-training-system";
import type { ConferenceMentorContact, EventChoice, GameState, PendingEvent } from "./v2-types";

export interface JointTrainingContext {
  rejectedBigBullCoopCount: number;
  pendingCitationCapBonus: number;
  supportLevel?: 0 | 1 | 2;
  origin?: string;
  contact?: ConferenceMentorContact;
  replacement?: ConferenceMentorContact;
  invitationCitations?: number;
  active?: boolean;
  contactAvailable?: boolean;
}

export function buildJointTrainingContext(
  state: Pick<GameState, "conferenceEncounterState" | "totalCitations">,
  contact?: ConferenceMentorContact,
  getRoll: () => number = gameRandom,
): JointTrainingContext {
  const mentor = contact ?? state.conferenceEncounterState.bigBull
    ?? createConferenceMentorContact({ id: "joint-training-invite", roll: getRoll() });
  return normalizeContext({
    rejectedBigBullCoopCount: state.conferenceEncounterState.rejectedBigBullCoopCount,
    pendingCitationCapBonus: getJointTrainingCitationCapBonus(state.totalCitations),
    invitationCitations: state.totalCitations,
    contact: { ...mentor },
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
  const bonus = 4 + (context.supportLevel ?? 1);
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
      `${unavailable}你和${context.contact.name}说清楚目前的安排，也谢谢对方一直愿意讨论你的工作。`,
      "对方说先把手头的课题做好，有新的问题仍可以交流。你把那几条讨论过的思路记下，没有再占着联培名额。",
    ] : decision === "accept" ? [
      `你告诉${context.contact.name}，自己愿意接下联培。接着与那边的团队聊具体安排，发现他们能给你${(context.supportLevel ?? 1) === 2 ? "较多讨论时间和实验资源" : (context.supportLevel ?? 1) === 1 ? "固定的讨论时间和一部分实验资源" : "定期讨论与基础实验资源"}。你把最想追问的实验问题写在纸上，🤝这回不必只在会场匆匆讲几分钟。`,
      "回到组里，你和导师一起核对两边的进度。想做的事情忽然多了，组会也得参加两边的；你在日历上留了整理材料的时间，免得第一次讨论就被自己没写清的设置难住。",
    ] : [
      `你感谢${context.contact.name}想到你，也说了眼下两篇稿子都在推进，暂时顾不上两边的课题。对方没有勉强，转来另一位学者${context.replacement.name}的一篇相关工作，说对方也在想类似的问题。`,
      `你读到实验部分时圈出一处疑问，便给${context.replacement.name}写了封信，💬从这个具体问题聊起。联培先放下，新的联系却有了开头。`,
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
  return {
    id: "joint-training-act2", title: "联合培养 ➜ 联培抉择",
    description: [`你和导师提起${context.contact.name}说的联培机会，💬导师觉得对方的学术判断很强，也提醒你：换个环境不会让难题自动消失，联培后同一组实验还得向两边解释清楚。具体支持则取决于团队和研究方向。`,
      unavailable ? `${unavailable}你看了看已经排满的日程，决定坦诚说清楚，不让对方继续为你留位置。`
        : "你把眼前的稿件和想尝试的新问题列在一起。若接下邀请，可能有人帮你把卡住的思路往前推；若暂时不去，也能把这篇论文安稳做完。你合上笔记，准备给对方一个明确答复。"].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "act2",
    narrativeNames: [context.contact.name],
    jointTrainingPreview: { context },
    choices: (["decline", "accept"] as const).map((decision) => ({
      id: decision,
      label: decision === "decline" ? "委婉拒绝" : unavailable ? "暂时放下" : "接受联培",
      ...randomOutcome(decision === "accept" && !unavailable),
      outcome: unavailable ? "无事发生" : (decision === "decline" ? "婉拒联培，结识新的合作学者。"
        : "接受联培｜具体增益在下一幕确定"),
      effects: { enqueueEvents: [createJointTrainingResult(context, decision)] },
    })),
  };
}

export function createJointTrainingAct1(input: JointTrainingContext): PendingEvent {
  const context = normalizeContext(input);
  return {
    id: "joint-training-act1", title: "联合培养",
    description: [
      `${context.origin ? `${context.origin}结束后` : "会后"}，${context.contact.name}给你发来消息：他们实验室下学期有联培名额，正在找合适的方向。你们之前几次合作聊得很深入，对方觉得你的课题可以继续往下做，问你有没有兴趣来待一段时间，💬不用现在就答复。`,
      unavailableText(context)
        ? `${unavailableText(context)}你还是认真看完了消息，打算把眼下的安排告诉对方，不让这份好意悬着。`
        : "你盯着那句“有兴趣吗”看了一会儿，才确定这回不是会后惯常的客套。对方水平很高，但到那边具体跟谁做、能投入多少时间还没谈；你得先想清自己想解决什么，也看看目前的论文能不能放下。",
      `小提示：出现条件：与${context.contact.name}合作≥3次（含本次），科研≥12，且尚未联培。`,
    ].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "joint-training", stage: "act1",
    narrativeNames: [context.contact.name],
    jointTrainingPreview: { context },
    choices: [{ id: "continue", label: "继续", outcome: "查看联培条件。", effects: { enqueueEvents: [createJointTrainingAct2(context)] } }],
  };
}

export function revealJointTrainingResult(event: PendingEvent, getRoll: () => number = gameRandom): PendingEvent {
  const preview = event.jointTrainingPreview;
  if (event.stage !== "result" || preview?.decision !== "accept" || preview.context.supportLevel !== undefined) return event;
  const supportLevel = Math.min(2, Math.max(0, Math.floor(getRoll() * 3))) as 0 | 1 | 2;
  const context = {
    ...preview.context,
    supportLevel,
    pendingCitationCapBonus: preview.context.invitationCitations === undefined
      ? preview.context.pendingCitationCapBonus
      : getJointTrainingCitationCapBonus(preview.context.invitationCitations, supportLevel),
  };
  return createJointTrainingResult(context, "accept");
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
