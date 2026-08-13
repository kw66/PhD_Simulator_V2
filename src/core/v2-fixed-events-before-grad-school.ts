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
      `导师主页上的介绍都很完整，真正让你犹豫的却是没写出来的部分：组会多久一次，项目会不会挤占自己的论文，毕业到底按什么算。你给几位方向合适的老师发了邮件，${advisor.name}讲师回信约你聊了聊。`,
      "通话结束后，你没有立刻答应。你翻导师评价网、实验室主页和组内论文，又托人问在读学生。那些“氛围很好”“老师负责”的套话，终于慢慢变成可以比较的日常。",
      `导师评价网 · ${advisor.name}讲师\n匿名评价：${profile.anonymousReview}`,
      `游戏数据\n科研资源 ${LECTURER_INITIAL_PROFILE.researchResource}　初始亲和度 ${LECTURER_INITIAL_PROFILE.affinity}\n项目任务倍率 ${LECTURER_INITIAL_PROFILE.taskMultiplier}　上限 ${taskMax}　做项目消耗 SAN ${ADVISOR_TASK_SAN_COST}\n月工资：硕士 ${ADVISOR_SALARY.master}　博士 ${ADVISOR_SALARY.phd}\n毕业线：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分　博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博线：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分　第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
    ].join("\n\n"),
    preview: `正在了解${advisor.name}讲师与实验室`,
    chainId: "before-grad-school",
    stage: "act2",
    choices: [
      {
        id: `before-grad-school-confirm-${advisor.id}`,
        label: "回复邮件，确认入组",
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
      `你确认加入${advisor.name}讲师的课题组，很快收到一句：“收到，开学见。”本科答辩结束，班群渐渐安静下来。过去总有人告诉你下一门课是什么，往后却要自己决定该追哪个问题。`,
      "暑假里，你收藏了几篇组内论文，第一页就读得很慢。你仍会想象自己的工位、第一次组会和第一篇投稿。期待和没底混在一起，被你一并装进行李。",
    ].join("\n\n"),
    preview: `暑假结束，准备前往${advisor.name}讲师的实验室`,
    chainId: "before-grad-school",
    stage: "result",
    choices: [
      {
        id: `before-grad-school-finish-${advisor.id}`,
        label: "出发报到",
        outcome: "",
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
      "大三下，年级群里的话题从绩点变成了夏令营。原本只是成绩单上的几个小数，忽然和明年会在哪座城市连在一起。你准备材料、参加夏令营和预推免，也反复估算排名，直到大四开学仍不敢把话说满。",
      "学院完成综合排名和资格审核后，公示页里终于出现了你的名字。你随后在推免服务系统填报志愿、参加复试并接受待录取。页面变成“已接受”的那一刻，你松了口气，又意识到：学校定下了，往后几年每天见的人还没有。",
    ].join("\n\n"),
    preview: "推免资格已经确认",
    chainId: "before-grad-school",
    stage: "act1",
    choices: [
      {
        id: "before-grad-school-open-advisor-info",
        label: "开始联系导师",
        outcome: "你开始整理导师名单和联系材料。",
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
    outcome: `你和${advisor.name}讲师确认了入组意向。导师和实验室信息已经记下。`,
    enqueueEvents: [createBeforeGradSchoolResultEvent(advisor.id)],
  };
}
