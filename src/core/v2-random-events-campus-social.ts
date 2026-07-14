import { getAttributeTier } from "./v2-random-event-rules";
import { applyTierResist } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-campus-shared";

export function createSocialCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const nextBadmintonCount = state.eventCounters.badmintonCount + 1;
  const sanTier = getAttributeTier(state.player.san);
  const tierBonus = [-50, -25, 25, 50][sanTier];
  const expBonus = (nextBadmintonCount - 1) * 10;
  const winRate = Math.max(5, Math.min(95, 50 + tierBonus + expBonus)) / 100;
  let badmintonChampion = getRoll() < winRate;
  if (!badmintonChampion && state.eventSupport.hasBadmintonRacket) {
    badmintonChampion = getRoll() < winRate;
  }
  const badmintonSanGain = getRoll() < 0.5 ? 2 : 3;
  const badmintonSocialGain = badmintonChampion ? applyTierResist(1, state.player.social, getRoll).effectiveChange : 0;

  const pokerStake = Math.max(0, Math.min(state.player.money, 6));
  const pokerWin = getRoll() < 0.5;
  const nextPokerWinCount = state.eventCounters.pokerWinCount + (pokerWin ? 1 : 0);
  const nextPokerTotalEarnings = state.eventCounters.pokerTotalEarnings + (pokerWin ? pokerStake : 0);

  const nextKtvCount = state.eventCounters.ktvCount + 1;
  const ktvSocialGain = applyTierResist(1, state.player.social, getRoll).effectiveChange;

  const dinnerAdvisorTreat = getRoll() >= 0.5;
  const dinnerFavorGain = dinnerAdvisorTreat ? applyTierResist(1, state.player.favor, getRoll).effectiveChange : 0;

  return {
    id: `random-7-y${state.year}-m${state.month}-n${serial}`,
    title: "实验室团建",
    description: "导师组织了团建。你可以把这次聚会当成修状态、搏手气，或稳关系的一次窗口。",
    preview: "实验室组织团建活动",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-7",
    stage: "act1",
    choices: [
      {
        id: `random-7-badminton-${serial}`,
        label: "打羽毛球",
        outcome: badmintonChampion
          ? `SAN +${badmintonSanGain}，今年不会感冒，社交 ${badmintonSocialGain > 0 ? `+${badmintonSocialGain}` : badmintonSocialGain}。`
          : `SAN +${badmintonSanGain}，今年不会感冒。`,
        effects: {
          san: badmintonSanGain,
          ...(badmintonSocialGain > 0 ? { social: badmintonSocialGain } : {}),
          counterDeltas: { badmintonCount: 1 },
          eventSupportUpdates: badmintonChampion && !state.eventSupport.hasStrongBodyTalent ? { hasStrongBodyTalent: true } : {},
          achievementFlags: badmintonChampion && !state.achievementFlags.badmintonChampion ? ["badmintonChampion"] : [],
          setBadmintonYearToCurrent: true,
        },
      },
      {
        id: `random-7-poker-${serial}`,
        label: "打德州扑克",
        outcome: pokerWin ? `金钱 +${pokerStake}。` : `金钱 -${pokerStake}。`,
        effects: pokerWin
          ? {
            money: pokerStake,
            counterDeltas: { pokerWinCount: 1, pokerTotalEarnings: pokerStake },
            eventSupportUpdates: nextPokerTotalEarnings >= 10 && !state.eventSupport.hasFinanceTalent ? { hasFinanceTalent: true } : {},
            achievementFlags: nextPokerWinCount >= 3 ? ["pokerGod"] : [],
          }
          : {
            money: -pokerStake,
          },
      },
      {
        id: `random-7-ktv-${serial}`,
        label: "KTV唱歌",
        outcome: ktvSocialGain > 0 ? `社交 +${ktvSocialGain}。` : "无事发生。",
        effects: {
          ...(ktvSocialGain > 0 ? { social: ktvSocialGain } : {}),
          counterDeltas: { ktvCount: 1 },
          achievementFlags: nextKtvCount >= 3 ? ["ktvKing"] : [],
        },
      },
      {
        id: `random-7-dinner-${serial}`,
        label: "聚餐",
        outcome: dinnerAdvisorTreat
          ? `SAN +5${dinnerFavorGain > 0 ? `，导师好感 +${dinnerFavorGain}` : ""}。`
          : "SAN +5，金钱 -2。",
        effects: dinnerAdvisorTreat
          ? {
            san: 5,
            ...(dinnerFavorGain > 0 ? { favor: dinnerFavorGain } : {}),
            counterDeltas: { dinnerCount: 1 },
          }
          : {
            san: 5,
            money: -2,
            counterDeltas: { dinnerCount: 1 },
          },
      },
    ],
  };
}

export function createFundingCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const buyGPU = getRoll() < 0.5;
  const favorTier = getAttributeTier(state.player.favor);
  const gpuCount = favorTier === 0 ? 1 : favorTier === 1 ? 2 : 3;
  const salaryGain = favorTier === 0 ? 2 : favorTier === 1 ? 4 : 6;

  return {
    id: `random-8-y${state.year}-m${state.month}-n${serial}`,
    title: "导师经费",
    description: "项目经费到账，导师让大家提资源使用建议。你要在短期现金流和长期效率之间做判断。",
    preview: "导师有经费要花",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-8",
    stage: "act1",
    choices: [
      {
        id: `random-8-gpu-${serial}`,
        label: "买GPU服务器",
        outcome: buyGPU ? `永久实验 +${gpuCount}，永久实验额外 ${gpuCount} 次。` : "导师并不想买。",
        effects: buyGPU
          ? {
            experimentBonus: gpuCount,
            persistentExtraActionDeltas: { experiment: gpuCount },
          }
          : {},
      },
      {
        id: `random-8-salary-${serial}`,
        label: "多发劳务费",
        outcome: `金钱 +${salaryGain}。`,
        effects: {
          money: salaryGain,
        },
      },
      {
        id: `random-8-renovate-${serial}`,
        label: "装修工位",
        outcome: "永久想 idea +1，永久写作 +1。",
        effects: {
          ideaBonus: 1,
          writingBonus: 1,
        },
      },
    ],
  };
}
