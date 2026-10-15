import { gameRandom } from "./v2-game-random";
import { createConferenceScholarContact, replaceConferenceScholarContact } from "./v2-conference-contacts";
import { activateLover, getOppositeGender } from "./v2-lover-system";
import { canAddRelationship } from "./v2-relationship-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { getPlayerResistanceReduction } from "./v2-player-attributes";
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
  researchResistanceReduction?: number;
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
}, getRoll: () => number = gameRandom): LoverDevelopmentContext {
  const encounter = input.state?.conferenceEncounterState ?? input.conferenceEncounterState;
  const profileRolls: [number, number] = [getRoll(), getRoll()];
  const contact = input.contact ?? encounter.scholars?.[input.type]
    ?? createConferenceScholarContact(input.type, { id: "lover-development", roll: getRoll(), playerGender: input.playerGender });
  return normalizeContext({
    type: input.type, totalMonths: input.totalMonths, playerGender: input.playerGender,
    loverGender: contact.gender,
    canAddRelationship: input.state ? canAccept(input.state) : input.canAddRelationship ?? true,
    rejectCount: input.type === "beautiful" ? encounter.rejectedBeautifulLoverCount : encounter.rejectedSmartLoverCount,
    origin: input.origin,
    contact: { ...contact }, scholars: { ...encounter.scholars },
    research: input.state?.player.research,
    researchCap: input.state ? getResearchCap(input.state.researchCapacityState) : undefined,
    researchResistanceReduction: input.state ? getPlayerResistanceReduction(input.state, "research", 1) : 0,
    profileRolls,
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

export const LOVER_OCCUPIED_TEXT = "可你已经有了恋人，决定把近况说清楚，不让对方误会。";

function unavailableText(context: LoverDevelopmentContext): string | undefined {
  if (context.setAside || context.canAddRelationship === false) return "你已有恋人，便坦诚说明近况，没有答应这次单独见面的邀约。";
  if (context.contactAvailable === false) return "你们已经渐渐失去联系，这次没能赴的约，也就留在了过去。";
  return undefined;
}

function createLoverResult(input: LoverDevelopmentContext, decision: "accept" | "decline"): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const research = applyTierResist(1, context.research ?? 0, () => 0, context.researchCap ?? 20, context.researchResistanceReduction ?? 0);
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
      ...(context.type === "beautiful" ? { sanCapDelta: 3 } : { research: research.effectiveChange, rawResearch: 1 }),
      loverStateUpdates: { ...activateLover(context.type, context.totalMonths, context.playerGender),
        name: context.contact.name, contactId: context.contact.id, gender: context.contact.gender },
      activateLoverProgress: context.type,
      loverProgressRolls: context.profileRolls,
      relationshipAdditions: ["lover"],
      conferenceEncounterUpdates: replacementUpdates,
    };
  const resultText = unavailable ? "结果：无事发生" : (decision === "accept"
    ? `结果：恋人 +1（${getTypeName(context.type)}）｜${rewardText}`
    : `结果：${getTypeName(context.type)}学者：${context.replacement.name}`);
  const narrative = unavailable
    ? context.contactAvailable === false && !context.setAside && context.canAddRelationship !== false
      ? [
        `你翻到和${context.contact.name}的聊天记录，📍那家小店的定位还在。上次说话已隔了很久，当时约好的日期也早就过去了。`,
        "你打出一句“最近还好吗”，又想起彼此已经没有按原来的节奏联系。字删掉后，屏幕仍亮了一会儿；那顿饭最终没有约成。",
      ]
      : [
        `你向${context.contact.name}说明了近况。${unavailable}你斟酌了一下措辞，还是把话说清楚，免得对方继续等一个含糊的回答。`,
        "对方回了句“明白”，还叮嘱你别再忙得忘记吃饭。你谢过这份关心，却也知道那顿单独的晚饭不会再约了。",
      ]
    : decision === "accept"
      ? context.type === "beautiful"
        ? [
          `你对${context.contact.name}说：“可以试试。”对方笑了一下，又确认：“不是因为我让你吃最后一块🍰蛋糕吧？”你说不是，对方才把盘子推过来：“那先庆祝一下。”`,
          "说到周末，两个人都翻出手机找时间。对方挑中学校附近一家小店，还认真问你有没有忌口。走出店门时你们放慢了脚步，明明顺路，却都没急着道别。",
        ]
        : [
          `你告诉${context.contact.name}，自己也愿意试着往前走一步。对方放下杯子，笑着说：“我刚才把这句话在心里练了三遍。”你承认自己也紧张，这才一起笑出声。`,
          "回去路上，你们商量周末去逛书店，结果先争论起哪家店旁边的面馆更好吃。对方发来📍地址，你回了个“好”，又补上一句：“这次我不会走错门。”",
        ]
      : context.type === "beautiful"
        ? [
          `你感谢${context.contact.name}，却说自己还没有一样的心意。对方本想像平时那样打个趣，话到嘴边又停住，最后点点头说“明白了”。你没有急着把气氛往回拉。`,
          `你们在路口道别。后来一次会场交流中，${context.replacement.name}拿着📷拍下的海报来问实验细节。你们聊得很自然，先交换了资料，再慢慢记住彼此的名字。`,
        ]
        : [
          `你对${context.contact.name}说，自己很珍惜这些交流，却没准备好开始一段关系。对方低头扣上笔帽，过了一会儿才说理解。那页本来要继续讨论的草图，你们都没有再翻开。`,
          `你们没有再约那顿饭。后来${context.replacement.name}在会场拿着📎讲义问起一个研究问题，你们聊了起来。交换资料时，你也认真记下了这位新同行的名字。`,
        ];
  return {
    id: `lover-development-result-${unavailable ? "set-aside" : decision}-${context.type}-${context.totalMonths}`,
    title: `发展关系 ➜ 你的心意 ➜ ${unavailable ? "暂时放下" : decision === "accept" ? "关系确认" : "保持距离"}`,
    description: [...narrative, "机制结算", resultText].join("\n\n"),
    narrativeNames: !unavailable && decision === "decline" ? [context.contact.name, context.replacement.name] : [context.contact.name],
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "lover-development", stage: "result",
    loverDevelopmentPreview: { context, decision },
    completionLog: unavailable ?? (decision === "accept" ? `${context.contact.name}成为你的${getTypeName(context.type)}恋人，${rewardText}。` : `你婉拒了${context.contact.name}的心意；后来通过学术交流结识了${context.replacement.name}。${getTypeName(context.type)}学者：${context.replacement.name}。`),
    choices: [{ id: "close", label: "确定", outcome: resultText, effects }],
  };
}

export function createLoverSetAsideChoice(type: LoverTypeId, totalMonths: number): EventChoice {
  const context: LoverDevelopmentContext = {
    type, totalMonths, rejectCount: 0, playerGender: "male", loverGender: getOppositeGender("male"), setAside: true,
  };
  return { id: "accept", label: "暂时放下", outcome: "无事发生",
    effects: { enqueueEvents: [createLoverResult(context, "accept")] } };
}

function createLoverDevelopmentAct2(input: LoverDevelopmentContext): PendingEvent {
  const context = normalizeContext(input);
  const unavailable = unavailableText(context);
  const confession = unavailable
    ? `你重新读了${context.contact.name}发来的📍小店定位，想起当时自己答应得有多快。可近况已经变了，这次不能再像原先说好的那样赴约。`
    : context.type === "beautiful"
      ? `饭后，${context.contact.name}指着菜单说下次还想试另一道甜点，接着又问：“下次也只约我们俩，可以吗？”见你愣住，对方笑着补了一句：“别紧张，我只是想多见你几次。”`
      : `和${context.contact.name}坐下后，你们从学校附近哪家店关门最晚聊到周末想去的地方。对方说本来准备了几句开场白，结果一句也用不上：“我想多了解你，平时也能约出来走走吗？”`;
  const reflection = context.type === "beautiful"
    ? "你想起那些不赶时间的饭后散步，也想起自己忙起来总忘记回消息。对方把🍰最后一块蛋糕推过来，没催你，只问要不要再坐一会儿。"
    : "你转着☕杯子，想起几次散场后明明可以直接回去，却还是一起绕了远路。你想认真回答，又怕一句话说得太郑重，反而让两个人都不自在。";
  return {
    id: `lover-development-act2-${context.type}-${context.totalMonths}`, title: "发展关系 ➜ 你的心意",
    description: [confession, context.canAddRelationship === false || context.setAside ? LOVER_OCCUPIED_TEXT
      : unavailable ? `${unavailable} 你没有再追问那顿饭的日期，只把聊天记录停在了这里。` : reflection].join("\n\n"),
    narrativeNames: [context.contact.name],
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "lover-development", stage: "act2",
    loverDevelopmentPreview: { context },
    choices: (["decline", "accept"] as const).map((decision) => ({
      id: decision,
      label: decision === "decline" ? "先保持距离" : unavailable ? "暂时放下" : "尝试在一起",
      outcome: unavailable ? "无事发生" : decision === "decline" ? `${getTypeName(context.type)}学者：${context.replacement.name}` : "恋人 +1",
      effects: { enqueueEvents: [createLoverResult({ ...context, setAside: context.canAddRelationship === false }, decision)] },
    })),
  };
}

export function createLoverDevelopmentAct1(input: LoverDevelopmentContext): PendingEvent {
  const context = normalizeContext(input);
  return {
    id: `lover-development-act1-${context.type}-${context.totalMonths}`, title: "发展关系",
    description: [
      `${context.origin ? `这次在${context.origin}又见到了${context.contact.name}。` : `几次在会场碰面，你和${context.contact.name}渐渐熟了。`}${context.type === "beautiful"
        ? "你错过饭点时，对方发来📷食堂新菜的照片，附一句“再晚就卖完啦”。后来会场茶歇多出一块小点心，对方说是拿多了，你也没拆穿。"
        : "起初你们聊会上的报告，后来也会互发学校附近的小店。一次散场突然下雨，对方问你带没带伞；你说带了，却发现伞还在宿舍，对方笑着把伞往你这边挪了挪。"}`,
      unavailableText(context) ?? (context.type === "beautiful"
        ? "散场时，对方问：“下次不赶会了，单独吃顿饭？”你答应得很快，走出几步才想起没问是哪天。回宿舍后，对方把小店定位发来，你又把日历翻了一遍。"
        : "散场后，对方发来一家小店的位置：“下次只我们俩去吃饭？”你回了“好”，又觉得太短，补了一句“那家店有什么好吃的”。等消息时，你连桌上的水凉了都没察觉。"),
      `小提示：出现条件：与${context.contact.name}搭讪≥3次（含本次），社交≥12，且没有恋人。`,
    ].join("\n\n"),
    narrativeNames: [context.contact.name],
    source: "fixed", blocking: true, deadlineMonths: 0, chainId: "lover-development", stage: "act1",
    loverDevelopmentPreview: { context },
    choices: [{ id: "continue", label: "继续", outcome: "看看这份邀约。", effects: { enqueueEvents: [createLoverDevelopmentAct2(context)] } }],
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
    researchResistanceReduction: getPlayerResistanceReduction(state, "research", 1),
    contact: currentContact?.id === preview.context.contact?.id && currentContact
      ? { ...preview.context.contact!, encounterCount: currentContact.encounterCount } : preview.context.contact,
  };
  const refreshed = event.stage === "result" && preview.decision
    ? createLoverResult(context, preview.decision)
    : event.stage === "act2" ? createLoverDevelopmentAct2(context) : createLoverDevelopmentAct1(context);
  return { ...event, ...refreshed, id: event.id, deferredStatePatch: undefined };
}
