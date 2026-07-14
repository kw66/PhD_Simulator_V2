import { activateLover } from "./v2-lover-system";
import type { ConferenceEncounterState, LoverTypeId, PendingEvent } from "./v2-types";

export interface LoverDevelopmentContext {
  type: LoverTypeId;
  totalMonths: number;
  rejectCount: number;
}

export function buildLoverDevelopmentContext(input: {
  conferenceEncounterState: Pick<ConferenceEncounterState, "rejectedBeautifulLoverCount" | "rejectedSmartLoverCount">;
  totalMonths: number;
  type: LoverTypeId;
}): LoverDevelopmentContext {
  return {
    type: input.type,
    totalMonths: input.totalMonths,
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

function getThoughtText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "和她在一起会轻松很多，但也意味着我要把生活节奏和她绑得更紧。"
    : "如果在一起，也许能一起走得更远，但我也要承担这份长期承诺。";
}

function createLoverDeclineResult(context: LoverDevelopmentContext): PendingEvent {
  const nextRejectCount = context.rejectCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;
  const typeName = getTypeName(context.type);

  return {
    id: `lover-development-result-decline-${context.type}-${nextRejectCount}`,
    title: "发展关系 ➜ 暂缓关系",
    description: permanentlyBlocked
      ? `你再次停下了这段关系线。与这位${typeName}学者的关系拒绝计数来到 ${nextRejectCount} / 2，按旧版真实口径，这条关系线会被永久关闭。`
      : `你决定先把关系停在现在这个距离。与这位${typeName}学者的关系拒绝计数 +1，当前为 ${nextRejectCount} / 2；若后续再次走到这个节点，仍可能还有一次机会。`,
    preview: "发展关系",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "你先把节奏留在当前主线上。",
      effects: {},
    }],
  };
}

function createLoverAcceptResult(context: LoverDevelopmentContext): PendingEvent {
  const typeLabel = context.type === "beautiful" ? "活泼恋人" : "聪慧恋人";
  const effectText = context.type === "beautiful"
    ? "SAN 回满、SAN 上限 +4、每月额外回复 10% 已损 SAN、每月金钱 -2。"
    : "科研 +2、永久获得想 idea / 做实验 / 写论文各 +1 次、每月金钱 -2。";

  return {
    id: `lover-development-result-accept-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 关系确认",
    description: `你们互相确认了心意，这段关系正式从会场偶遇变成了日常牵挂。当前迁入口径（${typeLabel}）：${effectText}`,
    preview: "发展关系",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "你们开始进入稳定关系。",
      effects: {},
    }],
  };
}

function createLoverDevelopmentAct2(context: LoverDevelopmentContext): PendingEvent {
  const nextRejectCount = context.rejectCount + 1;
  const typeName = getTypeName(context.type);
  const warningText = context.rejectCount === 0
    ? "若这次仍只停在原地，未来见面的频率可能会慢慢降下来。"
    : `这已经是你和这位${typeName}学者最后一次站在同一条分岔口。`;

  return {
    id: `lover-development-act2-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 你的心意",
    description: `${getThoughtText(context.type)} ${warningText}`,
    preview: "发展关系",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "act2",
    choices: [
      {
        id: "decline",
        label: "先保持距离",
        outcome: "你决定先把关系停在现在这个距离。",
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
        label: "尝试在一起",
        outcome: "你决定认真回应这段关系。",
        effects: {
          loverStateUpdates: activateLover(context.type, context.totalMonths),
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
    title: "💕 发展关系",
    description: `${getIntroText(context.type)} ${getSceneText(context.type)}`,
    preview: "发展关系",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "进入关系抉择。",
      effects: {
        enqueueEvents: [createLoverDevelopmentAct2(context)],
      },
    }],
  };
}
