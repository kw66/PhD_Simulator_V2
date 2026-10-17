import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getMonthEndIllnessDelta, initializeCurse, repayCurseDebt, settleCurseMonthStart } from "../src/core/v2-curse-system";
import { applyEventPlayerEffects } from "../src/core/v2-event-player-effects";
import { evaluateCoreEndings, finishTrainingIfReady } from "../src/core/v2-ending-system";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { applyRoleTalentRest } from "../src/core/v2-role-talent-rest";
import { getRecoveredSan } from "../src/core/v2-san-recovery";
import { createMemoryRunSaveAdapter, createRunSaveRepository, validateRunSaveRecord } from "../src/core/v2-run-saves";
import { createRunReplay, replayStateDigest, verifyRunReplay } from "../src/core/v2-run-replay";
import type { CurseDifficulty } from "../src/core/v2-curse-system";
import type { GameState } from "../src/core/v2-types";

function month(state: GameState, totalMonths: number): GameState {
  return { ...state, totalMonths, month: (totalMonths - 1) % 12 + 1, year: Math.floor((totalMonths - 1) / 12) + 1 };
}
describe("cursed character run rules", () => {
  it.each([1, 2, 3, 4] as const)("fixes difficulty %s at start without allocating talents", difficulty => {
    const fading = createStartedGameState("special-fading-genius", {}, 0, difficulty);
    expect(fading.curseState?.difficulty).toBe(difficulty);
    expect(fading.player.research).toBe([18, 16, 14, 12][difficulty - 1]);
    expect(fading.paperSlotsUnlocked).toBe([4, 3, 3, 3][difficulty - 1]);
    const finite = createStartedGameState("special-finite-life", {}, 0, difficulty);
    expect(finite.player.san).toBe([300, 200, 120, 80][difficulty - 1]);
    expect(finite.sanCap).toBe(finite.player.san);
    expect(createStartedGameState("cursed-debt", {}, 0, difficulty).curseState?.debt).toBe([60, 80, 100, 120][difficulty - 1]);
  });
  it("keeps ordinary characters unchanged and validates malformed difficulty", () => {
    const ordinary = createStartedGameState("normal");
    expect(initializeCurse(ordinary, 4)).toBe(ordinary);
    expect(initializeCurse(createStartedGameState("cursed-frail"), 999).curseState?.difficulty).toBe(1);
  });
  it.each([1, 2, 3, 4] as const)("replaces illness percentage points at difficulty %s", difficulty => {
    for (const [san, expected] of [[5, 9], [6, 6], [12, 3], [17.99, 3], [18, 1], [19, 1], [20, 1]]) {
      const state = month(createStartedGameState("cursed-frail", {}, 0, difficulty), 1);
      expect(getMonthEndIllnessDelta({ ...state, player: { ...state.player, san: san! } })).toBe(expected! * difficulty);
    }
    expect(getMonthEndIllnessDelta(createStartedGameState("cursed-frail", {}, 0, difficulty))).toBe(0);
  });
  it("starts decay after September and resists each loss normally", () => {
    const state = createStartedGameState("special-fading-genius");
    expect(settleCurseMonthStart(month(state, 1)).player.research).toBe(18);
    const october = settleCurseMonthStart(month(state, 2));
    expect(october.player.research).toBe(17.8);
    expect(settleCurseMonthStart(october)).toBe(october);
    const depleted = { ...month(state, 2), player: { ...state.player, research: 0.5 } };
    expect(settleCurseMonthStart(depleted).player.research).toBe(0);
    expect(evaluateCoreEndings(settleCurseMonthStart(depleted)).phase).toBe("playing");
    expect(evaluateCoreEndings(settleCurseMonthStart({ ...month(depleted, 3), player: { ...depleted.player, research: 0 } })).ending).toBe("overthinking");
  });
  it.each([[18, 17.8], [17.9, 17.6], [12, 11.7], [11.9, 11.5], [6, 5.6], [5.9, 5.4]])(
    "applies half-point decay at the current research tier: %s to %s", (research, expected) => {
      const state = month(createStartedGameState("special-fading-genius"), 2);
      const result = settleCurseMonthStart({ ...state, player: { ...state.player, research } });
      expect(result.player.research).toBe(expected);
    },
  );
  it("keeps the ordinary high-SAN illness reduction", () => {
    const state = month(createStartedGameState("normal"), 1);
    expect(getMonthEndIllnessDelta({ ...state, player: { ...state.player, san: 18 } })).toBe(-2);
  });
  it("blocks direct recovery, full restoration and rest while allowing cap changes", () => {
    const initial = createStartedGameState("special-finite-life");
    const spent = { ...initial, player: { ...initial.player, san: 100 } };
    expect(getRecoveredSan(100, 300, 99, "special-finite-life")).toBe(100);
    const changed = applyEventPlayerEffects(spent, { san: 999, restoreSanToCap: true, sanCapDelta: 3 });
    expect(changed.player.san).toBe(100);
    expect(changed.sanCap).toBe(303);
    expect(applyRoleTalentRest(spent).player.san).toBe(100);
    expect(applyEventPlayerEffects(spent, { san: -5 }).player.san).toBe(95);
    const wounded = applyEventPlayerEffects(initial, { sanCapDelta: -2 });
    expect(wounded.player.san).toBe(298);
    expect(applyEventPlayerEffects(wounded, { sanCapDelta: 2 }).player.san).toBe(298);
  });
  it("does not permit the emergency chair to resurrect finite life", () => {
    const state = createStartedGameState("special-finite-life");
    const exhausted: GameState = { ...state, player: { ...state.player, san: -1 },
      shopState: { ...state.shopState, chairOwned: true, chairUpgrade: "spike" } };
    expect(evaluateCoreEndings(exhausted).ending).toBe("burnout");
  });
  it("suppresses every positive monthly SAN source before batching drains", () => {
    const state = month(createStartedGameState("special-finite-life"), 2);
    const prepared: GameState = { ...state, player: { ...state.player, san: 90, money: 100 },
      shopState: { ...state.shopState, chairOwned: true, chairUpgrade: "massage" },
      eventSupport: { ...state.eventSupport, hasStrongBodyTalent: true },
      buffs: [{ id: "test-positive-san", name: "Positive", source: "Test", timing: "permanent", remainingMonths: null, monthlyStats: { san: 200 } },
        { id: "test-drain-san", name: "Drain", source: "Test", timing: "permanent", remainingMonths: null, monthlyStats: { san: -3 } }],
    };
    const result = applyMonthlyEffects(prepared);
    expect(result.nextState.player.san).toBe(87);
    expect(result.resolution.items.filter(item => (item.stats.san ?? 0) > 0).every(item => item.appliedStats.san === 0)).toBe(true);
    expect(result.nextState.shopState.chairSanRecovered).toBe(0);
  });
  it("compounds debt without integer rounding, only once each month", () => {
    const state = createStartedGameState("cursed-debt");
    expect(state.player.money).toBe(1);
    expect(settleCurseMonthStart(month(state, 1)).curseState?.debt).toBe(60);
    const october = settleCurseMonthStart(month(state, 2));
    expect(october.curseState?.debt).toBe(61.2);
    expect(settleCurseMonthStart(october)).toBe(october);
    expect(settleCurseMonthStart(month(october, 3)).curseState?.debt).toBe(62.424);
  });
  it("repays independently from actions, preserves income counters and records spending", () => {
    const initial = createStartedGameState("cursed-debt");
    const state = { ...initial, player: { ...initial.player, money: 70 } };
    const partial = repayCurseDebt(state, 20);
    expect(partial.player.money).toBe(50);
    expect(partial.curseState?.debt).toBe(40);
    expect(partial.personalSpending).toBe(20);
    expect(partial.actionState).toEqual(state.actionState);
    const cleared = dispatchAction(partial, "repay-debt");
    expect(cleared.curseState?.debt).toBe(0);
    expect(cleared.player.money).toBe(10);
    expect(cleared.personalSpending).toBe(60);
    expect(settleCurseMonthStart(month(cleared, 2)).curseState?.debt).toBe(0);
    expect(repayCurseDebt(state, Infinity)).toBe(state);
    expect(repayCurseDebt(state, -2)).toBe(state);
  });
  it("clears fractional debt without creating negative money or free subcent repayments", () => {
    const state = month(createStartedGameState("cursed-debt"), 3);
    state.curseState = { ...state.curseState!, debt: 0.024 };
    expect(repayCurseDebt(state).player.money).toBe(0.97);
    expect(repayCurseDebt(state).curseState?.debt).toBe(0);
    expect(repayCurseDebt(state, 0.001).curseState?.debt).toBe(0.024);
  });
  it("requires clearing debt as well as academic requirements for graduation", () => {
    const state = createStartedGameState("cursed-debt");
    const ready: GameState = { ...state, totalMonths: state.maxMonths, graduationScoreTarget: 0,
      thesis: { ...state.thesis, degree: "master", reviewResolved: true, review: { ...state.thesis.review!, passed: true } } };
    expect(finishTrainingIfReady(ready).ending).toBe("delay");
    expect(finishTrainingIfReady({ ...ready, curseState: { ...ready.curseState!, debt: 0 } }).ending).toBe("master");
  });
  it("previews decline exactly without mutating the live branch", () => {
    const state = month(createStartedGameState("special-fading-genius"), 1);
    const before = structuredClone(state);
    expect(previewNextMonthEffects(state).player.research).toBe(17.8);
    expect(state).toEqual(before);
  });
  it("runs decay and debt exactly once through the real month transition", () => {
    const fading = month(createStartedGameState("special-fading-genius"), 1);
    const december = dispatchAction({ ...fading, player: { ...fading.player, money: 100 } }, "next-month");
    expect(december.totalMonths).toBe(2);
    expect(december.player.research).toBe(17.8);
    const debt = month(createStartedGameState("cursed-debt"), 1);
    const withMoney = { ...debt, player: { ...debt.player, money: 100 } };
    previewNextMonthEffects(withMoney);
    previewNextMonthEffects(withMoney);
    const advanced = dispatchAction(withMoney, "next-month");
    expect(advanced.totalMonths).toBe(2);
    expect(advanced.curseState?.debt).toBe(61.2);
    expect(withMoney.curseState?.debt).toBe(60);
  });
  it("does not recover finite life through purchased coffee", () => {
    const finite = month(createStartedGameState("special-finite-life"), 1);
    const result = dispatchAction({ ...finite, player: { ...finite.player, san: 50, money: 100 } }, "buy-coffee");
    expect(result.player.san).toBe(50);
    expect(result.player.money).toBeLessThan(100);
  });
  it("saves difficulty and restores debt when rewinding, deleting future history", () => {
    const repository = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter() });
    const state = month(createStartedGameState("cursed-debt", {}, 0, 3), 1);
    repository.commit(state, { monthStart: true });
    const later = repayCurseDebt(settleCurseMonthStart(month(state, 2)));
    repository.commit(later, { monthStart: true });
    const rewind = repository.rewind("cursed-debt", "month:1")!;
    expect(rewind.latest.state.curseState).toEqual(state.curseState);
    expect(rewind.months.map(item => item.totalMonths)).toEqual([1]);
    expect(replayStateDigest(settleCurseMonthStart(month(rewind.latest.state, 2)))).toBe(replayStateDigest(settleCurseMonthStart(month(state, 2))));
  });
  it("rejects missing curse metadata and altered difficulty inside a saved run", () => {
    const repository = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter() });
    repository.commit(month(createStartedGameState("cursed-debt", {}, 0, 2), 1), { monthStart: true });
    const record = repository.commit(month(createStartedGameState("cursed-debt", {}, 0, 2), 2), { monthStart: true });
    expect(validateRunSaveRecord(record)).toBe(true);
    const altered = structuredClone(record);
    altered.months[0]!.state.curseState!.difficulty = 4;
    expect(validateRunSaveRecord(altered)).toBe(false);
    const missing = structuredClone(record);
    delete missing.latest.state.curseState;
    expect(validateRunSaveRecord(missing)).toBe(false);
  });
  it.each([1, 4] as const)("includes starting difficulty %s and repayment in deterministic replay", difficulty => {
    const initial = createInitialState();
    const payload = { roleId: "cursed-debt" as const, curseDifficulty: difficulty as CurseDifficulty };
    const started = dispatchAction(initial, "start-game", payload);
    const replay = createRunReplay(initial, started, payload);
    const repaid = dispatchAction(started, "repay-debt", { debtRepayment: 0.5 });
    replay.commands.push({ kind: "action", actionId: "repay-debt", payload: { debtRepayment: 0.5 } });
    expect(verifyRunReplay(replay, { state: replay.initial, index: 0 }, repaid)).not.toBeNull();
  });
});
