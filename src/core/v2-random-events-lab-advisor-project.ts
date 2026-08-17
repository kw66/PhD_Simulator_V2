import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import { wouldUnlockLearnToSayNo, type RandomRollProvider } from "./v2-random-events-lab-shared";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorProjectRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const rejectFavorChange = applyTierResist(-2, state.player.favor, getRoll).effectiveChange;
  const shareSocialChange = applyTierResist(-1, state.player.social, getRoll).effectiveChange;
  const horizontalSanChange = getActualSanChange(-7, state.month, state.eventSupport);
  const verticalSanChange = getActualSanChange(-5, state.month, state.eventSupport);
  const shareSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const unlockProjectKing = state.eventCounters.projectCompletedCount + 1 >= 3;

  const event: PendingEvent = {
    id: `random-4-y${state.year}-m${state.month}-n${serial}`,
    title: "导师项目",
    description: "导师把一个新项目交给你主导，做成了能换来不少资源。可项目节点很紧，也一定会占掉原本留给论文的时间。",
    preview: "导师有项目要交给你",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-4",
    stage: "act1",
    choices: [
      {
        id: `random-4-horizontal-${serial}`,
        label: "接横向项目",
        outcome: `SAN ${horizontalSanChange}，导师好感 +1，金钱 +5。`,
        effects: {
          san: horizontalSanChange,
          favor: 1,
          money: 5,
          counterDeltas: { projectCompletedCount: 1 },
          achievementFlags: unlockProjectKing ? ["projectKing"] : [],
        },
      },
      {
        id: `random-4-vertical-${serial}`,
        label: "接纵向项目",
        outcome: `SAN ${verticalSanChange}，导师好感 +1，科研 +1。`,
        effects: {
          san: verticalSanChange,
          favor: 1,
          research: 1,
          counterDeltas: { projectCompletedCount: 1 },
          achievementFlags: unlockProjectKing ? ["projectKing"] : [],
        },
      },
      {
        id: `random-4-reject-${serial}`,
        label: "婉言拒绝",
        outcome: rejectFavorChange < 0 ? `导师好感 ${rejectFavorChange}。` : "导师表示理解。",
        effects: {
          ...(rejectFavorChange < 0 ? { favor: rejectFavorChange } : {}),
          counterDeltas: { rejectedProjectCount: 1 },
          achievementFlags: wouldUnlockLearnToSayNo(state, "project") ? ["learnToSayNo"] : [],
        },
      },
      {
        id: `random-4-share-${serial}`,
        label: "让师弟分担",
        outcome: shareSocialChange < 0 ? `SAN ${shareSanChange}，社交 ${shareSocialChange}。` : `SAN ${shareSanChange}。`,
        effects: {
          san: shareSanChange,
          ...(shareSocialChange < 0 ? { social: shareSocialChange } : {}),
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师把一个项目交给你主导，资源给得很足。",
      "你很快看出：横向更偏交付与回款，纵向更偏学术积累。",
      "会议结束后，你手里同时捏着需求表、里程碑和预算表，压力一下变得很具体。",
      "这次选择不仅影响接下来几个月的节奏，也在定义你在组里的职业标签。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“横向像冲刺赛，现金回得快，但代价是持续高压赶工。”",
      "“纵向更像耐力赛，短期不耀眼，却能把方法论真正沉下来。”",
      "“直接拒绝是把边界说清，但也会把关系风险推到台前。”",
      "“找同门分担能降负荷，不过协作质量取决于你平时的人情基础。”你要选的是收益结构，而不是看起来最顺手的按钮。",
    ].join("\n\n"),
    results: {
      [`random-4-horizontal-${serial}`]: {
        title: "横向项目",
        description: [
          "你接下了这个横向项目，开始了没日没夜的赶工。",
          "写方案、做实验、改报告、对接甲方……每一个环节都让你身心俱疲。",
          "好在最后顺利结项，甲方很满意，导师也给你发了一笔可观的劳务费。",
          "“钱是赚到了，但人也快废了……”你看着银行卡余额苦笑。",
        ].join("\n\n"),
      },
      [`random-4-vertical-${serial}`]: {
        title: "纵向项目",
        description: [
          "你选择了纵向项目，开始深入研究课题。",
          "虽然过程艰辛，但每一步都在积累学术经验。文献调研、实验设计、数据分析……",
          "项目结题时，你发现自己的科研能力确实提升了不少。",
          "导师看了你的结题报告，满意地点点头：“不错，有进步。”",
        ].join("\n\n"),
      },
      [`random-4-reject-${serial}`]: {
        title: "拒绝项目",
        description: rejectFavorChange < 0
          ? [
              "你硬着头皮说最近论文压力大，想专心做研究。",
              "导师皱起眉头：“项目都不愿意做，以后怎么独当一面？”",
              "你被说得哑口无言，只能低头认错。导师明显对你不太满意。",
            ].join("\n\n")
          : [
              "你说明了自己正在攻克一个重要的科研难题，希望能集中精力。",
              "导师看了看你最近的成果，点点头：“你的科研做得不错，确实应该以学术为重。这个项目我找别人做。”",
              "你松了一口气，导师果然还是看重科研能力的。",
            ].join("\n\n"),
      },
      [`random-4-share-${serial}`]: {
        title: "分工协作",
        description: shareSocialChange < 0
          ? [
              "你找到师弟，希望他能帮忙分担一部分工作。",
              "师弟表面上答应了，但做事敷衍，最后你还是得自己返工。",
              "更糟的是，你听说他在背后抱怨你“甩锅”，实验室里的气氛都变得微妙起来。",
            ].join("\n\n")
          : [
              "你找到关系还不错的师弟，商量着一起做这个项目。",
              "“没问题师兄，我来帮你分担一部分。”师弟爽快地答应了。",
              "有了帮手，项目进展顺利多了，虽然还是有点累，但比一个人扛轻松不少。",
            ].join("\n\n"),
      },
    },
  });
}
