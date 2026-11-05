import { createStartedGameState } from "../../src/core/v2-engine-state-factory";
import { captureAcademicYear } from "../../src/core/v2-rewinder-academic-record";
import { prepareAcademicArchive } from "../../src/core/v2-rewinder-academic";
import type { GameState } from "../../src/core/v2-types";

/** Dense archive state for presentation checks; not evidence of a naturally played run. */
export function createAcademicEquipmentFixture(): GameState {
  const base = createStartedGameState("rewinder");
  const current: GameState = { ...base, phase: "playing", totalMonths: 12, month: 12, year: 1,
    selectedAdvisorName: "张教授", eventQueue: [],
    shopState: { ...base.shopState, gpuLevel: 5, chairOwned: true, chairUpgrade: "massage", chairSanRecovered: 24,
      keyboardOwned: true, monitorOwned: true, bikeOwned: true, bikeLevel: 2, bikeSanSpent: 18, bikeSanCapGains: 3, ebikeOwned: true },
    eventSupport: { ...base.eventSupport, hasDownJacket: true, hasParasol: true, hasBadmintonRacket: true },
    coffeeState: { ...base.coffeeState, machineOwned: true, machineUpgrade: "automatic", machineTrackedCoffeeCount: 12 },
    buffs: [
      { id: "test-report", name: "报告收获", source: "VALSE报告", timing: "permanent", remainingMonths: null, actionEffects: { idea: { bonus: 2 } } },
      { id: "test-discussion", name: "讨论收获", source: "学术讨论", timing: "permanent", remainingMonths: null, actionEffects: { idea: { bonus: 3 }, writing: { bonus: 1 } } },
    ] };
  const previous = captureAcademicYear({ ...current,
    shopState: { ...current.shopState, chairUpgrade: "hammock" },
    coffeeState: { ...current.coffeeState, machineUpgrade: "advanced" } });
  return prepareAcademicArchive({ ...current, rewinderState: { ...base.rewinderState!, cycleNumber: 2,
    academic: { startYear: 1, history: { version: 1, years: { 1: previous } } } } });
}
