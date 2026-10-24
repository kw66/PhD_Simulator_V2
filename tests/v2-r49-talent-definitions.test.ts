import { describe, expect, it } from "vitest";
import { getDesignedTalentNodes, getTalentPointBalance, getTalentUpgradeReason, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

describe("r49 sloth and jealousy allocations", () => {
  it("makes each sloth reserve rank cost one and preserves r48 allocations", () => {
    const allocation = { "monthly-san-recovery": 3, "post-phd-recovery": 3, "san-cap-reserve": 2 };
    expect(sanitizeRoleTalentAllocation("normal-reversed", 0, allocation)).toEqual(allocation);
    expect(getTalentPointBalance("normal-reversed", 0, allocation)).toBe(2);
    expect(getTalentUpgradeReason("normal-reversed", 0, allocation, "san-cap-reserve")).not.toBeNull();
    withGameplayRuleset("20261024-r48", () => {
      const nodes = getDesignedTalentNodes("normal-reversed")!;
      expect(nodes.find(n => n.id === "monthly-san-recovery")).toMatchObject({ cost: 2, maxLevel: 3 });
      expect(nodes.find(n => n.id === "san-cap-reserve")).toMatchObject({ cost: 2, maxLevel: 1, effect: "每浪费1常规行动点，SAN上限+1，最多+20" });
    });
  });

  it("opens the copied bond and rejection branches only from their designated roots", () => {
    for (const [root, talent, rank, remaining] of [
      ["junior-event-focus", "junior-bond", 3, 6],
      ["senior-event-focus", "rejection-camaraderie", 2, 5],
    ] as const) {
      const allocation = { [root]: 1, [talent]: rank };
      expect(sanitizeRoleTalentAllocation("social-reversed", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("social-reversed", 0, allocation)).toBe(remaining);
      expect(getTalentUpgradeReason("social-reversed", 0, {}, talent)).not.toBeNull();
      expect(getTalentUpgradeReason("social-reversed", 0, { "peer-event-focus": 1 }, talent)).not.toBeNull();
    }
    const nodes = getDesignedTalentNodes("social-reversed")!;
    expect(nodes.find(n => n.id === "junior-event-focus")?.row).toBe("1");
    expect(nodes.find(n => n.id === "peer-event-focus")?.row).toBe("2");
    expect(new Set(nodes.map(n => `${n.column}:${n.row}`)).size).toBe(nodes.length);
    expect(getDesignedTalentNodes("social")!.find(n => n.id === "junior-bond")).toBeDefined();
    expect(getDesignedTalentNodes("social")!.find(n => n.id === "paper-camaraderie")?.name).toBe("珠联璧合");
  });

  it("keeps legacy jealousy trees and prices intact during r48 replay", () => {
    withGameplayRuleset("20261024-r48", () => {
      const nodes = getDesignedTalentNodes("social-reversed")!;
      expect(nodes).toHaveLength(9);
      expect(nodes.find(n => n.id === "affinity-conversion")?.cost).toBe(4);
      expect(nodes.find(n => n.id === "fellow-add-social")?.cost).toBe(2);
      expect(nodes.find(n => n.id === "fellow-remove-social")?.cost).toBe(2);
      expect(nodes.find(n => n.id === "social-stagnation")?.effect).toContain("连续2个月");
      expect(nodes.find(n => n.id === "junior-bond")).toBeUndefined();
      expect(nodes.find(n => n.id === "rejection-camaraderie")).toBeUndefined();
    });
  });
});
