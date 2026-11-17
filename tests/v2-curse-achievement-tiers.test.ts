import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG } from "../src/core/v2-achievement-catalog";
import { observeAchievements, settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { CURSED_ROLE_IDS, type CurseDifficulty } from "../src/core/v2-curse-system";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getRoleAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { renderAchievementCard } from "../src/app/v2-render-achievement-progress";
import type { GameState, RoleId } from "../src/core/v2-types";

const suffixes = ["easy", "normal", "hard", "hell"] as const;
const grades = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ"];
const names = ["简单", "中等", "困难", "地狱"];

function finished(roleId: RoleId, difficulty: CurseDifficulty, ending: GameState["ending"] = "phd") {
  const initial = createStartedGameState(roleId);
  return observeAchievements(initial, { ...initial, phase: "finished", ending, degree: "phd", year: 6,
    month: 10, totalMonths: 70, curseState: { difficulty, debt: 0, lastSettledTotalMonths: 70 } });
}

describe("curse doctorate achievement tiers", () => {
  it.each(CURSED_ROLE_IDS)("lists and renders four ordered role-specific tiers for %s", roleId => {
    const achievements = getRoleAchievementDefinitions(roleId).filter(item => item.id.startsWith(`${roleId}:curse-`));
    expect(achievements.map(item => item.id)).toEqual(suffixes.map(suffix => `${roleId}:curse-${suffix}-phd`));
    for (const [index, item] of achievements.entries()) {
      expect(item.title.endsWith(grades[index]!)).toBe(true);
      expect(item.description).toBe(`${names[index]}难度博士毕业`);
      expect(item.rewardScope).toEqual({ audiences: ["all"] });
      expect(item.scope).toEqual({ roleIds: [roleId] });
      expect(renderAchievementCard(item, false)).toContain(index === 3 ? "全角色天赋点+1" : "全角色经验+5");
    }
  });

  it.each(CURSED_ROLE_IDS)("settles only the actual %s difficulty, once, for all 18 roles", roleId => {
    for (const difficulty of [1, 2, 3, 4] as const) {
      const profile = createDefaultAccountProfile();
      const state = finished(roleId, difficulty);
      const id = `${roleId}:curse-${suffixes[difficulty - 1]}-phd`;
      expect(state.achievementProgress?.satisfied.filter(value => value.includes(":curse-"))).toEqual([id]);
      const result = settleRunAchievements(profile, state, "2026-11-17T00:00:00.000Z");
      expect(result.state.runAchievementIds).toContain(id);
      expect(result.account.achievementRewardedIds?.filter(value => value.includes(":curse-"))).toEqual([id]);
      expect(Object.values(result.account.roleProgress)).toHaveLength(18);
      for (const [recipient, progress] of Object.entries(result.account.roleProgress)) {
        expect(progress.exp).toBe(profile.roleProgress[recipient as RoleId].exp + (difficulty === 4 ? 0 : 5));
        expect(result.account.achievementTalentPoints?.[recipient as RoleId] ?? 0).toBe(difficulty === 4 ? 1 : 0);
      }
      const repeated = settleRunAchievements(result.account, state, "2026-11-18T00:00:00.000Z");
      expect(repeated.account.roleProgress).toEqual(result.account.roleProgress);
      expect(repeated.account.achievementTalentPoints).toEqual(result.account.achievementTalentPoints);
      expect(repeated.account.achievementUnlockedAt[id]).toBe("2026-11-17T00:00:00.000Z");
      expect(repeated.state.runAchievementIds).not.toContain(id);
    }
  });

  it.each(CURSED_ROLE_IDS)("does not award %s doctorate tiers for master, quit, or unfinished runs", roleId => {
    for (const difficulty of [1, 2, 3, 4] as const) {
      for (const ending of ["master", "quit"] as const) {
        const state = finished(roleId, difficulty, ending);
        expect(state.achievementProgress?.satisfied.filter(value => value.includes(":curse-"))).toEqual([]);
      }
      const initial = createStartedGameState(roleId);
      const state = observeAchievements(initial, { ...initial, curseState: { difficulty, debt: 0, lastSettledTotalMonths: 1 } });
      expect(state.achievementProgress?.satisfied.filter(value => value.includes(":curse-"))).toEqual([]);
    }
  });

  it("does not grant the new tiers when replaying r63", () => {
    withGameplayRuleset("20261110-r63", () => {
      for (const roleId of CURSED_ROLE_IDS) {
        for (const difficulty of [1, 2, 3] as const) {
          expect(finished(roleId, difficulty).achievementProgress?.satisfied.filter(value => value.includes(":curse-"))).toEqual([]);
        }
        expect(finished(roleId, 4).achievementProgress?.satisfied).toContain(`${roleId}:curse-hell-phd`);
      }
    });
  });

  it("keeps historical hell completions rewarded and does not backfill lower tiers", () => {
    const profile = createDefaultAccountProfile();
    const id = "cursed-frail:curse-hell-phd";
    profile.achievementUnlockedAt[id] = "2026-10-01T00:00:00.000Z";
    profile.achievementUnlockedByRole = { [id]: { "cursed-frail": profile.achievementUnlockedAt[id] } };
    profile.achievementRewardedIds = [id];
    for (const role of Object.keys(profile.roleProgress) as RoleId[]) profile.achievementTalentPoints![role] = 1;
    const settled = settleRunAchievements(profile, finished("cursed-frail", 4));
    expect(settled.account.achievementTalentPoints).toEqual(profile.achievementTalentPoints);
    expect(settled.account.achievementUnlockedAt[id]).toBe(profile.achievementUnlockedAt[id]);
    expect(Object.keys(settled.account.achievementUnlockedAt).filter(value => value.includes(":curse-"))).toEqual([id]);
    expect(ACHIEVEMENT_CATALOG.filter(item => item.id.includes(":curse-"))).toHaveLength(16);
  });
});
