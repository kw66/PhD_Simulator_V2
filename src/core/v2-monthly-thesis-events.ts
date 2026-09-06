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
            "你把这个月留给毕业论文的时间用上了，整理已有材料，补写内容，再把前后说不通的地方改顺。保存文档时，终于不只是改了个文件名。",
            `总进度从 ${nextThesis.progress}% 提升到 ${result.nextThesis.progress}%，当前阶段来到「${getThesisStage(result.nextThesis.progress).name}」。`,
            "你备份好这一版，也记下了下次查看时需要留意的地方。",
          ].join("\n\n")
        : [
            "你看了一眼上次保存的文档，还是没有动笔。这个月先不往毕业论文上加任务，桌面上的文件日期也就没有更新。",
            `总进度保持在 ${nextThesis.progress}%，当前阶段仍是「${getThesisStage(nextThesis.progress).name}」。`,
            "没写完的部分不会自己长出来，只能留到之后再安排。",
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
      "你关掉毕业论文文档，决定不再继续写下去。这次不是把待办拖到下个月，而是从此不再给它安排时间。",
      "已有的材料还保存在文件夹里，只是你不再逐项补齐目录。这个决定并不等于论文已经完成，你也没有给这份文档换上“终稿”的名字。",
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
    ? "你打开毕业论文文档，先核对题目和目录。正文还没成形，之前随手存下的材料也得重新理一遍。"
    : progress < 40
      ? "你翻开开题材料，检查研究问题、已有工作和计划安排。题目写在第一页，具体要做什么却还得一项项说清楚。"
      : progress < 60
        ? "你把几篇相关论文并排打开，整理它们用了什么方法、解决了什么问题。参考文献越攒越多，综述却不能只列一串名字。"
        : progress < 80
          ? "你重新核对研究记录和结果，把能写进论文的材料整理出来。零散记录当时都看得懂，现在却得想办法让别人也看明白。"
          : "你在正文、图表和参考文献之间来回翻页。论文已经有了样子，重复的段落要删，前后不一致的表述也得逐一改好。";
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
        `当前阶段：${stage.name}，进度 ${progress}%。你对照目录记下接下来要做的事，准备给这个月留出写论文的时间。`,
      ].join("\n\n"),
      decisionTitle: "本月安排",
      decisionDescription: [
        "你对着日程算了算：可以暂时搁置，也可以每天挤一点时间写；若想多完成一些，就得花更多精力。",
        "之前发表的论文和积累的研究经验能帮上忙，但文档还是要自己打开。这个月打算写到什么程度？",
      ].join("\n\n"),
      results,
    }),
  };
}

export function collectThesisEventForMonth(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  return createThesisEvent(state);
}
