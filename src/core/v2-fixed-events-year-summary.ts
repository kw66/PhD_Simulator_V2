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
  const sanThought = state.player.san < 40
    ? "“最近真的有点透支，再不休息感觉要撑不住了……”"
    : state.player.san < 70
      ? "“有点疲惫，好好休息一下也不错。”"
      : "“虽然状态还行，但先稳住续航也不亏。”";
  const socialCapped = state.player.social >= 20;
  const socialThought = socialCapped
    ? "“社交圈已经足够大了，再往上压也不会有太多实际增量。”"
    : state.player.social < 6
      ? "“确实应该多认识些人，不能老是一个人闷着做。”"
      : "“再拓一拓协作圈，对明年总有好处。”";
  const favorCapped = state.player.favor >= 20;
  const favorThought = favorCapped
    ? "“导师这边已经足够信任我了，再往上堆也不会再多出多少空间。”"
    : state.player.favor < 0
      ? "“得赶紧把导师这条线修回来，不然后面很难办。”"
      : "“再稳一稳和导师的信任，后面很多事情都会顺一些。”";
  const moneyThought = state.player.money < 3
    ? "“手头有点紧，得想办法赚点现金缓冲。”"
    : "“多一点现金储备，明年做选择会更从容。”";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: `“如果把这一年重来一次，我最该把精力放在哪里？”${sanThought}${socialThought}${favorThought}${moneyThought}你知道，这不是选最舒服的路，而是在给下一学年选一条主线。`,
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
    description: `${yearLabel}接近尾声，你在月历上划掉了这一年的最后几项节点。这一年有推进，也有卡壳；有被肯定，也有深夜怀疑自己。你决定停下来做一次正式复盘，给下一学年一个更清楚的起点。`,
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
