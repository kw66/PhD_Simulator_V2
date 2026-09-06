import { describe, expect, it } from "vitest";

import { SUPPORT_ITEM_DEFINITIONS, getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "../src/core/v2-support-items";

describe("v2 support items", () => {
  it("exposes the audited support item prices", () => {
    expect(SUPPORT_ITEM_DEFINITIONS.map((item) => [item.id, item.price])).toEqual([
      ["badminton_racket", 6],
      ["parasol", 10],
    ]);
    expect(getSupportItemDefinition("parasol").name).toBe("遮阳伞");
    expect(getSupportItemSellPrice("parasol")).toBe(5);
  });

  it("reads ownership from event-support flags", () => {
    const state = { hasParasol: false, hasDownJacket: false, hasBadmintonRacket: true, hasStrongBodyTalent: false };
    expect(isSupportItemOwned(state, "badminton_racket")).toBe(true);
    expect(isSupportItemOwned(state, "parasol")).toBe(false);
  });
});
