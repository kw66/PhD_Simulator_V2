import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { captureAcademicYear, mergeAcademicYear, restoreAcademicYear, normalizeAcademicArchive } from "../src/core/v2-rewinder-academic-record";
import { hasAcademicEquipmentConflict } from "../src/core/v2-rewinder-academic-equipment";
import { prepareAcademicArchive, getAcademicArchivePreview } from "../src/core/v2-rewinder-academic";
import { getGiftAwareShopSellPrice } from "../src/core/v2-lover-gift";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { recordTalentTransitions } from "../src/core/v2-talent-transitions";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import type { GameState, ShopItemId, SupportItemId } from "../src/core/v2-types";

function state(): GameState {
  const base = createStartedGameState("rewinder");
  return { ...base, year: 1, month: 12, totalMonths: 12, selectedAdvisorName: "导师", playerName: "学生",
    eventQueue: [], player: { ...base.player, money: 1000, san: 100 }, sanCap: 100 };
}
function buy(state: GameState, item: ShopItemId, gift = false): GameState {
  return dispatchAction(gift ? { ...state, loverProgressState: { ...state.loverProgressState, giftCoupons: 1 } } : state,
    "buy-shop-item", { shopItemId: item });
}
const selection = { paperSource: "current" as const, personKeys: ["current:advisor"] };

