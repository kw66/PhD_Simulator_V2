import {
  appendMechanismSettlement,
  createFixedEvent,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

function createSummerVacationResultEvent(params: {
  idSuffix: "home" | "research" | "travel";
  year: number;
  month: number;
  title: string;
  description: string;
  outcome: string;
  settlement: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: params.title,
    description: appendMechanismSettlement(params.description, params.settlement),
    chainId: "summer-vacation",
    stage: "result",
    choices: [
      {
        id: `summer-vacation-${params.idSuffix}-finish-y${params.year}-m${params.month}`,
        label: "继续",
        outcome: params.outcome,
        effects: params.effects,
      },
    ],
  });
}

function createSummerVacationPlanEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-plan-y${state.year}-m${state.month}`,
    title: "暑假 ➜ 暑假计划",
    description: [
      "你可以回家补觉、陪陪家人，也可以留校，把平时来不及细看的文献和实验记录重新梳理一遍。",
      "若想换个环境，就和朋友出去走走。这趟旅行需要 4 金币，出发前得掂量一下钱包。",
    ].join("\n\n"),
    chainId: "summer-vacation",
    stage: "act2",
    choices: [
      {
        id: `summer-vacation-home-y${state.year}-m${state.month}`,
        label: "回家休息",
        outcome: "回家休息。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-home" },
        },
      },
      {
        id: `summer-vacation-research-y${state.year}-m${state.month}`,
        label: "留校科研",
        outcome: "留校科研。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-research" },
        },
      },
      {
        id: `summer-vacation-travel-y${state.year}-m${state.month}`,
        label: "外出旅行",
        outcome: "外出旅行。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-travel" },
        },
      },
    ],
  });
}

export function createSummerVacationEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-y${state.year}-m${state.month}`,
    title: "暑假",
    description: [
      "校园进入暑期，食堂窗口少开了几个，实验楼里仍有人值班。你看着日历，盘算着这段能自己安排的日子。",
      "老师说实验室照常开放，朋友约你出门散心，家里也问你什么时候回来。你得给这个夏天排个合适的计划。",
    ].join("\n\n"),
    chainId: "summer-vacation",
    choices: [
      {
        id: `summer-vacation-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "选择暑假安排。",
        effects: {
          enqueueEvents: [createSummerVacationPlanEvent(state)],
        },
      },
    ],
  });
}

export function resolveSummerVacationFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  _getRoll: RandomRollProvider,
): FixedResolutionResult | null {
  switch (resolution.kind) {
    case "summer-vacation-home": {
      const missingSan = Math.max(0, state.sanCap - state.player.san);
      const sanRecovery = Math.ceil(missingSan * 0.25);
      return {
        nextState: state,
        outcome: `SAN +${sanRecovery}。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "home",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 新学期将至",
          description: [
            "你回到家，把闹钟往后调了调。白天帮家里做些琐事，晚上出门散步，吃饭时总算不用一边嚼一边惦记实验结果。",
            "研究笔记还在包里，想起来也会翻两页，不过这几天你不急着给自己加任务。返校安排记在日历上，眼下先踏实过几天日子。",
          ].join("\n\n"),
          outcome: `SAN +${sanRecovery}。`,
          settlement: `SAN +${sanRecovery}`,
          effects: sanRecovery === 0 ? {} : { san: sanRecovery },
        })],
      };
    }
    case "summer-vacation-research":
      return {
        nextState: state,
        outcome: "下次想 idea 多 1 次，永久 idea +1。",
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "research",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 学术进步",
          description: [
            "你留在学校，把文献、实验记录和没想明白的问题摊在桌上。周围安静下来，你终于有空沿着一个疑问慢慢查，而不是读到一半又赶去做别的事。",
            "几轮对照下来，你记下了接着尝试的思路，也摸清了怎样把零散的想法整理成问题。下次再琢磨选题时，这些笔记就能派上用场。",
          ].join("\n\n"),
          outcome: "下次想 idea 多 1 次，永久 idea +1 分。",
          settlement: "下次想 idea +1 次｜永久 idea +1",
          effects: {
            temporaryActionEffectUpdates: { idea: { extraActions: 1 } },
            ideaBonus: 1,
          },
        })],
      };
    case "summer-vacation-travel": {
      const missingSan = Math.max(0, state.sanCap - state.player.san);
      const sanRecovery = Math.ceil(missingSan * 0.5);
      return {
        nextState: state,
        outcome: `金币 -4，SAN +${sanRecovery}。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "travel",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 难忘旅程",
          description: [
            "你和朋友挑了个不远的城市，把行程排得很松。白天随处走走，晚上找小馆子吃饭，聊天内容从实验进度变成了明天去哪儿、哪家店好吃。",
            "几天下来，你拍了些照片，也暂时把待办清单放到一边。回程时算了算开销，这趟确实花钱，好在不是换个城市继续赶工。",
          ].join("\n\n"),
          outcome: `花了 4 金币，SAN +${sanRecovery}。`,
          settlement: `金币 -4｜SAN +${sanRecovery}`,
          effects: {
            money: -4,
            ...(sanRecovery === 0 ? {} : { san: sanRecovery }),
          },
        })],
      };
    }
    default:
      return null;
  }
}
