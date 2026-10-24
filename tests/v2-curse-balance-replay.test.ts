import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getMonthEndIllnessDelta, settleCurseMonthStart } from "../src/core/v2-curse-system";
import { CURRENT_GAMEPLAY_RULESET, withGameplayRuleset } from "../src/core/v2-rule-context";
import { createRunReplay, executeReplayCommand, replayStateDigest, verifyRunReplay, type ReplayCommand } from "../src/core/v2-run-replay";
import type { GameState } from "../src/core/v2-types";

const roles = ["special-finite-life", "special-fading-genius", "cursed-frail"] as const;

describe("curse rebalance and saved operation replay", () => {
  it.each([1, 2, 3, 4] as const)("preserves r54 starts and monthly illness at difficulty %s", difficulty => {
    withGameplayRuleset("20261024-r54", () => {
      const finite = createStartedGameState("special-finite-life", {}, 0, difficulty);
      expect(finite.player.san).toBe([300, 200, 120, 80][difficulty - 1]);
      const fading = createStartedGameState("special-fading-genius", {}, 0, difficulty);
      expect(fading.player.research).toBe([18, 16, 14, 12][difficulty - 1]);
      const debt = createStartedGameState("cursed-debt", {}, 0, difficulty);
      expect(debt.curseState?.debt).toBe([60, 80, 100, 120][difficulty - 1]);
      const frail = createStartedGameState("cursed-frail", {}, 0, difficulty);
      expect(getMonthEndIllnessDelta({ ...frail, totalMonths: 1 })).toBe(difficulty);
    });
    const frail = createStartedGameState("cursed-frail", {}, 0, difficulty);
    expect(getMonthEndIllnessDelta({ ...frail, totalMonths: 1 })).toBe(difficulty - 2);
  });
  it.each([1, 2, 3, 4] as const)("retains the released starting and monthly rules for legacy difficulty %s", difficulty => {
    withGameplayRuleset("20261017-r5", () => {
      const finite = createStartedGameState("special-finite-life", {}, 0, difficulty);
      expect(finite.player.san).toBe([400, 300, 200, 100][difficulty - 1]);
      expect(finite.sanCap).toBe(finite.player.san);
      const fading = createStartedGameState("special-fading-genius", {}, 0, difficulty);
      expect(fading.player.research).toBe([20, 17, 14, 11][difficulty - 1]);
      expect(settleCurseMonthStart({ ...fading, totalMonths: 2, month: 2 }).player.research)
        .toBe([19.6, 16.4, 13.4, 10.2][difficulty - 1]);
      const frail = createStartedGameState("cursed-frail", {}, 0, difficulty);
      expect(getMonthEndIllnessDelta({ ...frail, totalMonths: 1, month: 1 })).toBe(0);
    });
    expect(createStartedGameState("special-finite-life", {}, 0, difficulty).player.san)
      .toBe([300, 200, 150, 100][difficulty - 1]);
  });

  it.each(roles)("reproduces a legacy %s opening and continues it under the new rules", roleId => {
    const initial = createInitialState();
    initial.randomState = { seed: 1700000000, cursor: 0 };
    const start: ReplayCommand = { kind: "action", actionId: "start-game", payload: { roleId, curseDifficulty: 1 } };
    const started = executeReplayCommand(initial, start, "20261017-r5");
    const replay = createRunReplay(initial, started, start.payload);
    replay.ruleset = "20261017-r5";
    replay.commands = [start];
    expect(verifyRunReplay(replay, { state: initial, index: 0 }, started)).not.toBeNull();

    // A trusted monthly checkpoint isolates mixed-version month settlement.
    const checkpoint: GameState = { ...started, year: 1, month: 1, totalMonths: 1, eventQueue: [],
      illnessProbability: roleId === "cursed-frail" ? 10 : started.illnessProbability,
      player: { ...started.player, money: 100 } };
    replay.checkpoints = [{ index: 1, totalMonths: 1, digest: replayStateDigest(checkpoint) }];
    const oldMonth: ReplayCommand = { kind: "action", actionId: "next-month", payload: {} };
    const currentMonth: ReplayCommand = { ...oldMonth, ruleset: CURRENT_GAMEPLAY_RULESET };
    const previous = executeReplayCommand(checkpoint, oldMonth, replay.ruleset);
    const current = executeReplayCommand(previous, currentMonth, replay.ruleset);
    expect(previous.totalMonths).toBe(2);
    expect(current.totalMonths).toBe(3);
    replay.commands.push(oldMonth, currentMonth);
    expect(verifyRunReplay(replay, { state: checkpoint, index: 1 }, current)).not.toBeNull();
    expect(replay.failed).toBeUndefined();
    if (roleId === "special-finite-life") {
      expect(current.sanCap).toBe(400);
      expect(current.player.san).toBe(400);
    } else {
      if (roleId === "special-fading-genius") {
        expect(previous.player.research).toBe(19.6);
        expect(current.player.research).toBe(19.4);
      } else {
        expect(previous.illnessProbability).toBe(10);
        expect(current.illnessProbability).toBe(9);
      }
      const incorrectlyVersioned = structuredClone(replay);
      const last = incorrectlyVersioned.commands.at(-1)!;
      if (last.kind === "action") delete last.ruleset;
      expect(verifyRunReplay(incorrectlyVersioned, { state: checkpoint, index: 1 }, current)).toBeNull();
    }
  });
});
