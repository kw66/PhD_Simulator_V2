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
  const sleepHint = state.player.san < 40
    ? "“最近真的累坏了，再不休息感觉要撑不住了……”"
    : state.player.san < 70
      ? "“有点疲惫，好好休息一下也不错”"
      : "“虽然精神还行，但躺平也挺舒服的……”";
  const socialHint = socialCapped
    ? "“朋友已经够多了，再认识也记不住名字……”"
    : state.player.social < 6
      ? "“确实应该多认识些人，太孤僻了不好……”"
      : "“多交些朋友总没坏处，人脉嘛”";
  const favorHint = favorCapped
    ? "“导师对我已经很满意了，不用再刻意讨好”"
    : state.player.favor < 0
      ? "“得赶紧修复和导师的关系，不然毕业堪忧……”"
      : "“帮导师多干点活，毕业的时候好说话”";
  const internHint = state.player.money < 3
    ? "“手头有点紧，得想办法赚点钱……”"
    : "“偷偷实习攒点私房钱，以后用得上”";

  return createFixedEvent({
    id: `year-summary-choice-y${state.year}-m${state.month}`,
    title: "学年总结 ➜ 年度总结",
    description: [
      "“如果把这一年重来一次，我最该把精力放在哪？”",
      sleepHint,
      socialHint,
      favorHint,
      internHint,
      "你明白这一步不是“选最舒服”，而是“选最适合下一学年的主线”：修复续航、扩展协作、加深导师信任，或换取更现实的现金缓冲。",
    ].join("\n\n"),
    preview: `${yearLabel}学年即将结束，选一个来年侧重点`,
    chainId: "year-summary",
    stage: "act2",
    choices: [
      {
        id: `year-summary-sleep-y${state.year}-m${state.month}`,
        label: "休息调整",
        outcome: "先把状态养回来。",
        effects: {
          fixedEventResolution: { kind: "year-summary-sleep" },
        },
      },
      {
        id: `year-summary-social-y${state.year}-m${state.month}`,
        label: socialCapped ? "经营社交（已封顶）" : "经营社交",
        outcome: "多认识些人，也多做些合作。",
        effects: {
          fixedEventResolution: { kind: "year-summary-social" },
        },
      },
      {
        id: `year-summary-favor-y${state.year}-m${state.month}`,
        label: favorCapped ? "服务导师（已封顶）" : "服务导师",
        outcome: "多承担些组里的事。",
        effects: {
          fixedEventResolution: { kind: "year-summary-favor" },
        },
      },
      {
        id: `year-summary-intern-y${state.year}-m${state.month}`,
        label: "外出实习",
        outcome: "出去实习，顺便攒点钱。",
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
    description: [
      `${yearLabel}接近尾声，你在月历上划掉了最后几项节点。`,
      "不知不觉，这一学年就要结束了。",
      "这一年有推进，也有卡壳；有被肯定，也有深夜怀疑自己。",
      "很多当时觉得“卡死”的节点，如今回头看都成了经验样本。你决定停下来做一次正式复盘，给下一年一个更清楚的起点。",
    ].join("\n\n"),
    preview: `${yearLabel}学年即将结束，回顾这一年`,
    chainId: "year-summary",
    choices: [
      {
        id: `year-summary-open-y${state.year}-m${state.month}`,
        label: "回顾这一学年",
        outcome: "回顾这一学年。",
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
        outcome: "想想下一年更该顾哪一头。",
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
