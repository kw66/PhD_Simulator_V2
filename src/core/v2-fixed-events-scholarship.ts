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
      ? "你稳稳进入名单，忍不住把通知又看了一遍。攒下来的成果，这回总算能帮钱包缓口气。"
      : diff >= 1
        ? "你在名单里找到自己的名字，先松了一口气，又把获奖通知存好。这阵子反复核材料，总算没有白忙。"
        : "你刚好踩线入选，把名字和分数来回核了两遍才敢相信。刚才还悬着的心，总算落回了肚子里。";
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
    ? "你盯着那一点差距看了好一会儿，心里难免不甘。没获奖的成果仍能继续累计，这次不用从头攒起。"
    : diff <= 3
      ? "你把通知和自己的材料对照了一遍，确认不是漏算了成果。虽然没能入选，已有的积累还在。"
      : "你关掉通知，把申报材料归档。差距摆在眼前，难免泄气；好在没获奖的成果还能继续累计。";

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
  ];
  let finalThought = "提交回执已存好。你心里有些期待，但还是等正式名单出来再说。";
  let label = "等待结果";

  if (diff >= 1 && diff < 3) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。${estimateText}，你又核了一遍，确认没有重复申报。`,
    ];
    finalThought = "你保存好提交回执，暂时关掉申报页面，等学院公布名单。";
  } else if (diff === 0) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。${estimateText}，你在估分表上圈出自己的分数。`,
    ];
    finalThought = "你盯着提交成功的页面看了一会儿，仍拿不准今年会不会更难入选。";
    label = "继续等待";
  } else if (diff < 0 && diff >= -2) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。${estimateText}，你有些忐忑，又检查了一遍材料。`,
    ];
    finalThought = "材料已经交了，你仍想等到正式名单出来再下结论。";
    label = "继续等待";
  } else if (diff < -2) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。${estimateText}，光凭往年的范围还猜不出结果。`,
    ];
    finalThought = "你保存好提交回执。即使这次没选上，未用于获奖的成果也能继续累计。";
    label = "继续等待";
  }

  return createFixedEvent({
    id: `scholarship-score-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 自己估分",
    description: [
      "你核过已发表论文和往次获奖记录，把申报材料逐项对齐。",
      ...innerThoughts,
      finalThought,
    ].join("\n\n"),
    chainId: "scholarship",
    stage: "act2",
    choices: [
      {
        id: `scholarship-wait-y${context.year}-m${context.month}`,
        label,
        outcome: success ? "估分结果已记下，等待正式名单。" : "材料已提交，等待正式名单。",
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
      `晚上十点，你收到学院系统推送的“国奖评选启动”通知。本轮评选中，${getScholarshipGradeLabel(state)}共有 5 个名额，按科研积分排名。`,
      `${estimateText}，具体门槛要等名单公布才知道。已经用于获奖的论文不能再次计入。`,
      "你可以准备材料申报，也可以暂不参加，保留目前的积累。",
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
