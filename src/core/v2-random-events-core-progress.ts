import {
  createThreeStageEvent,
  drawInclusiveInt,
  hasRecoverableDraftPaper,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import type { GameState, PendingEvent } from "./v2-types";

const LEARNING_LATEST_TOPICS = [
  { title: "多模态大模型的理解与推理", detail: "比较视觉编码、跨模态对齐和推理阶段的设计" },
  { title: "高效注意力与长上下文", detail: "从 IO 复杂度、KV cache 和上下文压缩入手看效率问题" },
  { title: "状态空间模型与序列建模", detail: "理解状态空间模型如何处理长序列，以及它和注意力机制的差异" },
  { title: "扩散模型与流式生成", detail: "比较噪声预测、速度场和条件控制在生成过程中的作用" },
  { title: "智能体的工具调用与训练", detail: "关注规划、工具使用、环境反馈和长期任务执行" },
] as const;

const LEARNING_CODE_PROJECTS = [
  { name: "Qwen3", detail: "tokenizer、attention 模块和推理入口" },
  { name: "DeepSeek-R1", detail: "训练配置、RL 数据管线和推理脚本" },
  { name: "vLLM", detail: "PagedAttention、KV cache 和 continuous batching" },
  { name: "SGLang", detail: "RadixAttention、结构化生成和长上下文调度" },
  { name: "OpenHands", detail: "agent loop、工具调用和沙箱执行" },
  { name: "SWE-agent", detail: "issue 解析、代码修改和自动测试" },
] as const;

const LEARNING_THEORY_TOPICS = [
  { title: "PAC-Bayes 泛化界", detail: "把先验、后验和 KL 散度放进同一条界里讨论泛化" },
  { title: "Neural Tangent Kernel", detail: "在无限宽网络极限里看梯度下降怎样变成核回归" },
  { title: "最优传输与 Schrödinger Bridge", detail: "分布之间怎样运输：从 Wasserstein 距离一直讲到熵正则化路径" },
  { title: "Conformal Prediction", detail: "不依赖具体分布假设地构造预测区间" },
  { title: "信息瓶颈与表示学习", detail: "在保留任务信息和压缩输入之间做取舍" },
] as const;

const LATIN_EDGE = /[A-Za-z0-9]/u;

/** Inserts a term into Chinese prose, adding a space only on a side that meets Latin text. */
function spaced(term: string, side: "both" | "before" | "after" = "both"): string {
  const before = side !== "after" && LATIN_EDGE.test(term[0] ?? "") ? " " : "";
  const after = side !== "before" && LATIN_EDGE.test(term.at(-1) ?? "") ? " " : "";
  return `${before}${term}${after}`;
}

export function createDataLossRandomEvent(state: GameState): { nextState: GameState; event: PendingEvent | null } {
  if (!hasRecoverableDraftPaper(state)) {
    return {
      nextState: state,
      event: null,
    };
  }

  const serial = state.totalRandomEventCount;
  const stayUpBaseSanChange = -5;
  const recoveryMoneyCost = 3;
  const stayUpSanChange = getActualResearchMiscSanChange(stayUpBaseSanChange, state.player.research, state.month, state.eventSupport, state.buffs);
  const stayUpSanSummary = formatResearchMiscSanChange(stayUpBaseSanChange, state.player.research, state.month, state.eventSupport, state.buffs);
  const introDescription = [
    "最近电脑总是烫手，风扇却时转时停。你怀疑风扇坏了，又想着“等这轮忙完再说”，顺手把电脑垫高了一点，接着赶论文。",
    "今天打开自己的电脑，科研文件却怎么也读不出来，重启也没用。你赶紧翻出备份，那些叫着“最新”“最终”的文件，日期却一个比一个早，偏偏少了最近这一批。",
  ].join("\n\n");
  const event: PendingEvent = {
    id: `random-16-y${state.year}-m${state.month}-n${serial}`,
    title: "数据丢失",
    description: introDescription,
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
        outcome: "论文进度清0。",
        effects: {
          clearDraftProgress: true,
        },
      },
      {
        id: `random-16-pay-${serial}`,
        label: "花钱恢复",
        outcome: `金币 -${recoveryMoneyCost}；论文进度保留。`,
        effects: {
          money: -recoveryMoneyCost,
        },
      },
      {
        id: `random-16-fake-${serial}`,
        label: "伪造数据",
        outcome: "论文进度保留；符合条件的未投稿一作论文引用 ×0.5；图片误用。",
        effects: {
          draftCitationDebuffMultiplier: 0.5,
          markDraftImageMisuse: true,
        },
      },
    ],
  };
  const stagedEvent = createThreeStageEvent(event, {
    introDescription,
    decisionTitle: "如何应对",
    decisionDescription: [
      "你从抽屉里翻出旧笔记，按日期摊在桌上。一页页补回去，今晚的觉就别想了；可这些都是还没投稿的心血，真要全部从头来，你连新建文件夹都不愿点。",
      `数据恢复团队回了报价：${recoveryMoneyCost} 金币。你打开余额又关上，鼠标却停在了 PS 图标上。旧文件里还剩几张结果图，修修补补，似乎也能把缺的部分凑齐。你盯了一会儿，手还没按下去。`,
    ].join("\n\n"),
    results: {
      [`random-16-stay-up-${serial}`]: {
        title: "熬夜恢复",
        description: [
          "你对着旧笔记和零散备份，一点点补回丢失的内容。夜里走廊的灯灭了，屏幕上还有文件在保存。",
          "已有进度总算补齐。最后一份保存成功后，你又复制了一份，亲眼看着备份进度条走到头，才敢合上电脑。",
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
        title: "图片补齐",
        description: [
          "你打开 PS，把旧文件里的结果图修修补补，凑齐缺失的几张，再塞回论文。导出的页面看着挺像那么回事，连自己都差点信了。",
          "保存好文件，你把 PS 关掉，打算不再细想。论文是能接着写了，只是那些处理过的图片还在里面。你安慰自己：这么一点细节，总不至于被人翻出来吧。",
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
  const latestTopic = LEARNING_LATEST_TOPICS[
    drawInclusiveInt(0, LEARNING_LATEST_TOPICS.length - 1, getRoll)
  ]!;
  const codeProject = LEARNING_CODE_PROJECTS[
    drawInclusiveInt(0, LEARNING_CODE_PROJECTS.length - 1, getRoll)
  ]!;
  const theoryTopic = LEARNING_THEORY_TOPICS[
    drawInclusiveInt(0, LEARNING_THEORY_TOPICS.length - 1, getRoll)
  ]!;

  const event: PendingEvent = {
    id: `random-9-y${state.year}-m${state.month}-n${serial}`,
    title: "不断学习",
    description: "手头的论文刚忙完一轮，想 idea、做实验、写论文、投稿的循环暂时停了一格。难得有点空闲，你想静下心学一会儿，却发现自己已经很久没有完整读完一段材料了😅。",
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

  return createThreeStageEvent(event, {
    introDescription: [
      "手头的实验刚告一段落，你本想休息一晚，却盯着收藏夹发起了呆。想 idea、做实验、写论文、投稿，日子被这四步推着走；上次静下心学习，已经不记得是什么时候了。",
      "你决定今晚先不赶进度。B站的《跟李沐学 AI》、arXiv 论文、开源项目和总没啃懂的理论摆在眼前，至少先看完一样。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `收藏夹里同时开着《跟李沐学 AI》、${codeProject.name} 的源码、${spaced(theoryTopic.title, "after")}的推导和一篇关于${spaced(latestTopic.title)}的最新 arXiv 论文。每一样都像是“再看一会儿就能懂”，可今晚只能选一个。`,
      "你把手机翻面，先看着这些页面发了会儿呆。基础、最新技术、代码和理论各有各的吸引力，也各有一处让你不敢轻易跳过。",
    ].join("\n\n"),
    results: {
      [`random-9-basic-${serial}`]: {
        title: "基础学习",
        description: basicGain > 0
          ? [
              "你继续看《跟李沐学 AI》，从线性回归、反向传播一路补到自己的课题。视频里的公式和代码能跟上，轮到解释每一步为什么这样写，还是会卡。",
              "你把关键公式和代码片段记在自己的课题旁，几个原本只能背结论的地方终于接得上了。以后再遇到它们，至少知道该从哪里重新推起。",
            ].join("\n\n")
          : [
              "你继续看《跟李沐学 AI》，回看一个从损失到梯度的推导。大部分步骤已经熟悉，笔尖仍在几处条件上停了停：熟悉结论，和能从头讲清，终究不是一回事。",
              "暂停视频，你把推导理由和代码里的对应位置记在笔记上。下次再遇到这一步，就不用只凭印象往下讲了。",
            ].join("\n\n"),
      },
      [`random-9-tech-${serial}`]: {
        title: "技术深挖",
        description: [
          `你在 arXiv 翻开几篇关于“${latestTopic.title}”的最新论文，从摘要读到方法和消融实验，${latestTopic.detail}。原本只想看个摘要，最后连作者放出的实现也一起翻了起来。`,
          "几种方法摆在一起，你终于看出还能从哪里试一试。你把疑问和改法记下来，这回收藏夹之外，总算留下了自己的想法。",
        ].join("\n\n"),
      },
      [`random-9-code-${serial}`]: {
        title: "读源码",
        description: [
          `你打开 ${codeProject.name} 的公开源码，顺着${spaced(codeProject.detail)}往下读。那个以前见了就想复制去搜索的报错，这次终于看懂了来处。`,
          "顺手把重复操作整理成脚本，容易填错的参数也加了检查。下一次做实验，至少不用再靠多按几遍运行碰运气。",
        ].join("\n\n"),
      },
      [`random-9-theory-${serial}`]: {
        title: "理论推导",
        description: [
          `你挑出${spaced(theoryTopic.title, "before")}，从符号定义开始逐行推。它讲的是${theoryTopic.detail}。草稿纸铺了半张桌子，你才发现前面有个下标一直看反了。`,
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
