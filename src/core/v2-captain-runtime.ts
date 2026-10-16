import { gameRandom } from "./v2-game-random";
import { applyTierResist } from "./v2-sanity-rules";
import { applyPlayerAttributeChange } from "./v2-player-attributes";
import { creditFellowMoney, getFellowFinanceAccount } from "./v2-fellow-finance";
import { recordPersonalIncome, roundMoney } from "./v2-money";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import { recordTalentTrigger } from "./v2-talent-history";
import { CAPTAIN_TAG_IDS, createCaptainRunState, getCaptainActiveMembers, getCaptainAffinityCap,
  getCaptainLevel, getCaptainLoverId, getCaptainLoverIntimacyCap, getCaptainLoverResearchCap,
  getCaptainResearchCap, getCaptainTag, getCaptainTagCount, getCaptainCooperationMax, getCaptainLoverRouteMax, isCaptain, type CaptainTag } from "./v2-captain-state";
import type { GameState, RoleId } from "./v2-types";

const precise = (value: number): number => Number(value.toFixed(10));
export function initializeCaptain(state: GameState, levels: Partial<Record<RoleId, number>> = {}): GameState {
  if (state.selectedRoleId !== "research-captain") return state;
  return { ...state, captainState: createCaptainRunState(levels), actionState: { ...state.actionState, limit: 0 } };
}
export function rollCaptainTag(random: () => number = gameRandom): CaptainTag {
  return CAPTAIN_TAG_IDS[Math.max(0, Math.min(CAPTAIN_TAG_IDS.length - 1, Math.floor(random() * CAPTAIN_TAG_IDS.length)))]!;
}

/** Reconcile only newly joined identities. Rendering and replaying a loaded state never reapplies grants. */
export function syncCaptainMembers(state: GameState, random: () => number = gameRandom): GameState {
  if (!isCaptain(state)) return state;
  let next: GameState = state;
  for (const id of getCaptainActiveMembers(state)) {
    const captain = next.captainState!;
    if (captain.initializedMembers.includes(id)) continue;
    const tag = captain.tags[id] ?? rollCaptainTag(random);
    next = { ...next, captainState: { ...captain, tags: { ...captain.tags, [id]: tag },
      initializedMembers: [...captain.initializedMembers, id] } };
    const rank = next.captainState!.levels[tag];
    if (id === "advisor") continue;
    if (id === getCaptainLoverId(next)) {
      const lover = next.loverProgressState;
      next = { ...next, loverProgressState: { ...lover,
        ...(tag === "genius" ? { research: precise(lover.research + applyTierResist(rank, lover.research, random, getCaptainLoverResearchCap(next)).effectiveChange) } : {}),
        ...(tag === "social" ? { intimacy: precise(lover.intimacy + applyTierResist(rank, lover.intimacy, random, getCaptainLoverIntimacyCap(next)).effectiveChange) } : {}),
      } };
    } else next = { ...next, fellowProgressState: next.fellowProgressState.map((profile) => profile.id !== id ? profile : {
      ...profile,
      ...(tag === "genius" ? { research: precise(profile.research + applyTierResist(rank, profile.research, random, getCaptainResearchCap(next, profile)).effectiveChange) } : {}),
      ...(tag === "social" ? { affinity: precise(profile.affinity + applyTierResist(rank, profile.affinity, random, getCaptainAffinityCap(next, profile)).effectiveChange) } : {}),
    }) };
  }
  const count = getCaptainTagCount(next, "normal");
  if (next.fellowProgressState.some((profile) => profile.taskMax !== getCaptainCooperationMax(next, profile))) {
    next = { ...next, fellowProgressState: next.fellowProgressState.map((profile) => ({ ...profile, taskMax: getCaptainCooperationMax(next, profile) })) };
  }
  if (next.loverProgressState.active && next.loverProgressState.taskMax !== getCaptainLoverRouteMax(next)) {
    next = { ...next, loverProgressState: { ...next.loverProgressState, taskMax: getCaptainLoverRouteMax(next) } };
  }
  const current = next.buffs.find((buff) => buff.id === "captain-san-reduction");
  let buffs = next.buffs;
  if ((current?.activeOperationSanDelta ?? 0) !== -count) {
    buffs = buffs.filter((buff) => buff.id !== "captain-san-reduction");
    if (count > 0) buffs = [...buffs, { id: "captain-san-reduction", name: "众志成城", source: "统御者·大多数",
      timing: "permanent", remainingMonths: null, activeOperationSanDelta: -count }];
  }
  return next.actionState.limit === 0 && buffs === next.buffs ? next
    : { ...next, buffs, actionState: { ...next.actionState, limit: 0 } };
}

