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
    ? "你和那位开朗的同行又聊了很久。起初还在说今天的报告，后来连赶材料时吃什么都聊到了。"
    : "你和那位思路清楚的同行又讨论起论文。意见不同的时候，你们会把问题拆开慢慢说，谁也不急着结束话题。";
}

function getSceneText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "分别以后，你还想起刚才没说完的笑话，拿起手机补发了一句。对方很快回了消息，你也发现自己一直在等。"
    : "讨论结束后，你们又聊了些研究之外的琐事。消息提示亮起来时，你先看了发信人，才想起自己刚才还在改文档。";
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
          "你把自己的意思说清楚了：不再往恋人的方向发展，也不想让对方继续等一个含糊的答复。这话不太好开口，却比一直回避更合适。",
          "对方表示理解，没有再追问。你们仍可以像普通同行那样交流，只是这次不再为下次见面留下别的暗示。",
          "机制结算",
          `关系线拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "今后不会再与对方发展恋人关系。",
        ].join("\n\n")
      : [
          "你说自己还没想好，暂时想保持现在的距离。说完以后有一点尴尬，好在对方没有催你回答，也没有把话题彻底停住。",
          "你们又聊了几句近况，随后各自去忙。联系还在，只是你没有作出交往的承诺，也不想让这份犹豫变成对方的负担。",
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
    ? "SAN 回满、SAN 上限 +4、每月额外回复 10% 已损 SAN、每月金币 -2。"
    : "科研 +2、永久获得想 idea / 做实验 / 写论文各 +1 次、每月金币 -2。";

  return {
    id: `lover-development-result-accept-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 你的心意 ➜ 关系确认",
    description: [
      "你把心意说了出来，也得到了明确的回应。确定开始交往以后，你们反倒有点不好意思，刚才想好的话一时都忘了。",
      "你们约好找时间一起吃顿饭，再慢慢商量往后的相处。课题和日常安排仍要继续，只是现在除了赶进度，你也想认真留些时间给对方。",
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
      getThoughtText(context),
      "聊到下次见面时，对方问起了你的想法。你几次想把话说得更明白，又担心以后见面会尴尬。",
      warningText,
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
        outcome: context.canAddRelationship === false ? "关系栏已满，暂时放下这段关系。" : "确认关系。",
        effects: context.canAddRelationship === false ? {} : {
          loverStateUpdates: activateLover(context.type, context.totalMonths, context.playerGender),
          activateLoverProgress: context.type,
          relationshipAdditions: ["lover"],
          ...(context.type === "beautiful"
            ? {
                restoreSanToCap: true,
                sanCapDelta: 4,
              }
            : {
                research: 2,
                persistentExtraActionDeltas: { idea: 1, experiment: 1, writing: 1 },
              }),
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
