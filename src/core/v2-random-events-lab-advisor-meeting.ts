import type { RandomRollProvider } from "./v2-random-events-lab-shared";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorMeetingRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const advisorPresentForSeries = getRoll() < 0.5;
  const advisorPresentForSlack = getRoll() < 0.5;
  const seriesSanChange = getActualSanChange(-3, state.month, state.eventSupport);

  const event: PendingEvent = {
    id: `random-6-y${state.year}-m${state.month}-n${serial}`,
    title: "组会汇报",
    description: "这周组会轮到你汇报，PPT 还空着一半，实验也没跑出理想结果。离开会只剩一点时间，你得决定怎么准备。",
    preview: "轮到你汇报了",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-6",
    stage: "act1",
    choices: [
      {
        id: `random-6-deep-${serial}`,
        label: "讲深奥论文",
        outcome: isHighResearch ? "导师好感 +1。" : "导师好感 -1。",
        effects: { favor: isHighResearch ? 1 : -1 },
      },
      {
        id: `random-6-series-${serial}`,
        label: "讲系列论文",
        outcome: advisorPresentForSeries ? `SAN ${seriesSanChange}，导师好感 +2。` : `SAN ${seriesSanChange}。`,
        effects: advisorPresentForSeries ? { san: seriesSanChange, favor: 2 } : { san: seriesSanChange },
      },
      {
        id: `random-6-slack-${serial}`,
        label: "随便水一下",
        outcome: advisorPresentForSlack ? "导师好感 -1。" : "无事发生。",
        effects: advisorPresentForSlack ? { favor: -1 } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "周组会开始了，今天轮到你汇报。",
      "导师和同门都在场，你的准备程度会被直接看见。",
      "投影仪亮起时，你能感觉到会场在等一个“清楚、可信、可继续推进”的答案。",
      "这次不仅是一次展示，也会影响你在组里的口碑和后续协作话语权。讲得好，别人愿意跟；讲不好，后续每一步都要多解释。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“讲深奥论文是高波动打法，答得住就加分，答不住就当场露怯。”",
      "“讲系列论文最稳，前提是你愿意提前透支几个晚上的睡眠。”",
      "“临时水过去当然省力，但组会口碑这种东西，扣一次很久才补得回。”你要决定今天是搏上限、求稳态，还是冒着信誉折损换即时轻松。",
    ].join("\n\n"),
    results: {
      [`random-6-deep-${serial}`]: {
        title: "深入汇报",
        description: isHighResearch
          ? [
              "你选了一篇领域内的经典论文，认真准备了PPT。",
              "汇报时，你条理清晰地讲解了论文的核心思想和方法，还提出了自己的见解。",
              "导师听完频频点头：“不错，理解得很透彻，有自己的思考。”",
              "你松了一口气，这次组会表现不错。",
            ].join("\n\n")
          : [
              "你硬着头皮选了一篇看起来很厉害的论文。",
              "汇报时，导师问了几个问题，你支支吾吾答不上来。",
              "“这篇论文的核心贡献是什么？”导师追问。",
              "你愣住了，只能尴尬地说“我再回去看看”。导师叹了口气，明显有些失望。",
            ].join("\n\n"),
      },
      [`random-6-series-${serial}`]: {
        title: "系列汇报",
        description: advisorPresentForSeries
          ? [
              "你花了好几个晚上，整理了一个系列论文的综述。",
              "组会上，你从问题背景讲到最新进展，内容详实，逻辑清晰。",
              "导师全程认真听完，最后带头鼓掌：“准备得很充分，这才是做学术应有的态度！”",
              "虽然累，但看到导师满意的表情，你觉得值了。",
            ].join("\n\n")
          : [
              "你花了好几个晚上，整理了一个系列论文的综述。",
              "结果组会开始前，导师临时有事没来。",
              "你对着一群师弟师妹讲完了精心准备的内容，虽然大家都说讲得好，但总觉得白忙活了。",
              "“早知道导师不来，我就不这么拼了……”你心想。",
            ].join("\n\n"),
      },
      [`random-6-slack-${serial}`]: {
        title: "摸鱼划水",
        description: advisorPresentForSlack
          ? [
              "你随便找了篇简单的论文，PPT也是临时赶出来的。",
              "汇报时，你照着PPT念，内容空洞，毫无亮点。",
              "导师皱着眉头听完，冷冷地说：“就这？下次认真准备。”",
              "你尴尬地回到座位，感觉导师对你的印象又差了一分。",
            ].join("\n\n")
          : [
              "你随便找了篇简单的论文，PPT也是临时赶出来的。",
              "结果运气不错，导师今天有事没来！",
              "你三言两语讲完，师兄主持的组会很快就结束了。",
              "“运气真好。”你暗自庆幸。",
            ].join("\n\n"),
      },
    },
  });
}
