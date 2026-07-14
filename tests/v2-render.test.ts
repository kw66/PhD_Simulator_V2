import { describe, expect, it } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { createDefaultAccountProfile } from "../src/core/v2-account";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createDraftPaper, markPaperReviewing } from "../src/core/v2-paper-rules";

function createPublishedPaper(
  index: number,
  title: string,
  target: "A" | "B" | "C" | null,
  acceptedScore: number,
  citations: number,
  effectiveScore = acceptedScore,
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

  return {
    ...published,
    publication: {
      ...published.publication!,
      citations,
      effectiveScore,
    },
  };
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
    expect(html).toContain('class="lobby-role-card-metric is-level"');
    expect(html).toContain('class="lobby-role-card-metric-label">等级</span>');
    expect(html).toContain('class="lobby-role-card-metric-value">0</strong>');
    expect(html).toContain('class="lobby-role-card-metric is-runs"');
    expect(html).toContain('class="lobby-role-card-metric-label">通关</span>');
    expect(html).toContain('class="lobby-role-card-metric is-achievement"');
    expect(html).toContain('class="lobby-role-card-metric-label">成就</span>');
    expect(html).not.toContain('class="lobby-role-card-metric-value-unit"');
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
    expect(html).toContain("总引用");
    expect(html).toContain("Nature数量");
    expect(html).toContain("代表作引用");
    expect(html).toContain("代表作分数");
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
    expect(html).toContain("通关");
    expect(html).toContain("正位");
    expect(html).toContain("逆位");
    expect(html).toContain("未解锁");
    expect(html).not.toContain('class="lobby-role-card-icon"');
    expect(html).not.toContain('class="lobby-role-card-mode"');
    expect(html).not.toContain('class="lobby-role-exp"');
    expect(html).not.toContain('class="lobby-role-card-meta-item"');
    expect(html).not.toContain('class="lobby-role-card-progress-item"');
    expect(html).not.toContain('class="lobby-role-card-progress-bar"');
    expect(html).not.toContain('class="lobby-role-card-run-text"');
    expect(html).not.toContain("📢");
    expect(html).not.toContain("角色描述");
    expect(html).toContain("从小镇一路做题做到这里");
    expect(html).not.toContain("天赋加点");
    expect(html).toContain("效果");
    expect(html).toContain("勤能补拙");
    expect((html.match(/>无效果</g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).toContain("经验");
    expect(html).toContain("0 / 20");
    expect(html).toContain('class="lobby-growth-exp-bar"');
    expect(html).toContain('class="lobby-growth-exp-detail-row"');
    expect(html).toContain("每局经验=科研分*获取倍率，当前倍率为1.0（完成成就可提升获取倍率）");
    expect(html).toContain("天赋点 0");
    expect(html).toContain(">重置</button>");
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
    expect(html).toContain("历史最高 0 / 30");
    expect(html).toContain("全面发展");
    expect(html).toContain("最佳单局：科研 0/6 · 社交 0/6 · 好感 0/6 · 金币 0/6");
    expect(html).toContain("0 / 6");
    expect(html).toContain("1 / 2");
    expect(html).not.toContain("渐生惰性");
    expect(html).not.toContain("购买办公椅并升级为人体工学椅");
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

    expect(html).toContain("天赋点+6");
    expect(html).toContain("转博时科研能力、社交能力、导师好感+50%（属性小数上取整）");
    expect(html).not.toContain("每当属性溢出时上限+1");
    expect(html).toContain("每月行动次数+0.1（小数累积，满1生效）");
    expect(html).not.toContain("第一个月有10次行动次数");
    expect(html).toContain("天赋点 0");
    expect(html).toContain('class="lobby-talent-allocation-effect"');
  });

  it("renders the max-level extra effect copy for normal talents", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 10;
    account.roleProgress.normal.passiveLevels.awakening = 10;
    account.roleProgress.normal.passiveLevels["hidden-awaken"] = 10;

    const html = renderApp(createInitialState(), account);

    expect(html).toContain("天赋点+10");
    expect(html).toContain("转博时科研能力、社交能力、导师好感+100%（属性小数上取整）；满级额外效果：每当属性溢出时上限+1");
    expect(html).toContain("每月行动次数+1.0（小数累积，满1生效）；满级额外效果：第一个月有10次行动次数");
  });

  it("renders the second achievement page for normal separately from the first five entries", () => {
    const account = createDefaultAccountProfile();
    account.lobbyRoleAchievementPage = 1;
    const html = renderApp(createInitialState(), account);

    expect(html).toContain("2 / 2");
    expect(html).toContain("渐生惰性");
    expect(html).toContain("购买办公椅并升级为人体工学椅");
    expect(html).toContain("经验+5，解锁怠惰·大多数角色");
    expect(html).toContain("最佳单局：办公椅 0/1 · 工学椅 0/1");
    expect(html).not.toContain("小有积蓄");
  });

  it("renders the second page with special tags and the last gender-paired rows", () => {
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "research-captain";
    account.lobbyRolePage = 1;
    const html = renderApp(createInitialState(), account);

    expect(html).toContain("统御者");
    expect(html).toContain("轮回者");
    expect(html).toContain("特殊");
    expect(html).toContain("2 / 2");
    expect(html).toContain("天选之人");
    expect((html.match(/data-action="select-role"/g) ?? []).length).toBe(4);
    expect((html.match(/class="lobby-role-row"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('class="lobby-role-card-placeholder"');
  });

  it("renders the unified desktop workbench shell after starting the game", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-phase="playing"');
    expect(html).toContain('data-scale-mode="fixed"');
    expect(html).toContain('class="play-stage-scale"');
    expect(html).toContain('class="play-stage"');
    expect(html).toContain("事件处理");
    expect(html).toContain("科研");
    expect(html).toContain("人际");
    expect(html).toContain("商店");
    expect(html).toContain("科研成果");
    expect(html).toContain("天赋");
    expect(html).toContain("设置");
    expect(html).toContain("下一月");
    expect(html).toContain('class="play-workbench"');
    expect(html).toContain("play-left-rail");
    expect(html).toContain("play-center-column");
    expect(html).toContain("play-right-rail");
    expect(html).toContain('class="new-attr-panel"');
    expect(html).toContain("SAN值");
    expect(html).toContain("永久效果");
    expect(html).toContain("本月效果");
    expect(html).toContain("下次效果");
    expect(html).toContain("下月初");
    expect((html.match(/class="new-effect-subtitle"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('data-effect-sources=');
    expect(html).toContain('data-effect-id="next-month-san"');
    expect(html).toContain('data-effect-id="next-month-gold"');
    expect(html).toContain("待办事件");
    expect(html).toContain("游戏日志");
    expect(html).toContain('id="log-nav-prev-year"');
    expect(html).toContain('id="log-nav-prev-month"');
    expect(html).toContain('id="log-nav-next-month"');
    expect(html).toContain('id="log-nav-next-year"');
    expect(html).toContain("待办事项");
    expect(html).toContain('class="event-panel"');
    expect(html).toContain('class="event-header-row"');
    expect(html).toContain('class="event-queue"');
    expect(html).toContain('class="event-content-box"');
    expect(html).toContain('class="event-card"');
    expect(html).toContain('data-ui-open-event-id=');
    expect(html).toContain('class="event-ddl-badge">期限 ');
    expect(html).not.toContain('class="event-card-row"');
    expect(html).not.toContain('class="event-card-preview"');
    expect(html).toContain('id="workstation-section"');
    expect(html).toContain('class="workstation-main-actions"');
    expect(html).toContain('class="paper-switch-btns"');
    expect(html).toContain('class="paper-current-card"');
    expect(html).toContain('class="conf-info-compact"');
    expect(html).toContain('id="shop-panel-col2"');
    expect(html).toContain('id="relationship-section"');
    expect(html).toContain('class="rel-switch-btns"');
    expect(html).toContain('class="rel-current-card"');
    expect(html).toContain('id="research-section"');
    expect(html).toContain('class="research-stats-mini"');
    expect(html).toContain('class="research-summary-bar"');
    expect(html).toContain('class="research-switch-btns"');
    expect(html).toContain('class="research-current-card"');
    expect(html).toContain('class="talent-panel"');
    expect(html).toContain('class="talent-items-list"');
    expect(html).toContain('class="settings-panel"');
    expect(html).toContain('id="settings-panel-content"');
    expect(html).toContain("属性调整");
    expect(html).toContain("事件触发");
    expect(html).toContain('class="settings-attr-grid"');
    expect(html).toContain('class="settings-event-grid"');
    expect(html).toContain('data-action="debug-adjust-stat"');
    expect(html).toContain('data-action="debug-shift-month"');
    expect(html).toContain('data-action="debug-trigger-event"');
    expect(html).toContain('data-event-id="conference"');
    expect(html).toContain('data-event-id="advisor-selection"');
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

  it("renders actionable shop tabs with buy sell and upgrade entry points", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    state = dispatchAction(state, "next-month");
    state = {
      ...state,
      player: { ...state.player, money: 80 },
      shopState: {
        ...state.shopState,
        gpuServersBought: 1,
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
    expect(aiHtml).toContain('data-ui-shop-tab="ai"');
    expect(aiHtml).toContain('data-action="buy-shop-item"');
    expect(aiHtml).toContain('data-shop-item-id="gpu_buy"');
    expect(aiHtml).toContain('data-action="sell-shop-item"');

    const coffeeHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    expect(coffeeHtml).toContain('data-ui-shop-tab="coffee"');
    expect(coffeeHtml).toContain('data-action="buy-coffee"');
    expect(coffeeHtml).toContain('data-action="buy-coffee-machine"');
    expect(coffeeHtml).toContain('data-action="sell-coffee-machine"');
    expect(coffeeHtml).toContain('data-action="upgrade-coffee-machine"');
    expect(coffeeHtml).toContain('data-event-id="automatic"');

    const outdoorHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "outdoor" });
    expect(outdoorHtml).toContain('data-ui-shop-tab="outdoor"');
    expect(outdoorHtml).toContain('data-action="upgrade-shop-item"');
    expect(outdoorHtml).toContain('data-shop-upgrade-id="bike-road"');
    expect(outdoorHtml).toContain('data-action="buy-support-item"');
    expect(outdoorHtml).toContain('data-support-item-id="parasol"');

    const miscHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "misc" });
    expect(miscHtml).toContain('data-ui-shop-tab="misc"');
    expect(miscHtml).toContain('data-support-item-id="badminton_racket"');
    expect(miscHtml).toContain('data-support-item-id="game_controller"');
    expect(miscHtml).toContain('class="shop-item-btns"');
  });

  it("renders workstation conference page, slot cards and graduation page from local ui state", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
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
      papers: [firstPaper],
      selectedPaperId: firstPaper.id,
      paperSlotsUnlocked: 2,
    };

    const conferenceHtml = renderApp(state, createDefaultAccountProfile(), {
      activeWorkstationPanelIndex: -1,
      conferenceMonthOffset: 1,
    });
    expect(conferenceHtml).toContain('data-ui-workstation-panel-index="-1"');
    expect(conferenceHtml).toContain('data-ui-conference-offset="-1"');
    expect(conferenceHtml).toContain('data-ui-conference-offset="1"');
    expect(conferenceHtml).toContain('class="conference-overview-card"');
    expect(conferenceHtml).toContain('class="conference-card"');

    const slotHtml = renderApp(state, createDefaultAccountProfile(), {
      activeWorkstationPanelIndex: 0,
    });
    expect(slotHtml).toContain('data-ui-workstation-panel-index="4"');
    expect(slotHtml).toContain(`data-paper-id="${firstPaper.id}"`);
    expect(slotHtml).toContain('data-action="idea"');
    expect(slotHtml).toContain('data-action="submit-c"');
    expect(slotHtml).toContain('class="paper-switch-badge is-ready"');

    const emptySlotHtml = renderApp(state, createDefaultAccountProfile(), {
      activeWorkstationPanelIndex: 1,
    });
    expect(emptySlotHtml).toContain("当前槽位为空");
    expect(emptySlotHtml).toContain('data-action="create-paper"');

    const graduationState = {
      ...state,
      year: 3,
      month: 7,
      totalMonths: 31,
      thesis: {
        ...state.thesis,
        started: true,
        progress: 68,
      },
      careerProgress: {
        ...state.careerProgress,
        academic: 120,
        internet: 80,
      },
    };

    const graduationHtml = renderApp(graduationState, createDefaultAccountProfile(), {
      activeWorkstationPanelIndex: 4,
    });
    expect(graduationHtml).toContain('class="paper-card graduation-progress-card"');
  });

  it("renders research results by the selected filter and current paper index", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      totalResearchScore: 61,
      totalCitations: 18,
      papers: [
        createPublishedPaper(0, "C 论文一号", "C", 15, 3, 14),
        createPublishedPaper(1, "A 论文唯一", "A", 24, 7, 22),
        createPublishedPaper(2, "C 论文二号", "C", 18, 8, 16),
      ],
      externalPublications: [],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      currentResearchPaperFilter: "C",
      currentResearchPaperIndex: 1,
    });
    const switchButtons = html.match(/<div class="research-switch-btns" id="research-switch-btns">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(html).toMatch(/class="grade-tag active"[^>]*data-ui-research-filter="C"/);
    expect(html).toContain("C:2篇");
    expect(html).toContain("A:1篇");
    expect((switchButtons.match(/data-ui-research-index=/g) ?? []).length).toBe(2);
    expect(switchButtons).toContain('data-ui-research-index="0"');
    expect(switchButtons).toContain('data-ui-research-index="1"');
    expect(html).toContain("C 论文二号");
    expect(html).toContain("档位 C 类");
    expect(html).toContain("中稿分 18");
    expect(html).toContain("倍率 ×1.50");
    expect(html).toContain("引用 8");
    expect(html).toContain("当前分 16");
    expect(html).not.toContain("A 论文唯一</span>");
  });

  it("renders research empty state when the current filter has no matching papers", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      totalResearchScore: 39,
      totalCitations: 10,
      papers: [
        createPublishedPaper(0, "C 论文一号", "C", 15, 3, 14),
        createPublishedPaper(1, "A 论文唯一", "A", 24, 7, 22),
      ],
      externalPublications: [],
    };

    const html = renderApp(state, createDefaultAccountProfile(), {
      currentResearchPaperFilter: "S",
      currentResearchPaperIndex: 0,
    });
    const switchButtons = html.match(/<div class="research-switch-btns" id="research-switch-btns">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(html).toMatch(/class="grade-tag active"[^>]*data-ui-research-filter="S"/);
    expect(html).toContain("S:0篇");
    expect(html).toContain("A:1篇");
    expect(html).toContain("C:1篇");
    expect(html).toContain("暂无符合当前筛选的论文");
    expect(switchButtons).not.toContain("data-ui-research-index=");
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
    expect(eventButtonsBlock).toContain('class="event-choice-btn event-action-btn"');
    expect(eventButtonsBlock).toContain('data-action="resolve-event"');
    expect(eventButtonsBlock).toMatch(/data-event-id="[^"]+"/);
    expect(eventButtonsBlock).toMatch(/data-event-choice-id="[^"]+"/);
    expect(eventButtonsBlock).not.toContain("disabled");
  });

  it("hides the close button for result-stage events", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "result-event",
        title: "Result Event",
        description: "Result stage.",
        preview: "result",
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

    expect(html).toContain('data-ui-close-event-content aria-label="关闭事件详情" hidden');
  });

  it("renders character talents by default with switch buttons", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-ui-talent-tab="character"');
    expect(html).toContain('data-ui-talent-tab="relation"');
    expect(html).toContain('data-ui-talent-tab="equip"');
    expect(html).toContain('data-talent-panel-tab="character"');
    expect(html).toContain('data-talent-item-id="character-role"');
    expect(html).toContain('data-talent-item-id="character-awaken"');
    expect(html).toContain('data-talent-item-id="strong-body"');
    expect(html).toContain('data-talent-item-id="finance-master"');
  });

  it("renders relation and equip talent tabs from play ui state", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    state = dispatchAction(state, "next-month");

    const junior = createCustomFellowProgressProfile({
      type: "junior",
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
      persistentExtraActions: {
        idea: 1,
        experiment: 2,
        writing: 1,
      },
      researchCapacityState: {
        ...state.researchCapacityState,
        jointTrainingCitationCapBonus: 4,
      },
      shopState: {
        ...state.shopState,
        chairOwned: true,
        chairUpgrade: "advanced",
        keyboardOwned: true,
        monitorOwned: true,
        monitorUpgrade: "dual",
        bikeOwned: true,
        bikeUpgrade: "ebike",
        gpuServersBought: 2,
      },
      coffeeState: {
        ...state.coffeeState,
        machineOwned: true,
        machineUpgrade: "advanced",
        machineTrackedCoffeeCount: 24,
      },
      readingState: {
        ...state.readingState,
        dualMonitorIdeaBonus: 3,
      },
      eventSupport: {
        ...state.eventSupport,
        hasGameController: true,
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: true,
      },
      eventCounters: {
        ...state.eventCounters,
        meetingCount: 8,
        pokerTotalEarnings: 12,
      },
    };

    const relationHtml = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "relation" });
    expect(relationHtml).toContain('data-talent-panel-tab="relation"');
    expect(relationHtml).toContain('data-talent-item-id="advisor"');
    expect(relationHtml).toContain('data-talent-item-id="fellow-junior-talent-test"');
    expect(relationHtml).toContain('data-talent-item-id="joint-training"');
    expect(relationHtml).toContain('data-talent-item-id="internship"');
    expect(relationHtml).toContain('data-talent-item-id="lab-talent"');
    expect(relationHtml).toContain('data-talent-item-id="lover"');

    const equipHtml = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "equip" });
    expect(equipHtml).toContain('data-talent-panel-tab="equip"');
    expect(equipHtml).toContain('data-talent-item-id="full-gear"');
    expect(equipHtml).toContain('data-talent-item-id="chair"');
    expect(equipHtml).toContain('data-talent-item-id="monitor"');
    expect(equipHtml).toContain('data-talent-item-id="keyboard"');
    expect(equipHtml).toContain('data-talent-item-id="bike"');
    expect(equipHtml).toContain('data-talent-item-id="coffee-machine"');
    expect(equipHtml).toContain('data-talent-item-id="gpu"');
    expect(equipHtml).toContain('data-talent-item-id="game-controller"');
    expect(equipHtml).toContain('data-talent-item-id="parasol"');
    expect(equipHtml).toContain('data-talent-item-id="down-jacket"');
    expect(equipHtml).toContain('data-talent-item-id="badminton-racket"');
  });

  it("renders the right todo rail with clickable current items and future previews", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });

    const reviewingPaper = {
      ...markPaperReviewing(createDraftPaper(state.totalMonths, 0), "C", state.month, state.year),
      reviewMonthsLeft: 2,
    };
    state = {
      ...state,
      papers: [reviewingPaper],
      eventQueue: [createEventQueueItem({
        id: "advisor-selection-act1",
        title: "保研抉择",
        description: "在几位导师之间做最后选择。",
        preview: "选择你的研究生导师",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "advisor-selection",
        stage: "act1",
        choices: [{ id: "advisor-selection-open", label: "继续", outcome: "进入下一步。", effects: {} }],
      }, 1)],
    };

    const html = renderApp(state, createDefaultAccountProfile());
    const todoPreviewBlock = html.match(/id="new-todo-preview">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div class="new-right-log-panel"/)?.[1] ?? "";

    expect(todoPreviewBlock).toContain('class="todo-item todo-preview-item todo-preview-current"');
    expect(todoPreviewBlock).toContain(`data-ui-open-event-id="${state.eventQueue[0]?.id}"`);
    expect(todoPreviewBlock).toContain("保研抉择");
    expect(todoPreviewBlock).toContain("剧情");
    expect(todoPreviewBlock).toContain('class="todo-item todo-preview-item todo-preview-future"');
    expect(todoPreviewBlock).toContain("论文结果");
    expect(todoPreviewBlock).toContain("2月后");
    expect(todoPreviewBlock).toContain("教师节");
    expect(todoPreviewBlock).toContain("1月后");
    expect(todoPreviewBlock).toContain("预告");
    expect(todoPreviewBlock).not.toContain("选择你的研究生导师");
    expect(todoPreviewBlock).not.toContain("在审论文将在该月返回结果。");
  });

  it("renders next-month gold sources with legacy income expense breakdown", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('data-effect-id="next-month-gold"');
    expect(html).toContain("收入：导师工资 +1");
    expect(html).toContain("支出：基础开销 -1");
    expect(html).toContain("净变化：+0");
  });

  it("renders log pagination with the latest month page by default", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    state = dispatchAction(state, "next-month");
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('id="log-time-header">第1年第1月<');
    expect(html).toContain('id="log-nav-prev-year" type="button" data-ui-log-nav="first"');
    expect(html).toContain('id="log-nav-prev-month" type="button" data-ui-log-nav="prev"');
    expect(html).toContain('id="log-nav-next-month" type="button" data-ui-log-nav="next" disabled');
    expect(html).toContain('id="log-nav-next-year" type="button" data-ui-log-nav="last" disabled');
  });

  it("renders consistent workstation, relationship, and shop locks before enrollment", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html.match(/class="section-empty play-module-lock-state">入学后开放<\/div>/g)).toHaveLength(3);
    expect(html).toContain('<span class="shop-title"><i class="panel-icon">💰</i> 商店</span>');
    expect(html).toContain('class="paper-switch-btns" id="paper-switch-btns" hidden');
    expect(html).toContain('class="rel-switch-btns" id="rel-switch-btns" hidden');
    expect(html).not.toContain('class="paper-card paper-card-empty"');
    expect(html).not.toContain("workstation-conference-btn");
    expect(html).not.toContain('data-ui-shop-tab="equipment"');
    expect(html).toContain('id="relationship-section"');
    expect(html).not.toContain('data-ui-relationship-index="0"');
    expect(html).not.toContain('data-action="advance-advisor-task"');
  });

  it("renders legacy-style relationship slots and per-card actions after enrollment", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    state = dispatchAction(state, "next-month");

    const junior = createCustomFellowProgressProfile({
      type: "junior",
      startTotalMonths: state.totalMonths,
      name: "小李",
      research: 4,
      affinity: 3,
    });

    state = {
      ...state,
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
    expect(advisorHtml).toContain('data-ui-relationship-index="0"');
    expect(advisorHtml).toContain('data-ui-relationship-index="1"');
    expect(advisorHtml).toContain('data-ui-relationship-index="2"');
    expect(advisorHtml).toContain('data-action="advance-advisor-task"');
    expect(advisorHtml).toContain('data-action="interact-advisor"');
    expect(advisorHtml).toContain("任务进度（满后：亲和度 +1、科研资源 +1、项目奖励）");

    const fellowHtml = renderApp(state, createDefaultAccountProfile(), { activeRelationshipIndex: 1 });
    expect(fellowHtml).toContain("师弟/师妹");
    expect(fellowHtml).toContain("小李");
    expect(fellowHtml).toContain('data-action="advance-fellow-task" data-relationship-id="junior-test"');
    expect(fellowHtml).toContain('data-action="interact-fellow" data-relationship-id="junior-test"');
    expect(fellowHtml).toContain("任务进度（满后：亲和度 +1、idea +4）");
    expect(fellowHtml).toContain("关系积累（+");
  });

  it("keeps the relationship header aligned to the legacy single-card layout", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
    state = dispatchAction(state, "next-month");

    const html = renderApp(state, createDefaultAccountProfile());
    const relationshipSection = html.match(/id="relationship-section">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] ?? "";

    expect(relationshipSection).toContain('class="rel-helper-actions is-empty"');
    expect(relationshipSection).toContain('id="rel-switch-btns"');
    expect(relationshipSection).toContain('id="rel-current-card"');
    expect(relationshipSection).not.toContain('class="rel-helper-chip"');
    expect(relationshipSection).not.toContain("data-rel-helper-action=");
  });

  it("filters transient blocked hints out of the game log panel", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "select-advisor", { advisorId: "level5" });
    state = dispatchAction(state, "start-game", { roleId: "normal", advisorId: "level5" });
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
});
