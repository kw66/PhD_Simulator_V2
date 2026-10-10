import { describeResistedTalentReward, recordTalentTrigger, type TalentTriggerRecord } from "./v2-talent-history";
import { formatMoney } from "./v2-money";
import { getFellowName } from "./v2-fellow-progression";
import { recordFellowMonthlySupport } from "./v2-fellow-monthly-support";
import { getLoverName } from "./v2-lover-system";
import { getResearchCap } from "./v2-research-cap-system";
import { getAttributeTier } from "./v2-random-event-rules";
import { applyTierResist } from "./v2-sanity-rules";
import type { FellowProgressProfile, GameState } from "./v2-types";

export const FELLOW_RESEARCH_CAP = 20;

export function getFellowPublicationTotals(state: GameState): { playerLed: number; fellowLed: number } {
  const papers = [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])];
  const fellowIds = new Set(state.fellowProgressState.map((profile) => profile.id));
  for (const paper of papers) {
    if (paper.leadAuthorId) fellowIds.add(paper.leadAuthorId);
  }
  const playerLed = new Set<string>();
  const fellowLed = new Set<string>();
  for (const paper of papers) {
    if (paper.status !== "published") continue;
    if (paper.leadAuthorId && fellowIds.has(paper.leadAuthorId)) {
      if (paper.collaborators?.some((person) => person.id === "player")) {
        fellowLed.add(JSON.stringify([paper.id, paper.leadAuthorId]));
      }
    } else if (!paper.leadAuthorId && paper.nonFirstAuthor !== true) {
      for (const person of paper.collaborators ?? []) {
        if (fellowIds.has(person.id)) playerLed.add(JSON.stringify([paper.id, person.id]));
      }
    }
  }
  return { playerLed: playerLed.size, fellowLed: fellowLed.size };
}

function getAnnualResearchReward(state: GameState, research: number): number {
  const higherCount = 1 + Number(state.player.research > research)
    + state.fellowProgressState.filter((other) => other.research > research).length;
  return Math.floor(higherCount / 2);
}

export function getAnnualLabSocialRewards(state: GameState): { fellowAffinity: number; playerSocial: number } {
  return {
    fellowAffinity: getAttributeTier(state.player.social),
    playerSocial: Math.floor(state.fellowProgressState.length / 2),
  };
}

export function getFellowAnnualResearchGrowth(state: GameState, profile: FellowProgressProfile): number {
  return Math.min(getAnnualResearchReward(state, profile.research), Math.max(0, FELLOW_RESEARCH_CAP - profile.research));
}

export function getPlayerAnnualResearchGrowth(state: GameState): number {
  return applyTierResist(getAnnualResearchReward(state, state.player.research), state.player.research,
    undefined, getResearchCap(state.researchCapacityState)).effectiveChange;
}

