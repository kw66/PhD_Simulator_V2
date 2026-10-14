import { describe, expect, it } from "vitest";
import { ROLE_DESIGNED_ACHIEVEMENTS } from "../src/core/v2-achievement-catalog";
import { createDefaultAccountProfile, getAchievementDisplayPages, getRoleAchievementPageCount } from "../src/core/v2-lobby";
import { getRoleAchievementDefinitions, getRoleLobbyAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { getRoleOptions } from "../src/core/v2-progression";
import { getAchievementGlobalPercentage, renderAchievementCard } from "../src/app/v2-render-achievement-progress";
import { renderRoleRail } from "../src/app/v2-render-setup-screen";

describe("achievement design preview", () => {
  it("shows only the original six and user-confirmed normal achievements", () => {
    expect(Object.keys(ROLE_DESIGNED_ACHIEVEMENTS)).toEqual(["normal"]);
    expect(ROLE_DESIGNED_ACHIEVEMENTS.normal!.map(({ title, description }) => [title, description])).toEqual([
      ["自强不息Ⅰ", "硕士期间科研能力达到6"],
      ["自强不息Ⅱ", "硕士期间社交能力达到6"],
      ["自强不息Ⅲ", "硕士期间导师好感达到6"],
      ["突破极限", "科研|社交|导师好感任一项达到25"],
      ["二次行动", "某个月拥有2个普通行动点"],
      ["走火入魔", "同时触发燃烧生命α、β"],
      ["我有多动症", "某个月行动4次（包括AI行动）"],
      ["医学奇迹", "连续触发10次触底反弹"],
      ["爱看论文", "看20次论文"],
    ]);
    for (const item of ROLE_DESIGNED_ACHIEVEMENTS.normal!) {
      expect(item).toMatchObject({ requiredRoleId: "normal", previewOnly: true, rewardText: "" });
    }
    expect(getRoleAchievementDefinitions("normal")).toHaveLength(15);
    for (const role of getRoleOptions().filter(role => role.id !== "normal")) {
      expect(getRoleAchievementDefinitions(role.id)).toHaveLength(0);
      expect(getRoleLobbyAchievementDefinitions(role.id).every(item => item.id === "unlock:" + role.id)).toBe(true);
    }
  });

  it("makes every role condition accessible through a single unclassified page sequence", () => {
    for (const role of getRoleOptions()) {
      const pages = getAchievementDisplayPages(role.id);
      const items = pages.flatMap((page) => page.achievements);
      expect(items.map((item) => item.id)).toEqual(getRoleLobbyAchievementDefinitions(role.id).map((item) => item.id));
      expect(pages.every((page) => page.achievements.length <= 9)).toBe(true);
      expect(pages.length).toBe(getRoleAchievementPageCount(role.id));
      const account = createDefaultAccountProfile();
      for (let index = 0; index < pages.length; index += 1) {
        account.lobbyRoleAchievementPage = index;
        const html = renderRoleRail(account, role.id, "achievements");
        for (const item of pages[index].achievements) expect(html).toContain(`data-achievement-id="${item.id}"`);
        expect(html).not.toContain("achievement-category-select");
        expect(html).not.toContain("通用成就");
      }
      if (!ROLE_DESIGNED_ACHIEVEMENTS[role.id]) expect(items.every(item => item.id.startsWith("unlock:"))).toBe(true);
    }
  });

  it("does not share completion of recurring achievements between characters", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.unlockedAchievementIds = ["normal:self-reliance-i"];
    const normalPages = getAchievementDisplayPages("normal");
    account.lobbyRoleAchievementPage = normalPages.findIndex((page) => page.achievements.some((item) => item.id === "normal:self-reliance-i"));
    const normalHtml = renderRoleRail(account, "normal", "achievements");
    expect(normalHtml).toContain('aria-valuetext="1/15"');
    expect(normalHtml).toContain('class="lobby-profile-achievement is-unlocked" data-achievement-id="normal:self-reliance-i"');
    account.lobbyRoleAchievementPage = 0;
    const richHtml = renderRoleRail(account, "rich", "achievements");
    expect(richHtml).toContain('aria-valuetext="0/1"');
    expect(richHtml).not.toContain('data-achievement-id="normal:self-reliance-i"');
    expect(richHtml).not.toContain('class="lobby-profile-achievement is-unlocked"');
  });

  it("retains the six original rewards while new conditions leave rewards unassigned", () => {
    const original = getRoleAchievementDefinitions("normal").slice(0, 6);
    expect(original).toHaveLength(6);
    for (const item of original) {
      expect(item.rewardText).toMatch(/^经验\+5，解锁.+角色$/);
      expect(renderAchievementCard(item, false)).toContain(item.rewardText!);
    }
    const fresh = ROLE_DESIGNED_ACHIEVEMENTS.normal![0];
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
