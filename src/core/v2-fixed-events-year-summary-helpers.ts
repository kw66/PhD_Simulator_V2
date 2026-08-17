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
  const yearLabel = getYearSummaryLabel(params.year);
  return createFixedEvent({
    id: `year-summary-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: "学年总结 ➜ 年度总结 ➜ 辞旧迎新",
    description: [
      `${yearLabel}复盘已完成，你把这一年的得失从“感受”整理成了“可执行判断”。`,
      params.description,
      "这不是一份漂亮总结，而是一份下一学年可直接执行的路线说明。",
    ].join("\n\n"),
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
          description: [
            "你把“可持续”放在第一位，没有让自己长期透支。",
            "科研进度也许不算最快，但你把状态守住了。",
          ].join("\n\n"),
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
          description: [
            "你把更多时间放在人和人之间，慢慢把自己的协作圈拓开了。",
            "这些关系未必立刻见效，但会在关键节点托你一把。",
          ].join("\n\n"),
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
          description: [
            "你主动接住了不少导师事务，沟通方式也更成熟了。",
            "信任是慢慢累积的，很多机会开始优先流到你手里。",
          ].join("\n\n"),
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
          description: [
            "你在课题缝隙里挤出时间做实习，把“生存焦虑”往下压了一截。",
            "账户余额增加不只是数字变化，也让你后续选择更从容。",
          ].join("\n\n"),
          outcome: `金钱 +${moneyGain}。`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
