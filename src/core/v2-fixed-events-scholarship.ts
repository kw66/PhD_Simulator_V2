import {
  appendMechanismSettlement,
  createFixedEvent,
  drawInclusiveInt,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { formatActualSanChange, getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

interface ScholarshipOutcomeContext {
  year: number;
  month: number;
  score: number;
  requirement: number;
  reward: number;
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
      ? "你在名单里找到自己的名字，截了张图，又点开确认一遍。刚才还嫌通知太多，这一条倒是舍不得划掉。"
      : diff >= 1
        ? "你找到自己的名字，才松开一直攥着鼠标的手。申报文件夹里又多了一份通知，这次不用改格式，也不用补附件了。"
        : "你把名字和分数来回核了两遍，刚好踩线。截完图还不放心，又放大看了一眼，生怕自己高兴得太早，看错了行。";
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
    ? "你把分数又加了一遍，还是差那一点。计算器关了又打开，也算不出另一种结果。没用于获奖的成果能继续累计，只是眼下还不太甘心。"
    : diff <= 3
      ? "你逐项核了一遍材料，没有漏算。申报页面停了好一会儿，最后还是关掉了；文件留在原处，未用于获奖的成果可以继续累计。"
      : "你看着分数线，原本准备好的安慰自己的话，一时也没想起来。申报材料先收进文件夹，未用于获奖的成果仍能累计，下次再用得上。";

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
  let innerThoughts = [
    `你把这次能计入的成果算了一遍，共 ${context.score} 分。积累比往年获奖材料充实不少，心里总算有了底。`,
  ];
  let finalThought = "你保存好回执，已经有点想把好消息告诉家里。手指停在聊天框上，还是决定等名单出了再说。";
  let label = "等待结果";

  if (diff >= 1 && diff < 3) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。对照往年的获奖材料，你觉得有些把握，又核了一遍，确认没有重复申报。`,
    ];
    finalThought = "回执存进文件夹，你已经在心里列起了购物清单。刚列到第二件，赶紧把自己叫停：名单还没出呢，钱倒先花上了。";
  } else if (diff === 0) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。和往年的获奖材料比起来，你像是刚好够得着，却没有多少余裕。`,
    ];
    finalThought = "你盯着“提交成功”看了一会儿。这四个字只管材料交没交上，可惜不管今年到底够不够分。";
    label = "继续等待";
  } else if (diff < 0 && diff >= -2) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。翻过往年的获奖材料，你总觉得还差一点，又检查了一遍有没有漏填的成果。`,
    ];
    finalThought = "你把回执存好，又忍不住翻了一次往年的通知。材料已经交了，先别急着替评审把自己划掉。";
    label = "继续等待";
  } else if (diff < -2) {
    innerThoughts = [
      `这次能计入 ${context.score} 分。对照往年的获奖材料，手头的积累还显得单薄，这回恐怕不太乐观。`,
    ];
    finalThought = "你把回执和申报表放在一起，免得下回又到处找。未用于获奖的成果可以继续累计，这次先等正式消息。";
    label = "继续等待";
  }

  return createFixedEvent({
    id: `scholarship-score-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 自己估分",
    description: [
      `你按申报清单逐项核对，连文件名里的空格都检查了一遍。${innerThoughts.join("")}`,
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
  const applicationSanChange = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  const requirement = getScholarshipRequirement(state.year, getRoll);
  const reward = getScholarshipReward(state.year);
  const scoreBaseline = state.scholarshipState.scoreBaseline;
  const eligiblePaperIds = getEligiblePublishedPaperIds(state);
  const context = {
    year: state.year,
    month: state.month,
    score: Math.max(0, state.totalResearchScore - scoreBaseline),
    requirement,
    reward,
    scoreBaseline,
    eligiblePaperIds,
  };
  return createFixedEvent({
    id: `scholarship-y${state.year}-m${state.month}`,
    title: "国奖评选",
    description: [
      `晚上十点，你收到学院系统推送的“国奖评选启动”通知。本轮评选中，${getScholarshipGradeLabel(state)}共有 5 个名额，按科研积分排名。你找出往年的获奖材料作参考，今年的结果仍要等正式名单。已经用于获奖的论文不能再次计入。`,
      "通知后面跟着半屏附件，群里很快有人追问格式。" + (context.score > 0
        ? "手里还有没用于获奖的成果，可以整理出来试一试。准备材料要花些精力，暂不申报也能把成果留到以后。"
        : "你翻了一遍成果记录，这次还没有能计入的新积累。现在申报恐怕很难入选，材料也仍要花精力准备。"),
    ].join("\n\n"),
    chainId: "scholarship",
    choices: [
      {
        id: `scholarship-apply-y${state.year}-m${state.month}`,
        label: "准备材料并申报",
        outcome: `准备申报材料，${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}；入选后金币 +${reward}。`,
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
