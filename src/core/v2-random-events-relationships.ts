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
      `同级同门${peerName}来找你，想把一个新想法一起做成论文。`,
      "方向看起来有潜力，不过谁做实验、谁写论文、最后怎么署名，都得提前说清楚。",
      "平时聊得来，真一起做事却是另一回事。你得先想好，这次愿意投入多少。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "可以只交流思路，也可以互补实验、共同署名；若想全面合作，就得把后续安排一起商量好。",
      "如果手头已经够忙，婉拒也很正常。",
    ].join("\n\n"),
    results: {
      [`random-10-exchange-${serial}`]: {
        title: "交换合作",
        description: isLowSocial
          ? [
              "你们找了间空会议室，把各自正在做的问题摊开来聊。",
              `${peerName}追问了不少细节，你却不太擅长把想法说清楚，几处误会来回解释了很久。`,
              "聊得有些累，好在白板上还是留下了几条新思路。你拍照记下，准备回去试试。",
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
              "你们互相补做实验，投稿前确认了各自贡献和署名。这次由对方主导，你负责其中一部分。",
              `${peerName}的论文传来录用消息，作者列表里也有你的名字。虽不是一作，从修改稿到录用通知，你也跟着高兴了一回。`,
            ].join("\n\n")
          : [
              "你们商量了互补实验和共同署名的方案，但真正排时间时，才发现彼此都抽不出手。",
              `${peerName}也没能继续推进。这次合作暂时搁下，还没有形成可以计入成果的论文。`,
            ].join("\n\n"),
      },
      [`random-10-reject-${serial}`]: {
        title: "拒绝合作",
        description: [
          "你把自己的排期给对方看了看，说明这几个月确实接不下新项目。",
          `${peerName}表示理解，只说以后有合适的题目再聊。`,
          rejectSuccess
            ? "你们又聊了几句近况，各自回去忙手头的事。合作没谈成，也没有因此变得尴尬。"
            : "腾出时间后，你重新梳理自己的选题和草稿，补上了几处卡住的思路。下次动手时，可以直接从这里继续。",
        ].join("\n\n"),
      },
      [`random-10-full-${serial}`]: {
        title: isLowSocial ? "合作受阻" : canAddPeer ? "新增同门" : "继续合作",
        description: isLowSocial
          ? [
              "你们很快开了共享文档，却一直没有把分工和更新时间说清楚。",
              "同一组实验被重复跑了两遍，真正缺的数据反而没人补，临近节点时只能一起返工。",
              "这轮合作磕磕绊绊，好在两人分担后，还是多整理了一些思路和草稿。接下来你想先把自己的部分做好。",
              ...(fullSanNarrative ? [fullSanNarrative] : []),
            ].join("\n\n")
          : [
              "正式开工前，你们先把实验、写作和每周节点写进共享文档。",
              `你负责 idea 和写作，${peerName}负责实验和数据，遇到问题就在固定时间一起处理。`,
              canAddPeer
                ? "第一轮讨论就理清了不少思路，草稿也分好了工。你们约定定期碰面，把合作继续做下去。"
                : "这次讨论和分工都很顺利，思路与草稿也有了着落。不过手头的长期合作已经排满，你们暂时只完成这次任务。",
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
          "任务结束时，你已经记下几种可以用在自己课题上的做法，准备下次构思方案时试一试。",
        ].join("\n\n"),
      },
      [`random-11-deep-${serial}`]: {
        title: "深合作",
        description: [
          `你和${roleText}说，自己愿意从头跟完这个项目。`,
          `${roleText}把完整排期发给你：“那就一起做，过程可能会比较累。”`,
          "你跟着梳理选题、实验和写作，补上了自己不熟悉的环节。再面对类似问题时，心里多了些章法。",
          ...(deepResearchNarrative ? [deepResearchNarrative] : []),
          ...(deepSanNarrative ? [deepSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-11-mentor-${serial}`]: {
        title: "拜入门下",
        description: [
          `你拿着草稿请${roleText}仔细指点。对方从论证顺序到图表说明逐处标注，密密麻麻写了一整页。`,
          "你照着批注改了几轮，才发现自己总在同样的地方说不清楚。改稿很累，这些写作习惯却终于有了纠正的机会。",
          canAddSenior
            ? `${roleText}答应以后继续帮你看稿：“不过你得先自己认真改过，再拿来一起讨论。”`
            : "你记下这次的建议，先不再约固定讨论。已有的合作已经占满时间，之后要靠自己继续练习。",
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

