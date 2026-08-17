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
    ? "几次会议下来，你和那位活泼学者总会在散场后多聊一会儿。"
    : "几次讨论下来，你和那位聪慧学者越来越默契。";
}

function getSceneText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "相处很轻松，你开始期待下一次见面。"
    : "话题从论文聊到生活，你开始期待下一次见面。";
}

function getThoughtText(type: LoverTypeId): string {
  return type === "beautiful"
    ? "你有些心动，也担心忙碌的生活容不下另一份关系。"
    : "你喜欢这种被理解的感觉，也担心科研和关系搅在一起。";
}

function createLoverDeclineResult(context: LoverDevelopmentContext): PendingEvent {
  const nextRejectCount = context.rejectCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `lover-development-result-decline-${context.type}-${nextRejectCount}`,
    title: "发展关系 ➜ 暂缓关系",
    description: permanentlyBlocked
      ? `你再次选择保持距离，这段关系到此为止（${nextRejectCount}/2）。`
      : `你没有往前一步（${nextRejectCount}/2），以后还有一次机会。`,
    preview: "发展关系",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "result",
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
    ? "SAN 回满、SAN 上限 +4、每月额外回复 10% 已损 SAN、每月金钱 -2。"
    : "科研 +2、永久获得想 idea / 做实验 / 写论文各 +1 次、每月金钱 -2。";

  return {
    id: `lover-development-result-accept-${context.type}-${context.totalMonths}`,
    title: "发展关系 ➜ 关系确认",
    description: `你们决定试试看。${typeLabel}：${effectText}`,
    preview: "发展关系",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-development",
    stage: "result",
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
        label: "尝试在一起",
        outcome: "确认关系。",
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
      outcome: "确认彼此心意。",
      effects: {
        enqueueEvents: [createLoverDevelopmentAct2(context)],
      },
    }],
  };
}
