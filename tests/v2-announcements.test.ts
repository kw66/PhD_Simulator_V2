import { describe, expect, it } from "vitest";
import { GAME_ANNOUNCEMENTS, getAnnouncementPageIndex } from "../src/app/v2-announcements";
import { renderAnnouncementPage } from "../src/app/v2-render-announcements";
import { renderApp } from "../src/app/v2-render";
import { createInitialState } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

describe("game announcements", () => {
  it("summarizes the latest mechanisms within the six-item page limit", () => {
    expect(GAME_ANNOUNCEMENTS.slice(0, 6).map((entry) => entry.date)).toEqual(["2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-22"]);
    for (const page of [0, 1, 2]) {
      const entry = GAME_ANNOUNCEMENTS[page]!;
      expect(entry.changes.length).toBeLessThanOrEqual(6);
      const html = renderAnnouncementPage(page);
      expect(html.match(/data-announcement-item=/g)).toHaveLength(entry.changes.length);
      expect(html).toContain('data-announcement-toggle');
      for (const change of entry.changes) expect(html).toContain(change.title);
    }
    const textForDate = (date: string) => GAME_ANNOUNCEMENTS.find(entry => entry.date === date)!.changes.map(change => `${change.title}：${change.description}`).join("\n");
    const current = textForDate("2026-10-24");
    expect(textForDate("2026-10-26")).toContain("手机开始按钮铺满一行");
    for (const text of ["连续6个月订购付费AI", "六次教师节", "停止合作", "月末持有至少50金币", "前两年半", "初始默契", "0／1／2／3", "基础社交收益由1提高至2", "适用的宣传", "默认开放"])
      expect(textForDate("2026-10-28")).toContain(text);
    for (const text of ["逐一点开", "科研分", "调试入口仅本地", "坏结局"]) expect(textForDate("2026-10-25")).toContain(text);
    for (const text of ["三份教学录像", "0天赋点博士", "10天赋点博士", "10天赋点硕士", "其他角色及20点路线以后补录", "9、15和2", "本地录像", "按角色切换"]) expect(textForDate("2026-10-28")).toContain(text);
    for (const text of ["硕士C／B／A档调整为60／100／200", "博士调整为180／250／500"]) expect(textForDate("2026-10-27")).toContain(text);
    for (const text of ["300／200／150／100", "20／18／16／14", "50／70／90／110", "+36／+24／+12／+2", "每次偿还1金币"]) expect(textForDate("2026-10-25")).toContain(text);
    for (const text of ["统御者标签", "本局等级效果与团队加成", "接纵向项目恢复回溯", "导师指导结果固定", "帮助随机同学做项目", "参与同学论文首次被拒"]) expect(current).toContain(text);
    for (const text of ["18位角色", "Q版头像", "统御者标签使用对应角色的Q版头像", "轮回者以自身Q版头像展示六个学年", "继承规则合并至特殊项", "诅咒角色移至第二页", "去除上下大块纯色留白", "好感达到12、15、18", "为组奉献", "资源倾斜", "成果归我", "整钱包", "最终净亏损", "钱能通神", "每累计消费50金币", "聚沙成塔改为1点", "屡败屡研", "心宽体健", "空想的月初轮转", "渐入佳境", "无界轮转需2点", "连续4个月未变", "恩荫成枷", "得寸进尺每级提升好感增长抵抗10个百分点"]) expect(current).toContain(text);
    for (const text of ["不再向上取整", "档位抵抗", "SAN消耗倍率", "加点", "等级分布", "诅咒", "紧凑方格", "期限", "结算月份"]) expect(textForDate("2026-10-21")).toContain(text);
    for (const text of ["解锁即有10天赋点", "每升一级再增加1点", "已有加点保留", "首篇一作论文获得分数后", "被抢发idea和新sota", "选项文字居中"]) expect(textForDate("2026-10-19")).toContain(text);
    const mastery = textForDate("2026-10-18");
    for (const text of ["论文熟手", "一作", "顺序循环", "永久+1分", "50%", "移除跑腿熟手"]) expect(mastery).toContain(text);
    const release = textForDate("2026-10-17");
    for (const text of ["轮回者解锁", "24个不同成就", "结算并返回", "个人历史", "慢科研", "求职不易", "3A", "5A", "协作奖励被覆盖"]) expect(release).toContain(text);
    for (const text of ["统御者", "普通行动点为0", "开局锁定", "四类诅咒", "正式结算", "调试局不计", "厌倦学习", "经验倍率+0.2"]) expect(release).toContain(text);
    const newest = textForDate("2026-10-16");
    for (const text of ["六位正位与六位逆位", "成就与跨局记录", "70个月度存档", "结算并返回", "按玩家去重", "当前浏览器", "窄屏布局"]) {
      expect(newest).toContain(text);
    }
    const ending = textForDate("2026-10-13");
    for (const text of ["最后一年每月", "四个方向", "面试经验", "Reviewer", "盲审", "离校属性", "花销记录"]) {
      expect(ending).toContain(text);
    }
    expect(ending).not.toMatch(/保留角色立绘|已点亮天赋|持有商品/);
    const latest = textForDate("2026-10-10");
    for (const text of ["混合抽4项", "混合抽5项", "不再保底", "固定姓名", "一作A类论文数", "邀请时引用", "社交传承", "0%／20%／40%／60%", "VALSE", "独立展开"]) {
      expect(latest).toContain(text);
    }
  });

  it("removes superseded rules while retaining the major gameplay milestones", () => {
    const text = GAME_ANNOUNCEMENTS.flatMap((entry) => entry.changes.map((change) => `${change.title}：${change.description}`)).join("\n");
    expect(text).not.toMatch(/0%／25%／50%／75%|向下取整数显示|每300引用|参会经验|交流实验经验|1、2、1、2|机会永久关闭|实际参与项目者各得5金币|现行规则见最新公告|每次投入至多5金币|亏损不再触发消费奖励/);
    expect(text).not.toMatch(/36局|10与20天赋点博士|360降至330|300／200／120／80|18／16／14／12|在设置中还款|184项|角色图鉴扩展至20位|历史同学和恋人可勾选加入空位|所有角色均可回溯事件|回放首页采用档案式边框|五类跨局收集成就各奖励全体角色天赋点/);
    for (const topic of ["5月处理转博", "月末判断毕业", "注册费", "失败预警", "生活费", "2000字", "同学钱包", "角色经验", "十二项发表里程碑", "六个AI系列"]) {
      expect(text).toContain(topic);
    }
    expect(GAME_ANNOUNCEMENTS.length).toBeLessThanOrEqual(26);
  });

  it("adds a third lobby tab without replacing the selected role or start button", () => {
    const account = createDefaultAccountProfile();
    const html = renderApp(createInitialState(), account, { activeRoleRailView: "announcements" });
    expect(html.match(/data-ui-role-rail-view=/g)).toHaveLength(3);
    expect(html).toMatch(/aria-selected="true"\s+data-ui-role-rail-view="announcements"/);
    expect(html).toContain("游戏公告");
    expect(html).toContain('data-action="start-game"');
    expect(html).toContain("录像与攻略");
    expect(html).toContain('href="https://kw66.github.io/PhD_Simulator/"');
    expect(html).toContain("旧版 v1.0");
    expect(html).not.toContain('href="?replay=library"');
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
