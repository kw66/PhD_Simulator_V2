import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import { wouldUnlockLearnToSayNo, type RandomRollProvider } from "./v2-random-events-lab-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorProjectRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const rejectFavorChange = applyTierResist(-2, state.player.favor, getRoll).effectiveChange;
  const shareSocialChange = applyTierResist(-1, state.player.social, getRoll).effectiveChange;
  const horizontalSanChange = getActualSanChange(-7, state.month, state.eventSupport);
  const verticalSanChange = getActualSanChange(-5, state.month, state.eventSupport);
  const shareSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const unlockProjectKing = state.eventCounters.projectCompletedCount + 1 >= 3;

  return {
    id: `random-4-y${state.year}-m${state.month}-n${serial}`,
    title: "导师项目",
    description: "导师把一个项目交给你主导。你要在现金流、科研成长与关系成本之间作出取舍。",
    preview: "导师有项目要交给你",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-4",
    stage: "act1",
    choices: [
      {
        id: `random-4-horizontal-${serial}`,
        label: "接横向项目",
        outcome: `SAN ${horizontalSanChange}，导师好感 +1，金钱 +5。`,
        effects: {
          san: horizontalSanChange,
          favor: 1,
          money: 5,
          counterDeltas: { projectCompletedCount: 1 },
          achievementFlags: unlockProjectKing ? ["projectKing"] : [],
        },
      },
      {
        id: `random-4-vertical-${serial}`,
        label: "接纵向项目",
        outcome: `SAN ${verticalSanChange}，导师好感 +1，科研 +1。`,
        effects: {
          san: verticalSanChange,
          favor: 1,
          research: 1,
          counterDeltas: { projectCompletedCount: 1 },
          achievementFlags: unlockProjectKing ? ["projectKing"] : [],
        },
      },
      {
        id: `random-4-reject-${serial}`,
        label: "婉言拒绝",
        outcome: rejectFavorChange < 0 ? `导师好感 ${rejectFavorChange}。` : "导师表示理解。",
        effects: {
          ...(rejectFavorChange < 0 ? { favor: rejectFavorChange } : {}),
          counterDeltas: { rejectedProjectCount: 1 },
          achievementFlags: wouldUnlockLearnToSayNo(state, "project") ? ["learnToSayNo"] : [],
        },
      },
      {
        id: `random-4-share-${serial}`,
        label: "让师弟分担",
        outcome: shareSocialChange < 0 ? `SAN ${shareSanChange}，社交 ${shareSocialChange}。` : `SAN ${shareSanChange}。`,
        effects: {
          san: shareSanChange,
          ...(shareSocialChange < 0 ? { social: shareSocialChange } : {}),
        },
      },
    ],
  };
}
