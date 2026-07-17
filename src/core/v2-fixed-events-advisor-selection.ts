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
      "学院给了四位讲师的联系方式。你把他们最近的项目、组会频率和毕业要求整理在一张表里。",
      "学院说明四人的培养条件相同。邮件都回了，组里的学生也给了各自的说法。填报系统今晚关闭，你需要写下一个名字。",
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
      `你在系统里填了${advisor.name}。第二天，${advisor.name}讲师回复邮件，学院随后确认了导师关系。`,
      "报到后，你领了学生卡，也被拉进了课题组群。下周一上午九点是第一次组会。",
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

export function createAdvisorSelectionAct1Event(state: GameState): PendingEvent {
  const realYear = 2029 + state.year;
  return createFixedEvent({
    id: "advisor-selection-act1",
    title: "保研抉择",
    description: [
      "大四开学不久，学院通知你：保研名额已经确认，接下来要在系统里填报导师。",
      `学院在 ${realYear} 年秋季发来了可接收学生的导师名单，填报截止到本周五。`,
      "你给名单上的老师发了邮件，参加了两场组会，也私下问了问组里的学生。",
      "现在该填名字了。",
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
