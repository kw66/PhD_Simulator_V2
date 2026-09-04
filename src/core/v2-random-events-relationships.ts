import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
  getActualSanChange,
  getResearchMiscSanNarrative,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createGeneratedFellowProfileAddition, getFellowPronoun, getFellowRoleLabel } from "./v2-fellow-progression";
import {
  createThreeStageRandomEvent,
  drawInclusiveInt,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createRandomEvent10(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const peerGender = getRoll() < 0.5 ? "male" : "female";
  const peerAddition = createGeneratedFellowProfileAddition("peer", serial, peerGender);
  const peerName = peerAddition.name ?? "同门";
  const peerPronoun = getFellowPronoun(peerGender);
  const isLowSocial = state.player.social < 6;
  const canAddPeer = state.relationshipState.occupiedSlots < state.relationshipState.unlockedSlots;
  const exchangeSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const fullSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const fullSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const fullSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const mutualSuccess = getRoll() < 0.5;
  const targetRoll = getRoll();
  const mutualTarget = targetRoll < 0.2 ? "A" : targetRoll < 0.5 ? "B" : "C";
  const ideaBonus = drawInclusiveInt(4, 6, getRoll);
  const rejectSuccess = getRoll() < 0.5;
  const rejectIdeaBonus = drawInclusiveInt(3, 5, getRoll);
  const rejectWritingBonus = drawInclusiveInt(3, 5, getRoll);

  const event: PendingEvent = {
    id: `random-10-y${state.year}-m${state.month}-n${serial}`,
    title: "\u540c\u95e8\u5408\u4f5c",
    description: "同门拿着一个还不错的想法来找你，希望合作写篇论文。多个人能分担工作，也可能在分工和署名上添些麻烦。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-10",
    stage: "act1",
    choices: [
      {
        id: `random-10-exchange-${serial}`,
        label: "\u5b66\u672f\u4ea4\u6d41",
        outcome: isLowSocial
          ? `社交 < 6｜SAN ${exchangeSanChange}｜下次想 idea +${ideaBonus}。`
          : `社交 ≥ 6｜下次想 idea +${ideaBonus}。`,
        effects: {
          ...(isLowSocial ? { san: exchangeSanChange } : {}),
          temporaryActionEffectUpdates: { idea: { bonus: ideaBonus } },
        },
      },
      {
        id: `random-10-mutual-${serial}`,
        label: "\u4e92\u6302\u8bba\u6587",
        outcome: mutualSuccess
          ? `${formatProbabilityCondition("互挂成功", 0.5)}｜生成一篇非一作 ${mutualTarget} 类论文，仅计引用。`
          : `${formatProbabilityCondition("互挂未成", 0.5)}｜无事发生。`,
        effects: mutualSuccess
          ? { grantedPublication: { target: mutualTarget, acceptedScore: mutualTarget === "A" ? 4 : mutualTarget === "B" ? 2 : 1, nonFirstAuthor: true } }
          : {},
      },
      {
        id: `random-10-reject-${serial}`,
        label: "\u5a49\u62d2\u5408\u4f5c",
        outcome: rejectSuccess
          ? `${formatProbabilityCondition("没有后续波澜", 0.5)}｜无事发生。`
          : `${formatProbabilityCondition("转而专注自身研究", 0.5)}｜下次想 idea +${rejectIdeaBonus}｜下次写作 +${rejectWritingBonus}。`,
        effects: rejectSuccess
          ? {}
          : { temporaryActionEffectUpdates: { idea: { bonus: rejectIdeaBonus }, writing: { bonus: rejectWritingBonus } } },
      },
      {
        id: `random-10-full-${serial}`,
        label: "\u5168\u9762\u5408\u4f5c",
        outcome: isLowSocial
          ? `社交 < 6｜${fullSanSummary}｜下次想 idea 额外 1 次｜下次写作额外 1 次。`
          : `社交 ≥ 6｜${fullSanSummary}${canAddPeer ? "｜新增同门" : "｜关系栏已满，暂不新增同门"}｜下次想 idea 额外 1 次｜下次写作额外 1 次。`,
        effects: {
          san: fullSanChange,
          ...(!isLowSocial && canAddPeer ? { fellowAdditions: [peerAddition] } : {}),
          temporaryActionEffectUpdates: {
            idea: { extraActions: 1 },
            writing: { extraActions: 1 },
          },
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "同级同门来找你合作一个想法。",
      "方向看起来有潜力，不过谁做实验、谁写论文、最后怎么署名，都得提前说清楚。",
      "你们平时关系不错，真一起做项目后未必还这么顺。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "只交流想法最省时间，但说出去的内容未必收得回来。",
      "互挂论文或全面合作收益更大，也更依赖彼此靠谱。",
      "如果手头已经够忙，婉拒也很正常。",
    ].join("\n\n"),
    results: {
      [`random-10-exchange-${serial}`]: {
        title: "交换合作",
        description: isLowSocial
          ? [
              "你们找了间空会议室，把各自正在做的问题摊开来聊。",
              `${peerName}对你刚说的实验设想追问了很久，还拍下了白板上的关键步骤。`,
              `过了一阵，你发现${peerPronoun}的新稿里出现了几乎相同的思路，署名和致谢里却都没有你。`,
              "你把聊天记录翻出来看了几遍，决定以后再聊未完成的想法时得留个心眼。",
            ].join("\n\n")
          : [
              "你们找了间空会议室，把各自正在做的问题摊开来聊。",
              `${peerName}帮你指出一个被忽略的对照，你也替${peerPronoun}补上了实验设计里的漏洞。`,
              "聊到最后，白板上已经多了好几条可以直接验证的新思路。你拍了张照片，准备回去逐个试。",
            ].join("\n\n"),
      },
      [`random-10-mutual-${serial}`]: {
        title: "互补合作",
        description: mutualSuccess
          ? [
              "你们各自补了一部分实验，并约好论文录用后互相挂名。",
              `没过多久，${peerName}的论文中了。${peerPronoun}把最终版本发给你确认，作者列表里也有你的名字。`,
              "这篇论文不是你主导的成果，不计科研分，但后续引用仍会记入你的统计。",
            ].join("\n\n")
          : [
              "你们各自补了一部分实验，并约好论文录用后互相挂名。",
              `结果等了好久，${peerName}的论文一直没中。不是被拒就是大修，来来回回折腾了好几轮。`,
              `论文迟迟没有结果，你们只能先把这次合作放下。`,
            ].join("\n\n"),
      },
      [`random-10-reject-${serial}`]: {
        title: "拒绝合作",
        description: [
          "你把自己的排期给对方看了看，说明这几个月确实接不下新项目。",
          `${peerName}表示理解，只说以后有合适的题目再聊。`,
          "你们照常交换了几句近况，合作没有谈成，关系也没有因此变僵。",
        ].join("\n\n"),
      },
      [`random-10-full-${serial}`]: {
        title: isLowSocial ? "合作受阻" : canAddPeer ? "新增同门" : "继续合作",
        description: isLowSocial
          ? [
              "你们很快开了共享文档，却一直没有把分工和更新时间说清楚。",
              "同一组实验被重复跑了两遍，真正缺的数据反而没人补，临近节点时只能一起返工。",
              "项目最后勉强交付。你们都没再提下一次合作，至少先把这段忙乱缓过去。",
              ...(fullSanNarrative ? [fullSanNarrative] : []),
            ].join("\n\n")
          : [
              "正式开工前，你们先把实验、写作和每周节点写进共享文档。",
              `你负责 idea 和写作，${peerName}负责实验和数据，遇到问题就在固定时间一起处理。`,
              "第一轮结果出来时，进度和预想差不多。你们顺手约好了下一次讨论。",
              ...(fullSanNarrative ? [fullSanNarrative] : []),
            ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent11(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const seniorGender = getRoll() < 0.5 ? "male" : "female";
  const roleText = getFellowRoleLabel("senior", seniorGender);
  const seniorAddition = createGeneratedFellowProfileAddition("senior", serial, seniorGender);
  const eventTitle = roleText === "\u5e08\u59d0" ? "\u5e08\u59d0\u6307\u5bfc" : "\u5e08\u5144\u6307\u5bfc";
  const lightIdeaBonus = drawInclusiveInt(6, 10, getRoll);
  const deepSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const deepSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport);
  const deepSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const mentorSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport);
  const mentorSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport);
  const mentorSanNarrative = getResearchMiscSanNarrative(-4, state.player.research);
  const deepResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const deepResearchChange = deepResearchResult.effectiveChange;
  const deepResearchNarrative = getTierResistedNarrative("科研", 1, deepResearchResult);
  const canAddSenior = state.relationshipState.occupiedSlots < state.relationshipState.unlockedSlots;

  const event: PendingEvent = {
    id: `random-11-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `${roleText}邀请你一起做个项目，方向和你的研究正好有些交集。机会不错，但你手头的时间也不宽裕，得先谈好怎么合作。`,
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-11",
    stage: "act1",
    choices: [
      {
        id: `random-11-watch-${serial}`,
        label: "\u5148\u89c2\u671b",
        outcome: "SAN +3。",
        effects: { san: 3 },
      },
      {
        id: `random-11-light-${serial}`,
        label: "\u6d45\u6d45\u5408\u4f5c",
        outcome: `\u4e0b\u6b21\u60f3 idea +${lightIdeaBonus}\u3002`,
        effects: {
          temporaryActionEffectUpdates: {
            idea: { bonus: lightIdeaBonus },
          },
        },
      },
      {
        id: `random-11-deep-${serial}`,
        label: "\u6df1\u5165\u5408\u4f5c",
        outcome: `${deepSanSummary}；${formatTierResistedOutcome("科研", 1, deepResearchResult)}${canAddSenior ? `；新增${roleText}` : "；关系栏已满，暂不新增"}`,
        effects: {
          ...(deepResearchChange > 0 ? { research: deepResearchChange } : {}),
          san: deepSanChange,
          ...(canAddSenior ? { fellowAdditions: [seniorAddition] } : {}),
        },
      },
      {
        id: `random-11-mentor-${serial}`,
        label: "\u62dc\u5165\u95e8\u4e0b",
        outcome: `${mentorSanSummary}；永久写作 +4${canAddSenior ? `；新增${roleText}` : "；关系栏已满，暂不新增"}。`,
        effects: {
          writingBonus: 4,
          san: mentorSanChange,
          ...(canAddSenior ? { fellowAdditions: [seniorAddition] } : {}),
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      `临近毕业的${roleText}邀你一起做项目。`,
      `${roleText}做事很快，跟着做能学到不少，任务量也不会小。`,
      "你可以先帮一点，也可以完整跟完这个项目。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "先观望最省事，对方可能很快就会找别人。",
      "浅合作只负责一部分，深合作则要从头跟到尾。",
      `如果想长期跟着${roleText}学，也可以直接开口。`,
    ].join("\n\n"),
    results: {
      [`random-11-watch-${serial}`]: {
        title: "先观望",
        description: [
          "你没有马上答应，只说想先看看自己的排期。",
          `${roleText}点点头：“行，我这边也得尽快开工。”`,
          `几天后，${roleText}已经和另一位同门开始讨论项目。你空出这段时间，好好休息了几晚。`,
        ].join("\n\n"),
      },
      [`random-11-light-${serial}`]: {
        title: "浅合作",
        description: [
          "你答应先负责其中一组实验，不把整条项目线都接下来。",
          `${roleText}把之前踩过的坑和关键论文整理给你，还帮你改了两次实验设置。`,
          "任务结束时，你手里已经多了一套可以迁回自己课题的思路。",
        ].join("\n\n"),
      },
      [`random-11-deep-${serial}`]: {
        title: "深合作",
        description: [
          `你和${roleText}说，自己愿意从头跟完这个项目。`,
          `${roleText}把完整排期发给你：“那就一起做，过程可能会比较累。”`,
          "从选题、实验到写作，你第一次完整跟完了整条流程。下一次再拆类似问题时，心里已经有了章法。",
          ...(deepResearchNarrative ? [deepResearchNarrative] : []),
          ...(deepSanNarrative ? [deepSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-11-mentor-${serial}`]: {
        title: "拜入门下",
        description: [
          `你问${roleText}，以后能不能定期帮你看论文。`,
          `${roleText}笑着答应：“可以，但你得自己先改到改不动了再来找我。”`,
          "此后每次交稿，你都会先收到一页密密麻麻的批注。改得辛苦，写作习惯也一点点被纠正过来。",
          ...(mentorSanNarrative ? [mentorSanNarrative] : []),
        ].join("\n\n"),
      },
    },
  });
}

export function createRelationshipRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  if (eventId === 10) {
    return createRandomEvent10(state, getRoll);
  }
  if (eventId === 11) {
    return createRandomEvent11(state, getRoll);
  }
  return null;
}

