import type { FellowProgressProfile, FellowTaskType, FellowTypeId } from "./v2-types";

const FELLOW_TASK_MAX = 60;
const FELLOW_RELATION_MAX = 40;

const FELLOW_CONFIG: Record<FellowTypeId, {
  researchRange: [number, number];
  affinityRange: [number, number];
  taskType: FellowTaskType;
  sanCost: number;
}> = {
  senior: {
    researchRange: [4, 12],
    affinityRange: [2, 3],
    taskType: "writing",
    sanCost: 4,
  },
  peer: {
    researchRange: [3, 9],
    affinityRange: [3, 5],
    taskType: "experiment",
    sanCost: 3,
  },
  junior: {
    researchRange: [0, 6],
    affinityRange: [2, 4],
    taskType: "idea",
    sanCost: 2,
  },
};

export interface FellowTaskAdvanceResult {
  fellowProgressProfile: FellowProgressProfile;
  sanCost: number;
  growth: number;
  completed: boolean;
  paperBonus: number;
  taskType: FellowTaskType;
}

function getSafeRoll(getRoll: () => number): number {
  const rawRoll = getRoll();
  if (!Number.isFinite(rawRoll)) {
    return 0;
  }
  return Math.min(0.999999, Math.max(0, rawRoll));
}

function randomIntInRange(range: [number, number], getRoll: () => number): number {
  const [minValue, maxValue] = range;
  return minValue + Math.floor(getSafeRoll(getRoll) * (maxValue - minValue + 1));
}

export function isFellowType(value: string): value is FellowTypeId {
  return value === "senior" || value === "peer" || value === "junior";
}

export function getFellowTypeLabel(type: FellowTypeId): string {
  switch (type) {
    case "senior":
      return "师兄师姐";
    case "peer":
      return "同级";
    case "junior":
      return "师弟师妹";
    default:
      return "同门";
  }
}

export function getFellowTaskLabel(taskType: FellowTaskType): string {
  switch (taskType) {
    case "idea":
      return "帮想 idea";
    case "experiment":
      return "帮做实验";
    case "writing":
      return "帮写论文";
    default:
      return "帮忙推进";
  }
}

export function getFellowTaskSanCost(taskType: FellowTaskType): number {
  switch (taskType) {
    case "idea":
      return 2;
    case "experiment":
      return 3;
    case "writing":
      return 4;
    default:
      return 0;
  }
}

function createFellowProgressProfileId(type: FellowTypeId, startTotalMonths: number): string {

  return `${type}-${startTotalMonths}-${Math.random().toString(36).slice(2, 8)}`;

}



export function createCustomFellowProgressProfile(input: {

  type: FellowTypeId;

  startTotalMonths: number;

  research: number;

  affinity: number;

  name?: string;

  taskType?: FellowTaskType;

}): FellowProgressProfile {

  const config = FELLOW_CONFIG[input.type];

  return {

    id: createFellowProgressProfileId(input.type, input.startTotalMonths),

    ...(input.name ? { name: input.name } : {}),

    type: input.type,

    research: Math.max(0, Math.floor(input.research)),

    affinity: Math.max(0, Math.min(20, Math.floor(input.affinity))),

    taskType: input.taskType ?? config.taskType,

    taskProgress: 0,

    taskMax: FELLOW_TASK_MAX,

    relationProgress: 0,

    relationMax: FELLOW_RELATION_MAX,

    canInteract: false,

    taskUsedThisMonth: false,

    completedTaskCount: 0,

    interactCount: 0,

    startTotalMonths: input.startTotalMonths,

  };

}



export function createFellowProgressProfile(
  type: FellowTypeId,
  startTotalMonths: number,
  getRoll: () => number = Math.random,
): FellowProgressProfile {
  const config = FELLOW_CONFIG[type];
  return {
    id: `${type}-${startTotalMonths}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    research: randomIntInRange(config.researchRange, getRoll),
    affinity: randomIntInRange(config.affinityRange, getRoll),
    taskType: config.taskType,
    taskProgress: 0,
    taskMax: FELLOW_TASK_MAX,
    relationProgress: 0,
    relationMax: FELLOW_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
    completedTaskCount: 0,
    interactCount: 0,
    startTotalMonths,
  };
}

export function tickFellowProgressForMonth(
  profiles: FellowProgressProfile[],
  social: number,
): FellowProgressProfile[] {
  return profiles.map((profile) => {
    const relationGrowth = Math.max(0, social + profile.affinity);
    if (relationGrowth <= 0) {
      return {
        ...profile,
        taskUsedThisMonth: false,
      };
    }

    const nextRelationProgress = profile.relationProgress + relationGrowth;
    if (nextRelationProgress < profile.relationMax) {
      return {
        ...profile,
        taskUsedThisMonth: false,
        relationProgress: nextRelationProgress,
      };
    }

    return {
      ...profile,
      taskUsedThisMonth: false,
      relationProgress: nextRelationProgress - profile.relationMax,
      canInteract: true,
    };
  });
}

export function resolveFellowTaskAdvance(
  profile: FellowProgressProfile,
  playerResearch: number,
  input: {
    isFree: boolean;
    consumeInteraction: boolean;
    getRoll?: () => number;
  },
): FellowTaskAdvanceResult {
  const getRoll = input.getRoll ?? Math.random;
  const growth = Math.floor(playerResearch * 0.5) + Math.floor(getSafeRoll(getRoll) * 6) + (input.isFree ? 5 : 0);
  const nextTaskProgress = profile.taskProgress + growth;
  let nextProfile: FellowProgressProfile = {
    ...profile,
    taskProgress: nextTaskProgress,
    canInteract: input.consumeInteraction ? false : profile.canInteract,
    taskUsedThisMonth: input.isFree ? profile.taskUsedThisMonth : true,
    interactCount: input.consumeInteraction ? profile.interactCount + 1 : profile.interactCount,
  };

  if (nextTaskProgress < profile.taskMax) {
    return {
      fellowProgressProfile: nextProfile,
      sanCost: input.isFree ? 0 : getFellowTaskSanCost(profile.taskType),
      growth,
      completed: false,
      paperBonus: 0,
      taskType: profile.taskType,
    };
  }

  nextProfile = {
    ...nextProfile,
    affinity: Math.min(20, profile.affinity + 1),
    taskProgress: nextTaskProgress - profile.taskMax,
    completedTaskCount: profile.completedTaskCount + 1,
  };

  return {
    fellowProgressProfile: nextProfile,
    sanCost: input.isFree ? 0 : getFellowTaskSanCost(profile.taskType),
    growth,
    completed: true,
    paperBonus: nextProfile.research,
    taskType: profile.taskType,
  };
}
