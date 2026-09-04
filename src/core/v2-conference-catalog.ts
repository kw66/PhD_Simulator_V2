import { getAcademicCalendarYear } from "./v2-calendar";
import type { PaperReviewerType, PaperTarget } from "./v2-types";
import {
  getBorderlineAcceptChance,
  getReviewerWeights,
  getReviewThresholds,
  REVIEWER_BASE_WEIGHTS,
  REVIEW_TARGET_AVERAGE_INFLUENCE,
} from "./v2-review-config";
import {
  CONFERENCES,
  CONFERENCE_PROFILES,
  DEFAULT_CONFERENCE_PROFILE,
  CONFERENCE_LOCATIONS,
  MAINLAND_LOCATIONS,
  MAINLAND_ONLY_CONFERENCES,
  type ConferenceInfo,
  type ConferenceLocation,
} from "./v2-conference-catalog-data";

function getConferenceProfile(name: string) {
  return CONFERENCE_PROFILES[name] ?? DEFAULT_CONFERENCE_PROFILE;
}

const REFERENCE_REVIEWER_TYPES: readonly PaperReviewerType[] = REVIEWER_BASE_WEIGHTS.map(([type]) => type);
const referenceScoreCache = new Map<string, number>();

function getReferenceAcceptanceProbability(target: PaperTarget, score: number, influence: number, academicYear: number): number {
  const thresholds = getReviewThresholds(target, influence);
  const weights = Object.fromEntries(getReviewerWeights(academicYear)) as Record<PaperReviewerType, number>;
  const decisions = Object.fromEntries(REFERENCE_REVIEWER_TYPES.map((type) => {
    const { reject, borderline: accept } = thresholds[type];
    return [type, score < reject ? -1 : score < accept ? 0 : 1];
  })) as Record<PaperReviewerType, -1 | 0 | 1>;
  let probability = 0;
  for (const first of REFERENCE_REVIEWER_TYPES) {
    for (const second of REFERENCE_REVIEWER_TYPES) {
      for (const third of REFERENCE_REVIEWER_TYPES) {
        const totalReviewScore = decisions[first] + decisions[second] + decisions[third];
        const combinationProbability = weights[first] * weights[second] * weights[third];
        const accepted = totalReviewScore >= 2
          ? 1
          : totalReviewScore <= -2
            ? 0
            : getBorderlineAcceptChance(target, score, totalReviewScore as -1 | 0 | 1);
        probability += combinationProbability * accepted;
      }
    }
  }
  return probability;
}

export function getConferenceReferenceScore(target: PaperTarget, influence: number, academicYear = 1): number {
  const normalizedInfluence = Number.isFinite(influence) && influence > 0 ? influence : REVIEW_TARGET_AVERAGE_INFLUENCE[target];
  const normalizedYear = Math.max(1, Math.floor(Number.isFinite(academicYear) ? academicYear : 1));
  const key = `${target}:${normalizedInfluence.toFixed(4)}:${normalizedYear}`;
  const cached = referenceScoreCache.get(key);
  if (cached !== undefined) return cached;
  let referenceScore = 240;
  for (let score = 1; score <= 240; score += 1) {
    if (getReferenceAcceptanceProbability(target, score, normalizedInfluence, normalizedYear) >= 0.5) {
      referenceScore = score;
      break;
    }
  }
  referenceScoreCache.set(key, referenceScore);
  return referenceScore;
}

function createConferenceInfo(
  name: string,
  fullName: string,
  field: string,
  year: number,
  target: PaperTarget,
  academicYear: number,
): ConferenceInfo {
  const profile = getConferenceProfile(name);
  return {
    name,
    fullName,
    field,
    year,
    influence: profile.influence,
    referenceScore: getConferenceReferenceScore(target, profile.influence, academicYear),
  };
}

function getGradeSeedOffset(target: PaperTarget): number {
  if (target === "A") return 0;
  if (target === "B") return 1;
  return 2;
}

function getDeterministicLocation(
  locations: ConferenceLocation[],
  gameMonth: number,
  gameYear: number,
  target: PaperTarget,
  locationSeed?: number | null,
): ConferenceLocation {
  if (locations.length === 0) {
    return { city: "未知", country: "未知", region: "west" };
  }
  const baseSeed = gameYear * 997 + gameMonth * 131 + getGradeSeedOffset(target) * 37;
  if (typeof locationSeed !== "number" || !Number.isFinite(locationSeed)) {
    const index = ((baseSeed % locations.length) + locations.length) % locations.length;
    return locations[index] ?? locations[0]!;
  }
  let mixedSeed = (Math.floor(locationSeed) ^ baseSeed) >>> 0;
  mixedSeed = Math.imul(mixedSeed ^ (mixedSeed >>> 16), 0x45d9f3b) >>> 0;
  mixedSeed = Math.imul(mixedSeed ^ (mixedSeed >>> 16), 0x45d9f3b) >>> 0;
  mixedSeed = (mixedSeed ^ (mixedSeed >>> 16)) >>> 0;
  const index = mixedSeed % locations.length;
  return locations[index] ?? locations[0]!;
}

export function createConferenceLocationSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] ?? 0;
  }
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

export function getRealConferenceYear(gameYear: number, gameMonth: number): number {
  return getAcademicCalendarYear(gameYear, gameMonth);
}

export function getConferenceInfo(gameMonth: number, target: PaperTarget, gameYear: number): ConferenceInfo {
  const month = Number(gameMonth || 0);
  const year = Number(gameYear || 1);
  if (month === 0 || !CONFERENCES[month]) {
    return createConferenceInfo("-", "入学前无会议", "-", year, target, year);
  }

  const conference = CONFERENCES[month][target] ?? CONFERENCES[month].C;
  const realYear = getRealConferenceYear(year, month);
  if (conference.alternates) {
    const selected = realYear % 2 === 1 ? conference.alternates.odd : conference.alternates.even;
    return createConferenceInfo(selected.name, selected.fullName, conference.field, realYear, target, year);
  }
  return createConferenceInfo(conference.name, conference.fullName ?? conference.name, conference.field, realYear, target, year);
}

export function getConferenceLocation(
  gameMonth: number,
  target: PaperTarget,
  gameYear: number,
  locationSeed?: number | null,
): ConferenceLocation {
  const month = Number(gameMonth || 1);
  const year = Number(gameYear || 1);
  const isMainlandOnly = MAINLAND_ONLY_CONFERENCES[month]?.includes(target) === true;
  const pool = isMainlandOnly ? MAINLAND_LOCATIONS : CONFERENCE_LOCATIONS;
  return getDeterministicLocation(pool, month, year, target, locationSeed);
}
