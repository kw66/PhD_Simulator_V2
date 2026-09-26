import { activateLover } from "./v2-lover-system";
import type { ConferenceEncounterState, Gender, LoverTypeId, PendingEvent } from "./v2-types";
import { getOppositeGender } from "./v2-lover-system";

export interface LoverDevelopmentContext {
  type: LoverTypeId;
  totalMonths: number;
  rejectCount: number;
  playerGender: Gender;
  loverGender: Gender;
  canAddRelationship?: boolean;
  origin?: string;
}

export function buildLoverDevelopmentContext(input: {
  conferenceEncounterState: Pick<ConferenceEncounterState, "rejectedBeautifulLoverCount" | "rejectedSmartLoverCount">;
  totalMonths: number;
  type: LoverTypeId;
  playerGender: Gender;
  canAddRelationship?: boolean;
}): LoverDevelopmentContext {
  return {
    type: input.type,
    totalMonths: input.totalMonths,
    playerGender: input.playerGender,
    loverGender: getOppositeGender(input.playerGender),
    canAddRelationship: input.canAddRelationship ?? true,
    rejectCount: input.type === "beautiful"
      ? input.conferenceEncounterState.rejectedBeautifulLoverCount
      : input.conferenceEncounterState.rejectedSmartLoverCount,
  };
}

function getTypeName(type: LoverTypeId): string {
  return type === "beautiful" ? "活泼" : "聪慧";
}

function getIntroText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "你和那位开朗的同行渐渐熟了。起初互发论文链接，后来连食堂出了什么新菜，也要拍张照片给对方看。"
    : "你和那位思路清楚的同行又聊起论文。一个问题讨论到深夜，聊天记录里夹着公式、草图，还有一句互相提醒的‘早点睡’。";
}

function getSceneText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "手机亮起来，你看一眼名字就忍不住笑。旁边的同学探头问是不是中稿了，你赶紧把屏幕扣下。"
    : "后来，论文讲完了，话题还没结束。对方问你今天过得怎么样，你打了句‘实验还行’，想了想，又多写了几句。";
}

function getThoughtText(context: LoverDevelopmentContext): string {
  const pronoun = context.loverGender === "male" ? "他" : "她";
  return context.type === "beautiful"
    ? `“我好像真的有点喜欢${pronoun}。只是读研已经够忙了，谈恋爱以后还得留出时间陪${pronoun}。”`
    : "“不聊论文的时候，我们也有话说。我想和对方再靠近一些，又怕只是自己想多了。”";
}

function createLoverDeclineResult(context: LoverDevelopmentContext): PendingEvent {
  const nextRejectCount = context.rejectCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `lover-development-result-decline-${context.type}-${nextRejectCount}`,
    title: "发展关系 ➜ 你的心意 ➜ 暂缓关系",
    description: permanentlyBlocked
      ? [
          "你删掉打了几遍的‘再看看’，认真说明自己想做普通朋友。对方过了一会儿，回了句‘明白了’。",
          "你们仍可以交流论文，只是聊完正事，便各自道别。下一次见面的安排没有再提。",
          "机制结算",
          `关系线拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "今后不会再与对方发展恋人关系。",
        ].join("\n\n")
      : [
          "你说自己还没想好，想先保持现在的关系。发出去以后，聊天框安静了一会儿，对方回了句‘好，不着急’。",
          "你们又聊了几句近况。关掉手机时，你没有再补一句‘等我忙完’，毕竟研究生什么时候能忙完，自己也说不准。",
          "机制结算",
          `关系线拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "以后还有一次机会。",
        ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "result",
    completionLog: permanentlyBlocked
      ? `你明确了自己的心意，今后不再与这位${getTypeName(context.type)}学者发展恋人关系。`
      : "你暂时保持距离，还没有作出交往的承诺。",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "继续当前生活。",
      effects: {},
    }],
  };
}

function createLoverAcceptResult(context: LoverDevelopmentContext): PendingEvent {
  const typeLabel = context.type === "beautiful" ? "活泼恋人" : "聪慧恋人";
  const effectText = context.type === "beautiful"
    ? "科研3～6、亲密9～12；每月自动推进玩耍，学习获得一半进度。"
    : "科研9～12、亲密3～6；每月自动推进学习，玩耍获得一半进度。";

  return {
    id: `lover-development-result-accept-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 你的心意 ➜ 关系确认",
    description: [
      "你把心意说了出来，也得到了明确的回应。确定开始交往以后，你们反倒有点不好意思，刚才想好的话一时都忘了。",
      "你们约好找时间一起吃顿饭。第一顿饭还没吃，聊天框里已经问起了忌口。你翻开日历，在组会和实验之间，认真圈出一个空着的晚上。",
      "机制结算",
      `${typeLabel}：${effectText}`,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "result",
    completionLog: `你确认了这段关系，${typeLabel}加入了你的生活。`,
    choices: [{
      id: "close",
      label: "继续",
      outcome: "关系开始。",
      effects: {},
    }],
  };
}

function createLoverDevelopmentAct2(context: LoverDevelopmentContext): PendingEvent {
  const nextRejectCount = context.rejectCount + 1;
  const typeName = getTypeName(context.type);
  const warningText = context.rejectCount === 0
    ? "你还可以先缓一缓，等更确定时再回应这份心意。"
    : `这已不是你第一次犹豫，再拒绝一次，就只和这位${typeName}学者做普通同行了。`;

  return {
    id: `lover-development-act2-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 你的心意",
    description: [
      "聊到下次见面时，对方问起了你的想法。" + getThoughtText(context),
      (context.canAddRelationship === false
        ? "你想起已有的恋人，把刚要说出口的话收了回去。这份心意，眼下只能先放在一边。"
        : "对方把话说得很认真，说愿意试着一起走下去，现在只等你的回答。") + warningText,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "act2",
    choices: [
      {
        id: "decline",
        label: "先保持距离",
        outcome: nextRejectCount >= 2 ? "这段关系结束。" : "以后还有一次机会。",
        effects: {
          conferenceEncounterUpdates: context.type === "beautiful"
            ? {
                rejectedBeautifulLoverCount: nextRejectCount,
                permanentlyBlockedBeautifulLover: nextRejectCount >= 2,
              } satisfies Partial<ConferenceEncounterState>
            : {
                rejectedSmartLoverCount: nextRejectCount,
                permanentlyBlockedSmartLover: nextRejectCount >= 2,
              } satisfies Partial<ConferenceEncounterState>,
          enqueueEvents: [createLoverDeclineResult(context)],
        },
      },
      {
        id: "accept",
        label: context.canAddRelationship === false ? "暂时放下" : "尝试在一起",
        outcome: context.canAddRelationship === false ? "已有恋人，暂时放下；不增加拒绝次数。" : "确认关系，恋人 +1。",
        effects: context.canAddRelationship === false ? {} : {
          loverStateUpdates: activateLover(context.type, context.totalMonths, context.playerGender),
          activateLoverProgress: context.type,
          relationshipAdditions: ["lover"],
          enqueueEvents: [createLoverAcceptResult(context)],
        },
      },
    ],
  };
}

export function createLoverDevelopmentAct1(context: LoverDevelopmentContext): PendingEvent {
  return {
    id: `lover-development-act1-${context.type}-${context.totalMonths}`,
    title: "发展关系",
    description: [
      ...(context.origin ? [`在${context.origin}见面后，你们一直保持着联系。`] : []),
      getIntroText(context.type),
      getSceneText(context.type),
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "确认彼此心意。",
      effects: {
        enqueueEvents: [createLoverDevelopmentAct2(context)],
      },
    }],
  };
}
