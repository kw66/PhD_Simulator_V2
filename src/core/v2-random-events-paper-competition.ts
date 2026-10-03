import {
  formatPaperCompetitionOutcome,
  getPaperCompetitionCandidates,
  type PaperCompetitionEventId,
  type PaperCompetitionResolution,
} from "./v2-paper-competition";
import {
  createRandomEventSkeleton,
  createThreeStageEvent,
  drawInclusiveInt,
  type RandomEventResultCopy,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";
import { refreshPaperCompetitionEvent } from "./v2-paper-competition-preview";

interface PaperCompetitionBranch extends RandomEventResultCopy {
  id: string;
  label: string;
  multiplier: number;
  sanCost: number;
}

interface PaperCompetitionCopy {
  title: string;
  introButton: string;
  introDescription: (title: string) => string;
  decisionDescription: string;
  branches: PaperCompetitionBranch[];
}

const PAPER_COMPETITION_COPY: Record<PaperCompetitionEventId, PaperCompetitionCopy> = {
  17: {
    title: "被抢发idea",
    introButton: "对照看看",
    introDescription: (title) => [
      `你照例刷 arXiv，一篇新论文的题目让你停住了：怎么和自己正在做的《${title}》这么像？点开摘要，再往下翻，连研究动机和方法设计都撞得八九不离十。`,
      "你把对方论文和自己的草稿并排放好，又看了一眼提交日期。几处当初想通时恨不得立刻找人聊聊的设计，已经出现在了别人的论文里。原本只是想看看今天有什么新工作，结果看到了自己的工作。",
    ].join("\n\n"),
    decisionDescription: [
      "你用力圈出两边的差别，草稿上的“首次提出”格外扎眼。明明是自己一点点想出来的，现在却得先解释和别人有什么不同。",
      "鼠标移到关闭按钮，你又舍不得就这么算了。笔记里还有几个设想，有的能接上原方案，有的得整套重画。脑子里已经开始推演，手却还压着那份旧稿。",
    ].join("\n\n"),
    branches: [
      {
        id: "ignore",
        label: "装作不知道",
        multiplier: 0.25,
        sanCost: 0,
        title: "原稿照旧",
        description: [
          "你关掉新论文，照着原来的思路继续。选题笔记一字没改，只是再读到那几个贡献点时，眼前总浮现出刚才的摘要。",
          "对方已把相近的想法公开，原来的新意所剩不多。你没有再点开那个页面，浏览器却还记着访问过的颜色。",
        ].join("\n\n"),
      },
      {
        id: "differentiate",
        label: "狡辩二者不同",
        multiplier: 0.5,
        sanCost: 1,
        title: "强调差异",
        description: [
          "你在相关工作里加了一段对比，从问题设定列到实现细节。几个以前一句话就带过的区别，这次各自占了一整行，删改得比方法本身还仔细。",
          "两项工作的边界总算清楚了些，核心思路却还是靠得很近。你又读了一遍，留下能说清的差别，把几句写得太满的话删了。",
        ].join("\n\n"),
      },
      {
        id: "minor",
        label: "小幅修改",
        multiplier: 1,
        sanCost: 2,
        title: "换个切入点",
        description: [
          "你翻回选题时的笔记，找出一个被搁在角落的问题，重新调整切入点。原有框架还用得上，写到一半的论证却得重新梳理。",
          "修改后的方案保住了原来的想法，重点也和对方错开了些。你划掉笔记里原来的研究动机，在旁边挤下新的方案表述，字写得有点小，总算放得下。",
        ].join("\n\n"),
      },
      {
        id: "major",
        label: "大幅修改",
        multiplier: 1.25,
        sanCost: 4,
        title: "接着往前走",
        description: [
          "你压下郁闷，把对方的方法从头细读了一遍。一处设计给了你启发，正好能补上自己方案里的短板。你翻出草稿，沿着这个思路继续推，旧框架被改了好几处。",
          "折腾过后，新方案比原来又向前走了一步。你补上新的论证，也在参考文献里记下对方的论文。原本是来找自己被抢了多少，最后倒带着一个更好的想法回去了。",
        ].join("\n\n"),
      },
    ],
  },
  18: {
    title: "新sota",
    introButton: "核对结果",
    introDescription: (title) => [
      `你整理《${title}》的实验结果时，刷到一篇刷新性能纪录的新论文。你先看数据划分，再看评价指标和测试设置，来回翻了几遍，对方的结果确实更好。`,
      "新数字填进对照表，原来的加粗就得挪位置了。你把光标停在那一格，迟迟没按下删除键。",
    ].join("\n\n"),
    decisionDescription: [
      "你放大表格，找自己占优的数字，翻了一屏才停住。目光绕开落后的几列，刚写好的“显著优于”却尤其扎眼。",
      "对方有个设计值得试试，你翻回代码，找到一处能先改的地方。继续深挖，整套方案都得再过一遍。想到又要守着日志等结果，你叹了口气，还是没舍得关掉代码。",
    ].join("\n\n"),
    branches: [
      {
        id: "ignore",
        label: "装作不知道",
        multiplier: 0.25,
        sanCost: 0,
        title: "旧表照用",
        description: [
          "你没有把新方法加入表格，已有数字和加粗一并保留。导出的页面很熟悉，和昨天几乎没有区别。",
          "可再读实验分析，几句强调优势的话已经没那么站得住。那篇新论文还躺在下载文件夹里，你把窗口最小化，接着往下写。",
        ].join("\n\n"),
      },
      {
        id: "selective",
        label: "选择性对比",
        multiplier: 0.5,
        sanCost: 1,
        title: "挑着展示",
        description: [
          "你逐项筛选结果，把不利于自己的对比撤了下来。表格短了一截，再排版时，页面也宽松了不少。",
          "留下的数字还能撑起一部分论证，却解释不了被删掉的差距。你看着精简后的表格，知道它已经不是完整的比较。",
        ].join("\n\n"),
      },
      {
        id: "minor",
        label: "小幅修改",
        multiplier: 0.75,
        sanCost: 3,
        title: "局部改进",
        description: [
          "你对照新方法检查方案，改掉拖后腿的模块，重新跑了一轮实验。日志刷了一夜，你隔一阵就点回来看看。",
          "几项结果终于往上挪了挪，差距追回了一部分。你更新了表格，保留下大部分实验工作的价值；最好的数字仍在别人的那一行。",
        ].join("\n\n"),
      },
      {
        id: "major",
        label: "大幅修改",
        multiplier: 1.25,
        sanCost: 6,
        title: "结合新方法",
        description: [
          "你拆解并复现对方的方法，把有用的设计结合进自己的方案。改结构、补对比，排期上刚腾出来的空格又被填满了。",
          "几轮验证后，结果比自己的原有水平更好了，改进的来处也有了对照。你把日志和表格放在一起核了最后一遍，终于能关掉几个熬夜时一直开着的窗口。",
        ].join("\n\n"),
      },
    ],
  },
};

export function createPaperCompetitionRandomEvent(
  eventId: PaperCompetitionEventId,
  state: GameState,
  getRoll: () => number,
): PendingEvent | null {
  const candidates = getPaperCompetitionCandidates(state, eventId);
  if (candidates.length === 0) return null;
  const paper = candidates[drawInclusiveInt(0, candidates.length - 1, getRoll)];
  if (!paper) return null;

  const copy = PAPER_COMPETITION_COPY[eventId];
  const serial = state.totalRandomEventCount;
  const resolutions = new Map<string, PaperCompetitionResolution>();
  const results: Record<string, RandomEventResultCopy> = {};
  const event: PendingEvent = {
    ...createRandomEventSkeleton(eventId, state),
    title: copy.title,
    paperCompetitionTargetId: paper.id,
    choices: copy.branches.map((branch) => {
      const choiceId = `random-${eventId}-${branch.id}-${serial}`;
      const resolution: PaperCompetitionResolution = {
        paperId: paper.id,
        field: eventId === 17 ? "idea" : "experiment",
        multiplier: branch.multiplier,
        sanCost: branch.sanCost,
      };
      resolutions.set(choiceId, resolution);
      results[choiceId] = { title: branch.title, description: branch.description };
      return {
        id: choiceId,
        label: branch.label,
        outcome: formatPaperCompetitionOutcome(paper, resolution),
        effects: {},
      };
    }),
  };
  const stagedEvent = createThreeStageEvent(event, {
    introDescription: copy.introDescription(paper.title),
    decisionTitle: "如何应对",
    decisionDescription: `${copy.decisionDescription}\n\n涉及论文：**《${paper.title}》**`,
    results,
  });

  for (const introChoice of stagedEvent.choices) {
    introChoice.label = copy.introButton;
    for (const decisionEvent of introChoice.effects.enqueueEvents ?? []) {
      for (const decisionChoice of decisionEvent.choices) {
        const resolution = resolutions.get(decisionChoice.id);
        if (!resolution) continue;
        for (const resultEvent of decisionChoice.effects.enqueueEvents ?? []) {
          resultEvent.paperCompetitionTargetId = paper.id;
          resultEvent.paperCompetitionResult = {
            description: results[decisionChoice.id]!.description,
            choiceLabel: decisionChoice.label,
            paperTitle: paper.title,
          };
          for (const finishChoice of resultEvent.choices) {
            finishChoice.outcome = decisionChoice.outcome;
            finishChoice.effects = { paperCompetitionResolution: resolution };
          }
        }
      }
    }
  }

  return refreshPaperCompetitionEvent(state, stagedEvent);
}
