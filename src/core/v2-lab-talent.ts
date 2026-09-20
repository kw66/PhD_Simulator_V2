import { describeTalentChange, recordTalentTrigger, type TalentTriggerRecord } from "./v2-talent-history";
import { getFellowName } from "./v2-fellow-progression";
import type { FellowProgressProfile, GameState } from "./v2-types";

export const FELLOW_RESEARCH_CAP = 20;

export function getFellowAnnualResearchGrowth(state: GameState, profile: FellowProgressProfile): number {
  const higherCount = 1 + Number(state.player.research > profile.research)
    + state.fellowProgressState.filter((other) => other.id !== profile.id && other.research > profile.research).length;
  return Math.min(Math.floor(higherCount / 2), Math.max(0, FELLOW_RESEARCH_CAP - profile.research));
}

export function settleLabResearchGrowth(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const triggers: Array<{ key: string; record: TalentTriggerRecord }> = [];
  const fellowProgressState = state.fellowProgressState.map((profile) => {
    const monthsKnown = state.totalMonths - profile.startTotalMonths;
    if (monthsKnown <= 0 || monthsKnown % 12 !== 0
      || (profile.lastAnnualGrowthTotalMonths ?? -1) >= state.totalMonths) return profile;
    const growth = getFellowAnnualResearchGrowth(state, profile);
    triggers.push({ key: `inheritance:${profile.id}:${state.totalMonths}`, record: {
      name: "实验室传承", recipient: getFellowName(profile), reason: `认识${monthsKnown}个月，结算本轮实验室传承`,
      effects: [growth > 0 ? describeTalentChange("科研", profile.research, profile.research + growth)
        : profile.research >= FELLOW_RESEARCH_CAP ? "科研已达上限20" : "本轮科研不变，符合条件的人数不足2人"],
    } });
    return { ...profile, research: profile.research + growth, lastAnnualGrowthTotalMonths: state.totalMonths };
  });
  if (triggers.length === 0) return state;
  let nextState = { ...state, fellowProgressState };
  for (const trigger of triggers) nextState = recordTalentTrigger(nextState, trigger.key, trigger.record);
  return nextState;
}

export function settleFellowCoauthoredPapers(state: GameState): GameState {
  const published = [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]
    .filter((paper) => paper.status === "published");
  const triggers: Array<{ key: string; record: TalentTriggerRecord }> = [];
  const fellowProgressState = state.fellowProgressState.map((profile) => {
    const rewardedIds = new Set(profile.affinityRewardedPaperIds ?? []);
    const newIds = new Set(published.filter((paper) => !rewardedIds.has(paper.id) && (paper.leadAuthorId === profile.id
      ? paper.collaborators?.some((person) => person.id === "player")
      : !paper.leadAuthorId && paper.nonFirstAuthor !== true && paper.collaborators?.some((person) => person.id === profile.id)))
      .map((paper) => paper.id));
    if (newIds.size === 0) return profile;
    const affinity = Math.min(20, profile.affinity + newIds.size);
    triggers.push({ key: `cooperation:${profile.id}:${JSON.stringify([...newIds].sort())}`, record: {
      name: "论文合作", recipient: `你与${getFellowName(profile)}`, reason: `共同发表${newIds.size}篇论文`,
      effects: [affinity > profile.affinity ? describeTalentChange("默契", profile.affinity, affinity) : "默契已达上限20"],
      details: [...newIds].map((id) => `《${published.find((paper) => paper.id === id)!.title}》`),
    } });
    return {
      ...profile, affinity,
      affinityRewardedPaperIds: [...rewardedIds, ...newIds],
    };
  });
  if (triggers.length === 0) return state;
  let nextState = { ...state, fellowProgressState };
  for (const trigger of triggers) nextState = recordTalentTrigger(nextState, trigger.key, trigger.record);
  return nextState;
}
