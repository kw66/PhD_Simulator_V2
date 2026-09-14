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
      `你刷到一篇刚公开的论文，摘要里的思路让你越看越熟悉。翻到方法部分，对方的切入点和关键设计，竟然都和《${title}》撞上了。`,
      "你打开选题笔记，又核对了一遍公开日期。工作明明是独立做的，但准备强调的创新点，已经被别人先写了出来。",
    ].join("\n\n"),
    decisionDescription: [
      "你把两项工作逐一对照。细节确实有区别，核心思路却很接近，原来的创新性表述需要重新考虑。",
      "是先装作没看见，在相关工作里强调差异，还是花些精力，换个角度继续做下去？",
    ].join("\n\n"),
    branches: [
      {
        id: "ignore",
        label: "装作不知道",
        multiplier: 0.25,
        sanCost: 0,
        title: "原稿照旧",
        description: [
          "你关掉新论文，决定先按原来的思路继续。选题笔记一字没动，那几个熟悉的贡献点也还留在原处。",
          "只是页面关掉了，别人已经做出来的工作并不会消失。原先最有新意的部分，如今已经很难再当作卖点。",
        ].join("\n\n"),
      },
      {
        id: "differentiate",
        label: "狡辩二者不同",
        multiplier: 0.5,
        sanCost: 1,
        title: "强调差异",
        description: [
          "你在相关工作里加了一段对比，从问题设定写到实现细节，逐条强调二者不同。几个平时一笔带过的区别，这次都被认真展开。",
          "改完之后，两项工作的边界清楚了一些，但核心思路依旧接近。措辞能解释差别，却补不回全部新意。",
        ].join("\n\n"),
      },
      {
        id: "minor",
        label: "小幅修改",
        multiplier: 0.75,
        sanCost: 3,
        title: "换个切入点",
        description: [
          "你重新梳理研究动机，从另一个实际问题切入，调整了方法的应用场景和贡献重点。原有框架还能沿用，论证却得重新理一遍。",
          "这番修改保住了大部分想法，也让工作有了自己的着重点。虽然不如最初那么新鲜，总算有了继续推进的理由。",
        ].join("\n\n"),
      },
      {
        id: "major",
        label: "大幅修改",
        multiplier: 1.25,
        sanCost: 6,
        title: "接着往前走",
        description: [
          "你把对方的方法仔细读了一遍，结合其中有用的设计，围绕它尚未解决的问题重新修改方案。原来的几个模块被划掉，笔记里又添了几页新想法。",
          "折腾过后，新方案比原先更进一步。被抢先公开的工作，反倒成了这次改进的起点。",
        ].join("\n\n"),
      },
    ],
  },
  18: {
    title: "新SOTA",
    introButton: "核对结果",
    introDescription: (title) => [
      `你整理《${title}》的实验结果时，发现一篇新论文刷新了性能纪录。你重新核对数据划分、评价指标和测试设置，确认对方的结果确实更好。`,
      "原来的实验数据没有变，对照表里的领先位置却换了人。这回要补上的，不只是相关工作里的一条引用。",
    ].join("\n\n"),
    decisionDescription: [
      "新方法拉开了主要结果的差距，你的方法在部分数据集和指标上仍有优势。怎么组织对比，现在成了绕不开的问题。",
      "是沿用旧表，只挑能比过的结果展示，还是修改方法，重新跑一轮实验？",
    ].join("\n\n"),
    branches: [
      {
        id: "ignore",
        label: "装作不知道",
        multiplier: 0.25,
        sanCost: 0,
        title: "旧表照用",
        description: [
          "你没有加入新方法，继续沿用原来的对比表。已有数字没动，熟悉的加粗结果也都还在。",
          "表格看起来照旧，却少了最有竞争力的参照。那些曾经足以说明优势的结果，如今已经没那么有说服力。",
        ].join("\n\n"),
      },
      {
        id: "selective",
        label: "选择性对比",
        multiplier: 0.5,
        sanCost: 1,
        title: "挑着展示",
        description: [
          "你逐项翻看结果，只展示能胜过对方的数据集和指标，把比不过的部分从对比表里撤掉。删去几列后，自己的方法又显得很有优势。",
          "表格好看了，性能差距却仍然存在。留下来的结果能撑起一部分论证，但已经不是完整的比较。",
        ].join("\n\n"),
      },
      {
        id: "minor",
        label: "小幅修改",
        multiplier: 0.75,
        sanCost: 3,
        title: "局部改进",
        description: [
          "你对照新方法检查自己的方案，修改了拖后腿的模块，重新跑了一轮实验。训练日志刷了一夜，几项结果终于往上挪了挪。",
          "局部改进追回了一部分差距，也保住了大部分实验工作的价值，只是原先的性能优势还没完全找回来。",
        ].join("\n\n"),
      },
      {
        id: "major",
        label: "大幅修改",
        multiplier: 1.25,
        sanCost: 6,
        title: "结合新方法",
        description: [
          "你复现并拆解了对方的方法，把有效的设计结合进自己的方案，重新调整整体结构。改方法、跑对比、补消融，实验排期又被塞满了。",
          "几轮验证之后，新方案的表现超过了原来的版本，改进来自哪里也有了证据。虽然费了不少精力，这次实验确实比之前更扎实。",
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
