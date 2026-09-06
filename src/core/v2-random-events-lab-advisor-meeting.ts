import {
  createThreeStageRandomEvent,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import { applyTierResist, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange, getResearchMiscSanNarrative, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorMeetingRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const advisorPresentForPrepared = getRoll() < 0.5;
  const advisorPresentForSeries = getRoll() < 0.5;
  const advisorPresentForSlack = getRoll() < 0.5;
  const preparedSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const preparedSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const preparedSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const seriesSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport);
  const seriesSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport);
  const seriesSanNarrative = getResearchMiscSanNarrative(-4, state.player.research);
  const preparedFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const preparedFavorChange = preparedFavorResult.effectiveChange;
  const preparedFavorNarrative = getTierResistedNarrative("导师好感", 1, preparedFavorResult);
  const researchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const researchChange = researchResult.effectiveChange;
  const researchNarrative = getTierResistedNarrative("科研", 1, researchResult);
  const seriesFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const seriesFavorChange = seriesFavorResult.effectiveChange;
  const seriesFavorNarrative = getTierResistedNarrative("导师好感", 1, seriesFavorResult);
  const slackFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const slackFavorChange = slackFavorResult.effectiveChange;
  const slackFavorNarrative = getTierResistedNarrative("导师好感", -1, slackFavorResult);
  const advisorAttendanceCondition = (present: boolean): string => formatProbabilityCondition(
    present ? "导师到场" : "导师缺席",
    0.5,
  );

  const event: PendingEvent = {
    id: `random-6-y${state.year}-m${state.month}-n${serial}`,
    title: "组会汇报",
    description: "这周组会轮到你汇报，PPT 还空着一半，实验也没跑出理想结果。离开会只剩一点时间，你得决定今晚怎么准备。",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-6",
    stage: "act1",
    choices: [
      {
        id: `random-6-deep-${serial}`,
        label: "认真准备",
        outcome: advisorPresentForPrepared
          ? `${advisorAttendanceCondition(true)}｜${preparedSanSummary}；${formatTierResistedOutcome("导师好感", 1, preparedFavorResult)}`
          : `${advisorAttendanceCondition(false)}｜${preparedSanSummary}`,
        effects: advisorPresentForPrepared
          ? { san: preparedSanChange, favor: preparedFavorChange }
          : { san: preparedSanChange },
      },
      {
        id: `random-6-series-${serial}`,
        label: "讲系列论文",
        outcome: advisorPresentForSeries
          ? `${advisorAttendanceCondition(true)}｜${seriesSanSummary}；${formatTierResistedOutcome("科研", 1, researchResult)}；${formatTierResistedOutcome("导师好感", 1, seriesFavorResult)}`
          : `${advisorAttendanceCondition(false)}｜${seriesSanSummary}；${formatTierResistedOutcome("科研", 1, researchResult)}`,
        effects: advisorPresentForSeries
          ? { san: seriesSanChange, research: researchChange, favor: seriesFavorChange }
          : { san: seriesSanChange, research: researchChange },
      },
      {
        id: `random-6-slack-${serial}`,
        label: "随便水一下",
        outcome: advisorPresentForSlack
          ? `${advisorAttendanceCondition(true)}｜${formatTierResistedOutcome("导师好感", -1, slackFavorResult)}`
          : `${advisorAttendanceCondition(false)}｜无事发生。`,
        effects: advisorPresentForSlack && slackFavorChange < 0 ? { favor: slackFavorChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "离周组会只剩一个晚上，这次轮到你汇报。",
      "自己的实验还没有理想结果，待读列表里倒是攒了不少论文。",
      "明天导师是否到场还不确定，但 PPT 今晚总得做完。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "认真整理自己的进展最稳，但得花时间把材料讲清楚。",
      "把几篇相关论文串起来讲，能理清方法之间的关系，只是今晚恐怕得熬得更晚。",
      "临时凑一份最省事，但要是明天导师到场追问，就未必能应付过去了。",
    ].join("\n\n"),
    results: {
      [`random-6-deep-${serial}`]: {
        title: "深入汇报",
        description: [
          "你把汇报材料重新整理了一遍，把重点放在自己真正理解的部分。",
          advisorPresentForPrepared
            ? "导师听完后提了几个问题，也给了你一些具体建议。散会后，你把建议逐条补进下一轮实验计划。"
            : "导师临时有事没来，你把准备好的内容完整讲完。同门追问了两处细节，也帮你发现有张图的标注不够清楚。",
          ...(advisorPresentForPrepared && preparedFavorNarrative ? [preparedFavorNarrative] : []),
          ...(preparedSanNarrative ? [preparedSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-6-series-${serial}`]: {
        title: "系列汇报",
        description: advisorPresentForSeries
          ? [
              "你把同一方向的几篇论文放在一起，重新整理了方法演进和实验差异。",
              "组会上，导师盯着对比表看了很久，追问两种方法为什么会得出相反结论。",
              "你昨晚核对过实验条件，总算答了上来。散会后，导师建议把这份整理写进论文的相关工作部分。",
              ...(researchNarrative ? [researchNarrative] : []),
              ...(seriesFavorNarrative ? [seriesFavorNarrative] : []),
              ...(seriesSanNarrative ? [seriesSanNarrative] : []),
            ].join("\n\n")
          : [
              "你把同一方向的几篇论文放在一起，重新整理了方法演进和实验差异。",
              "组会开始前，导师临时通知不来，由一位师兄主持。",
              "同门围着你的对比表讨论了很久，还补上了两篇你漏掉的工作。这份准备没有白做。",
              ...(researchNarrative ? [researchNarrative] : []),
              ...(seriesSanNarrative ? [seriesSanNarrative] : []),
            ].join("\n\n"),
      },
      [`random-6-slack-${serial}`]: {
        title: "摸鱼划水",
        description: advisorPresentForSlack
          ? [
              "你临时挑了一篇不太难的论文，PPT 也只摘了摘要和几张原图。",
              "导师听了两页就问起实验设置，你对着图找了半天也没说清楚。",
              "“下次至少先把论文读完。”导师让你结束汇报，你默默回到座位。",
              ...(slackFavorNarrative ? [slackFavorNarrative] : []),
            ].join("\n\n")
          : [
              "你临时挑了一篇不太难的论文，PPT 也只摘了摘要和几张原图。",
              "导师当天没有到场，主持组会的师兄也没多追问。",
              "不到十分钟，你就翻到了最后一页。这次算是混过去了。",
            ].join("\n\n"),
      },
    },
  });
}