describe("r61 academic equipment inheritance", () => {
  it("keeps all durable equipment and exact investment while dropping temporary subscriptions and reimbursements", () => {
    let s = state();
    for (const item of ["gpu_buy", "gpu_buy", "chair", "keyboard", "monitor", "bike", "bike", "ebike", "down_jacket"] as ShopItemId[]) s = buy(s, item);
    for (const supportItemId of ["parasol", "badminton_racket"] as SupportItemId[]) s = dispatchAction(s, "buy-support-item", { supportItemId });
    s = dispatchAction(s, "upgrade-shop-item", { shopUpgradeId: "chair-hammock" });
    s = dispatchAction(s, "buy-coffee-machine");
    s = dispatchAction(s, "buy-ai-month", { aiSlotId: "gpt" });
    s = { ...s, coffeeState: { ...s.coffeeState, subscriptionEnabled: true, subscriptionPaused: true, machineTrackedCoffeeCount: 35 },
      shopState: { ...s.shopState, chairSanRecovered: 42, bikeSanSpent: 20, bikeSanCapGains: 5,
        entitlements: { gpuTransaction: 2, workstationTransaction: 1 }, labReimbursements: { totalMonths: 12, gpuTransaction: 1, workstationTransaction: 1 } } };
    const record = captureAcademicYear(s);
    const restored = restoreAcademicYear(state(), record);
    expect(restored.shopState).toMatchObject({ gpuLevel: 2, chairOwned: true, chairUpgrade: "hammock", chairSanRecovered: 42,
      keyboardOwned: true, monitorOwned: true, bikeLevel: 2, ebikeOwned: true, bikeSanSpent: 20, bikeSanCapGains: 5,
      investments: s.shopState.investments, entitlements: { gpuTransaction: 0, workstationTransaction: 0 },
      labReimbursements: { totalMonths: null, gpuTransaction: 0, workstationTransaction: 0 } });
    expect(restored.eventSupport).toMatchObject({ hasDownJacket: true, hasParasol: true, hasBadmintonRacket: true });
    expect(restored.aiShopState.subscriptions.gpt.active).toBe(false);
    expect(restored.coffeeState).toMatchObject({ machineOwned: true, subscriptionEnabled: false, subscriptionPaused: false, machineTrackedCoffeeCount: 35 });
    expect(restored.player.money).toBe(s.player.money);
    expect(normalizeAcademicArchive({ version: 1, years: { 1: record } }).years[1]).toEqual(record);
  });

  it("merges levels by maximum, independent ownership by union, and keeps each selected purchase basis", () => {
    let previous = buy(buy(buy(state(), "gpu_buy"), "keyboard"), "bike");
    let current = buy(buy(buy(state(), "gpu_buy", true), "gpu_buy", true), "monitor");
    current = buy(buy(current, "bike", true), "bike", true);
    previous = buy(previous, "ebike");
    previous.player.money = 900;
    current.player.money = 100;
    previous.shopState.chairSanRecovered = 20;
    current.shopState.chairSanRecovered = 40;
    const merged = mergeAcademicYear(captureAcademicYear(current), captureAcademicYear(previous), selection);
    const restored = restoreAcademicYear(state(), merged);
    expect(restored.shopState).toMatchObject({ gpuLevel: 2, bikeLevel: 2, keyboardOwned: true, monitorOwned: true, ebikeOwned: true, chairSanRecovered: 40 });
    expect(restored.player.money).toBe(900);
    expect(getGiftAwareShopSellPrice(restored, "gpu_buy")).toBe(0);
    expect(getGiftAwareShopSellPrice(restored, "bike")).toBe(0);
    expect(restored.shopState.investments.gpu).toBe(current.shopState.investments.gpu);
    expect(restored.shopState.investments.keyboard).toBe(previous.shopState.investments.keyboard);
    const twice = mergeAcademicYear(captureAcademicYear(current), merged, selection);
    expect(twice.equipment).toEqual(merged.equipment);
  });

  it.each(["ebike", "down_jacket", "parasol", "badminton_racket"] as const)("preserves zero versus missing resale basis for %s", item => {
    let gifted = state();
    gifted.loverProgressState.giftCoupons = 1;
    gifted = item === "parasol" || item === "badminton_racket"
      ? dispatchAction(gifted, "buy-support-item", { supportItemId: item }) : buy(gifted, item);
    const restored = restoreAcademicYear(state(), mergeAcademicYear(captureAcademicYear(state()), captureAcademicYear(gifted), selection));
    expect(getGiftAwareShopSellPrice(restored, item)).toBe(0);
    const money = restored.player.money;
    const sold = item === "parasol" || item === "badminton_racket"
      ? dispatchAction(restored, "sell-support-item", { supportItemId: item }) : dispatchAction(restored, "sell-shop-item", { shopItemId: item });
    expect(sold.player.money).toBe(money);
    const legacy = structuredClone(gifted);
    delete (legacy.shopState.investments as unknown as Record<string, number>)[item];
    const legacyRestored = restoreAcademicYear(state(), captureAcademicYear(legacy));
    expect(Object.hasOwn(legacyRestored.shopState.investments, item)).toBe(false);
    expect(getGiftAwareShopSellPrice(legacyRestored, item)).toBe(getGiftAwareShopSellPrice(legacy, item));
    expect(getGiftAwareShopSellPrice(legacyRestored, item)).toBeGreaterThan(0);
  });

  it("chooses chair routes with their own purchase basis, preserves cumulative recovery and dispatches the selection", () => {
    let old = buy(state(), "chair"), current = buy(state(), "chair", true);
    old = dispatchAction(old, "upgrade-shop-item", { shopUpgradeId: "chair-massage" });
    current.loverProgressState.giftCoupons = 1;
    current = dispatchAction(current, "upgrade-shop-item", { shopUpgradeId: "chair-hammock" });
    old.shopState.chairSanRecovered = 70;
    current.shopState.chairSanRecovered = 10;
    const previous = captureAcademicYear(old);
    const a = captureAcademicYear(current);
    expect(hasAcademicEquipmentConflict(a, previous, "chair")).toBe(true);
    let pending = prepareAcademicArchive({ ...current, rewinderState: { ...current.rewinderState!, academic: { startYear: 1, history: { version: 1, years: { 1: previous } } } } });
    expect(getAcademicArchivePreview(pending)?.chairSource).toBe("current");
    pending = dispatchAction(pending, "select-rewinder-archive-chair", { rewinderChairSource: "previous" });
    expect(getAcademicArchivePreview(pending)?.best.equipment.longTerm).toMatchObject({ chairUpgrade: "massage", chairSanRecovered: 70, investments: { chair: old.shopState.investments.chair } });
    pending = dispatchAction(pending, "confirm-rewinder-archive");
    const restored = restoreAcademicYear(state(), pending.rewinderState!.academic!.completed!);
    expect(getGiftAwareShopSellPrice(restored, "chair")).toBe(getGiftAwareShopSellPrice(old, "chair"));
    const other = restoreAcademicYear(state(), mergeAcademicYear(a, previous, { ...selection, chairSource: "current" }));
    expect(other.shopState).toMatchObject({ chairUpgrade: "hammock", chairSanRecovered: 70 });
    expect(getGiftAwareShopSellPrice(other, "chair")).toBe(0);
    const basic = captureAcademicYear(buy(state(), "chair"));
    expect(hasAcademicEquipmentConflict(basic, previous, "chair")).toBe(false);
    expect(mergeAcademicYear(basic, previous, selection).equipment.longTerm?.chairUpgrade).toBe("massage");
  });

  it("does not repay bike growth or duplicate workstation rewards, but enables a newly combined workstation once", () => {
    let old = buy(buy(state(), "chair"), "keyboard");
    let current = buy(state(), "monitor");
    current = dispatchAction(current, "buy-coffee-machine");
    old.shopState = { ...old.shopState, bikeOwned: true, bikeLevel: 4, bikeSanSpent: 48, bikeSanCapGains: 12 };
    const merged = mergeAcademicYear(captureAcademicYear(current), captureAcademicYear(old), selection);
    let restored = restoreAcademicYear(state(), merged);
    const cap = restored.sanCap;
    const monthly = applyMonthlyEffects(restored).nextState;
    expect(monthly.sanCap).toBe(cap);
    expect(restored.buffs.some(buff => buff.id === "perfect-workstation")).toBe(false);
    restored = recordTalentTransitions(restored, restored);
    expect(restored.buffs.filter(buff => buff.id === "perfect-workstation")).toHaveLength(1);
    const recaptured = restoreAcademicYear(state(), captureAcademicYear(restored));
    expect(recordTalentTransitions(recaptured, recaptured).buffs.filter(buff => buff.id === "perfect-workstation")).toHaveLength(1);
    expect(recaptured.buffs.find(buff => buff.id === "perfect-workstation")?.actionEffects?.idea?.bonus).toBe(2);
  });

  it("loads legacy archives without invented assets and preserves r60 capture/restore behavior", () => {
    const equipped = buy(buy(state(), "gpu_buy"), "ebike");
    equipped.coffeeState.subscriptionEnabled = true;
    const legacy = withGameplayRuleset("20261104-r60", () => captureAcademicYear(equipped));
    expect(legacy.equipment.longTerm).toBeUndefined();
    expect(normalizeAcademicArchive({ version: 1, years: { 1: legacy } }).years[1]).toEqual(legacy);
    const restored = restoreAcademicYear(state(), legacy);
    expect(restored.shopState).toMatchObject({ gpuLevel: 0, chairOwned: false, ebikeOwned: true });
    expect(restored.coffeeState.subscriptionEnabled).toBe(false);
    withGameplayRuleset("20261104-r60", () => {
      const old = restoreAcademicYear(state(), legacy);
      expect(old.shopState).toMatchObject({ gpuLevel: 0, ebikeOwned: false });
      expect(old.coffeeState.subscriptionEnabled).toBe(true);
      const merged = mergeAcademicYear(legacy, legacy);
      expect(merged.equipment.longTerm).toBeUndefined();
      expect(merged.equipment.bike.ebikeOwned).toBe(false);
      const pending = prepareAcademicArchive({ ...equipped, rewinderState: { ...equipped.rewinderState!,
        academic: { startYear: 1, history: { version: 1, years: {} } } } });
      expect(pending.rewinderState!.academic!.pending).not.toHaveProperty("chairSource");
      expect(dispatchAction(pending, "select-rewinder-archive-chair", { rewinderChairSource: "previous" })).toBe(pending);
    });
  });

  it.each([
    (asset: Record<string, unknown>) => { asset.gpuLevel = 11; },
    (asset: Record<string, unknown>) => { asset.chairUpgrade = "invented"; },
    (asset: Record<string, unknown>) => { (asset.investments as Record<string, unknown>).parasol = -1; },
    (asset: Record<string, unknown>) => { asset.chairSanRecovered = Infinity; },
  ])("rejects malformed optional equipment while retaining valid old records", corrupt => {
    const good = captureAcademicYear(state());
    const bad = structuredClone(good);
    corrupt(bad.equipment.longTerm as unknown as Record<string, unknown>);
    expect(normalizeAcademicArchive({ version: 1, years: { 1: bad } }).years).toEqual({});
    expect(normalizeAcademicArchive({ version: 1, years: { 1: good } }).years[1]).toEqual(good);
  });
});
