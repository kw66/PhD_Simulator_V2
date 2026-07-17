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

interface SeniorSummerAdvisorProfile {
  advisorId: AdvisorId;
  anonymousReview: string;
}

const LECTURER_INITIAL_PROFILE = {
  researchResource: 4,
  affinity: 4,
  taskMultiplier: 6,
} as const;

const SENIOR_SUMMER_ADVISORS: SeniorSummerAdvisorProfile[] = [
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

function getRandomAdvisor(getRoll: RandomRollProvider): SeniorSummerAdvisorProfile {
  const rawRoll = getRoll();
  const normalizedRoll = Number.isFinite(rawRoll)
    ? Math.min(0.999999, Math.max(0, rawRoll))
    : 0;
  return SENIOR_SUMMER_ADVISORS[Math.floor(normalizedRoll * SENIOR_SUMMER_ADVISORS.length)]
    ?? SENIOR_SUMMER_ADVISORS[0];
}

function createAdvisorReviewEvent(profile: SeniorSummerAdvisorProfile): PendingEvent {
  const advisor = getAdvisorDefinition(profile.advisorId);
  const taskMax = LECTURER_INITIAL_PROFILE.researchResource * LECTURER_INITIAL_PROFILE.taskMultiplier + 20;

  return createFixedEvent({
    id: `senior-summer-advisor-review-${advisor.id}`,
    title: "大四暑假",
    description: [
      `分组名单里，你的名字后面写着：${advisor.name}，讲师。你对这个名字几乎没有印象，只在学院网站上找到几行研究方向和一张证件照。`,
      "室友甩来一个“导师评价网”的链接。你点进去翻了半天，又顺着帖子找到实验室主页、往届学生名单和几篇组内论文。匿名评价互相矛盾，但总比只看学院简介多知道一点。",
      `导师评价网 · ${advisor.name}讲师\n匿名评价：${profile.anonymousReview}`,
      `游戏数据\n科研资源 ${LECTURER_INITIAL_PROFILE.researchResource}　初始亲和度 ${LECTURER_INITIAL_PROFILE.affinity}\n项目任务倍率 ${LECTURER_INITIAL_PROFILE.taskMultiplier}　上限 ${taskMax}　做项目消耗 SAN ${ADVISOR_TASK_SAN_COST}\n月工资：硕士 ${ADVISOR_SALARY.master}　博士 ${ADVISOR_SALARY.phd}\n毕业线：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分　博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博线：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分　第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
      "你把几条重要信息记进备忘录。至于帖子里那些夸张的好评和差评，只能等开学后自己慢慢验证。",
    ].join("\n\n"),
    preview: `查到导师与实验室信息：${advisor.name}`,
    chainId: "senior-summer",
    stage: "act2",
    choices: [
      {
        id: `senior-summer-confirm-${advisor.id}`,
        label: "记下这些信息",
        outcome: "",
        effects: {
          fixedEventResolution: {
            kind: "advisor-assign",
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

function createSeniorSummerResultEvent(
  advisorId: AdvisorId,
  candidate: NonNullable<FixedEventResolution["advisorCandidate"]>,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);
  return createFixedEvent({
    id: `senior-summer-result-${advisor.id}`,
    title: "大四暑假",
    description: [
      `关掉导师评价网后，你又打开了${advisor.name}讲师的课题组主页。主页上最近一篇论文的标题看了三遍还是没太看懂，你先把 PDF 下载进了“开学前要读”的文件夹。`,
      "接下来的几天，你办完离校手续，把宿舍里最后一箱书寄回家，又开始收拾去新学校的行李。电脑、电源、几件衣服，还有那本本科毕设时写满涂改的实验记录本。",
      "你还是会想象研究生生活：第一次坐到自己的工位，第一次在组会上讲实验，第一次把论文投出去。也许中间会有很多跑不通的代码和熬不完的夜，但如果有一天真的收到录用邮件，你大概会第一时间截图发给家里。",
      `开学后，你将在${advisor.name}讲师的实验室开始这段生活。网上的评价只是参考，剩下的要由你自己经历。`,
      `导师：${advisor.name}讲师 | 科研资源 ${candidate.researchResource} | 初始亲和度 ${candidate.affinity}`,
    ].join("\n\n"),
    preview: `准备前往${advisor.name}讲师的实验室报到`,
    chainId: "senior-summer",
    stage: "result",
    choices: [
      {
        id: `senior-summer-finish-${advisor.id}`,
        label: "收拾行李，准备报到",
        outcome: "",
        effects: {},
      },
    ],
  });
}

export function createSeniorSummerAct1Event(
  _state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent {
  const assignedAdvisor = getRandomAdvisor(getRoll);
  return createFixedEvent({
    id: "senior-summer-act1",
    title: "大四暑假",
    description: [
      "拍毕业照那天太阳很大。你穿着学士服在图书馆前排了半天队，快门按下去时才突然意识到，本科四年真的结束了。晚上回到宿舍，桌上还堆着没寄走的书，走廊里已经有人拖着行李箱去赶车。",
      "保研的事早就定了，可“去读研”一直只是简历上的下一行。这个暑假安静下来，你才开始认真想以后：会不会有一个属于自己的工位，会做什么方向，第一次在组会上讲实验时会不会紧张，第一篇论文又要改多少遍。",
      "你也偷偷期待过一些具体的小事。比如独立跑通第一个实验，攒钱去没去过的城市开会，或者某天半夜收到录用邮件，第二天装作平静地把截图发进家人群。",
      "学院说导师由系统统一分配，不需要自己填报。群里这几天一直有人刷新分组名单；午睡醒来，你也摸过手机，发现名单终于发布了。",
    ].join("\n\n"),
    preview: "研究生导师分组名单已经发布",
    chainId: "senior-summer",
    stage: "act1",
    choices: [
      {
        id: "senior-summer-open-assignment",
        label: "看看分到了哪位老师",
        outcome: "名单上已经有了你的名字。",
        effects: {
          enqueueEvents: [createAdvisorReviewEvent(assignedAdvisor)],
        },
      },
    ],
  });
}

export function resolveAdvisorAssignment(
  state: GameState,
  resolution: FixedEventResolution,
): FixedResolutionResult {
  const candidate = resolution.advisorCandidate;
  if (!candidate) {
    return {
      nextState: state,
      outcome: "这次没有成功读取导师分配信息。",
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
    outcome: `系统将你分配给了${advisor.name}讲师。你记下了导师和实验室信息。`,
    enqueueEvents: [createSeniorSummerResultEvent(advisor.id, candidate)],
  };
}
