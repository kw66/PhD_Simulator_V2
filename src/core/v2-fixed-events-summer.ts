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
      "家里问哪天到站，你切到车票页面，惦记起家里的饭菜。桌上文献还标着几个问号；实验室难得安静，放下又有点舍不得。",
      "朋友偏偏发来旅行攻略，你翻着照片越看越想走。这趟要花 4 金币，翻到账户余额时，手终于停了下来。",
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
      "暑期食堂少开了几个窗口。你端着餐盘绕一圈，常吃的那家也放假了，实验楼的灯倒还照常亮着。",
      "老师在群里说实验室照常开放，朋友邀你出游，家里问你何时回来。手机接连响起，这个夏天一下子热闹起来。",
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
            "回家后，你把闹钟调晚，白天帮忙做琐事，晚上散步，吃饭总算不用一边嚼一边惦记实验结果。",
            "偶尔翻两页研究笔记，厨房又喊你尝咸淡。你合上本子过去，发现今天最急的事原来是别让汤煮干。",
          ].join("\n\n"),
          outcome: `SAN +${sanRecovery}。`,
          settlement: `结果：SAN +${sanRecovery}`,
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
            "你留校把文献、实验记录和疑问摊在桌上。周围安静下来，终于能沿着一个问题慢慢查，不用读到一半又赶去忙别的。",
            "几轮对照，笔记总算不全是问号了。你圈出能接着试的思路，补上理由，免得过几天只记得自己当时觉得很有道理。",
          ].join("\n\n"),
          outcome: "下次想 idea 多 1 次，永久 idea +1 分。",
          settlement: "结果：下次想 idea +1 次｜永久 idea +1",
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
            "你和朋友去邻近城市，行程排得很松。白天闲逛，晚上找小馆子，聊的从实验进度变成了明天去哪儿、哪家店好吃。",
            "回程翻照片核对开销，拍得最多的还是吃的。待办清单一项没少，这几天却没怎么想起，连返程车上都睡得挺沉。",
          ].join("\n\n"),
          outcome: `花了 4 金币，SAN +${sanRecovery}。`,
          settlement: `结果：金币 -4｜SAN +${sanRecovery}`,
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
