import { applyTierResist, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange, getResearchMiscSanNarrative, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createGeneratedFellowProfileAddition, getFellowRoleLabel } from "./v2-fellow-progression";
import {
  createThreeStageRandomEvent,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorProjectRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const rejectFavorResult = applyTierResist(-2, state.player.favor, getRoll);
  const rejectFavorChange = rejectFavorResult.effectiveChange;
  const rejectFavorNarrative = getTierResistedNarrative("导师好感", -2, rejectFavorResult);
  const horizontalSanChange = getActualResearchMiscSanChange(-8, state.player.research, state.month, state.eventSupport);
  const horizontalSanSummary = formatResearchMiscSanChange(-8, state.player.research, state.month, state.eventSupport);
  const horizontalSanNarrative = getResearchMiscSanNarrative(-8, state.player.research);
  const verticalSanChange = getActualResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport);
  const verticalSanSummary = formatResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport);
  const verticalSanNarrative = getResearchMiscSanNarrative(-6, state.player.research);
  const shareSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const shareSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const shareSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const horizontalFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const horizontalFavorChange = horizontalFavorResult.effectiveChange;
  const horizontalFavorNarrative = getTierResistedNarrative("导师好感", 1, horizontalFavorResult);
  const verticalFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const verticalFavorChange = verticalFavorResult.effectiveChange;
  const verticalFavorNarrative = getTierResistedNarrative("导师好感", 1, verticalFavorResult);
  const verticalResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const verticalResearchChange = verticalResearchResult.effectiveChange;
  const verticalResearchNarrative = getTierResistedNarrative("科研", 1, verticalResearchResult);
  const familiarJunior = state.fellowProgressState.find((profile) => profile.type === "junior");
  const hasJunior = familiarJunior !== undefined;
  const familiarJuniorLabel = familiarJunior ? getFellowRoleLabel(familiarJunior.type, familiarJunior.gender) : "";
  const familiarJuniorName = familiarJunior?.name?.trim() || familiarJuniorLabel;
  const unfamiliarJunior = createGeneratedFellowProfileAddition("junior", serial + 307);
  const unfamiliarJuniorLabel = getFellowRoleLabel(unfamiliarJunior.type, unfamiliarJunior.gender);
  const shareSocialRaw = hasJunior ? -1 : -2;
  const shareSocialResult = applyTierResist(shareSocialRaw, state.player.social, getRoll);
  const shareSocialChange = shareSocialResult.effectiveChange;
  const shareSocialNarrative = getTierResistedNarrative("社交", shareSocialRaw, shareSocialResult);

  const event: PendingEvent = {
    id: `random-4-y${state.year}-m${state.month}-n${serial}`,
    title: "导师项目",
    description: "实验室来了新项目，需要所有学生一起分担。导师让大家选择加入横向、纵向项目，或找同门协作。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-4",
    stage: "act1",
    choices: [
      {
        id: `random-4-horizontal-${serial}`,
        label: "接横向项目",
        outcome: `${horizontalSanSummary}；${formatTierResistedOutcome("导师好感", 1, horizontalFavorResult)}；金币 +5`,
        effects: {
          san: horizontalSanChange,
          ...(horizontalFavorChange > 0 ? { favor: horizontalFavorChange } : {}),
          money: 5,
        },
      },
      {
        id: `random-4-vertical-${serial}`,
        label: "接纵向项目",
        outcome: `${verticalSanSummary}；${formatTierResistedOutcome("导师好感", 1, verticalFavorResult)}；${formatTierResistedOutcome("科研", 1, verticalResearchResult)}`,
        effects: {
          san: verticalSanChange,
          ...(verticalFavorChange > 0 ? { favor: verticalFavorChange } : {}),
          ...(verticalResearchChange > 0 ? { research: verticalResearchChange } : {}),
        },
      },
      {
        id: `random-4-reject-${serial}`,
        label: "申请调整",
        outcome: `${formatTierResistedOutcome("导师好感", -2, rejectFavorResult)}`,
        effects: {
          ...(rejectFavorChange < 0 ? { favor: rejectFavorChange } : {}),
        },
      },
      {
        id: `random-4-share-${serial}`,
        label: "让师弟师妹分担",
        outcome: `${hasJunior ? `有熟悉的${familiarJuniorLabel}` : "暂无熟悉的师弟或师妹"}；${shareSanSummary}；${formatTierResistedOutcome("社交", shareSocialRaw, shareSocialResult)}`,
        effects: {
          san: shareSanChange,
          social: shareSocialChange,
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "组会快结束时，导师又翻出一页项目清单。组里的设备和劳务费要靠项目经费支撑，大家得各自分担一部分工作。",
      "同门陆续报了分工。轮到你时，导师停在这一页，等你表态。你看了看手头的实验安排，一时没有开口。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "横向项目的交付时间很紧，做完能拿到一笔劳务费。",
      "纵向项目周期更长，对科研更有帮助。",
      "也可以申请调整分工，或者请师弟师妹分担一部分。",
    ].join("\n\n"),
    results: {
      [`random-4-horizontal-${serial}`]: {
        title: "横向项目",
        description: [
          "你接下横向项目的一部分工作，第一版演示下周就要用。白天改方案，晚上跑实验，还得抽空回复甲方的新需求。",
          "几轮返工后，这批任务总算交付，导师也发来了劳务费。你松了口气，把耽搁的论文任务重新排回日历。",
          ...(horizontalFavorNarrative ? [horizontalFavorNarrative] : []),
          ...(horizontalSanNarrative ? [horizontalSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-4-vertical-${serial}`]: {
        title: "纵向项目",
        description: [
          "你接下纵向项目中的一项研究任务，从立项材料和相关论文读起。问题比自己的课题更广，实验方案也改了几轮。",
          "阶段汇报时，导师认可了你对问题的梳理。虽然费了不少功夫，你也学会了怎样拆解任务、安排更有说服力的对照。",
          ...(verticalFavorNarrative ? [verticalFavorNarrative] : []),
          ...(verticalResearchNarrative ? [verticalResearchNarrative] : []),
          ...(verticalSanNarrative ? [verticalSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-4-reject-${serial}`]: {
        title: "调整分工",
        description: rejectFavorChange < 0
          ? [
              "你和导师说明，自己手头的实验已经排满，想调整到节奏更合适的项目。",
              "导师皱了下眉，还是把你调去别的项目：“下次早点把安排说清楚。”",
              "这次的分工调整了，但组里的任务并不会凭空消失。你把现有安排重新列好，准备以后早点沟通。",
              ...(rejectFavorNarrative ? [rejectFavorNarrative] : []),
            ].join("\n\n")
          : [
              "你和导师说明，自己手头的实验已经排满，想调整到节奏更合适的项目。",
              "导师看了看你的排期，同意把你调到另一项工作里：“那边的任务你也要跟住。”",
              "项目换了，但该分担的工作一点没少。你把新任务记进日历，准备重新排一下时间。",
              ...(rejectFavorNarrative ? [rejectFavorNarrative] : []),
            ].join("\n\n"),
      },
      [`random-4-share-${serial}`]: {
        title: "分工协作",
        description: hasJunior
          ? shareSocialChange < 0
            ? [
                `你找到了${familiarJuniorName}，请对方分担一部分工作。`,
                "对方没有推辞，只是接下任务时提醒你，下次早点说，自己也有排期。",
                "项目赶完了，这份人情也欠下了。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n")
            : [
                `你找到${familiarJuniorName}，商量着一起做这个项目。`,
                "“没问题，我来帮你分担一部分。”对方爽快地答应了。",
                "有了帮手，项目进展顺利多了，比一个人扛着轻松不少。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n")
          : shareSocialChange < 0
            ? [
                `组里暂时没有熟悉的师弟师妹，你只好找一位不太熟的${unfamiliarJuniorLabel}分担一部分工作。`,
                "对方表面上答应了，之后却在组里抱怨你把麻烦推了过去。",
                "项目照常推进，实验室里的气氛却有点微妙。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n")
            : [
                `你找了一位不太熟的${unfamiliarJuniorLabel}帮忙，对方犹豫后接下了任务。`,
                "各自的任务按时完成，这次没有再传来别的议论。",
                "你松了口气，也提醒自己下次最好提前把分工说清楚。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n"),
      },
    },
  });
}

