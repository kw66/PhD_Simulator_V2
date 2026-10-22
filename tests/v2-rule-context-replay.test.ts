import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { CURRENT_GAMEPLAY_RULESET, withGameplayRuleset, usesCurrentGameplayRules } from "../src/core/v2-rule-context";
import { createRunReplay, executeReplayCommand, isRunReplay, replayStateDigest, verifyRunReplay,
  type ReplayCommand } from "../src/core/v2-run-replay";
import { queueAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { syncCaptainMembers } from "../src/core/v2-captain-runtime";
import { getCaptainLoverId } from "../src/core/v2-captain-state";
import { activateLover } from "../src/core/v2-lover-system";
import { advanceLoverMonth, createLoverProgressState } from "../src/core/v2-lover-progression";
import { collectRunStatistics } from "../src/core/v2-run-statistics";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { createStore } from "../src/core/v2-store";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { saveAccountProfile } from "../src/core/v2-account-storage";
import type { GameState } from "../src/core/v2-types";

function captain(): GameState {
  const base = createStartedGameState("research-captain", {}, 0, 1, { chosen: 10, "teacher-child": 10 });
  let state: GameState = { ...base, totalMonths: 2, month: 2, year: 1, eventQueue: [],
    randomState: { seed: 1700000000, cursor: 0 }, selectedAdvisorName: "导师",
    player: { ...base.player, san: 100, money: 100, research: 20 },
    advisorProgressState: { ...base.advisorProgressState, verticalProgress: 49, nextProject: "vertical",
      pendingGuidanceToPlayer: 15 },
    loverState: { ...activateLover("smart", 1, "female"), name: "恋人" },
    loverProgressState: { ...createLoverProgressState("smart", () => 0), intimacy: 10 },
  };
  const loverId = getCaptainLoverId(state);
  state = { ...state, captainState: { ...state.captainState!,
    tags: { advisor: "teacher-child", [loverId]: "chosen" }, initializedMembers: ["advisor", loverId] } };
  return state;
}

describe("versioned gameplay operation replay", () => {
  it("restores nested rules contexts even if an operation throws", () => {
    expect(usesCurrentGameplayRules()).toBe(true);
    withGameplayRuleset("20261017-r3", () => {
      expect(usesCurrentGameplayRules()).toBe(false);
      expect(() => withGameplayRuleset("20261017-r4", () => {
        expect(usesCurrentGameplayRules()).toBe(true);
        throw new Error("test");
      })).toThrow("test");
      expect(usesCurrentGameplayRules()).toBe(false);
    });
    expect(usesCurrentGameplayRules()).toBe(true);
  });

  it.each(["20261016-r1", "20261017-r2", "20261017-r3"] as const)("preserves all three captain behaviors in %s", ruleset => {
    const state = captain();
    const joined = { ...state, captainState: { ...state.captainState!,
      initializedMembers: ["advisor"], loverAdvanceRemainder: 0.7 } };
    const legacy = withGameplayRuleset(ruleset, () => ({
      pending: queueAdvisorGuidance(state).advisorProgressState.pendingGuidanceToPlayer,
      activity: advanceLoverMonth(state).loverProgressState.monthlyActivity,
      remainder: syncCaptainMembers(joined).captainState!.loverAdvanceRemainder,
    }));
    expect(legacy).toEqual({ pending: 15, activity: "玩耍进度 +5，学习进度 +10", remainder: 0.7 });
    for (const currentRules of ["20261017-r4", CURRENT_GAMEPLAY_RULESET] as const) {
      expect(withGameplayRuleset(currentRules, () => ({
        pending: queueAdvisorGuidance(state).advisorProgressState.pendingGuidanceToPlayer,
        activity: advanceLoverMonth(state).loverProgressState.monthlyActivity,
        remainder: syncCaptainMembers(joined).captainState!.loverAdvanceRemainder,
      }))).toEqual({ pending: 30, activity: "玩耍进度 +10，学习进度 +20（推进2次）", remainder: 0 });
    }
    expect(advanceLoverMonth(state).loverProgressState.monthlyActivity).toBe("玩耍进度 +10，学习进度 +20（推进2次）");
    expect(syncCaptainMembers(joined).captainState!.loverAdvanceRemainder).toBe(0);
  });

  it("uses the legacy run default for missing command versions and an explicit version for new commands", () => {
    const state = captain();
    const old: ReplayCommand = { kind: "action", actionId: "advisor-project", payload: { projectType: "vertical" } };
    const current: ReplayCommand = { ...old, ruleset: "20261017-r4" };
    const legacyResult = executeReplayCommand(state, old, "20261017-r3");
    const currentResult = executeReplayCommand(state, current, "20261017-r3");
    expect(legacyResult.advisorProgressState.pendingGuidanceToPlayer).toBe(15);
    expect(currentResult.advisorProgressState.pendingGuidanceToPlayer).toBe(30);
    expect(legacyResult.randomState).toEqual(currentResult.randomState);
    expect(currentResult).toEqual(collectRunStatistics(state, dispatchAction(state, "advisor-project", { projectType: "vertical" })));
  });

  it("verifies a mixed legacy/new branch and rejects replaying its new operation under old rules", () => {
    const state = captain();
    const replay = createRunReplay(createInitialState(), state, { roleId: "research-captain" });
    replay.ruleset = "20261017-r3";
    const first = replay.commands[0]!;
    if (first.kind === "action") delete first.ruleset;
    replay.checkpoints = [{ index: 1, totalMonths: state.totalMonths, digest: replayStateDigest(state) }];
    const legacyCommand: ReplayCommand = { kind: "action", actionId: "advisor-project", payload: { projectType: "vertical" } };
    const nextCommand: ReplayCommand = { kind: "action", actionId: "next-month", payload: {}, ruleset: "20261017-r4" };
    replay.commands.push(legacyCommand, nextCommand);
    const legacy = executeReplayCommand(state, legacyCommand, replay.ruleset);
    const actual = withGameplayRuleset("20261017-r4", () => collectRunStatistics(legacy, dispatchAction(legacy, "next-month")));
    expect(actual.totalMonths).toBe(3);
    expect(actual.loverProgressState.monthlyActivity).toContain("推进2次");
    expect(isRunReplay(replay)).toBe(true);
    expect(verifyRunReplay(replay, { state, index: 1 }, actual)).not.toBeNull();
    expect(replay.failed).toBeUndefined();
    const wrong = structuredClone(replay);
    const last = wrong.commands.at(-1)!;
    if (last.kind === "action") delete last.ruleset;
    expect(verifyRunReplay(wrong, { state, index: 1 }, actual)).toBeNull();
    expect(wrong.failed?.reason).toContain("不一致");
    const invalid = structuredClone(replay);
    Object.assign(invalid.commands.at(-1)!, { ruleset: "unknown" });
    expect(isRunReplay(invalid)).toBe(false);
  });

  it("appends current operations to a loaded r3 store and deterministically restores and rewinds them", async () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); } };
    const account = createDefaultAccountProfile();
    account.roleProgress["research-captain"].unlocked = true;
    saveAccountProfile(account, storage);
    const adapter = createMemoryRunSaveAdapter();
    const saves = createRunSaveRepository({ storage, adapter });
    let store = createStore({ storage, saves });
    await store.ready();
    store.getState().randomState = { seed: 1700000000, cursor: 0 };
    store.dispatch("start-game", { roleId: "research-captain" });
    const record = saves.get("research-captain")!;
    const oldReplay = structuredClone(record.replay!);
    oldReplay.ruleset = "20261017-r3";
    for (const command of oldReplay.commands) if (command.kind === "action") delete command.ruleset;
    saves.commit(record.latest.state, { runId: record.runId, replay: oldReplay });
    expect(store.loadRunSave("latest")).toBe(true);
    const opening = store.getRunSaves().find(snapshot => snapshot.kind === "month" && snapshot.totalMonths === 0)!;
    expect(opening).toBeDefined();
    const advanceOpening = () => {
      const event = store.getState().eventQueue.find(event => event.chainId === "before-grad-school")!;
      store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: "before-grad-school-open-advisor-info" });
    };
    advanceOpening();
    const after = structuredClone(store.getState());
    const continued = saves.get("research-captain")!.replay!;
    expect(continued.ruleset).toBe("20261017-r3");
    expect(continued.commands[0]).not.toHaveProperty("ruleset");
    expect(continued.commands.at(-1)).toMatchObject({ kind: "action", ruleset: CURRENT_GAMEPLAY_RULESET });
    await store.flushSaves();
    store = createStore({ storage, saves: createRunSaveRepository({ storage, adapter }) });
    await store.ready();
    store.dispatch("start-game", { roleId: "research-captain" });
    expect(store.getState()).toEqual(after);
    expect(store.isCurrentRunDisqualified()).toBe(false);
    expect(store.loadRunSave(opening.id)).toBe(true);
    advanceOpening();
    expect(store.getState()).toEqual(after);
    store.dispatch("quit-game");
    expect(store.getReplayStatus().failed).toBeUndefined();
    expect(store.isCurrentRunDisqualified()).toBe(false);
  });
});
