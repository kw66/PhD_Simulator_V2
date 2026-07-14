import { describe, expect, it } from "vitest";

import {
  canSubmitNature,
  canSubmitNatureSub,
  canUpgradeSlotToJournal,
  meetsNatureAcceptThreshold,
  meetsNatureSubAcceptThreshold,
  upgradeSlotToJournal,
} from "../src/core/v2-journal-rules";

describe("v2 journal rules", () => {
  it("只有发表过 A 类且尚未升级的槽位才具备期刊升级资格", () => {
    expect(canUpgradeSlotToJournal(0, [true, false, false, false], [false, false, false, false])).toBe(true);
    expect(canUpgradeSlotToJournal(0, [false, false, false, false], [false, false, false, false])).toBe(false);
    expect(canUpgradeSlotToJournal(0, [true, false, false, false], [true, false, false, false])).toBe(false);
  });

  it("升级期刊槽时只修改目标槽位", () => {
    expect(upgradeSlotToJournal(1, [false, false, false, false])).toEqual([false, true, false, false]);
  });

  it("Nature 子刊和 Nature 的投稿阈值沿用已确认旧版口径", () => {
    expect(canSubmitNatureSub(99)).toBe(false);
    expect(canSubmitNatureSub(100)).toBe(true);
    expect(canSubmitNature(149)).toBe(false);
    expect(canSubmitNature(150)).toBe(true);
  });

  it("Nature 子刊和 Nature 的接收阈值沿用已确认旧版口径", () => {
    expect(meetsNatureSubAcceptThreshold(249)).toBe(false);
    expect(meetsNatureSubAcceptThreshold(250)).toBe(true);
    expect(meetsNatureAcceptThreshold(499)).toBe(false);
    expect(meetsNatureAcceptThreshold(500)).toBe(true);
  });
});
