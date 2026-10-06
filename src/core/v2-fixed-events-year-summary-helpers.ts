import {
  appendMechanismSettlement,
  createFixedEvent,
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
  return createFixedEvent({
    id: `year-summary-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: "学年总结 ➜ 年初的目标 ➜ 划掉一项",
    description: appendMechanismSettlement([
      params.description,
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
        outcome: "你划掉了日历上的“休养生息”。SAN +5。",
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "sleep",
          year: state.year,
          month: state.month,
          description: [
            "日历上有几天空着，没记任务，也没记进度。你却记得，那几个周末把手机扔到枕头够不着的地方，睡醒了慢悠悠去吃饭，回来还有精神绕校园走一圈。原来空白的日子，也不是白过的。",
          ].join("\n\n"),
          closing: "你划掉“休养生息”，肩膀也跟着松下来。能在这一堆截止日期里把自己照顾好，也算完成了一件正经事。",
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
            "翻到夹着活动票根的那页，你想起这一年认识的人。有的是校内活动上聊熟的，有的是参会时加的好友，从实验聊到家乡，后来偶尔互发论文，也互发离谱的审稿意见。",
            ...(socialNarrative ? [socialNarrative] : []),
          ].join(""),
          closing: "你划掉“广交朋友”，顺手给朋友发了条消息。对方很快回了个表情包，和第一次拘谨地交换姓名时判若两人。",
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
            "日历上圈着几次交材料的日期。你想起替导师核对附件、补齐遗漏的那几个下午，从一开始反复确认，到后来能自己办妥再回一句“老师，已经弄好了”。文件名里的“最终版”还在变，你倒是熟练多了。",
            ...(favorNarrative ? [favorNarrative] : []),
          ].join(""),
          closing: "你在“取得导师信任”上划了一道。比起年初见面只会点头，如今老师交代事情时，已经少了几句不放心的叮嘱。",
          outcome: formatTierResistedOutcome("导师好感", 1, favorResult),
          settlement: `结果：${formatTierResistedOutcome("导师好感", 1, favorResult)}`,
          effects: favorGain > 0 ? { favor: favorGain } : {},
        })],
      };
    }
    case "year-summary-part-time": {
      const moneyGain = 3;
      return {
        nextState: state,
        outcome: `兼职攒下一笔钱，金币 +${moneyGain}。`,
        enqueueEvents: [createYearSummaryResultEvent({
          idSuffix: "part-time",
          year: state.year,
          month: state.month,
          description: [
            "日历页角记着几次兼职的时间。备课、答疑、改代码，都是从课题空档里挤出来的。你又翻了翻到账记录，钱不算多，每次收到时却总要多看两眼：总算不是催交材料的消息。",
          ].join("\n\n"),
          closing: "你划掉“兼职挣钱”，在旁边补了句“下学年少点外卖”。写完自己都不太信，还是留在了那里。",
          outcome: `金币 +${moneyGain}。`,
          settlement: `结果：金币 +${moneyGain}`,
          effects: { money: moneyGain },
        })],
      };
    }
  }
}
