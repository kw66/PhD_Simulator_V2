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
    ? "“和她在一起会轻松很多，但也意味着我要把生活节奏和她绑得更紧。”"
    : "“如果在一起，也许能一起走得更远，但我也要承担这份长期承诺。”";
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
          "之后你们仍会在会场和走廊里打招呼，偶尔聊几句论文，但那种“差一点就迈过去”的氛围慢慢淡了下来。",
          "你知道自己保住了当下节奏，也承认自己放下了一条可能通向更亲密生活的路。",
          "机制结算",
          `关系线拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "该关系线永久关闭。",
        ].join("\n\n")
      : [
          "你决定把关系停在现在这个距离，礼貌、克制，也尽量不让对方难堪。",
          "之后你们仍会在会场和走廊里打招呼，偶尔聊几句论文，但那种“差一点就迈过去”的氛围慢慢淡了下来。",
          "你知道自己保住了当下节奏，也承认自己放下了一条可能通向更亲密生活的路。",
          "机制结算",
          `关系线拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "以后还有一次机会。",
        ].join("\n\n"),
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
    title: "发展关系 ➜ 你的心意 ➜ 关系确认",
    description: [
      "你们互相确认了心意，这段关系从“会场偶遇”变成了“彼此日常”。",
      "从今天开始，你不再只对课题进度负责，也会为另一段真实关系分配时间、情绪和耐心。",
      "学术之外，多了一份稳定又具体的牵挂，而这份牵挂也会反过来影响你看待压力和选择的方式。",
      "机制结算",
      `${typeLabel}：${effectText}`,
    ].join("\n\n"),
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
    description: [
      getThoughtText(context.type),
      "会后的人流慢慢散开，你们并肩走在场馆外的夜风里。话题从论文、课题组、下一次会议，拐到了“以后”。",
      "你突然意识到，真正难的不是表达好感，而是承认“从今天起，彼此会进入对方的日常决策”。",
      "你在心里反复衡量：如果现在后退，关系大概率会回到“熟悉的同行”；如果继续向前，你就要学会在科研节奏之外，为另一个人留出稳定的位置。",
      warningText,
    ].join("\n\n"),
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
    title: "发展关系",
    description: [
      getIntroText(context.type),
      getSceneText(context.type),
      "你们从“今天的报告质量”聊到“下个月的计划”，话题看似还在学术里，情绪却已经悄悄越过了同事边界。",
      "你突然发现，自己开始在意对方说话时的停顿、语气和眼神，而不只是观点本身。",
      "这段关系很可能不再只是“同行交流”，而会变成需要你认真回应的一次人生选择。",
    ].join("\n\n"),
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
