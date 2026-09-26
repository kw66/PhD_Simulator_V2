import { applyTierResist, formatEventSanChange, withoutIllnessSanBuffs, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange, getResearchMiscSanNarrative, getTierResistedNarrative } from "./v2-sanity-rules";
import { createGeneratedFellowProfileAddition, getFellowName, getFellowRoleLabel, getFellowPronoun, getPlayerHonorific } from "./v2-fellow-progression";
import { getActiveAiModels } from "./v2-ai-shop";
import { getRoleDefinition } from "./v2-progression";
import { canAddRelationship } from "./v2-relationship-rules";
import { previewReadPaperActions } from "./v2-reading-system";
import {
  createThreeStageRandomEvent,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createRandomEvent1(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const usedNames = [
    ...state.fellowProgressState.map((profile) => getFellowName(profile)),
    state.selectedAdvisorName ?? "",
    state.loverState.name ?? "",
  ];
  const familiarJunior = state.fellowProgressState.find((profile) => profile.type === "junior");
  const hasJunior = familiarJunior !== undefined;
  const canAddJunior = canAddRelationship(state.relationshipState, "junior");
  const familiarJuniorLabel = familiarJunior ? getFellowRoleLabel(familiarJunior.type, familiarJunior.gender) : "";
  const familiarJuniorName = familiarJunior ? getFellowName(familiarJunior) : familiarJuniorLabel;
  const playerHonorific = getPlayerHonorific(getRoleDefinition(state.selectedRoleId).gender);
  const staysForGradSchool = getRoll() < 0.5;
  const becomesJunior = staysForGradSchool && canAddJunior;
  const refuseFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const refuseFavorChange = refuseFavorResult.effectiveChange;
  const refuseFavorNarrative = getTierResistedNarrative("导师好感", -1, refuseFavorResult);
  const delegateSocialRaw = hasJunior ? -1 : -2;
  const delegateSocialResult = applyTierResist(delegateSocialRaw, state.player.social, getRoll);
  const delegateSocialChange = delegateSocialResult.effectiveChange;
  const delegateSocialNarrative = getTierResistedNarrative("社交", delegateSocialRaw, delegateSocialResult);
  const mentoringSanChange = getActualResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const mentoringSanSummary = formatResearchMiscSanChange(-4, state.player.research, state.month, state.eventSupport, state.buffs);
  const mentoringSanNarrative = getResearchMiscSanNarrative(-4, state.player.research);
  const mentorshipJunior = createGeneratedFellowProfileAddition("junior", serial, undefined, usedNames, getRoll);
  const guidedJunior = {
    ...mentorshipJunior,
    research: Math.min(20, mentorshipJunior.research + 1),
    affinity: Math.min(20, mentorshipJunior.affinity + 1),
  };
  const mentorshipJuniorName = mentorshipJunior.name ?? "这名本科生";
  const mentorshipJuniorLabel = getFellowRoleLabel(mentorshipJunior.type, mentorshipJunior.gender);
  const mentorshipJuniorPronoun = getFellowPronoun(mentorshipJunior.gender);
  const unfamiliarJunior = createGeneratedFellowProfileAddition("junior", serial + 101, undefined, [], getRoll);
  const unfamiliarJuniorLabel = getFellowRoleLabel(unfamiliarJunior.type, unfamiliarJunior.gender);

  const event: PendingEvent = {
    id: `random-1-y${state.year}-m${state.month}-n${serial}`,
    title: "毕设辅导",
    description: `导师把本科生${mentorshipJuniorName}的毕设进展发给你，安排你接手其中的实验核对。已有结果还缺关键对照，答辩时间也已经排进日程。`,
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
        outcome: staysForGradSchool
          ? `对方考研进组｜${mentoringSanSummary}${canAddJunior ? `｜新增一位${mentorshipJuniorLabel}（${mentorshipJuniorLabel}科研+1，${mentorshipJuniorLabel}默契+1）` : "｜关系栏已满，暂不新增"}`
          : `对方毕业｜${mentoringSanSummary}`,
        effects: becomesJunior
          ? {
            san: mentoringSanChange,
            ...(canAddJunior ? { fellowAdditions: [guidedJunior] } : {}),
          }
          : {
            san: mentoringSanChange,
          },
      },
      {
        id: `random-1-delegate-${serial}`,
        label: "转给师弟师妹",
        outcome: `${hasJunior ? `有熟悉的${familiarJuniorLabel}` : "无熟悉的师弟/师妹"}｜${formatTierResistedOutcome("社交", delegateSocialRaw, delegateSocialResult)}`,
        effects: delegateSocialChange < 0 ? { social: delegateSocialChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      `导师把本科生${mentorshipJuniorName}的毕设进展发给你，安排你接手其中的实验核对。已有结果还缺关键对照，答辩时间也已经排进日程。`,
      `你翻到实验部分，结论写得很有把握，对照结果却还没补齐。导师在消息里标出几处需要补上的表格，让你先从最关键的一组开始。`,
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `你在空白表格旁标出几个问题，往下翻，又添了两条。光把结果补上还不够，也得让对方自己讲清楚。${mentorshipJuniorName}还在犹豫毕业后去哪儿，认真带一程，或许以后能在组里继续合作；若去别处，也就到答辩为止。${canAddJunior ? "" : "只是你已有的合作排满了日程，即使对方留下，也腾不出位置继续结伴。"}`,
      `自己的会议 ddl 也在逼近，亲自指导会挤掉不少时间，向导师推辞又怕让他失望。${hasJunior ? `你翻到${familiarJuniorName}的聊天框，平时一起做事，转交至少好说些，可临时添活仍难免惹人抱怨。` : "联系人里没有熟悉的师弟师妹，临时把任务推给不熟的人，恐怕比找老熟人更伤情面。"}`,
    ].join("\n\n"),
    results: {
      [`random-1-refuse-${serial}`]: {
        title: "婉拒",
        description: [
          "你把近期的研究安排发给导师，说明最近要赶会议 ddl，这次实在腾不出时间。消息发出后，你盯着聊天框等了一会儿，才收到导师一句“好”。",
          refuseFavorChange < 0
            ? "导师没有再安排辅导，回复却比平时冷了些。你关掉草稿，回到自己的工作上，手倒是空出来了，心里还有点不自在。"
            : "导师没再追问，你也关掉了草稿。今晚的安排总算不用重写，桌上摊开的那页笔记终于能接着往下看。",
          ...(refuseFavorNarrative ? [refuseFavorNarrative] : []),
        ].join("\n\n"),
      },
      [`random-1-self-${serial}`]: {
        title: "亲自指导",
        description: staysForGradSchool
          ? [
              `你陪${mentorshipJuniorName}补对照、改草稿，同一张表来回讲了几遍，桌边的水早已凉了。等${mentorshipJuniorPronoun}终于能自己解释结果，你才发现自己的任务还停在原处。`,
              canAddJunior
                ? `${mentorshipJuniorPronoun}决定考研进组，又抱着笔记本来找你：“谢谢${playerHonorific}，以后还得多请教。”这次辅导让${mentorshipJuniorLabel}的科研 +1、与你的默契 +1；目前科研 ${guidedJunior.research}、默契 ${guidedJunior.affinity}。你多了一位${mentorshipJuniorLabel}，这回翻开的笔记里，已经有了自己整理的问题。`
                : `${mentorshipJuniorPronoun}决定考研进组，但关系栏已经满了，暂时没能把对方记入人际栏。你把资料整理好发回去，之后仍得各自处理手头的事。`,
              ...(mentoringSanNarrative ? [mentoringSanNarrative] : []),
            ].join("\n\n")
          : [
              `你陪${mentorshipJuniorName}补实验、改草稿，答辩前还对着共享屏幕过了一遍图表。${mentorshipJuniorPronoun}总算能把结果讲明白，你也揉了揉盯得发酸的眼睛。`,
              `答辩结束，${mentorshipJuniorPronoun}按原计划毕业，之后去了另一所学校。对方发来一长段道谢，你回了句“一切顺利”，关掉文档，终于不用再等下一版草稿。`,
              ...(mentoringSanNarrative ? [mentoringSanNarrative] : []),
            ].join("\n\n"),
      },
      [`random-1-delegate-${serial}`]: {
        title: "委托同门",
        description: hasJunior
            ? delegateSocialChange < 0
              ? [
                `你把草稿转给${familiarJuniorName}，请对方接手辅导。对方答应下来，交接时却指了指桌上的任务清单：“下次早点说，我这边也排满了。”`,
                "辅导的事有人接了，你的道谢却没换来往常那句“客气什么”。你收回搭在椅背上的手，没再耽误对方。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你带着草稿去找${familiarJuniorName}，把需要补的地方逐项说明。${familiarJuniorLabel}看了看材料，念叨一句“你可真会挑时间”，还是接了过去。`,
                "你把实验记录和文件位置交代清楚，总算能回去处理自己的事。临走前多说了声谢谢，对方摆摆手，已经开始翻下一页。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
          : delegateSocialChange < 0
            ? [
                `你找了一位不太熟的${unfamiliarJuniorLabel}接手辅导。对方接过草稿时只问了答辩日期，你便以为事情已经说妥。`,
                `后来去接水，你听见一句“${playerHonorific}把辅导的事都交给我了”。话音在你走近时停住，你端着还没接满的杯子，一时也不知道该接什么话。`,
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你托一位还不太熟的${unfamiliarJuniorLabel}接手辅导。对方看着草稿叹了口气，你赶紧把已经发现的问题一并标好，省得再从头找。`,
                "交接后没有再起争执，见面也还照常打招呼。你终于能回到自己的安排上，只是再看到那个草稿文件名，仍会想起欠着的一声谢谢。",
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
  const familiarJuniorName = familiarJunior ? getFellowName(familiarJunior) : familiarJuniorLabel;
  const playerHonorific = getPlayerHonorific(getRoleDefinition(state.selectedRoleId).gender);
  const refuseFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const refuseFavorChange = refuseFavorResult.effectiveChange;
  const refuseFavorNarrative = getTierResistedNarrative("导师好感", -1, refuseFavorResult);
  const delegateSocialRaw = hasJuniorForReview ? -1 : -2;
  const delegateSocialResult = applyTierResist(delegateSocialRaw, state.player.social, getRoll);
  const delegateSocialChange = delegateSocialResult.effectiveChange;
  const delegateSocialNarrative = getTierResistedNarrative("社交", delegateSocialRaw, delegateSocialResult);
  const unfamiliarJunior = createGeneratedFellowProfileAddition("junior", serial + 211, undefined, [], getRoll);
  const unfamiliarJuniorLabel = getFellowRoleLabel(unfamiliarJunior.type, unfamiliarJunior.gender);
  const reviewReadPreview = previewReadPaperActions(state, 2, {
    consumeMonthlyAction: false,
    allowSanOverdraw: true,
  });
  const healthyReadPreview = previewReadPaperActions({ ...state, buffs: withoutIllnessSanBuffs(state.buffs) }, 2, {
    consumeMonthlyAction: false,
    allowSanOverdraw: true,
  });
  const reviewIllnessIncrease = Math.max(0, reviewReadPreview.totalSanCost - healthyReadPreview.totalSanCost);
  const activeKimi = getActiveAiModels(state.aiShopState).find((model) => model.slot === "kimi");
  const reviewSupportHint = [
    state.shopState.monitorOwned ? "桌上的 2K 显示器正好能把正文和附录分开" : "",
    activeKimi ? `${activeKimi.name}也能帮你整理这篇长文` : "",
  ].filter(Boolean).join("；");
  const reviewSupportNarrative = [
    state.shopState.monitorOwned
      ? "还好之前买了 2K 显示器，这一大篇正文和附录看着没那么累，来回核对也顺畅了不少。"
      : "",
    activeKimi
      ? `${state.shopState.monitorOwned ? "再加上订阅的" : "还好订阅了"} ${activeKimi.name}，有它帮着梳理长文，审稿效率高了不少。`
      : "",
  ].filter(Boolean).join("");
  const reviewOutcome = [
    `看论文 ${reviewReadPreview.appliedCount} 次`,
    reviewReadPreview.totalSanCost > 0 ? formatEventSanChange(-reviewReadPreview.totalSanCost, reviewIllnessIncrease) : "",
    `下次想 idea +${reviewReadPreview.totalIdeaBonus}分`,
    reviewReadPreview.researchGain > 0 ? `科研 +${reviewReadPreview.researchGain}` : "",
  ].filter(Boolean).join("｜");

  const event: PendingEvent = {
    id: `random-2-y${state.year}-m${state.month}-n${serial}`,
    title: "审稿任务",
    description: "导师把你和几位同学拉进审稿群，每人分配一篇论文，要求在截止前交回审稿意见。分到你的是一篇深度学习论文，公式从正文排到附录，期限却已经近在眼前。",
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
        outcome: `${hasJuniorForReview ? `有熟悉的${familiarJuniorLabel}` : "无熟悉的师弟/师妹"}｜${formatTierResistedOutcome("社交", delegateSocialRaw, delegateSocialResult)}`,
        effects: delegateSocialChange < 0 ? { social: delegateSocialChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师把你和几位同学拉进审稿群，直接发出分工：“每人一篇，按分配把审稿意见写好，截止前发给我。”紧接着，论文和对应的名字一条条刷了出来，你的名字也在其中。",
      "你点开分到的那篇深度学习论文，公式一路排到附录。对着实验表翻回前文，刚才还连贯的推导，有两步怎么也没找到解释。群里的截止日期倒是写得清清楚楚。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `要把这几步核对清楚，还得找来参考文献。认真读完能学到东西，可看着排满的日程，你还是忍不住叹了口气：今晚又得加班了。${reviewSupportHint ? `${reviewSupportHint}，多少能省些力气。` : ""}`,
      `任务已经分到你头上，推辞就得向导师说明缘由，想到他的追问，你心里有点发怵。${hasJuniorForReview ? `也可以请${familiarJuniorName}代劳；平时一起做事好商量些，可对方也有截止日期，把这几十页公式临时转过去，还是觉得过意不去。` : "你还没有熟悉的师弟师妹，临时请不熟的人代劳，比找老熟人更难开口；看着这几十页公式，已经能想象对方收到时的神情。"}`,
    ].join("\n\n"),
    results: {
      [`random-2-refuse-${serial}`]: {
        title: "婉拒",
        description: [
          "你私聊导师，把这周的安排发过去，说明没法在期限前认真读完。导师回了句“好，我重新分配”，又补了一句：“你的学习安排排得这么满，科研进展却还是偏慢，时间还是要多放在科研上。”随后调整了群里的分工。",
          refuseFavorChange < 0
            ? "你盯着这句提醒看了几秒。导师没有把话说重，敲打的意思却很清楚：安排再满，如果科研进展跟不上，忙也只是忙。你收起聊天窗口，回到原来的工作上，敲了几行字才慢慢找回思路。"
            : "你看着这句提醒，又把日程翻了一遍。确实排得满，可真正推进的科研没几项；今晚不用审稿，正好把一件该做的事往前推。",
          ...(refuseFavorNarrative ? [refuseFavorNarrative] : []),
        ].join("\n\n"),
      },
      [`random-2-self-${serial}`]: {
        title: "自己审稿",
        description: [
          ...(reviewSupportNarrative ? [reviewSupportNarrative] : []),
          "你把稿件和一篇关键参考文献并排打开，对着公式核到实验表，笔记里写满了页码。最初那句“这里好像不对”，终于被改成了能说清依据的审稿意见。",
          "你按群里的要求把意见发给导师，又记下几个值得借鉴的实验设计。窗外已经暗了，原来的安排还没顾上，倒是下次琢磨方向时多了些可翻的笔记。",
        ].join("\n\n"),
      },
      [`random-2-delegate-${serial}`]: {
        title: "委托同门",
        description: hasJuniorForReview
            ? delegateSocialChange < 0
              ? [
                `你把稿件发给${familiarJuniorName}，请对方帮忙审。对方答应了，紧接着又发来一句：“下次能不能早两天说？我也有截止日期。”`,
                "意见按时交了回来，你核对后转给导师。事情是办完了，可平时还能顺便聊两句的聊天框，这次停在了你发出的“谢谢”。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你找到熟悉的${familiarJuniorLabel}${familiarJuniorName === familiarJuniorLabel ? "" : ` ${familiarJuniorName}`}，请对方接手分给你的稿件。对方翻到附录，笑着说了一句“这一篇可真够长的”，还是接下了。`,
                "意见发回来时，几个存疑的公式旁都标好了页码。你逐项核对，整理后交给导师，回头又认真道了谢；这次总算没有把场面弄僵。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
          : delegateSocialChange < 0
            ? [
                `你请一位不太熟的${unfamiliarJuniorLabel}帮忙审稿，对方看过期限，勉强答应了。后来传回来的除了意见，还有一句“${playerHonorific}这次可给我找了不少事”。`,
                "你核对完意见交给导师，再碰面时却少了几分自在。你想搭句话，对方指指屏幕上的任务，先转回了身。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n")
            : [
                `你请一位不太熟的${unfamiliarJuniorLabel}帮忙审稿。对方先问清期限，又看了看页数，停了一会儿才说可以。`,
                "意见按时发了回来，你核对后交给导师，再补上一句感谢。对方回了个“收到”，隔天在走廊碰面，仍和往常一样打了招呼。",
                ...(delegateSocialNarrative ? [delegateSocialNarrative] : []),
              ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent14(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const juniorGender = getRoll() < 0.5 ? "male" : "female";
  const usedNames = [
    ...state.fellowProgressState.map((profile) => getFellowName(profile)),
    state.selectedAdvisorName ?? "",
    state.loverState.name ?? "",
  ];
  const roleText = getFellowRoleLabel("junior", juniorGender);
  const eventTitle = roleText === "师弟" ? "指导师弟" : "指导师妹";
  const shortTermSan = getActualResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport, state.buffs);
  const shortTermSanSummary = formatResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport, state.buffs);
  const shortTermSanNarrative = getResearchMiscSanNarrative(-5, state.player.research);
  const shortTermSocialResult = applyTierResist(1, state.player.social, getRoll);
  const shortTermSocialGain = shortTermSocialResult.effectiveChange;
  const shortTermSocialNarrative = getTierResistedNarrative("社交", 1, shortTermSocialResult);
  const canAddJunior = canAddRelationship(state.relationshipState, "junior");
  const juniorAddition = createGeneratedFellowProfileAddition("junior", serial, juniorGender, usedNames, getRoll);

  const event: PendingEvent = {
    id: `random-14-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `新入组的${roleText}抱着电脑来请教，实验还没跑起来，报错倒已经存了好几张截图。你把旁边的椅子往外挪了挪。`,
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
           : "关系栏已满，放弃持续指导。",
         effects: canAddJunior ? {
          fellowAdditions: [juniorAddition],
          addBuffs: [{
            id: `random-14-long-term-${serial}-monthly`,
            name: "持续指导",
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
      `新入组的${roleText}抱着电脑来到工位旁，说环境已经配好，实验却一直跑不起来。${pronounText}打开终端，屏幕上还停着一长串报错。`,
      `旁边的笔记记着几个试过的版本号，最后一行画了个问号。${roleText}把椅子轻轻拉过来，问你能不能帮忙看一眼。`,
    ].join("\n\n"),
    decisionTitle: "如何抉择",
    decisionDescription: [
      `${!canAddJunior ? "普通关系栏已满，继续合作不会新增师弟师妹；你可以现在选择退出。" : ""}眼前这副对着报错无从下手的样子，让你想起自己刚进组的时候。如今轮到别人来问你了，可你屏幕上的问题，也还在等一个答案。`,
      `${pronounText}把笔记翻到最后一页，等你看那几个反复报错的位置。帮这一次还能挤挤时间，一起把问题讲清也能熟络些；真要一直带下去，每个月都得留出精力，带上一年，才会有一篇共同署名的成果。${canAddJunior ? "" : "可眼下连下一次固定讨论都排不进去，长期的约定只能先放下。"}`,
    ].join("\n\n"),
    results: {
      [`random-14-decline-${serial}`]: {
        title: "婉拒指导",
        description: [
          "你看了眼自己的安排，还是说明最近腾不出精力指导。话说出口时有些不好意思，但也没再把“有空再看”挂在后面。",
          `${roleText}点点头，把电脑抱回去，临走还替你推好了椅子。你重新看向屏幕，找了一会儿，才找到刚才读到的那一行。`,
        ].join("\n\n"),
      },
      [`random-14-idea-${serial}`]: {
        title: "短期合作",
        description: [
          `你腾出一段时间，和${roleText}从报错查到实验设置，再在白板上画出一个可以先试的小方案。讲到一半才发现，有些自己习惯了的步骤，解释起来也得重新捋。`,
          `几天后，${pronounText}拿着跑通的结果来给你看，笔记里的问号终于划掉了。你嗓子有点干，自己的事也还没做完，看着那张图却忍不住多点了两下头。`,
          ...(shortTermSocialNarrative ? [shortTermSocialNarrative] : []),
          ...(shortTermSanNarrative ? [shortTermSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-14-long-term-${serial}`]: {
        title: canAddJunior ? "持续指导" : "放弃指导",
        description: canAddJunior ? [
          `你和${roleText}约好定期讨论，从代码和实验记录开始一起看。${pronounText}很快带来了整理好的问题，白板上刚擦干净的一角又写满了。`,
          "日程里从此多了一项固定安排，每个月都得为指导留出精力。第一次讨论结束，你收起白板笔，才发现留给自己吃饭的时间又短了些。",
        ].join("\n\n") : [
          "你把日程往后翻了翻，已有的合作挤在一起，实在找不出能长期留给指导的时间。刚到嘴边的“以后一起做”，还是收了回去。",
          "你说明情况，建议对方再问问其他同门。对方抱着电脑离开，你把日程合上；这次没有约下下一场讨论，也没有再添一份惦记。",
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

