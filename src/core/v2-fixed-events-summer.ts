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
      "回家可以补觉，也能陪陪家里人。",
      "留校的话，暑期没有课程，正好集中做一段时间科研。",
      "也可以和朋友出去走走，需要 4 金币。",
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
      "期末结束，校园一下子安静下来，楼道里只剩零星脚步声。",
      "导师说实验室暑期照常开放，朋友喊你出门散心，家里也催你回去吃顿饭。",
      "一个多月的假期不算短，你得想好怎么过。",
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
            "你回到家后，先把欠下的睡眠一点点补齐。",
            "白天帮家里处理些琐事，晚上散步、看书，不再被截止日期追着跑。",
            "偶尔也会翻翻研究笔记，不过大部分时间都在好好休息。",
            "临开学前，你终于觉得没那么累了。",
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
            "你决定留校。暑期的实验楼比平时安静，走廊里只剩空调声和键盘声。",
            "少了课程和杂事，你把时间切成“读文献-复现实验-记疑问”三段循环。",
            "几次卡住后，你在白板上重画问题结构，反而把核心难点看清了。",
            "导师路过时看了你的记录本，只说了一句：“这个方向可以继续深挖。”",
            "开学前，你已经记下了几个可以继续尝试的想法。",
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
            "你和朋友把行程排得很松：白天走景点，晚上找小馆子慢慢吃。",
            "在陌生城市里，你们暂时不再讨论投稿和审稿，只讨论天气、路线和下一站。",
            "几天后再看手机里的待办清单，你已经没那么烦躁了。",
            "旅行花了不少钱，不过这几天确实玩得开心。",
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