export function settleLabResearchGrowth(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing" || state.month !== 12 || state.totalMonths <= 0) return state;
  const playerKey = `inheritance:player:${state.totalMonths}`;
  const playerReward = getAnnualResearchReward(state, state.player.research);
  const fellowRewards = state.fellowProgressState.map((profile) => getAnnualResearchReward(state, profile.research));
  const socialRewards = getAnnualLabSocialRewards(state);
  const reason = `第${state.year}学年结束，结算年度科研成长`;
  const triggers: Array<{ key: string; record: TalentTriggerRecord }> = [];
  const fellowProgressState = state.fellowProgressState.map((profile, index) => {
    if ((profile.lastAnnualGrowthTotalMonths ?? -1) >= state.totalMonths) return profile;
    const inheritance = fellowRewards[index]!;
    const reward = 2 + inheritance;
    const result = applyTierResist(reward, profile.research, random, FELLOW_RESEARCH_CAP);
    const growth = result.effectiveChange;
    const affinityResult = applyTierResist(socialRewards.fellowAffinity, profile.affinity, random, 20);
    const affinitySummary = describeResistedTalentReward("默契", profile.affinity, affinityResult);
    triggers.push({ key: `inheritance:${profile.id}:${state.totalMonths}`, record: {
      name: "年度科研成长", recipient: getFellowName(profile), reason,
      effects: [describeResistedTalentReward("科研", profile.research, result),
        ...(socialRewards.fellowAffinity > 0 ? [affinitySummary] : [])],
      details: [`原始奖励：自然成长 +2，实验室传承 +${inheritance}，合计 +${reward}；合并后逐点抵抗并受科研上限限制`,
        ...(socialRewards.fellowAffinity > 0 ? [`社交档位 ${socialRewards.fellowAffinity}；默契原始 +${socialRewards.fellowAffinity}，逐点抵抗并受上限20限制`] : []),
        ...(result.cappedCount ? [`档位抵抗 ${formatMoney(result.resistedCount)} 点，上限限制 ${formatMoney(result.cappedCount)} 点`] : [])],
    } });
    return {
      ...profile,
      research: profile.research + growth,
      affinity: profile.affinity + affinityResult.effectiveChange,
      lastAnnualGrowthTotalMonths: state.totalMonths,
      annualResearchActivity: `第${state.year}学年末：${describeResistedTalentReward("科研", profile.research, result)}${socialRewards.fellowAffinity > 0 ? `；${affinitySummary}` : ""}；原始奖励：自然成长 +2、传承 +${inheritance}`,
      ...(growth > 0 ? { annualResearchGrowthTotal: (profile.annualResearchGrowthTotal ?? 0) + growth } : {}),
    };
  });
  let player = state.player;
  if (!state.eventHistory.some((entry) => entry.id === `talent:${playerKey}`)) {
    const result = applyTierResist(playerReward, player.research, random, getResearchCap(state.researchCapacityState));
    const socialResult = applyTierResist(socialRewards.playerSocial, player.social, random);
    const research = player.research + result.effectiveChange;
    triggers.push({ key: playerKey, record: {
      name: "实验室传承", recipient: state.playerName ? `你·${state.playerName}` : "你", reason,
      effects: [describeResistedTalentReward("科研", player.research, result),
        ...(socialRewards.playerSocial > 0 ? [describeResistedTalentReward("社交", player.social, socialResult)] : [])],
      details: [`原始奖励：实验室传承 +${playerReward}；逐点抵抗并受科研上限限制`,
        ...(socialRewards.playerSocial > 0 ? [`在组同学 ${state.fellowProgressState.length} 人；社交原始 +${socialRewards.playerSocial}，逐点抵抗并受上限20限制`] : []),
        ...(result.cappedCount ? [`档位抵抗 ${formatMoney(result.resistedCount)} 点，上限限制 ${formatMoney(result.cappedCount)} 点`] : [])],
    } });
    player = { ...player, research, social: player.social + socialResult.effectiveChange };
  }
  let loverProgressState = state.loverProgressState;
  if (state.loverState.active && loverProgressState.active
    && (loverProgressState.lastAnnualGrowthTotalMonths ?? -1) < state.totalMonths) {
    const result = applyTierResist(2, loverProgressState.research, random, FELLOW_RESEARCH_CAP);
    triggers.push({ key: `annual-research:lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}:${state.totalMonths}`, record: {
      name: "年度科研成长", recipient: getLoverName(state.loverState), reason,
      effects: [describeResistedTalentReward("科研", loverProgressState.research, result)],
      details: ["原始奖励：自然成长 +2；逐点抵抗并受科研上限限制",
        ...(result.cappedCount ? [`档位抵抗 ${formatMoney(result.resistedCount)} 点，上限限制 ${formatMoney(result.cappedCount)} 点`] : [])],
    } });
    loverProgressState = { ...loverProgressState, research: loverProgressState.research + result.effectiveChange,
      annualResearchActivity: `第${state.year}学年末：${describeResistedTalentReward("科研", loverProgressState.research, result)}；原始奖励：自然成长 +2`,
      lastAnnualGrowthTotalMonths: state.totalMonths };
  }
  if (triggers.length === 0) return state;
  let nextState = { ...state, player, fellowProgressState, loverProgressState };
  for (const trigger of triggers) nextState = recordTalentTrigger(nextState, trigger.key, trigger.record);
  const groupKey = `annual-research:group:${state.totalMonths}`;
  const groupId = `talent:${groupKey}`;
  const previousGroup = state.eventHistory.find((entry) => entry.id === groupId)?.stages[0]?.talentTrigger;
  const records = triggers.map((trigger) => trigger.record);
  return recordTalentTrigger({
    ...nextState,
    log: state.log.filter((entry) => entry.id !== groupId),
    eventHistory: nextState.eventHistory.filter((entry) => entry.id !== groupId),
  }, groupKey, {
    name: "年度科研成长", recipient: `第${state.year}学年末`, reason,
    effects: [...(previousGroup?.effects ?? []), ...records.map((record) => `${record.recipient}：${record.effects.join("；")}`)],
    details: [...(previousGroup?.details ?? []), ...records.map((record) => `${record.recipient}：${(record.details ?? []).join("；")}`)],
  });
}

function resolveFellowCoauthoredPapers(state: GameState, recordLogs: boolean): GameState {
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
    const affinityResult = applyTierResist(newIds.size, profile.affinity, undefined, 20);
    const affinity = profile.affinity + affinityResult.effectiveChange;
    const affinitySummary = describeResistedTalentReward("默契", profile.affinity, affinityResult);
    triggers.push({ key: `cooperation:${profile.id}:${JSON.stringify([...newIds].sort())}`, record: {
      name: "论文合作", recipient: `你与${getFellowName(profile)}`, reason: `共同发表${newIds.size}篇论文`,
      effects: [affinitySummary],
      details: [...newIds].map((id) => `《${published.find((paper) => paper.id === id)!.title}》`),
    } });
    return recordFellowMonthlySupport({
      ...profile, affinity,
      affinityRewardedPaperIds: [...rewardedIds, ...newIds],
    }, state.totalMonths, `合作发表${newIds.size}篇；${affinitySummary}`);
  });
  if (triggers.length === 0) return state;
  let nextState = { ...state, fellowProgressState };
  if (recordLogs) {
    for (const trigger of triggers) nextState = recordTalentTrigger(nextState, trigger.key, trigger.record);
  }
  return nextState;
}

export function projectFellowCoauthoredPapers(state: GameState): GameState {
  return resolveFellowCoauthoredPapers(state, false);
}

export function settleFellowCoauthoredPapers(state: GameState): GameState {
  return resolveFellowCoauthoredPapers(state, true);
}
