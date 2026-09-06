import {
  createThreeStageRandomEvent,
  hasRecoverableDraftPaper,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
  getResearchMiscSanNarrative,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import type { GameState, PendingEvent } from "./v2-types";

export function createDataLossRandomEvent(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  if (!hasRecoverableDraftPaper(state)) {
    return {
      nextState: state,
      event: null,
    };
  }

  const serial = state.totalRandomEventCount;
  const stayUpSanChange = getActualResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport);
  const stayUpSanSummary = formatResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport);
  const stayUpSanNarrative = getResearchMiscSanNarrative(-6, state.player.research);
  const event: PendingEvent = {
    id: `random-16-y${state.year}-m${state.month}-n${serial}`,
    title: "数据丢失",
    description: "你的电脑突然读不出实验文件，最近几周的结果全都打不开。本地备份又偏偏停在很久以前，你得尽快想办法补救。",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-16",
    stage: "act1",
    choices: [
      {
        id: `random-16-stay-up-${serial}`,
        label: "熬夜补数据",
        outcome: `${stayUpSanSummary}；论文进度保留。`,
        effects: {
          san: stayUpSanChange,
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
        outcome: "金币 -4，论文进度保留。",
        effects: {
          money: -4,
        },
      },
      {
        id: `random-16-fake-${serial}`,
        label: "伪造数据",
        outcome: "当前未投稿且已有进度的论文，未来引用 ×0.5。",
        effects: {
          draftCitationDebuffMultiplier: 0.5,
        },
      },
    ],
  };
  const stagedEvent = createThreeStageRandomEvent(event, {
    introDescription: [
      "你刚准备整理汇报材料，却发现 **自己的电脑** 读不出科研文件了。未投稿的草稿、实验记录和结果都存在这块硬盘里。",
      "最近的备份偏偏漏了这批文件。你翻遍电脑和移动硬盘，仍然凑不出一份完整版本。",
    ].join("\n\n"),
    decisionTitle: "如何应对",
    decisionDescription: [
      "熬夜补回文件能保住进度，但得赔上休息时间；从头再来，则要重做所有未投稿论文的工作。",
      "花 4 金币可以找人恢复。也可以拿假数据把空缺填上，只是文件能补齐，结果却经不起验证。",
    ].join("\n\n"),
    results: {
      [`random-16-stay-up-${serial}`]: {
        title: "熬夜恢复",
        description: [
          "你对着旧笔记和零散备份重建文件，缺少的实验重新跑，没存下来的文字重新写。连着几个晚上，工位的灯都关得很迟。",
          "总算把已有进度补了回来。最后一份文件保存好时，你做的第一件事，是再备份一份。",
          ...(stayUpSanNarrative ? [stayUpSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-16-restart-${serial}`]: {
        title: "重新开始",
        description: [
          "你接受了文件无法找回的损失，把所有未投稿的论文重新建档。选题笔记、实验和草稿，都得从头整理。",
          "已投稿的论文不受影响，但手头这批工作只能重新开始。你新建了备份目录，不想再经历第二次。",
        ].join("\n\n"),
      },
      [`random-16-pay-${serial}`]: {
        title: "数据找回",
        description: [
          "你第一时间联系数据恢复团队，把电脑里的硬盘拆下来送检。",
          "几天后，关键数据被救了回来，论文进度总算保住了。",
          "账单不便宜，但至少不用全部重来。",
        ].join("\n\n"),
      },
      [`random-16-fake-${serial}`]: {
        title: "留下隐患",
        description: [
          "你用编造的数据填上空缺，让手头的稿件看起来恢复了原样。表格齐了，背后却没有真实实验支撑。",
          "这些论文即使发表，也难以让后来的人复现和信任。你把文件保存下来，心里始终不踏实。",
        ].join("\n\n"),
      },
    },
  });

  return {
    nextState: state,
    event: stagedEvent,
  };
}

export function createLearningRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const basicGain = state.player.research < 6 ? 1 : 0;
  const basicResearchResult = basicGain > 0
    ? null
    : applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const basicOutcome = basicGain > 0
    ? "科研 < 6｜科研上限 +1。"
    : `科研 ≥ 6｜${formatTierResistedOutcome("科研", 1, basicResearchResult!)}。`;

  const event: PendingEvent = {
    id: `random-9-y${state.year}-m${state.month}-n${serial}`,
    title: "不断学习",
    description: "学得越多，越觉得自己的知识到处都有缺口。空闲时间只够认真补一个方向，你准备先从哪里开始？",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-9",
    stage: "act1",
    choices: [
      {
        id: `random-9-basic-${serial}`,
        label: "基础知识",
        outcome: basicOutcome,
        effects: {
          ...(basicGain > 0
            ? { researchCapacityStateDeltas: { baseCap: 1 } }
            : basicResearchResult && basicResearchResult.effectiveChange > 0
              ? { research: basicResearchResult.effectiveChange }
              : {}),
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

  const basicResearchNarrative = basicResearchResult
    ? getTierResistedNarrative("科研", 1, basicResearchResult)
    : "";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "最近几次讨论里，你总会碰到一些似懂非懂的概念。",
      "收藏夹里从基础教材到最新论文全都有，但真正空出来的时间只够认真补一个方向。",
      "你把待读清单重新排了一遍，准备先补最影响当前研究的部分。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "补基础能把以前含糊的概念真正弄清楚。",
      "追前沿可能带来新想法，读源码则能让实验做得更快。",
      "啃理论最费劲，但写论文和分析结果时往往用得上。",
    ].join("\n\n"),
    results: {
      [`random-9-basic-${serial}`]: {
        title: "基础学习",
        description: basicGain > 0
          ? [
              "你从基础教材重新读起，把过去跳过的推导和例题补了一遍。",
              "再回头看手头的论文时，几个以前只能背下结论的地方终于能自己解释清楚了。",
              "笔记本上多了一套完整的知识脉络，之后继续往下学也有了落脚点。",
            ].join("\n\n")
          : [
              "你从基础教材里挑出几个过去容易忽略的部分，重新推了一遍。",
              "内容不算新，但这次你把它们和手头的研究真正联系了起来。",
              "再做实验设计时，哪些假设站得住、哪些对照不能省，你判断得快了许多。",
              ...(basicResearchNarrative ? [basicResearchNarrative] : []),
            ].join("\n\n"),
      },
      [`random-9-tech-${serial}`]: {
        title: "技术深挖",
        description: [
          "你沿着最近几篇论文的引用一路往前读，又顺手看了作者公开的代码。",
          "其中一个训练策略和你的课题很接近，只要替换一部分数据流程就能试起来。",
          "你把改法和预期结果写进实验清单，准备下次想 idea 时继续往下推。",
        ].join("\n\n"),
      },
      [`random-9-code-${serial}`]: {
        title: "读源码",
        description: [
          "你挑了一段最常改的训练代码，把日志、配置和调试流程重新整理了一遍。",
          "原本需要手动重复的步骤被写成脚本，几处容易出错的参数也加上了检查。",
          "下一轮实验还没开始，但准备和排错已经能省下不少时间。",
        ].join("\n\n"),
      },
      [`random-9-theory-${serial}`]: {
        title: "理论推导",
        description: [
          "你挑了一章和当前方法最相关的理论，从符号定义开始逐行推下去。",
          "推到第三遍时，公式之间的关系终于连了起来，原先只能照搬的结论也知道该怎么解释了。",
          "你把这部分整理成自己的笔记，之后写方法和分析时可以直接回来查。",
        ].join("\n\n"),
      },
    },
  });
}

export function createCoreProgressRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } | null {
  if (eventId === 9) {
    return { nextState: state, event: createLearningRandomEvent(state, getRoll) };
  }
  if (eventId === 16) {
    return createDataLossRandomEvent(state);
  }
  return null;
}
