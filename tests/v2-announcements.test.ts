import { describe, expect, it } from "vitest";
import { GAME_ANNOUNCEMENTS, getAnnouncementPageIndex } from "../src/app/v2-announcements";
import { renderAnnouncementPage } from "../src/app/v2-render-announcements";
import { renderApp } from "../src/app/v2-render";
import { createInitialState } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

describe("game announcements", () => {
  it("dates the unannounced October work without changing the six-item page limit", () => {
    expect(GAME_ANNOUNCEMENTS.slice(0, 2).map((entry) => entry.date)).toEqual(["2026-10-09", "2026-10-08"]);
    for (const page of [0, 1]) {
      const entry = GAME_ANNOUNCEMENTS[page]!;
      expect(entry.changes).toHaveLength(6);
      const html = renderAnnouncementPage(page);
      expect(html.match(/<li>/g)).toHaveLength(6);
      expect(html).toContain('data-announcement-toggle');
      for (const change of entry.changes) expect(html).toContain(change.title);
    }
    const october8 = GAME_ANNOUNCEMENTS[1]!.changes.map((change) => change.description).join("\n");
    expect(october8).toContain("编辑和删除自己的留言");
    expect(october8).toContain("匿名留言编辑权限");
    expect(october8).toContain("简写教授职称");
    expect(october8).toContain("现行规则见最新公告");
    for (const text of ["0%／25%／50%／75%", "内部保留小数", "博士2.5", "各领5%", "聪慧初始科研额外+3", "国奖补齐已审阅标记", "转博剧情"]) {
      expect(october8).toContain(text);
    }
    expect(october8).not.toContain("当天");
  });

  it("records October 9 fee timing, risk buttons and May fixes without redating October 8 changes", () => {
    const current = GAME_ANNOUNCEMENTS[0]!.changes.map((change) => change.description).join("\n");
    expect(current).toContain("确认会议录用结果时，导师即付每篇一作注册费1金币");
    expect(current).toContain("3个月后只安排差旅");
    expect(current).toContain("期刊可选自费或导师，选定后不再返回重选");
    expect(current).toContain("向下取整数显示");
    expect(current).not.toMatch(/聪慧初始科研|硕士基本工资|0%／25%／50%／75%/);
    expect(current).toContain("硕二／硕三5月处理转博");
    expect(current).toContain("VALSE跨月保留原届年份、城市与活动");
    expect(current).toContain("转博事件加入已审阅标记");
    expect(current).toContain("按钮加“！”或“？”");
    expect(current).toContain("会暴毙／可能会暴毙");
    expect(current).toContain("需手动确认");
    expect(current).toContain("多篇同会论文合并安排");
    expect(current).toContain("论文结果和参会显示具体会议名");
    expect(current).toContain("待办补参会预告");
    expect(current).toContain("论文参会、会场活动归入论文相关");
    expect(current).not.toMatch(/确定死|可能死/);
    expect(current).not.toMatch(/已推送|已部署|已上线|快照|3个月后.*扣注册费/);
  });

  it("marks the expanded role talent trees as previews in the September 30 update", () => {
    const announcement = GAME_ANNOUNCEMENTS.find((entry) => entry.date === "2026-09-30");
    expect(announcement).toBeDefined();
    const preview = announcement!.changes.find((change) => change.title === "角色路线预览");
    expect(preview?.description).toContain("目前仅供预览");
    expect(preview?.description).toContain("尚未开放加点和局内效果");
    expect(renderAnnouncementPage(GAME_ANNOUNCEMENTS.indexOf(announcement!))).toContain("否极泰来");
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
