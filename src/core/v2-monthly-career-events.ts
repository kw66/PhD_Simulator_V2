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
    intro: "你在工位上点开校招群的岗位表。都叫算法工程师，细看却像在招几种不同的人。",
    currentWork: "你把简历拖到旁边。组会上能讲半天的经历，放进这一页纸里，居然只剩几行技术名词。",
    result: "你对照岗位要求，把“参与项目”拆成具体做法。平时觉得没什么的细节，倒比那串技术名词更好解释。",
    followup: "你试着照这一版讲了讲经历，总算不必每说两句，就补一句“这个得从头说起”。",
  },
  stateOwned: {
    intro: "学校就业网转来了央国企招聘公告。单位名字都很熟，岗位地点、专业要求和材料清单，却得从头认一遍。",
    currentWork: "你把岗位表和学籍信息并排打开。读了这么久的专业，核对全称时，还是老老实实多看了一眼。",
    result: "你对照公告核过专业全称、学历和联系方式，给拿不准的要求做了标记。刚才挤成一团的申请材料，总算各有了去处。",
    followup: "录用还没影，好在重新打开材料目录时，已经不用挨个猜附件里装了什么。",
  },
  civilService: {
    intro: "公务员招录的职位表挂出来了。你在工位上筛过专业和学历，刚才还很长的表格，已经没剩多少行。",
    currentWork: "旁边开着行测题和申论资料。每个字都认识，轮到限时作答，你却迟迟没选下第一个答案。",
    result: "你核过报考条件，又理了一遍行测和申论笔记。对答案时觉得很明白的几道题，遮住解析，才发现还卡在同一步。",
    followup: "你把卡住的地方圈了出来。笔记上总算有了自己的笔迹，下回就从这里接着练。",
  },
  academic: {
    intro: "你在工位上翻起高校招聘页面。都写着“诚聘英才”，点开各学院的附件，才知道有没有自己能报的方向。",
    currentWork: "简历停在“未来研究计划”一栏。组会上熟悉的“下一步工作”，到了这里，忽然要多想几年。",
    result: "你梳理了研究经历，把后续设想写得具体一些。简历里几句很气派的话，念出来连自己也接不住，只好删掉重写。",
    followup: "再看这一版，总算能顺着每段讲下去了。你对照旁边的招聘页面，又看了看自己与岗位是否合适。",
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
      ? getActualSanChange(-option.sanCost, state.month, state.eventSupport, state.buffs)
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
            `你把「${definition.name}」的招聘页面加入收藏，这个月先不往日程里挤准备时间。`,
            `进度仍为 ${oldProgress}，求职评估保持为「${getCareerLevel(careerType, oldProgress).name}」。`,
            "关掉页面时，浏览器终于少了一排标签。下次还得从这里接着准备，眼下先把工位上的事做完。",
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
      `你关掉「${definition.name}」的招聘页面，把这个方向划出求职计划，以后不再为它安排时间。`,
      "关完最后一个标签，你的手在鼠标上停了一会儿。占着半个屏幕的岗位表没了，桌面壁纸倒是久违地露了出来。",
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
      "你翻开日历，把组会和实验的时间先标出来。刚在招聘页面上看得心热，回到这张日程表，又有些发愁：原来这个月已经排了这么多事。",
      "求职材料还摊在桌上，你把最想先处理的几项圈了出来。认真准备得留出整段时间，也得花些精力；你看着圈好的待办，想把以后的去处落实下来，又舍不得把这个月排得太满。",
    ].join("\n\n"),
    results,
  });
}

export function createCareerEventForType(state: GameState, careerType: CareerType): PendingEvent {
  return createCareerEvent(state, careerType);
}
