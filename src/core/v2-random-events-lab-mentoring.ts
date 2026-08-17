import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import { wouldUnlockLearnToSayNo, type RandomRollProvider } from "./v2-random-events-lab-shared";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createRandomEvent1(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const becomesJunior = getRoll() < 0.5;
  const delegateSocialChange = applyTierResist(-1, state.player.social, getRoll).effectiveChange;

  const event: PendingEvent = {
    id: `random-1-y${state.year}-m${state.month}-n${serial}`,
    title: "毕设辅导",
    description: "本科生拿着还没成形的毕设选题来找你，导师让你顺手带一带。自己的论文也没做完，你得决定把多少时间分给对方。",
    preview: "导师让你指导本科生毕设",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-1",
    stage: "act1",
    choices: [
      {
        id: `random-1-refuse-${serial}`,
        label: "委婉拒绝",
        outcome: "导师好感 -1。",
        effects: {
          favor: -1,
          counterDeltas: { rejectedMentoringCount: 1 },
          achievementFlags: wouldUnlockLearnToSayNo(state, "mentoring") ? ["learnToSayNo"] : [],
        },
      },
      {
        id: `random-1-self-${serial}`,
        label: "亲自指导",
        outcome: becomesJunior ? "SAN -3，科研 +1，并可能成为你的师弟/师妹。" : "SAN -3。",
        effects: becomesJunior
          ? {
            san: -3,
            research: 1,
            relationshipAdditions: ["junior"],
          }
          : {
            san: -3,
          },
      },
      {
        id: `random-1-delegate-${serial}`,
        label: "转给师弟",
        outcome: delegateSocialChange < 0 ? `社交 ${delegateSocialChange}。` : "无事发生。",
        effects: delegateSocialChange < 0 ? { social: delegateSocialChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "本科毕设季到了，导师把一名本科生交给你带。",
      "你看了眼他的开题材料，基础薄弱，短期内要投入不少精力。",
      "会议室白板上已经排满你自己的实验节点，这项新任务几乎塞不进日程缝隙。",
      "但你也知道，带人不仅是杂务，它会影响导师对你“能不能独当一面”的判断，也会影响同门如何看待你的协作方式。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“这活一旦接了，短期精力肯定要被切走，但可能换来组内信任。”",
      "“如果现在拒绝，能保住进度，可导师那边未必会轻轻放下。”",
      "“转给同门看似高效，本质是在拿关系去换时间。”你要选的不是哪条最轻松，而是哪条代价你愿意长期承担。",
    ].join("\n\n"),
    results: {
      [`random-1-refuse-${serial}`]: {
        title: "婉拒",
        description: [
          "你支支吾吾地表示自己最近科研任务太重，实在抽不出空。",
          "导师脸色一沉，没说什么，挥手让你出去了。",
          "接下来的几天，你明显感觉到导师对你的态度冷淡了不少，组会上的眼神都带着凉意。",
        ].join("\n\n"),
      },
      [`random-1-self-${serial}`]: {
        title: "亲自指导",
        description: becomesJunior
          ? [
              "为了让小张顺利毕业，你手把手教实验、逐字逐句改论文，累得每天回宿舍倒头就睡。",
              "好在天道酬勤，这孩子最后跑出了一组相当漂亮的数据！",
              "“谢谢师兄！”小张顺利通过答辩，还决定留下来读研，成为了你的师弟。",
              "判定口径：50% 成为师弟师妹并科研 +1，50% 仅完成带教。",
            ].join("\n\n")
          : [
              "为了让小张顺利毕业，你手把手教实验、逐字逐句改论文，累得每天回宿舍倒头就睡。",
              "结果这孩子直到答辩前一天还在问你“P 值是什么”。",
              "好不容易把他送走，你感觉自己的半条命也没了，只想大睡三天。",
              "判定口径：50% 成为师弟师妹并科研 +1，50% 仅完成带教。",
            ].join("\n\n"),
      },
      [`random-1-delegate-${serial}`]: {
        title: "委托同门",
        description: delegateSocialChange < 0
          ? [
              "你把任务派给了师弟，师弟当面答应得很爽快。",
              "结果没过几天，你就听到他在茶水间跟别人抱怨：“师兄自己想偷懒，把杂活都丢给我，真把我们当苦力啊……”",
              "大家看你的眼神都有点微妙。",
              "判定口径：社交基础 -1，按当前社交执行概率抵消后得到实际变化。",
            ].join("\n\n")
          : [
              "你找到平时关系不错的师弟：“这个光荣的任务就交给你了，正好熟悉下实验流程。”",
              "“好嘞！师兄放心，包在我身上！”",
              "师弟干劲十足地接过了任务，你顺利甩掉了一个大包袱，一身轻松。",
              "判定口径：社交基础 -1，按当前社交执行概率抵消后得到实际变化。",
            ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent2(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const gotInspiration = getRoll() < 0.5;
  const isLowSocial = state.player.social < 6;

  const event: PendingEvent = {
    id: `random-2-y${state.year}-m${state.month}-n${serial}`,
    title: "帮忙审稿",
    description: "自己的稿子还在返修，导师又转来一篇审稿，希望你先给些意见。认真审会花不少时间，敷衍过去又可能错过学习机会。",
    preview: "导师让你帮忙审稿",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-2",
    stage: "act1",
    choices: [
      {
        id: `random-2-refuse-${serial}`,
        label: "婉言推辞",
        outcome: "导师好感 -1。",
        effects: {
          favor: -1,
          counterDeltas: { rejectedReviewCount: 1 },
          achievementFlags: wouldUnlockLearnToSayNo(state, "review") ? ["learnToSayNo"] : [],
        },
      },
      {
        id: `random-2-self-${serial}`,
        label: "认真审稿",
        outcome: gotInspiration ? "SAN -2，下次想 idea +4。" : "SAN -2。",
        effects: gotInspiration
          ? {
            san: -2,
            temporaryActionEffectUpdates: {
              idea: { bonus: 4 },
            },
          }
          : {
            san: -2,
          },
      },
      {
        id: `random-2-delegate-${serial}`,
        label: "交给师弟",
        outcome: isLowSocial ? "社交 -1。" : "无事发生。",
        effects: isLowSocial ? { social: -1 } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师把一篇审稿任务转给了你，截止日期很近。",
      "论文篇幅长、信息密，处理起来要花掉整块时间。",
      "你本周原本留给自己论文的两个晚上，几乎被这份“外包责任”直接吞掉。",
      "这类工作不直接产出成果，却是导师判断你职业素养和协作可靠性的隐性考题。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“这篇稿子不是我的论文，却会占掉我这周最整块的时间。”",
      "“认真做也许能学到东西；敷衍处理则是在透支导师信任。”",
      "“交给同门能减压，但人情账未必比审稿账更便宜。”你得在短期效率和长期信用之间做一个不会后悔的选择。",
    ].join("\n\n"),
    results: {
      [`random-2-refuse-${serial}`]: {
        title: "婉拒",
        description: [
          "你硬着头皮跟导师说最近实验太忙，实在抽不出时间。",
          "导师皱了皱眉：“行吧，那我自己看。”",
          "虽然导师没说什么，但你能感觉到他的不满。接下来几天，导师对你明显冷淡了一些。",
        ].join("\n\n"),
      },
      [`random-2-self-${serial}`]: {
        title: "自己审稿",
        description: gotInspiration
          ? [
              "你花了整整两个晚上，逐字逐句地读完了这篇论文。",
              "虽然很累，但这篇论文的方法确实有独到之处。你一边写审稿意见，一边在笔记本上记下了几个灵感。",
              "“这个思路……说不定可以用在我自己的研究上！”",
              "判定口径：50% 获得启发，50% 仅结算 SAN。",
            ].join("\n\n")
          : [
              "你花了整整两个晚上，逐字逐句地读完了这篇论文。",
              "说实话，这篇论文写得一般，创新点也不够突出。你按部就班地写完了审稿意见，感觉自己的时间被浪费了。",
              "“唉，又是一篇灌水文章……”",
              "判定口径：50% 获得启发，50% 仅结算 SAN。",
            ].join("\n\n"),
      },
      [`random-2-delegate-${serial}`]: {
        title: "委托同门",
        description: isLowSocial
          ? [
              "你把论文转发给了师弟，让他帮忙写审稿意见。",
              "师弟表面上答应了，但你能感觉到他的不情愿。",
              "后来你听说他在实验室群里吐槽：“师兄的活又甩给我了，我自己的论文还没写完呢……”",
              "判定口径：社交值低于 6 时社交 -1，否则无额外变化。",
            ].join("\n\n")
          : [
              "你找到关系不错的师弟：“帮我看看这篇论文呗，正好和你的方向相关。”",
              "“没问题师兄，包在我身上！”师弟爽快地答应了。",
              "第二天他就把审稿意见发给你了，写得还挺认真。你稍微改了改格式就交差了。",
              "判定口径：社交值低于 6 时社交 -1，否则无额外变化。",
            ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent14(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const roleText = getRoll() < 0.5 ? "师弟" : "师妹";
  const eventTitle = roleText === "师弟" ? "指导师弟" : "指导师妹";
  const shortTermSan = getActualSanChange(-5, state.month, state.eventSupport);

  const event: PendingEvent = {
    id: `random-14-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `新入组${roleText}拿着实验结果来请教，问题和你刚入门时遇到的很像。你想起当年四处摸索的日子，准备怎么指导？`,
    preview: "你已经初窥科研门道了...",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
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
        outcome: `SAN ${shortTermSan}，社交 +1。`,
        effects: {
          san: shortTermSan,
          social: 1,
          relationshipAdditions: ["junior"],
        },
      },
      {
        id: `random-14-long-term-${serial}`,
        label: "长期合作，共同成长",
        outcome: "获得长期指导：每月 SAN -1，总引用 +师弟师妹数 x3。",
        effects: {
          mentorshipStacks: 1,
          relationshipAdditions: ["junior"],
        },
      },
    ],
  };

  const pronounText = roleText === "师弟" ? "他" : "她";
  return createThreeStageRandomEvent(event, {
    introDescription: [
      `一位新入组${roleText}来请教代码与实验流程。`,
      `你能看出${pronounText}现在很需要一个稳定带路的人。`,
      `你看着${pronounText}手里凌乱的笔记，想起自己刚入组时同样迷茫。`,
      "带人会分走你的时间，但也可能积累团队资源和长期协作回报。",
    ].join("\n\n"),
    decisionTitle: "如何抉择",
    decisionDescription: [
      "“拒绝能立刻保住你的时间块，但也会关掉一次建立团队资产的机会。”",
      "“短期合作像快速试配，能先验证对方执行力和沟通成本。”",
      "“长期培养最像投资，你要先付出精力，回报在更长时间线上兑现。”你要决定自己此刻更缺时间，还是更缺可持续的协作后手。",
    ].join("\n\n"),
    results: {
      [`random-14-decline-${serial}`]: {
        title: "结果",
        description: [
          "你沉默了几秒，还是把“最近课题太满”这句话说出了口。",
          `${roleText}点头说理解，但你能听出${pronounText}语气里的失落。`,
          "你回到工位继续推进手头任务，效率保住了，却也错过了建立协作关系的窗口。",
        ].join("\n\n"),
      },
      [`random-14-idea-${serial}`]: {
        title: "结果",
        description: [
          "你把白板拉到身边，从问题背景到实验路线完整讲了一遍。",
          `${roleText}一边记笔记一边追问细节，配环境和调参的坑也在你的带领下逐步绕开。`,
          `几天后，${pronounText}已经能独立跑通小规模实验。你很累，但能明显感到“有人接得住你的思路”。`,
        ].join("\n\n"),
      },
      [`random-14-long-term-${serial}`]: {
        title: "结果",
        description: [
          "你没有把这次带教当成“临时帮忙”，而是正式提出长期协作计划。",
          `${roleText}明显松了口气，随后开始按你的节奏参与实验、读文献和复盘汇报。`,
          "你每个月都要额外分出时间指导，但团队产能和论文传播也在稳定增长。",
          "这是一笔慢回报投资，你用持续精力换来了可复用的人才资产。",
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
