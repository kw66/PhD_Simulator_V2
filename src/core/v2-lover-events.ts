import { createConferenceScholarContact, replaceConferenceScholarContact } from "./v2-conference-contacts";
import { activateLover, getOppositeGender } from "./v2-lover-system";
import { canAddRelationship } from "./v2-relationship-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { applyTierResist, formatTierResistedOutcome } from "./v2-sanity-rules";
import type { ConferenceEncounterState, ConferenceScholarContact, EventChoice, GameState, Gender, LoverTypeId, PendingEvent } from "./v2-types";

export interface LoverDevelopmentContext {
  type: LoverTypeId;
  totalMonths: number;
  rejectCount: number;
  playerGender: Gender;
  loverGender: Gender;
  canAddRelationship?: boolean;
  origin?: string;
  contact?: ConferenceScholarContact;
  replacement?: ConferenceScholarContact;
  scholars?: ConferenceEncounterState["scholars"];
  research?: number;
  researchCap?: number;
  contactAvailable?: boolean;
  setAside?: boolean;
  profileRolls?: [number, number];
}

export function buildLoverDevelopmentContext(input: {
  conferenceEncounterState: Pick<ConferenceEncounterState, "rejectedBeautifulLoverCount" | "rejectedSmartLoverCount" | "scholars">;
  totalMonths: number;
  type: LoverTypeId;
  playerGender: Gender;
  canAddRelationship?: boolean;
  state?: GameState;
  contact?: ConferenceScholarContact;
  origin?: string;
}, getRoll: () => number = Math.random): LoverDevelopmentContext {
  const encounter = input.state?.conferenceEncounterState ?? input.conferenceEncounterState;
  const contact = input.contact ?? encounter.scholars?.[input.type]
    ?? createConferenceScholarContact(input.type, { id: "conference-contact", playerGender: input.playerGender });
  return normalizeContext({
    type: input.type, totalMonths: input.totalMonths, playerGender: input.playerGender,
    loverGender: contact.gender,
    canAddRelationship: input.state ? canAccept(input.state) : input.canAddRelationship ?? true,
    rejectCount: input.type === "beautiful" ? encounter.rejectedBeautifulLoverCount : encounter.rejectedSmartLoverCount,
    origin: input.origin,
    contact: { ...contact }, scholars: { ...encounter.scholars },
    research: input.state?.player.research,
    researchCap: input.state ? getResearchCap(input.state.researchCapacityState) : undefined,
    profileRolls: [getRoll(), getRoll()],
  });
}

function canAccept(state: GameState): boolean {
  return !state.loverState.active && canAddRelationship(state.relationshipState, "lover");
}

function normalizeContext(context: LoverDevelopmentContext): LoverDevelopmentContext & { contact: ConferenceScholarContact; replacement: ConferenceScholarContact } {
  const contact = context.contact ?? createConferenceScholarContact(context.type, { id: "conference-contact", playerGender: context.playerGender });
  return {
    ...context, contact, loverGender: contact.gender, profileRolls: context.profileRolls ?? [0.5, 0.5],
    replacement: context.replacement ?? replaceConferenceScholarContact(contact, context.type, { id: `${contact.id}:replacement`, playerGender: context.playerGender }),
  };
}

function getTypeName(type: LoverTypeId): string {
  return type === "beautiful" ? "活泼" : "聪慧";
}

export const LOVER_OCCUPIED_TEXT = "可你已经有了恋人。你把差点说出口的话咽了回去，这份心意只能先放下。";

function unavailableText(context: LoverDevelopmentContext): string | undefined {
  if (context.setAside || context.canAddRelationship === false) return "已有恋人，本次暂时放下，不新增关系，不计拒绝次数，不发放奖励。";
  if (context.contactAvailable === false) return "这位同行已不再是当前联系的人，本次暂时放下，不改变关系或奖励。";
  return undefined;
}

function createLoverResult(input: LoverDevelopmentContext, decision: "accept" | "decline"): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const research = applyTierResist(1, context.research ?? 0, () => 0, context.researchCap ?? 20);
  const rewardText = context.type === "beautiful" ? "SAN上限 +3" : formatTierResistedOutcome("科研", 1, research);
  const replacementUpdates: Partial<ConferenceEncounterState> = {
    scholars: { ...context.scholars, [context.type]: context.replacement },
    ...(context.type === "beautiful"
      ? { beautifulCount: 0, metBeautiful: false, rejectedBeautifulLoverCount: 0, permanentlyBlockedBeautifulLover: false }
      : { smartCount: 0, metSmart: false, rejectedSmartLoverCount: 0, permanentlyBlockedSmartLover: false }),
  };
  const effects: EventChoice["effects"] = unavailable ? {} : decision === "decline"
    ? { conferenceEncounterUpdates: replacementUpdates }
    : {
      ...(context.type === "beautiful" ? { sanCapDelta: 3 } : { research: research.effectiveChange }),
      loverStateUpdates: { ...activateLover(context.type, context.totalMonths, context.playerGender),
        name: context.contact.name, contactId: context.contact.id, gender: context.contact.gender },
      activateLoverProgress: context.type,
      loverProgressRolls: context.profileRolls,
      relationshipAdditions: ["lover"],
      conferenceEncounterUpdates: replacementUpdates,
    };
  const resultText = unavailable ?? (decision === "accept"
    ? `结果：恋人 +1（${getTypeName(context.type)}）｜${rewardText}`
    : "结果：无事发生");
  return {
    id: `lover-development-result-${unavailable ? "set-aside" : decision}-${context.type}-${context.totalMonths}`,
    title: `发展关系 ➜ 你的心意 ➜ ${unavailable ? "暂时放下" : decision === "accept" ? "关系确认" : "保持距离"}`,
    description: [unavailable ?? (decision === "accept"
      ? `你和${context.contact.name}确认了彼此的心意。第一顿饭还没吃，聊天框里已经问起了忌口；你在组会和实验之间，认真圈出一个空着的晚上。`
      : `你认真向${context.contact.name}说明自己的想法。你们仍是同行，但这段心意就此放下。`),
    unavailable ? "你们仍会交流论文，只是那天谁也没再提这件事。"
      : decision === "accept" ? "以后去会场，你也会认识新的同行。而这一次，回去路上等着你的消息，有了不一样的分量。"
        : "关掉手机时，你没有再补一句“等我忙完”。下一次参加会议，也许会遇见另一个聊得来的人。",
    "机制结算", resultText].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "lover-development", stage: "result",
    loverDevelopmentPreview: { context, decision },
    completionLog: unavailable ?? (decision === "accept" ? `${context.contact.name}成为你的${getTypeName(context.type)}恋人，${rewardText}。` : `你和${context.contact.name}保持距离，今后仍可结识新的同行。`),
    choices: [{ id: "close", label: "确定", outcome: resultText, effects }],
  };
}

