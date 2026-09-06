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
    intro: "你打开校招群的岗位表，岗位名称看着相近，点进去才发现要求差得不少。",
    currentWork: "你得先理清项目经历，再看简历里哪些内容值得留下，不能只把技术名词排满一页。",
    result: "你理了理项目经历，把简历里空泛的描述换成具体做法，又对照岗位要求列出需要补的内容。",
    followup: "看着这些修改，你总算更清楚面试时该讲什么；至于岗位会不会给回复，还得另说。",
  },
  stateOwned: {
    intro: "你翻开央国企的招聘公告，同样是招应届生，岗位地点、专业要求和网申材料却各有一套。",
    currentWork: "你得逐项核对条件，连专业名称都不敢想当然。单位名字熟悉，也省不了填表的功夫。",
    result: "你对着岗位要求检查申请材料，把专业名称、学历和联系方式重新核了一遍，几处拿不准的地方单独标了出来。",
    followup: "材料比之前齐整了一些，但符合条件不等于录用，后续要求还得继续留意。",
  },
  civilService: {
    intro: "你打开公务员招录的职位表，专业、学历和招录人数挤在几列里，筛完才知道能报哪些岗位。",
    currentWork: "职位表要仔细核对，行测和申论也得准备；光收藏几份资料，显然不算已经学过。",
    result: "你核对了报考条件，也整理了行测和申论的备考笔记。几处容易混淆的要求，这次总算没有只看个大概。",
    followup: "正式考试还得靠自己答。你把没弄懂的地方留在笔记上，免得合上书就当会了。",
  },
  academic: {
    intro: "你打开高校招聘页面，同样是教职，研究方向和学历要求差得不少，附件还得逐个下载来看。",
    currentWork: "你得按岗位整理研究经历和后续计划，不能只把论文目录复制进简历就交差。",
    result: "你整理了学术简历，把研究方向、已有工作和后续设想重新核了一遍，删掉几句连自己也讲不清的表述。",
    followup: "材料比之前清楚了一些，能否拿到岗位仍要看招聘要求；简历写得顺，并不等于事情已经定了。",
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
            `「${definition.name}」准备进度从 ${oldProgress} 提升到 ${newProgress}，当前求职评估为「${getCareerLevel(careerType, newProgress).name}」。`,
            copy.followup,
          ].join("\n\n")
        : [
            `这次你把「${definition.name}」的求职准备先放到一边，没有给自己再添一项任务。`,
            `进度仍为 ${oldProgress}，求职评估保持为「${getCareerLevel(careerType, oldProgress).name}」。`,
            "招聘信息先留着，眼下不用急着删掉。你合上页面，免得盯着它太久，就误以为自己已经准备过了。",
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
      `你关掉「${definition.name}」的招聘页面，把这个方向从眼下的求职计划里划掉。`,
      "已经整理的材料还在电脑里，先留着。关页面比改材料利索得多，但接下来做什么，你还得自己想清楚。",
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
      copy.currentWork,
      `求职评估：「${level.name}」（进度 ${progress}）。`,
    ].join("\n\n"),
    decisionTitle: "本月安排",
    decisionDescription: [
      "只留意消息，还是腾出整段时间认真准备？投入得越多，材料能看得越细，人也会更累。",
      "你把实验安排放在旁边，提醒自己别把每天都排成满格。这次也可以先不投入，或者不再考虑这个方向。",
    ].join("\n\n"),
    results,
  });
}

export function createCareerEventForType(state: GameState, careerType: CareerType): PendingEvent {
  return createCareerEvent(state, careerType);
}
