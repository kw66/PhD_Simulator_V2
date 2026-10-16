import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile, getAchievementDisplayPages } from "../src/core/v2-lobby";
import { getAllAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { createInitialState } from "../src/core/v2-engine";
import { renderAchievementCard } from "../src/app/v2-render-achievement-progress";
import { renderRoleRail, renderSetupScreen } from "../src/app/v2-render-setup-screen";
import { renderEndingScreen } from "../src/app/v2-render-ending";
import type { AccountProfile, RoleId } from "../src/core/v2-types";

function railFor(id: string, account = createDefaultAccountProfile(), role: RoleId = "normal"): string {
  account.lobbyRoleAchievementPage = getAchievementDisplayPages(role).findIndex(page => page.achievements.some(item => item.id === id));
  expect(account.lobbyRoleAchievementPage).toBeGreaterThanOrEqual(0);
  return renderRoleRail(account, role, "achievements");
}

describe("achievement runtime presentation", () => {
  it("retains the full catalogue while moving selected-role graduation cards to the first page", () => {
    const account = createDefaultAccountProfile();
    for (const role of ["normal", "rich", "genius-reversed"] as const) {
      const html = renderRoleRail(account, role, "achievements");
      expect(html).toContain(`data-achievement-id="${role}:ending-master"`);
      expect(html).toContain(`data-achievement-id="${role}:ending-phd"`);
      expect(getAchievementDisplayPages(role).flatMap(page => page.achievements)).toHaveLength(getAllAchievementDefinitions().length);
    }
    for (const role of ["research-captain", "special-daji", "special-finite-life", "special-fading-genius", "cursed-frail", "cursed-debt"] as const) {
      expect(getAllAchievementDefinitions().some(item => item.id === `${role}:ending-master` || item.id === `${role}:ending-phd`)).toBe(false);
      expect(getAchievementDisplayPages(role).flatMap(page => page.achievements)).toHaveLength(getAllAchievementDefinitions().length);
    }
  });

  it("keeps cards to two text rows and shows real role-specific completion dates in the floating tooltip", () => {
    const account = createDefaultAccountProfile();
    const id = "global:air-dried";
    account.achievementUnlockedByRole = { [id]: { normal: "2026-10-12T12:00:00.000Z", rich: "2026-10-13T12:00:00.000Z" } };
    account.achievementUnlockedAt[id] = "2026-10-12T12:00:00.000Z";
    const html = railFor(id, account);
    const card = html.match(new RegExp(`<article[^>]*data-achievement-id="${id}"[\\s\\S]*?</article>`))![0];
    expect(card).toContain("data-card-tooltip");
    expect(card).toContain("2026.10.12：大多数达成\n2026.10.13：富可敌国达成");
    expect(card).not.toContain("院士转世：2026");
    expect(card.match(/<p /g)).toHaveLength(2);
    const visible = card.replace(/<[^>]*>/g, "");
    expect(visible).not.toMatch(/2026|日期/);
    expect(card).not.toContain("<time");
  });

  it("does not attribute a legacy global date to the currently selected character", () => {
    const account = createDefaultAccountProfile();
    account.achievementUnlockedAt["global:air-dried"] = "2026-10-12T12:00:00.000Z";
    const html = railFor("global:air-dried", account, "genius");
    expect(html).toContain("2026.10.12：已达成");
    expect(html).not.toContain("院士转世：2026.10.12");
  });

  it("shows only the completion state on an unfinished collector card", () => {
    const html = railFor("global:product-collector");
    expect(html).toContain('data-tooltip="未达成"');
    expect(html).not.toContain("还差：");
    expect(html).toContain("data-card-tooltip");
  });

  it("escapes full tooltip copy and keeps legacy dates out of card contents", () => {
    const definition = getAllAchievementDefinitions()[0]!;
    const html = renderAchievementCard({ ...definition, title: '<img src=x>', description: '"quoted" & details' }, true, '<time>2026.10.12</time>');
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
    const tooltip = html.match(/data-tooltip="([^"]*)"/)?.[1];
    expect(tooltip).toBe("2026.10.12");
    expect(html).not.toContain("<time>");
  });

  it("renders only this-run achievement icons and names at the ending, with no duplicated entries", () => {
    const state = createInitialState();
    state.ending = "master";
    state.runAchievementIds = ["global:air-dried", "global:air-dried", "unknown"];
    const html = renderEndingScreen(state);
    expect(html.match(/data-ending-achievement-id=/g)).toHaveLength(1);
    const section = html.match(/<section class="ending-achievements"[\s\S]*?<\/section>/)![0];
    expect(section).toContain("自然风干");
    expect(section).not.toContain("经验+5");
    expect(section).not.toContain("衰减");
    expect(renderEndingScreen({ ...state, runAchievementIds: [] })).not.toContain('class="ending-achievements"');
  });

  it("includes earned talent points and experience multipliers in the profile", () => {
    const account: AccountProfile = createDefaultAccountProfile();
    account.roleProgress.normal.level = 0;
    account.achievementTalentPoints = { normal: 5 };
    account.achievementExperienceMultipliers = { normal: 2 };
    const html = renderSetupScreen(createInitialState(), account);
    expect(html).toContain('aria-label="天赋点5，');
    expect(html).toContain('aria-label="经验倍率3.0，');
  });
});
