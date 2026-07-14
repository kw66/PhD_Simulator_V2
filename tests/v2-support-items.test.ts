import { describe, expect, it } from "vitest";

import { SUPPORT_ITEM_DEFINITIONS, applySupportItemOwnership, getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "../src/core/v2-support-items";

describe("v2 support items", () => {
  it("exposes the audited support item prices", () => {
    expect(SUPPORT_ITEM_DEFINITIONS.map((item) => [item.id, item.price])).toEqual([
      ["badminton_racket", 4],
      ["game_controller", 4],
      ["parasol", 10],
    ]);
    expect(getSupportItemDefinition("parasol").name).toBe("遮阳伞");
    expect(getSupportItemSellPrice("parasol")).toBe(5);
  });

  it("toggles ownership through eventSupport flags", () => {
    const base = { hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, hasFinanceTalent: false };
    const owned = applySupportItemOwnership(base, "badminton_racket", true);

    expect(isSupportItemOwned(owned, "badminton_racket")).toBe(true);
    expect(isSupportItemOwned(owned, "parasol")).toBe(false);

    const sold = applySupportItemOwnership(owned, "badminton_racket", false);
    expect(isSupportItemOwned(sold, "badminton_racket")).toBe(false);
  });
});
