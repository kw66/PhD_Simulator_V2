import { createAdvisorProgressStateFromValues } from "./v2-advisor-progress";
import { ADVISOR_REQUIREMENTS, ADVISOR_SALARY } from "./v2-content";
import {
  createFixedEvent,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import {
  getAdvisorDefinition,
  getGraduationScoreTarget,
} from "./v2-progression";
import { generateRandomChineseName } from "./v2-random-name";
import { tryAddRelationship } from "./v2-relationship-rules";
import type { AdvisorId, FixedEventResolution, GameState, PendingEvent } from "./v2-types";

interface BeforeGradSchoolAdvisorIntel {
  reporting: string;
  projects: string;
  internship: string;
  guidance: string;
  computing: string;
  temperament: string;
  atmosphere: string;
}

const LECTURER_INITIAL_PROFILE = {
  researchResource: 4,
  affinity: 4,
  taskMultiplier: 6,
} as const;

const BEFORE_GRAD_SCHOOL_ADVISOR_IDS: AdvisorId[] = [
  "chen-ming",
  "zhou-lan",
  "lin-hao",
  "zhao-ning",
];

const ADVISOR_INTEL_OPTIONS = {
  reporting: ["每周周报 + 组会", "每周组会，平时自由安排", "隔周组会，进展随时沟通"],
  projects: ["不多", "偶尔会有", "以科研为主"],
  internship: ["放实习", "提前沟通即可", "比较支持"],
  guidance: ["较少", "会给方向，细节需要自己摸索", "有问题时可以单独约"],
  computing: ["不多", "基本够用", "比较充足"],
  temperament: ["比较宽和", "好沟通", "对学生比较耐心"],
  atmosphere: ["实验室氛围好", "同门相处融洽", "整体比较轻松"],
} as const;

function pickRandomText(
  options: readonly string[],
  getRoll: RandomRollProvider,
): string {
  const rawRoll = getRoll();
  const normalizedRoll = Number.isFinite(rawRoll)
    ? Math.min(0.999999, Math.max(0, rawRoll))
    : 0;
  return options[Math.floor(normalizedRoll * options.length)] ?? options[0] ?? "";
}

function getRandomAdvisorId(getRoll: RandomRollProvider): AdvisorId {
  const rawRoll = getRoll();
  const normalizedRoll = Number.isFinite(rawRoll)
    ? Math.min(0.999999, Math.max(0, rawRoll))
    : 0;
  return BEFORE_GRAD_SCHOOL_ADVISOR_IDS[Math.floor(normalizedRoll * BEFORE_GRAD_SCHOOL_ADVISOR_IDS.length)]
    ?? BEFORE_GRAD_SCHOOL_ADVISOR_IDS[0];
}

function createRandomAdvisorIntel(getRoll: RandomRollProvider): BeforeGradSchoolAdvisorIntel {
  return {
    reporting: pickRandomText(ADVISOR_INTEL_OPTIONS.reporting, getRoll),
    projects: pickRandomText(ADVISOR_INTEL_OPTIONS.projects, getRoll),
    internship: pickRandomText(ADVISOR_INTEL_OPTIONS.internship, getRoll),
    guidance: pickRandomText(ADVISOR_INTEL_OPTIONS.guidance, getRoll),
    computing: pickRandomText(ADVISOR_INTEL_OPTIONS.computing, getRoll),
    temperament: pickRandomText(ADVISOR_INTEL_OPTIONS.temperament, getRoll),
    atmosphere: pickRandomText(ADVISOR_INTEL_OPTIONS.atmosphere, getRoll),
  };
}

function createAdvisorInfoEvent(
  advisorId: AdvisorId,
  advisorName: string,
  intel: BeforeGradSchoolAdvisorIntel,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);

  return createFixedEvent({
    id: `before-grad-school-advisor-info-${advisor.id}`,
    title: "读研之始",
    description: [
      `学院网站上的导师介绍写得都很正式，看完还是不知道实验室平时是什么样。你挑了几个感兴趣的方向，给对应的老师发了邮件。${advisorName}讲师回了信，约你线上聊聊。`,
      "聊完后，你又找实验室的学生打听课题组平时怎么安排。零零散散问了几个人，总算拼出了一个大概。",
      [
        "搜集信息",
        `${advisorName}讲师`,
        `汇报：${intel.reporting}`,
        `项目：${intel.projects}`,
        `实习：${intel.internship}`,
        `指导：${intel.guidance}`,
        `计算资源：${intel.computing}`,
        `导师：${intel.temperament}`,
        `氛围：${intel.atmosphere}`,
      ].join("\n"),
      `月工资：硕士 ${ADVISOR_SALARY.master}　博士 ${ADVISOR_SALARY.phd}\n毕业线：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分　博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博线：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分　第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
    ].join("\n\n"),
    preview: `了解${advisorName}讲师和课题组`,
    chainId: "before-grad-school",
    stage: "act2",
    choices: [
      {
        id: `before-grad-school-confirm-${advisor.id}`,
        label: "回复导师",
        outcome: "",
        effects: {
          fixedEventResolution: {
            kind: "advisor-confirm",
            advisorCandidate: {
              advisorId,
              advisorName,
              ...LECTURER_INITIAL_PROFILE,
            },
          },
        },
      },
    ],
  });
}

function createBeforeGradSchoolResultEvent(
  advisorId: AdvisorId,
  advisorName: string,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);
  return createFixedEvent({
    id: `before-grad-school-summer-${advisor.id}`,
    title: "读研之始",
    description: [
      `你给${advisorName}讲师回了邮件，表示想加入课题组。老师让你先等本校资格，到了九月再按流程填报推免系统。`,
      "大四开学后，学院公布推免资格名单，你在里面找到了自己的名字。九月，推免系统正式开放，你填报了之前拿到预录取的学校，并在系统里接受待录取。你把结果告诉老师，很快收到回复：“收到，开学见。”",
      "本科毕业后的暑假，宿舍里的人陆续收拾行李。你下载了几篇课题组最近的论文，没看懂多少。你还是忍不住想象开学后的工位、第一次组会，还有以后自己的第一篇投稿。想到这些，你有点紧张，也有点期待。",
    ].join("\n\n"),
    preview: "开学的日子近了",
    chainId: "before-grad-school",
    stage: "result",
    choices: [
      {
        id: `before-grad-school-finish-${advisor.id}`,
        label: "准备报到",
        outcome: "你收拾好行李，准备去学校报到。",
        effects: {},
      },
    ],
  });
}

export function createBeforeGradSchoolAct1Event(
  _state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent {
  const advisorId = getRandomAdvisorId(getRoll);
  const advisorName = generateRandomChineseName(getRoll);
  const advisorIntel = createRandomAdvisorIntel(getRoll);
  return createFixedEvent({
    id: "before-grad-school-qualification",
    title: "读研之始",
    description: [
      "你读的是计算机类专业，本科几年里修过机器学习、深度学习之类的课，也跟着做过几个人工智能项目。人工智能是当下最热门的方向之一，机会多，挤在这条路上的人也多。到了大三下学期，你对毕业后的去向还是有些迷茫。求职越来越卷，选择读研的人也越来越多。你说不清读研是不是最适合自己，只觉得保研机会不能先放掉。抱着“先争取到再说”的想法，你也有些随大流地开始准备了。",
      "你把想去的学校和研究方向列成表格，一项项核对报名要求。成绩单、排名证明、简历和个人陈述准备齐后，你又针对不同学校改了很多遍。每投出一份申请，你都会反复检查邮箱，生怕错过补交材料或面试的消息。",
      "暑假里，你参加了夏令营，结束后又继续报预推免。为了笔试和面试，你重新复习专业课，也把做过的项目一遍遍讲给自己听。忙了几个月，最后很幸运，你拿到了心仪学校的预录取，保上了最想去的学校。正式手续还没开始，你先去联系导师。",
    ].join("\n\n"),
    preview: "拿到梦校预录取，准备联系导师",
    chainId: "before-grad-school",
    stage: "act1",
    choices: [
      {
        id: "before-grad-school-open-advisor-info",
        label: "联系导师",
        outcome: "你打开学院网站，开始查看导师信息。",
        effects: {
          enqueueEvents: [createAdvisorInfoEvent(advisorId, advisorName, advisorIntel)],
        },
      },
    ],
  });
}

export function resolveAdvisorConfirmation(
  state: GameState,
  resolution: FixedEventResolution,
): FixedResolutionResult {
  const candidate = resolution.advisorCandidate;
  if (!candidate) {
    return {
      nextState: state,
      outcome: "这次没有成功确认导师联系信息。",
    };
  }

  const advisor = getAdvisorDefinition(candidate.advisorId);
  const relationshipState = state.relationshipState.advisorCount > 0
    ? { ...state.relationshipState }
    : tryAddRelationship(state.relationshipState, "advisor").nextState;
  const nextState: GameState = {
    ...state,
    selectedAdvisorId: advisor.id,
    selectedAdvisorName: candidate.advisorName,
    graduationScoreTarget: getGraduationScoreTarget("master", advisor.id),
    relationshipState,
    advisorProgressState: createAdvisorProgressStateFromValues(
      candidate.researchResource,
      candidate.affinity,
      candidate.taskMultiplier,
    ),
  };

  return {
    nextState,
    outcome: `你回复了${candidate.advisorName}讲师，表示希望加入课题组。`,
    enqueueEvents: [createBeforeGradSchoolResultEvent(advisor.id, candidate.advisorName)],
  };
}
