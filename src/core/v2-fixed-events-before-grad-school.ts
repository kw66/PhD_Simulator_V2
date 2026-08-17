import { createAdvisorProgressStateFromValues } from "./v2-advisor-progress";
import { ADVISOR_REQUIREMENTS, ADVISOR_SALARY, SCORE_BY_TARGET } from "./v2-content";
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
  reporting: ["周报 + 组会", "每周组会", "隔周组会"],
  projects: ["项目少", "偶有项目", "科研为主"],
  internship: ["可实习", "提前沟通", "支持实习"],
  guidance: ["指导少", "给方向", "可单独约"],
  computing: ["资源较少", "资源够用", "资源充足"],
  temperament: ["老师宽和", "老师好沟通", "老师耐心"],
  atmosphere: ["氛围好", "同门融洽", "氛围轻松"],
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
      `学院网站看不出实验室的日常。你给对应的老师发了邮件，${advisorName}讲师回了信。随后，你又向组里的学生打听情况。`,
      [
        `搜集信息 · ${advisorName}讲师`,
        `${intel.reporting}｜${intel.projects}｜${intel.internship}`,
        `${intel.guidance}｜${intel.computing}｜${intel.temperament}｜${intel.atmosphere}`,
      ].join("\n"),
      `工资：硕士 ${ADVISOR_SALARY.master}｜博士 ${ADVISOR_SALARY.phd}\n科研分：论文录用，C 类 +${SCORE_BY_TARGET.C}｜B 类 +${SCORE_BY_TARGET.B}｜A 类 +${SCORE_BY_TARGET.A}\n毕业：硕士 ${ADVISOR_REQUIREMENTS.masterGrad} 分｜博士 ${ADVISOR_REQUIREMENTS.phdGrad} 分\n转博士：第 2 年 ${ADVISOR_REQUIREMENTS.phdYear2} 分｜第 3 年 ${ADVISOR_REQUIREMENTS.phdYear3} 分`,
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
      `你回复${advisorName}讲师，希望加入课题组。大四开学后，你进入推免资格名单。九月，推免系统正式开放，你填报学校、接受待录取，老师把你拉进了实验室群。`,
      "毕业后的暑假，你开始想象开学后的工位、第一次组会和第一篇投稿。紧张之外，也有些期待。",
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
      "你读的是计算机类专业。人工智能正热，学这个方向的人也越来越多。到了大三下学期，你还没想清楚自己是否喜欢科研，却还是随大流准备继续读研。",
      "你备好个人陈述，投了夏令营和预推免，也梳理项目准备面试。几个月后，你拿到心仪学校的预录取，保上了最想去的学校。接下来，该联系导师了。",
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
