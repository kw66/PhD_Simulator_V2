import {
  createThreeStageRandomEvent,
  hasRecoverableDraftPaper,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
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
  const event: PendingEvent = {
    id: `random-16-y${state.year}-m${state.month}-n${serial}`,
    title: "数据丢失",
    description: "服务器突然提示数据损坏，最近几周的实验结果全都打不开。备份偏偏停在很久以前，你得尽快想个补救办法。",
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
  };
  const stagedEvent = createThreeStageRandomEvent(event, {
    introDescription: [
      "你刚准备汇报实验结果，结果文件夹突然空了，服务器日志显示数据损坏。",
      "这类事故最痛的不是“再做一次”，而是之前投入的时间无法回收。",
      "你盯着屏幕反复刷新路径，心里那种“明明做过却像没做过”的失重感很强。",
      "你接下来的决策会同时影响进度、心理状态和学术风险。",
    ].join("\n\n"),
    decisionTitle: "如何应对",
    decisionDescription: [
      "“熬夜补数据：最能保进度，但精神代价最大。”",
      "“从头再来：最干净，时间回退也最明显。”",
      "“花钱恢复：用金币换时间确定性。”",
      "“伪造数据：短期最快，长期风险最高。”你现在要选的不是省不省力，而是愿不愿意为这个选择承担可持续后果。",
    ].join("\n\n"),
    results: {
      [`random-16-stay-up-${serial}`]: {
        title: "结果",
        description: [
          "你决定当晚就把关键数据补回去，不给节点延期留下空间。",
          "凌晨两点的实验室只剩风扇声和键盘声，你靠意志把核心结果重跑出来。",
          "进度保住了，但精神和身体都被透支了一层。",
        ].join("\n\n"),
      },
      [`random-16-restart-${serial}`]: {
        title: "结果",
        description: [
          "你选择把损失彻底摊开，按规范从零重建实验流程。",
          "旧结果虽然没了，但复盘过程把方法论沉淀得更扎实。",
          "这条路最慢，却给后续工作留了最干净的底稿。",
        ].join("\n\n"),
      },
      [`random-16-pay-${serial}`]: {
        title: "结果",
        description: [
          "你第一时间联系数据恢复团队，把硬盘和日志都打包送检。",
          "几天后关键数据被救回，项目时间线基本没有被打断。",
          "这笔钱本质上是在买“时间确定性”。",
        ].join("\n\n"),
      },
      [`random-16-fake-${serial}`]: {
        title: "结果",
        description: [
          "你选择用伪造数据把表面结果补齐，短期里确实最快。",
          "但从这一刻起，你每次面对复现、审稿和追问都会更被动。",
          "这是把未来信用持续透支给当下进度的一次交易。",
        ].join("\n\n"),
      },
    },
  });

  return {
    nextState: state,
    event: stagedEvent,
  };
}

export function createLearningRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const basicGain = state.player.research < 6 ? 1 : 0;
  const basicOutcome = basicGain > 0
    ? "科研低于 6，打好基础，科研 +1。"
    : "科研已不低于 6，基础知识对你帮助有限。";

  const event: PendingEvent = {
    id: `random-9-y${state.year}-m${state.month}-n${serial}`,
    title: "不断学习",
    description: "做得越多，越觉得自己的知识到处都有缺口。空闲时间只够认真补一个方向，你准备先学什么？",
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

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "你决定系统补一轮知识储备。",
      "收藏夹里从基础到前沿全都有，但时间只够选一条主线。",
      "桌上摊着笔记本和待读清单，你很清楚“乱学一通”只会制造新的焦虑。",
      "选对了会形成正反馈，选偏了就是“学了很多却接不上当前课题”。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“补基础像修地基，前期看着慢，但能减少后续反复返工。”",
      "“追前沿最容易点燃灵感，不过也更吃理解速度。”",
      "“学代码是把手脚练快，能把‘想法’更稳定地落到实验里。”",
      "“啃理论痛苦但扎实，通常会在写作阶段回本。”你这次不是在“学什么看起来厉害”，而是在“补哪块最能拉高后续产出”。",
    ].join("\n\n"),
    results: {
      [`random-9-basic-${serial}`]: {
        title: "基础学习",
        description: basicGain > 0
          ? [
              "你花了几天时间，系统地复习了领域内的基础知识。",
              "很多之前似懂非懂的概念，现在终于理解透彻了。",
              "“原来是这样！”你恍然大悟，感觉自己的科研能力有了明显提升。",
            ].join("\n\n")
          : [
              "你翻了翻基础教材，发现这些内容你早就掌握了。",
              "“看来我的基础已经够扎实了，应该学点更高级的。”",
            ].join("\n\n"),
      },
      [`random-9-tech-${serial}`]: {
        title: "技术深挖",
        description: [
          "你花时间研究了领域内的最新技术和前沿进展。",
          "看着那些新颖的方法和思路，你感觉脑子里冒出了很多新想法。",
          "“这个方法说不定可以用在我的研究上！”你兴奋地记下笔记。",
        ].join("\n\n"),
      },
      [`random-9-code-${serial}`]: {
        title: "读源码",
        description: [
          "你系统地学习了一些编程技巧和工具使用。",
          "调试技巧、性能优化、自动化脚本……这些知识让你的编程效率大大提升。",
          "“以后跑实验应该会顺手很多。”你满意地想。",
        ].join("\n\n"),
      },
      [`random-9-theory-${serial}`]: {
        title: "理论推导",
        description: [
          "你啃了几本深奥的理论书籍，虽然过程很痛苦，但收获颇丰。",
          "那些复杂的数学推导和理论框架，让你对领域有了更深的理解。",
          "“写论文的时候，这些理论知识肯定用得上。”你自信地想。",
        ].join("\n\n"),
      },
    },
  });
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
