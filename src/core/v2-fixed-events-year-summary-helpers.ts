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
      `${yearLabel}的总结写到了最后一页。${params.description}`,
      "你在总结末尾添上几笔，合起本子。这一页字写得有点歪，倒比开头那句“继续努力”具体多了。",
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
            "你趁任务间隙留出时间，晚上把手机放到枕头够不着的地方。起初还伸手摸了两次，后来就睡着了。再醒来时，窗帘缝里透着光，你在床上多躺了一会儿，才慢慢起身去吃饭。",
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
            "你抽空参加了校内活动，试着和其他课题组的同学搭话。从实验聊到食堂，你发现不用先准备一份汇报，也能把话接下去。散场时，你和聊得来的同学互道了再见。",
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
            "你帮组里整理年度材料，逐项核对附件，把几个名字几乎一样的文件分清楚。导师问起时，你总算能直接指出该打开哪一份，不用跟着鼠标一起在文件夹里迷路。",
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
            "你在课题空档接了份短期兼职，按约完成工作后收到了报酬。钱不算多，你还是反复看了几眼到账通知：这次打开手机，总算不是催你交材料的消息。",
          ].join("\n\n"),
          outcome: `金币 +${moneyGain}。`,
          settlement: `金币 +${moneyGain}`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
