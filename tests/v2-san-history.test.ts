import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getSanTimeline } from "../src/core/v2-san-history";

function enrolledGame() {
  let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    state = dispatchAction(state, "resolve-event", { eventChoiceId });
  }
  return dispatchAction(state, "next-month");
}

describe("SAN monthly history", () => {
  it("records completed months and keeps the current month live", () => {
    const september = enrolledGame();
    expect(september.sanHistory).toEqual([{ totalMonths: 0, san: 20, sanCap: 20 }]);
    const beforeAdvance = { ...september, player: { ...september.player, san: 12 }, eventQueue: [], availableRandomEvents: [] };
    expect(getSanTimeline(beforeAdvance).at(-1)).toEqual({ totalMonths: 1, san: 12, sanCap: 20 });

    const october = dispatchAction(beforeAdvance, "next-month");
    expect(october.totalMonths).toBe(2);
    expect(october.sanHistory?.at(-1)).toEqual({ totalMonths: 1, san: 12, sanCap: 20 });
    expect(getSanTimeline(october).at(-1)).toEqual({ totalMonths: 2, san: october.player.san, sanCap: october.sanCap });
  });

  it("does not record a month when a blocking event prevents advancement", () => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const blocked = dispatchAction(state, "next-month");
    expect(blocked.totalMonths).toBe(0);
    expect(blocked.sanHistory).toEqual([]);
  });
});
