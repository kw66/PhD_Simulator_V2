import {
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function getYearSummaryLabel(year: number): string {
  if (year === 1) return "研一";
  if (year === 2) return "研二";
  if (year === 3) return "研三";
  return `第 ${year} 年`;
}

export function createYearSummaryResultEvent(params: {
  idSuffix: "sleep" | "social" | "favor" | "intern";
  year: number;
  month: number;
  description: string;
  outcome: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `year-summary-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: "学年总结 ➜ 年度总结 ➜ 辞旧迎新",
    description: params.description,
    preview: "你把这一年的得失整理成了下一学年的出发点",
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
  kind: "year-summary-sleep" | "year-summary-social" | "year-summary-favor" | "year-summary-intern",
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
          description: "先休息。为新学年留足状态。",
          outcome: "SAN +5。",
          effects: { san: 5 },
        })],
      };
    case "year-summary-social": {
      const socialGain = Math.max(0, Math.min(3, 20 - state.player.social));
      return {
        nextState: state,
        outcome: socialGain > 0 ? `认识了更多人，社交 +${socialGain}。` : "认识的人已经够多了，社交不变。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "social",
          year: state.year,
          month: state.month,
          description: "认识了更多人。协作圈扩大了。",
          outcome: socialGain > 0 ? `社交 +${socialGain}。` : "社交已达上限。",
          effects: socialGain > 0 ? { social: socialGain } : {},
        })],
      };
    }
    case "year-summary-favor": {
      const favorGain = Math.max(0, Math.min(3, 20 - state.player.favor));
      return {
        nextState: state,
        outcome: favorGain > 0 ? `导师更信任你了，好感 +${favorGain}。` : "导师已经很信任你，好感不变。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "favor",
          year: state.year,
          month: state.month,
          description: "多接了些导师的事。信任更稳了。",
          outcome: favorGain > 0 ? `导师好感 +${favorGain}。` : "导师好感已达上限。",
          effects: favorGain > 0 ? { favor: favorGain } : {},
        })],
      };
    }
    case "year-summary-intern": {
      const moneyGain = drawInclusiveInt(2, 3, getRoll);
      return {
        nextState: state,
        outcome: `实习攒下一笔钱，金钱 +${moneyGain}。`,
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "intern",
          year: state.year,
          month: state.month,
          description: "抽时间做了实习。攒下一笔钱。",
          outcome: `金钱 +${moneyGain}。`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
