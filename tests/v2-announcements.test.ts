import { describe, expect, it } from "vitest";
import { GAME_ANNOUNCEMENTS, getAnnouncementPageIndex } from "../src/app/v2-announcements";
import { renderAnnouncementPage } from "../src/app/v2-render-announcements";
import { renderApp } from "../src/app/v2-render";
import { createInitialState } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

describe("game announcements", () => {
  it("summarizes the latest mechanisms within the six-item page limit", () => {
    expect(GAME_ANNOUNCEMENTS.slice(0, 3).map((entry) => entry.date)).toEqual(["2026-10-10", "2026-10-09", "2026-10-08"]);
    for (const page of [0, 1, 2]) {
      const entry = GAME_ANNOUNCEMENTS[page]!;
      expect(entry.changes.length).toBeLessThanOrEqual(6);
      const html = renderAnnouncementPage(page);
      expect(html.match(/data-announcement-item=/g)).toHaveLength(entry.changes.length);
      expect(html).toContain('data-announcement-toggle');
      for (const change of entry.changes) expect(html).toContain(change.title);
    }
    const latest = GAME_ANNOUNCEMENTS[0]!.changes.map((change) => change.description).join("\n");
    for (const text of ["混合抽4项", "混合抽5项", "不再保底", "固定姓名", "一作A类论文数", "邀请时引用", "社交传承", "0%／20%／40%／60%", "Reviewer", "VALSE", "独立展开"]) {
      expect(latest).toContain(text);
    }
  });

  it("removes superseded rules while retaining the major gameplay milestones", () => {
    const text = GAME_ANNOUNCEMENTS.flatMap((entry) => entry.changes.map((change) => `${change.title}：${change.description}`)).join("\n");
    expect(text).not.toMatch(/0%／25%／50%／75%|向下取整数显示|每300引用|参会经验|交流实验经验|1、2、1、2|机会永久关闭|实际参与项目者各得5金币|现行规则见最新公告/);
    for (const topic of ["5月处理转博", "月末判断毕业", "注册费", "失败预警", "生活费", "2000字", "同学钱包", "角色经验", "十二项发表里程碑", "六个AI系列"]) {
      expect(text).toContain(topic);
    }
    expect(GAME_ANNOUNCEMENTS.length).toBeLessThan(25);
  });

  it("keeps unimplemented role and curse designs explicitly marked as previews", () => {
    const announcement = GAME_ANNOUNCEMENTS.find((entry) => entry.date === "2026-10-04");
    expect(announcement).toBeDefined();
    const preview = announcement!.changes.find((change) => change.title === "角色图鉴与逆位路线");
    expect(preview?.description).toContain("目前仅供预览");
    expect(preview?.description).toContain("尚未开放加点和局内效果");
    expect(renderAnnouncementPage(GAME_ANNOUNCEMENTS.indexOf(announcement!))).toContain("未接入实际结算");
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
