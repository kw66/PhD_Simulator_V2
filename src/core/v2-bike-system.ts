import type { ShopState } from "./v2-types";

export interface BikeTierDefinition {
  level: number;
  name: string;
  monthlySanCost: number;
  sanCapLimit: number;
  price: number;
}

/** Bicycle upgrades use one continuous chain, like the GPU upgrades. */
export const BIKE_TIER_DEFINITIONS: readonly BikeTierDefinition[] = [
  { level: 1, name: "自行车", monthlySanCost: 1, sanCapLimit: 3, price: 6 },
  { level: 2, name: "轻量自行车", monthlySanCost: 1, sanCapLimit: 6, price: 6 },
  { level: 3, name: "公路车", monthlySanCost: 2, sanCapLimit: 9, price: 6 },
  { level: 4, name: "竞速公路车", monthlySanCost: 2, sanCapLimit: 12, price: 6 },
];

export function getBikeTierDefinition(level: number): BikeTierDefinition | null {
  const normalized = Math.floor(level);
  return BIKE_TIER_DEFINITIONS.find((tier) => tier.level === normalized) ?? null;
}

export function getNextBikeTierDefinition(level: number): BikeTierDefinition | null {
  return getBikeTierDefinition(Math.max(0, Math.floor(level)) + 1);
}

export function getBikeTierLevel(shopState: Pick<ShopState, "bikeLevel">): number {
  return Math.max(0, Math.min(BIKE_TIER_DEFINITIONS.length, Math.floor(shopState.bikeLevel)));
}

export function getBikeMonthlySanCost(shopState: Pick<ShopState, "bikeOwned" | "bikeLevel" | "bikeSanCapGains">): number {
  if (!shopState.bikeOwned) return 0;
  const tier = getBikeTierDefinition(getBikeTierLevel(shopState));
  if (!tier || shopState.bikeSanCapGains >= tier.sanCapLimit) return 0;
  return tier.monthlySanCost;
}

export function getBikeSanCapLimit(shopState: Pick<ShopState, "bikeLevel">): number {
  return getBikeTierDefinition(getBikeTierLevel(shopState))?.sanCapLimit ?? 0;
}

export function getBikeSellPrice(shopState: Pick<ShopState, "bikeLevel">): number {
  return Math.floor(BIKE_TIER_DEFINITIONS
    .slice(0, getBikeTierLevel(shopState))
    .reduce((total, tier) => total + tier.price, 0) / 2);
}
