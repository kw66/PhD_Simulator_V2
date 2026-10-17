import { getPlayerAttributeCap } from "./v2-player-attributes";
import { getPaperMasteryCount } from "./v2-paper-mastery";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { GameState } from "./v2-types";

export const REWINDER_ATTRIBUTE_KEYS = [
  "san", "research", "social", "favor", "sanCap", "researchCap", "socialCap", "favorCap",
] as const;

/** Only the counters that change future growth rewards are carried across lives. */
const COMMON_GROWTH_COUNTER_KEYS = [
  "readCount", "partTimeWorkCount", "badmintonCount", "pokerCount",
  "terrariaCount", "magicTowerCount", "rocoCount",
] as const;
export const REWINDER_GROWTH_COUNTER_KEYS = [...COMMON_GROWTH_COUNTER_KEYS, "paperMasteryCount"] as const;
const LEGACY_GROWTH_COUNTER_KEYS = [
  "teachersDayErrandCount", "meetingCount", "domesticMeetingCount", "asiaMeetingCount", "westMeetingCount", "internshipCount",
] as const;

/** Replay must preserve the exact counters saved before the r7 growth redesign. */
export function getRewinderGrowthCounterKeys() {
  return usesGameplayRulesFrom("20261018-r7")
    ? REWINDER_GROWTH_COUNTER_KEYS : [...COMMON_GROWTH_COUNTER_KEYS, ...LEGACY_GROWTH_COUNTER_KEYS];
}

export interface RewinderGrowthSnapshot {
  attributes: Record<typeof REWINDER_ATTRIBUTE_KEYS[number], number>;
  growth: Record<typeof COMMON_GROWTH_COUNTER_KEYS[number], number>
    & Partial<Record<"paperMasteryCount" | typeof LEGACY_GROWTH_COUNTER_KEYS[number], number>>
    & { hasInternshipExperience?: boolean; hasJointTrainingExperience?: boolean };
}

const finite = (value: number): number => Number.isFinite(value) ? Math.max(0, value) : 0;
const count = (value: number): number => Math.floor(finite(value));
const round = (value: number): number => Number(value.toFixed(10));

/** Values rather than their sources: no equipment, buff, publication or cash is captured. */
export function captureRewinderGrowth(state: GameState): RewinderGrowthSnapshot {
  return {
    attributes: {
      san: finite(state.player.san), research: finite(state.player.research),
      social: finite(state.player.social), favor: finite(state.player.favor),
      sanCap: finite(state.sanCap), researchCap: finite(getPlayerAttributeCap(state, "research")),
      socialCap: finite(getPlayerAttributeCap(state, "social")), favorCap: finite(getPlayerAttributeCap(state, "favor")),
    },
    growth: {
      readCount: count(state.readingState.readCount), partTimeWorkCount: count(state.partTimeWorkCount),
      badmintonCount: count(state.eventCounters.badmintonCount), pokerCount: count(state.eventCounters.pokerCount),
      terrariaCount: count(state.eventCounters.terrariaCount), magicTowerCount: count(state.eventCounters.magicTowerCount),
      rocoCount: count(state.eventCounters.rocoCount),
      ...(usesGameplayRulesFrom("20261018-r7") ? { paperMasteryCount: getPaperMasteryCount(state) } : {
        teachersDayErrandCount: count(state.eventCounters.teachersDayErrandCount),
        meetingCount: count(state.eventCounters.meetingCount), domesticMeetingCount: count(state.eventCounters.domesticMeetingCount),
        asiaMeetingCount: count(state.eventCounters.asiaMeetingCount), westMeetingCount: count(state.eventCounters.westMeetingCount),
        internshipCount: count(state.internshipCount),
        hasInternshipExperience: !!state.conferenceCareerState.hasInternshipExperience || state.internshipCount > 0,
        hasJointTrainingExperience: state.conferenceEncounterState.bigBullCooperation || !!state.conferenceEncounterState.jointTrainingReward,
      }),
    },
  };
}

