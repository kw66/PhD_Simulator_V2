import { hasRecoverableDraftPaper, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createDataLossRandomEvent(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  if (!hasRecoverableDraftPaper(state)) {
    return {
      nextState: {
        ...state,
        achievementFlags: {
          ...state.achievementFlags,
          narrowEscape: true,
        },
      },
      event: null,
    };
  }

  const serial = state.totalRandomEventCount;
  return {
    nextState: state,
    event: {
      id: `random-16-y${state.year}-m${state.month}-n${serial}`,
      title: "数据丢失",
      description: "服务器日志提示数据损坏。你得在保进度、花成本和承担长期学术风险之间做选择。",
      preview: "服务器崩溃了……",
      source: "random",
      blocking: true,
      deadlineMonths: 0,
      chainId: "random-16",
      stage: "act1",
      choices: [
        {
          id: `random-16-stay-up-${serial}`,
          label: "熬夜补数据",
          outcome: "SAN -6，论文进度保留。",
          effects: {
            san: -6,
          },
        },
        {
          id: `random-16-restart-${serial}`,
          label: "从头再来",
          outcome: "所有未投稿论文进度清零。",
          effects: {
            clearDraftProgress: true,
          },
        },
        {
          id: `random-16-pay-${serial}`,
          label: "花钱恢复",
          outcome: "金钱 -6，论文进度保留。",
          effects: {
            money: -6,
          },
        },
        {
          id: `random-16-fake-${serial}`,
          label: "伪造数据",
          outcome: "全局引用 x0.5。",
          effects: {
            publicationPenaltyMultiplier: 0.5,
          },
        },
      ],
    },
  };
}

export function createLearningRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const basicGain = state.player.research < 6 ? 1 : 0;
  const basicOutcome = basicGain > 0
    ? "科研低于 6，打好基础，科研 +1。"
    : "科研已不低于 6，基础知识对你帮助有限。";

  return {
    id: `random-9-y${state.year}-m${state.month}-n${serial}`,
    title: "不断学习",
    description: "你决定系统补一轮知识储备。收藏夹里从基础到前沿全都有，但时间只够选一条主线；你得判断补哪一块最能拉高后续产出。",
    preview: "想学点新东西",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-9",
    stage: "act1",
    choices: [
      {
        id: `random-9-basic-${serial}`,
        label: "基础知识",
        outcome: basicOutcome,
        effects: {
          research: basicGain,
        },
      },
      {
        id: `random-9-tech-${serial}`,
        label: "最新技术",
        outcome: "永久想 idea +1。",
        effects: {
          ideaBonus: 1,
        },
      },
      {
        id: `random-9-code-${serial}`,
        label: "代码知识",
        outcome: "永久实验 +1。",
        effects: {
          experimentBonus: 1,
        },
      },
      {
        id: `random-9-theory-${serial}`,
        label: "深奥理论",
        outcome: "永久写作 +1。",
        effects: {
          writingBonus: 1,
        },
      },
    ],
  };
}

export function createCoreProgressRandomEventById(
  eventId: number,
  state: GameState,
  _getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } | null {
  if (eventId === 9) {
    return { nextState: state, event: createLearningRandomEvent(state) };
  }
  if (eventId === 16) {
    return createDataLossRandomEvent(state);
  }
  return null;
}
