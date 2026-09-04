import type { FellowProfileAddition, FellowProgressProfile, FellowTaskType, FellowTypeId, Gender } from "./v2-types";

const FELLOW_TASK_MAX = 60;
const FELLOW_RELATION_MAX = 40;
const GENERATED_FELLOW_NAMES: Record<Gender, readonly string[]> = {
  male: ["小明", "小华", "小刚", "小强", "小伟", "小杰", "小龙"],
  female: ["小红", "小丽", "小芳", "小燕", "小雪"],
};

const FELLOW_CONFIG: Record<FellowTypeId, {
  taskType: FellowTaskType;
}> = {
  senior: {
    taskType: "writing",
  },
  peer: {
    taskType: "experiment",
  },
  junior: {
    taskType: "idea",
  },
};

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

export function getFellowRoleLabel(type: FellowTypeId, gender: Gender): string {
  if (type === "senior") return gender === "male" ? "师兄" : "师姐";
  if (type === "junior") return gender === "male" ? "师弟" : "师妹";
  return "同门";
}

export function getFellowPronoun(gender: Gender): string {
  return gender === "male" ? "他" : "她";
}

export function getPlayerHonorific(gender: Gender): string {
  return gender === "male" ? "师兄" : "师姐";
}

export function getStableGeneratedGender(seed: number): Gender {
  return Math.abs(Math.floor(seed)) % 2 === 0 ? "male" : "female";
}

export function getStableGeneratedFellowName(seed: number, gender: Gender): string {
  const names = GENERATED_FELLOW_NAMES[gender];
  return names[Math.abs(Math.floor(seed)) % names.length] ?? (gender === "male" ? "小明" : "小红");
}

export function createGeneratedFellowProfileAddition(
  type: FellowTypeId,
  seed: number,
  gender = getStableGeneratedGender(seed),
): FellowProfileAddition {
  const normalizedSeed = Math.abs(Math.floor(seed));
  const profileBase = type === "senior"
    ? { research: 4 + normalizedSeed % 9, affinity: 2 + normalizedSeed % 2 }
    : type === "peer"
      ? { research: 3 + normalizedSeed % 7, affinity: 3 + normalizedSeed % 3 }
      : { research: normalizedSeed % 7, affinity: 2 + normalizedSeed % 3 };

  return { type, gender, name: getStableGeneratedFellowName(seed, gender), ...profileBase };
}

function createFellowProgressProfileId(type: FellowTypeId, startTotalMonths: number): string {
  return `${type}-${startTotalMonths}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCustomFellowProgressProfile(input: {
  type: FellowTypeId;
  gender: Gender;
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
    gender: input.gender,
    research: Math.max(0, Math.floor(input.research)),
    affinity: Math.max(0, Math.min(20, Math.floor(input.affinity))),
    taskType: input.taskType ?? config.taskType,
    taskProgress: 0,
    taskMax: FELLOW_TASK_MAX,
    relationProgress: 0,
    relationMax: FELLOW_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
    startTotalMonths: input.startTotalMonths,
  };
}
