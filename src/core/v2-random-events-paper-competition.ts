import {
  formatPaperCompetitionOutcome,
  getPaperCompetitionCandidates,
  type PaperCompetitionEventId,
  type PaperCompetitionResolution,
} from "./v2-paper-competition";
import {
  createRandomEventSkeleton,
  createThreeStageRandomEvent,
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
      `你刷到一篇刚公开的论文，读着摘要，越看越像自己的选题笔记。翻到方法部分，对方的切入点和关键设计，竟然都和《${title}》撞上了。`,
      "你把两个窗口并排放好，又看了一眼公开日期。几处当初想通时恨不得立刻找人聊聊的设计，已经出现在了别人的论文里。",
    ].join("\n\n"),
    decisionDescription: [
      "对照笔记上既有相同点，也有几处差别。你很想把后者圈得再大一点，可看着核心思路，原来那句“首次提出”已经不太写得出口。",
      "关掉页面最省事，逐条强调区别也还能保住些新意。若要改方案，小改尚能沿用原来的框架，大改就得再花一番心力；你把笔挪到空白处，迟迟没有落下。",
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
        multiplier: 0.75,
        sanCost: 3,
        title: "换个切入点",
        description: [
          "你翻回选题时的笔记，找出一个被搁在角落的问题，重新调整切入点。原有框架还用得上，写到一半的论证却得重新梳理。",
          "修改后的方案保住了大部分想法，重点也和对方错开了些。你划掉笔记里原来的研究动机，在旁边挤下新的方案表述，字写得有点小，总算放得下。",
        ].join("\n\n"),
      },
      {
        id: "major",
        label: "大幅修改",
        multiplier: 1.25,
        sanCost: 6,
        title: "接着往前走",
        description: [
          "你从头细读对方的方法，把有用的设计和没解决的问题分别记下。旧方案被划了好几道，空白纸铺开，连箭头都重新画了一遍。",
          "折腾过后，新方案比原先多走了一步。你在参考文献里记下对方的论文，又在旁边写了几行自己的改法，这次终于不只是圈出相同之处。",
        ].join("\n\n"),
      },
    ],
  },
  18: {
    title: "新SOTA",
    introButton: "核对结果",
    introDescription: (title) => [
      `你整理《${title}》的实验结果时，刷到一篇刷新性能纪录的新论文。你先看数据划分，再看评价指标和测试设置，来回翻了几遍，对方的结果确实更好。`,
      "新数字填进对照表，原来的加粗就得挪位置了。你把光标停在那一格，桌上的水已经凉了。",
    ].join("\n\n"),
    decisionDescription: [
      "你放大表格，逐项找还能拿来比较的地方。沿用旧表最省力，挑着展示也许能让差距不那么显眼，可完整结果就摆在另一个窗口里。",
      "要追回差距，就得重新改方法、跑实验。小改可以先动最薄弱的一处，大改则要把整体方案再过一遍；你翻开排期，估量还得搭进去多少精力。",
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
  const stagedEvent = createThreeStageRandomEvent(event, {
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
