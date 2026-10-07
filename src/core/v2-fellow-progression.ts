import type { Degree, FellowProfileAddition, FellowProgressProfile, FellowTaskType, FellowTypeId, Gender } from "./v2-types";
import { pickRandomAdvisorName, pickStableRandomName } from "./v2-random-name";
import { generatePaperTopic, type FixedPaperTopic } from "./v2-paper-topics";
import { getAcademicCalendarYear } from "./v2-calendar";
import { getCalendarForTotalMonths } from "./v2-progression";
import { generateRelationshipResearch } from "./v2-relationship-research";
import { createRecruitmentRandom } from "./v2-recruitment-random";
import { getRecruitmentAcademicYears } from "./v2-recruitment-eligibility";

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

export function getFellowsInCardOrder(profiles: readonly FellowProgressProfile[]): FellowProgressProfile[] {
  return profiles.map((profile, index) => ({
    profile,
    order: typeof profile.startTotalMonths === "number" ? profile.startTotalMonths : 1000 + index,
  })).sort((left, right) => left.order - right.order).map(({ profile }) => profile);
}

export function getUniqueFellowName(candidate: string, usedNames: readonly string[], seed: string): string {
  const occupied = new Set(usedNames.map((name) => name.trim()).filter(Boolean));
  const normalized = candidate.trim();
  if (!occupied.has(normalized)) return normalized;
  for (let attempt = 1; attempt <= 64; attempt += 1) {
    const alternative = pickStableRandomName(`fellow:unique:${seed}:${attempt}`);
    if (!occupied.has(alternative)) return alternative;
  }
  return pickStableRandomName(`fellow:unique:${seed}:fallback`);
}

function createFellowResearchRandom(seed: number): () => number {
  let state = 2166136261;
  for (const character of `fellow:research:${seed}`) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGeneratedFellowProfileAddition(
  type: FellowTypeId,
  seed: number,
  gender?: Gender,
  usedNames: readonly string[] = [],
  getNameRoll?: () => number,
  academicContext?: { year: number; month?: number; fixedYear?: number },
  recruitmentSeed?: string,
): FellowProfileAddition {
  const normalizedSeed = Math.abs(Math.floor(seed));
  const genderRoll = recruitmentSeed === undefined ? getNameRoll : createRecruitmentRandom(recruitmentSeed, "gender");
  const nameRoll = recruitmentSeed === undefined ? getNameRoll : createRecruitmentRandom(recruitmentSeed, "name");
  const researchRoll = recruitmentSeed === undefined
    ? getNameRoll ?? createFellowResearchRandom(normalizedSeed)
    : createRecruitmentRandom(recruitmentSeed, "research");
  const resolvedGender = gender ?? (genderRoll
    ? (genderRoll() < 0.5 ? "male" : "female")
    : getStableGeneratedGender(seed));
  const occupied = new Set(usedNames.map((name) => name.trim()).filter(Boolean));
  let name = nameRoll
    ? pickRandomAdvisorName(nameRoll)
    : getStableGeneratedFellowName(seed, resolvedGender);
  if (occupied.has(name)) {
    if (nameRoll) {
      for (let attempt = 1; attempt <= 32; attempt += 1) {
        const candidate = pickRandomAdvisorName(nameRoll);
        if (!occupied.has(candidate)) {
          name = candidate;
          break;
        }
      }
    } else {
      for (let attempt = 1; attempt <= 32; attempt += 1) {
        const candidate = pickStableRandomName(`fellow:${Math.abs(Math.floor(seed))}:${resolvedGender}:unique:${attempt}`);
        if (!occupied.has(candidate)) {
          name = candidate;
          break;
        }
      }
    }
    if (occupied.has(name)) {
      name = getUniqueFellowName(name, usedNames, `random:${seed}`);
    }
  }
  const playerYear = Math.max(1, Math.min(6, academicContext?.year ?? 1));
  const candidateYears = academicContext ? getRecruitmentAcademicYears(type, academicContext) : [];
  if (academicContext && academicContext.fixedYear === undefined && candidateYears.length === 0) {
    throw new Error("No eligible recruitment cohort");
  }
  const academicYear = academicContext?.fixedYear ?? (!academicContext
    ? (type === "peer" ? 1 : type === "junior" ? 0 : 2)
    : candidateYears[normalizedSeed % candidateYears.length]!);
  const degree: Degree = academicYear >= 4 ? "phd" : "master";
  const initialResearchScore = [0, 0, 0, 1, 2, 3, 7][academicYear] ?? 0;
  return { type, gender: resolvedGender, name, affinity: 1,
    research: generateRelationshipResearch(academicYear, researchRoll),
    academicYear, degree, initialResearchScore,
    ...(academicContext ? { academicStartTotalMonths: (playerYear - 1) * 12 + 1 } : {}) };
}

function createFellowProgressProfileId(type: FellowTypeId, startTotalMonths: number, identitySeed?: string): string {
  if (identitySeed === undefined) return `${type}-${startTotalMonths}-${Math.random().toString(36).slice(2, 8)}`;
  const random = createRecruitmentRandom(identitySeed, "identity");
  const suffix = Array.from({ length: 2 }, () => Math.floor(random() * 4294967296).toString(36)).join("-");
  return `${type}-${startTotalMonths}-${suffix}`;
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
  usedNames?: readonly string[];
  longTermMentoring?: boolean;
  academicYear?: number;
  academicStartTotalMonths?: number;
  degree?: Degree;
  initialResearchScore?: number;
  identitySeed?: string;
}): FellowProgressProfile {
  const config = FELLOW_CONFIG[input.type];
  const id = createFellowProgressProfileId(input.type, input.startTotalMonths, input.identitySeed);
  const generatedName = input.name?.trim() || pickStableRandomName(`fellow:${id}`);
  return {
    id,
    name: getUniqueFellowName(generatedName, input.usedNames ?? [], id),
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
    academicYear: input.academicYear ?? 1,
    academicStartTotalMonths: input.academicStartTotalMonths ?? input.startTotalMonths,
    degree: input.degree ?? "master",
    initialResearchScore: input.initialResearchScore ?? 0,
    salaryRemainder: 0,
    nextMonthlyAction: "research",
    affinityRewardedPaperIds: [],
    longTermMentoring: input.longTermMentoring === true,
  };
}