/** Merge individual maxima, never select one whole life at the expense of another. */
export function mergeRewinderGrowth(current: RewinderGrowthSnapshot, historical?: RewinderGrowthSnapshot): RewinderGrowthSnapshot {
  const attributes = { ...current.attributes };
  const growth: RewinderGrowthSnapshot["growth"] = Object.fromEntries(getRewinderGrowthCounterKeys().map(key => [key,
    Math.max(count(current.growth[key] ?? 0), count(historical?.growth[key] ?? 0)),
  ])) as Record<typeof COMMON_GROWTH_COUNTER_KEYS[number], number>;
  for (const key of REWINDER_ATTRIBUTE_KEYS) attributes[key] = Math.max(finite(attributes[key]), finite(historical?.attributes[key] ?? 0));
  if (!usesGameplayRulesFrom("20261018-r7")) {
    growth.hasInternshipExperience = !!current.growth.hasInternshipExperience || !!historical?.growth.hasInternshipExperience;
    growth.hasJointTrainingExperience = !!current.growth.hasJointTrainingExperience || !!historical?.growth.hasJointTrainingExperience;
  }
  return { attributes, growth };
}

/** Restoration is not an attribute reward: bypass resistance and do not replay milestones. */
export function applyRewinderGrowth(state: GameState, historical: RewinderGrowthSnapshot): GameState {
  if (state.selectedRoleId !== "rewinder") return state;
  const snapshot = mergeRewinderGrowth(captureRewinderGrowth(state), historical);
  const { attributes, growth } = snapshot;
  const researchCapDelta = round(attributes.researchCap - getPlayerAttributeCap(state, "research"));
  const socialCapDelta = round(attributes.socialCap - getPlayerAttributeCap(state, "social"));
  const favorCapDelta = round(attributes.favorCap - getPlayerAttributeCap(state, "favor"));
  return {
    ...state,
    player: { ...state.player, san: attributes.san, research: attributes.research, social: attributes.social, favor: attributes.favor },
    sanCap: attributes.sanCap,
    researchCapacityState: { ...state.researchCapacityState, otherCapBonus: round(state.researchCapacityState.otherCapBonus + researchCapDelta) },
    roleTalents: {
      ...state.roleTalents, levels: { ...(state.roleTalents?.levels ?? {}) },
      capBonuses: {
        ...state.roleTalents?.capBonuses,
        social: round((state.roleTalents?.capBonuses?.social ?? 0) + socialCapDelta),
        favor: round((state.roleTalents?.capBonuses?.favor ?? 0) + favorCapDelta),
      },
    },
    readingState: { ...state.readingState, readCount: growth.readCount },
    partTimeWorkCount: growth.partTimeWorkCount,
    ...((growth.paperMasteryCount ?? 0) > getPaperMasteryCount(state) ? { paperMasteryState: {
      count: growth.paperMasteryCount!,
      rewardedPaperIds: [...(state.paperMasteryState?.rewardedPaperIds ?? [])],
    } } : {}),
    eventCounters: {
      ...state.eventCounters,
      badmintonCount: growth.badmintonCount, pokerCount: growth.pokerCount,
      terrariaCount: growth.terrariaCount, magicTowerCount: growth.magicTowerCount, rocoCount: growth.rocoCount,
      ...(!usesGameplayRulesFrom("20261018-r7") ? {
        teachersDayErrandCount: growth.teachersDayErrandCount!,
        meetingCount: growth.meetingCount!, domesticMeetingCount: growth.domesticMeetingCount!,
        asiaMeetingCount: growth.asiaMeetingCount!, westMeetingCount: growth.westMeetingCount!,
      } : {}),
    },
    ...(!usesGameplayRulesFrom("20261018-r7") ? {
      internshipCount: growth.internshipCount!,
      conferenceCareerState: { ...state.conferenceCareerState, hasInternshipExperience: growth.hasInternshipExperience! },
      conferenceEncounterState: { ...state.conferenceEncounterState, bigBullCooperation: growth.hasJointTrainingExperience! },
    } : {}),
  };
}
