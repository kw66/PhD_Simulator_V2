import {
  THESIS_OPTIONS,
  applyThesisOption,
  getThesisStage,
  shouldTriggerThesisEvent,
  startThesisIfAvailable,
} from "./v2-thesis-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";

function createThesisChoices(state: GameState): { nextState: GameState; choices: EventChoice[] } {
  const nextThesis = startThesisIfAvailable(state.year, state.month, state.thesis);
  const publishedPaperCount = getPublishedPaperCount(state);

  const choices: EventChoice[] = THESIS_OPTIONS.map((option) => {
    const result = applyThesisOption(nextThesis, option, publishedPaperCount, state.player.research);
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
    outcome: "你决定暂时停止推进大论文。",
    effects: {
      abandonThesis: true,
    },
  });

  return {
    nextState: {
      ...state,
      thesis: nextThesis,
    },
    choices,
  };
}

function createThesisEvent(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  if (!shouldTriggerThesisEvent(state.year, state.month, state.thesis)) {
    return { nextState: state, event: null };
  }

  const { nextState, choices } = createThesisChoices(state);
  const stage = getThesisStage(nextState.thesis.progress);

  return {
    nextState,
    event: {
      id: `thesis-progress-y${state.year}-m${state.month}`,
      title: "毕业论文推进",
      description: `你当前处于${stage.name}阶段，大论文进度为 ${nextState.thesis.progress}%。这个月要决定继续怎么推进。`,
      preview: `大论文 ${stage.name}，当前 ${nextState.thesis.progress}%`,
      source: "thesis",
      blocking: true,
      deadlineMonths: 0,
      chainId: "thesis-progress",
      stage: "act1",
      choices,
    },
  };
}

export function collectThesisEventForMonth(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  return createThesisEvent(state);
}
