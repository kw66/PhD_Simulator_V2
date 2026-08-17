import {
  createFixedEvent,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import {
  getYearSummaryLabel,
  resolveYearSummaryChoice,
} from "./v2-fixed-events-year-summary-helpers";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

function createYearSummaryChoiceEvent(state: GameState): PendingEvent {
  const yearLabel = getYearSummaryLabel(state.year);
  const socialCapped = state.player.social >= 20;
  const favorCapped = state.player.favor >= 20;

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: "新学年开始前，你准备补一块短板：状态、社交、导师关系，或者现金。",
    preview: `${yearLabel}学年即将结束，选一个来年侧重点`,
    chainId: "year-summary",
    stage: "act2",
    choices: [
      {
        id: `year-summary-sleep-y${state.year}-m${state.month}`,
        label: "休息调整",
        outcome: "你决定先把可持续性放在第一位。",
        effects: {
          fixedEventResolution: { kind: "year-summary-sleep" },
        },
      },
      {
        id: `year-summary-social-y${state.year}-m${state.month}`,
        label: socialCapped ? "经营社交（已封顶）" : "经营社交",
        outcome: "你决定把更多精力投到人和人之间。",
        effects: {
          fixedEventResolution: { kind: "year-summary-social" },
        },
      },
      {
        id: `year-summary-favor-y${state.year}-m${state.month}`,
        label: favorCapped ? "服务导师（已封顶）" : "服务导师",
        outcome: "你决定把这一段时间用来稳住导师这条线。",
        effects: {
          fixedEventResolution: { kind: "year-summary-favor" },
        },
      },
      {
        id: `year-summary-intern-y${state.year}-m${state.month}`,
        label: "外出实习",
        outcome: "你决定给自己接一点更现实的现金缓冲。",
        effects: {
          fixedEventResolution: { kind: "year-summary-intern" },
        },
      },
    ],
  });
}

export function createYearSummaryEvent(state: GameState): PendingEvent {
  const yearLabel = getYearSummaryLabel(state.year);
  return createFixedEvent({
    id: `year-summary-y${state.year}-m${state.month}`,
    title: "学年总结",
    description: `${yearLabel}接近尾声。你回顾这一年的得失，准备为新学年定个方向。`,
    preview: `${yearLabel}学年即将结束，回顾这一年`,
    chainId: "year-summary",
    choices: [
      {
        id: `year-summary-open-y${state.year}-m${state.month}`,
        label: "回顾这一学年",
        outcome: "你准备正式做一次年度复盘。",
        effects: {
          fixedEventResolution: { kind: "year-summary-open" },
        },
      },
    ],
  });
}

export function resolveYearSummaryFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult | null {
  switch (resolution.kind) {
    case "year-summary-open":
      return {
        nextState: state,
        outcome: "你开始把这一年的得失整理成可执行的判断。",
        enqueueEvents: [createYearSummaryChoiceEvent(state)],
      };
    case "year-summary-sleep":
      return resolveYearSummaryChoice(state, "year-summary-sleep", getRoll);
    case "year-summary-social": {
      return resolveYearSummaryChoice(state, "year-summary-social", getRoll);
    }
    case "year-summary-favor": {
      return resolveYearSummaryChoice(state, "year-summary-favor", getRoll);
    }
    case "year-summary-intern": {
      return resolveYearSummaryChoice(state, "year-summary-intern", getRoll);
    }
    default:
      return null;
  }
}
