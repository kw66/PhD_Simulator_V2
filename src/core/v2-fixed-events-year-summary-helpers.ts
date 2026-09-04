import {
  appendMechanismSettlement,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function getYearSummaryLabel(year: number): string {
  if (year === 1) return "研一";
  if (year === 2) return "研二";
  if (year === 3) return "研三";
  return `第 ${year} 年`;
}

export function createYearSummaryResultEvent(params: {
  idSuffix: "sleep" | "social" | "favor" | "part-time";
  year: number;
  month: number;
  description: string;
  outcome: string;
  settlement: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  const yearLabel = getYearSummaryLabel(params.year);
  return createFixedEvent({
    id: `year-summary-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: "学年总结 ➜ 年度总结 ➜ 辞旧迎新",
    description: appendMechanismSettlement([
      `${yearLabel}就这样结束了。`,
      params.description,
      "你把下一学年最想做的事记在了日历上。",
    ].join("\n\n"), params.settlement),
    chainId: "year-summary",
    stage: "result",
    choices: [
      {
        id: `year-summary-${params.idSuffix}-finish-y${params.year}-m${params.month}`,
        label: "继续",
        outcome: params.outcome,
        effects: params.effects,
      },
    ],
  });
}

export function resolveYearSummaryChoice(
  state: GameState,
  kind: "year-summary-sleep" | "year-summary-social" | "year-summary-favor" | "year-summary-part-time",
  getRoll: RandomRollProvider,
): FixedResolutionResult {
  switch (kind) {
    case "year-summary-sleep":
      return {
        nextState: state,
        outcome: "你先停下来喘口气。SAN +5。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "sleep",
          year: state.year,
          month: state.month,
          description: [
            "你决定先少安排一些任务，把欠下的觉补回来。",
            "科研进度慢了一点，精神总算恢复了不少。",
          ].join("\n\n"),
          outcome: "SAN +5。",
          settlement: "SAN +5",
          effects: { san: 5 },
        })],
      };
    case "year-summary-social": {
      const socialResult = applyTierResist(1, state.player.social, getRoll);
      const socialGain = socialResult.effectiveChange;
      const socialNarrative = getTierResistedNarrative("社交", 1, socialResult);
      return {
        nextState: state,
        outcome: formatTierResistedOutcome("社交", 1, socialResult),
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "social",
          year: state.year,
          month: state.month,
          description: [
            "你参加了几次活动，也主动认识了其他课题组的同学。",
            "实验室之外，能聊研究和互相帮忙的人多了起来。",
            ...(socialNarrative ? [socialNarrative] : []),
          ].join("\n\n"),
          outcome: formatTierResistedOutcome("社交", 1, socialResult),
          settlement: formatTierResistedOutcome("社交", 1, socialResult),
          effects: socialGain > 0 ? { social: socialGain } : {},
        })],
      };
    }
    case "year-summary-favor": {
      const favorResult = applyTierResist(1, state.player.favor, getRoll);
      const favorGain = favorResult.effectiveChange;
      const favorNarrative = getTierResistedNarrative("导师好感", 1, favorResult);
      return {
        nextState: state,
        outcome: formatTierResistedOutcome("导师好感", 1, favorResult),
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "favor",
          year: state.year,
          month: state.month,
          description: [
            "你主动接了几件组里的事，汇报也比以前及时。",
            "导师渐渐更愿意把重要任务交给你。",
            ...(favorNarrative ? [favorNarrative] : []),
          ].join("\n\n"),
          outcome: formatTierResistedOutcome("导师好感", 1, favorResult),
          settlement: formatTierResistedOutcome("导师好感", 1, favorResult),
          effects: favorGain > 0 ? { favor: favorGain } : {},
        })],
      };
    }
    case "year-summary-part-time": {
      const moneyGain = drawInclusiveInt(2, 3, getRoll);
      return {
        nextState: state,
        outcome: `兼职攒下一笔钱，金币 +${moneyGain}。`,
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "part-time",
          year: state.year,
          month: state.month,
          description: [
            "你在课题空档接了一份兼职，白天干活，晚上还得处理实验。",
            "过程很累，不过账户里总算多了一笔钱。",
          ].join("\n\n"),
          outcome: `金币 +${moneyGain}。`,
          settlement: `金币 +${moneyGain}`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
