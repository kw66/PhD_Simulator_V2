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
  /** One closing line written for this choice, so the four results do not share an ending. */
  closing: string;
  outcome: string;
  settlement: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  const yearLabel = getYearSummaryLabel(params.year);
  return createFixedEvent({
    id: `year-summary-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: "学年总结 ➜ 年度总结 ➜ 新学年",
    description: appendMechanismSettlement([
      `${yearLabel}的总结写到了最后一页。${params.description}`,
      params.closing,
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
          closing: "你在总结末尾写下“先睡够”，又在后面画了个圈。这一条，倒是今年最容易做到的。",
          outcome: "SAN +5。",
          settlement: "结果：SAN +5",
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
            "校内活动上，你试着和其他课题组的同学搭话，从实验聊到食堂。不用先准备一份汇报，也能把话接下去。散场时，和聊得来的同学道了再见。",
            ...(socialNarrative ? [socialNarrative] : []),
          ].join(""),
          closing: "回到宿舍，你在总结末尾添了几个新名字。月历上的下个月，第一次不全是组会和截止日期。",
          outcome: formatTierResistedOutcome("社交", 1, socialResult),
          settlement: `结果：${formatTierResistedOutcome("社交", 1, socialResult)}`,
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
            "你帮组里核对年度材料，分清几个名字几乎一样的附件。导师问起时，总算能指出该打开哪份，不用跟着鼠标在文件夹里迷路。",
            ...(favorNarrative ? [favorNarrative] : []),
          ].join(""),
          closing: "你把整理好的文件夹发给导师，顺手在总结末尾记下明年要接手的事。清单有点长，好在每一项都知道从哪开始。",
          outcome: formatTierResistedOutcome("导师好感", 1, favorResult),
          settlement: `结果：${formatTierResistedOutcome("导师好感", 1, favorResult)}`,
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
          closing: "你在总结的开销那页划掉一行赤字，又补了句“下学期少点外卖”。写完自己都不太信，还是留在了那里。",
          outcome: `金币 +${moneyGain}。`,
          settlement: `结果：金币 +${moneyGain}`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
