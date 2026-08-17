import {
  clamp,
  createFixedEvent,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type { GameState, PendingEvent } from "./v2-types";

interface ScholarshipOutcomeContext {
  year: number;
  month: number;
  score: number;
  requirement: number;
  reward: number;
  success: boolean;
}

function getScholarshipRequirement(year: number, getRoll: RandomRollProvider): number {
  if (year <= 2) return 1;
  const normalized = clamp(0, getRoll(), 0.999999999999);
  if (year === 3) {
    if (normalized < 0.25) return 2;
    if (normalized < 0.75) return 3;
    return 4;
  }
  if (year === 4) {
    if (normalized < 0.15) return 5;
    if (normalized < 0.5) return 6;
    if (normalized < 0.85) return 7;
    return 8;
  }
  if (normalized < 0.1) return 8;
  if (normalized < 0.3) return 9;
  if (normalized < 0.7) return 10;
  if (normalized < 0.9) return 11;
  return 12;
}

function getScholarshipReward(year: number): number {
  return year >= 4 ? 8 : 5;
}

function getScholarshipGradeLabel(year: number): string {
  if (year === 2) return "研二";
  if (year === 3) return "研三";
  if (year === 4) return "博一";
  if (year === 5) return "博二";
  return `第 ${year} 年`;
}

function buildScholarshipResultEvent(context: ScholarshipOutcomeContext): PendingEvent {
  const gradeLabel = getScholarshipGradeLabel(context.year);
  if (context.success) {
    const diff = context.score - context.requirement;
    const story = diff >= 3
      ? [
          "📱 手机震动，学院通知跳了出来。",
          "你点开看到“恭喜获得本年度学业奖学金”，心里第一反应是：稳了。",
          "这一年堆起来的实验记录和论文修改，终于变成了实打实的结果。",
        ]
      : diff >= 1
        ? [
            "📱 手机一震，你几乎是屏住呼吸点开通知。",
            "“恭喜获得本年度学业奖学金。”",
            "你长出一口气，虽然不是断层领先，但关键节点没有掉队。",
          ]
        : [
            "📱 手机震动，你反复确认了两遍推送内容。",
            "“恭喜获得本年度学业奖学金。”",
            "几乎卡线通过的感觉又惊又险，你忽然觉得这学年总算有了句号。",
          ];
    return createFixedEvent({
      id: `scholarship-result-y${context.year}-m${context.month}`,
      title: "国奖评选 ➜ 查看积分 ➜ 获得奖学金",
      description: [
        ...story,
        "评选结果",
        `${gradeLabel}年级分数线：${context.requirement} 分`,
        `你的科研积分：${context.score} 分`,
        `评定结果：${context.score} ≥ ${context.requirement}，获奖`,
      ].join("\n\n"),
      preview: "奖学金结果已公布",
      chainId: "scholarship",
      stage: "result",
      choices: [
        {
          id: `scholarship-claim-y${context.year}-m${context.month}`,
          label: "收下奖金",
          outcome: `拿到奖学金，金钱 +${context.reward}。`,
          effects: {
            money: context.reward,
          },
        },
      ],
    });
  }

  const diff = context.requirement - context.score;
  const story = diff === 1
    ? [
        "📱 通知弹窗亮起，你几乎立刻点开。",
        `分数线是 ${context.requirement} 分，而你是 ${context.score} 分。`,
        "只差 1 分的落差最刺痛，你开始在脑海里倒放这学年的每个选择。",
      ]
    : diff <= 3
      ? [
          `📱 你点开通知，结果并不意外：分数线 ${context.requirement}，你是 ${context.score}。`,
          "情绪有些下沉，但你也清楚问题出在产出密度不够，而不是运气。",
        ]
      : [
          `📱 你扫了一眼通知：分数线 ${context.requirement}，你是 ${context.score}。`,
          "差距比较明显，这次更像一次清晰的体检报告。",
          "你把页面关掉，心里冒出一句：明年要提前布局，不再临线挣扎。",
        ];

  return createFixedEvent({
    id: `scholarship-result-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 查看积分 ➜ 遗憾落选",
    description: [
      ...story,
      "评选结果",
      `${gradeLabel}年级分数线：${context.requirement} 分`,
      `你的科研积分：${context.score} 分`,
      `评定结果：${context.score} < ${context.requirement}，落选`,
      `分差：-${diff}`,
    ].join("\n\n"),
    preview: "奖学金结果已公布",
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
    `“${context.score} 分，按体感应该在前排。”`,
    "“只要今年线别离谱，机会很大。”",
  ];
  let mood = "心态：比较稳";
  let label = "等待结果";

  if (diff >= 1 && diff < 3) {
    innerThoughts = [
      `“${context.score} 分，还算有竞争力。”`,
      "“能不能中要看别人今年的产出。”",
    ];
    mood = "心态：期待里带点紧张";
  } else if (diff === 0) {
    innerThoughts = [
      `“${context.score} 分，刚好卡在分界附近。”`,
      "“按当前计分规则是压线通过，但已经没有任何容错空间。”",
    ];
    mood = "心态：卡线过关但不敢松懈";
    label = "继续等待";
  } else if (diff < 0 && diff >= -2) {
    innerThoughts = [
      `“${context.score} 分，稍微有点危险。”`,
      "“如果今年大家都很卷，可能就差一口气。”",
    ];
    mood = "心态：偏悲观";
    label = "继续等待";
  } else if (diff < -2) {
    innerThoughts = [
      `“${context.score} 分，基本无缘今年奖学金了。”`,
      "“这次就当复盘，明年提早布局。”",
    ];
    mood = "心态：接受现实";
    label = "继续等待";
  }

  return createFixedEvent({
    id: `scholarship-score-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 查看积分",
    description: [
      `你打开系统，看到自己本年度科研积分为 ${context.score} 分。`,
      ...innerThoughts,
      `${mood}。你知道分差越小，越容易在“名单公布那一刻”被情绪放大；现在能做的，是先稳住心态，等正式结果落地。`,
    ].join("\n\n"),
    preview: "查看当前积分与评选线",
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
  const requirement = getScholarshipRequirement(state.year, getRoll);
  const reward = getScholarshipReward(state.year);
  const gradeLabel = getScholarshipGradeLabel(state.year);
  const context = {
    year: state.year,
    month: state.month,
    score: state.totalResearchScore,
    requirement,
    reward,
  };

  return createFixedEvent({
    id: `scholarship-y${state.year}-m${state.month}`,
    title: "国奖评选",
    description: [
      "晚上十点，学院系统推送了“国奖评选启动”通知。",
      `${gradeLabel}年级本轮只有 5 个名额，按本年度科研积分排序。`,
      "分数线不会提前公布，真正的压力在于你不知道别人今年到底有多猛。",
      "你先点开积分页面，想给自己一个“今晚能不能睡着”的答案。",
    ].join("\n\n"),
    preview: "奖学金评选通知，查看评选结果",
    chainId: "scholarship",
    choices: [
      {
        id: `scholarship-view-score-y${state.year}-m${state.month}`,
        label: "查看积分",
        outcome: "查看科研分和评选线。",
        effects: {
          enqueueEvents: [buildScholarshipScoreEvent(context)],
        },
      },
    ],
  });
}
