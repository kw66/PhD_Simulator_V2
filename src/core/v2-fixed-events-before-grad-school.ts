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
    title: "读研之前",
    description: [
      "学院网站上列着可以联系的老师。你把简历、本科成绩单和毕设摘要整理成附件，给几位研究方向感兴趣的老师发了邮件。写称呼、改正文、检查附件，每封邮件都要在发送前多看两遍。",
      `${advisor.name}讲师回了信，约你线上聊了二十分钟。你讲了本科毕设做过什么，也坦白自己对很多研究问题只懂个大概。老师介绍了实验室现在的方向，又让你回去看看组里的论文。`,
      "光听老师介绍还不够。室友发来一个“导师评价网”的链接，你顺着帖子找到实验室主页、往届学生名单和几篇组内论文，想先弄清组会、项目和毕业要求到底是什么样。",
      `导师评价网 · ${advisor.name}讲师\n匿名评价：${profile.anonymousReview}`,
      `游戏数据\n科研资源 ${LECTURER_INITIAL_PROFILE.researchResource}　初始亲和度 ${LECTURER_INITIAL_PROFILE.affinity}\n项目任务倍率 ${LECTURER_INITIAL_PROFILE.taskMultiplier}　上限 ${taskMax}　做项目消耗 SAN ${ADVISOR_TASK_SAN_COST}\n月工资：硕士 ${ADVISOR_SALARY.master}　博士 ${ADVISOR_SALARY.phd}\n毕业线：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分　博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博线：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分　第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
      "你没有把匿名评价直接当成结论，又找组里的学生问了问。研究方向、组会频率和培养要求都聊清楚后，你准备回复老师的邮件。",
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
  candidate: NonNullable<FixedEventResolution["advisorCandidate"]>,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);
  return createFixedEvent({
    id: `before-grad-school-summer-${advisor.id}`,
    title: "读研之前",
    description: [
      `你给${advisor.name}讲师回了确认邮件。第二天，对方回复：“收到，开学见。”你把这四个字看了两遍，又顺手收藏了课题组主页。`,
      "答辩结束后，校园一下子空了很多。你拍完毕业照，办完离校手续，把宿舍里最后一箱书寄回家。本科四年就这样收进几只纸箱和手机相册里。",
      `大四毕业后的暑假，你把${advisor.name}讲师课题组最近的论文下载进“开学前要读”的文件夹。标题看了三遍还是没太看懂，你只好一边查术语，一边重新补本科时没学扎实的内容。`,
      "你还是会想象研究生生活：第一次坐到自己的工位，第一次在组会上讲实验，第一次把论文投出去。也许中间会有很多跑不通的代码和熬不完的夜，但如果有一天真的收到录用邮件，你大概会第一时间截图发给家里。",
      `电脑、电源、几件衣服，还有那本写满涂改的毕设记录本都装进了行李。开学后，你将在${advisor.name}讲师的实验室开始这段生活。`,
      `导师：${advisor.name}讲师 | 科研资源 ${candidate.researchResource} | 初始亲和度 ${candidate.affinity}`,
    ].join("\n\n"),
    preview: `暑假结束，准备前往${advisor.name}讲师的实验室`,
    chainId: "before-grad-school",
    stage: "result",
    choices: [
      {
        id: `before-grad-school-finish-${advisor.id}`,
        label: "收拾行李，准备报到",
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
    title: "读研之前",
    description: [
      "大四上学期，学院在一楼公告栏贴出了保研资格名单。你从第一行慢慢往下找，在中间看见了自己的名字，又拿出手机对着学号核了一遍。",
      "宿舍群很快刷满了“恭喜”。你给家里打了个电话，电话那头先问是不是真的不用再参加统考，接着便开始盘算明年开学要带什么。挂掉电话后，你才终于有了点要去读研的实感。",
      "接下来的几天，你交了确认材料，补了签字，也把成绩单重新打印了一份。流程走完，辅导员在群里发了一句“资格确认完成”，这件事才算真正落定。",
      "高兴过后，一个更实际的问题摆在桌面上：以后做什么方向、联系哪位老师、实验室平时怎么开组会。你打开学院网站，开始一页页看导师介绍。",
    ].join("\n\n"),
    preview: "保研资格名单已经公示",
    chainId: "before-grad-school",
    stage: "act1",
    choices: [
      {
        id: "before-grad-school-open-advisor-info",
        label: "去看看导师信息",
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
    enqueueEvents: [createBeforeGradSchoolResultEvent(advisor.id, candidate)],
  };
}
