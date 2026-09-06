import { describe, expect, it } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getConferenceInfo, getConferenceLocation } from "../src/core/v2-conference-catalog";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getRoleLobbyAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { createDebugBuffs } from "../src/core/v2-debug-tools";

function createPublishedPaper(
  index: number,
  title: string,
  target: "A" | "B" | "C" | null,
  acceptedScore: number,
  citations: number,
  effectiveScore = acceptedScore,
  nonFirstAuthor = false,
) {
  const published = attachPaperPublication(
    {
      ...createDraftPaper(1, index),
      title,
      status: "published",
      target,
      submittedIdea: acceptedScore,
      submittedExperiment: 0,
      submittedWriting: 0,
    },
    1.5,
  );
  if (!published.publication) throw new Error("测试论文未生成发表信息");

  return {
    ...published,
    nonFirstAuthor,
    publication: {
      ...published.publication,
      citations,
      effectiveScore,
    },
  };
}

function createAdmittedTestState() {
  let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  state = dispatchAction(state, "resolve-event", {
    eventChoiceId: "before-grad-school-open-advisor-info",
  });
  state = dispatchAction(state, "resolve-event", {
    eventChoiceId: "before-grad-school-confirm",
  });
  return dispatchAction(state, "resolve-event", {
    eventChoiceId: "before-grad-school-finish",
  });
}

function getShopCardHtml(html: string, itemName: string): string {
  const marker = `<strong class="shop-item-name">${itemName}</strong>`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return "";
  const cardStart = html.lastIndexOf("<article", markerIndex);
  const cardEnd = html.indexOf("</article>", markerIndex);
  return cardStart >= 0 && cardEnd >= 0 ? html.slice(cardStart, cardEnd + "</article>".length) : "";
}

