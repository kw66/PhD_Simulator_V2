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
  const preparedSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const preparedSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const preparedSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const seriesSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const seriesSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
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
    description: "群里发来明天的组会顺序，你的名字排在第一个。PPT 已经有了封面和“谢谢聆听”，中间还空着。",
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
      "群里发来明天的组会顺序，你的名字排在第一个。打开 PPT，封面和“谢谢聆听”都在，中间还没几页能讲的。",
      "工位旁的人已经收包去吃饭了，你还在翻记录和待读论文。有人问明天导师来不来，群里暂时没人回复。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "认真整理手头的进展，至少被问到时知道该翻哪页记录；把几篇论文串起来讲，也许能弄懂它们到底差在哪儿，只是今晚要读的恐怕不止正文。",
      "你看了眼时间。凑几页图当然快，可明天导师要是指着其中一张问“这是什么意思”，总不能现场一起读。",
    ].join("\n\n"),
    results: {
      [`random-6-deep-${serial}`]: {
        title: "深入汇报",
        description: [
          "你把材料从头过了一遍，删掉两页自己都讲不明白的内容，又给关键图补上标注。保存时，旁边的饭盒已经凉透了。",
          advisorPresentForPrepared
            ? "导师来了，问的问题恰好有几处是你昨晚核对过的。你顺着记录答完，把剩下的建议记在页边，散会后才松开一直攥着的翻页笔。"
            : "导师临时没来。你照样讲完，同门问到一处标注时，你们凑近屏幕才发现坐标轴没写单位。昨晚检查了那么久，偏偏漏了这个。",
          ...(advisorPresentForPrepared && preparedFavorNarrative ? [preparedFavorNarrative] : []),
          ...(preparedSanNarrative ? [preparedSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-6-series-${serial}`]: {
        title: "系列汇报",
        description: advisorPresentForSeries
          ? [
              "你把几篇论文列成一张对比表，补充材料也翻到了最后。原本各看各的都挺有道理，放在一起才发现实验条件不一样。",
              "导师果然指着两项相反的结论追问。你翻出昨晚核对的设置，总算答了上来；散会时又把那张表存好，以后读这个方向不用重找一遍。",
              ...(researchNarrative ? [researchNarrative] : []),
              ...(seriesFavorNarrative ? [seriesFavorNarrative] : []),
              ...(seriesSanNarrative ? [seriesSanNarrative] : []),
            ].join("\n\n")
          : [
              "你熬夜把几篇论文列成对比表，连实验设置里的小字也抄了上去。第二天刚接好投影，群里通知导师临时不来。",
              "本以为会很快讲完，同门却围着那张表讨论了好一会儿，还补上两篇遗漏。你困得揉眼睛，手上还是把题目记了下来。",
              ...(researchNarrative ? [researchNarrative] : []),
              ...(seriesSanNarrative ? [seriesSanNarrative] : []),
            ].join("\n\n"),
      },
      [`random-6-slack-${serial}`]: {
        title: "摸鱼划水",
        description: advisorPresentForSlack
          ? [
              "你挑了篇看着不难的论文，往 PPT 里放了摘要和几张原图。导师听了两页，问起图里那条虚线代表什么。",
              "你放大图片找了一圈，还是没说清楚。导师让你下次先读完论文，你拔掉投影线回到座位，终于开始认真看那张图。",
              ...(slackFavorNarrative ? [slackFavorNarrative] : []),
            ].join("\n\n")
          : [
              "你挑了篇看着不难的论文，往 PPT 里放了摘要和几张原图。导师没来，主持的师兄也只问了一句有没有人要提问。",
              "大家低头翻了翻笔记，没有接话。你不到十分钟就翻到了“谢谢聆听”，拔投影线的动作格外利索。",
            ].join("\n\n"),
      },
    },
  });
}

