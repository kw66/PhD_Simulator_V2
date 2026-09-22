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
      "回家的车票页面开着，桌上还摊着没读完的文献。回去能补补觉、陪陪家人，留下来倒也清静，正好把那些读到一半的问题理一理。",
      "朋友发来的旅行攻略也让你有点心动。这趟要花 4 金币，想好去哪儿之前，得先看看钱包答不答应。",
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
      "校园进入暑期，食堂窗口少开了几个。你端着餐盘绕了一圈，才发现常吃的那家也贴上了放假通知，实验楼的灯倒还照常亮着。",
      "老师在群里说实验室照常开放，朋友发来出游邀请，家里也问你什么时候回来。手机接连响了几声，这个夏天一下子热闹起来。",
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
            "研究笔记还在包里，想起来也会翻两页。刚看到一半，厨房里又喊你尝尝咸淡；你合上本子过去，发现今天最急的事原来是别让汤煮干。",
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
            "几轮对照下来，笔记里总算不全是问号了。你把几个能接着试的思路圈出来，又在旁边补上理由，免得过几天只记得自己当时觉得很有道理。",
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
            "回程时，你翻着照片核对开销，发现拍得最多的还是吃的。待办清单一项没少，可这几天确实没怎么想起它，连返程车上都睡得挺沉。",
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
