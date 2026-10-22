import { createAchievementRunProgress } from "./v2-achievement-runtime-types";
import { roundMoney } from "./v2-money";
import { roundGreedConversion as precise } from "./v2-greed-rounding";
import { getTierResistChance } from "./v2-sanity-rules";
import type { GameState } from "./v2-types";

const ATTRIBUTES = ["research", "social", "favor"] as const;
/** Shared only with this role's private LCG; injected callbacks never use it. */
export interface GreedRandomCursor { value: number }

/**
 * Positive greed rewards have no role reactions or additional random draws.
 * Preserve every draw, cap/gain order and floating-point addition. Only small
 * numeric locals change in the loop; merge achievement extrema once at the end.
 */
export function applyGreedConversionBatch(
  state: GameState, count: number, roll: () => number, cursor?: GreedRandomCursor,
): GameState {
  const player = state.player;
  const talents = state.roleTalents!;
  const capacity = state.researchCapacityState;
  const values = ATTRIBUTES.map(stat => player[stat]);
  const growth = ATTRIBUTES.map(stat => talents.growthTotals?.[stat] ?? 0);
  const loss = ATTRIBUTES.map(stat => talents.lossTotals?.[stat] ?? 0);
  const bonuses = [capacity.otherCapBonus, talents.capBonuses?.social ?? 0, talents.capBonuses?.favor ?? 0];
  const researchBase = capacity.baseCap + capacity.jointTrainingCitationCapBonus;
  const minima = [...values], peaks = [...values], seen = [false, false, false];
  let san = player.san, money = player.money;
  let sampled = false, firstSan = 0, lastSan = 0, firstCap = 0, lastCap = 0;
  let minSpread = Infinity, maxSpread = -Infinity;
  let touchedCapacity = false, touchedSocialCap = false, touchedFavorCap = false;
  let seed = cursor?.value ?? 0;
  const spread = () => Math.max(values[0]!, values[1]!, values[2]!) - Math.min(values[0]!, values[1]!, values[2]!);

  for (let index = 0; index < count; index++) {
    // The seeded generator always yields [0,1). Multiplication by seven is
    // exact before division by 2^32. Callback clamping remains unchanged.
    let target: number;
    if (cursor) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      target = Math.floor(seed * 7 / 4294967296);
    } else target = Math.max(0, Math.min(6, Math.floor(roll() * 7)));

    if (target === 0) san = Math.max(san, Math.min(state.sanCap, san + 1));
    else if (target <= 3) {
      if (!sampled) {
        sampled = true; firstSan = san; firstCap = researchBase + bonuses[0]!;
        minSpread = maxSpread = spread(); money = roundMoney(money);
      }
      const stat = target - 1;
      const current = values[stat]!;
      const maximum = Math.max(0, (stat === 0 ? researchBase : 20) + bonuses[stat]!);
      // All four raw +1 / zero-reduction retained values are exact literals.
      const retained = 1 - getTierResistChance(current);
      const gain = precise(Math.min(retained, Math.max(0, maximum - current)));
      values[stat] = precise(current + gain);
      growth[stat] = precise(growth[stat]! + Math.max(0, gain));
      // Each later loss update adds zero to this same normalized number.
      if (!seen[stat]) { seen[stat] = true; loss[stat] = precise(loss[stat]! + Math.max(0, -gain)); }
      minima[stat] = Math.min(minima[stat]!, values[stat]!);
      peaks[stat] = Math.max(peaks[stat]!, values[stat]!);
      const currentSpread = spread();
      minSpread = Math.min(minSpread, currentSpread); maxSpread = Math.max(maxSpread, currentSpread);
      lastSan = san; lastCap = researchBase + bonuses[0]!;
    } else {
      const stat = target - 4;
      bonuses[stat] = bonuses[stat]! + 1;
      if (stat === 0) touchedCapacity = true;
      else if (stat === 1) touchedSocialCap = true;
      else touchedFavorCap = true;
    }
  }
  if (cursor) cursor.value = seed;

  const nextTalents = { ...talents, pendingMoneyConversions: 0 };
  if (sampled) {
    nextTalents.growthTotals = { ...talents.growthTotals }; nextTalents.lossTotals = { ...talents.lossTotals };
    for (let index = 0; index < 3; index++) if (seen[index]) {
      nextTalents.growthTotals[ATTRIBUTES[index]!] = growth[index]!;
      nextTalents.lossTotals[ATTRIBUTES[index]!] = loss[index]!;
    }
  }
  if (touchedSocialCap || touchedFavorCap) {
    nextTalents.capBonuses = { ...talents.capBonuses };
    if (touchedSocialCap) nextTalents.capBonuses.social = bonuses[1]!;
    if (touchedFavorCap) nextTalents.capBonuses.favor = bonuses[2]!;
  }
  let achievement = state.achievementProgress;
  if (sampled) {
    const original = achievement ?? createAchievementRunProgress();
    achievement = { ...original, peaks: { ...original.peaks }, minima: { ...original.minima } };
    const sample = (key: string, value: number) => {
      if (!Number.isFinite(value)) return;
      achievement!.peaks[key] = Math.max(achievement!.peaks[key] ?? -Infinity, value);
      achievement!.minima[key] = Math.min(achievement!.minima[key] ?? Infinity, value);
    };
    for (let index = 0; index < 3; index++) {
      sample(ATTRIBUTES[index]!, minima[index]!); sample(ATTRIBUTES[index]!, peaks[index]!);
      if (state.degree === "master") {
        sample(`master:${ATTRIBUTES[index]!}`, minima[index]!); sample(`master:${ATTRIBUTES[index]!}`, peaks[index]!);
      }
    }
    // SAN and raw research cap only increase. Preserve first/last attribute
    // samples: trailing SAN/cap draws must not add new achievement samples.
    sample("san", firstSan); sample("san", lastSan);
    sample("money", player.money); sample("money", money); sample("san-cap", state.sanCap);
    sample("research-cap", firstCap); sample("research-cap", lastCap);
    sample("attribute-spread", minSpread); sample("attribute-spread", maxSpread);
  }
  return {
    ...state, player: { ...player, san, money, research: values[0]!, social: values[1]!, favor: values[2]! },
    roleTalents: nextTalents,
    researchCapacityState: touchedCapacity ? { ...capacity, otherCapBonus: bonuses[0]! } : capacity,
    ...(sampled ? { achievementProgress: achievement } : {}),
  };
}
