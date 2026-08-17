import {
  THESIS_OPTIONS,
  applyThesisOption,
  getThesisStage,
  shouldTriggerThesisEvent,
  startThesisIfAvailable,
} from "./v2-thesis-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";
import { createThreeStageEvent, type RandomEventResultCopy } from "./v2-random-events-core-shared";

function createThesisChoices(state: GameState): {
  nextState: GameState;
  choices: EventChoice[];
  results: Record<string, RandomEventResultCopy>;
} {
  const nextThesis = startThesisIfAvailable(state.year, state.month, state.thesis);
  const publishedPaperCount = getPublishedPaperCount(state);
  const results: Record<string, RandomEventResultCopy> = {};

  const choices: EventChoice[] = THESIS_OPTIONS.map((option) => {
    const result = applyThesisOption(nextThesis, option, publishedPaperCount, state.player.research);
    results[option.id] = {
      title: "推进结果",
      description: [
        "你把本月论文任务按计划推进完了，文档、实验与结构都比上个月更成型。",
        `总进度从 ${nextThesis.progress}% 提升到 ${result.nextThesis.progress}%，当前阶段来到「${getThesisStage(result.nextThesis.progress).name}」。`,
        "虽然离最终定稿还有距离，但你已经能感到论文从“想法堆积”逐步变成“可交付成果”。",
        "这一步的价值不只在数字增长，更在于你把不确定性又压缩了一截。",
      ].join("\n\n"),
    };
    return {
      id: option.id,
      label: option.text,
      outcome: result.progressGain > 0
        ? `大论文推进 +${result.progressGain}，SAN ${result.sanCost > 0 ? `-${result.sanCost}` : "不变"}。`
        : "当前方案没有带来明显进展。",
      effects: {
        san: -result.sanCost,
        thesisProgress: result.progressGain,
      },
    };
  });

  choices.push({
    id: "abandon-thesis",
    label: "放弃大论文",
    outcome: "停止推进大论文。",
    effects: {
      abandonThesis: true,
    },
  });
  results["abandon-thesis"] = {
    title: "放弃确认",
    description: "你决定暂时放下这条论文路线，把精力投入到其他安排。",
  };

  return {
    nextState: {
      ...state,
      thesis: nextThesis,
    },
    choices,
    results,
  };
}

function createThesisEvent(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  if (!shouldTriggerThesisEvent(state.year, state.month, state.thesis)) {
    return { nextState: state, event: null };
  }

  const { nextState, choices, results } = createThesisChoices(state);
  const stage = getThesisStage(nextState.thesis.progress);
  const progress = nextState.thesis.progress;
  const backgroundDescription = progress < 20
    ? "你打开空白文档，标题写下后，真正的挑战才刚开始。"
    : progress < 40
      ? "文献越读越多，你在资料中努力抓住自己的核心问题。"
      : progress < 60
        ? "思路逐渐收束，接下来是更费精力的实证与推导。"
        : progress < 80
          ? "素材已经齐了，真正磨人的部分变成了写作与改写。"
          : "论文已接近完成，最后阶段决定答辩时的呈现质量。";
  const event: PendingEvent = {
    id: `thesis-progress-y${state.year}-m${state.month}`,
    title: "毕业论文",
    description: "",
    preview: `大论文 ${stage.name}，当前 ${progress}%`,
    source: "thesis",
    blocking: true,
    deadlineMonths: 0,
    chainId: "thesis-progress",
    stage: "act1",
    choices,
  };

  return {
    nextState,
    event: createThreeStageEvent(event, {
      introDescription: [
        backgroundDescription,
        `当前阶段：${stage.name}，进度 ${progress}%。你已经不是在写“某一段文字”，而是在搭一条能支撑你走到答辩现场的完整链路。`,
        "论文这件事最难的地方，在于它不会因为你某一天状态好就自动完成；它只会忠实记录每个月的投入质量与连续性。",
        "本月的方向选择，会直接影响后续节奏和临近毕业时的容错空间。",
      ].join("\n\n"),
      decisionTitle: "本月安排",
      decisionDescription: [
        "你把论文目录摊在桌面上，光标停在“方法”和“结果”之间来回闪烁，像是在催你做取舍。",
        "按部就班地补正文和细节，整体风险最低，后续返工也少，但推进速度通常不够惊艳；若把时间压到关键实验上，可能一口气把核心结论做实，也可能在失败重试里把状态掏空。",
        "你很清楚，毕业论文不是一场单次冲刺，而是连续多月的耐力赛。这个月选错节奏，往后每一步都会更被动。",
        "你深吸一口气，准备决定本月是“保质量的稳推进”，还是“赌效率的强推进”。",
      ].join("\n\n"),
      results,
    }),
  };
}

export function collectThesisEventForMonth(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  return createThesisEvent(state);
}