export function createLoverSetAsideChoice(type: LoverTypeId, totalMonths: number): EventChoice {
  const context: LoverDevelopmentContext = {
    type, totalMonths, rejectCount: 0, playerGender: "male", loverGender: getOppositeGender("male"), setAside: true,
  };
  return { id: "accept", label: "暂时放下", outcome: "已有恋人｜不新增关系，不计拒绝次数。",
    effects: { enqueueEvents: [createLoverResult(context, "accept")] } };
}

function createLoverDevelopmentAct2(input: LoverDevelopmentContext): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const confession = context.type === "beautiful"
    ? `这次见面，${context.contact.name}比平时安静，憋了半天才开口：“我挺喜欢和你待在一起的，要不要试试在一起？”`
    : `这次见面，${context.contact.name}把论文合上，认真地看着你：“不聊论文的时候，我们好像也有说不完的话。你愿意试试在一起吗？”`;
  return {
    id: `lover-development-act2-${context.type}-${context.totalMonths}`, title: "发展关系 ➜ 你的心意",
    description: [confession, context.canAddRelationship === false ? LOVER_OCCUPIED_TEXT
      : unavailable ?? "你想起那些聊到深夜的晚上，原来不止你一个人舍不得结束话题。你可以认真回应，也可以坦诚地保持距离。"].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "lover-development", stage: "act2",
    loverDevelopmentPreview: { context },
    choices: (["decline", "accept"] as const).map((decision) => ({
      id: decision,
      label: decision === "decline" ? "先保持距离" : unavailable ? "暂时放下" : "尝试在一起",
      outcome: unavailable ?? (decision === "decline" ? "结束这段心意，今后仍可结识新的同行。" : "恋人数量 = 0｜确认关系，恋人 +1。"),
      effects: { enqueueEvents: [createLoverResult({ ...context, setAside: context.canAddRelationship === false }, decision)] },
    })),
  };
}

export function createLoverDevelopmentAct1(input: LoverDevelopmentContext): PendingEvent {
  const context = normalizeContext(input);
  return {
    id: `lover-development-act1-${context.type}-${context.totalMonths}`, title: "发展关系",
    description: [
      ...(context.origin ? [`在${context.origin}见面后，你们一直保持着联系。`] : []),
      `你和${context.contact.name}渐渐熟了。${context.type === "beautiful"
        ? "起初互发论文链接，后来连食堂出了什么新菜，也要拍张照片给对方看。"
        : "一个问题讨论到深夜，聊天记录里夹着公式、草图，还有一句互相提醒的“早点睡”。"}`,
      unavailableText(context) ?? "后来，论文讲完了，话题还没结束。看见手机上的名字，你忍不住笑起来。",
    ].join("\n\n"),
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "lover-development", stage: "act1",
    loverDevelopmentPreview: { context },
    choices: [{ id: "continue", label: "继续", outcome: "确认彼此心意。", effects: { enqueueEvents: [createLoverDevelopmentAct2(context)] } }],
  };
}

export function refreshLoverDevelopmentEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.loverDevelopmentPreview;
  if (!preview) return event;
  const currentContact = state.conferenceEncounterState.scholars?.[preview.context.type];
  const context = {
    ...preview.context,
    canAddRelationship: canAccept(state),
    setAside: !canAccept(state),
    contactAvailable: !currentContact || currentContact.id === preview.context.contact?.id,
    scholars: { ...state.conferenceEncounterState.scholars },
    research: state.player.research, researchCap: getResearchCap(state.researchCapacityState),
    contact: currentContact?.id === preview.context.contact?.id && currentContact
      ? { ...preview.context.contact!, encounterCount: currentContact.encounterCount } : preview.context.contact,
  };
  const refreshed = event.stage === "result" && preview.decision
    ? createLoverResult(context, preview.decision)
    : event.stage === "act2" ? createLoverDevelopmentAct2(context) : createLoverDevelopmentAct1(context);
  return { ...event, ...refreshed, id: event.id, deferredStatePatch: undefined };
}
