import {
  formatResearchMiscSanChange,
  getActualResearchMiscSanChange,
  formatActualSanChange,
  getActualSanChange,
} from "./v2-sanity-rules";
import { canAddRelationship } from "./v2-relationship-rules";
import { createGeneratedFellowProfileAddition, getFellowName, getFellowPronoun, getFellowRoleLabel } from "./v2-fellow-progression";
import {
  createThreeStageEvent,
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
  const shortSanChange = getActualResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport, state.buffs);
  const shortSanSummary = formatResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport, state.buffs);
  const ideaBonus = 5;
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
        id: `random-10-reject-${serial}`,
        label: "委婉拒绝",
        outcome: "无事发生。",
        effects: {},
      },
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
        id: `random-10-short-term-${serial}`,
        label: "尝试合作",
        outcome: canAddPeer ? `${shortSanSummary}｜同门 +1` : "条件：人际栏已满｜结果：无事发生。",
        effects: canAddPeer ? {
          san: shortSanChange,
          fellowAdditions: [peerAddition],
        } : {},
      },
      {
        id: `random-10-long-term-${serial}`,
        label: "长期合作",
        outcome: canAddPeer
          ? "同门 +1｜SAN -1（每月）｜协作自动推进 +1次（每月）"
          : "条件：人际栏已满｜结果：无事发生。",
        effects: canAddPeer ? { fellowAdditions: [{ ...peerAddition, longTermMentoring: true }] } : {},
      },
    ],
  };

  return createThreeStageEvent(event, {
    introDescription: [
      `同级同门${peerName}在实验室门口叫住你，递来一页画满箭头的草图。纸角有点卷，最中间的那个问题倒是圈得很用力。`,
      `“我觉得这个方向可以试试，你要不要一起做？”${peerName}指着其中一条线讲起来。你们站着说了几句，索性找间空教室，借块白板慢慢画。`,
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `白板列了实验、写作和投稿，负责人还空着。${isLowSocial ? `你和${peerName}接话还不顺，解释一组实验就绕了几圈。只是聊清楚思路，也得多费些精力。` : `你和${peerName}越聊越顺，很快分清各自擅长的部分。`}`,
      `可以只聊思路，也可以挤出时间先做一轮，之后有问题再互相帮忙；若约定长期合作，每个月就得留出固定讨论时间。${canAddPeer ? "你翻了翻日程，看看还能匀出多少精力。" : "已有合作排满了，人际栏已满，无精力新增。"}`,
    ].join("\n\n"),
    results: {
      [`random-10-exchange-${serial}`]: {
        title: "学术交流",
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
      [`random-10-reject-${serial}`]: {
        title: "拒绝合作",
        description: [
          `你看了看日程，还是把这次邀请婉拒了。${peerName}点点头，把白板上的草图拍下来：“没事，以后有合适的再聊。”`,
          "你们一起走出教室，话题已经换成了食堂今天开哪个窗口。合作没谈成，倒也没有你担心的那么尴尬。",
        ].join("\n\n"),
      },
      [`random-10-short-term-${serial}`]: {
        title: canAddPeer ? "尝试合作" : "暂缓合作",
        description: canAddPeer ? [
          `你和${peerName}约好先集中做一轮，把各自的实验设置摊开核对。忙了几天，共享文档终于不再只有标题，自己的任务却也往后挤了些。`,
          "这次不约固定讨论，但彼此都知道对方在做什么了。临走留好联系方式，以后遇到问题还能接着交流。",
        ].join("\n\n") : [
          "你刚想约时间，翻开日程才发现已有合作排得满满当当。就算只集中做一轮，也实在抽不出空。",
          `你向${peerName}说明情况，暂时没有接下任务。对方收起草图，说等你腾出精力再聊。`,
        ].join("\n\n"),
      },
      [`random-10-long-term-${serial}`]: {
        title: canAddPeer ? "长期合作" : "暂缓合作",
        description: canAddPeer ? [
          `你和${peerName}把每月讨论的时间写进日历，约好互看实验和草稿。白板上的分工终于填上了名字，旁边还补了一句“有问题及时说”。`,
          "从此每月都要匀出精力，不过卡住时也多了个熟悉前情的人。第一次讨论散场，你们还在门口争论那组对照该怎么做，差点忘了关灯。",
        ].join("\n\n") : [
          "你翻了几页日程，现有合作已经把空当填满，再答应一份，怕是谁的消息都回不及时。",
          `${peerName}收起草图，说等彼此空些再聊。你们没有约固定讨论，白板上的负责人也暂时留了空。`,
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
  const lightIdeaBonus = 8;
  const deepSanChange = getActualResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport, state.buffs);
  const deepSanSummary = formatResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport, state.buffs);
  const canAddSenior = canAddRelationship(state.relationshipState, "senior");
  const seniorAddition = createGeneratedFellowProfileAddition("senior", serial, seniorGender, usedNames, getRoll);
  const seniorIntro = `${roleText}${seniorAddition.name ?? ""}`;

  const event: PendingEvent = {
    id: `random-11-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `${seniorIntro}带着项目记录来找你，问你要不要一起做。你接过材料，先翻到实验那页，发现有几处正是自己想弄明白的问题。`,
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-11",
    stage: "act1",
    choices: [
      {
        id: `random-11-watch-${serial}`,
        label: "委婉拒绝",
        outcome: "无事发生。",
        effects: {},
      },
      {
        id: `random-11-light-${serial}`,
        label: "学术交流",
        outcome: `\u4e0b\u6b21\u60f3 idea +${lightIdeaBonus}\u3002`,
        effects: {
          temporaryActionEffectUpdates: {
            idea: { bonus: lightIdeaBonus },
          },
        },
      },
      {
        id: `random-11-deep-${serial}`,
        label: "尝试合作",
        outcome: canAddSenior ? `${deepSanSummary}｜${roleText} +1` : "条件：人际栏已满｜结果：无事发生。",
        effects: canAddSenior ? {
          san: deepSanChange,
          fellowAdditions: [seniorAddition],
        } : {},
      },
      {
        id: `random-11-mentor-${serial}`,
        label: "长期合作",
        outcome: canAddSenior
          ? `${roleText} +1｜SAN -1（每月）｜协作自动推进 +1次（每月）`
          : "条件：人际栏已满｜结果：无事发生。",
        effects: canAddSenior ? { fellowAdditions: [{ ...seniorAddition, longTermMentoring: true }] } : {},
      },
    ],
  };

  return createThreeStageEvent(event, {
    introDescription: [
      `同组的${seniorIntro}搬了把椅子坐到你旁边，说手上的项目缺个人一起做。项目记录摊开好几页，有张图改过几次，旧线条还隐约留在纸上。`,
      `你接过材料，翻到实验那页停了下来。${roleText}见你看得认真，把椅子又往近处挪了一点：“这块我从头给你讲讲。”`,
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `${roleText}圈出接下来的实验。你追问两处，才发现之前卡住的地方还有这样的做法。只聊思路就能带走些启发，跟着试一轮则要挤出时间。`,
      `对方还提议每月固定讨论，互看实验和草稿。${canAddSenior ? "你翻出日程，盘算是先做一轮，还是长期一起推进。" : "已有合作占满了空当，人际栏已满，无精力新增；这次可以先交流思路。"}`,
    ].join("\n\n"),
    results: {
      [`random-11-watch-${serial}`]: {
        title: "委婉拒绝",
        description: [
          `你把材料还给${roleText}，说想先缓一缓。对方点点头：“行，那我先往下做，有兴趣再聊。”`,
          "你们把材料收好，临走又聊了两句近况。回到工位，你打开刚才搁下的文档，接着处理自己的任务。",
        ].join("\n\n"),
      },
      [`random-11-light-${serial}`]: {
        title: "学术交流",
        description: [
          `你请${roleText}讲讲这组实验的思路。对方翻出相关文献，还特意圈出一个容易弄错的地方。你刚想问，发现答案已经写在旁边。`,
          "聊完这一轮，你在笔记里记下几种新的切入方式。下次琢磨选题时，可以先翻这几页，不必又从搜索框开始漫游。",
        ].join("\n\n"),
      },
      [`random-11-deep-${serial}`]: {
        title: canAddSenior ? "尝试合作" : "暂缓合作",
        description: canAddSenior ? [
          `你跟着${roleText}把选题、实验和写作过了一遍。记录里几行轻描淡写的“调整设置”，摊开讲竟占了大半页笔记。`,
          "你挤出时间核对完这一轮，把遗漏补进记录。这次不约固定讨论，但彼此有了合作的底子，以后遇到问题还能接着聊。",
        ].join("\n\n") : [
          `你本想跟着${roleText}试一轮，核对安排后却犯了难：手头的几份合作都还在等自己，实在腾不出位置。`,
          "你把材料还给对方，说明这次暂时接不了。实验还没开工，先把时间说清楚，总比答应后一直拖着好。",
        ].join("\n\n"),
      },
      [`random-11-mentor-${serial}`]: {
        title: canAddSenior ? "长期合作" : "暂缓合作",
        description: canAddSenior ? [
          `你和${roleText}约好每月碰头，互看实验记录和草稿。对方把共享文档发来，第一条就是“别等到截止前一天才问”。`,
          "从此每月都得留出精力，但问题也有人一起琢磨。第一次讨论写满了两页纸，临走还在补下次要核对的实验。",
        ].join("\n\n") : [
          "你翻了翻日程，已有合作把空当排得满满当当。再答应固定讨论，怕是只能每次都说下周再聊。",
          `你向${roleText}说明情况，暂时没有接下这份合作。对方收好材料，说等彼此空些再谈。`,
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
