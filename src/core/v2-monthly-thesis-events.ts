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
import { formatActualSanChange, getActualSanChange } from "./v2-sanity-rules";

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
      ? getActualSanChange(-result.sanCost, state.month, state.eventSupport, state.buffs)
      : 0;
    results[option.id] = {
      title: "推进结果",
      description: result.progressGain > 0
        ? [
            "你按目录理顺材料，把几处“这里再补”换成了正文。有一段写的时候觉得挺明白，回头读却连自己也绕进去，只好拆开重写。",
            `总进度从 ${nextThesis.progress}% 提升到 ${result.nextThesis.progress}%，当前阶段来到「${getThesisStage(result.nextThesis.progress).name}」。`,
            "保存，再备份。你又往下翻了翻，这回确实多了些自己写下的东西。",
          ].join("\n\n")
        : [
            "你打开毕业论文文档，光标在原处闪了一会儿，最后还是关掉了窗口。这个月先搁置，正文没有多出一个字。",
            `总进度保持在 ${nextThesis.progress}%，当前阶段仍是「${getThesisStage(nextThesis.progress).name}」。`,
            "关窗口时倒很利索，下回点开，却还是得接着面对这一页。",
          ].join("\n\n"),
    };
    return {
      id: option.id,
      label: option.text,
      outcome: result.progressGain > 0
        ? `大论文推进 +${result.progressGain}，${sanChange < 0 ? formatActualSanChange(-result.sanCost, state.month, state.eventSupport, state.buffs) : "SAN 不变"}。`
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
      "你关掉毕业论文文档，把后续写作从日程里删去。这次不再往下个月挪，也不再继续补正文。",
      "文件还在原来的文件夹里，目录中空着的地方也照旧空着。你看了一眼文件名，没有给它添上“终稿”两个字。",
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
    ? "你打开毕业论文文档，封面和目录倒是齐整，往下翻却没多少正文。光标停在第一章开头，你把题目又读了一遍。"
    : progress < 40
      ? "你翻开开题材料，停在“拟解决的问题”这一栏。题目已经很像样了，可要说清到底准备做什么，你又删掉了半行。"
      : progress < 60
        ? "你把几篇相关论文并排打开，来回找各自的方法和结论。PDF里满是高亮，轮到在综述里串成一段话，光标却迟迟没往前走。"
        : progress < 80
          ? "你翻出研究记录，对着结果核查当时的步骤。一处备注只写了“同上”，你往上翻了好几页，开始怀疑当时的自己到底有多赶时间。"
          : "你在正文、图表和参考文献间来回跳转。刚改好图号，又发现后面还引用着旧编号；论文有了样子，细看却到处要伸手修一修。";
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
        `当前阶段：${stage.name}，进度 ${progress}%。你顺手把待处理的地方记在目录旁，本来以为只剩几处，写着写着又多了一行。`,
      ].join("\n\n"),
      decisionTitle: "本月安排",
      decisionDescription: [
        "你翻出能用上的已发表论文，把研究笔记也放到文档旁。很多内容亲手做过，写起来总算有底；只是要把这些东西理顺，还是得踏踏实实坐下来写。",
        "目录旁有几处你早就想补，一直拖到现在。你往下翻了两页，又拉回原处，心里有些着急。这个月真想多写一点，就得留出不被打断的时间和精力。",
      ].join("\n\n"),
      results,
    }),
  };
}

export function collectThesisEventForMonth(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  return createThesisEvent(state);
}
