import {
  CAREER_DEFINITIONS,
  CAREER_OPTIONS,
  calculateCareerProgress,
  getCareerLevel,
  type CareerType,
} from "./v2-career-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";
import { createThreeStageEvent, type RandomEventResultCopy } from "./v2-random-events-core-shared";
import { getActualSanChange } from "./v2-sanity-rules";

const CAREER_COPY: Record<CareerType, {
  intro: string;
  currentWork: string;
  result: string;
  followup: string;
}> = {
  internet: {
    intro: "校招群里的岗位表每天都在更新，提前批、笔试和面试通知挤在一起。",
    currentWork: "改简历、刷题、投递和准备面试都要占时间。",
    result: "你改完一版项目经历，又处理了几份投递和面试准备。",
    followup: "邮箱里开始多出测评和面试通知，下一轮还得继续跟进。",
  },
  stateOwned: {
    intro: "央国企的宣讲和网申陆续开始，岗位地点、业务方向和招聘批次各不相同。",
    currentWork: "筛岗位、填网申、做测评和准备面试都要占时间。",
    result: "你筛完一批岗位，补齐网申材料，也完成了几场测评和沟通。",
    followup: "部分岗位开始通知后续环节，剩下的还在等待筛选。",
  },
  civilService: {
    intro: "报名时间临近，职位表、招录人数和专业限制摆在同一张表里。",
    currentWork: "选岗、报名和准备行测申论都要占时间。",
    result: "你核对了选岗条件，也按计划完成了这一阶段的行测和申论练习。",
    followup: "报名或备考只是刚往前走了一段，后面还有不少内容要补。",
  },
  academic: {
    intro: "高校陆续发布招聘信息，论文、项目、研究方向和学历要求列得很细。",
    currentWork: "整理学术简历、研究计划和试讲材料都要占时间。",
    result: "你更新了学术简历和研究计划，也继续准备试讲与岗位沟通。",
    followup: "有些岗位开始回复，更多材料还要按学校要求继续调整。",
  },
};

function createCareerChoices(state: GameState, careerType: CareerType): {
  choices: EventChoice[];
  results: Record<string, RandomEventResultCopy>;
} {
  const definition = CAREER_DEFINITIONS[careerType];
  const copy = CAREER_COPY[careerType];
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
    const sanChange = option.sanCost > 0
      ? getActualSanChange(-option.sanCost, state.month, state.eventSupport)
      : 0;
    const newProgress = oldProgress + progressGain;
    results[option.id] = {
      title: "本月结果",
      description: progressGain > 0
        ? [
            copy.result,
            `这次准备让「${definition.name}」进度从 ${oldProgress} 提升到 ${newProgress}，当前阶段为「${getCareerLevel(careerType, newProgress).name}」。`,
            copy.followup,
          ].join("\n\n")
        : [
            `这个月你没有继续投入「${definition.name}」方向。`,
            `进度仍为 ${oldProgress}，当前阶段保持在「${getCareerLevel(careerType, oldProgress).name}」。`,
            "相关通知还在更新，之后想继续时仍可以回来准备。",
          ].join("\n\n"),
    };

    return {
      id: option.id,
      label: option.text,
      outcome: progressGain > 0
        ? `${definition.name}进度 +${progressGain}，SAN ${sanChange < 0 ? sanChange : "不变"}。`
        : `这次尝试没有推进 ${definition.name} 进度。`,
      effects: {
        san: sanChange,
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
    description: [
      `你把「${definition.name}」相关的招聘提醒关掉了。`,
      "已经整理的材料先留在电脑里，这段时间不再继续投递。",
      "空出来的精力，你准备放到其他方向上。",
    ].join("\n\n"),
  };

  return { choices, results };
}

function createCareerEvent(state: GameState, careerType: CareerType): PendingEvent {
  const definition = CAREER_DEFINITIONS[careerType];
  const progress = state.careerProgress[careerType];
  const level = getCareerLevel(careerType, progress);
  const { choices, results } = createCareerChoices(state, careerType);
  const copy = CAREER_COPY[careerType];
  const event: PendingEvent = {
    id: `career-${careerType}-y${state.year}-m${state.month}`,
    title: `${definition.name}招聘`,
    description: "",
    source: "career",
    blocking: true,
    deadlineMonths: 0,
    chainId: `career-${careerType}`,
    stage: "act1",
    choices,
  };

  return createThreeStageEvent(event, {
    introDescription: [
      copy.intro,
      `你当前处于「${level.name}」阶段（进度 ${progress}）。${copy.currentWork}`,
      "你把这个月的日历翻了一遍，得决定在求职上投入多少精力。",
    ].join("\n\n"),
    decisionTitle: "本月安排",
    decisionDescription: [
      "按部就班准备，不会太影响实验和作息，不过推进得慢一些。",
      "集中冲一段时间能多完成几轮准备，最近也得少睡一点。",
      "你看了看这个月的实验安排，得给求职留出一个合适的分量。",
    ].join("\n\n"),
    results,
  });
}

export function createCareerEventForType(state: GameState, careerType: CareerType): PendingEvent {
  return createCareerEvent(state, careerType);
}
