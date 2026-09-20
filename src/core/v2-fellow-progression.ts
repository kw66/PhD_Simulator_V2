import type { FellowProfileAddition, FellowProgressProfile, FellowTaskType, FellowTypeId, Gender } from "./v2-types";
import { pickStableRandomName } from "./v2-random-name";
import { generatePaperTopic, type FixedPaperTopic } from "./v2-paper-topics";
import { getAcademicCalendarYear } from "./v2-calendar";
import { getCalendarForTotalMonths } from "./v2-progression";

const FELLOW_TASK_MAX = 100;

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
  return pickStableRandomName(`fellow:${Math.abs(Math.floor(seed))}:${gender}`);
}

export function getFellowName(profile: Pick<FellowProgressProfile, "id" | "name">): string {
  return profile.name?.trim() || pickStableRandomName(`fellow:${profile.id}`);
}

export function createGeneratedFellowProfileAddition(
  type: FellowTypeId,
  seed: number,
  gender = getStableGeneratedGender(seed),
): FellowProfileAddition {
  const normalizedSeed = Math.abs(Math.floor(seed));
  const profileBase = type === "senior"
    ? { research: 6 + normalizedSeed % 4, affinity: 1 }
    : type === "peer"
      ? { research: 3 + normalizedSeed % 4, affinity: 1 }
      : { research: normalizedSeed % 4, affinity: 1 };

  return { type, gender, name: getStableGeneratedFellowName(seed, gender), ...profileBase };
}

function createFellowProgressProfileId(type: FellowTypeId, startTotalMonths: number): string {
  return `${type}-${startTotalMonths}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getFellowResearchTopic(profile: Pick<FellowProgressProfile, "id" | "startTotalMonths" | "researchTopic">): FixedPaperTopic {
  if (profile.researchTopic) return profile.researchTopic;
  let seed = 2166136261;
  for (const character of profile.id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const calendar = getCalendarForTotalMonths(profile.startTotalMonths);
  const { topicId, topicLabel, heatMultiplier, prepublicationDecayRate } = generatePaperTopic(getAcademicCalendarYear(calendar.year, calendar.month), random);
  return { topicId, topicLabel, heatMultiplier, prepublicationDecayRate };
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
  const id = createFellowProgressProfileId(input.type, input.startTotalMonths);
  return {
    id,
    name: getFellowName({ id, name: input.name }),
    researchTopic: getFellowResearchTopic({ id, startTotalMonths: input.startTotalMonths }),
    type: input.type,
    gender: input.gender,
    research: Math.max(0, Math.floor(input.research)),
    affinity: Math.max(0, Math.min(20, Math.floor(input.affinity))),
    taskType: input.taskType ?? config.taskType,
    taskProgress: 0,
    taskMax: FELLOW_TASK_MAX,
    taskUsedThisMonth: false,
    startTotalMonths: input.startTotalMonths,
    affinityRewardedPaperIds: [],
  };
}
