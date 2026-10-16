import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createMemoryRunSaveAdapter, createRunSaveRepository, validateRunSaveRecord } from "../src/core/v2-run-saves";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";

function fixture() {
  const state = createStartedGameState("research-captain", {}, 0, 1, { normal: 3, chosen: 7 });
  state.totalMonths = 1;
  state.month = 1;
  state.captainState = { ...state.captainState!, tags: { advisor: "normal", fellow1: "chosen" },
    initializedMembers: ["advisor", "fellow1"], actionRemainders: { fellow1: 0.3 },
    cooperationRemainders: { fellow1: 0.7 }, loverAdvanceRemainder: 0.2,
    pendingFellowHelp: { fellow1: { player: [3.5, 5], fellow: [1, 2] } },
    pendingLoverHelp: { "lover:1:A": [{ amount: 7.5, collaboratorId: "lover:1:A", name: "A" }] } };
  return state;
}

describe("captain save metadata", () => {
  it("preserves fixed levels, member identities, fractional progress and queued rewards across reload/rewind", async () => {
    const adapter = createMemoryRunSaveAdapter();
    const saves = createRunSaveRepository({ storage: null, adapter });
    await saves.ready();
    const state = fixture();
    saves.commit(state, { monthStart: true });
    const later = structuredClone(state);
    later.totalMonths = 2;
    later.month = 2;
    later.captainState!.actionRemainders.fellow1 = 0.6;
    later.captainState!.pendingFellowHelp!.fellow1!.player.shift();
    saves.commit(later, { monthStart: true });
    await saves.flush();
    const restored = createRunSaveRepository({ storage: null, adapter });
    await restored.ready();
    expect(restored.get("research-captain")!.latest.state.captainState).toEqual(later.captainState);
    const rewind = restored.rewind("research-captain", "month:1")!;
    expect(rewind.latest.state.captainState).toEqual(state.captainState);
    expect(rewind.months.map(point => point.totalMonths)).toEqual([1]);
    expect(validateRunSaveRecord(rewind)).toBe(true);
  });

  it("rejects malformed queues, remainders and a changed level snapshot within one run", () => {
    const saves = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter() });
    const state = fixture();
    const record = saves.commit(state, { monthStart: true });
    expect(validateRunSaveRecord(record)).toBe(true);
    const malformed = [
      { pendingFellowHelp: { fellow1: { player: [-1], fellow: [] } } },
      { pendingFellowHelp: { fellow1: { player: [], fellow: [Infinity] } } },
      { pendingLoverHelp: { lover: [{ amount: 2, collaboratorId: 4, name: "A" }] } },
      { actionRemainders: { fellow1: 1 } },
      { levels: { ...state.captainState!.levels, normal: 11 } },
    ];
    for (const patch of malformed) {
      const invalid = structuredClone(record);
      Object.assign(invalid.latest.state.captainState!, patch);
      expect(validateRunSaveRecord(invalid)).toBe(false);
    }
    const changed = structuredClone(record);
    changed.latest.state.captainState!.levels.normal = 4;
    expect(validateRunSaveRecord(changed)).toBe(false);
  });

  it("does not sample random label rewards while rendering monthly previews", () => {
    const state = fixture();
    const original = structuredClone(state);
    const first = previewNextMonthEffects(state);
    const second = previewNextMonthEffects(state);
    expect(state).toEqual(original);
    expect(first).toEqual(second);
    expect(first.items.find(item => item.id === "monthly-captain-labels")?.label).toBe("标签补给与成长");
  });
});
