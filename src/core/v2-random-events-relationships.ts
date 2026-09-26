import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
  formatActualSanChange,
  getActualSanChange,
  getResearchMiscSanNarrative,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { canAddRelationship } from "./v2-relationship-rules";
import { createGeneratedFellowProfileAddition, getFellowName, getFellowPronoun, getFellowRoleLabel } from "./v2-fellow-progression";
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
  const usedNames = state.fellowProgressState.map((profile) => getFellowName(profile));
  const isLowSocial = state.player.social < 6;
  const canAddPeer = canAddRelationship(state.relationshipState, "peer");
  const exchangeSanChange = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  const fullSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const fullSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const fullSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const mutualSuccess = getRoll() < 0.5;
  const targetRoll = getRoll();
  const mutualTarget = targetRoll < 0.2 ? "A" : targetRoll < 0.5 ? "B" : "C";
  const ideaBonus = drawInclusiveInt(4, 6, getRoll);
  const rejectSuccess = getRoll() < 0.5;
  const rejectIdeaBonus = drawInclusiveInt(3, 5, getRoll);
  const rejectWritingBonus = drawInclusiveInt(3, 5, getRoll);
  const peerAddition = createGeneratedFellowProfileAddition("peer", serial, peerGender, usedNames, getRoll);
  const peerName = peerAddition.name ?? "同门";
  const peerPronoun = getFellowPronoun(peerGender);

  const event: PendingEvent = {
    id: `random-10-y${state.year}-m${state.month}-n${serial}`,
    title: "\u540c\u95e8\u5408\u4f5c",
    description: "同门拿着一页画满箭头的草图来找你，说有个方向想一起试试。你挪开桌上的水杯，给这份还没讲清楚的期待腾了个位置。",
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
          ? `社交 < 6｜${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}｜下次想 idea +${ideaBonus}。`
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
      `同级同门${peerName}在实验室门口叫住你，递来一页画满箭头的草图。纸角有点卷，最中间的那个问题倒是圈得很用力。`,
      `“我觉得这个方向可以试试，你要不要一起做？”${peerName}指着其中一条线讲起来。你们站着说了几句，索性找间空教室，借块白板慢慢画。`,
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      ...(!isLowSocial && !canAddPeer ? ["普通关系栏已满，全面合作仍可获得本次合作收益，但不会新增同门；你可以现在选择退出。"] : []),
      "白板上很快列出实验、写作和投稿，旁边的负责人却还空着。刚才聊得起劲，你连新点子都记了两条；现在真要往后面填名字，笔尖反倒停住了。",
      "你翻开自己的日程，往旁边让了让，方便对方一起看。这个方向确实让你心动，手头没做完的实验也还在排队。趁两个人都在，得把愿意接下多少、署名怎么安排说清楚。",
    ].join("\n\n"),
    results: {
      [`random-10-exchange-${serial}`]: {
        title: "交换合作",
        description: isLowSocial
          ? [
              `你们决定先聊思路。${peerName}问起草图里的一处细节，你脑中明明有个大概，话说出口却又得从头补充。`,
              "几个箭头擦了又画，总算对上了意思。散场时你有些疲惫，还是认真拍下白板：下次想方案，至少不用再对着空白页发呆。",
            ].join("\n\n")
          : [
              `你们决定先聊思路。${peerName}提醒你别漏掉一组对照，你也替${peerPronoun}补上了实验设计里没交代清楚的一步。`,
              "聊到白板快写不下，你才发现原本绕不出来的问题，换个人接着问几句就有了新方向。临走拍好照片，下次构思方案时正好拿出来用。",
            ].join("\n\n"),
      },
      [`random-10-mutual-${serial}`]: {
        title: "互补合作",
        description: mutualSuccess
          ? [
              "你们谈好各自承担的部分和署名顺序，由对方主导这篇论文。你接下补充实验，把设置和结果一起整理过去，省得临交稿还要翻聊天记录。",
              `${peerName}发来录用消息时，你把作者列表看了两遍。不是一作，名字却实实在在印在上面；那几张反复核对的表格，总算有了去处。`,
            ].join("\n\n")
          : [
              "你们把各自能补的实验和署名谈了一遍，打开日历才发现，能一起开工的时间怎么也对不上。口头上的分工很齐，排期里却没有位置。",
              `${peerName}最后说，那就先放一放。你把讨论记录留在文件夹里，这次没做出论文，也没有别的后续。`,
            ].join("\n\n"),
      },
      [`random-10-reject-${serial}`]: {
        title: "拒绝合作",
        description: [
          `你看了看日程，还是把这次邀请婉拒了。${peerName}点点头，把白板上的草图拍下来：“没事，以后有合适的再聊。”`,
          rejectSuccess
            ? "你们一起走出教室，话题已经换成了食堂今天开哪个窗口。合作没谈成，倒也没有你担心的那么尴尬。"
            : "回到座位，你顺手记下刚才想到的问题，又试着列了个论证提纲。合作虽然没接，下次想选题和动笔时，倒有了可以接着往下理的线头。",
        ].join("\n\n"),
      },
      [`random-10-full-${serial}`]: {
        title: isLowSocial ? "合作受阻" : canAddPeer ? "新增同门" : "继续合作",
        description: isLowSocial
          ? [
              "共享文档很快建好，分工却只写了个大概。等你们各自忙完一轮，才发现两个人都以为那组对照是对方在做。",
              "你们对着记录重新分了工，把选题拆成两条备选，也把写作提纲先列在文档里。这回先做到这里，下次继续时不用再从白板上的第一个箭头开始。",
              ...(fullSanNarrative ? [fullSanNarrative] : []),
            ].join("\n\n")
          : [
              `你和${peerName}把分工逐项写进共享文档，连什么时候碰头都定了下来。页面不算好看，至少每项任务后面都有个明确的人名。`,
              "共享文档里留下了选题提纲、实验分工和两条备选方案。下次再打开它，你至少知道该从哪一页接着做。",
              canAddPeer
                ? "临走前，你们约好下次继续。以后遇到问题，总算有个知道前情、可以直接接着聊的同门。"
                : "你们收好这次的讨论记录，没再约固定合作。眼下要顾的同伴已经够多，再添一位，怕是连碰头的时间都凑不齐。",
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
  const usedNames = [
    ...state.fellowProgressState.map((profile) => getFellowName(profile)),
    state.selectedAdvisorName ?? "",
    state.loverState.name ?? "",
  ];
  const eventTitle = roleText === "\u5e08\u59d0" ? "\u5e08\u59d0\u6307\u5bfc" : "\u5e08\u5144\u6307\u5bfc";
  const lightIdeaBonus = drawInclusiveInt(6, 10, getRoll);
  const deepSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const deepSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const deepSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const mentorSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const mentorSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const mentorSanNarrative = getResearchMiscSanNarrative(-4, state.player.research);
  const deepResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const deepResearchChange = deepResearchResult.effectiveChange;
  const deepResearchNarrative = getTierResistedNarrative("科研", 1, deepResearchResult);
  const canAddSenior = canAddRelationship(state.relationshipState, "senior");
  const seniorAddition = createGeneratedFellowProfileAddition("senior", serial, seniorGender, usedNames, getRoll);

  const event: PendingEvent = {
    id: `random-11-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `${roleText}带着项目记录来找你，问你要不要一起做。你接过材料，先翻到实验那页，发现有几处正是自己想弄明白的问题。`,
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
      `${roleText}搬了把椅子坐到你旁边，说手上的项目缺个人一起做。项目记录摊开好几页，有张图改过几次，旧线条还隐约留在纸上。`,
      `你接过材料，翻到实验那页停了下来。${roleText}见你看得认真，把椅子又往近处挪了一点：“这块我从头给你讲讲。”`,
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      ...(!canAddSenior ? ["普通关系栏已满，深度合作仍可结算本次收益，但不会新增师兄或师姐；你可以现在选择退出。"] : []),
      `${roleText}把接下来要做的实验一项项圈出来。你指着其中两处追问，听到解释才发现，之前卡住的地方还有这样的做法，忍不住往前凑了凑。`,
      "翻到写作那页，密密麻麻的批注又让你坐直了些。想学的东西一下多起来，真跟着做也得花时间。你把自己的进度说给对方听，准备先谈谈能从哪一块开始。",
    ].join("\n\n"),
    results: {
      [`random-11-watch-${serial}`]: {
        title: "先观望",
        description: [
          `你把材料还给${roleText}，说想先缓一缓。对方点点头：“行，那我先往下做，有兴趣再聊。”`,
          "这次没有多接一项任务。晚上离开实验室时，你终于没再站在门口回想是不是忘了什么，回去踏踏实实歇了歇。",
        ].join("\n\n"),
      },
      [`random-11-light-${serial}`]: {
        title: "浅合作",
        description: [
          `你接下一组实验，${roleText}把相关文献和设置发了过来，还特意圈出一个容易弄错的地方。你刚想问，发现答案已经写在旁边。`,
          "跟着做完这一小块，你在笔记里记下几种新的切入方式。下次琢磨选题时，可以先翻这几页，不必又从搜索框开始漫游。",
        ].join("\n\n"),
      },
      [`random-11-deep-${serial}`]: {
        title: "深合作",
        description: [
          `你跟着${roleText}把选题、实验和写作过了一遍。记录里几行轻描淡写的“调整设置”，摊开讲竟占了大半页笔记。`,
          "你把每一步为什么这样做补在旁边，又回头核对了一轮。讨论结束，桌上的水早就凉了，你把这次用到的方法单独标出来，留着以后对照。",
          ...(deepResearchNarrative ? [deepResearchNarrative] : []),
          ...(deepSanNarrative ? [deepSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-11-mentor-${serial}`]: {
        title: "拜入门下",
        description: [
          `你请${roleText}多教些写作，把刚讨论的思路写成一段练习。对方从论证顺序到句子衔接逐处批注，你原以为挺清楚的一段，旁边多了好几个问号。`,
          "照着改过几轮，你慢慢认出了自己总爱含糊带过的地方。这套写法逐句练过，以后动笔也用得上。",
          canAddSenior
            ? `${roleText}答应以后继续帮你看写作：“先自己改一遍，再拿来聊。”你点点头，把这页批注仔细收好。`
            : "你收好这次的批注，没有再约固定讨论。已有的合作还要照顾，这套写法先留给自己慢慢练熟。",
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

