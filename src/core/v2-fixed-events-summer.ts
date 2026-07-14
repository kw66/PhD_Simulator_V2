import {
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
  preview: string;
  outcome: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: params.title,
    description: params.description,
    preview: params.preview,
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
    description: "“回家休整最稳，适合先把状态收回来。”“留校科研像是给下学期提前加速。”“外出旅行恢复更快，但也需要现实成本。”你不是在混假期，而是在给下学期选一种起跑姿态。",
    preview: "在休整、科研和旅行之间选一个假期策略",
    chainId: "summer-vacation",
    stage: "act2",
    choices: [
      {
        id: `summer-vacation-home-y${state.year}-m${state.month}`,
        label: "回家休息",
        outcome: "你决定先从 deadline 和实验楼节奏里退出来。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-home" },
        },
      },
      {
        id: `summer-vacation-research-y${state.year}-m${state.month}`,
        label: "留校科研",
        outcome: "你决定把这个暑期直接投给实验楼和读文献。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-research" },
        },
      },
      {
        id: `summer-vacation-travel-y${state.year}-m${state.month}`,
        label: "外出旅行（花钱）",
        outcome: "你决定用一次换场景的方式快速拉回状态。",
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
    description: "期末结束后，校园一下子安静下来。导师说实验室暑期照常开放，朋友喊你出门散心，家里也在催你回去吃顿饭。你意识到，这次暑假的安排会直接决定下学期的开局手感。",
    preview: "暑假到了，准备选一种过假方式",
    chainId: "summer-vacation",
    choices: [
      {
        id: `summer-vacation-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "你准备先把这个假期的策略想清楚。",
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
        outcome: `你这次选择先稳住状态；接下来结算 ${sanRecovery} 点 SAN 恢复。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "home",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 新学期将至",
          description: "你回到家后，先把欠下的睡眠一点点补齐。白天帮家里处理些琐事，晚上散步、看书，终于不再被 deadline 追着跑。临开学前，你感觉状态又稳了一些。",
          preview: "远离实验楼一阵子，把状态休息回来",
          outcome: `你缓过来了，SAN +${sanRecovery}。`,
          effects: sanRecovery === 0 ? {} : { san: sanRecovery },
        })],
      };
    }
    case "summer-vacation-research":
      return {
        nextState: state,
        outcome: "你决定把暑期直接用来积累下一轮 idea 的先手优势。",
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "research",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 学术进步",
          description: "你决定留校。暑期的实验楼比平时安静，你把时间切成“读文献—复现实验—记疑问”的循环。这个暑假没有轻松，但它给你下一轮选题留下了更稳的确定性。",
          preview: "把假期投给科研，换取下一轮 idea 优势",
          outcome: "下次想 idea 多 1 次，后续每次 idea 永久 +1 分。",
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
        outcome: `你决定用一次换场景的方式快速复位；接下来结算金钱 -4 和 ${sanRecovery} 点 SAN 恢复。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "travel",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 难忘旅程",
          description: "你和朋友把行程排得很松：白天走景点，晚上找小馆子慢慢吃。在陌生城市里，你暂时不再讨论投稿和审稿，只讨论天气、路线和下一站。这趟旅行花了钱，也换回了难得的情绪空间。",
          preview: "花一笔钱，快速把状态从高压里拉出来",
          outcome: `花了 4 金钱，SAN +${sanRecovery}。`,
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
