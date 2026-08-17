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
import type {
  AdvisorId,
  FixedEventAdvisorIntel,
  FixedEventResolution,
  GameState,
  PendingEvent,
} from "./v2-types";

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
  reporting: ["周报 + 组会", "每周组会", "隔周组会", "每月组会", "按需组会", "周报为主"],
  projects: ["项目少", "偶有项目", "科研为主", "横向较少", "节点集中", "项目可选"],
  internship: ["可实习", "提前沟通", "支持实习", "研二可实习", "有成果可实习", "不限制实习"],
  guidance: ["指导少", "给方向", "可单独约", "定期反馈", "亲自改稿", "同门带得多"],
  computing: ["资源较少", "资源够用", "资源充足", "显卡需排队", "有组内服务器", "可借校内算力"],
  temperament: ["老师宽和", "老师好沟通", "老师耐心", "回复及时", "要求直接", "比较随和"],
  atmosphere: ["氛围好", "同门融洽", "氛围轻松", "合作较多", "各做各的", "组内常交流"],
  focus: ["偏算法研究", "偏工程落地", "偏论文导向", "选题较自由", "交叉方向多", "方向较稳定"],
  pace: ["节奏平稳", "节点前忙", "时间自由", "作息规律", "进度抓得紧", "平时较松"],
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

function createRandomAdvisorIntel(getRoll: RandomRollProvider): FixedEventAdvisorIntel {
  return {
    reporting: pickRandomText(ADVISOR_INTEL_OPTIONS.reporting, getRoll),
    projects: pickRandomText(ADVISOR_INTEL_OPTIONS.projects, getRoll),
    internship: pickRandomText(ADVISOR_INTEL_OPTIONS.internship, getRoll),
    guidance: pickRandomText(ADVISOR_INTEL_OPTIONS.guidance, getRoll),
    computing: pickRandomText(ADVISOR_INTEL_OPTIONS.computing, getRoll),
    temperament: pickRandomText(ADVISOR_INTEL_OPTIONS.temperament, getRoll),
    atmosphere: pickRandomText(ADVISOR_INTEL_OPTIONS.atmosphere, getRoll),
    focus: pickRandomText(ADVISOR_INTEL_OPTIONS.focus, getRoll),
    pace: pickRandomText(ADVISOR_INTEL_OPTIONS.pace, getRoll),
  };
}

function createDifferentAdvisorName(
  currentName: string,
  getRoll: RandomRollProvider,
): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextName = generateRandomChineseName(getRoll);
    if (nextName !== currentName) return nextName;
  }

  return currentName === "李旭" ? "王晨" : "李旭";
}

function createDifferentAdvisorIntel(
  currentIntel: FixedEventAdvisorIntel,
  getRoll: RandomRollProvider,
): FixedEventAdvisorIntel {
  const nextIntel = createRandomAdvisorIntel(getRoll);
  if (Object.keys(currentIntel).some((key) => {
    const typedKey = key as keyof FixedEventAdvisorIntel;
    return currentIntel[typedKey] !== nextIntel[typedKey];
  })) {
    return nextIntel;
  }

  const currentIndex = ADVISOR_INTEL_OPTIONS.reporting.indexOf(
    currentIntel.reporting as typeof ADVISOR_INTEL_OPTIONS.reporting[number],
  );
  return {
    ...nextIntel,
    reporting: ADVISOR_INTEL_OPTIONS.reporting[(currentIndex + 1) % ADVISOR_INTEL_OPTIONS.reporting.length]
      ?? ADVISOR_INTEL_OPTIONS.reporting[0],
  };
}

function createAdvisorInfoEvent(
  advisorId: AdvisorId,
  advisorName: string,
  intel: FixedEventAdvisorIntel,
): PendingEvent {
  const advisor = getAdvisorDefinition(advisorId);

  return createFixedEvent({
    id: `before-grad-school-advisor-info-${advisor.id}`,
    title: "读研之始",
    description: [
      `你给感兴趣的老师发了邮件。${advisorName}讲师回信后，你又找组里的学生问了问。`,
      [
        `搜集信息 · ${advisorName}讲师`,
        `${intel.reporting}｜${intel.projects}｜${intel.internship}`,
        `${intel.guidance}｜${intel.computing}｜${intel.temperament}`,
        `${intel.atmosphere}｜${intel.focus}｜${intel.pace}`,
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
      {
        id: `before-grad-school-reroll-${advisor.id}`,
        label: "换个导师",
        outcome: "",
        effects: {
          stayOnEvent: true,
          fixedEventResolution: {
            kind: "advisor-reroll",
            advisorCandidate: {
              advisorId,
              advisorName,
              ...LECTURER_INITIAL_PROFILE,
            },
            advisorIntel: intel,
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
    id: `before-grad-school-admission-${advisor.id}`,
    title: "读研之始",
    description: "录取通知书寄到了。你拍张照片晒到朋友圈，读研这件事终于有了实感。",
    preview: "收到录取通知书",
    chainId: "before-grad-school",
    stage: "result",
    choices: [
      {
        id: `before-grad-school-finish-${advisor.id}`,
        label: "准备报到",
        outcome: "准备入学。",
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
      "你是计算机类专业。大三下，还没想清楚是否喜欢科研，准备随大流继续读研。",
      "你备好个人陈述，投了夏令营和预推免，也梳理项目准备面试。几个月后，拿到心仪学校的预录取。接下来，该联系导师了。",
    ].join("\n\n"),
    preview: "拿到梦校预录取，准备联系导师",
    chainId: "before-grad-school",
    stage: "act1",
    choices: [
      {
        id: "before-grad-school-open-advisor-info",
        label: "联系导师",
        outcome: "查看导师信息。",
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
      outcome: "未确认导师信息。",
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
    outcome: `加入${candidate.advisorName}讲师的课题组，也进了实验室群。`,
    enqueueEvents: [createBeforeGradSchoolResultEvent(advisor.id)],
  };
}

export function resolveAdvisorReroll(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider = Math.random,
): FixedResolutionResult {
  const candidate = resolution.advisorCandidate;
  const currentIntel = resolution.advisorIntel;
  if (!candidate || !currentIntel) {
    return {
      nextState: state,
      outcome: "未找到可更换的导师信息。",
    };
  }

  const advisorName = createDifferentAdvisorName(candidate.advisorName, getRoll);
  const advisorIntel = createDifferentAdvisorIntel(currentIntel, getRoll);
  const refreshedEvent = createAdvisorInfoEvent(candidate.advisorId, advisorName, advisorIntel);
  const eventId = `before-grad-school-advisor-info-${candidate.advisorId}`;

  return {
    nextState: {
      ...state,
      eventQueue: state.eventQueue.map((event) => event.id === eventId
        ? {
            ...refreshedEvent,
            queueOrder: event.queueOrder,
            history: event.history,
          }
        : event),
    },
    outcome: `改为联系${advisorName}讲师。`,
  };
}
