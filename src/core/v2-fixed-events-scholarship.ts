import {
  appendMechanismSettlement,
  createFixedEvent,
  drawInclusiveInt,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

interface ScholarshipOutcomeContext {
  year: number;
  month: number;
  score: number;
  requirement: number;
  reward: number;
  estimateMin: number;
  estimateMax: number;
  scoreBaseline: number;
  eligiblePaperIds: string[];
  success: boolean;
}

export function getScholarshipRequirement(year: number, getRoll: RandomRollProvider): number {
  if (year <= 2) return 1;
  if (year === 3) return drawInclusiveInt(2, 4, getRoll);
  if (year === 4) return drawInclusiveInt(5, 8, getRoll);
  return drawInclusiveInt(8, 12, getRoll);
}

export function getScholarshipReward(year: number): number {
  return year >= 4 ? 9 : 6;
}

function getScholarshipEstimateRange(year: number): [number, number] {
  if (year <= 2) return [1, 1];
  if (year === 3) return [2, 4];
  if (year === 4) return [5, 8];
  return [8, 12];
}

function getScholarshipGradeLabel(state: Pick<GameState, "year" | "degree" | "phdStartYear">): string {
  const numerals = ["一", "二", "三", "四", "五", "六"] as const;
  if (state.degree === "phd" && state.phdStartYear !== null) {
    const phdYear = Math.max(1, state.year - state.phdStartYear + 1);
    return `博${numerals[phdYear - 1] ?? phdYear}`;
  }
  return `研${numerals[state.year - 1] ?? state.year}`;
}

function getEligiblePublishedPaperIds(state: GameState): string[] {
  const claimed = new Set(state.scholarshipState.claimedPaperIds);
  return [...state.papers, ...state.externalPublications]
    .filter((paper) => paper.status === "published" && paper.nonFirstAuthor !== true && !claimed.has(paper.id))
    .map((paper) => paper.id);
}

function buildScholarshipResultEvent(context: ScholarshipOutcomeContext): PendingEvent {
  if (context.success) {
    const diff = context.score - context.requirement;
    const reaction = diff >= 3
      ? "你稳稳进入名单，这一年的成果终于有了回报。"
      : diff >= 1
        ? "看到名单里自己的名字，你松了一口气。"
        : "你踩线入选，确认了两遍才放下心来。";
    return createFixedEvent({
      id: `scholarship-result-y${context.year}-m${context.month}`,
      title: "国奖评选 ➜ 自己估分 ➜ 获得奖学金",
      description: appendMechanismSettlement([
        "📱 学院通知弹出：“恭喜获得本年度国家奖学金。”",
        `你的科研积分为 ${context.score} 分，分数线为 ${context.requirement} 分。`,
        reaction,
      ].join("\n\n"), `金币 +${context.reward}`),
      chainId: "scholarship",
      stage: "result",
      choices: [
        {
          id: `scholarship-claim-y${context.year}-m${context.month}`,
          label: "收下奖金",
          outcome: `拿到奖学金，金币 +${context.reward}。`,
          effects: {
            money: context.reward,
            scholarshipAward: {
              year: context.year,
              scoreBaseline: context.scoreBaseline + context.score,
              paperIds: context.eligiblePaperIds,
            },
          },
        },
      ],
    });
  }

  const diff = context.requirement - context.score;
  const reaction = diff === 1
    ? "你盯着结果看了几秒，还是有些不甘。"
    : diff <= 3
      ? "差距不算远，明年还有机会。"
      : "你关掉通知，决定下学年早点准备成果。";

  return createFixedEvent({
    id: `scholarship-result-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 自己估分 ➜ 遗憾落选",
    description: [
      "📱 学院通知弹出，你没能进入获奖名单。",
      `你的科研积分为 ${context.score} 分，距离 ${context.requirement} 分的分数线还差 ${diff} 分。`,
      reaction,
    ].join("\n\n"),
    chainId: "scholarship",
    stage: "result",
    choices: [
      {
        id: `scholarship-fail-y${context.year}-m${context.month}`,
        label: "明年再战",
        outcome: "没有获奖，明年再来。",
        effects: {},
      },
    ],
  });
}

function buildScholarshipScoreEvent(context: Omit<ScholarshipOutcomeContext, "success">): PendingEvent {
  const diff = context.score - context.requirement;
  const success = diff >= 0;
  const estimateText = context.estimateMin === context.estimateMax
    ? `往年分数线大约是 ${context.estimateMin} 分`
    : `按往年情况，分数线大约在 ${context.estimateMin}～${context.estimateMax} 分`;
  let innerThoughts = [
    `你把这次能计入的成果算了一遍，共 ${context.score} 分。${estimateText}。`,
    "今年申报的人不少，真正的分数线还得等名单公布。",
  ];
  let finalThought = "你把材料又检查了一遍，剩下的只能等结果。";
  let label = "等待结果";

  if (diff >= 1 && diff < 3) {
    innerThoughts = [
      `这次能计入 ${context.score} 分，按往年情况算是有竞争力。`,
      "不过今年申报的人不少，谁也不敢提前把话说满。",
    ];
    finalThought = "你把申报表又检查了一遍，开始等学院公布名单。";
  } else if (diff === 0) {
    innerThoughts = [
      `这次能计入 ${context.score} 分，正好压在往年的范围边缘。`,
      "只要今年分数线稍微抬高一点，结果就会完全不同。",
    ];
    finalThought = "你盯着提交成功的页面看了一会儿，还是不敢先庆祝。";
    label = "继续等待";
  } else if (diff < 0 && diff >= -2) {
    innerThoughts = [
      `这次能计入 ${context.score} 分，离往年的范围还有一点距离。`,
      "如果今年竞争更激烈，这些成果可能还不够。",
    ];
    finalThought = "材料已经交了，你仍想等到正式名单出来再下结论。";
    label = "继续等待";
  } else if (diff < -2) {
    innerThoughts = [
      `这次能计入 ${context.score} 分，和往年的分数线差得比较远。`,
      "这次大概很难入选，没用上的成果以后还可以继续累计。",
    ];
    finalThought = "你关掉估分表，准备等正式结果出来后继续做下一篇。";
    label = "继续等待";
  }

  return createFixedEvent({
    id: `scholarship-score-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 自己估分",
    description: [
      "你对照学院公布的评分规则，把论文、专利和其他能计入的成果逐项核了一遍。",
      ...innerThoughts,
      finalThought,
    ].join("\n\n"),
    chainId: "scholarship",
    stage: "act2",
    choices: [
      {
        id: `scholarship-wait-y${context.year}-m${context.month}`,
        label,
        outcome: success ? "分数过线，等待名单。" : "分数未过线，等待名单。",
        effects: {
          enqueueEvents: [buildScholarshipResultEvent({ ...context, success })],
        },
      },
    ],
  });
}

export function createScholarshipEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const applicationSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const requirement = getScholarshipRequirement(state.year, getRoll);
  const reward = getScholarshipReward(state.year);
  const [estimateMin, estimateMax] = getScholarshipEstimateRange(state.year);
  const scoreBaseline = state.scholarshipState.scoreBaseline;
  const eligiblePaperIds = getEligiblePublishedPaperIds(state);
  const context = {
    year: state.year,
    month: state.month,
    score: Math.max(0, state.totalResearchScore - scoreBaseline),
    requirement,
    reward,
    estimateMin,
    estimateMax,
    scoreBaseline,
    eligiblePaperIds,
  };
  const estimateText = estimateMin === estimateMax
    ? `往年分数线大约在 ${estimateMin} 分左右`
    : `往年分数线大约在 ${estimateMin}～${estimateMax} 分之间`;

  return createFixedEvent({
    id: `scholarship-y${state.year}-m${state.month}`,
    title: "国奖评选",
    description: [
      "晚上十点，学院系统推送了“国奖评选启动”通知。",
      `本轮评选中，${getScholarshipGradeLabel(state)}共有 5 个名额，按科研积分排名。`,
      `${estimateText}，具体门槛要等名单公布才知道。已经用于获奖的论文不能再次计入。`,
      "你可以现在准备材料申报，也可以先把成果攒到下一年。",
    ].join("\n\n"),
    chainId: "scholarship",
    choices: [
      {
        id: `scholarship-apply-y${state.year}-m${state.month}`,
        label: "准备材料并申报",
        outcome: `准备申报材料，SAN ${applicationSanChange}。`,
        effects: {
          san: applicationSanChange,
          enqueueEvents: [buildScholarshipScoreEvent(context)],
        },
      },
      {
        id: `scholarship-skip-y${state.year}-m${state.month}`,
        label: "暂不申报",
        outcome: "暂不申报，成果留到以后。",
        effects: {},
      },
    ],
  });
}
