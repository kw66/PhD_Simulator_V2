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
import { getActualSanChange } from "./v2-sanity-rules";

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
    const sanChange = result.sanCost > 0
      ? getActualSanChange(-result.sanCost, state.month, state.eventSupport)
      : 0;
    results[option.id] = {
      title: "推进结果",
      description: result.progressGain > 0
        ? [
            "你完成了本月安排的论文任务，正文、实验或目录又补上了一部分。",
            `总进度从 ${nextThesis.progress}% 提升到 ${result.nextThesis.progress}%，当前阶段来到「${getThesisStage(result.nextThesis.progress).name}」。`,
            "文档离定稿还有一段距离，至少这次留下了能继续修改的内容。",
          ].join("\n\n")
        : [
            "这个月你没有给毕业论文安排额外时间，文档仍停在上次的位置。",
            `总进度保持在 ${nextThesis.progress}%，当前阶段仍是「${getThesisStage(nextThesis.progress).name}」。`,
            "目录里的空白还在，之后仍要找时间把这一部分补上。",
          ].join("\n\n"),
    };
    return {
      id: option.id,
      label: option.text,
      outcome: result.progressGain > 0
        ? `大论文推进 +${result.progressGain}，SAN ${sanChange < 0 ? sanChange : "不变"}。`
        : "当前方案没有带来明显进展。",
      effects: {
        san: sanChange,
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
    description: [
      "你把毕业论文的文档暂时合上了。",
      "继续耗下去只会挤掉其他安排，现在停下来反而更轻松。",
      "之后的时间，你准备放到更值得推进的事情上。",
    ].join("\n\n"),
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
    ? "你打开空白文档，写下标题，正文还几乎是空的。"
    : progress < 40
      ? "文献越读越多，你在资料中努力抓住自己的核心问题。"
      : progress < 60
        ? "思路逐渐收束，接下来是更费精力的实证与推导。"
        : progress < 80
          ? "素材已经齐了，接下来最费时间的是写作和反复修改。"
          : "论文已接近完成，最后阶段决定答辩时的呈现质量。";
  const event: PendingEvent = {
    id: `thesis-progress-y${state.year}-m${state.month}`,
    title: "毕业论文",
    description: "",
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
        `当前阶段：${stage.name}，进度 ${progress}%。目录里还有不少空白，实验和正文也得继续补。`,
        "毕业论文只能一点点往前写，这个月又该安排一部分了。",
      ].join("\n\n"),
      decisionTitle: "本月安排",
      decisionDescription: [
        "按部就班补正文最稳，返工也少，只是推进得慢。",
        "把时间都压在关键实验上可能进展更快，也可能连续失败。",
        "你看着论文目录，决定这个月先做哪一部分。",
      ].join("\n\n"),
      results,
    }),
  };
}

export function collectThesisEventForMonth(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  return createThesisEvent(state);
}
