import { applyTierResist, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange, getResearchMiscSanNarrative, getTierResistedNarrative } from "./v2-sanity-rules";
import { createGeneratedFellowProfileAddition, getFellowRoleLabel, getFellowPronoun, getPlayerHonorific } from "./v2-fellow-progression";
import { getRoleDefinition } from "./v2-progression";
import { previewReadPaperActions } from "./v2-reading-system";
import {
  createThreeStageRandomEvent,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createRandomEvent1(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const mentorshipJunior = createGeneratedFellowProfileAddition("junior", serial);
  const mentorshipJuniorName = mentorshipJunior.name ?? "这名本科生";
  const mentorshipJuniorLabel = getFellowRoleLabel(mentorshipJunior.type, mentorshipJunior.gender);
  const mentorshipJuniorPronoun = getFellowPronoun(mentorshipJunior.gender);
  const familiarJunior = state.fellowProgressState.find((profile) => profile.type === "junior");
  const hasJunior = familiarJunior !== undefined;
  const canAddJunior = state.relationshipState.occupiedSlots < state.relationshipState.unlockedSlots;
  const familiarJuniorLabel = familiarJunior ? getFellowRoleLabel(familiarJunior.type, familiarJunior.gender) : "";
  const familiarJuniorName = familiarJunior?.name?.trim() || familiarJuniorLabel;
  const unfamiliarJunior = createGeneratedFellowProfileAddition("junior", serial + 101);
  const unfamiliarJuniorLabel = getFellowRoleLabel(unfamiliarJunior.type, unfamiliarJunior.gender);
  const playerHonorific = getPlayerHonorific(getRoleDefinition(state.selectedRoleId).gender);
  const becomesJunior = canAddJunior && getRoll() < 0.5;
  const refuseFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const refuseFavorChange = refuseFavorResult.effectiveChange;
  const refuseFavorNarrative = getTierResistedNarrative("导师好感", -1, refuseFavorResult);
  const delegateSocialRaw = hasJunior ? -1 : -2;
  const delegateSocialResult = applyTierResist(delegateSocialRaw, state.player.social, getRoll);
  const delegateSocialChange = delegateSocialResult.effectiveChange;
  const delegateSocialNarrative = getTierResistedNarrative("社交", delegateSocialRaw, delegateSocialResult);
  const mentoringSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport);
  const mentoringSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport);
  const mentoringSanNarrative = getResearchMiscSanNarrative(-4, state.player.research);

  const event: PendingEvent = {
    id: `random-1-y${state.year}-m${state.month}-n${serial}`,
    title: "毕设辅导",
    description: "一名本科生拿着毕设草稿来找你，导师希望你帮忙把关。自己的研究也没忙完，你得决定把多少时间分给对方。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-1",
    stage: "act1",
    choices: [
      {
        id: `random-1-refuse-${serial}`,
        label: "委婉拒绝",
        outcome: formatTierResistedOutcome("导师好感", -1, refuseFavorResult),
        effects: refuseFavorChange < 0 ? { favor: refuseFavorChange } : {},
      },
      {
        id: `random-1-self-${serial}`,
        label: "亲自指导",
        outcome: becomesJunior
          ? `${formatProbabilityCondition("对方选择留组", 0.5)}｜${mentoringSanSummary}${canAddJunior ? `｜新增一位${mentorshipJuniorLabel}` : "｜关系栏已满，暂不新增"}`
          : `${canAddJunior ? formatProbabilityCondition("对方毕业离组", 0.5) : "对方毕业离组"}｜${mentoringSanSummary}`,
        effects: becomesJunior
          ? {
            san: mentoringSanChange,
            ...(canAddJunior ? { fellowAdditions: [mentorshipJunior] } : {}),
          }
          : {
            san: mentoringSanChange,
          },
      },
      {
        id: `random-1-delegate-${serial}`,
        label: "转给师弟师妹",
        outcome: `${hasJunior ? `有熟悉的${familiarJuniorLabel}` : "暂无熟悉的师弟或师妹"}｜${formatTierResistedOutcome("社交", delegateSocialRaw, delegateSocialResult)}`,
        effects: delegateSocialChange < 0 ? { social: delegateSocialChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      `导师让你帮一名本科生检查毕设。你翻了翻${mentorshipJuniorPronoun}的草稿：实验缺对照，结论也没解释清楚。`,
      "说是帮忙看看，真要改好恐怕得花不少时间。自己的研究还没忙完，你先看了一眼手头的安排。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "亲自带，要花时间补实验、改草稿，也可能多认识一位留组的后辈。",
      "拒绝最省时间，导师可能会不太高兴。",
      "转给师弟师妹能少做一些，也可能惹来抱怨。",
    ].join("\n\n"),
    results: {
      [`random-1-refuse-${serial}`]: {
        title: "婉拒",
        description: [
          "你向导师说明最近科研任务太重，实在抽不出时间。",
          "导师听完，只回了句“知道了”，便让你先回去。",
          refuseFavorChange < 0
            ? "这次推辞让导师有些不满。你空出了时间，也得想想下次怎么把安排提前说清楚。"
            : "你把眼前的时间留给了自己的研究，没有再接下这件事。",
          ...(refuseFavorNarrative ? [refuseFavorNarrative] : []),
        ].join("\n\n"),
      },
      [`random-1-self-${serial}`]: {
        title: "亲自指导",
        description: becomesJunior
          ? [
              `你陪${mentorshipJuniorName}补了必要的实验，又把草稿里说不清楚的地方逐段改好。自己的事只能挤在空档里做。`,
              `${mentorshipJuniorPronoun}决定留组读研，眼下就开始跟你熟悉课题：“谢谢${playerHonorific}，以后还得多请教。”你多了一位常来讨论的${mentorshipJuniorLabel}。`,
              ...(mentoringSanNarrative ? [mentoringSanNarrative] : []),
            ].join("\n\n")
          : [
              `你陪${mentorshipJuniorName}补实验、改草稿，连答辩前一晚都还在解释表格里的结果。自己的进度只能抽空赶。`,
              `答辩顺利通过，${mentorshipJuniorPronoun}按原计划毕业离组。你收到一条认真的道谢，也终于能把晚上的时间留给自己。`,
              ...(mentoringSanNarrative ? [mentoringSanNarrative] : []),
            ].join("\n\n"),
      },
      [`random-1-delegate-${serial}`]: {
        title: "委托同门",
        description: hasJunior
            ? delegateSocialChange < 0
              ? [
                `你找到了${familiarJuniorName}，对方当面答应得很爽快。`,
                "可自己的任务也被耽搁了，对方交接时忍不住说：“下次别这么突然，我也有事要做。”",
                "你道了谢，也记住了这次勉强。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你和${familiarJuniorName}商量，请对方接手这次辅导。${familiarJuniorLabel}看过材料，答应帮忙。`,
                "你把已有资料交接清楚，总算腾出时间处理自己的研究。这次帮忙，你也记在了心里。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
          : delegateSocialChange < 0
            ? [
                `组里暂时没有熟悉的师弟师妹，你只好把任务交给一位不太熟的${unfamiliarJuniorLabel}。对方当面答应得很爽快。`,
                `没过几天，你听到对方在茶水间抱怨：“${playerHonorific}自己的活都丢给我了。”`,
                "大家再见到你时，气氛多少有点微妙。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你托了一位还不太熟的${unfamiliarJuniorLabel}帮忙，对方犹豫了一下，还是接下了。`,
                "之后没有再传来别的话，这件事暂时平稳地过去了。",
                "你把省下来的时间留给自己的论文，也记得之后找机会还这份人情。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent2(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const familiarJunior = state.fellowProgressState.find((profile) => profile.type === "junior");
  const hasJuniorForReview = familiarJunior !== undefined;
  const familiarJuniorLabel = familiarJunior ? getFellowRoleLabel(familiarJunior.type, familiarJunior.gender) : "";
  const familiarJuniorName = familiarJunior?.name?.trim() || familiarJuniorLabel;
  const unfamiliarJunior = createGeneratedFellowProfileAddition("junior", serial + 211);
  const unfamiliarJuniorLabel = getFellowRoleLabel(unfamiliarJunior.type, unfamiliarJunior.gender);
  const playerHonorific = getPlayerHonorific(getRoleDefinition(state.selectedRoleId).gender);
  const refuseFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const refuseFavorChange = refuseFavorResult.effectiveChange;
  const refuseFavorNarrative = getTierResistedNarrative("导师好感", -1, refuseFavorResult);
  const delegateSocialRaw = hasJuniorForReview ? -1 : -2;
  const delegateSocialResult = applyTierResist(delegateSocialRaw, state.player.social, getRoll);
  const delegateSocialChange = delegateSocialResult.effectiveChange;
  const delegateSocialNarrative = getTierResistedNarrative("社交", delegateSocialRaw, delegateSocialResult);
  const reviewReadPreview = previewReadPaperActions(state, 2, {
    consumeMonthlyAction: false,
    allowSanOverdraw: true,
  });
  const reviewOutcome = [
    `看论文 ${reviewReadPreview.appliedCount} 次`,
    `SAN -${reviewReadPreview.totalSanCost}`,
    `下次想 idea +${reviewReadPreview.totalIdeaBonus}分`,
    reviewReadPreview.researchGain > 0 ? `科研 +${reviewReadPreview.researchGain}` : "",
  ].filter(Boolean).join("｜");

  const event: PendingEvent = {
    id: `random-2-y${state.year}-m${state.month}-n${serial}`,
    title: "帮忙审稿",
    description: "自己的稿子还在返修，导师又转来一篇深度学习论文，请你抽空给些意见。文章里理论公式很多，不过有些地方的解释比较牵强，认真审下来要花掉一个晚上。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-2",
    stage: "act1",
    choices: [
      {
        id: `random-2-refuse-${serial}`,
        label: "婉言推辞",
        outcome: formatTierResistedOutcome("导师好感", -1, refuseFavorResult),
        effects: refuseFavorChange < 0 ? { favor: refuseFavorChange } : {},
      },
      {
        id: `random-2-self-${serial}`,
        label: "认真审稿",
        outcome: reviewOutcome,
        effects: {
          readPaperActions: 2,
        },
      },
      {
        id: `random-2-delegate-${serial}`,
        label: "交给师弟师妹",
        outcome: `${hasJuniorForReview ? `有熟悉的${familiarJuniorLabel}` : "暂无熟悉的师弟或师妹"}｜${formatTierResistedOutcome("社交", delegateSocialRaw, delegateSocialResult)}`,
        effects: delegateSocialChange < 0 ? { social: delegateSocialChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师转来一篇深度学习论文，请你协助审稿。你粗看了一遍，公式不少，但几处推导与实验结论还对不上。",
      "要判断是自己没读懂，还是文章确实有问题，得坐下来仔细核对。原定今晚的研究安排，又得往后挪一挪。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "认真审稿得核对公式、实验和相关工作，耗神，也能积累阅读经验。",
      "推辞能保住自己的时间，导师却未必高兴；请师弟师妹代劳，也得看对方是否忙得过来。",
    ].join("\n\n"),
    results: {
      [`random-2-refuse-${serial}`]: {
        title: "婉拒",
        description: [
          "你把这周的实验排期发给导师，说明自己确实抽不出一个完整晚上。",
          "导师回了句“好，我再问问其他同学”，没有继续勉强你。",
          refuseFavorChange < 0
            ? "语气虽然平静，导师还是对这次推辞有些不满。你只能先把手头的事做好。"
            : "你把时间留给原来的实验，先不再为审稿分心。",
          ...(refuseFavorNarrative ? [refuseFavorNarrative] : []),
        ].join("\n\n"),
      },
      [`random-2-self-${serial}`]: {
        title: "自己审稿",
        description: [
          "你把这篇稿件和一篇关键参考文献仔细读完，对着公式和实验表反复核对。哪里证据充分、哪里还需补充，都记进了意见。",
          "发给导师后，你又把值得借鉴的实验设计抄进笔记。一个晚上过去，自己的课题没动，倒是多了些阅读积累。",
        ].join("\n\n"),
      },
      [`random-2-delegate-${serial}`]: {
        title: "委托同门",
        description: hasJuniorForReview
            ? delegateSocialChange < 0
              ? [
                `你找到了${familiarJuniorName}，请对方帮忙看这篇论文。`,
                "对方没有拒绝，只是提醒你下次早点说，自己手头也排着任务。",
                "审稿总算按时交了，这次人情也算用掉了。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你找到一位有点交情的${familiarJuniorLabel}${familiarJuniorName === familiarJuniorLabel ? "" : ` ${familiarJuniorName}`}：“帮我看看这篇论文，正好和你的方向相关。”`,
                "“没问题，包在我身上。”对方爽快地答应了。",
                "审稿意见很快发了回来。你核对过论据和结论，再整理交给导师，也记下了这次人情。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
          : delegateSocialChange < 0
            ? [
                `组里暂时没有熟悉的师弟师妹，你只好把论文转给一位不太熟的${unfamiliarJuniorLabel}，请对方帮忙写审稿意见。`,
                `对方表面上答应了，后来却在群里吐槽：“${playerHonorific}的活又甩给我了。”`,
                "之后再碰面，彼此都多了点尴尬。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你把论文转给了一位不太熟的${unfamiliarJuniorLabel}，对方犹豫后答应了。`,
                "审稿意见后来交了回来，这次没有再起别的波澜。",
                "你检查完意见后发去一句感谢，也把这次帮忙记在了心里。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent14(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const juniorGender = getRoll() < 0.5 ? "male" : "female";
  const juniorAddition = createGeneratedFellowProfileAddition("junior", serial, juniorGender);
  const roleText = getFellowRoleLabel("junior", juniorGender);
  const eventTitle = roleText === "师弟" ? "指导师弟" : "指导师妹";
  const shortTermSan = getActualResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport);
  const shortTermSanSummary = formatResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport);
  const shortTermSanNarrative = getResearchMiscSanNarrative(-5, state.player.research);
  const shortTermSocialResult = applyTierResist(1, state.player.social, getRoll);
  const shortTermSocialGain = shortTermSocialResult.effectiveChange;
  const shortTermSocialNarrative = getTierResistedNarrative("社交", 1, shortTermSocialResult);
  const canAddJunior = state.relationshipState.occupiedSlots < state.relationshipState.unlockedSlots;

  const event: PendingEvent = {
    id: `random-14-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `新入组的${roleText}拿着实验结果来请教，问题和你刚入门时遇到的很像。你想起四处摸索的日子，准备帮到什么程度？`,
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-14",
    stage: "act1",
    choices: [
      {
        id: `random-14-decline-${serial}`,
        label: "精力有限，委婉拒绝",
        outcome: "无事发生。",
        effects: {},
      },
      {
        id: `random-14-idea-${serial}`,
        label: "短期合作，分享idea",
         outcome: `${shortTermSanSummary}；${formatTierResistedOutcome("社交", 1, shortTermSocialResult)}${canAddJunior ? `；新增${roleText}` : "；关系栏已满，暂不新增"}`,
        effects: {
          san: shortTermSan,
          ...(shortTermSocialGain > 0 ? { social: shortTermSocialGain } : {}),
          ...(canAddJunior ? { fellowAdditions: [juniorAddition] } : {}),
        },
      },
      {
        id: `random-14-long-term-${serial}`,
        label: "长期合作，共同成长",
         outcome: canAddJunior
           ? "新增师弟师妹｜每月 SAN -2｜每 12 个月新增一篇非一作论文。"
           : "关系栏已满，放弃长期带教。",
         effects: canAddJunior ? {
          fellowAdditions: [juniorAddition],
          addBuffs: [{
            id: `random-14-long-term-${serial}-monthly`,
            name: "长期带教",
            source: "指导师弟师妹",
            timing: "monthly",
            remainingMonths: null,
            monthlyStats: { san: -2 },
            scheduledPublication: {
              intervalMonths: 12,
              nonFirstAuthor: true,
              targetWeights: { A: 0.2, B: 0.3, C: 0.5 },
            },
          }],
        } : {},
      },
    ],
  };

  const pronounText = getFellowPronoun(juniorGender);
  return createThreeStageRandomEvent(event, {
    introDescription: [
      `一位新入组的${roleText}来请教代码与实验流程。看着${pronounText}手里凌乱的笔记，你想起自己刚入组时同样迷茫。`,
      "你手头也有自己的任务，只能决定帮到什么程度。",
    ].join("\n\n"),
    decisionTitle: "如何抉择",
    decisionDescription: [
      "最近实在忙不过来，可以直接说明情况。",
      `也可以先帮${pronounText}把眼前的问题跑通，之后让${pronounText}自己做。`,
      "长期带教要每月持续投入，也能一起积累合作成果；你得先确认自己还有精力维持这段合作。",
    ].join("\n\n"),
    results: {
      [`random-14-decline-${serial}`]: {
        title: "婉拒指导",
        description: [
          "你犹豫片刻，还是说明最近的实验已经排满，没法再接下指导。",
          `${roleText}点头说理解，但你能听出${pronounText}语气里的失落。`,
          "你回到工位继续自己的实验，暂时没有再接下这件事。",
        ].join("\n\n"),
      },
      [`random-14-idea-${serial}`]: {
        title: "短期合作",
        description: [
          "你把白板拉到身边，从问题背景到实验路线完整讲了一遍。",
          `${roleText}一边记笔记一边追问细节，配环境和调参的坑也在你的带领下逐步绕开。`,
          `几天后，${pronounText}已经能独立跑通小规模实验，你也能回头处理自己的任务了。`,
          ...(shortTermSocialNarrative ? [shortTermSocialNarrative] : []),
          ...(shortTermSanNarrative ? [shortTermSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-14-long-term-${serial}`]: {
        title: canAddJunior ? "长期带教" : "放弃带教",
        description: canAddJunior ? [
          `你和${roleText}约好每周固定讨论一次，代码、实验和论文都一起过。`,
          `${pronounText}开始参与实验、读文献，也会主动整理问题来找你。`,
          "你每个月都要额外花时间指导，不过有人一起做实验后，组里的工作也推进得更顺了。",
        ].join("\n\n") : [
          "你想了想，眼下维持的合作已经够多，实在排不出固定的指导时间。",
          "你如实说明情况，建议对方再问问其他同门。这次没有接下长期带教，也就不用勉强作出做不到的承诺。",
        ].join("\n\n"),
      },
    },
  });
}

export function createMentoringLabRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  if (eventId === 1) {
    return createRandomEvent1(state, getRoll);
  }
  if (eventId === 2) {
    return createRandomEvent2(state, getRoll);
  }
  if (eventId === 14) {
    return createRandomEvent14(state, getRoll);
  }
  return null;
}

