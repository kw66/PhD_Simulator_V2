import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowCooperationWithLog, settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { activateLover } from "../src/core/v2-lover-system";
import { advanceLoverMonth, createLoverProgressState, settlePendingLoverHelp } from "../src/core/v2-lover-progression";
import { getCaptainLoverId } from "../src/core/v2-captain-state";
import type { GameState } from "../src/core/v2-types";

function fellowState(): GameState {
  const base = createStartedGameState("research-captain", {}, 0, 1, { chosen: 10 });
  const fellow = { ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 5,
    affinity: 30, startTotalMonths: 1, name: "林青", identitySeed: "queue-test" }), id: "fellow-test" };
  return { ...base, totalMonths: 2, month: 2, year: 1, eventQueue: [], buffs: [],
    player: { ...base.player, research: 10 }, fellowProgressState: [fellow],
    captainState: { ...base.captainState!, tags: { [fellow.id]: "chosen" }, initializedMembers: [fellow.id] } };
}
function draft(slot = 0) {
  return { ...createDraftPaper(1, slot, () => 0), idea: 1, experiment: 1, writing: 1 };
}
function totalCollaboration(state: GameState) {
  return state.papers.reduce((sum, paper) => sum + (paper.collaborationScores?.idea ?? 0)
    + (paper.collaborationScores?.experiment ?? 0) + (paper.collaborationScores?.writing ?? 0), 0);
}

describe("captain completed cooperation reward queues", () => {
  it("retains multiple same-action completions and later higher rewards in both directions across reload", () => {
    let state = advanceFellowCooperationWithLog(fellowState(), "fellow-test", 270);
    expect(state.captainState!.pendingFellowHelp!["fellow-test"]).toEqual({ player: [5, 5, 5], fellow: [10, 10, 10] });
    state = { ...state, fellowProgressState: state.fellowProgressState.map(fellow => ({ ...fellow, research: 9 })),
      player: { ...state.player, research: 12 } };
    state = advanceFellowCooperationWithLog(state, "fellow-test", 90);
    const saved = JSON.stringify(state);
    expect(settlePendingFellowHelp(state, () => 0)).toBe(state);
    expect(JSON.stringify(state)).toBe(saved);
    const restored: GameState = JSON.parse(saved);
    const next = settlePendingFellowHelp({ ...restored, papers: [draft()], fellowPapers: [{ ...draft(1), leadAuthorId: "fellow-test" }] }, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ pendingHelpToPlayer: null, pendingHelpToFellow: null,
      helpedPlayerCount: 4, helpedFellowCount: 4 });
    expect(totalCollaboration(next)).toBe(24);
    expect(Object.values(next.fellowPapers![0]!.collaborationScores!).reduce((sum, value) => sum + value, 0)).toBe(42);
    expect(next.captainState!.pendingFellowHelp!["fellow-test"]).toEqual({ player: [], fellow: [] });
    expect(settlePendingFellowHelp(next, () => 0)).toBe(next);
    expect(JSON.stringify(restored)).toBe(saved);
  });

  it("queues successive monthly completions with no player draft and does not run any fellow twice", () => {
    let state = fellowState();
    state = ensureFellowPapers({ ...state, fellowProgressState: [{ ...state.fellowProgressState[0]!, longTermMentoring: true }] }, () => 0);
    // Five months of three 20-point advances complete three 90-point bars.
    for (let month = 2; month <= 6; month++) {
      state = advanceFellowResearch({ ...state, totalMonths: month, month }, () => 0);
      expect(advanceFellowResearch(state, () => 0)).toBe(state);
    }
    expect(state.captainState!.pendingFellowHelp!["fellow-test"]!.player).toHaveLength(3);
    const next = settlePendingFellowHelp({ ...JSON.parse(JSON.stringify(state)), papers: [draft()] }, () => 0);
    expect(next.fellowProgressState[0]!.helpedPlayerCount).toBe(3);
    expect(totalCollaboration(next)).toBe(15);
  });

  it("waits for an eligible junior-help field, then consumes all stored completions once", () => {
    let state = fellowState();
    state = { ...state, fellowProgressState: [{ ...state.fellowProgressState[0]!, type: "junior" }] };
    state = advanceFellowCooperationWithLog(state, "fellow-test", 180);
    state = { ...state, papers: [{ ...draft(), idea: 0, experiment: 0, writing: 0 }] };
    expect(settlePendingFellowHelp(state, () => 0)).toBe(state);
    const next = settlePendingFellowHelp({ ...state, papers: [{ ...state.papers[0]!, idea: 1 }] }, () => 0);
    expect(next.papers[0]!.experiment).toBe(10);
    expect(next.fellowProgressState[0]!.helpedPlayerCount).toBe(2);
    expect(next.captainState!.pendingFellowHelp!["fellow-test"]!.player).toEqual([]);
  });

  it("retains repeated lover study rewards and their original amounts, then drains all after creating a draft", () => {
    const base = createStartedGameState("research-captain", {}, 0, 1, { chosen: 10 });
    let state: GameState = { ...base, totalMonths: 2, month: 2, eventQueue: [], player: { ...base.player, research: 20 },
      loverState: { ...activateLover("smart", 1, "female"), name: "林青" },
      loverProgressState: { ...createLoverProgressState("smart", () => 0), intimacy: 20, research: 6 } };
    const id = getCaptainLoverId(state);
    state = { ...state, captainState: { ...state.captainState!, tags: { [id]: "chosen" }, initializedMembers: [id] } };
    for (let month = 2; month <= 11; month++) {
      state = advanceLoverMonth({ ...state, totalMonths: month, month });
      expect(advanceLoverMonth(state)).toBe(state);
    }
    const queue = state.captainState!.pendingLoverHelp![id]!;
    expect(queue.map(help => help.amount)).toEqual([6, 6.8]);
    expect(state.loverProgressState.pendingPaperHelp?.amount).toBe(6);
    const restored: GameState = JSON.parse(JSON.stringify(state));
    const next = settlePendingLoverHelp({ ...restored, papers: [draft()] }, () => 0);
    expect(next.loverProgressState.pendingPaperHelp).toBeNull();
    expect(next.captainState!.pendingLoverHelp![id]).toEqual([]);
    expect(totalCollaboration(next)).toBe(12);
    expect(next.log.filter(entry => entry.id.startsWith("lover-help-"))).toHaveLength(2);
    expect(settlePendingLoverHelp(next, () => 0)).toBe(next);
    // Completing the next month cannot redeliver the old queue.
    const later = advanceLoverMonth({ ...next, totalMonths: 12, month: 12 });
    expect(totalCollaboration(later)).toBe(12);
    expect(restored.captainState!.pendingLoverHelp![id]).toHaveLength(2);
  });

  it("does not deliver an old lover's queued help through a new relationship", () => {
    const base = fellowState();
    const oldId = "lover:1:旧恋人";
    const newLover = { ...activateLover("smart", 4, "female"), name: "新恋人" };
    const state = { ...base, loverState: newLover, loverProgressState: createLoverProgressState("smart", () => 0),
      captainState: { ...base.captainState!, pendingLoverHelp: { [oldId]: [{ amount: 8, collaboratorId: oldId, name: "旧恋人" }] } }, papers: [draft()] };
    expect(settlePendingLoverHelp(state)).toBe(state);
    expect(totalCollaboration(state)).toBe(0);
  });
});
