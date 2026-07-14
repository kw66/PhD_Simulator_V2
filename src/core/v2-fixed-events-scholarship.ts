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
  if (context.success) {
    return createFixedEvent({
      id: `scholarship-result-y${context.year}-m${context.month}`,
      title: "国奖评选 ➜ 结果公布",
      description: `名单终于公布。你的科研积分为 ${context.score} 分，本轮分数线为 ${context.requirement} 分，成功获奖。按已核定旧版口径，本年奖学金奖励为金钱 +${context.reward}。`,
      preview: "奖学金结果已公布",
      chainId: "scholarship",
      stage: "result",
      choices: [
        {
          id: `scholarship-claim-y${context.year}-m${context.month}`,
          label: "收下奖金",
          outcome: `你成功拿到本年度奖学金，金钱 +${context.reward}。`,
          effects: {
            money: context.reward,
          },
        },
      ],
    });
  }

  return createFixedEvent({
    id: `scholarship-result-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 结果公布",
    description: `名单终于公布。你的科研积分为 ${context.score} 分，本轮分数线为 ${context.requirement} 分，遗憾落选。`,
    preview: "奖学金结果已公布",
    chainId: "scholarship",
    stage: "result",
    choices: [
      {
        id: `scholarship-fail-y${context.year}-m${context.month}`,
        label: "明年再战",
        outcome: "这次没有拿到奖学金，只能把经验留到下一年。",
        effects: {},
      },
    ],
  });
}

function buildScholarshipScoreEvent(context: Omit<ScholarshipOutcomeContext, "success">): PendingEvent {
  const diff = context.score - context.requirement;
  const success = diff >= 0;
  let descriptionTail = "你的分数已经明显压过本轮线，心里大致有底。";
  let label = "等待结果";

  if (diff === 0) {
    descriptionTail = "你刚好卡在分界附近，结果出来前很难彻底放心。";
    label = "继续等待";
  } else if (diff < 0 && diff >= -2) {
    descriptionTail = "你的分数略显危险，结果很可能只差一口气。";
    label = "继续等待";
  } else if (diff < -2) {
    descriptionTail = "你的分数和今年线有明显差距，这次更像一次年度体检。";
    label = "接受结果";
  }

  return createFixedEvent({
    id: `scholarship-score-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 查看积分",
    description: `你打开系统，看到自己本年度科研积分为 ${context.score} 分；当前年级的评选线为 ${context.requirement} 分。${descriptionTail}`,
    preview: "查看当前积分与评选线",
    chainId: "scholarship",
    stage: "act2",
    choices: [
      {
        id: `scholarship-wait-y${context.year}-m${context.month}`,
        label,
        outcome: success ? "你的分数达到或超过评选线，进入结果公布。" : "你的分数低于评选线，进入结果公布。",
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
    description: `晚上十点，学院系统推送了“国奖评选启动”通知。${gradeLabel}年级本轮按本年度科研积分排序，你准备先点开积分页面，判断自己离分数线还有多远。`,
    preview: "奖学金评选通知，查看评选结果",
    chainId: "scholarship",
    choices: [
      {
        id: `scholarship-view-score-y${state.year}-m${state.month}`,
        label: "查看积分",
        outcome: "查看你本年度的科研积分与这一轮评选线。",
        effects: {
          enqueueEvents: [buildScholarshipScoreEvent(context)],
        },
      },
    ],
  });
}
