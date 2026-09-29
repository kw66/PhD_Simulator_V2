import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
  formatActualSanChange,
  getActualSanChange,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { canAddRelationship } from "./v2-relationship-rules";
import { createGeneratedFellowProfileAddition, getFellowName, getFellowPronoun, getFellowRoleLabel } from "./v2-fellow-progression";
import {
  createThreeStageRandomEvent,
  drawInclusiveInt,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createRandomEvent10(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const peerGender = getRoll() < 0.5 ? "male" : "female";
  const usedNames = state.fellowProgressState.map((profile) => getFellowName(profile));
  const isLowSocial = state.player.social < 6;
  const canAddPeer = canAddRelationship(state.relationshipState, "peer");
  const fellowCapacity = Math.max(0, state.relationshipState.unlockedSlots - 1);
  const peerSlotCondition = canAddPeer
    ? `同学槽位 ${state.relationshipState.occupiedSlots} < ${fellowCapacity}`
    : `同学槽位 ${state.relationshipState.occupiedSlots} ≥ ${fellowCapacity}`;
  const exchangeSanChange = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  const fullSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const fullSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
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
          ? `互挂成功（50%）｜条件：${mutualTarget}类（成功后${mutualTarget === "A" ? 20 : mutualTarget === "B" ? 30 : 50}%）｜结果：非一作 ${mutualTarget} 类论文 +1，仅计引用。`
          : "互挂未成（50%）｜无事发生。",
        effects: mutualSuccess
          ? { grantedPublication: { target: mutualTarget, acceptedScore: mutualTarget === "A" ? 4 : mutualTarget === "B" ? 2 : 1, nonFirstAuthor: true } }
          : {},
      },
      {
        id: `random-10-reject-${serial}`,
        label: "\u5a49\u62d2\u5408\u4f5c",
        outcome: rejectSuccess
          ? "条件：无额外收益（50%）｜结果：无事发生。"
          : `条件：获得灵感（50%）｜结果：下次想 idea +${rejectIdeaBonus}｜下次写作 +${rejectWritingBonus}。`,
        effects: rejectSuccess
          ? {}
          : { temporaryActionEffectUpdates: { idea: { bonus: rejectIdeaBonus }, writing: { bonus: rejectWritingBonus } } },
      },
      {
        id: `random-10-full-${serial}`,
        label: "\u5168\u9762\u5408\u4f5c",
        outcome: isLowSocial
          ? `社交 < 6｜${fullSanSummary}｜下次想 idea 额外 1 次｜下次写作额外 1 次。`
          : `社交 ≥ 6｜${fullSanSummary}｜${peerSlotCondition}${canAddPeer ? "｜同门 +1" : "｜暂不新增同门"}｜下次想 idea 额外 1 次｜下次写作额外 1 次。`,
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
      `白板列了实验、写作和投稿，负责人还空着。${isLowSocial ? `你和${peerName}接话还不顺，解释一组实验就绕了几圈。眼前的事能做，往后能否一直配合，你没底。` : `你和${peerName}越聊越顺，很快分清各自擅长的部分。对方翻出下月日程，问起以后讨论的时间。`}`,
      `互相补点工作、挂个名字，也得确认排期，口头约好未必落得下来。全面合作会挤占自己的实验；婉拒不至于闹僵，刚记的点子还能带回去想。${!isLowSocial && !canAddPeer ? "普通关系栏已满，全面合作仍有本次收益，但不新增同门；你可以现在退出。" : ""}`,
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
              `先聊思路，${peerName}提醒你别漏一组对照，你也替${peerPronoun}补清实验设计里的一步。`,
              "聊到白板快写不下，原本绕不出的问题，换个人问几句就有了新方向。临走拍好照片，下次构思方案正好用。",
            ].join("\n\n"),
      },
      [`random-10-mutual-${serial}`]: {
        title: "互补合作",
        description: mutualSuccess
          ? [
              "谈好分工和署名，由对方主导论文。你接下补充实验，把设置和结果一起发过去，省得临交稿还翻聊天记录。",
              `${peerName}发来录用消息，你把作者列表看了两遍。不是一作，名字却印在上面；反复核对的表格，总算有了去处。`,
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
              "共享文档建好了，分工却只写个大概。各忙一轮，才发现两人都以为那组对照是对方在做。",
              "你们重新分工，列好两条备选和写作提纲。这回先到这里，下次不用再从白板上的第一个箭头开始。",
            ].join("\n\n")
          : [
              `你和${peerName}把分工、碰头时间写进共享文档。页面不好看，至少每项任务后都有个明确的人名。`,
              "选题提纲、实验分工和两条备选都留下了，下次打开，知道从哪页接着做。",
              canAddPeer
                ? "临走约好下次继续。以后有问题，总算有个知道前情、能接着聊的同门。"
                : "你们收好记录，没再约固定合作。要顾的同伴已够多，再添一位，怕是连碰头时间都凑不齐。",
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
  const mentorSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const mentorSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const deepResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const deepResearchChange = deepResearchResult.effectiveChange;
  const deepResearchNarrative = getTierResistedNarrative("科研", 1, deepResearchResult);
  const canAddSenior = canAddRelationship(state.relationshipState, "senior");
  const fellowCapacity = Math.max(0, state.relationshipState.unlockedSlots - 1);
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
        outcome: `${deepSanSummary}；${formatTierResistedOutcome("科研", 1, deepResearchResult)}；${canAddSenior ? `同学槽位 ${state.relationshipState.occupiedSlots} < ${fellowCapacity}；新增${roleText}` : `同学槽位 ${state.relationshipState.occupiedSlots} ≥ ${fellowCapacity}；暂不新增`}`,
        effects: {
          ...(deepResearchChange > 0 ? { research: deepResearchChange } : {}),
          san: deepSanChange,
          ...(canAddSenior ? { fellowAdditions: [seniorAddition] } : {}),
        },
      },
      {
        id: `random-11-mentor-${serial}`,
        label: "\u62dc\u5165\u95e8\u4e0b",
        outcome: `${mentorSanSummary}；永久写作 +4；${canAddSenior ? `同学槽位 ${state.relationshipState.occupiedSlots} < ${fellowCapacity}；新增${roleText}` : `同学槽位 ${state.relationshipState.occupiedSlots} ≥ ${fellowCapacity}；暂不新增`}。`,
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
      `${roleText}圈出接下来的实验。你追问两处，才发现之前卡住的地方还有这样的做法。翻到写作页，密密麻麻的批注让你坐直了些：学会这些，以后自己动笔也用得上。`,
      `想学的东西多了，跟着做也得花时间。${canAddSenior ? "对方提议定好分工，固定讨论。你翻出日程，盘算从哪块开始。" : "手头合作已排满，再约长期讨论，怕是谁也顾不好。普通关系栏已满，本次仍有收益，但不新增师兄或师姐；你可以现在退出。"}`,
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
        ].join("\n\n"),
      },
      [`random-11-mentor-${serial}`]: {
        title: "拜入门下",
        description: [
          `你请${roleText}多教些写作，把思路写成练习。对方从论证到衔接逐处批注，原以为挺清楚的一段，旁边多了好几个问号。`,
          "改过几轮，你认出了自己总爱含糊带过的地方。逐句练过，以后动笔也用得上。",
          canAddSenior
            ? `${roleText}答应继续帮你看：“先自己改一遍，再拿来聊。”你点头，仔细收好批注。`
            : "你收好批注，没再约固定讨论。已有的合作还要顾，这套写法先自己慢慢练熟。",
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