function grantMoney(state: GameState, id: string, amount: number): GameState {
  if (id === "player") return recordPersonalIncome({ ...state,
    player: { ...state.player, money: roundMoney(state.player.money + amount) } }, amount);
  if (id === "advisor") return recordLabFinance({ ...state,
    advisorProgressState: { ...state.advisorProgressState, funding: roundMoney(state.advisorProgressState.funding + amount) } }, "other", amount);
  return creditFellowMoney(state, id, amount);
}
function weakest<T extends { value: number }>(entries: T[], random: () => number): T | undefined {
  if (!entries.length) return undefined;
  const min = Math.min(...entries.map((entry) => entry.value));
  const tied = entries.filter((entry) => entry.value === min);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
}
function grantResearch(state: GameState, id: string, amount: number): GameState {
  if (id === "player") return applyPlayerAttributeChange(state, "research", amount).state;
  if (id === getCaptainLoverId(state)) return { ...state, loverProgressState: { ...state.loverProgressState,
    research: precise(state.loverProgressState.research + applyTierResist(amount, state.loverProgressState.research, undefined, getCaptainLoverResearchCap(state)).effectiveChange) } };
  return { ...state, fellowProgressState: state.fellowProgressState.map((profile) => profile.id !== id ? profile : {
    ...profile, research: precise(profile.research + applyTierResist(amount, profile.research, undefined, getCaptainResearchCap(state, profile)).effectiveChange),
  }) };
}
function grantSocial(state: GameState, id: string, amount: number): GameState {
  if (id === "player") return applyPlayerAttributeChange(state, "social", amount).state;
  if (id === getCaptainLoverId(state)) return { ...state, loverProgressState: { ...state.loverProgressState,
    intimacy: precise(state.loverProgressState.intimacy + applyTierResist(amount, state.loverProgressState.intimacy, undefined, getCaptainLoverIntimacyCap(state)).effectiveChange) } };
  return { ...state, fellowProgressState: state.fellowProgressState.map((profile) => profile.id !== id ? profile : {
    ...profile, affinity: precise(profile.affinity + applyTierResist(amount, profile.affinity, undefined, getCaptainAffinityCap(state, profile)).effectiveChange),
  }) };
}
export function settleCaptainMonth(state: GameState, random: () => number = gameRandom): GameState {
  if (!isCaptain(state) || state.totalMonths <= 1 || state.captainState!.lastMonthlySettlement === state.totalMonths) return state;
  let next = syncCaptainMembers(state, random);
  next = { ...next, captainState: { ...next.captainState!, lastMonthlySettlement: state.totalMonths } };
  const loverId = getCaptainLoverId(next);
  if (next.loverState.active) next = grantMoney(next, "player", 0.4 * getCaptainLevel(next, loverId, "rich"));
  next = grantMoney(next, "advisor", 0.8 * getCaptainLevel(next, "advisor", "rich"));
  const accumulation = 0.4 * getCaptainLevel(next, "advisor", "genius");
  if (accumulation) next = { ...next, advisorProgressState: { ...next.advisorProgressState,
    researchAccumulation: precise(next.advisorProgressState.researchAccumulation + accumulation) } };
  for (const profile of next.fellowProgressState) next = grantMoney(next, profile.id, 0.4 * getCaptainLevel(next, profile.id, "rich"));
  for (let index = 0; index < getCaptainTagCount(next, "rich"); index++) {
    const target = weakest([{ id: "player", value: next.player.money },
      ...(next.selectedAdvisorName ? [{ id: "advisor", value: next.advisorProgressState.funding }] : []),
      ...next.fellowProgressState.map((profile) => ({ id: profile.id, value: getFellowFinanceAccount(next, profile.id).money }))]
      .filter((entry) => getCaptainTag(next, entry.id) !== "rich"), random);
    if (target) next = grantMoney(next, target.id, 5);
  }
  for (const tag of ["genius", "social"] as const) {
    for (let index = 0; index < getCaptainTagCount(next, tag); index++) {
      const target = weakest([{ id: "player", value: tag === "genius" ? next.player.research : next.player.social },
        ...(next.loverState.active && next.loverProgressState.active ? [{ id: loverId,
          value: tag === "genius" ? next.loverProgressState.research : next.loverProgressState.intimacy }] : []),
        ...next.fellowProgressState.map((profile) => ({ id: profile.id, value: tag === "genius" ? profile.research : profile.affinity }))]
        .filter((entry) => getCaptainTag(next, entry.id) !== tag), random);
      if (target) next = tag === "genius" ? grantResearch(next, target.id, 0.5) : grantSocial(next, target.id, 0.5);
    }
  }
  for (let index = 0; index < getCaptainTagCount(next, "teacher-child"); index++) next = applyPlayerAttributeChange(next, "favor", 0.5).state;
  return recordTalentTrigger(next, `captain:month:${state.totalMonths}`, { name: "统御者", recipient: "实验室",
    reason: "标签月度结算", effects: ["按在组成员标签发放经费、收入与成长"] });
}