function getPaperSlotCardHtml(html: string, slotIndex: number): string {
  const marker = `data-paper-slot-index="${slotIndex}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return "";
  const cardStart = html.lastIndexOf("<article", markerIndex);
  const cardEnd = html.indexOf("</article>", markerIndex);
  return cardStart >= 0 && cardEnd >= 0 ? html.slice(cardStart, cardEnd + "</article>".length) : "";
}

function getTalentCardHtml(html: string, talentId: string): string {
  const markerIndex = html.indexOf(`data-talent-item-id="${talentId}"`);
  if (markerIndex < 0) return "";
  const cardStart = html.lastIndexOf("<article", markerIndex);
  const cardEnd = html.indexOf("</article>", markerIndex);
  return cardStart >= 0 && cardEnd >= 0 ? html.slice(cardStart, cardEnd + "</article>".length) : "";
}

describe("v2 render lobby shell", () => {
  it("renders the new meta lobby with only normal owned by default", () => {
    const html = renderApp(createInitialState(), createDefaultAccountProfile());

    expect(html).toContain('data-phase="setup"');
    expect(html).toContain('data-scale-mode="fixed"');
    expect(html).toContain('class="lobby-stage"');
    expect(html).toContain('class="lobby-stage-scale"');
    expect(html).toContain("角色图鉴");
    expect(html).toContain("已收录 1 / 14");
    expect(html).toContain("大多数");
    expect(html).toContain("院士转世");
    expect(html).toContain("怠惰·大多数");
    expect(html).toContain("富可敌国");
    expect(html).toContain("贪求·富可敌国");
    expect(html).toContain('class="lobby-role-card-mode-band is-upright"');
    expect(html).toContain('class="lobby-role-card-mode-band is-reversed"');
    expect(html).toContain('class="lobby-role-card-level-badge">Lv 0</span>');
    expect(html).toContain('class="lobby-role-card-achievement-display"');
    expect(html).toContain('class="lobby-role-card-achievement-display is-locked" aria-label="角色成就"');
    expect(html).toContain('class="lobby-role-card-achievement-label">成就</span>');
    expect(html).toContain('data-achievement-id="normal:first-pot"');
    expect(html).toContain(">💰</span>");
    expect(html).toContain(">🔬</span>");
    expect(html).toContain(">🌟</span>");
    expect(html).toContain(">🤝</span>");
    expect(html).toContain(">😴</span>");
    expect(html).toContain('class="lobby-role-card-level-badge is-locked" aria-label="未解锁"');
    expect(html).toContain('data-lucide="lock"');
    expect(html).not.toContain('class="lobby-role-card-lock"');
    expect(html).not.toMatch(/lobby-role-card-level-badge is-locked[^>]*>\s*Lv/);
    expect(html).not.toContain('class="lobby-role-card-tag');
    expect(html).not.toContain('class="lobby-role-card-metric');
    expect(html).not.toContain("基础属性");
    expect(html).not.toContain("角色特征");
    expect(html).not.toContain("已拥有");
    expect(html).not.toContain("基础 / 生存");
    expect(html).toContain("我命由我不由天");
    expect(html).toContain("SAN");
    expect(html).toContain("科研能力");
    expect(html).toContain("社交能力");
    expect(html).toContain("导师好感");
    expect(html).toContain("金币");
    expect(html).toContain("开局属性");
    expect(html).toContain("历史最高");
    expect(html).toContain("科研分");
    expect(html).toContain(">引用</span>");
    expect(html).toContain(">Nature</span>");
    expect(html).toMatch(/<span>Nature<\/span>\s*<strong>0<\/strong>/);
    expect(html).not.toMatch(/<span>Nature<\/span>\s*<strong>×/);
    expect(html).toContain(">代表作</span>");
    expect(html).toContain(">0分 | 0引</strong>");
    expect(html).toContain(">通关次数</span>");
    expect(html).not.toContain("总引用");
    expect(html).not.toContain("Nature数量");
    expect(html).not.toContain("代表作引用");
    expect(html).not.toContain("代表作分数");
    expect(html).toContain("20/20");
    expect((html.match(/1\/20/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('class="lobby-profile-main"');
    expect(html).toContain('class="lobby-profile-top"');
    expect(html).toContain('class="lobby-profile-art-name">大多数</h1>');
    expect(html).toContain('class="lobby-profile-info"');
    expect((html.match(/class="lobby-profile-stat-column(?: is-history)?"/g) ?? []).length).toBe(2);
    expect(html).toContain("lobby-profile-history-stack");
    expect(html).toContain('class="lobby-profile-growth-card lobby-profile-section"');
    expect(html).toContain('class="lobby-profile-achievement-rail"');
    expect(html).toContain('class="lobby-profile-portrait"');
    expect(html).toContain('alt="大多数立绘"');
    expect(html).toContain("上一页");
    expect(html).toContain("下一页");
    expect(html).toContain('class="lobby-role-card-portrait"');
    expect(html).toContain('alt="大多数缩略立绘"');
    expect((html.match(/class="lobby-role-row"/g) ?? []).length).toBe(5);
    expect(html).toContain("正位");
    expect(html).toContain("逆位");
    expect(html).not.toContain('class="lobby-role-card-tag is-locked"');
    expect(html).not.toContain('class="lobby-role-card-icon"');
    expect(html).not.toContain('class="lobby-role-card-mode"');
    expect(html).not.toContain('class="lobby-role-exp"');
    expect(html).not.toContain('class="lobby-role-card-meta-item"');
    expect(html).not.toContain('class="lobby-role-card-progress-item"');
    expect(html).not.toContain('class="lobby-role-card-progress-bar"');
    expect(html).not.toContain('class="lobby-role-card-run-text"');
    expect(html).not.toContain("📢");
    expect(html).not.toContain("角色描述");
    expect(html).toContain("家里条件普通，读研没有什么捷径");
    expect(html).not.toContain("天赋加点");
    expect(html).toContain("勤能补拙");
    expect(html).toContain("经验倍率");
    expect(html).toContain('class="lobby-growth-help"');
    expect(html).toContain('data-lucide="circle-help"');
    expect(html).toContain('data-tooltip="角色成长仅供预览，经验结算、成就奖励和天赋分配尚未接入"');
    expect(html).not.toContain("基础效果");
    expect(html).not.toContain("无效果");
    expect(html).toContain("经验");
    expect(html).toContain("0 / 20");
    expect(html).toContain('class="lobby-growth-exp-bar"');
    expect(html).toContain('class="lobby-growth-exp-detail-row"');
    expect(html).not.toContain("lobby-growth-exp-note");
    expect(html).not.toContain("当前倍率为");
    expect(html).toContain("天赋点 0");
    expect(html).toContain('<i data-lucide="rotate-ccw" aria-hidden="true"></i><span>重置</span>');
    expect(html).toContain('class="lobby-page-dot is-active"');
    expect(html).toContain('class="lobby-talent-step-button"');
    expect(html).toContain('class="lobby-talent-step-value">0</strong>');
    expect(html).not.toContain('class="lobby-growth-level-row"');
    expect(html).not.toContain('class="lobby-growth-exp-block"');
    expect(html).not.toContain('class="lobby-talent-allocation-head"');
    expect(html).not.toContain("可分配");
    expect(html).not.toContain("已点亮");
    expect(html).not.toContain("Lv.3 点亮");
    expect(html).not.toContain("成长预览");
    expect(html).not.toContain("当前效果");
    expect(html).not.toContain("可用天赋点");
    expect(html).not.toContain("已分配 0 点");
    expect(html).not.toContain("等级带来的效果");
    expect(html).not.toContain("+20%");
    expect(html).not.toContain("+200%");
    expect(html).not.toContain("+1次");
    expect(html).not.toContain("+10次");
    expect(html).not.toContain("特殊能力");
    expect(html).toContain("角色成就");
    expect(html).toContain("小有积蓄");
    expect(html).toContain("金币达到30");
    expect(html).toContain("经验+5，解锁富可敌国角色");
    expect(html).not.toContain('data-achievement-id="global:sickly"');
    expect(html).not.toContain("0 / 30");
    expect(getRoleLobbyAchievementDefinitions("chosen")[0]?.title).toBe("全面发展");
    const achievementList = html.match(/<div class="lobby-profile-achievement-list">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] ?? "";
    expect(html).toContain('class="lobby-profile-achievement-summary"');
    expect(html).toContain('class="lobby-profile-achievement-icon" aria-hidden="true">💰</span>');
    expect(html).toContain('class="lobby-profile-achievement-overall-progress"');
    expect(html).toContain('class="lobby-profile-achievement-progress-label">进度</span>');
    expect(html).toContain('class="lobby-profile-achievement-progress-count">0/6</strong>');
    expect(html).toContain('aria-valuemax="6"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('data-lucide="chevron-down"');
    expect(html).not.toContain('<details class="lobby-profile-achievement" open>');
    expect((html.match(/name="role-achievements"/g) ?? []).length).toBe(6);
    expect(achievementList).not.toContain("未达成");
    expect(achievementList).not.toContain("已达成");
    expect(html).not.toContain("历史最高 0 / 30");
    expect(html).not.toContain("最佳单局：科研");
    expect(html).not.toContain('<span class="lobby-meta-count">0 / 6</span>');
    expect(html).not.toContain('data-action="change-role-achievement-page"');
    expect(html).not.toContain('class="lobby-profile-achievement-progress"');
    expect(html).not.toContain("平稳起步");
    expect(html).not.toContain("金币达到30。");
    expect(html).not.toContain("奖励经验+5");
    expect(html).not.toContain('class="lobby-profile-achievement-footer"');
    expect(html).not.toContain('class="lobby-profile-level-line"');
    expect(html).not.toContain('class="lobby-profile-exp-bar"');
    expect(html).not.toContain("升级待开放");
    expect(html).not.toContain("立绘待替换");
    expect((html.match(/data-action="select-role"/g) ?? []).length).toBe(10);
    expect(html).toContain('data-action="start-game" data-role-id="normal"');
    expect(html).toContain("社交达人");
    expect(html).not.toContain("轮回者");
    expect(html).not.toContain("统御者");
    expect(html).not.toContain("科研成长档案");
    expect(html).not.toContain('class="lobby-profile-hero"');
    expect(html).not.toContain('class="lobby-profile-dossier"');
    expect(html).not.toContain('class="lobby-profile-summary-card lobby-profile-section"');
    expect(html).not.toContain('class="lobby-growth-column"');
    expect(html).not.toContain('class="lobby-growth-row"');
  });

  it("keeps the growth talent tab selected when rendering the play screen", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = { ...state, eventQueue: [] };

    const html = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "growth" });

    expect(html).toContain('data-talent-panel-tab="growth"');
    expect(html).toContain('data-ui-talent-tab="growth"');
    expect(html).toContain('data-talent-item-id="badminton-growth"');
    expect(html).toContain('data-talent-item-id="poker-growth"');
    expect(html).toContain("每 10 次阅读，科研 +1；idea buff 效果 +1");
    expect(html).toContain("已看");
    expect(html).not.toContain("待用 idea");
    expect(html).toContain("下次想 idea");
    expect(html).toContain("升档进度");
    expect(html).toContain("每 8 次打工，金币收入 +1，SAN 消耗 +1");
    expect(html).toContain("下次金币");
    expect(html).toContain("下次 SAN");
    expect(html).toContain("升档进度");
    expect(html).toContain("每 4 次参会，参会减免 +1 金币（最多半价）");
    expect(html).toContain("国内");
    expect(html).toContain("亚太");
    expect(html).toContain("欧美");
    expect(html).toContain("羽毛球水平");
    expect(html).toContain("牌局策略");
    const badmintonCard = getTalentCardHtml(html, "badminton-growth");
    const pokerCard = getTalentCardHtml(html, "poker-growth");
    expect(badmintonCard).toContain("获胜：SAN×（参加次数 + 3）+ 球拍 40达100");
    expect(badmintonCard).toMatch(/<span>获胜后每月 SAN \+1<\/span>\s*<strong>—<\/strong>/);
    expect(badmintonCard).toMatch(/role="progressbar" aria-label="水平进度 \d+\/100"/);
    expect(pokerCard).toContain("胜率 = 40 + 参加次数 × 10%");
    expect(pokerCard).toMatch(/<span>累计赚取金币<\/span>\s*<strong>\+ 0<\/strong>/);
    expect(pokerCard).toContain('role="progressbar" aria-label="策略进度 40%"');
    expect(pokerCard).not.toContain("当前胜率");

    const progressedHtml = renderApp({
      ...state,
      eventSupport: { ...state.eventSupport, hasStrongBodyTalent: true },
      eventCounters: { ...state.eventCounters, pokerCount: 6, pokerProfit: 17 },
    }, createDefaultAccountProfile(), { activeTalentTab: "growth" });
    const wonBadmintonCard = getTalentCardHtml(progressedHtml, "badminton-growth");
    const progressedPokerCard = getTalentCardHtml(progressedHtml, "poker-growth");
    expect(wonBadmintonCard).toMatch(/<span>获胜后每月 SAN \+1<\/span>\s*<strong>✅<\/strong>/);
    expect(progressedPokerCard).toMatch(/<span>累计赚取金币<\/span>\s*<strong>\+ 17<\/strong>/);
    expect(progressedPokerCard).toContain('role="progressbar" aria-label="策略进度 100%"');
  });

  it("renders the lobby community views and keeps the role view as the default", () => {
    const state = createInitialState();
    const account = createDefaultAccountProfile();
    const rolesHtml = renderApp(state, account);
    const infoHtml = renderApp(state, account, { activeLobbyView: "info" });
    const valuesHtml = renderApp(state, account, { activeLobbyView: "info", activeLobbyInfoSection: "values" });
    const guideHtml = renderApp(state, account, { activeLobbyView: "info", activeLobbyInfoSection: "guide" });
    const messagesHtml = renderApp(state, account, { activeLobbyView: "messages" });

    expect(rolesHtml).toContain('class="lobby-masthead"');
    expect(rolesHtml).toContain('data-ui-lobby-view="roles"');
    expect(rolesHtml).toContain('data-ui-lobby-view="info"');
    expect(rolesHtml).toContain('data-ui-lobby-view="messages"');
    expect(rolesHtml).toContain('data-lucide="user-round"');
    expect(rolesHtml).toContain('data-lucide="git-fork"');
    expect(rolesHtml).toContain('data-lucide="gamepad-2"');
    expect(rolesHtml).toContain('data-community-stat="today-visitors"');
    expect(rolesHtml).toContain('data-community-stat="today-games"');
    expect(rolesHtml).toContain('data-community-stat="total-visitors"');
    expect(rolesHtml).toContain('data-community-stat="total-games"');
    expect(rolesHtml).not.toContain('data-community-stat="current-online"');
    expect(rolesHtml).not.toContain("当前在线");
    expect(rolesHtml).toContain('class="lobby-grid"');
    expect(rolesHtml).not.toContain('class="lobby-info-view"');
    expect(rolesHtml).not.toContain('class="lobby-message-view"');

    expect(infoHtml).toMatch(/class="lobby-community-view lobby-info-view"/);
    expect(infoHtml).toContain("研究生模拟器 v2.0");
    expect(infoHtml).toContain("68 个月");
    expect(infoHtml).toContain('data-ui-lobby-info-section="overview"');
    expect(infoHtml).toContain('data-ui-lobby-info-section="guide"');
    expect(infoHtml).toContain("游戏机制");
    expect(infoHtml).toContain("数值规则");
    expect(infoHtml).toContain("攻略指南");
    expect(valuesHtml).toContain("事件中科研杂活");
    expect(valuesHtml).toContain("减免 0</strong>");
    expect(valuesHtml).not.toContain("最低消耗");
    expect(guideHtml).toContain("开局路线");
    expect(guideHtml).toContain("月度安排");
    expect(guideHtml).toContain("毕业与转博");
    expect(guideHtml).toContain("角色成长");
    expect(guideHtml).toContain("行动优先级 · 待补充");
    expect(infoHtml).not.toContain('class="lobby-grid"');

    expect(messagesHtml).toMatch(/class="lobby-community-view lobby-message-view"/);
    expect(messagesHtml).toContain("留言板");
    expect(messagesHtml).toContain("V2 留言服务尚未接入，暂时无法发送");
    expect(messagesHtml).toContain('id="lobby-message-nickname"');
    expect(messagesHtml).toContain('id="lobby-message-content"');
    expect(messagesHtml).not.toContain('class="lobby-grid"');
  });

  it("renders the in-game feedback entry only when the feedback layer is open", () => {
    const state = createAdmittedTestState();
    const settingsHtml = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "settings" });
    const feedbackHtml = renderApp(state, createDefaultAccountProfile(), {
      activePlayTab: "settings",
      isFeedbackOpen: true,
    });

    expect(settingsHtml).toContain('data-ui-open-feedback');
    expect(settingsHtml).not.toContain('class="community-feedback-overlay"');
    expect(feedbackHtml).toContain('class="community-feedback-overlay"');
    expect(feedbackHtml).toContain('data-ui-close-feedback');
    expect(feedbackHtml).toContain('id="game-feedback-nickname"');
    expect(feedbackHtml).toContain('id="game-feedback-content"');
  });

  it("renders unlocked role achievements as expandable display slots", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.unlockedAchievementIds = ["normal:first-pot"];
    const html = renderApp(createInitialState(), account);

    expect(html).toContain('class="lobby-role-card-achievement-display" aria-label="角色成就"');
    expect(html).toContain('class="lobby-role-card-achievement-icon is-unlocked"');
    expect(html).toContain('data-achievement-id="normal:first-pot"');
    expect(html).toContain('aria-label="小有积蓄，已达成"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('class="lobby-profile-achievement-progress-count">1/6</strong>');
    expect(html).not.toContain("成就 1/");
    expect(html).not.toContain('class="lobby-role-card-metric is-achievement"');
  });

  it("renders locked role details and blocks start on unowned roles", () => {
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "genius-reversed";
    const html = renderApp(createInitialState(), account);

    expect(html).toContain("愚钝·院士转世");
    expect(html).toContain("未解锁");
    expect(html).toContain("逆位");
    expect(html).toContain("暂无成就");
    expect(html).not.toContain("成就系统待接入：完成院士路线的逆位挑战后解锁");
    expect(html).not.toContain("查看解锁条件");
    expect(html).not.toContain('data-action="start-game" data-role-id="genius-reversed"');
  });

  it("renders normal growth effect copy from current level and talent allocation", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 6;
    account.roleProgress.normal.exp = 320;
    account.roleProgress.normal.passiveLevels.awakening = 5;
    account.roleProgress.normal.passiveLevels["hidden-awaken"] = 1;

    const html = renderApp(createInitialState(), account);

    expect(html).not.toContain("基础效果");
    expect(html).toContain("转博时科研能力、社交能力、导师好感+50%（属性结果向上取整）");
    expect(html).not.toContain("每当属性溢出时上限+1");
    expect(html).toContain("每月行动次数+0.1（小数累积，满1生效）");
    expect(html).not.toContain("第一个月有10次行动次数");
    expect(html).toContain("天赋点 0");
    expect(html).toContain('class="lobby-talent-allocation-effect"');
  });

  it("keeps the six original achievements and mirrors unlock achievements onto target roles", () => {
    const normalAchievements = getRoleLobbyAchievementDefinitions("normal");
    const reversedAchievements = getRoleLobbyAchievementDefinitions("normal-reversed");
    const richAchievements = getRoleLobbyAchievementDefinitions("rich");

    expect(normalAchievements).toHaveLength(6);
    expect(normalAchievements.map((achievement) => achievement.id)).toEqual([
      "normal:first-pot",
      "normal:research-start",
      "normal:favorite",
      "normal:socialite",
      "normal:all-rounder",
      "normal:chair-upgrade",
    ]);
    expect(reversedAchievements).toHaveLength(1);
    expect(reversedAchievements[0]).toMatchObject({
      id: "unlock:normal-reversed",
      unlocksRoleId: "normal-reversed",
    });
    expect(richAchievements[0]).toMatchObject({ id: "unlock:rich", unlocksRoleId: "rich" });
  });

  it("keeps a target role unlock achievement visible after the role is unlocked", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.rich.unlocked = true;
    account.selectedLobbyRoleId = "rich";

    const html = renderApp(createInitialState(), account);
    const achievementList = html.match(/<div class="lobby-profile-achievement-list">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] ?? "";

    expect(html).toContain('data-achievement-id="unlock:rich"');
    expect(html).toContain('aria-label="小有积蓄，已达成"');
    expect(achievementList).toContain('class="lobby-profile-achievement is-unlocked"');
    expect(achievementList).toContain("使用大多数角色，金币达到30");
    expect(html).toContain('class="lobby-profile-achievement-progress-count">1/1</strong>');
  });

  it("renders the max-level extra effect copy for normal talents", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 10;
    account.roleProgress.normal.passiveLevels.awakening = 10;
    account.roleProgress.normal.passiveLevels["hidden-awaken"] = 10;

    const html = renderApp(createInitialState(), account);

    expect(html).not.toContain("基础效果");
    expect(html).toContain("转博时科研能力、社交能力、导师好感+100%（属性结果向上取整）；满级额外效果：每当属性溢出时上限+1");
    expect(html).toContain("每月行动次数+1.0");
    expect(html).toContain("第一个月有10次行动机会");
  });

  it("clamps stale achievement pages and renders all six normal achievements together", () => {
    const account = createDefaultAccountProfile();
    account.lobbyRoleAchievementPage = 1;
    const html = renderApp(createInitialState(), account);

    expect(html).not.toContain('data-action="change-role-achievement-page"');
    expect(html).toContain("小有积蓄");
    expect(html).toContain("渐生惰性");
    expect(html).toContain("购买办公椅并升级为人体工学椅");
    expect(html).not.toContain("办公椅 0/1 · 工学椅 0/1");
  });

  it("renders the second page with special tags and the last gender-paired rows", () => {
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "research-captain";
    account.lobbyRolePage = 1;
    const html = renderApp(createInitialState(), account);

    expect(html).toContain("统御者");
    expect(html).toContain("轮回者");
    expect(html).toContain("特殊");
    expect((html.match(/class="lobby-page-dot(?: is-active)?"/g) ?? []).length).toBe(2);
    expect(html).toContain('class="lobby-page-dot is-active"');
    expect(html).toContain('aria-label="第2页"');
    expect(html).toContain('aria-current="page" disabled');
    expect(html).toContain("天选之人");
    expect((html.match(/data-action="select-role"/g) ?? []).length).toBe(4);
    expect((html.match(/class="lobby-role-row"/g) ?? []).length).toBe(2);
  });

  it("renders the unified desktop workbench shell after starting the game", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-phase="playing"');
    expect(html).toContain('data-scale-mode="fixed"');
    expect(html).toContain('class="play-stage-scale"');
    expect(html).toContain('class="play-stage"');
    expect(html).toContain('<span>事件</span>');
    expect(html).toContain('<span class="center-tab-icon" aria-hidden="true">🔔</span>');
    expect(html).toContain('<span class="center-tab-icon" aria-hidden="true">🔬</span>');
    expect(html).toContain('<span class="center-tab-icon" aria-hidden="true">🤝</span>');
    expect(html).toContain('<span class="center-tab-icon" aria-hidden="true">🛒</span>');
    expect(html).toContain("科研");
    expect(html).toContain("人际");
    expect(html).toContain("商店");
    expect(html).toContain('<span>成果</span>');
    expect(html).toContain("天赋");
    expect(html).toContain("设置");
    expect(html).toContain('<span class="center-tab-next-label">下一月</span>');
    expect(html).toContain('<span class="center-tab-next-arrow" aria-hidden="true">→</span>');
    expect(html).toMatch(/class="center-tab-btn center-tab-btn-next"[\s\S]*?data-action="next-month"[\s\S]*?disabled aria-disabled="true"/);
    expect(html).toContain('class="center-tab-badge is-blocking"');
    expect(html).toContain('class="play-workbench"');
    expect(html).toContain("play-left-rail");
    expect(html).toContain("play-center-column");
    expect(html).toContain("play-right-rail");
    expect(html).toContain('class="new-attr-panel"');
    expect(html).toContain('data-tooltip="当前疾病概率 0%｜月末结算 -2%"');
    expect(html).toContain('data-tooltip="科研增减有0%概率无效\n事件中科研杂活 SAN 减免 0"');
    expect(html).toContain('data-tooltip="社交增减有0%概率无效"');
    expect(html).toContain('data-tooltip="好感增减有0%概率无效"');
    expect(html).toContain("SAN值");
    expect(html).toContain("永久效果");
    expect(html).toContain("本月效果");
    expect(html).toContain("下次效果");
    expect(html).toContain("下个月初");
    expect((html.match(/class="new-effect-subtitle"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).not.toContain('data-effect-sources=');
    expect(html).not.toContain('data-effect-id="next-month-san"');
    expect(html).not.toContain('data-effect-id="next-month-gold"');
    expect(html).toContain("待办事件");
    expect(html).not.toContain("事件预告");
    expect(html).not.toContain("事件记录");
    expect(html).toContain('class="event-panel"');
    expect(html).not.toContain('class="event-header-row"');
    expect(html).toContain('class="event-log-panel log-panel"');
    expect(html).not.toContain('class="event-content-box"');
    expect(html).toContain('id="pending-event-list"');
    expect(html).toContain('class="event-card"');
    expect(html).toContain('data-ui-open-event-id=');
    expect(html).toMatch(/class="event-ddl-badge" data-deadline="(?:due|soon|later)">期限 /);
    expect(html).not.toContain('class="event-card-row"');
    expect(html).not.toContain('class="event-card-preview"');
    expect(html).toContain('id="workstation-section"');
    expect(html).toContain('class="workstation-main-actions"');
    expect(html).toContain('class="workstation-action-points"');
    expect(html).toContain('class="workstation-paper-grid"');
    expect(html).not.toContain('class="conf-info-compact"');
    expect(html).toContain('id="shop-panel-col2"');
    expect(html).toContain('id="relationship-section"');
    expect(html).toContain('class="rel-card-grid"');
    expect(html.match(/class="rel-card /g) ?? []).toHaveLength(6);
    expect(html).toContain('class="rel-card locked rel-card-lover-locked"');
    expect(html).not.toContain('class="rel-switch-btns"');
    expect(html).not.toContain('class="rel-current-card"');
    expect(html).toContain('id="research-section"');
    expect(html).not.toContain('class="section-empty play-module-lock-state">入学后开放</div>');
    expect(html).not.toContain('class="research-dashboard-header"');
    expect(html).not.toContain('class="research-filter-stack"');
    expect(html).toContain('class="research-compact-layout"');
    expect(html).toContain('class="research-switch-btns research-paper-list"');
    expect(html).toContain('class="talent-panel"');
    expect(html).toContain('class="talent-items-list"');
    expect(html).toContain('class="settings-panel"');
    expect(html).toContain('id="settings-panel-content"');
    expect(html).toContain('class="settings-quick-actions"');
    expect(html).toContain('data-ui-layout-toggle="debug-event-rail"');
    expect(html).toContain('data-ui-layout-toggle="debug-bottom-bar"');
    expect(html).toContain('data-ui-open-feedback');
    expect(html).toContain('id="debug-bottom-bar"');
    expect(html).toContain('class="debug-bottom-stat-grid"');
    expect(html).toContain('class="debug-bottom-time-grid"');
    expect(html).toContain('id="debug-event-rail"');
    expect((html.match(/data-debug-journal-target=/g) ?? [])).toHaveLength(6);
    expect(html).toContain('data-debug-journal-target="nature"');
    expect(html).toContain('data-debug-journal-target="nmi"');
    expect(html).toContain('data-debug-journal-target="pami"');
    expect((html.match(/data-action="debug-add-all-buffs"/g) ?? [])).toHaveLength(1);
    expect(html.indexOf(">C合作</button>")).toBeLessThan(html.indexOf('data-action="debug-add-all-buffs"'));
    expect(html.indexOf('data-action="debug-add-all-buffs"')).toBeLessThan(html.indexOf('data-debug-journal-target="nature"'));
    expect(html).not.toContain('class="debug-event-rail-title"');
    expect(html).not.toContain('class="debug-event-category-title"');
    expect(html).not.toContain("测试事件");
    expect(html).not.toContain('class="debug-menu"');
    expect(html).not.toContain("属性调整");
    expect(html).not.toContain("事件触发");
    expect(html).not.toContain('class="settings-attr-grid"');
    expect(html).not.toContain('class="settings-event-grid"');
    expect(html).toContain('data-action="debug-adjust-stat"');
    expect(html).toContain('data-action="debug-shift-month"');
    expect(html).toContain('data-action="debug-trigger-event"');
    expect(html).toContain('data-event-id="conference"');
    expect(html).toContain('data-event-id="before-grad-school"');
    expect(html).toMatch(/class="debug-bottom-time-grid"[\s\S]*?\+12月[\s\S]*?data-action="force-next-month"/);
    expect(html).toContain('aria-label="删除当前阻塞事件并真实结算下一月"');
    expect(html).toContain('data-action="restart-game"');
    expect(html).toContain('data-lucide="rotate-ccw"');
    expect(html).toContain('data-lucide="house"');
    expect(html).toContain("重开");
    expect(html).toContain("返回开始页");
    expect(html).not.toContain("主题选择");
    expect(html).not.toContain("本轮概览");
    expect(html).not.toContain("存档占位");
    expect(html).not.toContain("暂无手动存档");
    expect(html).not.toContain("研究生工作台");
    expect(html).not.toContain("时间与待办");
    expect(html).not.toContain('class="play-workbench-header"');
    expect(html).not.toContain('class="play-workbench-metrics"');
    expect(html).not.toContain("角色图鉴");
  });

  it("toggles the temporary debug rails from the settings UI state", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });

    const hidden = renderApp(state, createDefaultAccountProfile(), {
      activePlayTab: "settings",
      showDebugEventRail: false,
      showDebugBottomBar: false,
    });
    expect(hidden).not.toContain('id="debug-event-rail"');
    expect(hidden).not.toContain('id="debug-bottom-bar"');
    expect(hidden).not.toContain("has-debug-bar");
    expect(hidden).not.toContain("has-debug-bottom-bar");
    expect(hidden).toMatch(/data-ui-layout-toggle="debug-event-rail"[\s\S]*?aria-label="显示最右侧栏"/);
    expect(hidden).toMatch(/data-ui-layout-toggle="debug-bottom-bar"[\s\S]*?aria-label="显示底部栏"/);

    const bottomOnly = renderApp(state, createDefaultAccountProfile(), {
      showDebugEventRail: false,
      showDebugBottomBar: true,
    });
    expect(bottomOnly).not.toContain('id="debug-event-rail"');
    expect(bottomOnly).toContain('id="debug-bottom-bar"');
    expect(bottomOnly).toContain("has-debug-bottom-bar");

    const railOnly = renderApp(state, createDefaultAccountProfile(), {
      showDebugEventRail: true,
      showDebugBottomBar: false,
    });
    expect(railOnly).toContain('id="debug-event-rail"');
    expect(railOnly).not.toContain('id="debug-bottom-bar"');
    expect(railOnly).toContain("has-debug-bar");
    expect(railOnly).not.toContain("has-debug-bottom-bar");
  });

  it("advertises the active reading action but not deferred panel actions", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");
    state = {
      ...state,
      eventQueue: [],
      player: { ...state.player, money: 10 },
    };

    const html = renderApp(state, createDefaultAccountProfile());
    const getTabHtml = (tabId: string): string => (
      html.match(new RegExp(`<button[^>]*data-ui-play-tab="${tabId}"[^>]*>([\\s\\S]*?)<\\/button>`))?.[0] ?? ""
    );

    expect(getTabHtml("events")).not.toContain("is-blocking");
    expect(html).toMatch(/class="center-tab-btn center-tab-btn-next"[\s\S]*?data-action="next-month"/);
    expect(html.match(/<button[\s\S]*?class="center-tab-btn center-tab-btn-next"[\s\S]*?<\/button>/)?.[0]).not.toContain("disabled");
    expect(getTabHtml("workstation")).toContain("center-tab-badge is-available");
    expect(getTabHtml("relationship")).not.toContain("center-tab-badge is-available");
    expect(getTabHtml("shop")).not.toContain("center-tab-badge is-available");

    const deferredActionButtons = html.match(/<button[^>]*data-gameplay-status="deferred"[^>]*>/g) ?? [];
    expect(deferredActionButtons.length).toBeGreaterThan(0);
    for (const button of deferredActionButtons) {
      expect(button).toContain("disabled");
      expect(button).toContain('aria-disabled="true"');
    }
    const readButton = html.match(/<button[^>]*class="compact-action-btn workstation-main-action-btn is-read"[^>]*data-action="read-paper"[^>]*>/)?.[0] ?? "";
    expect(readButton).not.toBe("");
    expect(readButton).not.toContain("disabled");
    expect(readButton).not.toContain('data-gameplay-status="deferred"');
  });

  it("keeps the pre-enrollment workstation actions wired in the development preview", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
    const paperId = state.papers[0]?.id;
    if (!paperId) throw new Error("preview paper is missing");

    const html = renderApp(state, createDefaultAccountProfile());
    const readButton = html.match(/<button[^>]*class="compact-action-btn workstation-main-action-btn is-read"[^>]*>/)?.[0] ?? "";

    expect(readButton).toContain('data-action="read-paper"');
    expect(html).toContain(`data-action="reroll-paper-topic" data-paper-id="${paperId}"`);
    expect(html).toContain(`data-action="discard-paper" data-paper-id="${paperId}"`);
  });

  it("preserves real workstation disabled conditions in the pre-enrollment preview", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const noPaperHtml = renderApp(state, createDefaultAccountProfile());
    const ideaButton = noPaperHtml.match(/<button[^>]*data-action="research-paper"[^>]*data-paper-action-type="idea"[^>]*>/)?.[0] ?? "";

    expect(ideaButton).toBe("");
    expect(noPaperHtml).toContain("请先新建一篇论文");

    const exhaustedState = {
      ...state,
      actionState: { ...state.actionState, used: state.actionState.limit },
    };
    const exhaustedHtml = renderApp(exhaustedState, createDefaultAccountProfile());
    const restButton = exhaustedHtml.match(/<button[^>]*class="compact-action-btn workstation-main-action-btn is-rest"[^>]*>/)?.[0] ?? "";

    expect(restButton).toContain("disabled");
    expect(restButton).toContain("本月行动次数已用尽");
  });

  it("keeps deferred relationship buttons clickable in the pre-enrollment preview", () => {
    const html = renderApp(createAdmittedTestState(), createDefaultAccountProfile(), { activePlayTab: "relationship" });
    const deferredActionButtons = html.match(/<button[^>]*data-gameplay-status="deferred"[^>]*>/g) ?? [];

    expect(deferredActionButtons.length).toBeGreaterThan(0);
    for (const button of deferredActionButtons) {
      expect(button).not.toContain("disabled");
      expect(button).not.toContain(`aria-disabled="true"`);
    }
  });

  it("moves the total event count from the center tab to the pending-event heading", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const blockingEvent = state.eventQueue[0];
    if (!blockingEvent) throw new Error("blocking event is missing");
    const deferredEvent = {
      ...blockingEvent,
      id: "deferred-event",
      chainId: "deferred-event",
      deadlineMonths: 1,
      queueOrder: blockingEvent.queueOrder + 1,
    };
    const getEventTabHtml = (html: string): string => (
      html.match(/<button[^>]*data-ui-play-tab="events"[^>]*>([\s\S]*?)<\/button>/)?.[0] ?? ""
    );
    const getPendingHeadingHtml = (html: string): string => (
      html.match(/<span class="new-calendar-title">([\s\S]*?<span>待办事件<\/span>[\s\S]*?)<\/span>/)?.[0] ?? ""
    );

    state = { ...state, eventQueue: [blockingEvent, deferredEvent] };
    const mixedHtml = renderApp(state, createDefaultAccountProfile());
    expect(getEventTabHtml(mixedHtml)).not.toContain("center-tab-badge");
    expect(getPendingHeadingHtml(mixedHtml)).toContain('class="center-tab-badge is-blocking"');
    expect(getPendingHeadingHtml(mixedHtml)).toContain('aria-label="2 个待办事件">2</span>');

    state = { ...state, eventQueue: [deferredEvent, { ...deferredEvent, id: "deferred-event-2", queueOrder: deferredEvent.queueOrder + 1 }] };
    const deferredHtml = renderApp(state, createDefaultAccountProfile());
    expect(getEventTabHtml(deferredHtml)).not.toContain("center-tab-badge");
    expect(getPendingHeadingHtml(deferredHtml)).toContain('class="center-tab-badge is-available"');
    expect(getPendingHeadingHtml(deferredHtml)).toContain('aria-label="2 个待办事件">2</span>');
  });

  it("renders interactive shop tabs, AI subscriptions and structured prices", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");
    state = {
      ...state,
      player: { ...state.player, money: 80 },
      shopState: {
        ...state.shopState,
        gpuLevel: 1,
        chairOwned: true,
        monitorOwned: true,
        bikeOwned: true,
      },
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
      },
      eventSupport: {
        ...state.eventSupport,
        hasParasol: true,
        hasBadmintonRacket: true,
      },
    };

    const aiHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "ai" });
    const gptCard = getShopCardHtml(aiHtml, "GPT-3.5");
    const geminiCard = getShopCardHtml(aiHtml, "Gemini 1.5");
    const deepSeekCard = getShopCardHtml(aiHtml, "DeepSeek-V2");
    const doubaoCard = getShopCardHtml(aiHtml, "豆包 Seed 1");
    expect(aiHtml).toContain('data-ui-shop-tab="ai"');
    expect(aiHtml).toContain("GPT-3.5");
    expect(aiHtml).toContain("Claude 2");
    expect(aiHtml).toContain("豆包 Seed 1");
    expect(aiHtml).toContain("Kimi Chat");
    expect(aiHtml).toContain("看论文：");
    expect(aiHtml).toContain("SAN -1");
    expect(aiHtml).toContain("<title>Kimi</title>");
    expect(aiHtml).toContain("#18181b");
    expect(aiHtml).toContain("#1687ff");
    expect(aiHtml).toContain('data-action="buy-ai-month"');
    expect(aiHtml).toContain('data-action="toggle-ai-subscription"');
    expect(aiHtml).toContain('class="shop-subscription-toggle');
    expect(aiHtml).toContain('role="switch"');
    expect(aiHtml).not.toContain("科研效果");
    expect(aiHtml).toContain('class="shop-item-icon-image"');
    expect(doubaoCard).toContain('<img class="shop-item-icon-image is-avatar"');
    expect(doubaoCard).toContain('alt=""');
    expect(doubaoCard).not.toContain("<svg");
    expect(gptCard).toContain("<svg");
    expect(aiHtml).toContain("<span>想idea、做实验、写论文：</span>");
    for (const card of [gptCard, geminiCard, deepSeekCard, doubaoCard]) {
      expect((card.match(/shop-effect-line/g) ?? [])).toHaveLength(1);
      expect(card).not.toContain("shop-effect-line is-value");
    }
    expect(aiHtml).toContain("自动提升可修改论文的分数：");
    expect(aiHtml).toContain("+3分");
    expect(aiHtml).not.toContain("早期通用模型");
    expect(aiHtml).toContain("💡 小提示：订购仅在当月生效；游戏内 AI 模型按学年更新，效果和价格随之变化，更新后你需要重新开启自动续费");
    expect(aiHtml).toContain("订购本月");
    expect(aiHtml).not.toContain("购买本月");
    expect(aiHtml).toMatch(/DeepSeek-V2[\s\S]*?class="shop-item-btn-price is-cost"[\s\S]*?<span>1<\/span>/);
    expect(aiHtml).toContain("#10a37f");
    expect(aiHtml).not.toContain("本月费用");
    expect(aiHtml).toContain("自动续费");
    expect(aiHtml).not.toContain("本月状态");
    expect(aiHtml).not.toContain('data-shop-item-id="gpu_buy"');

    const shopTabIds = [...aiHtml.matchAll(/data-ui-shop-tab="([^"]+)"/g)].map((match) => match[1]);
    expect(shopTabIds).toEqual(["ai", "coffee", "gear", "rest"]);

    const upgradeNoticeHtml = renderApp(state, createDefaultAccountProfile(), {
      activePlayTab: "shop",
      activeShopTab: "gear",
      showShopUpgradeNotice: true,
      shopUpgradeNoticeTabs: ["ai", "coffee"],
    });
    const shopTab = upgradeNoticeHtml.match(/<button[^>]*data-ui-play-tab="shop"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    const aiShopTab = upgradeNoticeHtml.match(/<button[^>]*data-ui-shop-tab="ai"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    const coffeeShopTab = upgradeNoticeHtml.match(/<button[^>]*data-ui-shop-tab="coffee"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    const gearShopTab = upgradeNoticeHtml.match(/<button[^>]*data-ui-shop-tab="gear"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(shopTab).toContain('class="center-tab-badge is-available shop-upgrade-badge" aria-label="商店内有提升">↑</span>');
    expect(aiShopTab).toContain('aria-label="AI有提升">↑</span>');
    expect(coffeeShopTab).toContain('aria-label="咖啡有提升">↑</span>');
    expect(gearShopTab).not.toContain("shop-upgrade-badge");

    expect(aiHtml).not.toContain("人际栏操作：");
    const futureAiHtml = renderApp({ ...state, year: 4, month: 1, totalMonths: 37 }, createDefaultAccountProfile(), { activeShopTab: "ai" });
    expect(futureAiHtml).not.toContain("人际栏操作：");
    expect(futureAiHtml).toContain("Kimi K3");
    expect(futureAiHtml).toContain("自动看论文：");
    expect(futureAiHtml).toContain("+1次");
    expect(futureAiHtml).not.toContain("事件中的科研杂活");

    const purchasedAiHtml = renderApp({
      ...state,
      aiShopState: {
        subscriptions: {
          ...state.aiShopState.subscriptions,
          gpt: {
            ...state.aiShopState.subscriptions.gpt,
            enabled: true,
            active: true,
            modelId: "gpt-3.5",
          },
        },
      },
    }, createDefaultAccountProfile(), { activeShopTab: "ai" });
    expect(purchasedAiHtml).toContain("本月已订购");
    expect(purchasedAiHtml).toContain('aria-checked="true"');

    const gearHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "gear" });
    const gpuCard = getShopCardHtml(gearHtml, "GTX 1080 Ti 显卡");
    const monitorCard = getShopCardHtml(gearHtml, "2K 显示器");
    const racketCard = getShopCardHtml(gearHtml, "羽毛球拍");
    const ebikeCard = getShopCardHtml(gearHtml, "小电驴");
    expect(gearHtml).toContain('data-ui-shop-tab="gear"');
    expect((gearHtml.match(/data-ui-shop-tab=/g) ?? [])).toHaveLength(4);
    expect(gearHtml).not.toContain('data-ui-shop-tab="display"');
    expect(gearHtml).not.toContain('data-ui-shop-tab="outdoor"');
    expect(gearHtml).toContain("装备");
    expect(gearHtml).toContain('data-shop-item-id="gpu_buy"');
    expect(gearHtml).toContain('data-lucide="microchip"');
    expect(gearHtml).toContain("GTX 1080 Ti 显卡");
    expect(gpuCard).toContain("可升级");
    expect(gpuCard).not.toContain("起步型号");
    expect(gpuCard).not.toContain("下一档：");
    expect(gearHtml).not.toContain("购入后做实验");
    expect(gearHtml).toContain("做实验：");
    expect(gearHtml).toContain("+1次");
    expect(gpuCard).not.toContain("shop-item-desc");
    expect((gpuCard.match(/shop-effect-line/g) ?? [])).toHaveLength(1);
    expect(gearHtml).toContain("机械键盘");
    expect(gearHtml).toContain("2K 显示器");
    expect(gearHtml).toContain("看论文 SAN-1");
    expect(gearHtml).not.toContain("idea buff");
    expect(gearHtml).not.toContain('data-shop-upgrade-option-id="monitor-4k"');
    expect(gearHtml).not.toContain("智能显示器");
    expect(gearHtml).not.toContain("双屏显示器");
    expect(gearHtml).not.toContain("游戏手柄");
    expect(gearHtml).not.toContain('class="shop-product-group"');
    expect(monitorCard).toContain('data-action="sell-shop-item"');
    expect(monitorCard).not.toContain('data-action="buy-shop-item"');
    expect(monitorCard).toContain("已购买");
    expect(monitorCard).not.toContain("shop-item-status is-owned");

    const fundedState = {
      ...state,
      player: { ...state.player, money: 0 },
      shopState: {
        ...state.shopState,
        entitlements: {
          gpuTransaction: 1,
          keyboardPurchase: 1,
          monitorPurchase: 1,
          chairPurchase: 1,
          chairUpgrade: 1,
          coffeeMachinePurchase: 1,
          coffeeMachineUpgrade: 1,
        },
      },
    };
    const fundedGearHtml = renderApp(fundedState, createDefaultAccountProfile(), { activeShopTab: "gear" });
    expect(fundedGearHtml).toContain("显卡下次购买/升级 0金币");
    expect(fundedGearHtml).toContain("机械键盘购买、2K显示器购买、办公椅购买、办公椅升级、咖啡机购买、咖啡机升级 0金币");
    expect(fundedGearHtml).toMatch(/<button[^>]*has-free-price[^>]*data-shop-item-id="gpu_buy"[^>]*>[\s\S]*?<span>0<\/span>/);
    expect(fundedGearHtml).toMatch(/<button[^>]*has-free-price[^>]*data-shop-item-id="keyboard"[^>]*>[\s\S]*?<span>0<\/span>/);

    const maxGpuHtml = renderApp({
      ...state,
      shopState: { ...state.shopState, gpuLevel: 10 },
    }, createDefaultAccountProfile(), { activeShopTab: "gear" });
    expect(maxGpuHtml).toContain("B300 显卡");
    expect(maxGpuHtml).toContain("已满级");
    expect(maxGpuHtml).toContain('title="已是最高型号"');

    const coffeeHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const coffeeCard = getShopCardHtml(coffeeHtml, "冰美式");
    const coffeeMachineCard = getShopCardHtml(coffeeHtml, "咖啡机");
    expect(coffeeHtml).toContain('data-ui-shop-tab="coffee"');
    expect(coffeeHtml).toContain("💡 小提示：手动购买冰美式和月初自动续费均需咖啡机；自动续费在金币不足或 SAN 已满时跳过");
    expect(coffeeCard).toContain("SAN +3");
    expect(coffeeCard).not.toContain("本月已生产");
    expect(coffeeMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("可生产冰美式，每月 1 杯");
    expect(coffeeHtml).toContain('data-action="buy-coffee"');
    expect(coffeeMachineCard).not.toContain('data-action="buy-coffee-machine"');
    expect(coffeeMachineCard).toContain('class="shop-item-status is-owned">可升级</span>');
    expect(coffeeMachineCard).toContain('data-action="sell-coffee-machine"');
    expect(coffeeMachineCard).toContain('aria-label="升级，? 金币"');
    expect(coffeeMachineCard).toContain('class="shop-item-btn-label">升级</span>');
    expect(coffeeHtml).toContain('data-action="toggle-coffee-subscription"');
    expect(coffeeHtml).toContain('aria-label="开启冰美式自动续费"');
    expect(coffeeCard).toContain('class="shop-item-row has-subscription"');
    expect(coffeeCard.indexOf('data-action="toggle-coffee-subscription"')).toBeLessThan(coffeeCard.indexOf('data-action="buy-coffee"'));
    expect(coffeeHtml).not.toContain('class="shop-title">校园商店</strong>');
    expect(coffeeHtml).not.toContain('class="shop-wallet"');
    expect(coffeeCard).toContain('class="shop-item-btn-label">购买本月</span>');
    expect(coffeeHtml).toMatch(/class="shop-item-btn-price is-cost">\s*<span aria-hidden="true">💰<\/span>\s*<span>2<\/span>/);

    expect(gearHtml).toContain("显卡和自行车可以逐档升级，提升效果");
    expect(gearHtml).not.toContain("按显卡方式");
    expect(gearHtml).not.toContain("小电驴是独立商品");
    expect(gearHtml).toContain('class="shop-item-name">小电驴</strong>');
    expect(ebikeCard).toContain("春季、秋季每月 <strong>SAN +1</strong>");
    expect(gearHtml).not.toContain("整装待发");
    expect(gearHtml).toContain("遮阳伞");
    expect(gearHtml).toContain("羽毛球拍");
    expect(gearHtml).not.toContain("未拥有");
    expect(gearHtml).toContain("羽毛球实力");
    expect(racketCard).toContain("羽毛球实力 <strong>+40</strong>");
    expect(racketCard).not.toContain("+30%");
    expect(gearHtml).not.toContain('data-ui-select-bike-upgrade=');
    expect(gearHtml).toContain('data-action="sell-support-item"');
    expect(racketCard).toContain('data-action="sell-support-item"');
    expect(racketCard).not.toContain('data-action="buy-support-item"');
    expect(racketCard).toContain("已购买");
    expect(racketCard).not.toContain("shop-item-status is-owned");
  });

  it("renders five selectable chair routes and confirms the selected upgrade from the chair card", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      player: { ...state.player, money: 100 },
      eventQueue: [],
      shopState: { ...state.shopState, chairOwned: true },
    };

    const unselectedHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "rest" });
    const chairCard = getShopCardHtml(unselectedHtml, "办公椅");
    expect(chairCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("每月 SAN +1，升级路线5选一");
    expect(chairCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("累计 +0 SAN");
    expect(chairCard).toContain('class="shop-item-status is-owned">可升级</span>');
    expect(unselectedHtml).not.toContain("data-ui-toggle-chair-upgrades");
    expect(unselectedHtml).not.toContain("shop-upgrade-menu");
    expect(unselectedHtml).toContain('aria-label="升级，? 金币"');
    expect(unselectedHtml).toContain('class="shop-item-btn-label">升级</span>');
    expect((unselectedHtml.match(/data-shop-upgrade-option-id="chair-/g) ?? [])).toHaveLength(5);
    expect((unselectedHtml.match(/data-ui-select-chair-upgrade="chair-/g) ?? [])).toHaveLength(5);
    expect((unselectedHtml.match(/shop-upgrade-check"/g) ?? [])).toHaveLength(5);
    expect(unselectedHtml).not.toContain("shop-upgrade-check is-selected");
    expect(unselectedHtml).not.toContain("三选一");

    const selectedHtml = renderApp(state, createDefaultAccountProfile(), {
      activeShopTab: "rest",
      selectedChairUpgradeId: "chair-massage",
    });
    expect((selectedHtml.match(/data-shop-upgrade-option-id="chair-/g) ?? [])).toHaveLength(5);
    expect((selectedHtml.match(/shop-upgrade-check/g) ?? [])).toHaveLength(5);
    expect((selectedHtml.match(/shop-upgrade-check is-selected/g) ?? [])).toHaveLength(1);
    expect(selectedHtml).toContain('data-ui-select-chair-upgrade="chair-massage"');
    expect(selectedHtml).toContain('aria-pressed="true"');
    expect(selectedHtml).toContain('data-action="upgrade-shop-item" data-shop-upgrade-id="chair-massage"');
    expect(selectedHtml).toContain('aria-label="升级，20 金币"');
    expect(selectedHtml).toContain("人体工学椅");
    expect(selectedHtml).toContain("电动按摩椅");
    expect(selectedHtml).toContain("💰");
    expect(selectedHtml).toContain("18");
    expect(selectedHtml).toContain("20");
    expect(selectedHtml).toContain("16");
    expect(selectedHtml).toContain("15");
    expect(selectedHtml).toContain("每月恢复 <strong>20%</strong> 已损失 SAN（下取整）");
    expect(selectedHtml).toContain("每月恢复当前 SAN 的 <strong>20%</strong>（下取整）");
    expect((selectedHtml.match(/data-shop-upgrade-option-id="chair-/g) ?? [])).toHaveLength(5);
    expect((selectedHtml.match(/升级费用/g) ?? [])).toHaveLength(5);
    for (const optionId of ["chair-advanced", "chair-massage", "chair-torture", "chair-spike", "chair-hammock"]) {
      const optionCard = selectedHtml.match(new RegExp(`<(?:article|button)[^>]*data-shop-upgrade-option-id="${optionId}"[\\s\\S]*?</(?:article|button)>`))?.[0] ?? "";
      expect(optionCard).toContain('class="shop-device-icon shop-upgrade-route-icon" data-lucide="settings"');
      expect(optionCard).not.toContain("shop-item-btn");
    }

   const upgradedHtml = renderApp({
      ...state,
      shopState: { ...state.shopState, chairUpgrade: "massage", chairSanRecovered: 7 },
    }, createDefaultAccountProfile(), { activeShopTab: "rest" });
   expect(upgradedHtml).toContain('<span class="shop-item-icon" aria-hidden="true">🛋️</span>');
   expect(upgradedHtml).toContain('<strong class="shop-item-name">电动按摩椅</strong>');
   expect(upgradedHtml).toContain('class="shop-item-status is-owned">已升级</span>');
   expect(upgradedHtml).toContain('class="shop-item-btn-label">已升级</span>');
   expect(getShopCardHtml(upgradedHtml, "电动按摩椅").replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("累计 +7 SAN");
   expect(upgradedHtml).not.toContain('data-action="upgrade-shop-item"');
   expect((upgradedHtml.match(/data-shop-upgrade-option-id="chair-/g) ?? [])).toHaveLength(5);
   expect((upgradedHtml.match(/shop-upgrade-check/g) ?? [])).toHaveLength(5);
   expect((upgradedHtml.match(/shop-upgrade-check is-selected/g) ?? [])).toHaveLength(1);
  });

  it("renders the bicycle as a continuous upgrade card and e-bike separately", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      player: { ...state.player, money: 100 },
      eventQueue: [],
      shopState: {
        ...state.shopState,
        bikeOwned: true,
        bikeLevel: 3,
        bikeSanSpent: 12,
        bikeSanCapGains: 2,
      },
    };

    const unselectedHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "gear" });
    expect(unselectedHtml).toContain('aria-label="升级，6 金币"');
    expect(unselectedHtml).not.toContain("data-ui-select-bike-upgrade=");
    expect(unselectedHtml).toContain("轻量公路车");
    expect(unselectedHtml).toContain("小电驴");

    const upgradedHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "gear" });
    const roadCard = getShopCardHtml(upgradedHtml, "轻量公路车");
    expect(roadCard).toContain("可升级");
    expect(roadCard).toContain("每月 <strong>SAN -2</strong>");
    expect(roadCard).toContain("最多 <strong>+9</strong>");
    expect(roadCard).toContain("累计消耗");
    expect(roadCard).toContain("<strong>12</strong>");
    expect(roadCard).toContain("当前上限 <strong>+2</strong>/<strong>9</strong>");
    expect(roadCard).toContain('aria-label="出售，9 金币"');
  });

  it("always renders the bicycle purchase action inside an unowned card", () => {
    const state = {
      ...createAdmittedTestState(),
      player: { ...createAdmittedTestState().player, money: 6 },
    };
    const html = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "gear" });
    const bikeCard = getShopCardHtml(html, "通勤自行车");

    expect(bikeCard).toContain('class="shop-item-row is-bike"');
    expect(bikeCard).toContain('data-action="buy-shop-item" data-shop-item-id="bike"');
    expect(bikeCard).toContain('aria-label="购买，6 金币"');
    expect(bikeCard).not.toContain("未开始累计");
    expect(bikeCard).not.toContain("下一档：");
    expect(bikeCard).toContain('class="shop-item-status is-neutral">可升级</span>');
    expect(bikeCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain(
      "每月 SAN -1；每 -6 SAN，上限 +1（最多 +3）",
    );
  });

  it("renders four selectable coffee routes and confirms the selected upgrade from the machine card", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      year: 1,
      month: 1,
      totalMonths: 1,
      eventQueue: [],
    };

    const unownedHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const unownedMachineCard = getShopCardHtml(unownedHtml, "咖啡机");
    expect(unownedMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("购入后可生产冰美式并选择一条升级路线");
    expect((unownedHtml.match(/data-shop-upgrade-option-id=/g) ?? [])).toHaveLength(4);
    expect((unownedHtml.match(/class="shop-item-row[^\"]*is-upgrade-option/g) ?? [])).toHaveLength(4);
    expect((unownedHtml.match(/shop-upgrade-check/g) ?? [])).toHaveLength(4);
    expect((unownedHtml.match(/shop-upgrade-route-icon/g) ?? [])).toHaveLength(4);
    expect(unownedHtml).toContain('class="shop-item-name">手动咖啡机</strong>');
    expect(unownedHtml).toContain('class="shop-item-name">自动咖啡机</strong>');
    expect(unownedHtml).toContain('class="shop-item-name">高级咖啡机</strong>');
    expect(unownedHtml).toContain('class="shop-item-name">无限咖啡机</strong>');
    expect((unownedHtml.match(/升级费用/g) ?? [])).toHaveLength(4);
    expect(unownedHtml).not.toContain('data-ui-select-coffee-upgrade=');
    expect(unownedHtml).not.toContain('data-coffee-upgrade-id=');
    expect(unownedHtml).not.toContain('<strong class="shop-item-name">⚙️ 升级 · </strong>');
    expect(unownedHtml).not.toContain("升级 -0");
    expect(unownedHtml).toContain('data-action="toggle-coffee-subscription"');

    const ownedState = {
      ...state,
      player: { ...state.player, money: 100 },
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
      },
    };
    const unselectedHtml = renderApp(ownedState, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    expect(unselectedHtml).toContain('aria-label="升级，? 金币"');
    expect((unselectedHtml.match(/data-ui-select-coffee-upgrade=/g) ?? [])).toHaveLength(4);
    expect(unselectedHtml).not.toContain("shop-upgrade-check is-selected");

    const retainedProgressHtml = renderApp({
      ...ownedState,
      coffeeState: { ...ownedState.coffeeState, machineTrackedCoffeeCount: 24 },
    }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    expect(retainedProgressHtml).toContain("已保留累计 <strong>24 杯</strong>");

    const selectedHtml = renderApp(ownedState, createDefaultAccountProfile(), {
      activeShopTab: "coffee",
      selectedCoffeeUpgradeId: "advanced",
    });
    expect((selectedHtml.match(/shop-upgrade-check is-selected/g) ?? [])).toHaveLength(1);
    expect(selectedHtml).toContain('data-ui-select-coffee-upgrade="advanced"');
    expect(selectedHtml).toContain('aria-pressed="true"');
    expect(selectedHtml).toContain('data-action="upgrade-coffee-machine" data-shop-upgrade-id="advanced"');
    expect(selectedHtml).toContain('aria-label="升级，18 金币"');
    expect((selectedHtml.match(/升级费用/g) ?? [])).toHaveLength(4);
    for (const optionId of ["manual", "automatic", "advanced", "unlimited"]) {
      const optionCard = selectedHtml.match(new RegExp(`<(?:article|button)[^>]*data-shop-upgrade-option-id="${optionId}"[\\s\\S]*?</(?:article|button)>`))?.[0] ?? "";
      expect(optionCard).toContain('class="shop-device-icon shop-upgrade-route-icon" data-lucide="settings"');
      expect(optionCard).not.toContain("shop-item-btn");
    }

    const upgradedHtml = renderApp({
      ...ownedState,
      coffeeState: { ...ownedState.coffeeState, machineUpgrade: "advanced", machineTrackedCoffeeCount: 24 },
    }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const upgradedMachineCard = getShopCardHtml(upgradedHtml, "高级咖啡机");
    const advancedUpgradeCard = upgradedHtml.match(/<(?:article|button)[^>]*data-shop-upgrade-option-id="advanced"[\s\S]*?<\/(?:article|button)>/)?.[0] ?? "";
    expect(upgradedHtml).toContain('class="shop-item-name">自动咖啡机</strong>');
    expect(upgradedHtml).toContain('class="shop-item-name">高级咖啡机</strong>');
    expect(upgradedHtml).toContain('class="shop-item-name">无限咖啡机</strong>');
    expect(upgradedMachineCard).toContain('data-action="sell-coffee-machine"');
    expect(upgradedMachineCard).toContain("已升级");
    expect(upgradedMachineCard).toContain('class="shop-item-status is-owned">已升级</span>');
    expect(upgradedMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain(
      "每累计生产 10 杯冰美式，效果提升 1（最多 +5）",
    );
    expect(upgradedMachineCard).not.toContain('data-action="buy-coffee-machine"');
    expect(advancedUpgradeCard).not.toContain('class="shop-item-status is-owned"');
    expect(advancedUpgradeCard).toContain("shop-upgrade-check is-selected");
    expect(advancedUpgradeCard).not.toContain("shop-item-btn");
    expect(upgradedHtml).not.toContain("出售会移除当前升级");
    expect(upgradedHtml).not.toContain("出售会同时移除当前升级");
    expect(upgradedHtml).not.toContain("返还总投入");
    expect(upgradedHtml).not.toContain('data-coffee-upgrade-id=');
    expect(upgradedHtml).not.toContain('<strong class="shop-item-name">⚙️ 升级 · </strong>');
    expect(upgradedHtml).not.toContain("升级 -0");

    const automaticHtml = renderApp({
      ...state,
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
        machineUpgrade: "automatic",
        subscriptionEnabled: true,
        machineTrackedCoffeeCount: 7,
      },
    }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const automaticMachineCard = getShopCardHtml(automaticHtml, "自动咖啡机");
    expect(automaticHtml).toContain('data-action="toggle-coffee-subscription"');
    expect(automaticHtml).toContain('aria-label="关闭冰美式自动续费"');
    expect(automaticMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain(
      "每月初额外生产一杯冰美式，金币 -2，SAN +3",
    );

    const manualHtml = renderApp({
      ...state,
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
        machineUpgrade: "manual",
        machineTrackedCoffeeCount: 6,
      },
    }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const manualMachineCard = getShopCardHtml(manualHtml, "手动咖啡机");
    expect(manualMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain(
      "冰美式价格降低 1 金币",
    );

    const unlimitedHtml = renderApp({
      ...state,
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
        machineUpgrade: "unlimited",
        coffeePurchaseCountThisMonth: 2,
        coffeeProducedCountThisMonth: 2,
        machineTrackedCoffeeCount: 12,
      },
    }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const unlimitedMachineCard = getShopCardHtml(unlimitedHtml, "无限咖啡机");
    expect(unlimitedMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain(
      "每月可无限生产冰美式，价格按 2/3/4... 递增",
    );

    const boughtCoffeeHtml = renderApp({
      ...state,
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
        coffeePurchaseCountThisMonth: 1,
        coffeeProducedCountThisMonth: 1,
      },
    }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const boughtCoffeeCard = getShopCardHtml(boughtCoffeeHtml, "冰美式");
    expect(boughtCoffeeCard).toContain('data-action="toggle-coffee-subscription"');
    expect(boughtCoffeeCard).not.toContain('data-action="buy-coffee"');
    expect(boughtCoffeeCard).toContain("本月已购");
  });

  it("renders the selected play tab and panel directly from UI state", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "settings" });

    expect(html).toMatch(/class="center-tab-btn active"[^>]*aria-pressed="true"[^>]*data-ui-play-tab="settings"/);
    expect(html).toMatch(/class="center-tab-btn"[^>]*aria-pressed="false"[^>]*data-ui-play-tab="events"/);
    expect(html).toContain('<section class="center-main-panel active" data-tab-panel="settings">');
    expect(html).toContain('<section class="center-main-panel" data-tab-panel="events" hidden>');
  });

  it("renders workstation actions and four persistent paper cards", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");

    const firstPaper = {
      ...createDraftPaper(1, 0),
      title: "工作站测试论文",
      idea: 3,
      experiment: 2,
      writing: 1,
    };

    state = {
      ...state,
      illnessProbability: 0,
      papers: [firstPaper],
      selectedPaperId: firstPaper.id,
      paperSlotsUnlocked: 2,
    };

    const defaultHtml = renderApp(state, createDefaultAccountProfile());
    expect(defaultHtml).toContain('class="workstation-action-toolbar"');
    expect(defaultHtml).toContain('new-identity-money-header');
    expect(defaultHtml).toContain(`class="new-player-name" title="大多数：${state.playerName}"`);
    expect(defaultHtml).toContain(`>大多数：${state.playerName}</span>`);
    expect(defaultHtml).toContain('class="new-currency-icon"');
    expect(defaultHtml).not.toContain('class="out-of-game-role-name"');
    expect(defaultHtml).toContain('class="out-of-game-role-portrait"');
    expect(defaultHtml).toContain('aria-label="行动点 1/1"');
    expect(defaultHtml).not.toContain("本月剩余");
    expect(defaultHtml).not.toContain('data-ui-conference-offset');
    expect(defaultHtml).not.toContain('class="conference-overview-card"');
    expect(defaultHtml).not.toContain("会议信息");

    const slotHtml = defaultHtml;
    expect(slotHtml).not.toContain("研究工作站");
    expect((slotHtml.match(/class="paper-card paper-slot-card/g) ?? [])).toHaveLength(4);
    expect(slotHtml).not.toContain("论文 1");
    expect(slotHtml).not.toContain("论文 2");
    expect(slotHtml).not.toContain("论文 3");
    expect(slotHtml).not.toContain("论文 4");
    expect(slotHtml).not.toContain('data-ui-workstation-panel-index');
    expect(slotHtml).not.toContain("毕业进度");
    expect(slotHtml).toContain('data-action="part-time-work"');
    expect(slotHtml).toMatch(/SAN-\d+ · 金币\+2/);
    expect(slotHtml).toContain("SAN+2");
    expect(slotHtml).toContain(firstPaper.title);
    expect(slotHtml).toContain(firstPaper.topicLabel);
    expect(slotHtml).toContain(`热度 ×${firstPaper.heatMultiplier.toFixed(2)}`);
    expect(slotHtml).toContain('title="发表前衰减');
    expect(slotHtml).toContain(`引用倍率 ×${firstPaper.heatMultiplier.toFixed(2)}`);
    expect(slotHtml).not.toContain("热度只影响论文公开后的引用");
    expect(slotHtml).toContain("发表前衰减");
    expect(slotHtml).toContain('class="paper-topic-meta"');
    expect(slotHtml).toMatch(/class="paper-title-meta-row"[\s\S]*?class="paper-title-meta-content"[\s\S]*?class="paper-title"[\s\S]*?class="paper-topic-meta"/);
    expect(slotHtml).toContain('data-ui-select-workstation-paper="paper-1-1"');
    expect(slotHtml).toContain('<article\n        class="paper-card paper-slot-card paper-card-filled paper-card-selectable');
    expect(slotHtml).not.toContain('<button\n      class="paper-select-toggle"');
    expect(slotHtml).toContain('class="paper-select-check is-selected"');
    expect(slotHtml).toContain('class="workstation-main-row"');
    expect((slotHtml.match(/class="compact-action-btn workstation-main-action-btn/g) ?? [])).toHaveLength(6);
    expect(slotHtml).toContain('class="workstation-paper-toolbar"');
    expect(slotHtml).not.toContain('class="workstation-paper-target"');
    expect(slotHtml).toContain('<small>总分</small><strong>6</strong>');
    expect(slotHtml).toContain('<span class="btn-desc">想idea</span>');
    expect(slotHtml).toContain('class="workstation-submit-target-grid"');
    expect((slotHtml.match(/data-action="submit-paper"/g) ?? [])).toHaveLength(3);
    expect(slotHtml).not.toContain('data-action="idea"');
    expect(slotHtml).toContain('class="paper-score-strip"');
    expect(slotHtml).toContain("💡 小提示：想 idea、做实验、写论文会重新计算对应分数");
    expect(slotHtml.indexOf('id="workstation-paper-grid"')).toBeLessThan(slotHtml.indexOf('class="workstation-paper-toolbar"'));
    expect(slotHtml).not.toContain('class="paper-score-track"');
    expect(slotHtml).not.toContain("通常消耗 1 个行动");
    expect(slotHtml).not.toContain("三项均有分即可投稿");
    expect(slotHtml).not.toContain("投稿约");
    expect(slotHtml).not.toContain("录用率约");
    expect(slotHtml).not.toContain("当前槽位为空");
    expect(slotHtml).toContain("新建论文</button>");
    expect(slotHtml).toContain('data-action="create-paper"');
    expect((slotHtml.match(/class="paper-card paper-slot-card paper-card-empty paper-card-locked paper-slot-compact/g) ?? [])).toHaveLength(2);
    expect(slotHtml).not.toContain("尚未选题");
    expect(slotHtml).not.toContain("新建后生成研究方向");
    expect(slotHtml).not.toContain("解锁后创建论文");
    expect(slotHtml).not.toContain("完成科研积累后开放");
    expect(slotHtml).toContain("科研能力达到12");
    expect(slotHtml).toContain("科研能力达到18");
    expect(slotHtml).toContain('class="new-attr-level attr-level-research paper-lock-tier"');
    expect(slotHtml).not.toContain('paper-lock-tier" tabindex=');
    expect(slotHtml).not.toContain('paper-lock-tier" aria-label=');
    expect(slotHtml).not.toContain('paper-lock-tier" data-tooltip=');

    const lockedSlot = getPaperSlotCardHtml(slotHtml, 2);
    expect(lockedSlot).toContain('class="paper-empty-body paper-locked-body"');
    expect(lockedSlot).toContain('class="paper-card-header paper-empty-card-header"');
    expect(lockedSlot).toContain('class="paper-card-lock-message"');
    expect(lockedSlot).not.toContain('待想 idea');
    expect(lockedSlot).not.toContain('class="paper-score-strip"');
    expect(lockedSlot).not.toContain('新建论文');
    expect(lockedSlot).not.toContain('data-action="create-paper"');

    const emptySlotHtml = renderApp({
      ...state,
      papers: [],
      selectedPaperId: null,
      paperSlotsUnlocked: 1,
      player: { ...state.player, research: 1 },
    }, createDefaultAccountProfile());
    const firstEmptySlot = emptySlotHtml.match(/<article class="paper-card paper-slot-card paper-card-empty paper-slot-compact" data-paper-slot-index="0">[\s\S]*?<\/article>/)?.[0] ?? "";
    expect(firstEmptySlot).toContain('data-action="create-paper"');
    expect(firstEmptySlot).not.toContain("论文 1");
    expect(firstEmptySlot).toContain('class="paper-card-header paper-empty-card-header"');
    expect(firstEmptySlot).toContain('class="paper-empty-body"');
    expect(firstEmptySlot).toMatch(/class="[^"]*paper-empty-create-btn/);
    expect(firstEmptySlot).not.toContain('class="paper-score-strip"');
    expect(firstEmptySlot).not.toContain("尚未选题");
    expect(emptySlotHtml).toContain("科研能力达到6");
    expect(emptySlotHtml).toContain(">入门</span>");
    expect(slotHtml).toContain('class="paper-title-meta-row"');
    expect(slotHtml).not.toContain('class="paper-empty-action"');
    expect(slotHtml).toContain('aria-label="换个选题"');
    expect(slotHtml).toContain("🔄</button>");
    expect(slotHtml).not.toContain(">换个选题</button>");
    expect(slotHtml).toContain('aria-label="丢弃论文"');
    expect(slotHtml).toContain("🚮</button>");
    expect(slotHtml).not.toContain(">丢弃</button>");
    expect(slotHtml).toContain('title="论文已有进度，不能更换选题"');
    expect(slotHtml).toContain(`data-action="discard-paper" data-paper-id="${firstPaper.id}"`);

    const zeroProgressPaper = { ...firstPaper, idea: 0, experiment: 0, writing: 0 };
    const zeroProgressHtml = renderApp({
      ...state,
      papers: [zeroProgressPaper],
      selectedPaperId: zeroProgressPaper.id,
    }, createDefaultAccountProfile());
    expect(zeroProgressHtml).toContain(`data-action="reroll-paper-topic" data-paper-id="${firstPaper.id}"`);

    const recoveredSelectionHtml = renderApp({
      ...state,
      selectedPaperId: null,
    }, createDefaultAccountProfile());
    expect(recoveredSelectionHtml).toContain('data-paper-selected="true"');
    expect(recoveredSelectionHtml).toContain('class="paper-select-check is-selected"');
    expect(recoveredSelectionHtml).toContain(`data-action="research-paper" data-paper-id="${firstPaper.id}" data-paper-action-type="idea"`);

    const submitHtml = renderApp(state, createDefaultAccountProfile());
    expect((submitHtml.match(/data-action="submit-paper"/g) ?? [])).toHaveLength(3);
    expect(submitHtml).not.toContain('data-ui-toggle-workstation-submit');
    expect(submitHtml).not.toContain('class="workstation-submit-guide"');
    expect(submitHtml).not.toContain("投稿不消耗行动点");
    expect(submitHtml).not.toContain("投稿信息");
    expect(submitHtml).toContain('class="workstation-submit-target-grid"');
    expect(submitHtml).toContain("ICLR 2023");
    const runLocation = getConferenceLocation(state.month, "A", state.year, state.conferenceLocationSeed);
    expect(submitHtml).toContain(`${runLocation.city} · `);
    expect(submitHtml).toContain("影响力1.40 · 参考分82");
    expect(submitHtml).toContain(">Nature</strong>");
    expect(submitHtml).toContain("送审分150");
    expect(submitHtml).toContain("达标分500");
    expect(submitHtml).toContain('class="workstation-submit-target-grid" role="group"');
    expect((submitHtml.match(/class="paper-submit-option paper-submit-conference grade-/g) ?? [])).toHaveLength(3);
    expect(submitHtml).not.toContain('class="paper-submit-target-btn"');
    expect(submitHtml).not.toContain("↗");
    expect(submitHtml).toMatch(/class="paper-submit-option paper-submit-conference grade-a"/);
    expect((submitHtml.match(/class="paper-submit-destination"/g) ?? [])).toHaveLength(6);
    expect((submitHtml.match(/class="paper-submit-grade-mark"/g) ?? [])).toHaveLength(3);
    expect(submitHtml).toContain("International Conference on Learning Representations");
    expect((submitHtml.match(/class="paper-journal-btn(?:\s|\")/g) ?? [])).toHaveLength(3);
    expect(submitHtml).toContain('aria-label="投稿 Nature"');
    expect(submitHtml).toContain('aria-label="投稿 子刊NMI"');
    expect(submitHtml).toContain('aria-label="投稿 顶刊PAMI"');
    expect(submitHtml).toContain("Nature · 期刊分不足，需要 150");
    expect(submitHtml).not.toContain('class="paper-journal-meta"');
    expect(submitHtml).not.toContain('class="paper-journal-acceptance"');
    expect(submitHtml).not.toContain("投稿 <span aria-hidden=\"true\">|</span>");
    expect((submitHtml.match(/class="paper-submit-cta"/g) ?? [])).toHaveLength(0);
    expect((submitHtml.match(/class="paper-journal-cta"/g) ?? [])).toHaveLength(0);
    expect(submitHtml).not.toContain("投稿期刊");

    const hammockHtml = renderApp({
      ...state,
      shopState: {
        ...state.shopState,
        chairOwned: true,
        chairUpgrade: "hammock",
      },
    }, createDefaultAccountProfile());
    expect(hammockHtml).toContain("SAN+5");
  });

  it("shows the green AI action count after regular action points are exhausted", () => {
    const base = createAdmittedTestState();
    const state = {
      ...base,
      actionState: { ...base.actionState, used: base.actionState.limit, aiResearchBonusUsed: false },
      aiShopState: {
        ...base.aiShopState,
        subscriptions: {
          ...base.aiShopState.subscriptions,
          gpt: { ...base.aiShopState.subscriptions.gpt, active: true, modelId: getAiModelForTotalMonths(base.totalMonths, "gpt").id },
          deepseek: { ...base.aiShopState.subscriptions.deepseek, active: true, modelId: getAiModelForTotalMonths(base.totalMonths, "deepseek").id },
          doubao: { ...base.aiShopState.subscriptions.doubao, active: true, modelId: getAiModelForTotalMonths(base.totalMonths, "doubao").id },
        },
      },
    };
    const html = renderApp(state, createDefaultAccountProfile());
    expect(html).toContain('aria-label="AI行动可用 1 次"');
    expect(html).toMatch(/data-ui-play-tab="workstation"[\s\S]*class="center-tab-badge is-available"[^>]*>1<\/span>/);
  });

  it("shows threshold-unlocked research slots even before another state sync", () => {
    const state = {
      ...createAdmittedTestState(),
      paperSlotsUnlocked: 1,
      player: {
        ...createAdmittedTestState().player,
        research: 12,
      },
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain("科研能力达到12（熟练档位）解锁");
    expect(html).toContain("科研能力达到18");
    expect(html).not.toContain("当前槽位为空");
    expect((html.match(/class="paper-card paper-slot-card paper-card-empty/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain("科研达到 12 后解锁");
  });

  it("enables creating a paper in any unlocked empty slot", () => {
    const base = createAdmittedTestState();
    const paper = {
      ...createDraftPaper(1, 0),
      paperSlotIndex: 2,
      title: "跳槽位测试论文",
    };
    const html = renderApp({
      ...base,
      paperSlotsUnlocked: 3,
      player: { ...base.player, research: 12 },
      papers: [paper],
      selectedPaperId: paper.id,
    }, createDefaultAccountProfile());
    const slotZero = getPaperSlotCardHtml(html, 0);
    const slotOne = getPaperSlotCardHtml(html, 1);
    const slotTwo = getPaperSlotCardHtml(html, 2);

    expect(slotZero).toContain('data-action="create-paper" data-paper-slot-index="0"');
    expect(slotOne).toContain('data-action="create-paper" data-paper-slot-index="1"');
    expect(slotTwo).toContain("跳槽位测试论文");
    expect(slotTwo).not.toContain('data-action="create-paper"');
    expect(html).not.toContain("请先使用前面的论文槽");
  });

  it("renders reviewing and published workstation states without editable controls", () => {
    const base = createAdmittedTestState();
    const draft = {
      ...createDraftPaper(2, 0),
      title: "状态测试论文",
      idea: 8,
      experiment: 7,
      writing: 6,
      submittedIdea: 9,
      submittedExperiment: 8,
      submittedWriting: 7,
      target: "A" as const,
    };
    const reviewing = {
      ...draft,
      status: "reviewing" as const,
      reviewMonthsLeft: 2,
      submittedMonth: 2,
      submittedYear: 1,
    };
    const reviewingHtml = renderApp({
      ...base,
      papers: [reviewing],
      selectedPaperId: reviewing.id,
    }, createDefaultAccountProfile());

    expect(reviewingHtml).toContain("审稿中");
    expect(reviewingHtml).toContain('class="paper-card-header paper-review-card-header"');
    expect(reviewingHtml).toContain("A类 · WWW审稿中");
    expect(reviewingHtml).toContain("剩余 2 月");
    expect(reviewingHtml).not.toContain('class="paper-review-meta"');
    expect(reviewingHtml).not.toContain("投稿已进入审稿流程");
    expect(reviewingHtml).not.toContain("结果将在 2 个月后结算");
    expect(reviewingHtml).toContain('data-action="withdraw-paper"');
    expect(reviewingHtml).toContain(">撤稿</button>");
    expect(reviewingHtml).toMatch(/paper-review-card-header[\s\S]*data-action="withdraw-paper"/);
    expect(reviewingHtml).not.toContain('class="paper-card-terminal-action"');
    expect(reviewingHtml).toContain('class="paper-score-total"');
    expect(reviewingHtml).toContain('<small>总分</small><strong>21</strong>');
    expect(reviewingHtml).not.toContain('data-action="research-paper"');
    expect(reviewingHtml).not.toContain('data-action="submit-paper"');

    const published = attachPaperPublication({
      ...reviewing,
      status: "published" as const,
      reviewMonthsLeft: 0,
    });
    const publishedHtml = renderApp({
      ...base,
      papers: [published],
      selectedPaperId: published.id,
    }, createDefaultAccountProfile());

    expect(publishedHtml).toContain("A 类 · 已发表");
    expect(publishedHtml).toContain("录用 24 分");
    expect(publishedHtml).toContain("引用 0");
    expect(publishedHtml).not.toContain("已发表，推广与引用统计请在成果页查看");
  });

  it("renders compact research results and the selected paper", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");
    state = {
      ...state,
      year: 3,
      month: 1,
      totalMonths: 25,
      totalResearchScore: 61,
      totalCitations: 18,
      citationHistoryByYear: { 2023: 3, 2024: 6 },
      papers: [
        createPublishedPaper(0, "C 论文一号", "C", 15, 3, 14),
        createPublishedPaper(1, "A 论文唯一", "A", 24, 7, 22),
        createPublishedPaper(2, "C 论文二号", "C", 18, 8, 16, true),
      ],
      externalPublications: [],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      currentResearchPaperIndex: 1,
    });

    expect((html.match(/data-ui-research-index=/g) ?? []).length).toBe(3);
    expect(html).not.toContain("data-ui-research-filter");
    expect((html.match(/data-ui-research-authorship=/g) ?? []).length).toBe(0);
    expect(html).toContain("A 论文唯一");
    expect(html).not.toContain('class="research-paper-grade');
    expect(html).toContain('class="research-paper-author is-player"');
    expect(html).toContain('class="research-paper-venue"');
    expect(html).not.toContain("一作：");
    expect(html).not.toContain("合作 1 篇");
    expect(html).toContain('data-ui-research-sort="year"');
    expect(html).toContain('data-ui-research-sort="citations"');
    expect(html.indexOf('data-ui-research-sort="citations"')).toBeLessThan(html.indexOf('data-ui-research-sort="year"'));
    expect(html).toContain("💡 小提示：引用按月结算；会议开会或挂 arXiv 后开始被引，期刊接收后直接开始；引用受热度、影响力和录用类型倍率影响。点击展开看细则");
    expect(html).toContain('id="research-current-title">A 论文唯一</h3>');
    expect(html).toContain('id="citation-profile-title">引用统计</h3>');
    expect(html.indexOf('id="citation-profile-title"')).toBeLessThan(html.indexOf('id="research-current-title"'));
    expect(html).toContain('class="citation-count-strip"');
    expect(html).toContain("2023 年至今");
    expect(html).toMatch(/<strong>61<\/strong>\s*<small>科研分<\/small>/);
    expect(html).toMatch(/<strong>18<\/strong><small>引用<\/small>/);
    expect(html).toMatch(/<strong>3<\/strong><small>h 指数<\/small>/);
    expect(html).toContain("i10 指数");
    expect(html).toContain('class="citation-venue-grid research-global-summary"');
    expect(html).toContain('class="research-promotion-block"');
    expect(html).toContain('data-action="promote-paper"');
    expect(html).toContain('data-promotion-id="arxiv"');
    expect(html).toContain('data-promotion-id="github"');
    expect(html).toContain('data-promotion-id="xiaohongshu"');
    expect(html).toMatch(/<strong>1<\/strong>\s*<small>A（4分）<\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>B（2分）<\/small>/);
    expect(html).toMatch(/<strong>2<\/strong>\s*<small>C（1分）<\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>Nature（20分）<\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>NMI（10分）<\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>PAMI（5分）<\/small>/);
    expect(html).toContain('title="2023 年：3 次引用"');
    expect(html).toContain('title="2024 年：6 次引用"');
    expect(html).toContain('title="2025 年：9 次引用"');

    const firstOnlyHtml = renderApp(state, createDefaultAccountProfile(), {
      researchAuthorshipFilter: "first",
    });
    expect((firstOnlyHtml.match(/data-ui-research-index=/g) ?? []).length).toBe(2);
    expect(firstOnlyHtml).not.toContain("C 论文二号");

    const coauthorOnlyHtml = renderApp(state, createDefaultAccountProfile(), {
      researchAuthorshipFilter: "coauthor",
    });
    expect((coauthorOnlyHtml.match(/data-ui-research-index=/g) ?? []).length).toBe(1);
    expect(coauthorOnlyHtml).toContain("C 论文二号");

    const fullyPromotedState = {
      ...state,
      papers: state.papers.map((paper) => paper.publication
        ? {
            ...paper,
            publication: {
              ...paper.publication,
              promotions: { arxiv: true, github: true, xiaohongshu: true },
            },
          }
        : paper),
    };
    const fullyPromotedHtml = renderApp(fullyPromotedState, createDefaultAccountProfile());
    expect(fullyPromotedHtml).not.toContain('class="research-promotion-block"');
    expect(fullyPromotedHtml).not.toContain('data-promotion-id="arxiv"');
    expect(fullyPromotedHtml).not.toContain('data-promotion-id="github"');
    expect(fullyPromotedHtml).not.toContain('data-promotion-id="xiaohongshu"');
    expect(fullyPromotedHtml).not.toContain('class="research-current-promotions"');
  });

  it("renders every citation factor for a paper added from the debug bar", () => {
    const state = dispatchAction(createAdmittedTestState(), "debug-add-paper", {
      debugPaperTarget: "A",
      debugPaperAuthorship: "first",
    });
    const paper = state.externalPublications[0]!;
    expect(paper.publication?.citations).toBe(0);
    const conference = getConferenceInfo(paper.submittedMonth!, paper.target!, paper.submittedYear!);
    const html = renderApp(state, createDefaultAccountProfile(), { currentResearchPaperIndex: 0 });

    expect(html).toContain(`class="research-paper-title" title="${paper.title}">${paper.title}</strong>`);
    expect(html).toContain(`title="${conference.fullName} (${conference.name})"`);
    expect(html).toContain(`(${conference.name})`);
    expect(html).not.toContain('class="research-paper-grade');
    expect(html).not.toContain('class="research-paper-tags"');
    expect(html).not.toContain('class="research-detail-kicker"');
    expect(html).toContain('class="research-paper-row-stat" aria-label="引用');
    expect(html).toContain('class="research-paper-row-stat" aria-label="年份');
  });

  it("shows the highly cited label after a paper title", () => {
    const base = createAdmittedTestState();
    const paper = createPublishedPaper(0, "高被引测试论文", "C", 20, 140);
    const published = {
      ...paper,
      publication: { ...paper.publication!, highlyCited: true },
    };
    const html = renderApp({ ...base, papers: [published], externalPublications: [] }, createDefaultAccountProfile());

    expect(html).toContain('class="research-paper-achievement">🏆ESI高被引</span>');
    expect(html.indexOf("高被引测试论文")).toBeLessThan(html.indexOf("🏆ESI高被引"));
  });

  it("paginates the research paper list without rendering a scrollbar", () => {
    const base = createAdmittedTestState();
    const papers = Array.from({ length: 6 }, (_, index) => createPublishedPaper(
      index,
      `分页论文${index + 1}`,
      index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C",
      10,
      index,
    ));
    const firstPageHtml = renderApp({ ...base, papers, externalPublications: [] }, createDefaultAccountProfile());

    expect(firstPageHtml).toContain('class="research-pagination"');
    expect(firstPageHtml).toContain('data-ui-research-page="5"');
    expect((firstPageHtml.match(/class="research-paper-row(?:"|\s)/g) ?? []).length).toBe(5);
    const firstPageListStart = firstPageHtml.indexOf('<div class="research-switch-btns research-paper-list"');
    const firstPageListEnd = firstPageHtml.indexOf('</section>', firstPageListStart);
    const firstPageList = firstPageHtml.slice(firstPageListStart, firstPageListEnd);
    expect(firstPageList).toContain("分页论文6");
    expect(firstPageList).not.toContain("分页论文1");

    const secondPageHtml = renderApp({ ...base, papers, externalPublications: [] }, createDefaultAccountProfile(), {
      currentResearchPaperIndex: 5,
    });
    const secondPageListStart = secondPageHtml.indexOf('<div class="research-switch-btns research-paper-list"');
    const secondPageListEnd = secondPageHtml.indexOf('</section>', secondPageListStart);
    const secondPageList = secondPageHtml.slice(secondPageListStart, secondPageListEnd);
    expect(secondPageList).toContain("分页论文1");
    expect(secondPageList).not.toContain("分页论文6");
  });

  it("generates a fresh lead name for unlinked coauthor papers and keeps the player in the middle", () => {
    const state = {
      ...createAdmittedTestState(),
      playerName: "李旭旭",
      selectedAdvisorName: "李旭霖",
      papers: [createPublishedPaper(0, "合作论文测试", "B", 20, 4, 20, true)],
      externalPublications: [],
    };
    const html = renderApp(state, createDefaultAccountProfile());
    const row = html.match(/<button\s+class="research-paper-row[\s\S]*?合作论文测试[\s\S]*?<\/button>/)?.[0] ?? "";
    const authors = row.match(/<span class="research-paper-authors">([\s\S]*?)<span class="research-paper-venue"/)?.[1] ?? "";

    expect(authors).toMatch(/^<span class="research-paper-author">[^<]+<\/span>/);
    expect(authors).toContain('<strong class="research-paper-author is-player">Li XX</strong>');
    expect(authors).toContain('<span class="research-paper-author">Li XL</span>');
    expect(authors).not.toContain("Collaborator");
    expect(authors).not.toContain("Advisor");
    expect(authors).not.toContain(">Ni<");
  });

  it("renders the compact research empty state without filter controls", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");
    state = {
      ...state,
      totalResearchScore: 0,
      totalCitations: 0,
      papers: [],
      externalPublications: [],
    };

    const html = renderApp(state, createDefaultAccountProfile(), { currentResearchPaperIndex: 0 });

    expect(html).not.toContain("data-ui-research-filter");
    expect((html.match(/data-ui-research-authorship=/g) ?? []).length).toBe(0);
    expect(html).toContain("暂无已发表论文");
    expect(html).toContain("引用按月结算");
    expect(html).not.toContain("成果说明");
    expect(html).not.toContain("ABC 为会议");
    expect(html).not.toContain("data-ui-research-index=");
  });

  it("renders current event choices as clickable resolve buttons", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: state.eventQueue[0]?.id ?? null,
    });
    const eventButtonsBlock = html.match(/<div class="event-content-buttons" id="event-content-buttons">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(html).toContain('class="event-content-close"');
    expect(html).toContain('<span class="new-time-item new-time-enrollment" id="new-time-month">入学前</span>');
    expect(html).not.toContain('id="new-time-year"');
    expect(html).not.toContain('id="new-time-remaining"');
    expect(html).not.toContain('class="new-time-display-toggle"');
    expect(html).not.toContain("待开学");
    expect(html).not.toContain('id="new-time-season"');
    expect(html).toContain('class="event-scene-tabs"');
    expect(html).toContain('class="event-scene-tab is-active"');
    expect(html).toContain('data-ui-event-scene-index="0"');
    expect(eventButtonsBlock).toContain('class="event-choice-btn event-action-btn"');
    expect(html).toMatch(/你叫<mark class="event-name-highlight">[^<]+<\/mark>，是计算机类专业学生/);
    expect(eventButtonsBlock).toContain('data-action="resolve-event"');
    expect(eventButtonsBlock).toMatch(/data-event-id="[^"]+"/);
    expect(eventButtonsBlock).toMatch(/data-event-choice-id="[^"]+"/);
    expect(eventButtonsBlock).not.toContain("disabled");
  });

  it("highlights the advisor name in the advisor information event", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const openingEvent = state.eventQueue[0];
    if (!openingEvent) throw new Error("opening event missing");

    state = dispatchAction(state, "resolve-event", {
      eventId: openingEvent.id,
      eventChoiceId: "before-grad-school-open-advisor-info",
    });
    const advisorEvent = state.eventQueue.find((event) => event.id === "before-grad-school-advisor-info");
    if (!advisorEvent) throw new Error("advisor information event missing");
    const advisorName = advisorEvent.description.split("\n")[0]?.split(" · ")[0];
    if (!advisorName) throw new Error("advisor name missing");

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: advisorEvent.id,
    });

    expect(html).toContain(`<mark class="event-name-highlight">${advisorName}</mark> · 讲师`);
  });

  it("renders the action point badge with a footprint icon", () => {
    const html = renderApp(createAdmittedTestState(), createDefaultAccountProfile());

    expect(html).toContain(`class="workstation-action-points-icon"`);
  });

  it("renders unaffordable event choices as disabled buttons", () => {
    const initial = createAdmittedTestState();
    const state = {
      ...initial,
      eventQueue: [createEventQueueItem({
        id: "disabled-choice-event",
        title: "费用选择",
        description: "测试不可用选项。",
        source: "random" as const,
        blocking: true,
        deadlineMonths: 0,
        chainId: "disabled-choice-event",
        stage: "act1" as const,
        choices: [{
          id: "disabled-choice",
          label: "付费处理",
          outcome: "金币不足。",
          disabledReason: "金币不足 4，无法处理。",
          effects: {},
        }],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "disabled-choice-event",
    });
    const eventButtonsBlock = html.match(/<div class="event-content-buttons" id="event-content-buttons">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(eventButtonsBlock).toContain('disabled aria-disabled="true"');
    expect(eventButtonsBlock).toContain('title="金币不足 4，无法处理。"');
    expect(eventButtonsBlock).not.toContain('data-action="resolve-event"');
  });

  it("omits the event action footer when a displayed stage has no choices", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "no-choice-event",
        title: "仅供查看",
        description: "这一幕没有操作。",
        source: "fixed",
        blocking: false,
        deadlineMonths: 0,
        chainId: "no-choice-event",
        stage: "act1",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "no-choice-event",
    });
    expect(html).toContain("这一幕没有操作。");
    expect(html).not.toContain('id="event-content-buttons"');
  });

  it("renders resolved event stages as clickable scene tabs", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "act2-event",
        title: "Act 2",
        description: "Current stage.",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "history-chain",
        stage: "act2",
        choices: [{ id: "continue", label: "Continue", outcome: "Continue.", effects: {} }],
        history: [{
          title: "Act 1",
          description: "Resolved stage.",
          choices: [
            { id: "left", label: "Left", outcome: "Left result." },
            { id: "right", label: "Right", outcome: "Right result." },
          ],
          selectedChoiceId: "right",
        }],
      }, 1)],
    };

    const currentHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "act2-event",
    });
    expect(currentHtml).toContain("Act 2");
    expect(currentHtml).toContain('class="event-scene-tabs"');
    expect(currentHtml).toContain('data-ui-event-scene-index="0"');
    expect(currentHtml).toContain('data-ui-event-scene-index="1"');
    expect(currentHtml).toContain('aria-current="step"');
    expect(currentHtml).toContain('data-lucide="chevron-right"');
    expect(currentHtml).not.toContain("data-ui-event-history-nav");
    expect(currentHtml).toContain('data-action="resolve-event"');

    const historyHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "act2-event",
      activeEventHistoryIndex: 0,
    });
    const historyButtons = historyHtml.match(/<div class="event-content-buttons" id="event-content-buttons">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(historyHtml).toContain("Act 1");
    expect(historyHtml).toContain('class="event-scene-tab is-active"');
    expect(historyHtml).not.toContain("当时结果");
    expect(historyButtons.match(/\sdisabled\s/g)).toHaveLength(2);
    expect(historyButtons).not.toContain('data-action="resolve-event"');
    expect(historyButtons).toContain('class="event-choice-btn event-action-btn is-selected"');
    expect(historyButtons).toContain('aria-label="已选择"');
    expect(historyButtons.indexOf(">Left</span>")).toBeLessThan(historyButtons.indexOf(">Right</span>"));
  });

  it("renders inline settlement details in a dedicated result row", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "inline-settlement-event",
        title: "结算展示",
        description: "你送出一份礼物。\n\n机制结算\n金币 -1。\n导师好感 +1。",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "inline-settlement-event",
        stage: "result",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "inline-settlement-event",
    });
    const summary = html.match(/<div class="event-settlement-summary">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(html).not.toContain("机制结算");
    expect(html.match(/class="event-settlement-summary"/g)).toHaveLength(1);
    expect(summary).toContain('<span class="event-settlement-label">结果</span>');
    expect(summary).not.toContain('<span class="event-settlement-label">条件</span>');
    expect(summary).toContain('<span class="event-settlement-item">金币 -1</span>');
    expect(summary).toContain('<span class="event-settlement-divider" aria-hidden="true">|</span>');
    expect(summary).toContain('<span class="event-settlement-item">导师好感 +1</span>');
    expect(summary).not.toContain("。");
  });

  it("separates a resolved condition from its result effects", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "conditional-settlement-event",
        title: "条件结算",
        description: "导师来参加组会。\n\n机制结算\n导师到场｜SAN -2｜导师好感 +1。",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "conditional-settlement-event",
        stage: "result",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "conditional-settlement-event",
    });
    expect(html).toContain('<span class="event-settlement-label">条件</span>');
    expect(html).toContain('<span class="event-settlement-item">导师到场</span>');
    expect(html).toContain('<span class="event-settlement-label">结果</span>');
    expect(html).toContain('<span class="event-settlement-item">SAN -2</span>');
    expect(html).toContain('<span class="event-settlement-item">导师好感 +1</span>');
  });

  it("omits no-op settlement results while retaining their condition", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "no-op-result",
        title: "组会汇报 ➜ 你的选择 ➜ 摸鱼划水",
        description: "导师临时没有到场。\n\n机制结算\n导师缺席｜无事发生。",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "random-6",
        stage: "result",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "no-op-result",
    });
    expect(html).toContain('<span class="event-settlement-item">导师缺席</span>');
    expect(html).not.toContain('<span class="event-settlement-item">无事发生</span>');
    expect(html).not.toContain('<span class="event-settlement-label">结果</span>');
  });

  it("omits an empty settlement box for a pure no-op result", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "pure-no-op-result",
        title: "同门合作 ➜ 你的选择 ➜ 拒绝合作",
        description: "这次没有继续合作。\n\n机制结算\n无事发生。",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "random-10",
        stage: "result",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "pure-no-op-result",
    });
    expect(html).not.toContain('class="event-settlement-summary"');
  });

  it("renders event emphasis, emoji, and standalone dividers", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "formatted-event-description",
        title: "排版展示",
        description: "组里准备添置 **💻 GPU 服务器**。\n\n---\n\n你更支持哪一种？",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "formatted-event-description",
        stage: "act1",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "formatted-event-description",
    });

    expect(html).toContain("<strong>💻 GPU 服务器</strong>");
    expect(html).toContain('<hr class="event-description-divider" role="separator">');
    expect(html).not.toContain("**");
  });

  it("combines separate settlement paragraphs into the same summary", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "paragraph-settlement-event",
        title: "结算展示",
        description: [
          "你确认了新的安排。",
          "机制结算",
          "科研上限 +5",
          "导师科研资源 +2",
        ].join("\n\n"),
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "paragraph-settlement-event",
        stage: "result",
        choices: [],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "paragraph-settlement-event",
    });
    const summary = html.match(/<div class="event-settlement-summary">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(html).not.toContain("机制结算");
    expect(html.match(/class="event-settlement-summary"/g)).toHaveLength(1);
    expect(summary).toContain("科研上限 +5");
    expect(summary).toContain("导师科研资源 +2");
  });

  it("names the three pre-enrollment scenes consistently", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices[0]?.id,
    });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices.find((choice) => (
        choice.effects.fixedEventResolution?.kind === "advisor-confirm"
      ))?.id,
    });

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: state.eventQueue[0]?.id ?? null,
    });
    const pendingEventList = html.match(/id="pending-event-list">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? "";
    const todoPreview = html.match(/id="new-todo-preview">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] ?? "";

    expect(html).toContain(">读研之始</button>");
    expect(html).toContain(">导师信息</button>");
    expect(html).toContain(">正式录取</button>");
    expect(pendingEventList).toContain('<span class="event-title">读研之始</span>');
    expect(pendingEventList).not.toContain("event-type-badge");
    expect(pendingEventList).not.toContain("➜");
    expect(todoPreview).not.toContain('<strong class="todo-title">读研之始</strong>');
    expect(todoPreview).not.toContain("➜");
    expect(html).not.toContain("data-ui-event-history-nav");
  });

  it("renders all three Teacher's Day scenes in current and historical views", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem(createTeachersDayEvent(state), 1)],
      eventHistory: [],
    };

    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices[0]?.id,
    });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices.find((choice) => choice.id.includes("teachers-day-gift"))?.id,
    });

    const currentHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: state.eventQueue[0]?.id ?? null,
    });
    expect(currentHtml).toContain(">教师节</button>");
    expect(currentHtml).toContain(">你的选择</button>");
    expect(currentHtml).toContain(">礼物送达</button>");

    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices[0]?.id,
    });
    const completedEvent = state.eventHistory.find((event) => event.chainId === "teachers-day");
    const historyHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventHistoryId: completedEvent?.id ?? null,
    });
    expect(completedEvent?.stages).toHaveLength(3);
    expect(historyHtml).toContain(">教师节</button>");
    expect(historyHtml).toContain(">你的选择</button>");
    expect(historyHtml).toContain(">礼物送达</button>");
  });

  it("renders single-choice history as disabled with its selected check", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "single-current",
        title: "Current",
        description: "Current stage.",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "single-chain",
        stage: "act2",
        choices: [{ id: "continue", label: "Continue", outcome: "Continue.", effects: {} }],
        history: [{
          title: "Previous",
          description: "Previous stage.",
          choices: [{ id: "next", label: "Next", outcome: "Next." }],
          selectedChoiceId: "next",
        }],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "single-current",
      activeEventHistoryIndex: 0,
    });
    const historyButtons = html.match(/<div class="event-content-buttons" id="event-content-buttons">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(historyButtons).toMatch(/\sdisabled\s/);
    expect(historyButtons).toContain("is-selected");
    expect(historyButtons).not.toContain('data-action="resolve-event"');
    expect(historyButtons).toContain('aria-disabled="true"');
    expect(historyButtons).toContain('aria-label="已选择"');
  });

  it("keeps the close button available for result-stage events", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "result-event",
        title: "Result Event",
        description: "Result stage.",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "result-chain",
        stage: "result",
        choices: [{ id: "confirm", label: "Confirm", outcome: "Done.", effects: {} }],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "result-event",
    });

    expect(html).toContain('data-ui-close-event-content aria-label="关闭事件详情">×</button>');
    expect(html).not.toContain('data-ui-close-event-content aria-label="关闭事件详情" hidden');
  });

  it("keeps pending events in the right rail and completed events in the central log", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices[0]?.id,
    });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices.find((choice) => (
        choice.effects.fixedEventResolution?.kind === "advisor-confirm"
      ))?.id,
    });
    state = dispatchAction(state, "resolve-event", {
      eventId: state.eventQueue[0]?.id,
      eventChoiceId: state.eventQueue[0]?.choices[0]?.id,
    });

    const completedEvent = state.eventHistory[0];
    expect(completedEvent?.stages).toHaveLength(3);

    const listHtml = renderApp(state, createDefaultAccountProfile());
    expect(listHtml).toContain('id="pending-event-list"');
    expect(listHtml).toContain("教师节");
    expect(listHtml).toContain(`data-ui-open-event-history-id="${state.log.find((entry) => entry.eventHistoryId === completedEvent?.id)?.eventHistoryId}"`);
    expect(listHtml).not.toContain('data-ui-event-list-tab=');
    expect(listHtml).not.toContain("前往科研");
    expect(listHtml).not.toContain("前往人际");
    expect(listHtml).not.toContain("进入下一月");
    expect(listHtml).not.toContain('id="new-right-log-panel"');

    const historyHtml = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventHistoryId: completedEvent?.id ?? null,
    });
    const historyButtons = historyHtml.match(/<div class="event-content-buttons" id="event-content-buttons">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(historyHtml).toContain(">读研之始</button>");
    expect(historyHtml).toContain(">导师信息</button>");
    expect(historyHtml).toContain(">正式录取</button>");
    expect(historyButtons).toContain('disabled aria-disabled="true"');
    expect(historyButtons).not.toContain('data-action="resolve-event"');
    expect(historyButtons).toContain('aria-label="已选择"');
  });

  it("paginates pending events instead of scrolling the right rail", () => {
    const base = createAdmittedTestState();
    const eventQueue = Array.from({ length: 6 }, (_, index) => createEventQueueItem({
      id: `pending-page-${index + 1}`,
      title: `待办事件${index + 1}`,
      description: "分页测试",
      source: "random" as const,
      blocking: true,
      deadlineMonths: 0,
      chainId: `pending-page-${index + 1}`,
      stage: "act1" as const,
      choices: [{ id: "confirm", label: "确认", outcome: "完成", effects: {} }],
    }, 1));
    const state = { ...base, eventQueue };

    const firstPage = renderApp(state, createDefaultAccountProfile(), { activePendingPage: 0 });
    const secondPage = renderApp(state, createDefaultAccountProfile(), { activePendingPage: 1 });
    const firstPending = firstPage.match(/class="new-calendar-section new-pending-event-section"([\s\S]*?)<\/aside>/)?.[1] ?? "";
    const secondPending = secondPage.match(/class="new-calendar-section new-pending-event-section"([\s\S]*?)<\/aside>/)?.[1] ?? "";

    expect(firstPending).toContain('data-pending-page-index="0"');
    expect(firstPending).toContain('data-pending-page-count="2"');
    expect(firstPending).toContain("待办事件1");
    expect(firstPending).toContain("待办事件5");
    expect(firstPending).not.toContain("待办事件6");
    expect(firstPending).toMatch(/id="pending-nav-prev"[^>]*disabled/);
    expect(firstPending).not.toMatch(/id="pending-nav-next"[^>]*disabled/);
    expect(secondPending).toContain('data-pending-page-index="1"');
    expect(secondPending).toContain("待办事件6");
    expect(secondPending).not.toContain("待办事件1");
    expect(secondPending).not.toMatch(/id="pending-nav-prev"[^>]*disabled/);
    expect(secondPending).toMatch(/id="pending-nav-next"[^>]*disabled/);
  });

  it("renders character talents by default with switch buttons", () => {
    let state = createAdmittedTestState();

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-ui-talent-tab="character"');
    expect(html).toContain('data-ui-talent-tab="relation"');
    expect(html).toContain('data-ui-talent-tab="equip"');
    expect(html).toContain('data-talent-panel-tab="character"');
    expect(html).toContain('data-talent-item-id="character-role"');
    expect(html).toContain('data-talent-item-id="character-awaken"');
    expect(html).not.toContain('data-talent-item-id="strong-body"');
    expect(html).not.toContain('data-talent-item-id="ai-collaboration"');
  });

  it("renders relation and equip talent tabs from play ui state", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");

    const junior = createCustomFellowProgressProfile({
      type: "junior",
      gender: "male",
      startTotalMonths: state.totalMonths,
      name: "测试师弟",
      research: 4,
      affinity: 3,
    });

    state = {
      ...state,
      relationshipState: {
        ...state.relationshipState,
        occupiedSlots: 3,
        advisorCount: 1,
        juniorCount: 1,
        loverCount: 1,
      },
      fellowProgressState: [{ ...junior, id: "junior-talent-test", taskProgress: 18, relationProgress: 9 }],
      conferenceEncounterState: {
        ...state.conferenceEncounterState,
        metBigBullCoop: true,
        bigBullCooperation: true,
        bigBullDeepCount: 2,
        beautifulCount: 1,
        smartCount: 2,
      },
      conferenceCareerState: {
        ...state.conferenceCareerState,
        enterpriseCount: 3,
      },
      internshipState: {
        ...state.internshipState,
        active: true,
        remainingMonths: 4,
        experimentMultiplier: 1.25,
      },
      internshipCount: 1,
      loverState: {
        ...state.loverState,
        active: true,
        type: "smart",
      },
      loverProgressState: {
        ...state.loverProgressState,
        active: true,
        research: 5,
        intimacy: 12,
        completedTaskCount: 2,
      },
      researchCapacityState: {
        ...state.researchCapacityState,
        jointTrainingCitationCapBonus: 4,
      },
      shopState: {
        ...state.shopState,
        chairOwned: true,
        chairUpgrade: "advanced",
        chairSanRecovered: 7,
        keyboardOwned: true,
        monitorOwned: true,
        bikeOwned: true,
        bikeLevel: 1,
        ebikeOwned: true,
        bikeSanSpent: 12,
        bikeSanCapGains: 2,
        gpuLevel: 2,
      },
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
        machineUpgrade: "advanced",
        machineTrackedCoffeeCount: 24,
      },
      eventSupport: {
        ...state.eventSupport,
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: true,
      },
      eventCounters: {
        ...state.eventCounters,
        meetingCount: 8,
      },
    };

    const relationHtml = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "relation" });
    expect(relationHtml).toContain('data-talent-panel-tab="relation"');
    expect(relationHtml).toContain('data-talent-item-id="advisor"');
    expect(relationHtml).toContain('data-talent-item-id="fellow-junior-talent-test"');
    expect(relationHtml).toContain('data-talent-item-id="joint-training"');
    expect(relationHtml).toContain('每次想 idea +5、做实验 +5；导师科研资源 +2');
    expect(relationHtml).toContain('data-talent-item-id="internship"');
    expect(relationHtml).toContain('data-talent-item-id="lab-talent"');
    expect(relationHtml).toContain('data-talent-item-id="lover"');

    const equipHtml = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "equip" });
    expect(equipHtml).toContain('data-talent-panel-tab="equip"');
    expect(equipHtml).toContain('data-talent-item-id="full-gear"');
    expect(equipHtml).toContain('data-talent-item-id="ai-collaboration"');
    const fullGearCard = getTalentCardHtml(equipHtml, "full-gear");
    const inactiveAiCard = getTalentCardHtml(equipHtml, "ai-collaboration");
    expect(fullGearCard).toContain("激活后夏冬 SAN +1");
    expect(fullGearCard.match(/class="talent-item-metric"/g) ?? []).toHaveLength(3);
    for (const itemName of ["小电驴", "遮阳伞", "羽绒服"]) {
      expect(fullGearCard).toMatch(new RegExp(`<span>${itemName}</span>\\s*<strong>✅</strong>`));
    }
    expect(inactiveAiCard).toContain("激活后可额外进行 1 次科研操作；不消耗行动点，但 SAN 消耗 +2");
    expect(inactiveAiCard).toContain('class="talent-item-tag is-inactive">未激活</span>');
    expect(inactiveAiCard.match(/class="talent-item-metric"/g) ?? []).toHaveLength(3);
    for (const modelLabel of ["GPT/Claude", "AI2", "AI3"]) {
      expect(inactiveAiCard).toMatch(new RegExp(`<span>${modelLabel}</span>\\s*<strong>—</strong>`));
    }
    expect(inactiveAiCard).not.toContain("条件：");
    expect(inactiveAiCard).not.toContain("当前已启用");
    expect(equipHtml).toContain('data-talent-item-id="chair"');
    expect(equipHtml).toContain("累计回复 SAN");
    expect(equipHtml).toContain("+7");
    expect(equipHtml).not.toContain('data-talent-item-id="monitor"');
    expect(equipHtml).not.toContain('data-talent-item-id="keyboard"');
    expect(equipHtml).not.toContain('<strong class="talent-item-title">2K 显示器</strong>');
    expect(equipHtml).not.toContain('<strong class="talent-item-title">机械键盘</strong>');
    expect(equipHtml).toContain('data-talent-item-id="bike"');
    expect(equipHtml).toContain("累计消耗 SAN");
    expect(equipHtml).toContain("SAN 上限成长");
    expect(equipHtml).toContain("+2/+3");
    expect(equipHtml).toContain('data-talent-item-id="coffee-machine"');
    expect(equipHtml).toContain("累计生产");
    expect(equipHtml).toContain("24 杯");
    expect(equipHtml).toContain("效果提升");
    expect(equipHtml).toContain("24/50 杯");
    expect(equipHtml).toContain('data-talent-item-id="gpu"');
    expect(equipHtml).toContain("RTX 2080 Ti");
    expect(equipHtml).not.toContain('data-talent-item-id="game-controller"');
    expect(equipHtml).not.toContain('data-talent-item-id="parasol"');
    expect(equipHtml).not.toContain('data-talent-item-id="down-jacket"');
    expect(equipHtml).not.toContain('data-talent-item-id="badminton-racket"');

    const collaborationState = {
      ...state,
      aiShopState: {
        subscriptions: {
          ...state.aiShopState.subscriptions,
          gpt: {
            ...state.aiShopState.subscriptions.gpt,
            active: true,
            modelId: getAiModelForTotalMonths(state.totalMonths, "gpt").id,
          },
          deepseek: {
            ...state.aiShopState.subscriptions.deepseek,
            active: true,
            modelId: getAiModelForTotalMonths(state.totalMonths, "deepseek").id,
          },
          doubao: {
            ...state.aiShopState.subscriptions.doubao,
            active: true,
            modelId: getAiModelForTotalMonths(state.totalMonths, "doubao").id,
          },
        },
      },
    };
    const activeEquipHtml = renderApp(collaborationState, createDefaultAccountProfile(), { activeTalentTab: "equip" });
    const activeAiCard = getTalentCardHtml(activeEquipHtml, "ai-collaboration");
    expect(activeAiCard).toContain('class="talent-item-tag is-active">已激活</span>');
    for (const modelLabel of ["GPT/Claude", "AI2", "AI3"]) {
      expect(activeAiCard).toMatch(new RegExp(`<span>${modelLabel}</span>\\s*<strong>✅</strong>`));
    }
  });

  it("merges pending events and future previews into one paginated agenda", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });

    const reviewingPaper = {
      ...createDraftPaper(state.totalMonths, 0),
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 2,
      submittedIdea: 4,
      submittedExperiment: 4,
      submittedWriting: 4,
      submittedMonth: state.month,
      submittedYear: state.year,
    };
    state = {
      ...state,
      papers: [reviewingPaper],
      eventQueue: [createEventQueueItem({
        id: "before-grad-school-qualification",
        title: "读研之始",
        description: "学院确认了推免资格。",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "before-grad-school",
        stage: "act1",
        choices: [{ id: "before-grad-school-open-advisor-info", label: "联系导师", outcome: "进入下一步。", effects: {} }],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile());
    expect(html).toContain("new-pending-event-section");
    expect(html).not.toContain("事件预告");
    expect(html).toContain("教师节");
    expect(html).toContain("1月后");
    expect(html).toContain('data-ui-open-event-id="before-grad-school-qualification"');
    expect(html).toContain('data-pending-page-index="0"');
    expect(html).toContain('data-pending-page-count="1"');
  });

  it("paginates the shared pending agenda five items at a time", () => {
    const state = {
      ...createAdmittedTestState(),
      degree: "phd" as const,
      phdStartYear: 4,
      year: 3,
      month: 8,
      totalMonths: 32,
      maxMonths: 68,
      eventQueue: [],
    };
    const firstPage = renderApp(state, createDefaultAccountProfile(), { activePendingPage: 0 });
    const secondPage = renderApp(state, createDefaultAccountProfile(), { activePendingPage: 1 });

    expect(firstPage).toContain('data-pending-page-index="0"');
    expect(firstPage).toContain('data-pending-page-count="2"');
    expect(firstPage).toMatch(/id="pending-nav-prev"[^>]*disabled/);
    expect(firstPage).not.toMatch(/id="pending-nav-next"[^>]*disabled/);
    expect((firstPage.match(/class="todo-item todo-preview-item/g) ?? [])).toHaveLength(5);
    expect(firstPage).toContain("年会");
    expect(firstPage).toContain("指导新生");

    expect(secondPage).toContain('data-pending-page-index="1"');
    expect(secondPage).not.toMatch(/id="pending-nav-prev"[^>]*disabled/);
    expect(secondPage).toMatch(/id="pending-nav-next"[^>]*disabled/);
    expect(secondPage).toContain("国奖评选");
  });

  it("renders the shared next-month settlement preview", () => {
    let state = createAdmittedTestState();
    state = {
      ...state,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...state.player, san: 10 },
      buffs: [{
        id: "monthly-stipend-preview",
        name: "临时补贴",
        source: "测试事件",
        timing: "monthly",
        remainingMonths: 2,
        monthlyStats: { money: 3 },
      }],
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-effect-id="next-month-money"');
    expect(html).toContain('data-effect-id="next-month-san"');
    expect(html).toContain("SAN +2");
    expect(html).toContain("自然回复：每月 +1");
    expect(html).toContain("季节：秋季 +1");
    expect(html).toContain("金币 +4");
    expect(html).toContain("硕士工资：每月 +1");
    expect(html).toContain("测试事件：临时补贴 +3");
    expect(html).not.toContain("基础开销");
  });

  it("renders the current season in monthly effects", () => {
    const base = createAdmittedTestState();
    const renderMonth = (month: number) => renderApp({
      ...base,
      year: 1,
      month,
      totalMonths: month,
    }, createDefaultAccountProfile());

    const autumnHtml = renderMonth(2);
    const winterHtml = renderMonth(5);
    const springHtml = renderMonth(8);
    const summerHtml = renderMonth(11);

    expect(autumnHtml).not.toContain("月初 SAN+1（已结算）");
    expect(winterHtml).not.toContain("月初 SAN-1（已结算）");
    expect(springHtml).toContain("主动操作 SAN-1");
    expect(springHtml).toContain('data-effect-sources="[&quot;春季&quot;]"');
    expect(summerHtml).toContain("主动操作 SAN+1");
    expect(summerHtml).toContain('data-effect-sources="[&quot;夏季&quot;]"');
  });

  it("renders equipment-neutralized seasonal effects", () => {
    const base = createAdmittedTestState();
    const summerHtml = renderApp({
      ...base,
      month: 11,
      totalMonths: 11,
      eventSupport: { ...base.eventSupport, hasParasol: true },
    }, createDefaultAccountProfile());
    const winterHtml = renderApp({
      ...base,
      month: 5,
      totalMonths: 5,
      eventSupport: { ...base.eventSupport, hasDownJacket: true },
    }, createDefaultAccountProfile());

    expect(summerHtml).toContain("夏季炎热已抵消");
    expect(summerHtml).toContain('data-effect-sources="[&quot;遮阳伞&quot;]"');
    expect(summerHtml).not.toContain("主动操作 SAN+1");
    expect(winterHtml).not.toContain("冬季寒冷已抵消");
    expect(winterHtml).not.toContain("月初 SAN-1（已结算）");
  });

  it("does not render a season effect before enrollment", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain("主动操作 SAN-1");
    expect(html).not.toContain("主动操作 SAN+1");
    expect(html).not.toContain("月初 SAN+1（已结算）");
    expect(html).not.toContain("月初 SAN-1（已结算）");
  });

  it("merges all shop subscription charges into the next-month money preview", () => {
    const initial = createAdmittedTestState();
    const state = {
      ...initial,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...initial.player, money: 10, san: 10 },
      coffeeState: {
        ...initial.coffeeState,
        machineOwned: true,
        subscriptionEnabled: true,
      },
      aiShopState: {
        subscriptions: {
          ...initial.aiShopState.subscriptions,
          gpt: { ...initial.aiShopState.subscriptions.gpt, enabled: true },
        },
      },
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-effect-id="next-month-money"');
    expect(html).toContain("金币 -3");
    expect(html).toContain("商店订阅：冰美式续费 -2");
    expect(html).toContain("商店订阅：GPT-3.5续费 -2");
  });

  it("renders PhD pressure separately while keeping natural recovery", () => {
    const state = {
      ...createAdmittedTestState(),
      degree: "phd" as const,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...createAdmittedTestState().player, san: 10 },
      buffs: [{
        id: "phd-pressure",
        name: "读博压力",
        source: "转博",
        timing: "permanent" as const,
        remainingMonths: null,
        monthlyStats: { san: -1 },
        description: "博士阶段的长期压力使每月 SAN -1",
      }],
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain("每月 SAN -1");
    expect(html).toContain("转博 · 永久：博士阶段的长期压力使每月 SAN -1");
    expect(html).toContain('data-effect-id="next-month-san"');
    expect(html).toContain("SAN +1");
    expect(html).toContain("自然回复：每月 +1");
    expect(html).toContain("季节：秋季 +1");
    expect(html).toContain("转博：读博压力 -1");
  });

  it("renders only active buffs and describes next-action lifetime accurately", () => {
    const state = {
      ...createAdmittedTestState(),
      buffs: [
        {
          id: "permanent-idea",
          name: "每次想 idea +1分",
          source: "事件",
          timing: "permanent" as const,
          remainingMonths: null,
          actionEffects: { idea: { bonus: 1 } },
        },
        {
          id: "next-idea",
          name: "下次想 idea +5分",
          source: "事件",
          timing: "next-action" as const,
          remainingMonths: null,
          actionEffects: { idea: { bonus: 5, extraActions: 1 } },
        },
        {
          id: "expired-monthly",
          name: "过期补贴",
          source: "测试事件",
          timing: "monthly" as const,
          remainingMonths: 0,
          monthlyStats: { money: 3 },
        },
      ],
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain("idea +1分");
    expect(html).not.toContain("每次 idea +1分");
    expect(html).toContain("事件 · 永久");
    expect(html).toContain("idea +5分");
    expect(html).toContain("idea +1次");
    expect(html).not.toContain(">下次想 idea +5分<");
    expect(html).toContain("事件 · 对应效果触发后消耗");
    expect(html).not.toContain("过期补贴");
    expect(html).not.toContain('data-effect-id="next-month-money"');
  });

  it("shows nominal month-start SAN recovery and its source even at the cap", () => {
    const admittedState = createAdmittedTestState();
    const state = {
      ...admittedState,
      year: 1,
      month: 1,
      totalMonths: 1,
      player: { ...admittedState.player, san: admittedState.sanCap },
    };
    const html = renderApp(state, createDefaultAccountProfile());

    const sanEffect = html.match(/<button[^>]*data-effect-id="next-month-san"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(sanEffect).toContain(">SAN +2</button>");
    expect(sanEffect).toContain("自然回复：每月 +1");
    expect(sanEffect).toContain("季节：秋季 +1");
    expect(sanEffect).not.toContain("SAN +0");
  });

  it("merges equivalent Buffs, preserves their sources and hides non-mechanical records", () => {
    const state = {
      ...createAdmittedTestState(),
      buffs: [
        {
          id: "idea-a",
          name: "每次想 idea +1分",
          source: "不断学习",
          timing: "permanent" as const,
          remainingMonths: null,
          actionEffects: { idea: { bonus: 1 } },
        },
        {
          id: "idea-b",
          name: "每次想 idea +1分",
          source: "联合培养",
          timing: "permanent" as const,
          remainingMonths: null,
          actionEffects: { idea: { bonus: 1 } },
        },
        {
          id: "next-penalty",
          name: "灵感枯竭",
          source: "连续操作",
          timing: "next-action" as const,
          remainingMonths: null,
          actionEffects: { idea: { multiplier: 0.5 } },
        },
        {
          id: "status-only",
          name: "论文状态已更新",
          source: "测试",
          timing: "permanent" as const,
          remainingMonths: null,
        },
      ],
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain("idea +2分");
    expect(html).not.toContain("每次 idea");
    expect(html).toContain("不断学习 · 永久");
    expect(html).toContain("联合培养 · 永久");
    expect(html).toContain("idea 总分 ×0.5");
    expect(html).toContain('class="effect-chip is-debuff"');
    expect(html).not.toContain("论文状态已更新");
  });

  it("renders a reduced SAN cap without adding it to the effect bar", () => {
    const state = {
      ...createAdmittedTestState(),
      player: { ...createAdmittedTestState().player, san: 18 },
      sanCap: 18,
      buffs: [],
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-player-stat="san"');
    expect(html).toContain('data-stat-cap="18"');
    expect(html).toContain('<span class="new-attr-value">18/18</span>');
    const permanentEffects = html.match(/id="new-permanent-effect-list">([\s\S]*?)<\/div>/u)?.[1] ?? "";
    expect(permanentEffects.trim()).toBe("");
  });

  it("renders a draggable log timeline with the latest month selected by default", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain("事件记录");
    expect(html).toContain('class="event-timeline-track"');
    expect(html).toContain('data-ui-log-page-index="0"');
    expect(html).toContain('data-ui-log-page-index="1"');
    expect(html).toContain('class="event-timeline-marker is-current"');
    expect(html).not.toContain('data-ui-log-nav=');
  });

  it("switches all date labels to the 2023 enrollment calendar", () => {
    let state = createAdmittedTestState();
    state = {
      ...state,
      year: 1,
      month: 4,
      totalMonths: 4,
      log: [{ id: "calendar-december", month: 4, text: "日期测试。" }],
    };
    const account = {
      ...createDefaultAccountProfile(),
      dateDisplayMode: "calendar" as const,
    };
    const decemberHtml = renderApp(state, account);

    expect(decemberHtml).toContain('id="new-time-year">2023年</span>');
    expect(decemberHtml).toContain('id="new-time-month">12月</span>');
    expect(decemberHtml).toMatch(/class="new-time-display-toggle"[\s\S]*data-date-display-mode="academic"/);
    expect(decemberHtml).not.toContain("显示设置");

    const januaryHtml = renderApp({
      ...state,
      month: 5,
      totalMonths: 5,
      log: [{ id: "calendar-january", month: 5, text: "日期测试。" }],
    }, account);
    expect(januaryHtml).toContain('id="new-time-year">2024年</span>');
    expect(januaryHtml).toContain('id="new-time-month">1月</span>');
  });

  it("renders all debug buff fields in the effect panel", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    state = dispatchAction(state, "debug-add-all-buffs");
    const logLength = state.log.length;
    state = dispatchAction(state, "debug-add-all-buffs");
    const html = renderApp(state, createDefaultAccountProfile());

    expect(state.log).toHaveLength(logLength);
    expect(state.buffs.map((buff) => buff.id)).toEqual(expect.arrayContaining(createDebugBuffs().map((buff) => buff.id)));
    const permanentEffects = html.match(/id="new-permanent-effect-list">([\s\S]*?)<\/div>/u)?.[1] ?? "";
    const monthlyEffects = html.match(/id="new-monthly-effect-list">([\s\S]*?)<\/div>/u)?.[1] ?? "";
    const nextMonthEffects = html.match(/id="new-next-month-effect-list">([\s\S]*?)<\/div>/u)?.[1] ?? "";
    expect(permanentEffects).not.toContain("每月 SAN +1");
    expect(permanentEffects).not.toContain("每月 金币 +1");
    expect(monthlyEffects).not.toContain("每月 SAN -2");
    expect(nextMonthEffects).toContain("自然回复：每月 +1");
    expect(nextMonthEffects).toContain("指导师弟师妹：长期带教 -2");
    expect(nextMonthEffects).not.toContain("羽毛球获胜");
    expect(state.buffs.some((buff) => buff.id === "debug-buff-strong-body")).toBe(false);
    expect(nextMonthEffects).toContain("硕士工资：每月 +1");
    expect(nextMonthEffects).toContain("金币 +1");
    expect(nextMonthEffects).toContain('data-effect-id="next-month-san"');
    expect(nextMonthEffects).toContain('data-effect-id="next-month-money"');
    expect(html).not.toContain("调试工具");
    expect(html).not.toContain("基础规则、导师待遇、羽毛球冠军");
    expect(html).toContain("自动idea+4分");
    expect(html).toContain("自动论文+2分");
    expect(html).not.toContain("每 12 月自动合作论文");
    expect(html).toContain("主动操作 SAN ×1.5");
    expect(html).toContain("看论文 SAN -1");
    expect(html).toContain("手动看论文 +1次");
    expect(html).toContain("自动看论文 +1次");
    expect(html).toContain("人际操作 SAN -1");
    expect(html).toContain("实验 总分 ×0.25");
    expect(html).toContain("引用×0.75");
    expect(html).not.toContain("下篇论文宣传×1.1");
    expect(html).toContain("下次效果");

    expect(html).not.toMatch(/class="effect-chip[^"]*"[^>]*title=/u);
    const buckets = buildBuffDisplayBuckets(state.buffs);
    const aiIdeaEffect = buckets.monthly.find((item) => item.id === "monthly:action:idea:bonus:ai");
    expect(aiIdeaEffect?.sources).toEqual([
      "商店 GPT-6-Astra · 剩余 1 月",
      "商店 豆包 Seed 4 · 剩余 1 月",
    ]);
    expect(aiIdeaEffect?.sources.join("、")).not.toContain("肚子虚弱");

    const illnessEffect = buckets.monthly.find((item) => item.label === "主动操作 SAN ×1.5");
    expect(illnessEffect?.sources).toEqual(["肚子虚弱 · 持续生效"]);
    expect(illnessEffect?.sources.join("、")).not.toContain("商店");

    expect(buckets.monthly.find((item) => item.label === "每月 SAN -2")).toBeUndefined();
  });

  it("renders badminton victory recovery alongside month-start Buff effects", () => {
    const admittedState = dispatchAction(createAdmittedTestState(), "next-month");
    const state = {
      ...admittedState,
      eventSupport: { ...admittedState.eventSupport, hasStrongBodyTalent: true },
      buffs: createDebugBuffs(),
    };
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('id="new-next-month-effect-list"');
    expect(html).toContain("羽毛球获胜：羽毛球 +1");
    expect(html).toContain("指导师弟师妹：长期带教 -2");
    expect(html).toContain('data-effect-id="next-month-san"');
  });

  it("moves long-term mentoring details into the relationship talent panel", () => {
    const state = {
      ...createAdmittedTestState(),
      buffs: createDebugBuffs().filter((buff) => buff.id === "debug-buff-mentoring"),
    };
    const html = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "relation" });

    expect(html).toContain('data-talent-item-id="mentoring-debug-buff-mentoring"');
    expect(html).toContain("每月 SAN -2；每 12 月自动生成一篇非一作合作论文");
    expect(html).not.toContain("每 12 月自动合作论文");
  });

  it("renders every gameplay module during development before enrollment", () => {
    let state = createAdmittedTestState();
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain('class="section-empty play-module-lock-state">入学后开放<\/div>');
    expect(html).toContain('class="shop-ai-note panel-tip-note">💡 小提示：订购仅在当月生效；游戏内 AI 模型按学年更新，效果和价格随之变化，更新后你需要重新开启自动续费</p>');
    expect((html.match(/class="shop-ai-note panel-tip-note"/g) ?? [])).toHaveLength(1);
    expect(html.indexOf('class="shop-tab-btns"')).toBeLessThan(html.indexOf('class="shop-ai-note panel-tip-note"'));
    expect(html).not.toContain('class="shop-heading-icon"');
    expect(html).not.toContain('class="shop-title">校园商店</strong>');
    expect(html).toContain('id="workstation-paper-grid"');
    expect(html).not.toContain('class="rel-switch-btns"');
    expect(html).not.toContain('<div class="section-header" hidden>');
    expect(html).toContain('class="workstation-action-toolbar"');
    expect(html).toContain('class="workstation-action-points"');
    expect(html).not.toContain('class="conference-overview-card"');
    expect(html).not.toContain("workstation-conference-btn");
    expect(html).toContain('data-ui-shop-tab="ai"');
    expect(html).toContain('id="relationship-section"');
    expect(html).toContain('class="rel-card-grid"');
    expect(html.match(/class="rel-card /g) ?? []).toHaveLength(6);
    expect(html).toContain('class="rel-lover-lock-text">恋爱后解锁</span>');
    expect(html).not.toContain('data-ui-relationship-index=');
    expect(html).toContain('id="research-section"');
    expect(html).not.toContain('class="research-dashboard-header"');
    expect(html).toContain('class="research-compact-layout"');
    expect(html).not.toContain('class="research-filter-stack"');
    expect(html).toContain('class="research-switch-btns research-paper-list"');
    expect(html).not.toContain('data-action="advance-advisor-task"');
  });

  it("renders relationship slots and per-card actions after enrollment", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");

    const junior = createCustomFellowProgressProfile({
      type: "junior",
      gender: "female",
      startTotalMonths: state.totalMonths,
      name: "小李",
      research: 4,
      affinity: 3,
    });

    state = {
      ...state,
      selectedAdvisorName: "李旭霖",
      relationshipState: {
        ...state.relationshipState,
        occupiedSlots: 2,
        juniorCount: 1,
      },
      fellowProgressState: [{
        ...junior,
        id: "junior-test",
        taskProgress: 18,
        taskMax: 60,
        relationProgress: 11,
        relationMax: 40,
        canInteract: true,
      }],
    };

    const advisorHtml = renderApp(state, createDefaultAccountProfile());
    expect(advisorHtml).toContain('id="rel-card-grid"');
    expect((advisorHtml.match(/class="rel-card /g) ?? [])).toHaveLength(6);
    expect(advisorHtml).toContain("社交达到6");
    expect(advisorHtml).toContain("合群");
    expect(advisorHtml).toContain("💕");
    expect(advisorHtml).toContain("恋爱后解锁");
    expect(advisorHtml).not.toContain('class="rel-switch-badge is-task"');
    expect(advisorHtml).toContain("做项目（SAN-5）");
    expect(advisorHtml).toContain(">交流</button>");
    expect(advisorHtml).not.toContain('data-action="advance-advisor-task"');
    expect(advisorHtml).toContain("李旭霖 / 讲师");
    expect(advisorHtml).not.toContain("副教授");
    expect(advisorHtml).toContain("任务进度（满后：亲和度 +1、科研资源 +1、项目奖励）");

    const fellowHtml = renderApp(state, createDefaultAccountProfile(), { activeRelationshipIndex: 1 });
    expect(fellowHtml).toContain("师弟/师妹");
    expect(fellowHtml).toContain("小李");
    expect(fellowHtml).not.toContain('data-relationship-id=');
    expect(fellowHtml).not.toContain('data-action="advance-fellow-task"');
    expect(fellowHtml).toContain("任务进度（满后：亲和度 +1、idea +4）");
    expect(fellowHtml).toContain("关系积累（+");
  });

  it("keeps the relationship header aligned to the single-card layout", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");

    const html = renderApp(state, createDefaultAccountProfile());
    const relationshipSection = html.match(/id="relationship-section"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/)?.[1] ?? "";

    expect(relationshipSection).not.toContain('class="rel-helper-actions is-empty"');
    expect(relationshipSection).toContain('id="rel-card-grid"');
    expect((relationshipSection.match(/class="rel-card /g) ?? [])).toHaveLength(6);
    expect(relationshipSection).not.toContain('class="rel-helper-chip"');
    expect(relationshipSection).not.toContain("data-rel-helper-action=");
  });

  it("filters transient blocked hints out of the game log panel", () => {
    let state = createAdmittedTestState();
    state = dispatchAction(state, "next-month");
    state = {
      ...state,
      log: [
        { id: "blocked-hint", month: 1, text: "必须先处理待办事件。" },
        ...state.log,
      ],
    };

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain("必须先处理待办事件。");
    expect(html).toContain("正式入学，研究生生涯开始了。");
  });

  it("renders completed event logs as compact title and result summaries", () => {
    let state = createAdmittedTestState();
    state = {
      ...state,
      log: [
        { id: "teacher-idea", month: 1, text: "教师节：你发了教师节祝福，导师分享了一个想法，下次想 idea +3。" },
        { id: "teacher-errand", month: 1, text: "教师节：你被叫去财务处跑腿，SAN -3。" },
        { id: "advisor-resource", month: 1, text: "联合培养：导师科研资源 +2，亲和度 +1。" },
        { id: "graduation-requirement", month: 1, text: "读研之始：毕业要求已经写进培养方案。" },
      ],
    };

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('<div class="event"><span class="log-entry-title">教师节</span></div>');
    expect(html).toContain('<div class="result">你发了教师节祝福，导师分享了一个想法，下次想 <span class="log-value-change is-positive">idea +3</span>。</div>');
    expect(html).toContain('<div class="result">你被叫去财务处跑腿，<span class="log-value-change is-negative">SAN -3</span>。</div>');
    expect(html).toContain('<span class="log-value-change is-positive">科研资源 +2</span>');
    expect(html).toContain('<span class="log-value-change is-positive">亲和度 +1</span>');
    expect(html).toMatch(/class="log-entry">\s*<div class="event"><span class="log-entry-title">读研之始<\/span><\/div>\s*<div class="result">/);
  });

  it("makes only event-linked log entries openable", () => {
    const state = {
      ...createAdmittedTestState(),
      eventHistory: [{
        id: "teachers-day-history",
        chainId: "teachers-day",
        source: "fixed" as const,
        completedAtTotalMonths: 1,
        completedAtYear: 1,
        completedAtMonth: 1,
        stages: [{
          title: "教师节",
          description: "送出礼物。",
          choices: [{ id: "tea", label: "茶叶", outcome: "导师收下。" }],
          selectedChoiceId: "tea",
        }],
      }],
      log: [
        { id: "event-log", month: 1, text: "教师节：茶叶：导师收下了茶叶。", eventHistoryId: "teachers-day-history" },
        { id: "system-log", month: 1, text: "月初结算：SAN +1。" },
      ],
    };

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('class="log-entry event-history-log-entry" type="button" data-ui-open-event-history-id="teachers-day-history"');
    expect(html).toContain('<div class="event"><span class="log-entry-title">教师节 - 茶叶</span></div>');
    expect(html).toContain('<div class="result">导师收下了茶叶。</div>');
    expect(html).not.toContain('茶叶：导师收下了茶叶');
    expect(html).toMatch(/<div class="log-entry[^"]*">\s*<div class="event"><span class="log-entry-title">月初结算<\/span><\/div>\s*<div class="result">/u);
  });

  it("keeps the event timeline visible beneath an open event", () => {
    const state = {
      ...createAdmittedTestState(),
      eventQueue: [createEventQueueItem({
        id: "open-event",
        title: "当前事件",
        description: "需要处理的事件。",
        source: "random" as const,
        blocking: true,
        deadlineMonths: 0,
        chainId: "open-event",
        stage: "act1" as const,
        choices: [{ id: "continue", label: "继续", outcome: "完成。", effects: {} }],
      }, 1)],
      log: [{ id: "existing-log", month: 1, text: "上月记录：SAN +1。" }],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      isEventContentOpen: true,
      activeEventId: "open-event",
    });

    expect(html).toContain('class="event-content-box"');
    expect(html).toContain('class="event-log-panel log-panel"');
    expect(html).toContain("上月记录");
    expect(html.indexOf('class="event-log-header-row"')).toBeLessThan(html.indexOf('class="event-content-box"'));
    expect(html.indexOf('class="event-content-box"')).toBeLessThan(html.indexOf('class="log-content event-log-content"'));
  });

  it("keeps structured log results in one compact strip", () => {
    const state = {
      ...createAdmittedTestState(),
      log: [{
        id: "admission-summary",
        month: 1,
        text: "读研之始：你加入课题组。\n待遇：硕士 1 金币/月\n科研分：C 类 +1",
      }],
    };

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html.match(/class="log-result-line"/g)).toHaveLength(3);
    expect(html.match(/class="log-result-divider"/g)).toHaveLength(2);
    expect(html).toContain('<span class="log-result-line">你加入课题组。</span>');
    expect(html).toContain('<span class="log-result-line">待遇：硕士 1 金币/月</span>');
    expect(html).toContain('<span class="log-result-line">科研分：C 类 +1</span>');
  });

  it("gives title-only logs the same readable title treatment", () => {
    const state = {
      ...createAdmittedTestState(),
      log: [{ id: "system-only", month: 1, text: "操作已完成。" }],
    };

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('<span class="log-entry-title log-entry-title-only">操作已完成。</span>');
  });

  it("renders every log entry in the selected month", () => {
    let state = createAdmittedTestState();
    state = {
      ...state,
      year: 1,
      month: 1,
      totalMonths: 1,
      log: Array.from({ length: 15 }, (_, index) => ({
        id: `complete-log-${index}`,
        month: 1,
        text: `完整日志 ${index + 1}`,
      })),
    };

    const html = renderApp(state, createDefaultAccountProfile());
    expect(html.match(/class="log-entry"/g)).toHaveLength(15);
    expect(html).toContain("完整日志 1");
    expect(html).toContain("完整日志 15");
  });

  it("renders a dedicated ending panel instead of interactive game tabs", () => {
    const state = {
      ...createAdmittedTestState(),
      phase: "finished" as const,
      ending: "master" as const,
      graduationScoreTarget: 1,
      totalResearchScore: 1,
      eventQueue: [],
    };

    const html = renderApp(state, createDefaultAccountProfile());
    expect(html).toContain('data-phase="finished"');
    expect(html).toContain("硕士毕业");
    expect(html).toContain("科研分 1/1");
    expect(html).toContain('data-action="restart-game"');
    expect(html).toContain('data-action="reset-game"');
    expect(html).not.toContain('data-action="next-month"');
    expect(html).not.toContain('data-action="force-next-month"');
  });

  it("previews mentor assignment only before the first PhD September", () => {
    const base = {
      ...createAdmittedTestState(),
      degree: "phd" as const,
      phdStartYear: 3,
      year: 2,
      month: 12,
      totalMonths: 24,
      eventQueue: [],
    };
    expect(buildFutureTodoPreviewItems(base).map((item) => item.title)).toContain("指导新生");
    expect(buildFutureTodoPreviewItems({ ...base, year: 3, month: 12, totalMonths: 36 }).map((item) => item.title)).not.toContain("指导新生");
    expect(buildFutureTodoPreviewItems({ ...base, degree: "master", phdStartYear: null }).map((item) => item.title)).not.toContain("指导新生");
  });
});
