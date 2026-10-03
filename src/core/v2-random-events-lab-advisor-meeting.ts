import {
  createThreeStageEvent,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import { applyTierResist, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorMeetingRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const advisorPresentForPrepared = getRoll() < 0.5;
  const advisorPresentForSeries = getRoll() < 0.5;
  const advisorPresentForSlack = getRoll() < 0.5;
  const preparedSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const preparedSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const seriesSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const seriesSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const preparedFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const preparedFavorChange = preparedFavorResult.effectiveChange;
  const researchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const researchChange = researchResult.effectiveChange;
  const seriesFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const seriesFavorChange = seriesFavorResult.effectiveChange;
  const slackFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const slackFavorChange = slackFavorResult.effectiveChange;

  const event: PendingEvent = {
    id: `random-6-y${state.year}-m${state.month}-n${serial}`,
    title: "组会汇报",
    description: "这周轮到你做组会的 paper reading。你挑了几篇同方向的论文，原本想先看懂核心方法，再把整体思路和创新讲清楚，结果拖到前一天，PPT 还只有封面和“谢谢聆听”😅。",
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
          ? `导师到场（50%）｜${preparedSanSummary}；${formatTierResistedOutcome("导师好感", 1, preparedFavorResult)}`
          : `导师缺席（50%）｜${preparedSanSummary}`,
        effects: advisorPresentForPrepared
          ? { san: preparedSanChange, favor: preparedFavorChange }
          : { san: preparedSanChange },
      },
      {
        id: `random-6-series-${serial}`,
        label: "讲系列论文",
        outcome: advisorPresentForSeries
          ? `导师到场（50%）｜${seriesSanSummary}；${formatTierResistedOutcome("科研", 1, researchResult)}；${formatTierResistedOutcome("导师好感", 1, seriesFavorResult)}`
          : `导师缺席（50%）｜${seriesSanSummary}；${formatTierResistedOutcome("科研", 1, researchResult)}`,
        effects: advisorPresentForSeries
          ? { san: seriesSanChange, research: researchChange, favor: seriesFavorChange }
          : { san: seriesSanChange, research: researchChange },
      },
      {
        id: `random-6-slack-${serial}`,
        label: "随便水一下",
        outcome: advisorPresentForSlack
          ? `导师到场（50%）｜${formatTierResistedOutcome("导师好感", -1, slackFavorResult)}`
          : "导师缺席（50%）｜无事发生。",
        effects: advisorPresentForSlack && slackFavorChange < 0 ? { favor: slackFavorChange } : {},
      },
    ],
  };

  return createThreeStageEvent(event, {
    introDescription: [
      "课题组群发来明天的安排：这次轮到你做 paper reading。你重新打开那几篇论文，题目和结论都眼熟，核心方法却还没有真正讲明白。",
      "工位旁的人已经收包去吃饭了，你还在论文之间来回切换，试着找出它们各自解决什么问题、整体怎么做、创新到底落在哪里。有人问明天导师来不来，群里暂时没人回复。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "几篇论文摊在桌上，各自的动机和方法都还缺一块。你可以把一篇讲透，也可以把几篇串成系列比较；前者更稳，后者更费时间，却可能让大家看出一个方向怎样变化。",
      "离明天只剩一点时间，PPT 里还留着几处空白。导师是否到场没人说准，但只贴摘要和结果，台下的提问仍然会落到那些没读懂的细节上。",
    ].join("\n\n"),
    results: {
      [`random-6-deep-${serial}`]: {
        title: "认真讲解",
        description: [
          "你把准备分享的论文从研究问题、整体思路一路读到核心方法和创新点，删掉两页自己都讲不明白的内容，又给关键图补上标注。保存时，实验楼的走廊灯已经关了一半。",
          advisorPresentForPrepared
            ? "导师来了，问的问题恰好有几处是你昨晚核对过的。你顺着记录答完，把剩下的建议记在页边，散会后才松开一直攥着的翻页笔。"
            : "导师临时没来。你照样把论文讲完，同门问到核心方法里一处图表标注时，你们凑近屏幕才发现坐标轴没写单位。昨晚检查了那么久，偏偏漏了这个。",
        ].join("\n\n"),
      },
      [`random-6-series-${serial}`]: {
        title: "系列论文",
        description: advisorPresentForSeries
          ? [
              "你把几篇论文按问题、整体思路、核心方法和创新点列成对比表。各看各的都有道理，放在一起才发现它们解决的根本不是同一个难题。",
              "导师追问其中两篇方法为什么能得到相反结论，你顺着假设和实验设定讲下去，终于把差别说清。这张表以后也用得上。",
            ].join("\n\n")
          : [
              "你熬夜把几篇论文列成对比表，连核心方法依赖的假设和实验设定里的小字也抄了上去。第二天刚接好投影，群里通知导师临时不来。",
              "本以为会很快讲完，同门却围着那张表讨论了好一会儿，还补上两篇遗漏。你困得揉眼睛，手上还是把几篇论文的创新点记了下来。",
            ].join("\n\n"),
      },
      [`random-6-slack-${serial}`]: {
        title: "简单带过",
        description: advisorPresentForSlack
          ? [
              "你挑了篇看着不难的论文，只往 PPT 里放了摘要、结论和几张原图。导师听了两页，问起核心方法为什么这样设计。",
              "你顺着图找了一圈，还是没讲清整体思路。导师让你下次先把论文读明白，你拔掉投影线回到座位，终于重新打开方法部分。",
            ].join("\n\n")
          : [
              "你挑了篇看着不难的论文，只往 PPT 里放了摘要、结论和几张原图。导师没来，主持的师兄也只问了一句有没有人要提问。",
              "大家低头翻了翻笔记，没有接话。你不到十分钟就翻到了“谢谢聆听”，核心方法和创新点仍安静地躺在论文里。",
            ].join("\n\n"),
      },
    },
  });
}
