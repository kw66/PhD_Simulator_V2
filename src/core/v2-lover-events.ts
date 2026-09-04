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
    ? "最近几次会议结束后，你和那位活泼的学者总会顺路聊上一会儿。"
    : "你和那位聪慧学者在讨论里越来越默契，常常一句话就能接上对方思路。";
}

function getSceneText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "从会场到地铁口的路并不长，但每次都觉得很快就走完了。"
    : "从论文细节聊到未来规划，你发现这份理解比想象中更珍贵。";
}

function getThoughtText(context: LoverDevelopmentContext): string {
  const pronoun = context.loverGender === "male" ? "他" : "她";
  return context.type === "beautiful"
    ? `“我好像真的有点喜欢${pronoun}。只是读研已经够忙了，谈恋爱以后还得留出时间陪${pronoun}。”`
    : "“我们很聊得来。如果真的在一起，科研之外也会多出很多共同安排。”";
}

function createLoverDeclineResult(context: LoverDevelopmentContext): PendingEvent {
  const nextRejectCount = context.rejectCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `lover-development-result-decline-${context.type}-${nextRejectCount}`,
    title: "发展关系 ➜ 你的心意 ➜ 暂缓关系",
    description: permanentlyBlocked
      ? [
          "你决定把关系停在现在这个距离，礼貌、克制，也尽量不让对方难堪。",
          "之后你们仍会在会场和走廊里打招呼，偶尔聊几句论文，只是不再单独约着散步。",
          "时间久了，那点暧昧也慢慢淡了。",
          "机制结算",
          `关系线拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "该关系线永久关闭。",
        ].join("\n\n")
      : [
          "你决定把关系停在现在这个距离，礼貌、克制，也尽量不让对方难堪。",
          "之后你们仍会在会场和走廊里打招呼，偶尔聊几句论文，只是不再单独约着散步。",
          "你们暂时都没有再提这件事。",
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
      ? `你拒绝了这段关系，与这位${getTypeName(context.type)}学者的关系线永久关闭。`
      : "你选择保持距离，以后还有一次机会。",
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
      "你们互相确认了心意，正式开始交往。",
      "以后除了在会场见面，也会一起吃饭、散步，讨论各自的生活。",
      "读研的日程里，从此多了一个需要认真留时间的人。",
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
    ? "拒绝后还有一次机会。"
    : `再次拒绝将结束与这位${typeName}学者的关系。`;

  return {
    id: `lover-development-act2-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 你的心意",
    description: [
      getThoughtText(context),
      "会后的人流慢慢散开，你们并肩走在场馆外，聊着论文、课题组和下次见面的时间。",
      "你几次想把话说得更明白，又担心以后见面会尴尬。",
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
      ...(context.origin ? [`从${context.origin}分别后，你们的联系没有停在会场。`] : []),
      getIntroText(context.type),
      getSceneText(context.type),
      "你们从今天的报告聊到下个月的计划，又约好下次会议一起吃饭。",
      "你开始期待这些会后的聊天，也隐约觉得对方有同样的心思。",
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
