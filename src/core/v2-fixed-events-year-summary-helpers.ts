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
        outcome: "你把可持续性放在第一位，这份续航会带到明年。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "sleep",
          year: state.year,
          month: state.month,
          description: "你把“可持续”放在了第一位。科研进度也许不是最快的，但你没有让自己被长期透支。",
          outcome: "SAN +5。",
          effects: { san: 5 },
        })],
      };
    case "year-summary-social": {
      const socialGain = Math.max(0, Math.min(3, 20 - state.player.social));
      return {
        nextState: state,
        outcome: socialGain > 0 ? `你决定继续拓展协作圈；社交 +${socialGain}。` : "你这条线已经没什么实际增量空间了。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "social",
          year: state.year,
          month: state.month,
          description: "你把更多时间放在人和人之间，慢慢把自己的协作圈拓开了。这些关系也许不会立刻见效，但会在关键时刻托你一把。",
          outcome: socialGain > 0 ? `社交 +${socialGain}。` : "社交已达到这条线的旧版封顶口径。",
          effects: socialGain > 0 ? { social: socialGain } : {},
        })],
      };
    }
    case "year-summary-favor": {
      const favorGain = Math.max(0, Math.min(3, 20 - state.player.favor));
      return {
        nextState: state,
        outcome: favorGain > 0 ? `你继续投入到导师这条线上；好感 +${favorGain}。` : "导师信任已经足够高，这次没有新的实际增量。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "favor",
          year: state.year,
          month: state.month,
          description: "你主动接住了不少导师交下来的事情，沟通方式也比之前更成熟。信任不是一次性冲出来的，但你确实把这条线又稳了一截。",
          outcome: favorGain > 0 ? `导师好感 +${favorGain}。` : "导师好感已达到这条线的旧版封顶口径。",
          effects: favorGain > 0 ? { favor: favorGain } : {},
        })],
      };
    }
    case "year-summary-intern": {
      const moneyGain = drawInclusiveInt(2, 3, getRoll);
      return {
        nextState: state,
        outcome: `你给自己补了一点现金缓冲；金钱 +${moneyGain}。`,
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "intern",
          year: state.year,
          month: state.month,
          description: "你在课题缝隙里挤出了一些时间去做实习。账户余额的变化不只是数字，也让你对下一年的选择多了一层现实缓冲。",
          outcome: `金钱 +${moneyGain}。`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
