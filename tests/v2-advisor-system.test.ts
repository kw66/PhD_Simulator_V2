import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    phase: "playing",
    selectedAdvisorName: "Test advisor",
    totalMonths: 2,
    year: 1,
    month: 2,
    eventQueue: [],
    availableRandomEvents: [],
    usedRandomEvents: [],
    player: { ...base.player, san: 30, money: 20, research: 20 },
  };
}

describe("advisor engine integration", () => {
  it("routes both project buttons through the monthly player limit", () => {
    const initial = makeState();
    const horizontal = dispatchAction(initial, "advisor-horizontal");
    expect(horizontal.advisorProgressState.horizontalProgress).toBeGreaterThanOrEqual(20);
    expect(horizontal.advisorProgressState.horizontalProgress).toBeLessThanOrEqual(25);
    const repeated = dispatchAction(horizontal, "advisor-project", { projectType: "vertical" });
    expect(repeated.advisorProgressState).toEqual(horizontal.advisorProgressState);
    expect(repeated.player).toEqual(horizontal.player);
    const vertical = dispatchAction({ ...horizontal, totalMonths: 3, month: 3 }, "advisor-project", { projectType: "vertical" });
    expect(vertical.advisorProgressState.verticalProgress).toBeGreaterThanOrEqual(20);
    expect(vertical.advisorProgressState.verticalProgress).toBeLessThanOrEqual(25);
  });

  it("keeps the new funding baseline after reset and restart", () => {
    const initial = makeState();
    const reset = dispatchAction({ ...initial, advisorProgressState: { ...initial.advisorProgressState, funding: 99 } }, "reset-game");
    const restarted = dispatchAction(reset, "start-game", { roleId: "normal" });
    expect(restarted.advisorProgressState).toMatchObject({ researchAccumulation: 20, funding: 10, awards: [], pendingApplication: null });
  });

  it("does not consume action points for mentor projects", () => {
    const initial = makeState();
    const next = dispatchAction(initial, "advisor-horizontal");
    expect(next.actionState).toEqual(initial.actionState);
  });

  it("keeps the initial state factory aligned with the advisor economy", () => {
    expect(createInitialState().advisorProgressState).toMatchObject({ researchAccumulation: 20, funding: 10 });
  });
});
