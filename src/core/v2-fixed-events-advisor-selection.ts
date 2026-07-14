import { createAdvisorProgressStateFromValues } from "./v2-advisor-progress";
import {
  createFixedEvent,
  type FixedResolutionResult,
} from "./v2-fixed-events-shared";
import {
  getAdvisorDefinition,
  getGraduationScoreTarget,
} from "./v2-progression";
import { tryAddRelationship } from "./v2-relationship-rules";
import type { AdvisorTierId, FixedEventResolution, GameState, PendingEvent } from "./v2-types";

interface AdvisorSelectionCandidateConfig {
  advisorId: AdvisorTierId;
  researchResource: number;
  affinity: number;
  taskMultiplier: number;
  hint: string;
}

const ADVISOR_SELECTION_CANDIDATES: AdvisorSelectionCandidateConfig[] = [
  {
    advisorId: "level1",
    researchResource: 12,
    affinity: 2,
    taskMultiplier: 10,
    hint: "顶级课题组，资源最强，但毕业线和转博线都最紧。",
  },
  {
    advisorId: "level2",
    researchResource: 10,
    affinity: 3,
    taskMultiplier: 9,
    hint: "项目和平台都很硬，节奏偏卷，适合冲高上限。",
  },
  {
    advisorId: "level3",
    researchResource: 8,
    affinity: 3,
    taskMultiplier: 8,
    hint: "中坚课题组，强度和回报更均衡。",
  },
  {
    advisorId: "level4",
    researchResource: 6,
    affinity: 4,
    taskMultiplier: 7,
    hint: "压力更可控，按部就班也能稳步推进。",
  },
  {
    advisorId: "level5",
    researchResource: 4,
    affinity: 4,
    taskMultiplier: 6,
    hint: "毕业压力最低，但科研资源也最少。",
  },
];

function createAdvisorSelectionAct2Event(): PendingEvent {
  return createFixedEvent({
    id: "advisor-selection-act2",
    title: "保研抉择",
    description: [
      "截止日期越来越近，你把每位导师的组内产出、毕业节奏、培养风格和学生反馈来回比对，生怕漏掉任何一个关键信号。",
      "你刷论坛、翻论文、看组会记录，甚至开始观察他们近几年的合作网络。你知道这不是“选一位老师”，而是在选一种未来生活方式。",
    ].join("\n\n"),
    preview: "选择你的研究生导师",
    chainId: "advisor-selection",
    stage: "act2",
    choices: ADVISOR_SELECTION_CANDIDATES.map((candidate) => {
      const advisor = getAdvisorDefinition(candidate.advisorId);
      return {
        id: `advisor-select-${advisor.id}`,
        label: `${advisor.name}，${advisor.title}`,
        outcome: candidate.hint,
        effects: {
          fixedEventResolution: {
            kind: "advisor-select-tier",
            advisorCandidate: {
              advisorId: candidate.advisorId,
              researchResource: candidate.researchResource,
              affinity: candidate.affinity,
              taskMultiplier: candidate.taskMultiplier,
            },
          },
        },
      };
    }),
  });
}

function createAdvisorSelectionResultEvent(
  advisorId: AdvisorTierId,
  candidate: NonNullable<FixedEventResolution["advisorCandidate"]>,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);
  return createFixedEvent({
    id: `advisor-selection-result-${advisor.id}`,
    title: "保研抉择",
    description: [
      `经过慎重比较，你最终决定拜入 ${advisor.name} 门下，正式把接下来几年的科研节奏锚定在这条路上。`,
      "办完入学手续、领到学生卡那一刻，你第一次真切意识到：从今天开始，你不再只是“有保研资格”，而是已经进入具体课题、具体组会和具体考核的真实现场。",
      "你的研究生生涯正式开场，接下来的每一步都会围绕这次选择持续展开。",
      `导师信息：科研资源 ${candidate.researchResource} | 亲和度 ${candidate.affinity}`,
      `月工资：硕士 ${advisor.salary.master} | 博士 ${advisor.salary.phd}`,
      `毕业要求：硕士 ${advisor.requirements.masterGrad} 分 | 博士 ${advisor.requirements.phdGrad} 分`,
      `转博要求：第 2 年 ${advisor.requirements.phdYear2} 分 | 第 3 年 ${advisor.requirements.phdYear3} 分`,
    ].join("\n\n"),
    preview: `你已确定导师：${advisor.name}`,
    chainId: "advisor-selection",
    stage: "result",
    choices: [
      {
        id: `advisor-selection-finish-${advisor.id}`,
        label: "开始科研生涯！",
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
      "大四的秋天，你站在人生的十字路口。身边同学有人冲秋招、有人备考公务员，而你拿到了来之不易的保研资格。",
      "夏令营面试和预推免等待的焦虑还没完全散去，新的压力已经到来：真正影响未来三到五年体验的，不是“有没有学校”，而是“跟谁做科研”。",
      `在${realYear}年的秋天，你陆续收到了多所高校的录取意向。选择权到了你手里，也意味着责任到了你手里。`,
      "你的表现足够出色，几位风格截然不同的导师都向你发来了邀请。",
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
    outcome: `你决定拜入 ${advisor.name} 门下，硕士毕业线 ${advisor.requirements.masterGrad}，第 2/3 年转博线 ${advisor.requirements.phdYear2}/${advisor.requirements.phdYear3}。`,
    enqueueEvents: [createAdvisorSelectionResultEvent(advisor.id, candidate)],
  };
}
