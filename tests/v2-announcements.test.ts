import { describe, expect, it } from "vitest";
import { GAME_ANNOUNCEMENTS, getAnnouncementPageIndex } from "../src/app/v2-announcements";
import { renderAnnouncementPage } from "../src/app/v2-render-announcements";
import { renderApp } from "../src/app/v2-render";
import { createInitialState } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

describe("game announcements", () => {
  it("marks the expanded role talent trees as previews in the September 30 update", () => {
    const announcement = GAME_ANNOUNCEMENTS.find((entry) => entry.date === "2026-09-30");
    expect(announcement).toBeDefined();
    const preview = announcement!.changes.find((change) => change.title === "角色路线预览");
    expect(preview?.description).toContain("目前仅供预览");
    expect(preview?.description).toContain("尚未开放加点和局内效果");
    expect(renderAnnouncementPage(0)).toContain("否极泰来");
  });

  it("adds a third lobby tab without replacing the selected role or start button", () => {
    const account = createDefaultAccountProfile();
    const html = renderApp(createInitialState(), account, { activeRoleRailView: "announcements" });
    expect(html.match(/data-ui-role-rail-view=/g)).toHaveLength(3);
    expect(html).toMatch(/aria-selected="true"\s+data-ui-role-rail-view="announcements"/);
    expect(html).toContain("游戏公告");
    expect(html).toContain('data-action="start-game"');
    expect(html).toContain('class="lobby-profile-main"');
    expect(html).toContain("lobby-announcement-rail-view");
    for (const metric of ["views", "visitors", "games"]) {
      expect(html.match(new RegExp(`data-community-stat="${metric}"`, "g"))).toHaveLength(1);
    }
    expect(html).not.toMatch(/data-community-send|data-community-feed|data-community-content/);
  });

  it("keeps one dated announcement per page in newest-first order", () => {
    const dates = GAME_ANNOUNCEMENTS.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(dates).size).toBe(dates.length);
    for (const [page, entry] of GAME_ANNOUNCEMENTS.entries()) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.changes.length).toBeGreaterThanOrEqual(1);
      expect(entry.changes.length).toBeLessThanOrEqual(6);
      const html = renderAnnouncementPage(page);
      expect(html.match(/data-announcement-date=/g)).toHaveLength(1);
      expect(html).toContain(`datetime="${entry.date}"`);
      expect(html).toContain(`>${entry.date.replaceAll("-", ".")}</time>`);
      expect(html).not.toContain('<select');
      expect(html).not.toContain('<h3');
      expect(html).not.toContain('class="announcement-latest"');
      expect(html).toContain(`${page + 1}/${dates.length}`);
      expect(html).toContain(`aria-label="较新公告"${page === 0 ? " disabled" : ""}`);
      expect(html).toContain(`aria-label="较早公告"${page === dates.length - 1 ? " disabled" : ""}`);
    }
  });

  it("clamps invalid pages and preserves the requested page when the lobby rerenders", () => {
    for (const value of [-1, NaN, Infinity, -Infinity]) expect(getAnnouncementPageIndex(value)).toBe(0);
    expect(getAnnouncementPageIndex(999)).toBe(GAME_ANNOUNCEMENTS.length - 1);
    const lastPage = GAME_ANNOUNCEMENTS.length - 1;
    const html = renderApp(createInitialState(), undefined, { activeRoleRailView: "announcements", announcementPageIndex: lastPage });
    expect(html).toContain(`data-announcement-date="${GAME_ANNOUNCEMENTS[lastPage]!.date}"`);
    expect(renderAnnouncementPage(999)).toBe(renderAnnouncementPage(lastPage));
  });
});
