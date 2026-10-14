import { applyPlayerAttributeChange, previewPlayerAttributeChange } from "./v2-player-attributes";
import { canAddRelationship } from "./v2-relationship-rules";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { applyTierResist, formatTierResistedOutcome } from "./v2-sanity-rules";
import { getFellowName } from "./v2-fellow-progression";
import type { EventChoice, FellowProfileAddition, FellowProgressProfile, GameState } from "./v2-types";

export function getJuniorDelegationSocialChange(state: GameState, ordinaryChange: number): number {
  return state.selectedRoleId === "social" && getRoleTalentLevel(state, "junior-delegation") > 0
    && state.fellowProgressState.some((fellow) => fellow.type === "junior") ? 0 : ordinaryChange;
}

export function createJuniorDelegationTalent(state: GameState, getRoll: () => number): {
  effects: Pick<EventChoice["effects"], "juniorDelegationRoll">;
  outcome: string;
} {
  const juniors = state.fellowProgressState.filter((fellow) => fellow.type === "junior");
  const rank = state.selectedRoleId === "social" ? getRoleTalentLevel(state, "junior-bond") : 0;
  if (!rank || !juniors.length) return { effects: {}, outcome: "" };
  const roll = Math.max(0, Math.min(0.999999999999, getRoll()));
  const junior = juniors[Math.floor(roll * juniors.length)]!;
  const reward = applyTierResist(rank, junior.affinity);
  return { effects: { juniorDelegationRoll: roll },
    outcome: `｜${getFellowName(junior)}${formatTierResistedOutcome("默契", rank, reward)}` };
}

export function applyJuniorDelegationTalent(state: GameState, roll: number | undefined): GameState {
  if (roll === undefined || !Number.isFinite(roll) || state.selectedRoleId !== "social") return state;
  const rank = getRoleTalentLevel(state, "junior-bond");
  const juniors = state.fellowProgressState.filter((fellow) => fellow.type === "junior");
  if (!rank || !juniors.length) return state;
  const junior = juniors[Math.floor(Math.max(0, Math.min(0.999999999999, roll)) * juniors.length)]!;
  const gain = applyTierResist(rank, junior.affinity).effectiveChange;
  return { ...state, fellowProgressState: state.fellowProgressState.map((fellow) => fellow.id === junior.id
    ? { ...fellow, affinity: Number((fellow.affinity + gain).toFixed(10)) } : fellow) };
}

export function getFellowOverflowEffects(state: GameState, candidate?: FellowProfileAddition): Pick<EventChoice["effects"], "fellowOverflowAttempts" | "fellowOverflowCandidates"> {
  return state.selectedRoleId === "social" && getRoleTalentLevel(state, "overflow-social") > 0
    ? { fellowOverflowAttempts: 1, ...(candidate ? { fellowOverflowCandidates: [candidate] } : {}) } : {};
}

export function getFellowOverflowOutcome(state: GameState): string {
  return state.selectedRoleId === "social" && getRoleTalentLevel(state, "overflow-social") > 0
    ? `条件：人际栏已满｜结果：${formatTierResistedOutcome("社交", 1, previewPlayerAttributeChange(state, "social", 1))}`
    : "条件：人际栏已满｜结果：无事发生。";
}

export function settleFellowRecruitmentTalent(before: GameState, after: GameState, overflowAttempts = 0): GameState {
  if (after.selectedRoleId === "social-reversed") {
    const previousIds = new Set(before.fellowProgressState.map((fellow) => fellow.id));
    const count = after.fellowProgressState.filter((fellow) => !previousIds.has(fellow.id)).length;
    const rank = getRoleTalentLevel(after, "fellow-add-social");
    for (let index = 0; index < count && rank > 0; index++) after = applyPlayerAttributeChange(after, "social", rank).state;
  }
  if (after.selectedRoleId === "social" && getRoleTalentLevel(after, "overflow-social") > 0
    && !canAddRelationship(after.relationshipState, "peer")) {
    for (let index = 0; index < overflowAttempts; index++) after = applyPlayerAttributeChange(after, "social", 1).state;
  }
  return after;
}

/** Only explicit player removal calls this; graduation and other lifecycle departures do not. */
export function settleFellowRemovalTalent(state: GameState, removed: FellowProgressProfile): GameState {
  if (state.selectedRoleId !== "social-reversed") return state;
  const conversion = getRoleTalentLevel(state, "affinity-conversion") > 0 ? Math.max(0, Math.floor(removed.affinity)) : 0;
  const rewards = [0, 0, 0, 0, 0];
  for (let point = 0; point < conversion; point++) rewards[point % 5]! += 1;
  const [favor, research, sanCap, favorCap, researchCap] = rewards as [number, number, number, number, number];
  state = { ...state, sanCap: state.sanCap + sanCap,
    researchCapacityState: { ...state.researchCapacityState, otherCapBonus: state.researchCapacityState.otherCapBonus + researchCap },
    roleTalents: { ...state.roleTalents!, capBonuses: { ...state.roleTalents?.capBonuses,
      favor: (state.roleTalents?.capBonuses?.favor ?? 0) + favorCap } } };
  const loss = getRoleTalentLevel(state, "fellow-remove-social");
  if (loss) state = applyPlayerAttributeChange(state, "social", -loss).state;
  if (favor) state = applyPlayerAttributeChange(state, "favor", favor).state;
  if (research) state = applyPlayerAttributeChange(state, "research", research).state;
  return state;
}
