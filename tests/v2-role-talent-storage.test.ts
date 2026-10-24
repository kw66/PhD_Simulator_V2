import { saveAccountProfile } from "../src/core/v2-account-storage";
import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getDesignedTalentNodes, getTalentPointBalance, getTalentUpgradeReason, isRoleTalentImplemented, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { loadRoleTalentAllocation, ROLE_TALENT_STORAGE_KEY, saveRoleTalentAllocation } from "../src/core/v2-role-talent-storage";
import { createStore } from "../src/core/v2-store";
import { getRoleOptions } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("role talent allocation", () => {
  it("supports the revised playful cap, resistance and four coin refill ranks", () => {
    const allocation = { "favor-reset": 2, "reset-research": 1, "reset-coins": 4, "lower-favor-reset": 4, "end-of-grace": 3 };
    expect(sanitizeRoleTalentAllocation("teacher-child-reversed", 10, allocation)).toEqual(allocation);
    expect(getTalentPointBalance("teacher-child-reversed", 10, allocation)).toBe(5);
    expect(sanitizeRoleTalentAllocation("teacher-child-reversed", 10, { ...allocation, "favor-reset": 3, "reset-coins": 5, "lower-favor-reset": 5, "end-of-grace": 4 })).toEqual(allocation);
    const nodes = getDesignedTalentNodes("teacher-child-reversed")!;
    expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(27);
    expect(nodes.find(node => node.id === "reset-research-cap")?.cost).toBe(1);
    expect(nodes.find(node => node.id === "reset-social-cap")?.cost).toBe(1);
    expect(nodes.find(node => node.id === "favor-reset")).toMatchObject({ name: "恩断义绝", cost: 1, maxLevel: 2 });
    expect(nodes.find(node => node.id === "end-of-grace")).toMatchObject({ name: "得寸进尺", cost: 1, maxLevel: 3 });
    expect(nodes.some(node => node.id === "favor-reset-decrease")).toBe(false);
    withGameplayRuleset("20261023-r43", () => {
      const old = getDesignedTalentNodes("teacher-child-reversed")!;
      expect(old.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(36);
      expect(old.find(node => node.id === "lower-favor-reset")).toMatchObject({ cost: 3, maxLevel: 2 });
    });
    withGameplayRuleset("20261024-r51", () => {
      const old = getDesignedTalentNodes("teacher-child-reversed")!;
      expect(old.find(node => node.id === "favor-reset-decrease")).toMatchObject({ maxLevel: 5, effect: "导师好感上限-1/级" });
    });
  });

  it("cross-connects both early swaps to events before the doctorate permutation", () => {
    for (const root of ["attribute-swap", "san-money-swap"]) for (const event of ["group-event-focus", "game-event-focus"]) {
      const allocation = { [root]: 1, [event]: 1, "post-phd-swap": 1 };
      expect(sanitizeRoleTalentAllocation("chosen-reversed", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("chosen-reversed", 0, allocation)).toBe(3);
      expect(getTalentUpgradeReason("chosen-reversed", 10, allocation, "swap-breaks-cap")).toBeNull();
    }
    expect(getTalentUpgradeReason("chosen-reversed", 10, { "attribute-swap": 1 }, "post-phd-swap")).not.toBeNull();
    expect(getTalentUpgradeReason("chosen-reversed", 10, { "group-event-focus": 1 }, "swap-breaks-cap")).not.toBeNull();
    expect(getDesignedTalentNodes("chosen-reversed")!.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(37);
    withGameplayRuleset("20261023-r42", () => {
      const nodes = getDesignedTalentNodes("chosen-reversed")!;
      expect(nodes.find(node => node.id === "post-phd-swap")?.prerequisiteIds).toEqual(["attribute-swap", "san-money-swap"]);
      expect(nodes.find(node => node.id === "group-event-focus")?.column).toBe("3");
      expect(nodes.find(node => node.id === "reverse-meter-alpha")?.effect).toBe("科研增减抵抗降低10个百分点/级");
    });
  });

  it("opens jealousy conversion from any event branch and separates recruitment/recovery from removal/income", () => {
    for (const root of ["peer-event-focus", "junior-event-focus", "senior-event-focus"]) {
      const allocation = { [root]: 1, "affinity-conversion": 1 };
      expect(sanitizeRoleTalentAllocation("social-reversed", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("social-reversed", 0, allocation)).toBe(7);
      for (const branch of [
        { "fellow-add-social": 1, "social-to-san": 3 },
        { "fellow-remove-social": 1, "social-loss-coins": 3 },
      ] as Record<string, number>[]) {
        expect(sanitizeRoleTalentAllocation("social-reversed", 0, { ...allocation, ...branch })).toEqual({ ...allocation, ...branch });
        expect(getTalentPointBalance("social-reversed", 0, { ...allocation, ...branch })).toBe(3);
      }
    }
    expect(getTalentUpgradeReason("social-reversed", 0, { "fellow-add-social": 1 }, "social-to-san")).toBeNull();
    expect(getTalentUpgradeReason("social-reversed", 0, { "fellow-remove-social": 1 }, "social-loss-coins")).toBeNull();
    expect(getTalentUpgradeReason("social-reversed", 0, {}, "affinity-conversion")).not.toBeNull();
    expect(getTalentUpgradeReason("social-reversed", 0, {}, "fellow-add-social")).not.toBeNull();
    expect(getDesignedTalentNodes("social-reversed")!.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(31);
    withGameplayRuleset("20261023-r40", () => {
      const nodes = getDesignedTalentNodes("social-reversed")!;
      expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(42);
      expect(nodes.find(node => node.id === "social-to-san")?.prerequisiteIds).toEqual([]);
      expect(nodes.find(node => node.id === "fellow-remove-social")?.prerequisiteIds).toEqual(["fellow-add-social"]);
    });
  });

  it("opens salary and gold power from cooperative paper rewards", () => {
    const allocation = { "bring-funding": 1, "knowledge-is-wealth-beta": 1 };
    expect(getTalentUpgradeReason("rich", 0, allocation, "work-pays-off")).toBeNull();
    const learned = { ...allocation, "work-pays-off": 1, "gold-power-alpha": 1 };
    expect(sanitizeRoleTalentAllocation("rich", 0, learned)).toEqual(learned);
    expect(getTalentPointBalance("rich", 0, learned)).toBe(6);
    expect(withGameplayRuleset("20261023-r34", () => getTalentUpgradeReason("rich", 0, allocation, "work-pays-off"))).not.toBeNull();
  });
  it("keeps patronage independent and allows free gold power at an exhausted budget", () => {
    expect(getTalentUpgradeReason("teacher-child", 0, {}, "family-patronage")).toBeNull();
    expect(sanitizeRoleTalentAllocation("teacher-child", 0, { "family-patronage": 1 })).toEqual({ "family-patronage": 1 });
    const allocation = { "red-envelope": 1, "wealth-growth": 5, "investment-savvy": 2 };
    expect(getTalentPointBalance("rich", 0, allocation)).toBe(0);
    expect(getTalentUpgradeReason("rich", 0, allocation, "gold-power-alpha")).toBeNull();
    expect(sanitizeRoleTalentAllocation("rich", 0, { ...allocation, "gold-power-alpha": 1 }))
      .toEqual({ ...allocation, "gold-power-alpha": 1 });
    const before = withGameplayRuleset("20261023-r33", () => getDesignedTalentNodes("rich"));
    expect(before?.find(node => node.id === "bring-funding")?.maxLevel).toBe(5);
    expect(before?.find(node => node.id === "investment-savvy")?.cost).toBe(3);
    expect(before?.find(node => node.id === "work-pays-off")?.cost).toBe(3);
    expect(before?.find(node => node.id === "gold-power-alpha")?.cost).toBe(2);
  });
  it("preserves r39 genius-reversed builds and the twenty-point combined path", () => withGameplayRuleset("20261023-r39", () => {
    const wellness = { "research-wellness": 1, "research-network": 1, "reputation-growth": 1, "social-growth": 1 };
    const rejection = { "learning-from-rejection": 3, "research-network": 1, "reputation-growth": 1, "social-growth": 1 };
    const recovery = { "paper-opening": 3, "knowledge-monetization": 2, "work-life-balance": 1,
      "learning-from-rejection": 3, "break-research-curse": 1 };
    const combined = { "paper-opening": 3, "knowledge-monetization": 2, "work-life-balance": 1,
      "research-wellness": 1, "learning-from-rejection": 3, "research-network": 1,
      "reputation-growth": 1, "social-growth": 1, "break-research-curse": 1 };
    for (const [level, allocation] of [[0, wellness], [0, rejection], [0, recovery], [10, combined]] as const) {
      expect(sanitizeRoleTalentAllocation("genius-reversed", level, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("genius-reversed", level, allocation)).toBe(0);
    }
    expect(getTalentUpgradeReason("genius-reversed", 0, wellness, "paper-opening")).toBe("天赋点不足");
    expect(getTalentUpgradeReason("genius-reversed", 0, wellness, "break-research-curse")).toBeNull();
    expect(sanitizeRoleTalentAllocation("genius-reversed", 0, { ...wellness, "break-research-curse": 1 }))
      .toEqual({ ...wellness, "break-research-curse": 1 });
    expect(getTalentUpgradeReason("genius-reversed", 0, recovery, "paper-opening")).toBe("已满级");
    expect(getTalentUpgradeReason("genius-reversed", 10, rejection, "learning-from-rejection")).toBe("已满级");
    expect(getTalentUpgradeReason("genius-reversed", 10, recovery, "work-life-balance")).toBe("已满级");
    expect(sanitizeRoleTalentAllocation("genius-reversed", 10, { ...rejection, "learning-from-rejection": 4 })).toEqual(rejection);
    expect(getDesignedTalentNodes("genius-reversed")?.find(node => node.id === "papers-to-insight")).toBeUndefined();
  }));

  it("preserves the two r39 genius-reversed research paths", () => withGameplayRuleset("20261023-r39", () => {
    for (const [target, parents] of [
      ["research-network", ["research-wellness", "learning-from-rejection"]],
      ["break-research-curse", ["work-life-balance", "reputation-growth", "social-growth"]],
    ] as const) {
      expect(getTalentUpgradeReason("genius-reversed", 10, {}, target)).not.toBeNull();
      for (const parent of parents) expect(getTalentUpgradeReason("genius-reversed", 10, { [parent]: 1 }, target)).toBeNull();
    }
    expect(getTalentUpgradeReason("genius-reversed", 10, {}, "research-wellness")).toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, {}, "learning-from-rejection")).toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "knowledge-monetization": 1 }, "work-life-balance")).toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "learning-from-rejection": 1 }, "work-life-balance")).not.toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "research-wellness": 1 }, "break-research-curse")).not.toBeNull();
    for (const node of ["reputation-growth", "social-growth"]) {
      expect(getTalentUpgradeReason("genius-reversed", 10, {}, node)).not.toBeNull();
      expect(getTalentUpgradeReason("genius-reversed", 10, { "research-network": 1 }, node)).toBeNull();
    }
  }));

  it("supports three distinct current genius-reversed paths within the legal budget", () => {
    const recovery = { "research-wellness": 1, "knowledge-monetization": 2, "work-life-balance": 1, "break-research-curse": 1 };
    const rejection = { "learning-from-rejection": 1, "research-network": 1, "reputation-growth": 1, "social-growth": 1 };
    const resistance = { "paper-opening": 3, "research-resilience": 3, "learning-from-rejection": 4 };
    const combined = { "research-wellness": 1, "knowledge-monetization": 1, "work-life-balance": 1,
      "learning-from-rejection": 1, "research-network": 1, "reputation-growth": 1,
      "paper-opening": 1, "research-resilience": 3, "break-research-curse": 1 };
    for (const [level, allocation] of [[0, recovery], [0, rejection], [0, resistance], [10, combined]] as const) {
      expect(sanitizeRoleTalentAllocation("genius-reversed", level, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("genius-reversed", level, allocation)).toBe(0);
    }
    const nodes = getDesignedTalentNodes("genius-reversed")!;
    expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(31);
    expect(nodes.find(node => node.id === "research-network")?.prerequisiteIds).toEqual(["learning-from-rejection"]);
    expect(getTalentUpgradeReason("genius-reversed", 10, { "research-wellness": 1 }, "research-network")).not.toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "research-wellness": 1 }, "knowledge-monetization")).toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "paper-opening": 1 }, "knowledge-monetization")).not.toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, {}, "research-resilience")).not.toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "paper-opening": 1 }, "research-resilience")).toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, resistance, "research-resilience")).toBe("已满级");
    expect(getTalentUpgradeReason("genius-reversed", 10, resistance, "learning-from-rejection")).toBe("已满级");
    expect(getTalentUpgradeReason("genius-reversed", 10, { ...recovery, "knowledge-monetization": 4 }, "knowledge-monetization")).toBe("已满级");
    expect(getTalentUpgradeReason("genius-reversed", 0, rejection, "break-research-curse")).toBe("天赋点不足");
    expect(sanitizeRoleTalentAllocation("genius-reversed", 10, { ...resistance, "learning-from-rejection": 5, "research-resilience": 4 })).toEqual(resistance);
    expect(withGameplayRuleset("20261023-r39", () => getDesignedTalentNodes("genius-reversed")?.some(node => node.id === "research-resilience"))).toBe(false);
  });

  it("preserves the original genius-reversed tree, costs and budgets in r32 recordings", () => withGameplayRuleset("20261023-r32", () => {
    const recovery = { "paper-opening": 1, "knowledge-monetization": 1, "learning-from-rejection": 1,
      "work-life-balance": 2, "research-wellness": 1 };
    const network = { "paper-opening": 1, "papers-to-insight": 1, "research-network": 1, "reputation-growth": 1 };
    for (const allocation of [recovery, network]) {
      expect(sanitizeRoleTalentAllocation("genius-reversed", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("genius-reversed", 0, allocation)).toBe(0);
    }
    const nodes = getDesignedTalentNodes("genius-reversed")!;
    expect(nodes).toHaveLength(11);
    expect(nodes.find(node => node.id === "learning-from-rejection")).toMatchObject({ cost: 3, maxLevel: 1 });
    expect(nodes.find(node => node.id === "work-life-balance")).toMatchObject({ cost: 1, maxLevel: 2, prerequisiteIds: ["learning-from-rejection"] });
    expect(nodes.find(node => node.id === "research-network")?.prerequisiteIds).toEqual(["papers-to-insight"]);
    expect(nodes.find(node => node.id === "reputation-growth")?.cost).toBe(3);
    expect(nodes.find(node => node.id === "social-growth")?.cost).toBe(3);
    expect(getTalentUpgradeReason("genius-reversed", 10, { "knowledge-monetization": 1 }, "work-life-balance")).not.toBeNull();
    expect(getTalentUpgradeReason("genius-reversed", 10, { "research-wellness": 1 }, "break-research-curse")).toBeNull();
  }));

  it("supports ten-point sloth growth and rest builds after the cost reductions", () => {
    const growth = { "monthly-san-recovery": 1, "sloth-head-start": 2, "post-phd-growth": 2 };
    const recovery = { "monthly-san-recovery": 1, "post-phd-recovery": 2, "restful-idle": 2,
      "coffee-lifeline": 3, "year-summary-recovery": 1 };
    for (const allocation of [growth, recovery]) {
      expect(sanitizeRoleTalentAllocation("normal-reversed", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("normal-reversed", 0, allocation)).toBe(1);
    }
    expect(getTalentUpgradeReason("normal-reversed", 0, growth, "restful-idle")).toBeNull();
    expect(getTalentUpgradeReason("normal-reversed", 0, recovery, "restful-idle")).toBeNull();
    const nodes = getDesignedTalentNodes("normal-reversed")!;
    expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(34);
    expect(nodes.find(node => node.id === "post-phd-growth")).toMatchObject({ cost: 2, maxLevel: 2 });
    expect(nodes.find(node => node.id === "post-phd-recovery")?.maxLevel).toBe(3);
    expect(sanitizeRoleTalentAllocation("normal-reversed", 0, { "monthly-san-recovery": 1, "post-phd-recovery": 4 }))
      .toEqual({ "monthly-san-recovery": 1, "post-phd-recovery": 3 });
    withGameplayRuleset("20261023-r39", () => {
      expect(getDesignedTalentNodes("normal-reversed")?.find(node => node.id === "post-phd-growth")?.cost).toBe(1);
      expect(getDesignedTalentNodes("normal-reversed")?.find(node => node.id === "post-phd-recovery")?.maxLevel).toBe(2);
    });
  });

  it("preserves sloth talent budgets in r31 recordings", () => {
    const allocation = { "monthly-san-recovery": 3, "restful-idle": 1, "coffee-lifeline": 2 };
    expect(getTalentPointBalance("normal-reversed", 0, allocation)).toBe(4);
    withGameplayRuleset("20261023-r31", () => {
      expect(sanitizeRoleTalentAllocation("normal-reversed", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("normal-reversed", 0, allocation)).toBe(0);
      const nodes = getDesignedTalentNodes("normal-reversed")!;
      for (const id of ["restful-idle", "post-phd-recovery", "post-phd-growth", "year-summary-recovery"]) {
        expect(nodes.find(node => node.id === id)?.cost).toBe(2);
      }
    });
  });

  it("supports legal ten-point chosen growth and health paths and the full twenty-point growth chain", () => {
    const growth = { "favored-by-fate": 1, "complete-potential": 1, "balanced-growth": 2 };
    const health = { "athletic-prodigy": 1, "rare-color-fate": 1, "fortunate-health": 5, "misfortune-to-fortune": 3 };
    const complete = { "favored-by-fate": 2, "complete-potential": 1, "balanced-growth": 3, "lasting-fortune": 3 };
    for (const [level, allocation] of [[0, growth], [0, health], [10, complete]] as const) {
      expect(sanitizeRoleTalentAllocation("chosen", level, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("chosen", level, allocation)).toBe(0);
    }
    expect(getTalentUpgradeReason("chosen", 10, { "favored-by-fate": 1 }, "complete-potential")).toBeNull();
    expect(getTalentUpgradeReason("chosen", 10, { "favored-by-fate": 1 }, "lasting-fortune")).not.toBeNull();
    expect(getTalentUpgradeReason("chosen", 10, { ...growth, "balanced-growth": 1 }, "lasting-fortune")).toBeNull();
    expect(getTalentUpgradeReason("chosen", 10, health, "fortunate-health")).toBe("已满级");
    expect(getTalentUpgradeReason("chosen", 10, health, "misfortune-to-fortune")).toBe("已满级");
    expect(getTalentUpgradeReason("chosen", 10, complete, "balanced-growth")).toBe("已满级");
    expect(sanitizeRoleTalentAllocation("chosen", 10, { ...health, "fortunate-health": 6 })).toEqual(health);
    expect(sanitizeRoleTalentAllocation("chosen", 10, { ...complete, "balanced-growth": 4 })).toEqual(complete);
  });

  it("preserves chosen costs, rank limits and the old growth chain in r30 recordings", () => withGameplayRuleset("20261023-r30", () => {
    const reader = { "favored-by-fate": 2, "lasting-fortune": 2 };
    const complete = { "favored-by-fate": 1, "lasting-fortune": 3, "complete-potential": 1, "balanced-growth": 2 };
    for (const [level, allocation] of [[0, reader], [10, complete]] as const) {
      expect(sanitizeRoleTalentAllocation("chosen", level, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("chosen", level, allocation)).toBe(0);
    }
    expect(getTalentUpgradeReason("chosen", 10, { "favored-by-fate": 1 }, "lasting-fortune")).toBeNull();
    expect(getTalentUpgradeReason("chosen", 10, { "favored-by-fate": 1 }, "complete-potential")).not.toBeNull();
    expect(getTalentUpgradeReason("chosen", 10, complete, "balanced-growth")).toBe("已满级");
    const nodes = getDesignedTalentNodes("chosen")!;
    expect(nodes.find(node => node.id === "fortunate-health")?.maxLevel).toBe(4);
    expect(nodes.find(node => node.id === "misfortune-to-fortune")?.cost).toBe(2);
    expect(nodes.find(node => node.id === "complete-potential")?.cost).toBe(7);
  }));

  it("allows ten-point social specializations along the three independent branches", () => {
    const builds: Record<string, number>[] = [
      { "natural-charisma": 5, "supporting-juniors": 1, "junior-delegation": 1, "junior-bond": 3 },
      { "natural-charisma": 2, "peer-camaraderie": 1, "senior-mentorship": 1, "paper-camaraderie": 1, "collective-wisdom": 2 },
      { "natural-charisma": 2, "growing-connections": 1, "circle-of-friends": 1, "kindly-reviewed": 3 },
    ];
    for (const allocation of builds) {
      expect(sanitizeRoleTalentAllocation("social", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("social", 0, allocation)).toBe(0);
    }
    const branches = [
      ["supporting-juniors", "junior-delegation", "junior-bond", "overflow-social"],
      ["peer-camaraderie", "senior-mentorship", "paper-camaraderie", "collective-wisdom"],
    ];
    for (const branch of branches) {
      const allocation: Record<string, number> = {};
      for (const id of branch) {
        if (id !== branch[0]) expect(getTalentUpgradeReason("social", 0, {}, id)).not.toBeNull();
        expect(getTalentUpgradeReason("social", 0, allocation, id)).toBeNull();
        allocation[id] = 1;
      }
      expect(sanitizeRoleTalentAllocation("social", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("social", 0, allocation)).toBe(branch[0] === "supporting-juniors" ? 5 : 4);
    }
    expect(getTalentUpgradeReason("social", 0, { "senior-mentorship": 1 }, "overflow-social")).not.toBeNull();
    expect(getTalentUpgradeReason("social", 0, { "junior-bond": 1 }, "paper-camaraderie")).not.toBeNull();
  });

  it("accepts either cross-branch prerequisite and caps the review path at five ranks", () => {
    for (const [target, parents] of [
      ["senior-mentorship", ["peer-camaraderie", "supporting-juniors"]],
      ["overflow-social", ["junior-bond", "paper-camaraderie"]],
    ] as const) {
      expect(getTalentUpgradeReason("social", 10, {}, target)).not.toBeNull();
      for (const parent of parents) expect(getTalentUpgradeReason("social", 10, { [parent]: 1 }, target)).toBeNull();
    }
    const allocation = { "natural-charisma": 2, "growing-connections": 1, "circle-of-friends": 2, "kindly-reviewed": 5 };
    expect(getTalentUpgradeReason("social", 10, allocation, "kindly-reviewed")).toBe("已满级");
    expect(sanitizeRoleTalentAllocation("social", 10, { ...allocation, "kindly-reviewed": 6 })).toEqual(allocation);
    expect(getTalentPointBalance("social", 10, allocation)).toBe(6);
  });

  it("preserves social allocation costs and prerequisites in existing recordings", () => {
    withGameplayRuleset("20261023-r35", () => {
      const allocation = { "natural-charisma": 2, "growing-connections": 1, "circle-of-friends": 2, "kindly-reviewed": 3 };
      expect(sanitizeRoleTalentAllocation("social", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("social", 0, allocation)).toBe(0);
      const nodes = getDesignedTalentNodes("social")!;
      expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(26);
      expect(nodes.find(node => node.id === "supporting-juniors")?.maxLevel).toBe(1);
    });
    withGameplayRuleset("20261023-r29", () => {
      const allocation = { "natural-charisma": 1, "growing-connections": 1, "circle-of-friends": 2, "kindly-reviewed": 2 };
      expect(sanitizeRoleTalentAllocation("social", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("social", 0, allocation)).toBe(0);
      const nodes = getDesignedTalentNodes("social")!;
      expect(nodes.find(node => node.id === "circle-of-friends")?.cost).toBe(2);
      expect(nodes.find(node => node.id === "kindly-reviewed")?.maxLevel).toBe(5);
      expect(nodes.find(node => node.id === "senior-mentorship")?.prerequisiteIds).toEqual(["peer-camaraderie"]);
      expect(nodes.find(node => node.id === "overflow-social")?.prerequisiteIds).toEqual(["junior-bond"]);
      expect(getTalentUpgradeReason("social", 10, { "supporting-juniors": 1 }, "senior-mentorship")).not.toBeNull();
      expect(getTalentUpgradeReason("social", 10, { "paper-camaraderie": 1 }, "overflow-social")).not.toBeNull();
    });
    withGameplayRuleset("20261023-r28", () => {
      const bond = { "natural-charisma": 5, "junior-delegation": 1, "junior-bond": 3 };
      const wisdom = { ...bond, "supporting-juniors": 1, "peer-camaraderie": 1, "senior-mentorship": 1, "collective-wisdom": 2 };
      for (const [level, allocation] of [[0, bond], [10, wisdom]] as const) {
        expect(sanitizeRoleTalentAllocation("social", level, allocation)).toEqual(allocation);
        expect(getTalentPointBalance("social", level, allocation)).toBe(0);
      }
      expect(getTalentUpgradeReason("social", 0, {}, "junior-delegation")).toBeNull();
      expect(getTalentUpgradeReason("social", 0, {}, "peer-camaraderie")).not.toBeNull();
      expect(getTalentUpgradeReason("social", 10, { "senior-mentorship": 1 }, "overflow-social")).toBeNull();
      expect(getDesignedTalentNodes("social")?.find(node => node.id === "kindly-reviewed")?.cost).toBe(2);
      expect(getDesignedTalentNodes("social")?.find(node => node.id === "circle-of-friends")?.cost).toBe(3);
    });
  });

  it("supports the teacher-child resource chain and either appropriation prerequisite", () => {
    const family = { "family-patronage": 1, "family-patronage-beta": 1, "family-patronage-gamma": 1 };
    const resources = { "project-apprenticeship": 1, "resource-tilt": 1, "funding-shield": 1 };
    for (const allocation of [family, resources]) {
      expect(getTalentUpgradeReason("teacher-child", 10, allocation, "publication-appropriation")).toBeNull();
      const learned = { ...allocation, "publication-appropriation": 1 };
      expect(sanitizeRoleTalentAllocation("teacher-child", 10, learned)).toEqual(learned);
    }
    expect(getTalentUpgradeReason("teacher-child", 10, { "family-patronage": 1 }, "mentor-insight")).not.toBeNull();
    expect(getTalentUpgradeReason("teacher-child", 10, family, "mentor-insight")).toBeNull();
    const learned = { ...family, "mentor-insight": 1 };
    expect(sanitizeRoleTalentAllocation("teacher-child", 10, learned)).toEqual(learned);
    expect(getTalentPointBalance("teacher-child", 10, learned)).toBe(8);
    const annual = { "near-the-source": 1, "growing-familiarity": 1, "learning-by-osmosis": 2 };
    expect(sanitizeRoleTalentAllocation("teacher-child", 0, annual)).toEqual(annual);
    const nodes = getDesignedTalentNodes("teacher-child")!;
    expect(nodes.some(node => node.id === "family-host" || node.id === "mentor-insight-beta")).toBe(false);
    expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(39);
    withGameplayRuleset("20261023-r37", () => {
      expect(getTalentUpgradeReason("teacher-child", 10, { "family-patronage": 1 }, "mentor-insight")).toBeNull();
      expect(getDesignedTalentNodes("teacher-child")?.some(node => node.id === "family-host")).toBe(true);
    });
  });

  it("supports legal ten-point genius specializations and caps new ranks without changing r26 budgets", () => {
    const research = { "innate-insight": 4, "tireless-scholar": 1, "thirst-for-knowledge": 1, "idea-insight": 2 };
    const fellows = { "innate-insight": 1, "tireless-scholar": 1, "academic-atmosphere": 3, "rise-together": 3 };
    const papers = { "innate-insight": 1, "thirst-for-knowledge": 1, "proven-by-papers": 2, "academic-confidence": 2 };
    for (const allocation of [research, fellows, papers]) {
      expect(sanitizeRoleTalentAllocation("genius", 0, allocation)).toEqual(allocation);
      expect(getTalentPointBalance("genius", 0, allocation)).toBe(0);
    }
    expect(getTalentUpgradeReason("genius", 10, research, "innate-insight")).toBe("已满级");
    expect(getTalentUpgradeReason("genius", 10, fellows, "rise-together")).toBe("已满级");
    expect(getTalentUpgradeReason("genius", 10, papers, "academic-confidence")).toBe("已满级");
    expect(getDesignedTalentNodes("genius")?.find(node => node.id === "boundless-study")).toBeUndefined();
    withGameplayRuleset("20261022-r26", () => {
      const legacy = { "innate-insight": 5, "tireless-scholar": 1, "thirst-for-knowledge": 1,
        "proven-by-papers": 1, "boundless-study": 2, "academic-confidence": 1, "rise-together": 4 };
      expect(sanitizeRoleTalentAllocation("genius", 10, legacy)).toEqual(legacy);
      expect(getTalentPointBalance("genius", 10, legacy)).toBe(0);
      expect(getDesignedTalentNodes("genius")?.find(node => node.id === "academic-atmosphere")).toBeUndefined();
      expect(getTalentUpgradeReason("genius", 10, { "thirst-for-knowledge": 1 }, "proven-by-papers")).not.toBeNull();
    });
  });

  it("unlocks gold power through either salary or investment, preserving old recording prerequisites", () => {
    expect(getTalentUpgradeReason("rich", 10, {}, "gold-power-alpha")).not.toBeNull();
    const allocations: Record<string, number>[] = [
      { heiress: 1, "knowledge-is-wealth": 1, "work-pays-off": 1 },
      { "red-envelope": 1, "wealth-growth": 1, "investment-savvy": 1 },
    ];
    for (const allocation of allocations) {
      expect(getTalentUpgradeReason("rich", 10, allocation, "gold-power-alpha")).toBeNull();
      const learned = { ...allocation, "gold-power-alpha": 1 };
      expect(sanitizeRoleTalentAllocation("rich", 10, learned)).toEqual(learned);
    }
    expect(withGameplayRuleset("20261022-r25", () => getTalentUpgradeReason("rich", 10,
      { "red-envelope": 1, "wealth-growth": 1, "investment-savvy": 1 }, "gold-power-alpha"))).not.toBeNull();
  });
  it("supports the rich funding and paper reward ranks and prices while preserving old replay budgets", () => {
    const allocation = { heiress: 1, "bring-funding": 4, "knowledge-is-wealth": 5 };
    expect(sanitizeRoleTalentAllocation("rich", 10, allocation)).toEqual(allocation);
    expect(getTalentPointBalance("rich", 10, allocation)).toBe(10);
    expect(getTalentUpgradeReason("rich", 10, allocation, "bring-funding")).toBe("已满级");
    expect(getTalentUpgradeReason("rich", 10, allocation, "knowledge-is-wealth")).toBe("已满级");
    expect(sanitizeRoleTalentAllocation("rich", 10, { ...allocation, "knowledge-is-wealth": 6 })).toEqual(allocation);
    withGameplayRuleset("20261022-r24", () => {
      const old = { ...allocation, "bring-funding": 5, "knowledge-is-wealth": 6 };
      expect(sanitizeRoleTalentAllocation("rich", 10, old)).toEqual(old);
      expect(getTalentPointBalance("rich", 10, old)).toBe(8);
    });
    withGameplayRuleset("20261022-r23", () => {
      const old = sanitizeRoleTalentAllocation("rich", 10, allocation);
      expect(old).toEqual({ heiress: 1, "bring-funding": 4, "knowledge-is-wealth": 5 });
      expect(getTalentPointBalance("rich", 10, old)).toBe(5);
    });
  });
  it("makes funding a root and gives cooperative papers an independent five-rank reward talent", () => {
    expect(getTalentUpgradeReason("rich", 10, {}, "bring-funding")).toBeNull();
    expect(getTalentUpgradeReason("rich", 10, {}, "knowledge-is-wealth-beta")).not.toBeNull();
    expect(getTalentUpgradeReason("rich", 10, { "bring-funding": 1 }, "knowledge-is-wealth-beta")).toBeNull();
    expect(sanitizeRoleTalentAllocation("rich", 10, { "bring-funding": 1, "knowledge-is-wealth-beta": 6 }))
      .toEqual({ "bring-funding": 1, "knowledge-is-wealth-beta": 5 });
    expect(getTalentPointBalance("rich", 10, { "bring-funding": 1, "knowledge-is-wealth-beta": 5 })).toBe(14);
    expect(withGameplayRuleset("20261022-r24", () => getTalentUpgradeReason("rich", 10, {}, "bring-funding"))).not.toBeNull();
    expect(withGameplayRuleset("20261022-r24", () => sanitizeRoleTalentAllocation("rich", 10,
      { "bring-funding": 1, "knowledge-is-wealth-beta": 5 }))).toEqual({});
  });
  it("keeps r21 allocation prices and limits for old recordings while rebuilding the current tree", () => {
    const legacy = { "first-month-drive": 3, "self-determination": 12, diligence: 1, "burning-life-alpha": 1, burnout: 1 };
    const old = withGameplayRuleset("20261022-r21", () => sanitizeRoleTalentAllocation("normal", 10, legacy, 4));
    expect(old).toEqual(legacy);
    const current = sanitizeRoleTalentAllocation("normal", 10, legacy, 4);
    expect(current).toEqual({ ...legacy, "first-month-drive": 1, "self-determination": 10 });
    expect(getTalentPointBalance("normal", 10, current, 4)).toBe(7);
    expect(withGameplayRuleset("20261022-r21", () => getTalentPointBalance("normal", 10, old, 4))).toBe(2);
    expect(getTalentUpgradeReason("normal", 10, current, "burnout", 4)).toBeNull();
    expect(getTalentUpgradeReason("normal", 10, { ...current, burnout: 2 }, "burnout", 4)).toBe("已满级");
  });
  it("supports revised levels, prices and the separate fourth-tier resistance paths", () => {
    const normal = { "first-month-drive": 1, "self-determination": 10, breakthrough: 1 };
    expect(sanitizeRoleTalentAllocation("normal", 10, normal)).toEqual(normal);
    expect(getTalentPointBalance("normal", 10, normal)).toBe(6);
    expect(getTalentUpgradeReason("normal", 10, { ...normal, "self-determination": 9 }, "self-determination")).toBeNull();
    expect(getTalentUpgradeReason("normal", 10, normal, "self-determination")).toBe("已满级");
    const genius = { "innate-insight": 1, "thirst-for-knowledge": 1, "proven-by-papers": 1 };
    expect(getTalentUpgradeReason("genius", 10, genius, "academic-confidence")).toBeNull();
    expect(getTalentUpgradeReason("genius", 10, genius, "rise-together")).not.toBeNull();
    expect(getTalentUpgradeReason("genius", 10, { "academic-atmosphere": 1 }, "rise-together")).toBeNull();
    const mentor = { "near-the-source": 1, "growing-familiarity": 1, "learning-by-osmosis": 1, "family-patronage": 1, "mentor-expectations": 3 };
    expect(sanitizeRoleTalentAllocation("teacher-child", 10, mentor)).toEqual(mentor);
    const social = { "supporting-juniors": 1, "junior-delegation": 1, "junior-bond": 1, "overflow-social": 2 };
    expect(sanitizeRoleTalentAllocation("social", 10, social)).toEqual(social);
  });

  it("grants ten initial points plus one per level and unlocks a successor with one prerequisite level", () => {
    for (const { id } of getRoleOptions().filter(role => isRoleTalentImplemented(role.id))) {
      expect(getTalentPointBalance(id, 0, {})).toBe(10);
      expect(getTalentPointBalance(id, 1, {})).toBe(11);
      expect(getTalentPointBalance(id, 10, {}, 3)).toBe(23);
    }
    expect(getTalentPointBalance("normal", 2, { "first-month-drive": 1 })).toBe(10);
    expect(getTalentUpgradeReason("normal", 2, {}, "diligence")).not.toBeNull();
    expect(getTalentUpgradeReason("normal", 2, { "first-month-drive": 1 }, "diligence")).toBeNull();
    expect(getTalentUpgradeReason("normal", 1, { "first-month-drive": 1, "self-determination": 9 }, "diligence")).toBe("天赋点不足");
    expect(getTalentUpgradeReason("normal", 10, { "first-month-drive": 1 }, "first-month-drive")).toBe("已满级");
  });

  it("accepts either adjacent prerequisite and only previews unfinished roles", () => {
    expect(getTalentUpgradeReason("rich", 5, { heiress: 1 }, "bring-funding")).toBeNull();
    expect(getTalentUpgradeReason("rich", 5, { "red-envelope": 1 }, "bring-funding")).toBeNull();
    expect(getTalentUpgradeReason("social", 10, {}, "natural-charisma")).toBeNull();
    expect(sanitizeRoleTalentAllocation("social", 10, { "natural-charisma": 5 })).toEqual({ "natural-charisma": 5 });
    expect(getTalentUpgradeReason("cursed-frail", 10, {}, "illness-surface")).toBe("该角色天赋暂未开放");
    expect(sanitizeRoleTalentAllocation("cursed-frail", 10, { "illness-surface": 1 })).toEqual({});
  });

  it("rejects foreign nodes, fractional levels, orphan successors and over-budget allocations", () => {
    expect(sanitizeRoleTalentAllocation("normal", 1, {
      "first-month-drive": 999, diligence: 10, heiress: 1, "burning-life-alpha": 1,
    })).toEqual({ "first-month-drive": 1, diligence: 9 });
    expect(sanitizeRoleTalentAllocation("normal", 10, { "first-month-drive": 0.5, diligence: 2, breakthrough: 1 })).toEqual({});
    expect(sanitizeRoleTalentAllocation("normal", 0, { "first-month-drive": 1 })).toEqual({ "first-month-drive": 1 });
    expect(sanitizeRoleTalentAllocation("normal", 10, null)).toEqual({});
  });

  it("persists separate role allocations and survives malformed or blocked storage", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 2;
    account.roleProgress.rich.level = 2;
    account.talentAllocation = { normal: { "first-month-drive": 1 }, rich: { heiress: 3 } };
    saveRoleTalentAllocation(account, storage);
    const loaded = loadRoleTalentAllocation(account, storage);
    expect(loaded.talentAllocation).toEqual(account.talentAllocation);
    loaded.talentAllocation!.normal!["first-month-drive"] = 0;
    expect(account.talentAllocation.normal!["first-month-drive"]).toBe(1);
    storage.setItem(ROLE_TALENT_STORAGE_KEY, "broken");
    expect(loadRoleTalentAllocation(account, storage).talentAllocation).toEqual({});
    expect(() => saveRoleTalentAllocation(account, { getItem: () => null, setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("keeps existing allocations while recalculating the larger low-level budget", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 3;
    account.achievementTalentPoints = { normal: 2 };
    account.talentAllocation = { normal: { "first-month-drive": 1, "self-determination": 5 } };
    saveRoleTalentAllocation(account, storage);
    const loaded = loadRoleTalentAllocation(account, storage);
    expect(loaded.talentAllocation).toEqual(account.talentAllocation);
    expect(getTalentPointBalance("normal", 3, loaded.talentAllocation!.normal!, loaded.achievementTalentPoints!.normal)).toBe(8);
  });

  it("lets a fresh player spend the starting budget but keeps locked roles uneditable", () => {
    const store = createStore({ storage: null });
    expect(store.getLobbyState().roleProgress.normal.level).toBe(0);
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    for (let point = 0; point < 8; point += 1) expect(store.upgradeRoleTalent("normal", "self-determination")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "self-determination")).toBe(false);
    expect(store.upgradeRoleTalent("rich", "heiress")).toBe(false);
    expect(store.getLobbyState().talentAllocation?.rich).toBeUndefined();
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().roleTalents?.levels).toEqual({ "first-month-drive": 1, "self-determination": 8 });
    store.dispatch("quit-game");
    expect(store.isCurrentRunDisqualified()).toBe(false);
  });

  it("rejects prior-epoch talent allocations even when stored under the current key", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 10;
    storage.setItem(ROLE_TALENT_STORAGE_KEY, JSON.stringify({ version: 1, roles: { normal: { "first-month-drive": 6 } } }));
    expect(loadRoleTalentAllocation(account, storage).talentAllocation).toEqual({});
  });

  it("loads allocation after experience, persists setup edits and locks edits during a run", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 3;
    saveAccountProfile(account, storage);
    const store = createStore({ storage });
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "diligence")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "diligence")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(false);
    const refreshed = createStore({ storage });
    expect(refreshed.getLobbyState().talentAllocation?.normal).toEqual({ "first-month-drive": 1, diligence: 2 });
    refreshed.dispatch("start-game", { talentAllocation: { "first-month-drive": 99, diligence: 99 } });
    expect(refreshed.getState().roleTalents?.levels).toEqual({ "first-month-drive": 1, diligence: 2 });
    expect(refreshed.upgradeRoleTalent("normal", "diligence")).toBe(false);
    expect(refreshed.resetRoleTalents("normal")).toBe(false);
    expect(refreshed.getState().roleTalents?.levels).not.toBe(refreshed.getLobbyState().talentAllocation?.normal);
    refreshed.dispatch("settle-and-return");
    expect(refreshed.getState().roleTalents?.levels).toEqual({ "first-month-drive": 1, diligence: 2 });
    refreshed.dispatch("reset-game");
    expect(refreshed.resetRoleTalents("normal")).toBe(true);
    expect(createStore({ storage }).getLobbyState().talentAllocation?.normal).toBeUndefined();
  });
});
