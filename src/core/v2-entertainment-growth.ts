import type { EventCounters } from "./v2-event-counters";

export function getEntertainmentGrowth(counters: EventCounters) {
  return {
    terrariaCost: Math.max(0, 4 - counters.terrariaCount),
    magicTowerCost: Math.max(0, 6 - counters.magicTowerCount),
    shinyPercent: Math.min(100, 50 + counters.rocoCount * 10),
  };
}
