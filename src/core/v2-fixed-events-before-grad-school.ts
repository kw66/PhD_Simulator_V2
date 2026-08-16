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
import { tryAddRelationship } from "./v2-relationship-rules";
import type { AdvisorId, FixedEventResolution, GameState, PendingEvent } from "./v2-types";

interface BeforeGradSchoolAdvisorProfile {
  advisorId: AdvisorId;
  anonymousReview: string;
}

const LECTURER_INITIAL_PROFILE = {
  researchResource: 4,
  affinity: 4,
  taskMultiplier: 6,
} as const;

const BEFORE_GRAD_SCHOOL_ADVISORS: BeforeGradSchoolAdvisorProfile[] = [
  {
    advisorId: "chen-ming",
    anonymousReview: "每周一次组会，老师回消息挺快。改稿时批注很多，连图里的字号都会管。",
  },
  {
    advisorId: "zhou-lan",
    anonymousReview: "隔周组会，平时在群里同步。老师会给大方向，具体怎么做得自己先拿方案。",
  },
  {
    advisorId: "lin-hao",
    anonymousReview: "每周开一次组会，轮到汇报时即使暂时没结果，也要把卡在哪里讲清楚。服务器基本够用，赶项目节点时会忙一阵。",
  },
  {
    advisorId: "zhao-ning",
    anonymousReview: "隔周组会，时间安排比较自由。想出去开会要提前准备，老师会认真看投稿稿件。",
  },
];

function getRandomAdvisorProfile(getRoll: RandomRollProvider): BeforeGradSchoolAdvisorProfile {
  const rawRoll = getRoll();
  const normalizedRoll = Number.isFinite(rawRoll)
    ? Math.min(0.999999, Math.max(0, rawRoll))
    : 0;
  return BEFORE_GRAD_SCHOOL_ADVISORS[Math.floor(normalizedRoll * BEFORE_GRAD_SCHOOL_ADVISORS.length)]
    ?? BEFORE_GRAD_SCHOOL_ADVISORS[0];
}

function createAdvisorInfoEvent(profile: BeforeGradSchoolAdvisorProfile): PendingEvent {
  const advisor = getAdvisorDefinition(profile.advisorId);

  return createFixedEvent({
    id: `before-grad-school-advisor-info-${advisor.id}`,
    title: "读研之始",
    description: [
      `学院网站上的导师介绍写得都很正式，看完还是不知道实验室平时是什么样。你挑了几个感兴趣的方向，给对应的老师发了邮件。${advisor.name}讲师回了信，约你线上聊聊。`,
      "聊完后，你又去导师评价网翻帖子，还找实验室的学生问了问。组会多久一次、平时要不要做项目、毕业要求是什么，这些才是你更想知道的。",
      `导师评价网 · ${advisor.name}讲师\n匿名评价：${profile.anonymousReview}`,
      `月工资：硕士 ${ADVISOR_SALARY.master}　博士 ${ADVISOR_SALARY.phd}\n毕业线：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分　博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博线：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分　第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
    ].join("\n\n"),
    preview: `了解${advisor.name}讲师和课题组`,
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
              advisorId: profile.advisorId,
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
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);
  return createFixedEvent({
    id: `before-grad-school-summer-${advisor.id}`,
    title: "读研之始",
    description: [
      `你给${advisor.name}讲师回了邮件，表示想加入课题组。老师让你先等本校资格和九推结果。`,
      "大四开学后，学院公布推免资格名单，你在里面找到了自己的名字。九推系统开放后，你填报了之前拿到预录取的学校，并在系统里接受待录取。你把结果告诉老师，很快收到回复：“收到，开学见。”",
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
  const advisorProfile = getRandomAdvisorProfile(getRoll);
  return createFixedEvent({
    id: "before-grad-school-qualification",
    title: "读研之始",
    description: [
      "大三下学期，你把想去的学校和研究方向列成表格，一项项核对报名要求。成绩单、排名证明、简历和个人陈述准备齐后，你又针对不同学校改了很多遍。每投出一份申请，你都会反复检查邮箱，生怕错过补交材料或面试的消息。",
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
          enqueueEvents: [createAdvisorInfoEvent(advisorProfile)],
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
    outcome: `你回复了${advisor.name}讲师，表示希望加入课题组。`,
    enqueueEvents: [createBeforeGradSchoolResultEvent(advisor.id)],
  };
}
