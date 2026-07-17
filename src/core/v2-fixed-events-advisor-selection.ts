import { createAdvisorProgressStateFromValues } from "./v2-advisor-progress";
import { ADVISOR_REQUIREMENTS, ADVISOR_SALARY } from "./v2-content";
import {
  createFixedEvent,
  type FixedResolutionResult,
} from "./v2-fixed-events-shared";
import {
  getAdvisorDefinition,
  getGraduationScoreTarget,
} from "./v2-progression";
import { tryAddRelationship } from "./v2-relationship-rules";
import type { AdvisorId, FixedEventResolution, GameState, PendingEvent } from "./v2-types";

interface AdvisorSelectionCandidateConfig {
  advisorId: AdvisorId;
}

const LECTURER_INITIAL_PROFILE = {
  researchResource: 4,
  affinity: 4,
  taskMultiplier: 6,
} as const;

const ADVISOR_SELECTION_CANDIDATES: AdvisorSelectionCandidateConfig[] = [
  { advisorId: "chen-ming" },
  { advisorId: "zhou-lan" },
  { advisorId: "lin-hao" },
  { advisorId: "zhao-ning" },
];

function createAdvisorSelectionAct2Event(): PendingEvent {
  return createFixedEvent({
    id: "advisor-selection-act2",
    title: "保研抉择",
    description: [
      "四位老师的回复陆续到了。有人约你聊了二十分钟，有人让你旁听了一次组会。你把研究方向、组会频率和毕业要求记在同一张表里，又找组里的学生问了些不方便写在邮件里的问题。",
      "四人的培养条件差不多，聊下来也各有各的好。填报系统今晚关闭，你盯着表格看了一会儿，最后还是要选一个名字。",
    ].join("\n\n"),
    preview: "选择你的研究生导师",
    chainId: "advisor-selection",
    stage: "act2",
    choices: ADVISOR_SELECTION_CANDIDATES.map((candidate) => {
      const advisor = getAdvisorDefinition(candidate.advisorId);
      return {
        id: `advisor-select-${advisor.id}`,
        label: advisor.name,
        outcome: "",
        effects: {
          fixedEventResolution: {
            kind: "advisor-select",
            advisorCandidate: {
              advisorId: candidate.advisorId,
              ...LECTURER_INITIAL_PROFILE,
            },
          },
        },
      };
    }),
  });
}

function createAdvisorSelectionResultEvent(
  advisorId: AdvisorId,
  candidate: NonNullable<FixedEventResolution["advisorCandidate"]>,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);
  return createFixedEvent({
    id: `advisor-selection-result-${advisor.id}`,
    title: "保研抉择",
    description: [
      `你最终在系统里填下了${advisor.name}。第二天，${advisor.name}讲师回了一封很短的邮件：“收到，开学见。”学院的确认通知也很快到了。`,
      "你把邮件截图发进宿舍群，又顺手收藏了课题组主页。离开学还有一段时间，你已经开始盘算：先把组里的论文读几篇，再补补实验工具，争取第一次组会别太狼狈。",
      "至于第一篇论文会写什么、以后会去哪里开会，现在都还不知道。但这些事，终于不再只是想象了。",
      `导师：${advisor.name} | 职称：讲师`,
      `导师信息：科研资源 ${candidate.researchResource} | 亲和度 ${candidate.affinity}`,
      `月工资：硕士 ${ADVISOR_SALARY.master} | 博士 ${ADVISOR_SALARY.phd}`,
      `毕业要求：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分 | 博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分`,
      `转博要求：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分 | 第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
    ].join("\n\n"),
    preview: `你已确定导师：${advisor.name}`,
    chainId: "advisor-selection",
    stage: "result",
    choices: [
      {
        id: `advisor-selection-finish-${advisor.id}`,
        label: "确认并入学",
        outcome: "",
        effects: {},
      },
    ],
  });
}

export function createAdvisorSelectionAct1Event(_state: GameState): PendingEvent {
  return createFixedEvent({
    id: "advisor-selection-act1",
    title: "保研抉择",
    description: [
      "保研名单公示那天，你在名单里找到自己的名字，来来回回看了好几遍。宿舍群里很快刷起了“恭喜”，你也终于敢把明年的计划写成“去读研”。",
      "你开始想象研究生生活：会有自己的工位，跟着课题组做项目，第一次投稿。运气好的话，也许能去一座没去过的城市开会；等第一篇论文录用，再把邮件截图发给家里。光是这么想，你已经有点期待开学了。",
      "当然，你也听说过改不完的论文、开不完的组会和突然压下来的任务。不过那些都还在以后，眼下更实际的是先选一位导师。",
      "没过几天，学院发来四位讲师的名单，要求本周五前在系统里填报。你发了邮件，也找组里的学生打听了一圈。现在，要写下一个名字了。",
    ].join("\n\n"),
    preview: "选择你的研究生导师",
    chainId: "advisor-selection",
    stage: "act1",
    choices: [
      {
        id: "advisor-selection-open",
        label: "进入最终选择",
        outcome: "",
        effects: {
          enqueueEvents: [createAdvisorSelectionAct2Event()],
        },
      },
    ],
  });
}

export function resolveAdvisorSelection(
  state: GameState,
  resolution: FixedEventResolution,
): FixedResolutionResult {
  const candidate = resolution.advisorCandidate;
  if (!candidate) {
    return {
      nextState: state,
      outcome: "这次没有成功确认导师信息。",
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
    outcome: `你选择了${advisor.name}讲师。硕士毕业线 ${ADVISOR_REQUIREMENTS.masterGrad}，第 2/3 年转博线 ${ADVISOR_REQUIREMENTS.phdYear2}/${ADVISOR_REQUIREMENTS.phdYear3}。`,
    enqueueEvents: [createAdvisorSelectionResultEvent(advisor.id, candidate)],
  };
}
