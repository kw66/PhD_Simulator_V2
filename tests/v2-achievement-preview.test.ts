import { describe, expect, it } from "vitest";
import { ROLE_DESIGNED_ACHIEVEMENTS } from "../src/core/v2-achievement-catalog";
import { createDefaultAccountProfile, getAchievementDisplayPages, getRoleAchievementPageCount } from "../src/core/v2-lobby";
import { getRoleAchievementDefinitions, getRoleLobbyAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { getRoleOptions } from "../src/core/v2-progression";
import { getDesignedTalentNodes } from "../src/core/v2-role-talent-definitions";
import { getAchievementGlobalPercentage, renderAchievementCard } from "../src/app/v2-render-achievement-progress";
import { renderRoleRail } from "../src/app/v2-render-setup-screen";

describe("achievement design preview", () => {
  it("gives each designed role an independent roster of 20 to 30 conditions", () => {
    const designedRoles = getRoleOptions().filter((role) => ROLE_DESIGNED_ACHIEVEMENTS[role.id]);
    expect(designedRoles).toHaveLength(12);
    const allIds: string[] = [];
    for (const role of designedRoles) {
      const own = getRoleAchievementDefinitions(role.id);
      const displayed = getRoleLobbyAchievementDefinitions(role.id);
      expect(displayed.length).toBeGreaterThanOrEqual(20);
      expect(displayed.length).toBeLessThanOrEqual(30);
      expect(own.every((item) => item.id.startsWith(`${role.id}:`))).toBe(true);
      allIds.push(...displayed.map((item) => item.id));
      for (const item of ROLE_DESIGNED_ACHIEVEMENTS[role.id]!) {
        expect(item).toMatchObject({ requiredRoleId: role.id, previewOnly: true, rewardText: "" });
        expect(item.unlocksRoleId).toBeUndefined();
      }
      for (const mirror of displayed.filter((item) => !own.some((entry) => entry.id === item.id))) {
        expect(mirror.id).toBe(`unlock:${role.id}`);
        expect(mirror.unlocksRoleId).toBe(role.id);
        expect(mirror.description).toContain("使用大多数角色");
        expect(mirror.rewardText).toContain("经验+5");
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("keeps recurring main-story milestones role-local with appropriate different targets", () => {
    for (const items of Object.values(ROLE_DESIGNED_ACHIEVEMENTS)) {
      for (const code of ["R01", "R12", "C11", "T01", "T02"]) {
        expect(items.filter((item) => item.designCode === code)).toHaveLength(1);
      }
    }
    for (const code of ["R12", "C11"]) {
      const conditions = Object.values(ROLE_DESIGNED_ACHIEVEMENTS).map((items) => items.find((item) => item.designCode === code)!.description);
      expect(new Set(conditions).size).toBeGreaterThan(1);
    }
  });

  it("does not assign another character's exclusive talent to a role condition", () => {
    const roles = getRoleOptions().filter((role) => ROLE_DESIGNED_ACHIEVEMENTS[role.id]);
    for (const role of roles) {
      const ownNames = new Set((getDesignedTalentNodes(role.id) ?? []).map((node) => node.name));
      const foreignNames = roles.filter((other) => other.id !== role.id)
        .flatMap((other) => getDesignedTalentNodes(other.id) ?? [])
        .map((node) => node.name).filter((name) => !ownNames.has(name));
      for (const item of ROLE_DESIGNED_ACHIEVEMENTS[role.id]!) {
        for (const name of foreignNames) expect(item.description, `${role.id}: ${item.title}`).not.toContain(name);
      }
    }
  });

  it("makes every role condition accessible through a single unclassified page sequence", () => {
    for (const role of getRoleOptions()) {
      const pages = getAchievementDisplayPages(role.id);
      const items = pages.flatMap((page) => page.achievements);
      expect(items.map((item) => item.id)).toEqual(getRoleLobbyAchievementDefinitions(role.id).map((item) => item.id));
      expect(pages.every((page) => page.achievements.length <= 6)).toBe(true);
      expect(pages.length).toBe(getRoleAchievementPageCount(role.id));
      const account = createDefaultAccountProfile();
      for (let index = 0; index < pages.length; index += 1) {
        account.lobbyRoleAchievementPage = index;
        const html = renderRoleRail(account, role.id, "achievements");
        for (const item of pages[index].achievements) expect(html).toContain(`data-achievement-id="${item.id}"`);
        expect(html).not.toContain("achievement-category-select");
        expect(html).not.toContain("通用成就");
      }
      if (!ROLE_DESIGNED_ACHIEVEMENTS[role.id]) expect(items).toHaveLength(0);
    }
  });

  it("does not share completion of recurring achievements between characters", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.unlockedAchievementIds = ["normal:r01"];
    const normalPages = getAchievementDisplayPages("normal");
    account.lobbyRoleAchievementPage = normalPages.findIndex((page) => page.achievements.some((item) => item.id === "normal:r01"));
    const normalHtml = renderRoleRail(account, "normal", "achievements");
    expect(normalHtml).toContain('aria-valuetext="1/27"');
    expect(normalHtml).toContain('class="lobby-profile-achievement is-unlocked" data-achievement-id="normal:r01"');
    account.lobbyRoleAchievementPage = 0;
    const richHtml = renderRoleRail(account, "rich", "achievements");
    expect(richHtml).toContain('aria-valuetext="0/27"');
    expect(richHtml).toContain('data-achievement-id="rich:r01"');
    expect(richHtml).not.toContain('class="lobby-profile-achievement is-unlocked"');
  });

  it("retains the six original rewards while new conditions leave rewards unassigned", () => {
    const original = getRoleAchievementDefinitions("normal").slice(0, 6);
    expect(original).toHaveLength(6);
    for (const item of original) {
      expect(item.rewardText).toMatch(/^经验\+5，解锁.+角色$/);
      expect(renderAchievementCard(item, false)).toContain(item.rewardText!);
    }
    const fresh = ROLE_DESIGNED_ACHIEVEMENTS.rich![0];
    expect(renderAchievementCard(fresh, false)).not.toContain("lobby-profile-achievement-reward");
  });

  it("distinguishes missing statistics from measured zero and never invents a rate", () => {
    expect(getAchievementGlobalPercentage()).toBeNull();
    expect(getAchievementGlobalPercentage({ achievedPlayers: 0, eligiblePlayers: 0 })).toBeNull();
    expect(getAchievementGlobalPercentage({ achievedPlayers: 0, eligiblePlayers: 20 })).toBe(0);
    expect(getAchievementGlobalPercentage({ achievedPlayers: 5, eligiblePlayers: 20 })).toBe(25);
    expect(getAchievementGlobalPercentage({ achievedPlayers: 21, eligiblePlayers: 20 })).toBeNull();
    const item = ROLE_DESIGNED_ACHIEVEMENTS.normal![0];
    const html = renderAchievementCard(item, false, "", { achievedPlayers: 5, eligiblePlayers: 20 });
    expect(html).toContain('style="width:25%"');
    expect(html).toContain('aria-label="全球达成率 25%"');
    expect(html.indexOf("achievement-completion-fill")).toBeLessThan(html.indexOf("lobby-profile-achievement-copy"));
    expect(renderAchievementCard(item, false)).toContain(">—%</span>");
    const zeroHtml = renderAchievementCard(item, false, "", { achievedPlayers: 0, eligiblePlayers: 20 });
    expect(zeroHtml).toContain(">0%</span>");
    expect(zeroHtml).not.toContain("is-pending");
  });
});
