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

export const LOVER_OCCUPIED_TEXT = "可你已经有了恋人。你不想让对方误会，也不愿辜负身边的人，决定把自己的近况说清楚。";

function unavailableText(context: LoverDevelopmentContext): string | undefined {
  if (context.setAside || context.canAddRelationship === false) return "你已有恋人，便坦诚说明近况，没有答应这次单独见面的邀约。";
  if (context.contactAvailable === false) return "你们已经渐渐失去联系，这次没能赴的约，也就留在了过去。";
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
  const resultText = unavailable ? "结果：无事发生" : (decision === "accept"
    ? `结果：恋人 +1（${getTypeName(context.type)}）｜${rewardText}`
    : `结果：${getTypeName(context.type)}学者：${context.replacement.name}`);
  const narrative = unavailable
    ? context.contactAvailable === false && !context.setAside && context.canAddRelationship !== false
      ? [
        `你翻到和${context.contact.name}的聊天记录，才发现上次交谈已经隔了很久。那张📍小店定位还夹在论文链接中间，点进去，营业时间已经改过了。你打出一句“最近还好吗”，又停下来想了想。`,
        "走廊的灯熄了一排，你收起手机，没再追问那顿饭还约不约。回到工位，先前借给对方的书已经放在桌角，里面夹着一张写了“谢谢”的便签；你把书放回架上，也关掉了那个聊天窗口。",
      ]
      : [
        `你给${context.contact.name}回消息时，在输入框前坐了好一会儿。${unavailable}写到“以后有机会”时，你又把这几个字删掉，重新检查了一遍才按下发送。`,
        "对方过了一会儿回了句“明白了”，又问起会上提过的数据集。你找出📎资料链接发过去，接着收到恋人问晚饭吃什么的消息。桌边的饭卡差点被论文盖住，你摸了两遍才找到，赶紧起身出门。",
      ]
    : decision === "accept"
      ? context.type === "beautiful"
        ? [
          `你向${context.contact.name}点了点头：“我也想和你试试。”对方刚笑起来，又低头问了一遍“真的？”你伸手碰了碰桌边那只手，两个人都没再缩回去。刚才还能滔滔不绝介绍的小店，这会儿倒谁也想不起名字了。`,
          "走到门口，你终于想起周末还有一组实验，赶紧把日程翻出来。对方凑过来看，划掉原先想去的远郊，改成学校附近吃晚饭：“那就等你关仪器，我先去排队。”你有些不好意思，又忍不住把那个晚上标了颗💗小心心。",
          "回去的路上，手机接连亮了几次，一张菜单、一句忌口调查，最后又补了句“到宿舍告诉我”。你站在楼下回完消息才上楼，室友问怎么这么晚，你把门带上，笑着说刚才多走了一段路。",
        ]
        : [
          `你看着${context.contact.name}，把那句“我也喜欢你”说了出来。对方握着笔的手松下来，笔帽滚到桌沿，你们同时伸手去接，碰到一起又笑了。原来刚才那页纸上反复描深的线，根本不是什么待解的公式。`,
          "说到毕业后的城市，你还是迟疑了一下：“我现在真说不准。”对方点点头，把没吃完的点心往你这边推：“我也没有定，等有消息了就告诉你。”你拿起一块，才发现两个人为了说这几句话，已经把茶放凉了。",
          "出门后，你们沿着🌙月光下的操场慢慢走。话题又绕到实验，你刚想掏手机找图，对方却先问晚饭吃饱没有。你把手机放回口袋，说还想吃碗面；这一次，陪你绕去食堂的人牵住了你的手。",
        ]
      : context.type === "beautiful"
        ? [
          `你向${context.contact.name}道了谢，话到嘴边却停了几秒：“和你聊天很开心，但我没有同样的心意。”对方转了转手里的杯子，把已经打开的小店页面按灭。你想找句轻松的话，最后只低声说了句抱歉。`,
          "出门时，对方仍替你扶了一下门，却没再像往常那样问要不要绕去买夜宵。你们在路口分别，这段还没开始的恋爱就此结束。回到宿舍，你把打了一半的“到家了吗”删掉，桌上的实验记录很久才翻过一页。",
          `后来一次学术交流中，${context.replacement.name}拿着📷拍下的海报来问你一个实验细节，讲着讲着又笑起会场迷路的经历。你们交换了资料和姓名。这个新认识的同行渐渐进入你的视野，聊天先从那组没讲完的数据开始。`,
        ]
        : [
          `你看着${context.contact.name}摊开的笔记，犹豫着说：“我很喜欢和你讨论问题，可是……我没有一样的心意。”对方的笔停在半空，过了一会儿才扣上笔帽，说了句“我知道了”。那道原本想接着聊的问题，谁也没有再提。`,
          "你们各自收好东西，走到路口，对方说接下来会忙一阵，就不再约饭了。你点点头，看着对方过了马路。这段心意到这里落了幕；后来再翻到那页一起画过的草图，你仍记得当时没能说顺的那句话。",
          `后来在一次学术交流里，${context.replacement.name}对着📎讲义问起你用过的基线。你们借了支笔，在空白处列了几种验证办法，散场才想起交换姓名。这个新同行的名字留在了你的资料旁，下一次联系约的是互发实验结果。`,
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
    ? `你重新读了一遍${context.contact.name}发来的消息，手指停在那张📍小店定位上。想起几次散场后并肩走过的路，你还是点开了回复框；打好的“这周末呢”却迟迟没有发出去，从收到消息到现在，有些事情已经不同了。`
    : context.type === "beautiful"
      ? `饭后，${context.contact.name}举着菜单说这家的甜点值得再来，你刚点头，手机上的实验通知就亮了。对方没像平时那样打趣，只把菜单放下，捏了捏杯套：“其实今天不只是想请你吃饭。我喜欢你，想和你在一起。”`
      : `${context.contact.name}带来的笔记一直没翻开，点单时还把你的那杯茶记错了。聊到毕业后想去的城市，对方沉默了一会儿，忽然把笔推到一边：“以后的事我还没有想好。但今天约你出来，是想问你愿不愿意和我在一起。”`;
  const reflection = context.type === "beautiful"
    ? "你下意识把手机扣在桌上。对方曾冒雨给你带过夜宵，也在你放鸽子时发来一长串生气的小表情；想到这些，你嘴角动了动，又担心自己总把约定排在实验后面。桌上的🍰蛋糕还剩最后一口，对方没有催你，只问要不要再坐一会儿。"
    : "你想起那些聊到宿舍断电的晚上，也想起有回争论一个做法，两个人半天没说话，最后还是对方先发来了补充实验。此刻桌边的☕茶杯被你转了半圈，你欣赏面前这个人，却还分不清自己舍不得结束的，究竟只是话题，还是每次一起回去的路。";
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
        ? "起初见面只聊论文，后来食堂出了新菜，对方也会发来📷照片，附一句“看着好吃，千万别买”。有次你错过饭点，对方还拎着饭盒等在实验楼下，一边抱怨饭快凉了，一边问你的实验跑完没有。"
        : "从茶歇时没聊完的问题，到深夜发来的几笔草图，你们的话题渐渐多了起来。有次你把失败结果发过去，对方回了一页📎标注，末尾却另起一行问你吃饭没有。你看着那行字，先回了晚饭，才去看实验。"}`,
      unavailableText(context) ?? (context.type === "beautiful"
        ? "散场时，你们照例并肩往外走，对方在门口停住：“下次不赶会了，找天一起吃饭？就我们俩。”你差点照常开个玩笑，看到对方正等你的回答，又把话咽了回去。回宿舍后，那家小店的位置还在屏幕上，你翻了两遍日历才开始打字。"
        : "散场后，对方发来一家安静小店的位置：“下次想单独请你吃饭，聊点论文以外的事。”你回了个“好”，又担心显得太随意，补问哪天方便。对方正在输入的提示亮了又灭，你盯着屏幕，才发现自己已经把打开的论文晾了好一会儿。"),
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
    contact: currentContact?.id === preview.context.contact?.id && currentContact
      ? { ...preview.context.contact!, encounterCount: currentContact.encounterCount } : preview.context.contact,
  };
  const refreshed = event.stage === "result" && preview.decision
    ? createLoverResult(context, preview.decision)
    : event.stage === "act2" ? createLoverDevelopmentAct2(context) : createLoverDevelopmentAct1(context);
  return { ...event, ...refreshed, id: event.id, deferredStatePatch: undefined };
}
