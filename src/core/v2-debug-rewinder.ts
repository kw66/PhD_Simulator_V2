import { createStartedGameState } from "./v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "./v2-fellow-progression";
import { activateLover } from "./v2-lover-system";
import { createLoverProgressState } from "./v2-lover-progression";
import { captureRewinderGrowth } from "./v2-rewinder-growth";
import { captureRewinderRelationships } from "./v2-rewinder-relationships";
import { initializeRewinder, prepareRewinderYear } from "./v2-rewinder";
import { pushLog } from "./v2-engine-helpers";
import { initializeAcademicRun, prepareAcademicArchive } from "./v2-rewinder-academic";
import { captureAcademicYear } from "./v2-rewinder-academic-record";
import type { GameState } from "./v2-types";

/** A repeatable first-year scene; the store's existing debug exclusion keeps it out of account archives. */
export function createDebugRewinderYear(state: GameState): GameState {
  if (state.selectedRoleId !== "rewinder") return pushLog(state, "请先使用轮回者开局，再预览学年轮回。");
  const base = createStartedGameState("rewinder");
  const current: GameState = {
    ...base, year: 1, month: 12, totalMonths: 12,
    playerName: state.playerName, selectedAdvisorName: state.selectedAdvisorName || "陈老师",
    randomState: state.randomState, blockLinearEvents: state.blockLinearEvents, skipBranchEventIntro: state.skipBranchEventIntro,
    debugEventReplayEnabled: state.debugEventReplayEnabled,
    availableRandomEvents: [], pendingRandomEvents: [], eventQueue: [],
    player: { san: 16, research: 5, social: 8, favor: 7, money: 40 },
    readingState: { readCount: 7 }, partTimeWorkCount: 3,
  };
  const past: GameState = {
    ...current, sanCap: 30,
    player: { ...current.player, san: 26, research: 18, social: 15, favor: 17 },
    readingState: { readCount: 24 }, partTimeWorkCount: 8,
    paperMasteryState: { count: 5, rewardedPaperIds: [] },
    eventCounters: { ...current.eventCounters, badmintonCount: 5, pokerCount: 3,
      terrariaCount: 4, magicTowerCount: 2, rocoCount: 3 },
    advisorProgressState: { ...current.advisorProgressState, funding: 96, researchAccumulation: 42,
      awards: [{ id: "youth", awardedYear: 2024, startYear: 2024, endYear: 2027 }] },
    fellowProgressState: [
      createCustomFellowProgressProfile({ type: "peer", gender: "female", name: "林清", research: 14.4,
        affinity: 16.2, startTotalMonths: 2, taskType: "writing" }),
      createCustomFellowProgressProfile({ type: "peer", gender: "male", name: "周明", research: 17.6,
        affinity: 14.2, startTotalMonths: 4, taskType: "experiment" }),
    ],
    loverState: { ...activateLover("smart", 5, "female"), name: "沈知远" },
    loverProgressState: { ...createLoverProgressState("smart", () => 0.5), research: 13, intimacy: 15,
      routes: { play: { progress: 45, completed: 2 }, study: { progress: 70, completed: 3 }, shopping: { progress: 25, completed: 1 } } },
  };
  if (state.rewinderState?.academic) {
    const initialized = initializeAcademicRun(initializeRewinder(current, undefined, state.rewinderState.cycleNumber),
      { version: 1, years: { 1: captureAcademicYear(past) } }, 1)!;
    return prepareAcademicArchive(initialized);
  }
  const record = { growth: captureRewinderGrowth(past), relationships: captureRewinderRelationships(past) };
  const pending = prepareRewinderYear(initializeRewinder(current, { years: { 1: record } }, state.rewinderState?.cycleNumber));
  return pushLog(pending, "调试预览：已准备第一学年轮回与示例往世记录，可勾选故人后完成轮回。");
}
