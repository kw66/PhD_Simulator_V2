import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG } from "../src/core/v2-achievement-catalog";
import { getAchievementAudience, isAchievementAvailableToRole } from "../src/core/v2-achievement-scope";
import { getRoleOptions } from "../src/core/v2-progression";

describe("achievement audience policy", () => {
  const specialAndCursed = getRoleOptions().filter(role => ["special", "cursed"].includes(getAchievementAudience(role.id)));
  const difficultShared = new Set([
    "global:breakthrough-ii", "global:nature-summit", "global:future-academician", "global:nobel-beginning",
    "global:ten-thousand-citations", "global:career-apex-internet", "global:career-apex-state",
    "global:career-apex-civil", "global:career-apex-academic", "global:buff-collector", "global:product-collector",
    "global:conference-collector", "global:travel-collector", "global:direction-collector", "unlock:research-captain", "unlock:rewinder", "global:slow-research",
  ]);

  it("limits ordinary global achievements to upright and reversed roles", () => {
    const ordinary = ACHIEVEMENT_CATALOG.filter(item => item.id.startsWith("global:") && !difficultShared.has(item.id));
    expect(ordinary.length).toBeGreaterThan(80);
    expect(ordinary.every(item => JSON.stringify(item.scope) === JSON.stringify({ audiences: ["upright", "reversed"] }))).toBe(true);
    for (const item of ordinary) {
      expect(item.rewardScope).toEqual({ audiences: ["all"] });
      expect(specialAndCursed.every(role => !isAchievementAvailableToRole(item.scope, role.id))).toBe(true);
      expect(getRoleOptions().filter(role => isAchievementAvailableToRole(item.scope, role.id)).every(role =>
        ["upright", "reversed"].includes(getAchievementAudience(role.id)))).toBe(true);
    }
  });

  it("keeps only the selected hard milestones available to special and cursed roles", () => {
    for (const id of difficultShared) {
      const item = ACHIEVEMENT_CATALOG.find(candidate => candidate.id === id);
      expect(item, id).toBeDefined();
      expect(specialAndCursed.every(role => isAchievementAvailableToRole(item!.scope, role.id))).toBe(true);
    }
    expect(ACHIEVEMENT_CATALOG.filter(item => item.scope.audiences?.includes("all")).map(item => item.id).sort())
      .toEqual([...difficultShared].sort());
  });
});
