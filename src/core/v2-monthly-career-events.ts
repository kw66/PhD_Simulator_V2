import {
  CAREER_DEFINITIONS,
  CAREER_OPTIONS,
  calculateCareerProgress,
  canTriggerCareerEventsThisMonth,
  getActiveCareerTypes,
  getCareerLevel,
  type CareerType,
} from "./v2-career-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";
import { createThreeStageEvent, type RandomEventResultCopy } from "./v2-random-events-core-shared";

function createCareerChoices(state: GameState, careerType: CareerType): {
  choices: EventChoice[];
  results: Record<string, RandomEventResultCopy>;
} {
  const definition = CAREER_DEFINITIONS[careerType];
  const publishedPaperCount = getPublishedPaperCount(state);
  const oldProgress = state.careerProgress[careerType];
  const results: Record<string, RandomEventResultCopy> = {};

  const choices: EventChoice[] = CAREER_OPTIONS.map((option) => {
    const progressGain = calculateCareerProgress(careerType, option, {
      research: state.player.research,
      social: state.player.social,
      publishedPaperCount,
      internshipCount: state.internshipCount,
    });
    const newProgress = oldProgress + progressGain;
    results[option.id] = {
      title: "本月结果",
      description: [
        `你按计划完成了本月在「${definition.name}」方向的投入，简历、沟通和准备工作都落到了具体执行上。`,
        `从结果看，路线进度由 ${oldProgress} 提升到 ${newProgress}，当前层级来到「${getCareerLevel(careerType, newProgress).name}」。`,
        "你能明显感到节奏已经发生变化：有些机会开始向你靠近，也有些压力开始同步上升。",
        "这一步不一定立刻换来结论，但它确实把你推向了下一阶段。",
      ].join("\n\n"),
    };

    return {
      id: option.id,
      label: option.text,
      outcome: progressGain > 0
        ? `${definition.name}进度 +${progressGain}，SAN ${option.sanCost > 0 ? `-${option.sanCost}` : "不变"}。`
        : `这次尝试没有推进 ${definition.name} 进度。`,
      effects: {
        san: -option.sanCost,
        careerType,
        careerProgress: progressGain,
      },
    };
  });

  choices.push({
    id: `abandon-${careerType}`,
    label: `放弃${definition.name}`,
    outcome: `放弃${definition.name}，以后不再收到这条线的求职事件。`,
    effects: {
      careerType,
      abandonCareer: true,
    },
  });
  results[`abandon-${careerType}`] = {
    title: "放弃方向",
    description: "你决定暂时放下这条求职路线，把精力投向其他方向。",
  };

  return { choices, results };
}

function createCareerEvent(state: GameState, careerType: CareerType): PendingEvent {
  const definition = CAREER_DEFINITIONS[careerType];
  const progress = state.careerProgress[careerType];
  const level = getCareerLevel(careerType, progress);
  const { choices, results } = createCareerChoices(state, careerType);
  const backgroundDescription = careerType === "internet"
    ? "校招群与邮件不断刷新，互联网岗位竞争节奏非常快。"
    : careerType === "stateOwned"
      ? "宣讲会陆续开始，稳定与成长之间需要你做取舍。"
      : careerType === "civilService"
        ? "报名、选岗与备考并行推进，每一步都考验执行力。"
        : "高校教职机会开始流动，学术路径的门槛逐渐清晰。";
  const event: PendingEvent = {
    id: `career-${careerType}-y${state.year}-m${state.month}`,
    title: `${definition.name}招聘`,
    description: "",
    preview: `${definition.name} · ${level.name} · 进度 ${progress}`,
    source: "career",
    blocking: true,
    deadlineMonths: 0,
    chainId: `career-${careerType}`,
    stage: "act1",
    choices,
  };

  return createThreeStageEvent(event, {
    introDescription: [
      backgroundDescription,
      `你当前处于「${level.name}」阶段（进度 ${progress}）。招聘季的每一次投递、每一场面试和每一条反馈，都会悄悄改写你接下来的时间分配。`,
      "这个月你不只是“做求职动作”，而是在给未来几个月定基调：是先把基本盘稳住，还是主动提速抢窗口。",
      "你把待办清单又过了一遍，准备做出本月最关键的节奏决定。",
    ].join("\n\n"),
    decisionTitle: "本月安排",
    decisionDescription: [
      "你盯着招聘网站、聊天记录和本月日历，脑子里不断回放一个问题：这个月到底要“稳”，还是要“冲”。",
      "稳步推进意味着你还能保持作息和实验节奏，不至于在关键节点前把自己拖垮；但代价是进度增长更慢，可能会被同赛道的人提前甩开。",
      "高强度冲刺则更像一次押注，短时间内能把简历厚度和反馈速度都拉起来，但每多挤出一段精力，都会从睡眠、情绪和耐心里扣账。",
      "你知道这不是“对错题”，而是“代价分配题”。现在要选的，是你愿意用哪种损耗去换下一步机会。",
    ].join("\n\n"),
    results,
  });
}

export function createCareerEventForType(state: GameState, careerType: CareerType): PendingEvent {
  return createCareerEvent(state, careerType);
}

export function collectCareerEventsForMonth(state: GameState): PendingEvent[] {
  if (!canTriggerCareerEventsThisMonth(state.year, state.degree, state.willTransferPhDYear3, state.isNatureExtensionYear)) {
    return [];
  }

  return getActiveCareerTypes(state.month)
    .filter((careerType) => state.careerAbandoned[careerType] !== true)
    .map((careerType) => createCareerEvent(state, careerType));
}
