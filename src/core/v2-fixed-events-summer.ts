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
    description: [
      "“回家休整最稳，适合把神经从紧绷状态慢慢放下来。”",
      "“留校冲科研像押注长期回报，短期不轻松，但后劲更足。”",
      "“旅行是快速切换场景的方案，恢复明显，但也有现实开销。”",
      "你不是在“混不混假期”，而是在给下一学期选一种初始状态：稳态恢复、能力加速，或者情绪复位。",
    ].join("\n\n"),
    preview: "在休整、科研和旅行之间选一个假期策略",
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
        label: "外出旅行（花钱）",
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
      "你站在空荡的教学楼口，意识到这次暑假安排会直接决定下学期的开局手感。",
      "是修复状态、冲刺科研，还是彻底放松一次，这次不是“假期选择题”，而是“新学期起跑姿态”的预设。",
    ].join("\n\n"),
    preview: "暑假到了，准备选一种过假方式",
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
            "白天帮家里处理些琐事，晚上散步、看书，不再被 deadline 追着跑。",
            "偶尔也会翻翻研究笔记，但这次你更在意把心态修到可持续状态。",
            "临开学前，你发现自己看问题不再急躁，节奏重新稳了下来。",
          ].join("\n\n"),
          preview: "远离实验楼一阵子，把状态休息回来",
          outcome: `SAN +${sanRecovery}。`,
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
            "这个暑假没有轻松，但你给下一轮选题攒下了确定性。",
          ].join("\n\n"),
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
        outcome: `金钱 -4，SAN +${sanRecovery}。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "travel",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 难忘旅程",
          description: [
            "你和朋友把行程排得很松：白天走景点，晚上找小馆子慢慢吃。",
            "在陌生城市里，你们暂时不再讨论投稿和审稿，只讨论天气、路线和下一站。",
            "几天后再看手机里的待办清单，你没有先前那种“喘不过气”的感觉了。",
            "这趟旅行花了钱，也换回了难得的情绪空间和专注力。",
          ].join("\n\n"),
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
