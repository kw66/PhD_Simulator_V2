import {
  createThreeStageRandomEvent,
  hasRecoverableDraftPaper,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
  getResearchMiscSanNarrative,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import type { GameState, PendingEvent } from "./v2-types";

export function createDataLossRandomEvent(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  if (!hasRecoverableDraftPaper(state)) {
    return {
      nextState: state,
      event: null,
    };
  }

  const serial = state.totalRandomEventCount;
  const stayUpSanChange = getActualResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport, state.buffs);
  const stayUpSanSummary = formatResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport, state.buffs);
  const stayUpSanNarrative = getResearchMiscSanNarrative(-6, state.player.research);
  const event: PendingEvent = {
    id: `random-16-y${state.year}-m${state.month}-n${serial}`,
    title: "数据丢失",
    description: "电脑突然读不出科研文件。你连着点了几次，弹出的还是同一个报错😵；再看备份日期，才发现少了最近这一批。",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-16",
    stage: "act1",
    choices: [
      {
        id: `random-16-stay-up-${serial}`,
        label: "熬夜补数据",
        outcome: `${stayUpSanSummary}；论文进度保留。`,
        effects: {
          san: stayUpSanChange,
        },
      },
      {
        id: `random-16-restart-${serial}`,
        label: "从头再来",
        outcome: "所有未投稿论文进度清零。",
        effects: {
          clearDraftProgress: true,
        },
      },
      {
        id: `random-16-pay-${serial}`,
        label: "花钱恢复",
        outcome: "金币 -4，论文进度保留。",
        effects: {
          money: -4,
        },
      },
      {
        id: `random-16-fake-${serial}`,
        label: "伪造数据",
        outcome: "当前未投稿且已有进度的论文，未来引用 ×0.5。",
        effects: {
          draftCitationDebuffMultiplier: 0.5,
        },
      },
    ],
  };
  const stagedEvent = createThreeStageRandomEvent(event, {
    introDescription: [
      "你打开 **自己的电脑**，准备接着做手头的论文，科研文件却怎么也读不出来。重启一次，报错还在原地。",
      "你把电脑和移动硬盘里的备份挨个点开。那些叫着“最新”“最终”的文件，日期却一个比一个早，偏偏少了最近这一批。",
    ].join("\n\n"),
    decisionTitle: "如何应对",
    decisionDescription: [
      "你从抽屉里翻出旧笔记，按日期摊在桌上。一页页补回去，今晚的觉就别想了；可这些都是还没投稿的心血，真要全部从头来，你连新建文件夹都不愿点。",
      "数据恢复团队回了报价：4 金币。你打开余额又关上，目光落回缺失的记录，甚至冒出拿几个编造的数字填上的念头。想到今后要把这些数字写进论文，你的手又停了下来。",
    ].join("\n\n"),
    results: {
      [`random-16-stay-up-${serial}`]: {
        title: "熬夜恢复",
        description: [
          "你对着旧笔记和零散备份，一点点补回丢失的内容。夜里走廊的灯灭了，屏幕上还有文件在保存。",
          "已有进度总算补齐。最后一份保存成功后，你又复制了一份，亲眼看着备份进度条走到头，才敢合上电脑。",
          ...(stayUpSanNarrative ? [stayUpSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-16-restart-${serial}`]: {
        title: "重新开始",
        description: [
          "你关掉恢复失败的窗口，把所有未投稿论文重新建档。面对空白文档，你把还记得的内容写了几行，又停下来找笔记。",
          "手头这批工作得从头做了。这回新建文件夹时，你先建了一个备份目录。",
        ].join("\n\n"),
      },
      [`random-16-pay-${serial}`]: {
        title: "数据找回",
        description: [
          "你联系了数据恢复团队，把硬盘送去检查。等回复的工夫，你几次点开聊天窗口，又实在没什么新问题可问。",
          "关键文件终于被找了回来。你挨个打开确认，看到熟悉的内容才松了口气；付完账，把备份也一并做好了。",
        ].join("\n\n"),
      },
      [`random-16-fake-${serial}`]: {
        title: "留下隐患",
        description: [
          "你用编造的数据填上空缺，把文件保存下来。再打开时，缺失的地方已经补齐，原始记录却仍是一片空白。",
          "这些内容没有真实实验支撑，即使写进论文，也经不起后来的核验与引用。光标停在保存按钮上，你迟迟没有关掉窗口。",
        ].join("\n\n"),
      },
    },
  });

  return {
    nextState: state,
    event: stagedEvent,
  };
}

export function createLearningRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const basicGain = state.player.research < 6 ? 1 : 0;
  const basicResearchResult = basicGain > 0
    ? null
    : applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const basicOutcome = basicGain > 0
    ? "科研 < 6｜科研上限 +1。"
    : `科研 ≥ 6｜${formatTierResistedOutcome("科研", 1, basicResearchResult!)}。`;

  const event: PendingEvent = {
    id: `random-9-y${state.year}-m${state.month}-n${serial}`,
    title: "不断学习",
    description: "讨论时又碰上几个似懂非懂的概念。你回去打开收藏夹，才发现上次存下的教程还停在第一页😅。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-9",
    stage: "act1",
    choices: [
      {
        id: `random-9-basic-${serial}`,
        label: "基础知识",
        outcome: basicOutcome,
        effects: {
          ...(basicGain > 0
            ? { researchCapacityStateDeltas: { baseCap: 1 } }
            : basicResearchResult && basicResearchResult.effectiveChange > 0
              ? { research: basicResearchResult.effectiveChange }
              : {}),
        },
      },
      {
        id: `random-9-tech-${serial}`,
        label: "最新技术",
        outcome: "永久想 idea +1。",
        effects: {
          ideaBonus: 1,
        },
      },
      {
        id: `random-9-code-${serial}`,
        label: "代码知识",
        outcome: "永久实验 +1。",
        effects: {
          experimentBonus: 1,
        },
      },
      {
        id: `random-9-theory-${serial}`,
        label: "深奥理论",
        outcome: "永久写作 +1。",
        effects: {
          writingBonus: 1,
        },
      },
    ],
  };

  const basicResearchNarrative = basicResearchResult
    ? getTierResistedNarrative("科研", 1, basicResearchResult)
    : "";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "讨论时，大家顺着一个概念往下说，你还在笔记角落悄悄给它画问号。散会后翻一翻，问号比记下的结论还醒目。",
      "回去打开收藏夹，基础教材、前沿论文和代码教程排得整整齐齐。上次保存时觉得自己马上就会看，如今网页还停在第一页。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "你把笔记翻到画着问号的那一页，教材里正好有对应的章节。手刚搭上鼠标，又看见那篇没读完的新论文；摘要里的思路很有意思，刚才散会时你还在琢磨。",
      "代码教程停在熟悉的报错附近，理论讲义里还有一行看不懂的推导。想学的东西越摆越多，空白笔记却一个字没添。你把手机翻面放好，今晚先弄懂一样也好。",
    ].join("\n\n"),
    results: {
      [`random-9-basic-${serial}`]: {
        title: "基础学习",
        description: basicGain > 0
          ? [
              "你重新翻开基础教材，从以前划着“略”的推导开始补。例题做错了两次，才发现问题就出在自己一直懒得查的定义里。",
              "再读相关文献，几个原本只能背结论的地方终于接得上了。你在那页笔记旁补了个页码，以后往下学，至少知道该回哪里找。",
            ].join("\n\n")
          : [
              "你挑出教材里几处容易忽略的假设，盖住答案，重新推了一遍。大部分步骤已经熟悉，笔尖仍在几处条件上停了停。",
              "合上书前，你在页边补了几句提醒。下次再碰到这些结论，就不用对着“显然可得”猜半天了。",
              ...(basicResearchNarrative ? [basicResearchNarrative] : []),
            ].join("\n\n"),
      },
      [`random-9-tech-${serial}`]: {
        title: "技术深挖",
        description: [
          "你沿着几篇新论文的引用一路读下去，浏览器的标签页越开越多。原本只想看个摘要，连作者放出的代码都翻了起来。",
          "几种方法摆在一起，终于看出还能从哪里试一试。你把疑问和改法记下来，这回收藏夹之外，总算留下了自己的想法。",
        ].join("\n\n"),
      },
      [`random-9-code-${serial}`]: {
        title: "读源码",
        description: [
          "你找来一份公开的实验代码，开着调试器逐步往下走。那个以前见了就想复制去搜索的报错，这次终于看懂了来处。",
          "顺手把重复操作整理成脚本，容易填错的参数也加了检查。下一次做实验，至少不用再靠多按几遍运行碰运气。",
        ].join("\n\n"),
      },
      [`random-9-theory-${serial}`]: {
        title: "理论推导",
        description: [
          "你挑了一章总是绕着走的理论，从符号定义开始逐行推。草稿纸铺了半张桌子，才发现前面有个下标一直看反了。",
          "推到第三遍，几行公式终于连上了。你试着用自己的话写下推导理由，这次不必再靠一句“由此可知”含糊带过。",
        ].join("\n\n"),
      },
    },
  });
}

export function createCoreProgressRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } | null {
  if (eventId === 9) {
    return { nextState: state, event: createLearningRandomEvent(state, getRoll) };
  }
  if (eventId === 16) {
    return createDataLossRandomEvent(state);
  }
  return null;
}
