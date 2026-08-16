import { createAdvisorProgressStateFromValues, ADVISOR_TASK_SAN_COST } from "./v2-advisor-progress";
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
    anonymousReview: "每周一次组会，实验没跑通也照样要讲。组里设备够用，项目节点比较紧。",
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
  const taskMax = LECTURER_INITIAL_PROFILE.researchResource * LECTURER_INITIAL_PROFILE.taskMultiplier + 20;

  return createFixedEvent({
    id: `before-grad-school-advisor-info-${advisor.id}`,
    title: "读研之始",
    description: [
      `学院网站上的导师介绍写得都很正式，看完还是不知道实验室平时是什么样。你挑了几个感兴趣的方向，给对应的老师发了邮件。${advisor.name}讲师回了信，约你线上聊聊。`,
      "聊完后，你又去导师评价网翻帖子，还找实验室的学生问了问。组会多久一次、平时要不要做项目、毕业要求是什么，这些才是你更想知道的。",
      `导师评价网 · ${advisor.name}讲师\n匿名评价：${profile.anonymousReview}`,
      `游戏数据\n科研资源 ${LECTURER_INITIAL_PROFILE.researchResource}　初始亲和度 ${LECTURER_INITIAL_PROFILE.affinity}\n项目任务倍率 ${LECTURER_INITIAL_PROFILE.taskMultiplier}　上限 ${taskMax}　做项目消耗 SAN ${ADVISOR_TASK_SAN_COST}\n月工资：硕士 ${ADVISOR_SALARY.master}　博士 ${ADVISOR_SALARY.phd}\n毕业线：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分　博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博线：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分　第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
    ].join("\n\n"),
    preview: `了解${advisor.name}讲师和课题组`,
    chainId: "before-grad-school",
    stage: "act2",
    choices: [
      {
        id: `before-grad-school-confirm-${advisor.id}`,
        label: "确认加入课题组",
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
      `你给${advisor.name}讲师回了邮件。过了一会儿，对方回复：“收到，开学见。”本科答辩结束后，宿舍里的人陆续收拾行李，你也开始准备开学要带的东西。`,
      "暑假里，你下载了几篇课题组最近的论文，没看懂多少。你还是忍不住想象开学后的工位、第一次组会，还有以后自己的第一篇投稿。想到这些，你有点紧张，也有点期待。",
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
      "大三下学期，年级群里开始有人问夏令营的事。你把成绩单、排名证明和简历改了好几遍，投出申请后每天都要多刷几次邮箱。夏令营结束，还有预推免和校内排名，哪一步都不敢漏。",
      "大四开学后，学院公布推免综合排名，你在名单里找到了自己的名字。后来填报志愿、参加复试，再到推免服务系统里接受待录取，几个月忙下来的事情总算有了结果。学校定了，接下来要联系导师。",
    ].join("\n\n"),
    preview: "推免结果已经确定",
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
    outcome: `你回复了${advisor.name}讲师，确认加入课题组。`,
    enqueueEvents: [createBeforeGradSchoolResultEvent(advisor.id)],
  };
}
