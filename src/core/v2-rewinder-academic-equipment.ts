import type { ChairUpgradeId, GameState } from "./v2-types";
import type { AcademicYearRecord } from "./v2-rewinder-academic-record";

export interface AcademicLongTermEquipment {
  gpuLevel: number;
  chairOwned: boolean;
  chairUpgrade: ChairUpgradeId;
  chairSanRecovered: number;
  keyboardOwned: boolean;
  monitorOwned: boolean;
  ebikeOwned: boolean;
  hasDownJacket: boolean;
  hasParasol: boolean;
  hasBadmintonRacket: boolean;
  investments: Pick<GameState["shopState"]["investments"], "gpu" | "chair" | "keyboard" | "monitor">
    & Partial<Record<"ebike" | "down_jacket" | "parasol" | "badminton_racket", number>>;
}

export function captureAcademicEquipment(state: GameState): AcademicLongTermEquipment {
  const shop = state.shopState;
  const investment = shop.investments as AcademicLongTermEquipment["investments"];
  return {
    gpuLevel: shop.gpuLevel, chairOwned: shop.chairOwned, chairUpgrade: shop.chairUpgrade,
    chairSanRecovered: shop.chairSanRecovered, keyboardOwned: shop.keyboardOwned, monitorOwned: shop.monitorOwned,
    ebikeOwned: shop.ebikeOwned, hasDownJacket: state.eventSupport.hasDownJacket,
    hasParasol: state.eventSupport.hasParasol, hasBadmintonRacket: state.eventSupport.hasBadmintonRacket,
    investments: { gpu: investment.gpu, chair: investment.chair, keyboard: investment.keyboard, monitor: investment.monitor,
      ...Object.fromEntries((["ebike", "down_jacket", "parasol", "badminton_racket"] as const)
        .filter(key => investment[key] !== undefined).map(key => [key, investment[key]])) },
  };
}

/** Missing fields are genuinely absent from old archives; do not reconstruct gear from achievement history. */
export function getAcademicEquipment(record: AcademicYearRecord): AcademicLongTermEquipment {
  return record.equipment.longTerm ?? { gpuLevel: 0, chairOwned: false, chairUpgrade: null, chairSanRecovered: 0,
    keyboardOwned: false, monitorOwned: false, ebikeOwned: record.equipment.bike.ebikeOwned,
    hasDownJacket: false, hasParasol: false, hasBadmintonRacket: false,
    investments: { gpu: 0, chair: 0, keyboard: 0, monitor: 0 } };
}

export function hasAcademicEquipmentConflict(current: AcademicYearRecord, previous: AcademicYearRecord | undefined, kind: "chair" | "coffee"): boolean {
  if (!previous) return false;
  if (kind === "coffee") return current.equipment.coffee.machineOwned && previous.equipment.coffee.machineOwned
    && current.equipment.coffee.machineUpgrade !== previous.equipment.coffee.machineUpgrade;
  const a = getAcademicEquipment(current), b = getAcademicEquipment(previous);
  return a.chairOwned && b.chairOwned && a.chairUpgrade !== null && b.chairUpgrade !== null && a.chairUpgrade !== b.chairUpgrade;
}

/** Pick each asset as a whole: never pair a cheaper/gifted upgrade with another asset's purchase basis. */
export function mergeAcademicEquipment(current: AcademicYearRecord, previous: AcademicYearRecord, chairSource?: "current" | "previous"): AcademicLongTermEquipment {
  const a = getAcademicEquipment(current), b = getAcademicEquipment(previous);
  const result = structuredClone(a);
  const gpu = b.gpuLevel > a.gpuLevel || b.gpuLevel === a.gpuLevel && b.investments.gpu > a.investments.gpu ? b : a;
  result.gpuLevel = gpu.gpuLevel;
  result.investments.gpu = gpu.investments.gpu;
  const chair = hasAcademicEquipmentConflict(current, previous, "chair") ? chairSource === "previous" ? b : a
    : b.chairOwned && (!a.chairOwned || b.chairUpgrade !== null && a.chairUpgrade === null
      || b.chairUpgrade === a.chairUpgrade && b.investments.chair > a.investments.chair) ? b : a;
  result.chairOwned = chair.chairOwned;
  result.chairUpgrade = chair.chairUpgrade;
  result.investments.chair = chair.investments.chair;
  result.chairSanRecovered = Math.max(a.chairSanRecovered, b.chairSanRecovered);
  for (const [owned, key] of [["keyboardOwned", "keyboard"], ["monitorOwned", "monitor"], ["ebikeOwned", "ebike"],
    ["hasDownJacket", "down_jacket"], ["hasParasol", "parasol"], ["hasBadmintonRacket", "badminton_racket"]] as const) {
    // For the optional fixed-resale basis, undefined means legacy pricing, not a free gift.
    const asset = b[owned] && (!a[owned] || (b.investments[key] ?? -1) > (a.investments[key] ?? -1)) ? b : a;
    result[owned] = a[owned] || b[owned];
    const basis = asset.investments[key];
    if (basis === undefined) delete result.investments[key];
    else result.investments[key] = basis;
  }
  return result;
}
