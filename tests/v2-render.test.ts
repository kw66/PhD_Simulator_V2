import { describe, expect, it, vi } from "vitest";

import { renderApp as renderAppWithAnimations } from "../src/app/v2-render";
import { getPlayHelpContext } from "../src/app/v2-play-help";
import type { PlayRenderUiState } from "../src/app/v2-render-types";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { createCustomFellowProgressProfile, getFellowName, getFellowResearchTopic } from "../src/core/v2-fellow-progression";
import { getFellowDiscussionSanCost } from "../src/core/v2-fellow-actions";
import { activateLover, getLoverName } from "../src/core/v2-lover-system";
import { LOVER_ROUTES, advanceLoverMonth, getLoverNextReward, getLoverRouteCost } from "../src/core/v2-lover-progression";
import { pickStableRandomName } from "../src/core/v2-random-name";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getConferenceInfo, getConferenceLocation } from "../src/core/v2-conference-catalog";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getRoleLobbyAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { createDebugBuffs } from "../src/core/v2-debug-tools";
import { animationNumberAttributes, renderAnimatedNumber } from "../src/app/v2-render-animation";
import type { AdvisorGrantId, GameState, RelationshipKind } from "../src/core/v2-types";

function renderApp(...args: Parameters<typeof renderAppWithAnimations>): string {
  return renderAppWithAnimations(...args)
    .replace(/<span class="rel-inline-icon" aria-hidden="true">[^<]*<\/span>/g, "")
    .replace(/<span class="animated-number" data-animate-key="[^"]*" data-animate-number="[^"]*">([^<]*)<\/span>/g, "$1")
    .replace(/ data-animate-(?:key|number|bar)="[^"]*"/g, "");
}

function getHelpText(uiState: PlayRenderUiState): string {
  return getPlayHelpContext(uiState).pages.map((page) => page.summary + page.body).join("\n")
    .replace(/<[^>]*>/g, "").replace(/\s+/g, "");
}

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

function getRelationshipCardHtml(html: string, type: RelationshipKind): string {
  const markerIndex = html.indexOf(`data-relationship-type="${type}"`);
  if (markerIndex < 0) return "";
  const cardStart = html.lastIndexOf("<article", markerIndex);
  const cardEnd = html.indexOf("</article>", markerIndex);
  return cardStart >= 0 && cardEnd >= 0 ? html.slice(cardStart, cardEnd + "</article>".length) : "";
}

function createRelationshipCardTestState(taskUsedThisMonth = false): GameState {
  const state = dispatchAction(createAdmittedTestState(), "next-month");
  return {
    ...state,
    totalMonths: 12,
    selectedAdvisorName: "李旭霖",
    player: { ...state.player, social: 6, favor: 3 },
    relationshipState: {
      ...state.relationshipState,
      unlockedSlots: 5,
      occupiedSlots: 4,
      advisorCount: 1,
      seniorCount: 1,
      juniorCount: 1,
      peerCount: 1,
      loverCount: 1,
    },
    advisorProgressState: {
      ...state.advisorProgressState,
      researchAccumulation: 7,
      funding: 4,
    },
    fellowProgressState: (["senior", "junior", "peer"] as const).map((type) => ({
      ...createCustomFellowProgressProfile({
        type,
        gender: "female",
        name: { senior: "小明", junior: "小李", peer: "小刚" }[type],
        startTotalMonths: 4,
        research: 7,
        affinity: 4,
      }),
      taskProgress: 15,
      taskUsedThisMonth,
    })),
    loverState: {
      ...state.loverState,
      active: true,
      name: "林知远",
      type: "smart",
      gender: "female",
      startTotalMonths: 4,
    },
    loverProgressState: {
      ...state.loverProgressState,
      active: true,
      research: 7,
      intimacy: 4,
      taskProgress: 25,
      taskMax: 100,
      relationProgress: 14,
      relationMax: 40,
      canInteract: true,
      taskUsedThisMonth,
      routes: {
        play: { progress: 25, completed: 0 },
        study: { progress: 60, completed: 1 },
        shopping: { progress: 95, completed: 2 },
      },
    },
  };
}

function readAnimationNumbers(html: string): Map<string, number> {
  const entries = [...html.matchAll(/data-animate-key="([^"]+)" data-animate-number="([^"]+)"/g)];
  expect(new Set(entries.map((entry) => entry[1])).size).toBe(entries.length);
  entries.forEach((entry) => expect(Number.isFinite(Number(entry[2]))).toBe(true));
  return new Map(entries.map((entry) => [entry[1]!, Number(entry[2])]));
}

describe("v2 explicit render animation markers", () => {
  it("prepends decorative relationship icons while retaining names, labels and numeric markers", () => {
    const html = renderAppWithAnimations(createRelationshipCardTestState());
    const advisor = getRelationshipCardHtml(html, "advisor");
    const fellow = getRelationshipCardHtml(html, "senior");
    const lover = getRelationshipCardHtml(html, "lover");
    const icon = (symbol: string) => `<span class="rel-inline-icon" aria-hidden="true">${symbol}</span>`;
    expect(advisor).toContain('<strong class="rel-name">李旭霖 🎓 讲师</strong>');
    expect(advisor).not.toContain("李旭霖 / 讲师");
    expect(advisor).toContain(`${icon("📋")}在研基金<strong>`);
    expect(advisor).toContain(`${icon("💡")}科研积累</span>`);
    expect(advisor).toContain('data-relationship-tooltip data-tooltip="科研积累：');
    expect(advisor).toContain(`<span class="rel-detail-label">${icon("💰")}科研经费</span>`);
    expect(advisor).toContain(`<span class="rel-action-label">${icon("🛠️")}做横向</span>`);
    for (const card of [fellow, lover]) {
      expect(card).toContain(`<span class="rel-detail-label">${icon("💡")}科研</span>`);
      expect(card).toContain('class="rel-known-time"');
      expect(card).toContain(`${icon("🗓️")}认识<strong`);
      expect(card).toContain('data-animate-number="7">7</span>/20');
    }
    expect(fellow).toContain(`<span class="rel-detail-label">${icon("🤝")}默契</span>`);
    expect(fellow).toContain(`${icon("🤝")}协作进度</span>`);
    expect(fellow).toContain(`<span class="rel-action-label">${icon("🤝")}科研协作</span>`);
    expect(lover).toContain(`<span class="rel-detail-label">${icon("💕")}亲密</span>`);
    for (const [route, label, symbol] of [["play", "玩耍", "🎡"], ["study", "学习", "📖"], ["shopping", "购物", "🛍️"]] as const) {
      const row = lover.split(`data-lover-route="${route}"`)[1]?.split('</button>')[0] ?? "";
      expect(row).toContain(`>${label}</span>`);
      expect(row).toContain(`${icon(symbol)}${label}`);
      expect(row).toContain(`<span class="rel-action-label">${icon(symbol)}${label}</span>`);
      expect(row).toContain(`data-action="lover-${route}"`);
    }
    const symbols = [...html.matchAll(/<span class="rel-inline-icon"([^>]*)>([^<]*)<\/span>/g)];
    expect(symbols.length).toBeGreaterThan(15);
    symbols.forEach((symbol) => {
      expect(symbol[1]).toBe(' aria-hidden="true"');
      expect(symbol[2]).not.toMatch(/科研|默契|亲密|玩耍|学习|购物/);
    });
  });

  it.each(["used", "unaffordable"] as const)("keeps concise semantic lover labels when %s", (reason) => {
    const state = createRelationshipCardTestState(reason === "used");
    state.player.money = 0;
    state.player.san = 0;
    const card = getRelationshipCardHtml(renderAppWithAnimations(state), "lover");
    for (const [route, label] of [["play", "玩耍"], ["study", "学习"], ["shopping", "购物"]] as const) {
      const button = card.match(new RegExp(`<button[^>]*data-action="lover-${route}"[^>]*>`))?.[0] ?? "";
      expect(button).toContain('disabled aria-disabled="true"');
      expect(button).toContain(`aria-label="${label}：${reason === "used" ? "下月可再次约会" : route === "study" ? "SAN不足，需要4" : `金币不足，需要${route === "play" ? 2 : 3}`}"`);
      expect(button).not.toMatch(/约会·|rel-inline-icon/);
    }
  });

  it.each(["character", "relation", "growth", "equip", "publication"] as const)("keeps all raw numeric and fill identities unique with talent tab %s", (activeTalentTab) => {
    const state = createRelationshipCardTestState();
    state.player.research = 20;
    state.papers = [createDraftPaper(1, 0), createDraftPaper(1, 1), createPublishedPaper(2, "引用论文", "A", 40, 12)];
    state.fellowPapers = state.fellowProgressState.map((profile, index) => ({ ...createDraftPaper(1, index + 5), leadAuthorId: profile.id }));
    state.shopState.bikeOwned = true;
    state.shopState.bikeLevel = 2;
    state.shopState.bikeSanSpent = 12;
    state.shopState.bikeSanCapGains = 2;
    state.shopState.chairOwned = true;
    state.shopState.chairUpgrade = "massage";
    state.shopState.gpuLevel = 2;
    state.coffeeState.machineOwned = true;
    state.coffeeState.machineUpgrade = "advanced";
    state.coffeeState.machineTrackedCoffeeCount = 24;
    state.loverProgressState.giftCoupons = 2;
    for (const activeShopTab of ["ai", "gear", "coffee", "rest"] as const) {
      const html = renderAppWithAnimations(state, createDefaultAccountProfile(), { activeTalentTab, activeShopTab });
      const numbers = readAnimationNumbers(html);
      expect(numbers.size).toBeGreaterThan(35);
      const bars = [...html.matchAll(/data-animate-bar="([^"]+)"/g)].map((entry) => entry[1]);
      expect(new Set(bars).size).toBe(bars.length);
      const playerPanel = html.split('id="new-attr-panel">')[1]?.split('id="new-effect-panel"')[0] ?? "";
      expect(playerPanel).not.toContain("data-animate-");
      expect(html.match(/<[^>]+data-animate-key[^>]+>/g)?.every((tag) => /^<(?:span|strong)\b/.test(tag))).toBe(true);
    }
  });

  it("binds own, collaboration and total scores to paper identities across reorder and score changes", () => {
    const state = createRelationshipCardTestState();
    state.player.research = 20;
    const first = { ...createDraftPaper(1, 0), idea: 10, experiment: 20, writing: 30, collaborationScores: { idea: 4, experiment: 5, writing: 6 } };
    const second = { ...createDraftPaper(1, 1), idea: 7 };
    state.papers = [first, second];
    const before = readAnimationNumbers(renderAppWithAnimations(state));
    expect(before.get(`paper:${first.id}:workstation:idea:own`)).toBe(6);
    expect(before.get(`paper:${first.id}:workstation:experiment:own`)).toBe(15);
    expect(before.get(`paper:${first.id}:workstation:writing:own`)).toBe(24);
    expect(before.get(`paper:${first.id}:workstation:idea:collaboration`)).toBe(4);
    expect(before.get(`paper:${first.id}:workstation:experiment:collaboration`)).toBe(5);
    expect(before.get(`paper:${first.id}:workstation:writing:collaboration`)).toBe(6);
    expect(before.get(`paper:${first.id}:workstation:total`)).toBe(60);
    state.papers = [second, { ...first, idea: 12 }];
    const after = readAnimationNumbers(renderAppWithAnimations(state));
    expect(after.get(`paper:${first.id}:workstation:idea:own`)).toBe(8);
    expect(after.get(`paper:${first.id}:workstation:idea:collaboration`)).toBe(4);
    expect(after.get(`paper:${second.id}:workstation:idea:own`)).toBe(7);
  });

  it("marks fellow totals, review months, advisor resources and all semantic relationship bars", () => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState[0]!;
    const paper = { ...createDraftPaper(1, 4), leadAuthorId: fellow.id, idea: 10, experiment: 20, writing: 30 };
    state.fellowPapers = [paper];
    const html = renderAppWithAnimations(state);
    const numbers = readAnimationNumbers(html);
    expect(numbers.get(`person:${fellow.id}:research`)).toBe(7);
    expect(numbers.get(`person:${fellow.id}:affinity`)).toBe(4);
    expect(html).toContain(`${renderAnimatedNumber(`person:${fellow.id}:research`, 7)}/20`);
    expect(numbers.get(`paper:${paper.id}:fellow:idea:total`)).toBe(10);
    expect(numbers.get(`paper:${paper.id}:fellow:total`)).toBe(60);
    expect(numbers.get("person:advisor:funding")).toBe(4);
    for (const semantic of ["research", "cooperation", "lover-play", "lover-study", "lover-shopping"]) {
      expect(html).toMatch(new RegExp(`class="rel-progress-fill task ${semantic}" data-animate-bar="[^"]+"`));
    }
    expect(html).toContain('aria-label="科研经费"');
    for (const route of LOVER_ROUTES) {
      const row = html.split(`data-lover-route="${route}"`)[1]?.split('</button>')[0] ?? "";
      expect(row).toContain(`data-animate-bar="person:lover:4:林知远:${route}:progress"`);
      const label = { play: "玩耍", study: "学习", shopping: "购物" }[route];
      const icon = { play: "🎡", study: "📖", shopping: "🛍️" }[route];
      expect(row).toContain(`<span class="rel-action-label"><span class="rel-inline-icon" aria-hidden="true">${icon}</span>${label}</span>`);
    }
    state.fellowPapers = [{ ...paper, status: "reviewing", reviewMonthsLeft: 2 }];
    state.papers = [{ ...createDraftPaper(1, 0), status: "reviewing", reviewMonthsLeft: 3 }];
    const reviewing = readAnimationNumbers(renderAppWithAnimations(state));
    expect(reviewing.get(`paper:${paper.id}:fellow:review-months`)).toBe(2);
    expect(reviewing.get(`paper:${state.papers[0]!.id}:workstation:review-months`)).toBe(3);
    state.fellowProgressState.reverse();
    expect(readAnimationNumbers(renderAppWithAnimations(state)).get(`person:${fellow.id}:research`)).toBe(7);
  });

  it("uses different keys for publication list, lifecycle, legacy and detail metrics and annual bars", () => {
    const state = createRelationshipCardTestState();
    const paper = createPublishedPaper(0, "被引论文", "A", 40, 17, 36);
    state.papers = [paper];
    state.totalCitations = 17;
    const html = renderAppWithAnimations(state);
    const numbers = readAnimationNumbers(html);
    for (const view of ["research-list", "research-lifecycle", "research-detail"]) expect(numbers.get(`paper:${paper.id}:${view}:citations`)).toBe(17);
    expect(numbers.get(`paper:${paper.id}:research-detail:score`)).toBe(36);
    expect(numbers.get("citations:total")).toBe(17);
    expect(html).toMatch(/data-animate-bar="citations:year:\d+"\s+style="height:/);
    expect(html).not.toMatch(/data-animate-key="[^"]*(?:accepted-score|publication-year)[^"]*"/);
  });

  it.each([-3, 4])("preserves signed poker profit %s and marks every growth bar with valid numeric labels", (profit) => {
    const state = createRelationshipCardTestState();
    state.readingState.readCount = 13;
    state.partTimeWorkCount = 10;
    state.eventCounters.meetingCount = 5;
    state.eventCounters.badmintonCount = 2;
    state.eventCounters.pokerCount = 3;
    state.eventCounters.pokerProfit = profit;
    const html = renderAppWithAnimations(state, createDefaultAccountProfile(), { activeTalentTab: "growth" });
    const numbers = readAnimationNumbers(html);
    for (const id of ["reading-growth", "part-time-growth", "meeting-experience", "badminton-growth", "poker-growth"]) {
      expect(html).toContain(`data-animate-bar="talent:${id}:progress"`);
      expect(numbers.has(`talent:${id}:progress:value`)).toBe(true);
    }
    expect(numbers.get("talent:reading-growth:progress:value")).toBe(3);
    expect(numbers.get("talent:poker-growth:metric:累计赚取金币:profit")).toBe(profit);
    expect(html).toContain(renderAnimatedNumber("talent:poker-growth:metric:累计赚取金币:profit", profit, `${profit >= 0 ? "+ " : "- "}${Math.abs(profit)}`));
    expect(html).toContain("每 10 次阅读，科研 +1；idea buff 效果 +1");
    expect(getTalentCardHtml(html, "reading-growth").match(/<p class="talent-item-desc">([\s\S]*?)<\/p>/)?.[1]).not.toContain("data-animate");
  });

  it("splits changing equipment caps and counts, and preserves immutable formulas", () => {
    const state = createRelationshipCardTestState();
    state.shopState.bikeOwned = true;
    state.shopState.bikeLevel = 2;
    state.shopState.bikeSanSpent = 12;
    state.shopState.bikeSanCapGains = 2;
    state.coffeeState.machineOwned = true;
    state.coffeeState.machineUpgrade = "advanced";
    state.coffeeState.machineTrackedCoffeeCount = 24;
    const html = renderAppWithAnimations(state, createDefaultAccountProfile(), { activeTalentTab: "equip", activeShopTab: "gear" });
    const numbers = readAnimationNumbers(html);
    expect(numbers.get("talent:bike:progress:value")).toBe(2);
    expect(numbers.get("talent:bike:progress:cap")).toBe(6);
    expect(numbers.get("shop:bike:spent")).toBe(12);
    expect(numbers.get("shop:bike:gained")).toBe(2);
    expect(numbers.get("shop:bike:cap")).toBe(6);
    expect(numbers.get("talent:coffee-machine:metric:累计生产:count")).toBe(24);
    expect(html).toContain('data-animate-bar="talent:coffee-machine:progress"');
    expect(html).not.toContain('data-animate-number="<');
  });

  it("marks remaining actions and live deadlines but leaves event history without markers", () => {
    const state = createRelationshipCardTestState();
    state.actionState.used = 1;
    state.actionState.limit = 3;
    state.eventQueue = [{ ...createTeachersDayEvent(state), deadlineMonths: 2, queueOrder: 0 }];
    const html = renderAppWithAnimations(state);
    const numbers = readAnimationNumbers(html);
    expect(numbers.get("workstation:actions:remaining")).toBe(2);
    expect(numbers.get("workstation:actions:limit")).toBe(3);
    expect(numbers.get(`event:${state.eventQueue[0]!.id}:agenda:deadline-months`)).toBe(2);
    const eventContent = html.split('id="event-content-box">')[1]?.split('id="event-log-section"')[0] ?? "";
    expect(eventContent).not.toContain("data-animate-");
  });

  it("marks lobby level, experience, achievements and record metrics using role identities", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 2;
    account.roleProgress.normal.exp = 12;
    account.roleProgress.normal.historyBest.representativeScore = 50;
    const html = renderAppWithAnimations(createInitialState(), account);
    const numbers = readAnimationNumbers(html);
    expect(numbers.get("role:normal:card:level")).toBe(2);
    expect(numbers.get("role:normal:growth:level")).toBe(2);
    expect(numbers.get("role:normal:growth:experience")).toBe(12);
    expect(numbers.get("role:normal:history:representative:score")).toBe(50);
    expect(html).toContain('data-animate-bar="role:normal:growth:experience"');
    expect(html).toContain('data-animate-bar="role:normal:achievements:progress"');
  });

  it("escapes animation identities and keeps raw floating values independent from displayed rounding", () => {
    expect(animationNumberAttributes('paper:unsafe"<&:score', 1.234)).toBe('data-animate-key="paper:unsafe&quot;&lt;&amp;:score" data-animate-number="1.234"');
    expect(renderAnimatedNumber("test:ratio", 1.234, "1.23")).toContain('data-animate-number="1.234">1.23</span>');
  });
});

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
    expect(html).not.toContain('class="talent-item-tag');
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
    for (const html of [rolesHtml, infoHtml, valuesHtml, guideHtml, messagesHtml]) {
      const metricGroups = html.match(/<div class="(?:lobby-live-metrics|lobby-stat-strip)"[^>]*>[\s\S]*?<\/div>/g) ?? [];
      expect(metricGroups).toHaveLength(html === infoHtml ? 2 : 1);
      for (const metrics of metricGroups) {
        expect([...metrics.matchAll(/data-community-stat="([^"]+)"/g)].map((match) => match[1])).toEqual(["views", "visitors", "games"]);
        expect(metrics).toContain('<strong data-community-stat="views">--（--）</strong>');
        expect(metrics).toContain('<strong data-community-stat="visitors">--（--）</strong>');
        expect(metrics).toContain('<strong data-community-stat="games">--（--）</strong>');
      expect(metrics).not.toContain('title="访问：');
      expect(metrics).not.toContain('title="访客：');
      expect(metrics).not.toContain('title="游玩：');
        expect(metrics).toContain('<i data-lucide="eye" aria-hidden="true"></i><span>访问（今日）</span>');
        expect(metrics).toContain('<i data-lucide="users" aria-hidden="true"></i><span>访客（今日）</span>');
        expect(metrics).toContain('<i data-lucide="gamepad-2" aria-hidden="true"></i><span>游玩（今日）</span>');
      }
      expect(html).not.toMatch(/data-community-stat="(?:today-visitors|today-games|total-visitors|total-games)"/);
      expect(html).not.toMatch(/今日访客|今日游玩|总访客|总游玩|统计服务待接入/);
    }
    expect(rolesHtml).not.toContain('data-community-stat="current-online"');
    expect(rolesHtml).not.toContain("当前在线");
    expect(rolesHtml).toContain('class="lobby-grid"');
    expect(rolesHtml).not.toContain('class="lobby-info-view"');
    expect(rolesHtml).not.toContain('class="lobby-message-view"');

    expect(infoHtml).toMatch(/class="lobby-community-view lobby-info-view"/);
    expect(infoHtml).toContain("研究生模拟器 v2.0");
    expect(infoHtml).toContain('<small>总数（今日）</small>');
    expect(infoHtml).toContain("68 个月");
    expect(infoHtml).toContain('data-ui-lobby-info-section="overview"');
    expect(infoHtml).toContain('data-ui-lobby-info-section="guide"');
    expect(infoHtml).toContain("游戏机制");
    expect(infoHtml).toContain("数值规则");
    expect(infoHtml).toContain("攻略指南");
    expect(valuesHtml).toContain("事件科研任务");
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
    expect(html).toContain('data-tooltip="科研增减有0%概率无效\n事件科研任务 SAN 减免 0"');
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
    expect(html).toMatch(/class="event-ddl-badge" data-deadline="(?:blocking|pending)">期限 /);
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
    expect(html).toContain('id="settings-plan-title">🗺️ 后续计划</strong>');
    expect(html).toContain("事件与人际联动");
    expect(html).not.toContain('data-ui-layout-toggle="debug-event-rail"');
    expect(html).not.toContain('data-ui-layout-toggle="debug-bottom-bar"');
    expect(html).toContain('data-ui-open-debug-window');
    expect(html).toContain('data-ui-open-feedback');
    expect(html).not.toContain('id="debug-bottom-bar"');
    expect(html).not.toContain('class="debug-bottom-stat-grid"');
    expect(html).not.toContain('class="debug-bottom-time-grid"');
    expect(html).not.toContain('id="debug-event-rail"');
    expect(html).not.toContain('data-debug-journal-target=');
    expect(html).not.toContain('data-action="debug-add-paper"');
    expect(html).not.toContain('data-action="debug-add-all-buffs"');
    expect(html).not.toContain('class="debug-event-rail-title"');
    expect(html).not.toContain('class="debug-event-category-title"');
    expect(html).not.toContain("测试事件");
    expect(html).not.toContain('class="debug-menu"');
    expect(html).not.toContain("属性调整");
    expect(html).not.toContain("事件触发");
    expect(html).not.toContain('class="settings-attr-grid"');
    expect(html).not.toContain('class="settings-event-grid"');
    expect(html).not.toContain('data-action="debug-adjust-stat"');
    expect(html).not.toContain('data-action="debug-shift-month"');
    expect(html).not.toContain('data-action="debug-trigger-event"');
    expect(html).not.toContain('data-event-id="conference"');
    expect(html).not.toContain('data-event-id="before-grad-school"');
    expect(html).not.toContain('data-action="force-next-month"');
    expect(html).not.toContain('aria-label="删除当前阻塞事件并真实结算下一月"');
    expect(html).toContain('data-action="restart-game"');
    expect(html).toContain('data-action="reset-game"');
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

  it("keeps the main layout free of debug tools and exposes the popup opener in settings", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });

    const html = renderApp(state, createDefaultAccountProfile(), {
      activePlayTab: "settings",
    });
    expect(html).not.toContain('id="debug-event-rail"');
    expect(html).not.toContain('id="debug-bottom-bar"');
    expect(html).not.toContain("has-debug-bar");
    expect(html).not.toContain("has-debug-bottom-bar");
    expect(html).not.toContain('data-ui-layout-toggle=');
    expect(html).not.toContain('data-action="debug-');
    expect(html).not.toContain('data-action="force-next-month"');

    const settings = html.match(/<section[^>]*data-tab-panel="settings"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(settings).toMatch(/<button[^>]*type="button"[^>]*data-ui-open-debug-window/);
    expect(settings.match(/data-ui-open-debug-window/g) ?? []).toHaveLength(1);
    expect(settings).toContain('data-action="restart-game"');
    expect(settings).toContain('data-action="reset-game"');
    expect(settings).toContain('data-ui-open-feedback');
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
    expect(getTabHtml("workstation")).not.toContain("center-tab-badge is-available");
    expect(getTabHtml("relationship")).toContain("center-tab-badge is-available");
    expect(getTabHtml("shop")).not.toContain("center-tab-badge is-available");

    const advisorCard = getRelationshipCardHtml(html, "advisor");
    expect(advisorCard).toContain('data-rel-type-pill="advisor"');
    expect(advisorCard.match(/role="progressbar"/g)).toHaveLength(3);
    expect(advisorCard).toContain('data-action="advisor-horizontal"');
    const readButton = html.match(/<button[^>]*class="compact-action-btn workstation-main-action-btn is-read"[^>]*data-action="read-paper"[^>]*>/)?.[0] ?? "";
    expect(readButton).not.toBe("");
    expect(readButton).not.toContain("disabled");
    expect(readButton).not.toContain('data-gameplay-status="deferred"');
  });

  it("counts a player's advisor action after the mentor's automatic monthly project", () => {
    const state = createAdmittedTestState();
    state.eventQueue = [];
    state.advisorProgressState.lastAdvisorProjectTotalMonths = state.totalMonths;
    state.advisorProgressState.lastProjectTotalMonths = state.totalMonths;
    state.advisorProgressState.lastPlayerProjectTotalMonths = null;
    state.player.san = 20;
    const html = renderApp(state, createDefaultAccountProfile());
    const tab = html.match(/<button[^>]*data-ui-play-tab="relationship"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(tab).toContain('aria-label="1 个可用操作">1</span>');
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

  it("keeps all three lover dates clickable in the pre-enrollment preview", () => {
    const initial = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const state = {
      ...initial,
      relationshipState: { ...initial.relationshipState, loverCount: 1 },
      loverState: activateLover("smart", initial.totalMonths, "male"),
      loverProgressState: { ...initial.loverProgressState, active: true },
    };
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "relationship" });
    const loverCard = getRelationshipCardHtml(html, "lover");
    const dateButtons = loverCard.match(/<button class="btn-sm rel-action-btn[^>]*>[\s\S]*?<\/button>/g) ?? [];

    expect(dateButtons).toHaveLength(3);
    dateButtons.forEach((button, index) => {
      expect(button).toContain(`data-action="lover-${LOVER_ROUTES[index]}"`);
      expect(button).not.toContain('disabled aria-disabled="true"');
      expect(button).not.toContain("入学后开放");
    });
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
    const aiHelp = getHelpText({ activePlayTab: "shop", activeShopTab: "ai" });
    expect(aiHelp).toContain("订购仅在当月生效");
    expect(aiHelp).toContain("月初自动续费");
    expect(aiHelp).toContain("AI模型按学年更新，价格与效果随之变化");
    expect(aiHelp).toContain("更新后需要重新开启自动续费");
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
    const futureGeminiCard = getShopCardHtml(futureAiHtml, "Gemini 3");
    expect(futureGeminiCard).toContain("人际操作");
    expect(futureGeminiCard).not.toContain("事件科研任务");

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
          workstationTransaction: 1,
        },
      },
    };
    const fundedGearHtml = renderApp(fundedState, createDefaultAccountProfile(), { activeShopTab: "gear" });
    expect(fundedGearHtml).toContain(">显卡报销</button>");
    expect(fundedGearHtml).toContain(">工位报销</button>");
    expect(fundedGearHtml).toContain("购买机械键盘、2K显示器、办公椅、咖啡机，或升级办公椅、咖啡机，任选一次免单");
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
    const coffeeHelp = getHelpText({ activePlayTab: "shop", activeShopTab: "coffee" });
    expect(coffeeHelp).toContain("冰美式可直接购买，SAN+2");
    expect(coffeeHelp).toContain("购入咖啡机后提升为SAN+3");
    expect(coffeeHelp).toContain("SAN已满时，自动续费当月跳过");
    expect(coffeeHelp).toContain("金币不足且没有可用于续费的礼物券时，当月暂停续费");
    expect(coffeeCard).toContain("SAN +3");
    expect(coffeeCard).not.toContain("本月已生产");
    expect(coffeeMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("冰美式 SAN+3，每月1杯");
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

    expect(getHelpText({ activePlayTab: "shop", activeShopTab: "gear" }))
      .toContain("显卡和自行车可逐档升级");
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
    expect(unownedMachineCard.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).toContain("冰美式 SAN+2提升为+3，可升级");
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
    const fundedHtml = renderApp({ ...state, player: { ...state.player, money: 2 } }, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const unownedCoffee = getShopCardHtml(fundedHtml, "冰美式");
    expect(unownedCoffee).toContain("SAN +2");
    expect(unownedCoffee).not.toContain("基础 SAN");
    const unownedSubscriptionToggle = unownedCoffee.match(/<button[^>]*data-action="toggle-coffee-subscription"[^>]*>/)?.[0] ?? "";
    expect(unownedSubscriptionToggle).not.toContain("disabled");
    const buyCoffeeButton = unownedCoffee.match(/<button[^>]*data-action="buy-coffee"[^>]*>/)?.[0] ?? "";
    expect(buyCoffeeButton).not.toBe("");
    expect(buyCoffeeButton).not.toContain("disabled");

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
    expect(defaultHtml).not.toContain('class="out-of-game-role-portrait"');
    expect(defaultHtml).toContain('class="play-help-panel');
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
    expect(getHelpText({ activePlayTab: "workstation" }))
      .toContain("分数格上行是自身分，下行是协作分，右侧总分为六格之和");
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
    expect(slotHtml).toContain('<span aria-hidden="true">🎲</span></button>');
    expect(slotHtml).not.toContain(">换个选题</button>");
    expect(slotHtml).toContain('aria-label="丢弃论文"');
    expect(slotHtml).toContain('<span aria-hidden="true">🗑️</span></button>');
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
    expect(html).toContain('aria-label="AI行动 1 次 · 可投稿 0 篇"');
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
    expect(reviewingHtml).toContain('title="撤稿" aria-label="撤稿"');
    expect(reviewingHtml).toContain('<span aria-hidden="true">📥</span></button>');
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

  it.each(["draft", "reviewing", "journal-reviewing", "published"] as const)("shows own scores above collaboration scores with their combined total on %s workstation cards", (status) => {
    const base = { ...createAdmittedTestState(), playerName: "王知行" };
    const paper = {
      ...createDraftPaper(1, 0),
      status,
      idea: 30,
      experiment: 40,
      writing: 50,
      journalTarget: status === "journal-reviewing" ? "nmi" as const : null,
      collaborationScores: { idea: 3, experiment: 40, writing: 7 },
      collaborators: [
        { id: "former-peer", name: "张雅琪" },
        { id: "another-peer", name: "张雅琪" },
        { id: "former-senior", name: "Alice Wang" },
        { id: "former-lover", name: '<img src="x">&\'姓名' },
        { id: "blank-name", name: "   " },
      ],
    };
    const html = renderApp({ ...base, papers: [paper], fellowProgressState: [] }, createDefaultAccountProfile());
    const card = getPaperSlotCardHtml(html, 0);
    const ownScores = card.match(/<div class="paper-score-strip"[\s\S]*?<\/div>/)?.[0] ?? "";
    const collaborationScores = card.match(/<div class="paper-collaboration-score-strip"[\s\S]*?<\/div>/)?.[0] ?? "";
    const collaborators = card.match(/<div class="paper-collaborators"[^>]*>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    const [playerAvatar, ...avatars] = collaborators.match(/<span class="paper-collaborator-avatar"[^>]*>[\s\S]*?<\/span>/g) ?? [];
    if (!playerAvatar) throw new Error("player avatar is missing");

    expect(ownScores).toContain('aria-label="自身分：idea 27，实验 0，写作 43，总分 120"');
    expect(ownScores).toContain('<span><small>idea</small><strong>27</strong></span>');
    expect(ownScores).toContain('<span><small>实验</small><strong>0</strong></span>');
    expect(ownScores).toContain('<span><small>写作</small><strong>43</strong></span>');
    expect(ownScores).toContain('<small>总分</small><strong>120</strong>');
    expect(collaborationScores).toContain('aria-label="协作分：idea 3，实验 40，写作 7"');
    expect(collaborationScores).toContain('<span><small>协作</small><strong>3</strong></span>');
    expect(collaborationScores).toContain('<span><small>协作</small><strong>40</strong></span>');
    expect(collaborationScores).toContain('<span><small>协作</small><strong>7</strong></span>');
    expect((ownScores.match(/<strong>/g) ?? [])).toHaveLength(4);
    expect((collaborationScores.match(/<strong>/g) ?? [])).toHaveLength(3);
    expect(collaborationScores).not.toMatch(/总分|\+|—/);
    expect(ownScores + collaborationScores).not.toContain('title=');
    expect(card.indexOf(ownScores)).toBeLessThan(card.indexOf(collaborationScores));
    expect(card).not.toMatch(/paper-own-score-strip|paper-collaboration-strip/);
    expect(collaborators).toContain('aria-label="论文参与者"');
    expect(playerAvatar).toContain('data-player-avatar="true"');
    expect(playerAvatar).toContain('title="王知行（你）"');
    expect(playerAvatar).toMatch(/>王<\/span>$/);
    expect(collaborators).not.toContain('<small>协作者</small>');
    expect(card.indexOf(collaborators)).toBeLessThan(card.indexOf('class="paper-title-meta-row"'));
    expect(card.match(/class="paper-collaborators"/g)).toHaveLength(1);
    expect(collaborators).toContain('class="paper-collaborator-list"');
    expect(avatars).toHaveLength(4);
    for (const avatar of avatars.slice(0, 2)) {
      expect(avatar).toContain('title="张雅琪"');
      expect(avatar).toContain('aria-label="张雅琪"');
      expect(avatar).toMatch(/>张<\/span>$/);
    }
    expect(avatars[2]).toContain('title="Alice Wang"');
    expect(avatars[2]).toContain('aria-label="Alice Wang"');
    expect(avatars[2]).toMatch(/>A<\/span>$/);
    expect(avatars[3]).toContain('title="&lt;img src=&quot;x&quot;&gt;&amp;&#39;姓名"');
    expect(avatars[3]).toContain('aria-label="&lt;img src=&quot;x&quot;&gt;&amp;&#39;姓名"');
    expect(avatars[3]).toMatch(/>&lt;<\/span>$/);
    for (const avatar of avatars) {
      expect(avatar).toMatch(/style="--collaborator-color:hsl\(\d+ 62% 42%\)"/i);
    }
    expect(new Set([playerAvatar, ...avatars].map((avatar) => avatar.match(/--collaborator-color:([^\"]+)/)?.[1])).size).toBe(5);
    const reorderedCard = getPaperSlotCardHtml(renderApp({
      ...base,
      papers: [{ ...paper, collaborators: [...paper.collaborators].reverse() }],
      fellowProgressState: [],
    }, createDefaultAccountProfile()), 0);
    expect(reorderedCard.match(/<span class="paper-collaborator-avatar"[^>]*>[\s\S]*?<\/span>/g)).toEqual([playerAvatar, ...[...avatars].reverse()]);
    expect(collaborators).not.toContain('<img');
    expect(collaborators).not.toMatch(/<strong>|\+\d|data-ui-select-workstation-paper|paper-collaborator-empty/);
    expect(card).not.toMatch(/<details class="paper-collaborators"|<summary>协作者/);
    expect(card.match(/<article\b[^>]*>/)?.[0]).not.toContain('data-ui-select-workstation-paper');
    if (status === "draft" || status === "journal-reviewing") {
      expect(card).toContain(`class="paper-card-selection-content" data-ui-select-workstation-paper="${paper.id}"`);
    }
  });

  it.each(["draft", "reviewing", "journal-reviewing", "published"] as const)("shows own scores and a zero collaboration row without collaborator placeholders on %s cards", (status) => {
    const base = createAdmittedTestState();
    for (const { total, ...paperData } of [
      { idea: 4, experiment: 5, writing: 6, total: 15, collaborationScores: { idea: 0, experiment: 0, writing: 0 }, collaborators: [] },
      { idea: 4, experiment: 5, writing: 6, total: 15, collaborationScores: undefined, collaborators: undefined },
      { idea: 0, experiment: 0, writing: 0, total: 0, collaborationScores: { idea: 0, experiment: 0, writing: 0 }, collaborators: [] },
      { idea: 0, experiment: 0, writing: 0, total: 0, collaborationScores: { idea: 0, experiment: 0, writing: 0 }, collaborators: [{ id: "blank-name", name: "   " }] },
    ]) {
      const paper = {
        ...createDraftPaper(1, 0),
        ...paperData,
        status,
        journalTarget: status === "journal-reviewing" ? "nmi" as const : null,
      };
      const card = getPaperSlotCardHtml(renderApp({ ...base, papers: [paper] }, createDefaultAccountProfile()), 0);
      const ownScores = card.match(/<div class="paper-score-strip"[\s\S]*?<\/div>/)?.[0] ?? "";
      const collaborationScores = card.match(/<div class="paper-collaboration-score-strip"[\s\S]*?<\/div>/)?.[0] ?? "";
      const collaborators = card.match(/<div class="paper-collaborators"[^>]*>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";

      expect(ownScores).toContain(`aria-label="自身分：idea ${paper.idea}，实验 ${paper.experiment}，写作 ${paper.writing}，总分 ${total}"`);
      expect(ownScores).toContain(`<small>总分</small><strong>${total}</strong>`);
      expect((ownScores.match(/<strong>(\d+)<\/strong>/g) ?? [])).toEqual([
        `<strong>${paper.idea}</strong>`,
        `<strong>${paper.experiment}</strong>`,
        `<strong>${paper.writing}</strong>`,
        `<strong>${total}</strong>`,
      ]);
      expect(collaborationScores).toContain('aria-label="协作分：idea 0，实验 0，写作 0"');
      expect(collaborationScores.match(/<small>协作<\/small><strong>0<\/strong>/g)).toHaveLength(3);
      expect(ownScores + collaborationScores).not.toContain('title=');
      expect(card.indexOf(ownScores)).toBeLessThan(card.indexOf(collaborationScores));
      expect(collaborators.match(/class="paper-collaborator-avatar"/g)).toHaveLength(1);
      expect(collaborators).toContain('data-player-avatar="true"');
      expect(card).not.toContain('paper-collaborator-empty');
      expect(card).not.toContain('<details class="paper-collaborators"');
    }
  });

  it("keeps empty and locked paper slots free of score rows and collaborator lists", () => {
    const state = createAdmittedTestState();
    const html = renderApp({ ...state, papers: [], paperSlotsUnlocked: 1, player: { ...state.player, research: 0 } }, createDefaultAccountProfile());

    for (const slotIndex of [0, 1, 2, 3]) {
      const card = getPaperSlotCardHtml(html, slotIndex);
      expect(card).toContain('paper-card-empty');
      expect(card).not.toMatch(/paper-score-strip|paper-own-score-strip|paper-collaboration-score-strip|paper-collaboration-strip|paper-collaborators|paper-collaborator-avatar/);
    }
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
    const researchHelp = getHelpText({ activePlayTab: "research" });
    expect(researchHelp).toContain("会议开会或挂arXiv后开始被引");
    expect(researchHelp).toContain("期刊接收后直接开始");
    expect(researchHelp).toContain("当前分每4个月衰减10%");
    expect(researchHelp).toContain("科研分只算一作，按论文等级累计");
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
    expect(html).toMatch(/<strong>1<\/strong>\s*<small>A<span>（4分）<\/span><\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>B<span>（2分）<\/span><\/small>/);
    expect(html).toMatch(/<strong>2<\/strong>\s*<small>C<span>（1分）<\/span><\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>Nature<span>（20分）<\/span><\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>NMI<span>（10分）<\/span><\/small>/);
    expect(html).toMatch(/<strong>0<\/strong>\s*<small>PAMI<span>（5分）<\/span><\/small>/);
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
      papers: [{ ...createPublishedPaper(0, "合作论文测试", "B", 20, 4, 20, true), collaborators: undefined }],
      externalPublications: [],
    };
    const html = renderApp(state, createDefaultAccountProfile());
    const row = html.match(/<button\s+class="research-paper-row[\s\S]*?合作论文测试[\s\S]*?<\/button>/)?.[0] ?? "";
    const authors = row.match(/<span class="research-paper-authors">([\s\S]*?)<span class="research-paper-venue"/)?.[1] ?? "";

    expect(authors).toMatch(/^<span class="research-paper-author">[^<]+<\/span>/);
    expect(authors).toContain('<strong class="research-paper-author is-player">X Li</strong>');
    expect(authors).toContain('<span class="research-paper-author">X Li</span>');
    expect(authors).not.toContain("Collaborator");
    expect(authors).not.toContain("Advisor");
    expect(authors).not.toContain(">Ni<");
  });

  it("deduplicates the player by identity and formats short and full author names separately", () => {
    const state = createAdmittedTestState();
    state.playerName = "李旭霖";
    state.selectedAdvisorName = "赵志伟";
    state.externalPublications = [{
      ...createPublishedPaper(0, "姓名回归论文", "A", 30, 4, 30, true),
      leadAuthorName: "马婉仪",
      collaborators: [{ id: "player", name: "你" }, { id: "player", name: "李旭霖" }, { id: "senior", name: "Alice Wang" }],
    }];
    const html = renderApp(state);
    const row = html.match(/<button\s+class="research-paper-row[\s\S]*?姓名回归论文[\s\S]*?<\/button>/)?.[0] ?? "";
    const detail = html.match(/<section class="research-current-card"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(row).toContain('>W Ma</span>');
    expect(row).toContain('>A Wang</span>');
    expect(row).toContain('>X Li</strong>');
    expect(detail).toContain('>Wanyi Ma</span>');
    expect(detail).toContain('>Alice Wang</span>');
    expect(detail).toContain('>Xulin Li</strong>');
    for (const content of [row, detail]) {
      expect(content).not.toContain(">Ni<");
      expect(content.match(/class="research-paper-author is-player"/g)).toHaveLength(1);
      expect(content.match(/class="research-paper-author(?: is-player)?"/g)).toHaveLength(4);
    }
  });

  it("hides previous rejection summaries while preserving the compact rejection badge", () => {
    const state = createAdmittedTestState();
    state.papers = [{ ...createDraftPaper(1, 0), rejectionCount: 1,
      lastReview: { reports: [], totalReviewScore: -1, accepted: false, borderlineChance: 0.15 },
    }];
    const html = renderApp(state);
    expect(html).toContain('>rej×1</span>');
    expect(html).not.toContain("上轮退稿");
    expect(html).not.toContain('class="paper-review-summary');
  });

  it("uses saved collaborators for published authors after relationships end", () => {
    const base = createRelationshipCardTestState();
    const paper = {
      ...createPublishedPaper(0, "真实作者论文", "A", 30, 4),
      collaborators: [
        { id: "former-peer", name: "张雅琪" },
        { id: "former-lover", name: "刘斌" },
        { id: "former-senior", name: "庄婉仪" },
        { id: "former-junior", name: "赵志伟" },
      ],
    };
    const renderAuthors = (state: GameState) => {
      const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "research" });
      const row = html.match(/<button\s+class="research-paper-row[\s\S]*?真实作者论文[\s\S]*?<\/button>/)?.[0] ?? "";
      return row.match(/<span class="research-paper-authors">([\s\S]*?)<span class="research-paper-venue"/)?.[1] ?? "";
    };
    const state = { ...base, playerName: "李旭旭", selectedAdvisorName: "李旭霖", papers: [], externalPublications: [paper] };
    const authors = renderAuthors(state);
    const afterEndingRelationships = renderAuthors({
      ...state,
      fellowProgressState: [],
      loverState: { ...state.loverState, active: false },
      loverProgressState: { ...state.loverProgressState, active: false },
    });

    expect(authors).toMatch(/^<strong class="research-paper-author is-player">X Li<\/strong>/);
    expect(authors.match(/class="research-paper-author(?: is-player)?"/g)).toHaveLength(6);
    expect(authors).toContain('<span class="research-paper-author">Y Zhang</span>');
    expect(authors).toContain('<span class="research-paper-author">B Liu</span>');
    expect(authors).toContain('<span class="research-paper-author">W Zhuang</span>');
    expect(authors).toContain('<span class="research-paper-author">Z Zhao</span>');
    expect(authors).toContain('<span class="research-paper-author">X Li</span></span>');
    expect(afterEndingRelationships).toBe(authors);
  });

  it.each([
    { nonFirstAuthor: false, guided: false },
    { nonFirstAuthor: false, guided: true },
    { nonFirstAuthor: true, guided: false },
    { nonFirstAuthor: true, guided: true },
  ])("always credits the advisor exactly once without inventing collaborators for %j", ({ nonFirstAuthor, guided }) => {
    const base = createRelationshipCardTestState();
    const paper = {
      ...createPublishedPaper(0, "导师署名论文", "B", 20, 4, 20, nonFirstAuthor),
      leadAuthorName: nonFirstAuthor ? "张雅琪" : undefined,
      collaborators: guided ? [{ id: "advisor", name: "赵志伟" }] : [],
    };
    const html = renderApp({ ...base, playerName: "李旭霖", selectedAdvisorName: "赵志伟", papers: [paper], externalPublications: [] }, createDefaultAccountProfile());
    const row = html.match(/<button\s+class="research-paper-row[\s\S]*?导师署名论文[\s\S]*?<\/button>/)?.[0] ?? "";
    const detail = html.match(/<section class="research-current-card"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(row).toContain('<strong class="research-paper-author is-player">X Li</strong>');
    expect(detail).toContain('<strong class="research-paper-author is-player">Xulin Li</strong>');
    expect(row.match(/>Z Zhao<\/span>/g)).toHaveLength(1);
    expect(detail.match(/>Zhiwei Zhao<\/span>/g)).toHaveLength(1);
    for (const content of [row, detail]) {
      expect(content.match(/class="research-paper-author(?: is-player)?"/g)).toHaveLength(nonFirstAuthor ? 3 : 2);
    }
  });

  it.each([{ debugPaperTarget: "B" as const }, { debugJournalTarget: "nmi" as const }])("gives a new debug coauthor paper a stable distinct lead author for %j", (target) => {
    const base = createRelationshipCardTestState();
    const state = dispatchAction({
      ...base,
      playerName: "李旭旭",
      selectedAdvisorName: "李旭霖",
      papers: [],
      externalPublications: [],
    }, "debug-add-paper", { ...target, debugPaperAuthorship: "coauthor" });
    const renderAuthorNames = (renderState: GameState) => {
      const html = renderApp(renderState, createDefaultAccountProfile(), { activePlayTab: "research" });
      const row = html.match(/<button\s+class="research-paper-row[\s\S]*?<\/button>/)?.[0] ?? "";
      const authors = row.match(/<span class="research-paper-authors">([\s\S]*?)<span class="research-paper-venue"/)?.[1] ?? "";
      expect(authors).toMatch(/^<span class="research-paper-author">[^<]+<\/span>/);
      expect(authors).toContain('<strong class="research-paper-author is-player">X Li</strong>');
      return [...authors.matchAll(/class="research-paper-author(?: is-player)?">([^<]+)</g)].map((match) => match[1]);
    };
    const authorNames = renderAuthorNames(state);

    expect(authorNames).toHaveLength(3);
    expect(authorNames.slice(1)).toEqual(["X Li", "X Li"]);
    expect(authorNames[0]).not.toBe("X Li");
    expect(renderAuthorNames({ ...state, totalMonths: state.totalMonths + 1, fellowProgressState: [] })).toEqual(authorNames);
  });

  it.each([undefined, [], [{ id: "former-lead", name: "张雅琪" }, { id: "former-peer", name: "刘斌" }]])("preserves a saved lead author without an active relationship for collaborators %j", (collaborators) => {
    const paper = {
      ...createPublishedPaper(0, "保留一作论文", "B", 20, 4, 20, true),
      leadAuthorName: "张雅琪",
      collaborators,
    };
    const state = { ...createAdmittedTestState(), playerName: "李旭旭", selectedAdvisorName: "李旭霖", fellowProgressState: [], papers: [paper], externalPublications: [] };
    const html = renderApp(state, createDefaultAccountProfile());
    const row = html.match(/<button\s+class="research-paper-row[\s\S]*?保留一作论文[\s\S]*?<\/button>/)?.[0] ?? "";
    const authors = row.match(/<span class="research-paper-authors">([\s\S]*?)<span class="research-paper-venue"/)?.[1] ?? "";

    expect(authors).toMatch(/^<span class="research-paper-author">Y Zhang<\/span>/);
    expect(authors.match(/>Y Zhang<\/span>/g)).toHaveLength(1);
    expect(authors).toContain('<strong class="research-paper-author is-player">X Li</strong>');
    expect(authors).toContain('<span class="research-paper-author">X Li</span></span>');
    if (collaborators?.length) expect(authors).toContain('<span class="research-paper-author">B Liu</span>');
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
    expect(getHelpText({ activePlayTab: "research" }))
      .toContain("引用按月结算");
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
    expect(html).toMatch(/你叫<mark class="event-name-highlight">[^<]+<\/mark>，是人工智能专业学生/);
    expect(eventButtonsBlock).toContain('data-action="resolve-event"');
    expect(eventButtonsBlock).toMatch(/data-event-id="[^"]+"/);
    expect(eventButtonsBlock).toMatch(/data-event-choice-id="[^"]+"/);
    expect(eventButtonsBlock).not.toContain("disabled");
  });

  it("shows the player name in the attribute panel only after opening-event confirmation", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const candidateName = state.eventQueue[0]?.choices[0]?.effects.fixedEventResolution?.studentName;
    expect(candidateName).toBeTruthy();
    const attributeName = () => renderApp(state, createDefaultAccountProfile())
      .match(/<span class="new-player-name" title="[^"]*">([^<]*)<\/span>/)?.[1];

    expect(attributeName()).toBe("大多数");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-open-advisor-info" });
    expect(attributeName()).toBe("大多数");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-confirm" });
    expect(attributeName()).toBe("大多数");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-finish" });
    expect(attributeName()).toBe(`大多数：${candidateName}`);
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
    expect(summary).toContain('<span class="event-settlement-effect is-money">金币 -1</span>');
    expect(summary).toContain('<span class="event-settlement-divider" aria-hidden="true">|</span>');
    expect(summary).toContain('<span class="event-settlement-effect is-relationship">导师好感 +1</span>');
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
    expect(html).toContain('<span class="event-settlement-effect is-san">SAN -2</span>');
    expect(html).toContain('<span class="event-settlement-effect is-relationship">导师好感 +1</span>');
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
          "导师科研积累 +2",
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
    expect(summary).toContain("导师科研积累 +2");
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
    expect(currentHtml).toContain('class="event-description-emoji"');

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
    expect(listHtml).not.toMatch(/<button[^>]*>进入下一月<\/button>/);
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
    const eventQueue = Array.from({ length: 7 }, (_, index) => createEventQueueItem({
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
    expect(firstPending).toContain("待办事件6");
    expect(firstPending).not.toContain("待办事件7");
    expect(firstPending).toMatch(/id="pending-nav-prev"[^>]*disabled/);
    expect(firstPending).not.toMatch(/id="pending-nav-next"[^>]*disabled/);
    expect(secondPending).toContain('data-pending-page-index="1"');
    expect(secondPending).toContain("待办事件7");
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
      fellowProgressState: [{ ...junior, id: "junior-talent-test", taskProgress: 18 }],
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
    expect(relationHtml).not.toContain('data-talent-item-id="fellow-junior-talent-test"');
    expect(relationHtml).toContain('data-talent-item-id="joint-training"');
    expect(getTalentCardHtml(relationHtml, "joint-training")).toContain("具体天赋效果待定");
    expect(getTalentCardHtml(relationHtml, "advisor")).toContain("导师晋升");
    const advisorTalent = getTalentCardHtml(relationHtml, "advisor");
    expect(advisorTalent).toContain("各职称每月补助，单位金币");
    expect(advisorTalent).toContain('<th scope="col">硕士/月</th>');
    expect(advisorTalent).toContain('<th scope="col">博士/月</th>');
    const salaryRows = [
      ["讲师", "—", 1, 3], ["副教授", "青基", 1.25, 3.5], ["教授·四级", "面上", 1.5, 4],
      ["教授·三级", "优青", 1.75, 4.5], ["教授·二级", "杰青", 2, 5], ["教授·一级", "院士", 2.25, 5.5],
    ];
    for (let startIndex = 0; startIndex < 5; startIndex += 1) {
      const page = getTalentCardHtml(renderApp(state, createDefaultAccountProfile(), {
        activeTalentTab: "relation", advisorSalaryStartIndex: startIndex,
      }), "advisor");
      expect(page.match(/scope="row"/g)).toHaveLength(2);
      for (const [rank, condition, master, phd] of salaryRows.slice(startIndex, startIndex + 2)) {
        expect(page).toContain(`<th scope="row">${rank}</th><td>${condition}</td><td>${master}</td><td>${phd}</td>`);
      }
    }
    expect(getTalentCardHtml(relationHtml, "advisor")).not.toContain("具体天赋效果待定");
    expect(relationHtml).not.toMatch(/导师科研资源|导师资源提升|导师任务循环/);
    expect(relationHtml).toContain('data-talent-item-id="internship"');
    expect(relationHtml).not.toContain('data-talent-item-id="lab-talent"');
    expect(relationHtml).not.toContain("实验室互帮互助");
    expect(relationHtml).toContain('data-talent-item-id="lab-mutual-growth"');
    expect(relationHtml).not.toContain('data-talent-item-id="fellow-publication-growth"');
    expect(relationHtml).toContain("导师视为1人，恋人不计");
    expect(relationHtml).toContain('data-talent-item-id="lover"');

    const equipHtml = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "equip" });
    expect(equipHtml).toContain('data-talent-panel-tab="equip"');
    expect(equipHtml).toContain('data-talent-item-id="full-gear"');
    expect(equipHtml).toContain('data-talent-item-id="perfect-workstation"');
    expect(equipHtml).toContain('data-talent-item-id="ai-collaboration"');
    const fullGearCard = getTalentCardHtml(equipHtml, "full-gear");
    const inactiveAiCard = getTalentCardHtml(equipHtml, "ai-collaboration");
    expect(fullGearCard).toContain("激活后小电驴效果改为春夏秋冬 SAN +1");
    expect(fullGearCard.match(/class="talent-item-metric"/g) ?? []).toHaveLength(3);
    for (const itemName of ["小电驴", "遮阳伞", "羽绒服"]) {
      expect(fullGearCard).toMatch(new RegExp(`<span>${itemName}</span>\\s*<strong>✅</strong>`));
    }
    const perfectWorkstationCard = getTalentCardHtml(equipHtml, "perfect-workstation");
    expect(perfectWorkstationCard).toContain("idea、实验、论文永久+1分");
    expect(perfectWorkstationCard.match(/class="talent-item-metric"/g) ?? []).toHaveLength(4);
    expect(inactiveAiCard).toContain("激活后可额外进行 1 次科研操作，额外操作不消耗行动点，但 SAN 消耗 +2");
    expect(inactiveAiCard).toContain('class="talent-item-tag is-inactive">未激活</span>');
    expect(inactiveAiCard.match(/class="talent-item-metric"/g) ?? []).toHaveLength(3);
    for (const modelLabel of ["GPT/Claude", "AI·Ⅱ", "AI·Ⅲ"]) {
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
    for (const modelLabel of ["GPT/Claude", "AI·Ⅱ", "AI·Ⅲ"]) {
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

  it("fits six future events on one agenda page", () => {
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
    expect(firstPage).toContain('data-pending-page-count="1"');
    expect(firstPage).toMatch(/id="pending-nav-prev"[^>]*disabled/);
    expect(firstPage).toMatch(/id="pending-nav-next"[^>]*disabled/);
    expect((firstPage.match(/class="todo-item todo-preview-item/g) ?? [])).toHaveLength(6);
    expect(firstPage).toContain("年会");
    expect(firstPage).toContain("指导新生");

    expect(secondPage).toContain('data-pending-page-index="0"');
    expect(secondPage).toMatch(/id="pending-nav-prev"[^>]*disabled/);
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

  it("keeps long interactive tooltips compact and multiline", () => {
    const html = renderApp(createAdmittedTestState(), createDefaultAccountProfile());
    expect(html).toContain("pending-event-blocking-toggle play-tooltip");
    expect(html).toContain("无分支事件：阻塞，需手动处理。\n点击切换为不阻塞");
    expect(html).toContain("class=\"new-attr-level attr-level-research\"");
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
    expect(springHtml).toContain("SAN消耗 -1");
    expect(springHtml).toContain('data-effect-sources="[&quot;春季：SAN消耗 -1&quot;]"');
    expect(summerHtml).toContain("SAN消耗 +1");
    expect(summerHtml).toContain('data-effect-sources="[&quot;夏季：SAN消耗 +1&quot;]"');
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
    expect(summerHtml).not.toContain(">SAN消耗 +1</button>");
    expect(winterHtml).not.toContain("冬季寒冷已抵消");
    expect(winterHtml).not.toContain("月初 SAN-1（已结算）");
  });

  it("does not render a season effect before enrollment", () => {
    let state = dispatchAction(createInitialState(), "select-role", { roleId: "normal" });
    state = dispatchAction(state, "start-game", { roleId: "normal" });
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain("SAN消耗 -1");
    expect(html).not.toContain("SAN消耗 +1");
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

    const permanentEffects = html.match(/id="new-permanent-effect-list">([\s\S]*?)<\/div>/u)?.[1] ?? "";
    expect(permanentEffects.trim()).toBe("");
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
    expect(html).toMatch(/class="effect-chip is-[^"]+ is-debuff"/);
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
    let state = createAdmittedTestState();
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
    expect(nextMonthEffects).not.toContain("长期带教");
    expect(permanentEffects).not.toContain("发展关系");
    expect(permanentEffects).not.toContain("+1次");
    expect(permanentEffects).toContain("恋人学习 · 永久");
    expect(permanentEffects).toContain("实验 +1分");
    expect(permanentEffects).toContain("论文 +1分");
    expect(monthlyEffects).toContain("SAN消耗 -1");
    expect(nextMonthEffects).not.toContain("羽毛球获胜");
    expect(state.buffs.some((buff) => buff.id === "debug-buff-strong-body")).toBe(false);
    expect(nextMonthEffects).toContain("硕士工资：每月 +1");
    expect(nextMonthEffects).toContain("金币 +1");
    expect(nextMonthEffects).toContain('data-effect-id="next-month-san"');
    expect(nextMonthEffects).toContain('data-effect-id="next-month-money"');
    expect(html).not.toContain("调试工具");
    expect(html).not.toContain("基础规则、导师待遇、羽毛球冠军");
    expect(html).not.toContain("自动idea+4分");
    expect(html).not.toContain("自动论文+2分");
    expect(html).not.toContain("每 12 月自动合作论文");
    expect(html).toContain("SAN消耗 ×1.5");
    expect(html).toContain("看论文 SAN -2");
    expect(html).toContain("看论文 +1次");
    expect(html).not.toContain("自动看论文 +1次");
    expect(html).toContain("人际操作 SAN -1");
    expect(html).toContain("实验 总分 ×0.25");
    expect(html).not.toContain("人物影响");
    expect(html).not.toContain("下篇论文宣传×1.1");
    expect(html).toContain("下次效果");

    expect(html).not.toMatch(/class="effect-chip[^"]*"[^>]*title=/u);
    const buckets = buildBuffDisplayBuckets(state.buffs);
    const aiIdeaEffect = buckets.monthly.find((item) => item.id === "monthly:action:idea:bonus:ai");
    expect(aiIdeaEffect?.sources).toEqual([
      expect.stringContaining("商店 GPT-6-Astra · 剩余 1 月"),
      expect.stringContaining("商店 豆包 Seed 4 · 剩余 1 月"),
    ]);
    expect(aiIdeaEffect?.sources.join("、")).not.toContain("肚子虚弱");

    const illnessEffect = buckets.monthly.find((item) => item.label === "SAN消耗 ×1.5");
    expect(illnessEffect?.sources).toEqual(["肚子虚弱 · 持续生效"]);
    expect(illnessEffect?.sources.join("、")).not.toContain("商店");

    expect(buckets.monthly.find((item) => item.label === "每月 SAN -2")).toBeUndefined();
  });

  it.each([
    { remaining: 1, san: 0, discount: -1 },
    { remaining: 1, san: 2, discount: -1 },
    { remaining: 0, san: 0, discount: 0 },
  ])("uses active discounts for paper promotion costs and availability at SAN $san, remaining $remaining", ({ remaining, san, discount }) => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.player.san = san;
    state.papers = [createPublishedPaper(0, "宣传折扣测试", "A", 100, 0)];
    state.buffs = [{ id: "lover-play-discount", name: "约会余韵", source: "恋人玩耍", timing: "monthly", remainingMonths: remaining, activeOperationSanDelta: -1 }];
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "research" });
    const buttons = html.match(/<button\s+class="research-promotion-btn[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(3);
    const baseCosts = [2, 4, 3];
    buttons.forEach((button, index) => {
      const cost = Math.max(0, baseCosts[index]! + discount);
      expect(button).toContain(`<small>SAN -${cost}</small>`);
      expect(button.includes("disabled")).toBe(san < cost);
      if (san < cost) expect(button).toContain(`SAN 不足，需要 ${cost}`);
    });
  });

  it("presents real lover study bonuses permanently and play discounts only when they become active", () => {
    let state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.buffs = [];
    state.player.money = 20;
    state.player.san = 20;
    state.loverProgressState.routes!.study = { progress: 99, completed: 1 };
    state = dispatchAction(state, "lover-study");
    expect(state.buffs.find((buff) => buff.id === "lover-study-score")?.actionEffects?.writing?.bonus).toBe(1);
    const permanent = renderApp(state).split('id="new-permanent-effect-list">')[1]?.split('</div>')[0] ?? "";
    for (const label of ["idea +1分", "实验 +1分", "论文 +1分"]) expect(permanent).toContain(label);
    expect(permanent).toContain("恋人学习 · 永久");

    state.totalMonths += 1;
    state.loverProgressState.taskUsedThisMonth = false;
    state.loverProgressState.routes!.play = { progress: 99, completed: 2 };
    state = dispatchAction(state, "lover-play");
    expect(state.loverProgressState.sanDiscountMonths).toContain(state.totalMonths + 1);
    const pendingHtml = renderApp(state);
    const pending = pendingHtml.split('id="new-next-month-effect-list">')[1]?.split('</div>')[0] ?? "";
    const current = pendingHtml.split('id="new-monthly-effect-list">')[1]?.split('</div>')[0] ?? "";
    expect(pending).toContain('data-effect-id="next-month-lover-play-discount-');
    expect(pending).toContain("SAN消耗 -1");
    expect(current).not.toContain("active-operation-san-delta");
    expect(getRelationshipCardHtml(pendingHtml, "advisor")).toContain('class="rel-action-cost">SAN-5</span>');

    state = advanceLoverMonth({ ...state, totalMonths: state.totalMonths + 1 });
    expect(state.buffs.find((buff) => buff.id === "lover-play-discount")?.activeOperationSanDelta).toBe(-1);
    const activeHtml = renderApp(state);
    const active = activeHtml.split('id="new-monthly-effect-list">')[1]?.split('</div>')[0] ?? "";
    const chip = active.match(/<button[^>]*data-effect-id="monthly:rule:active-operation-san-delta-[^"]+"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(chip).toContain("SAN消耗 -1");
    expect(chip).toContain("恋人玩耍 · 剩余 1 月");
    expect(chip).not.toContain("is-debuff");
    expect(activeHtml).not.toContain('data-effect-id="next-month-lover-play-discount-');
    expect(getRelationshipCardHtml(activeHtml, "advisor")).toContain('class="rel-action-cost">SAN-4</span>');
    const study = getRelationshipCardHtml(activeHtml, "lover").match(/<button[^>]*data-action="lover-study"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(study).toContain('class="rel-action-cost">SAN-3</span>');
  });

  it.each([
    { deltas: [-1, -2], expired: 0, total: -3 },
    { deltas: [-1, 2], expired: -10, total: 1 },
    { deltas: [-1, 1], expired: -2, total: 0 },
    { deltas: [], expired: -1, total: 0 },
  ])("aggregates active SAN cost effects $deltas and ignores expired $expired", ({ deltas, expired, total }) => {
    const state = createRelationshipCardTestState();
    state.month = 1;
    state.totalMonths = 1;
    state.buffs = [...deltas, expired].map((delta, index) => ({
      id: `san-cost-${index}`, name: "操作消耗", source: `来源${index}`, timing: "monthly", remainingMonths: index === deltas.length ? 0 : 1,
      activeOperationSanDelta: delta,
    }));
    const html = renderApp(state);
    const chip = html.match(/<button[^>]*data-effect-id="monthly:rule:active-operation-san-delta-[^"]+"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    if (deltas.length === 0) expect(chip).toBe("");
    else {
      expect(chip).toContain(`SAN消耗 ${total >= 0 ? "+" : ""}${total}`);
      expect(chip.includes("is-debuff")).toBe(total > 0);
      deltas.forEach((_, index) => expect(chip).toContain(`来源${index}`));
      expect(chip).not.toContain(`来源${deltas.length}`);
    }
  });

  it.each([
    { month: 11, parasol: false, expected: "+0", season: "夏季：SAN消耗 +1" },
    { month: 8, parasol: false, expected: "-2", season: "春季：SAN消耗 -1" },
    { month: 11, parasol: true, expected: "-1", season: null },
  ])("merges seasonal and monthly SAN costs in month $month with parasol $parasol", ({ month, parasol, expected, season }) => {
    const base = createAdmittedTestState();
    const state = {
      ...base, month, totalMonths: month,
      eventSupport: { ...base.eventSupport, hasParasol: parasol },
      buffs: [{ id: "lover-play-discount", name: "约会余韵", source: "恋人玩耍", timing: "monthly" as const, remainingMonths: 1, activeOperationSanDelta: -1 }],
    };
    const html = renderApp(state);
    const monthly = html.split('id="new-monthly-effect-list">')[1]?.split('</div>')[0] ?? "";
    const chips = monthly.match(/<button[^>]*data-effect-id="monthly:rule:active-operation-san-delta-[^"]+"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain(`SAN消耗 ${expected}`);
    expect(chips[0]).toContain("恋人玩耍 · 剩余 1 月 · SAN消耗 -1");
    expect(chips[0]).not.toContain("is-debuff");
    if (season) expect(chips[0]).toContain(season);
    else expect(chips[0]).not.toContain("夏季");
    expect(monthly).not.toContain("主动操作 SAN+1");
    expect(monthly).not.toContain("主动操作 SAN-1");
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
    expect(html).not.toContain("指导师弟师妹：长期带教 -2");
    expect(html).toContain('data-effect-id="next-month-san"');
  });

  it("removes obsolete debug effects while preserving earned buffs", () => {
    const earnedBuff = { id: "lover-study-score", name: "共同学习", source: "恋人约会", timing: "permanent" as const,
      remainingMonths: null, actionEffects: { idea: { bonus: 3 }, experiment: { bonus: 3 }, writing: { bonus: 3 } } };
    const state = {
      ...createAdmittedTestState(),
      buffs: [...createDebugBuffs(), earnedBuff, ...["debug-buff-lover", "debug-buff-mentoring", "debug-buff-base-recovery", "debug-buff-advisor-salary"].map((id) => ({
        id, name: "旧调试效果", source: "调试", timing: "permanent" as const, remainingMonths: null, monthlyStats: { san: -2 },
      }))],
    };
    const next = dispatchAction(state, "debug-add-all-buffs");
    expect(next.buffs).toContainEqual(earnedBuff);
    expect(next.buffs).toHaveLength(createDebugBuffs().length + 1);
    expect(next.buffs.some((buff) => buff.name === "旧调试效果" || buff.scheduledPublication)).toBe(false);
    expect(dispatchAction(next, "debug-add-all-buffs")).toEqual(next);
  });

  it("renders every gameplay module during development before enrollment", () => {
    let state = createAdmittedTestState();
    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).not.toContain('class="section-empty play-module-lock-state">入学后开放<\/div>');
    expect(html).not.toContain('class="shop-ai-note panel-tip-note"');
    expect(html.match(/class="play-help-panel\b/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-help-context="events"');
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
        taskMax: 100,
      }],
    };

    const advisorHtml = renderApp(state, createDefaultAccountProfile());
    expect(advisorHtml).toContain('id="rel-card-grid"');
    expect((advisorHtml.match(/class="rel-card /g) ?? [])).toHaveLength(6);
    expect(advisorHtml).toContain("社交达到6");
    expect(advisorHtml).toContain("合群");
    expect(advisorHtml).toContain("💕");
    expect(advisorHtml).toContain("恋爱后解锁");
    const inactiveRelationshipCards = advisorHtml.match(/<article class="rel-card (?:locked|empty)[^"]*"[\s\S]*?<\/article>/g) ?? [];
    expect(inactiveRelationshipCards.length).toBeGreaterThan(0);
    expect(inactiveRelationshipCards.every((card) => card.includes('class="rel-card-header rel-card-empty-header"'))).toBe(true);
    expect(advisorHtml).not.toContain('class="rel-switch-badge is-task"');
    const advisorCard = getRelationshipCardHtml(advisorHtml, "advisor");
    expect(advisorCard).not.toMatch(/rel-actions|>做项目<|>交流</);
    expect(advisorCard).toContain('data-action="advisor-horizontal"');
    expect(advisorHtml).not.toContain('data-action="advance-advisor-task"');
    expect(advisorHtml).toContain("李旭霖 🎓 讲师");
    expect(advisorHtml).not.toContain("副教授");
    expect(advisorCard).toContain('科研积累</span>');
    expect(advisorCard).toContain('class="rel-detail-label">科研经费</span>');

    const fellowHtml = renderApp(state, createDefaultAccountProfile(), { activeRelationshipIndex: 1 });
    expect(getRelationshipCardHtml(fellowHtml, "junior")).toContain("师妹");
    expect(fellowHtml).toContain("小李");
    expect(fellowHtml).toContain('data-relationship-id=');
    expect(fellowHtml).not.toContain('data-action="advance-fellow-task"');
    expect(getRelationshipCardHtml(fellowHtml, "junior")).toMatch(/rel-progress-header[^>]*>[\s\S]*?<button[^>]*data-action="relationship-task"/);
    expect(fellowHtml).not.toContain('class="rel-progress-label">关系积累</span>');
    expect(getRelationshipCardHtml(fellowHtml, "junior")).toContain('role="progressbar" aria-label="协作进度"');
  });

  it("shows uncapped funding and separate research and project progress with the application countdown", () => {
    const state = createAdmittedTestState();
    state.month = 1;
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(card).toContain('aria-label="科研积累" aria-valuemin="0" aria-valuemax="25" aria-valuenow="20"');
    expect(card).toContain('<strong class="rel-progress-val" aria-label="科研经费">10</strong>');
    expect(card).toContain('20/25青基');
    expect(card).toContain('6个月后可申请青基');
    expect(card).toContain('玩家和同学发表论文按科研分计入，同篇去重');
    const header = card.split('class="rel-advisor-status"')[0]!;
    expect(header).toContain('aria-label="科研经费"');
    expect(card).not.toContain('rel-advisor-summary');
    expect(card).toContain('role="progressbar" aria-label="横向项目" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"');
    expect(card).toContain('role="progressbar" aria-label="纵向项目" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"');
    expect(card).not.toContain('role="progressbar" aria-label="科研经费"');
    expect(card.indexOf('aria-label="科研积累"')).toBeLessThan(card.indexOf('data-action="advisor-horizontal"'));
    expect(card).not.toMatch(/科研资源|信任度|rel-known-time|rel-card-meta/);
  });

  it.each([
    { score: 30, max: 50, reached: "青基", target: "面上", ratio: "30/25" },
    { score: 50, max: 150, reached: "面上", target: "优青", ratio: "50/50" },
    { score: 1200, max: 1000, reached: "院士", target: null, ratio: "1200/1000" },
  ])("uses the next research threshold at accumulation $score", ({ score, max, reached, target, ratio }) => {
    const state = createAdmittedTestState();
    state.advisorProgressState.researchAccumulation = score;
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(card).toContain(`已达到${reached}：${ratio}`);
    if (target) expect(card).toContain(`${score}/${max}${target}`);
    const application = card.match(/<span class="rel-advisor-countdown"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "";
    expect(application).toContain("个月后");
    expect(application).not.toContain(ratio);
    if (target) expect(application).not.toContain(target);
    expect(card).toContain(`aria-label="科研积累" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(score, max)}"`);
  });

  it.each([[1, 6], [6, 1], [7, 12], [12, 7]])("counts down from academic month %i to March", (month, remaining) => {
    const state = createAdmittedTestState();
    state.month = month;
    expect(getRelationshipCardHtml(renderApp(state), "advisor")).toContain(`${remaining}个月后可申请青基`);
  });

  it("renders current mentor activity without the removed growth-source strip", () => {
    const state = createAdmittedTestState();
    state.advisorProgressState.monthlyActivity = "推进横向项目 +10";
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(card).toContain("推进横向项目 +10");
    expect(card).not.toContain("rel-advisor-growth-sources");
  });

  it.each([
    { san: 4, funding: 0, phase: "playing", disabled: true, reason: "SAN不足" },
    { san: 5, funding: 19, phase: "playing", disabled: false, reason: "" },
    { san: 20, funding: 20, phase: "playing", disabled: false, reason: "" },
    { san: 20, funding: 0, phase: "finished", disabled: true, reason: "本轮未在进行" },
  ] as const)("gates horizontal work at SAN $san, funding $funding and phase $phase", (testCase) => {
    const state = createRelationshipCardTestState(true);
    state.player.san = testCase.san;
    state.advisorProgressState.funding = testCase.funding;
    state.actionState.used = state.actionState.limit;
    state.phase = testCase.phase;
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    const button = card.match(/<button[^>]*data-action="advisor-horizontal"[^>]*>/)?.[0] ?? "";
    expect(button).not.toBe("");
    expect(button.includes('disabled aria-disabled="true"')).toBe(testCase.disabled);
    if (testCase.reason) expect(button).toContain(testCase.reason);
    expect(button).toContain("不消耗行动点，每月二选一");
  });

  it.each([
    { delta: -1, remaining: 1, san: 4, cost: 4, disabled: false },
    { delta: -1, remaining: 1, san: 3, cost: 4, disabled: true },
    { delta: -8, remaining: 1, san: 0, cost: 0, disabled: false },
    { delta: 2, remaining: 1, san: 6, cost: 7, disabled: true },
    { delta: -1, remaining: 0, san: 4, cost: 5, disabled: true },
  ])("matches advisor horizontal UI and core cost $cost with SAN $san and delta $delta", ({ delta, remaining, san, cost, disabled }) => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.player.san = san;
    state.buffs = [{ id: "lover-play-discount", name: "约会余韵", source: "恋人玩耍", timing: "monthly", remainingMonths: remaining, activeOperationSanDelta: delta }];
    const button = getRelationshipCardHtml(renderApp(state), "advisor").match(/<button[^>]*data-action="advisor-horizontal"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(button).toContain(`class="rel-action-cost">SAN-${cost}</span>`);
    expect(button.includes('disabled aria-disabled="true"')).toBe(disabled);
    if (disabled) expect(button).toContain(`SAN不足，需要${cost}`);
    const next = dispatchAction(state, "advisor-horizontal");
    expect(next.player.san).toBe(disabled ? san : san - cost);
    if (disabled) expect(next.advisorProgressState.horizontalProgress).toBe(state.advisorProgressState.horizontalProgress);
    else expect(next.advisorProgressState.horizontalProgress).toBeGreaterThan(state.advisorProgressState.horizontalProgress ?? 0);
    if (!disabled) {
      const used = getRelationshipCardHtml(renderApp(next), "advisor").match(/<button[^>]*data-action="advisor-horizontal"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
      expect(used).toContain('disabled aria-disabled="true"');
      expect(used).not.toContain('class="rel-action-cost"');
    }
  });

  it("disables horizontal work after use and restores it next month", () => {
    const state = createRelationshipCardTestState();
    state.advisorProgressState.lastPlayerProjectTotalMonths = state.totalMonths;
    const buttonFor = () => getRelationshipCardHtml(renderApp(state), "advisor").match(/<button[^>]*data-action="advisor-horizontal"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(buttonFor()).toContain('disabled aria-disabled="true"');
    expect(buttonFor()).toContain("下月恢复");
    expect(buttonFor()).not.toContain("SAN-5");
    state.totalMonths += 1;
    expect(buttonFor()).not.toContain("disabled");
    expect(buttonFor()).toContain("SAN-5");
  });

  it("omits horizontal work when there is no advisor", () => {
    const state = createRelationshipCardTestState();
    state.selectedAdvisorName = null;
    state.relationshipState.advisorCount = 0;
    expect(renderApp(state)).not.toContain('data-action="advisor-horizontal"');
  });

  it.each([
    ["youth", "副教授"], ["general", "教授·四级"], ["excellent", "教授·三级"],
    ["distinguished", "教授·二级"], ["academician", "教授·一级"],
  ] satisfies Array<[AdvisorGrantId, string]>)("renders the actual rank after the %s award", (id, rank) => {
    const state = createRelationshipCardTestState();
    state.advisorProgressState.awards = [{ id, awardedYear: 2024, startYear: null, endYear: null }];
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(card).toContain(`李旭霖 🎓 ${rank}`);
    expect(card).toContain('class="rel-advisor-grants" title=');
    expect(card.match(/role="progressbar"/g)).toHaveLength(3);
  });

  it("shows the pending result countdown and keeps award periods in the header fund tooltip", () => {
    const state = createRelationshipCardTestState();
    state.year = 3;
    state.month = 7;
    state.advisorProgressState.awards = [
      { id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 },
      { id: "general", awardedYear: 2024, startYear: 2025, endYear: 2028 },
    ];
    state.advisorProgressState.pendingApplication = { id: "excellent", calendarYear: 2026, researchSnapshot: 150 };
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(card).toContain("优青申请中 · 5个月后公布");
    expect(card).toContain("在研基金<strong>1/2</strong>");
    expect(card).toContain("2024–2026年，在研");
    expect(card).toContain("2025–2028年，在研");
    expect(card).not.toContain("rel-advisor-award");
    state.year = 4;
    const nextYearCard = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(nextYearCard).toContain("2024–2026年，已结题");
  });

  it.each([
    { type: "advisor", name: "李旭霖 🎓 讲师", role: "导师", months: 12, fraction: "", action: "做横向", cost: "SAN-5" },
    { type: "senior", name: "小明", role: "师姐", months: 8, fraction: "15/100", action: "科研协作", cost: "SAN-4" },
    { type: "junior", name: "小李", role: "师妹", months: 8, fraction: "15/100", action: "科研协作", cost: "SAN-2" },
    { type: "peer", name: "小刚", role: "同门", months: 8, fraction: "15/100", action: "科研协作", cost: "SAN-3" },
  ] as const)("separates identity, attributes, progress and action costs for $type", (expected) => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    const stateBeforeRender = structuredClone(state);
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "relationship" });
    const card = getRelationshipCardHtml(html, expected.type);
    const fellow = state.fellowProgressState.find((profile) => profile.type === expected.type);
    const meta = card.match(/<div class="rel-card-meta">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const headerMain = card.match(/<div class="rel-header-main">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const attributes = headerMain;
    const attributePairs = attributes.match(/<span class="rel-detail-item">[\s\S]*?<\/strong>\s*<\/span>/g) ?? [];
    const headers = card.match(/<div class="rel-progress-header">[\s\S]*?<\/div>/g) ?? [];
    const notes = [...card.matchAll(/<div class="rel-progress-note"[^>]*>([^<]*)<\/div>/g)].map((match) => match[1]);
    const buttons = card.match(/<button class="btn-sm rel-action-btn[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const resourceLabel = expected.type === "advisor" ? "科研积累" : "科研";
    const affinityLabel = expected.type === "advisor" ? "科研经费" : "默契";
    const cost = fellow ? `SAN-${getFellowDiscussionSanCost(state, fellow)}` : expected.cost;

    expect(html.match(/class="rel-card /g) ?? []).toHaveLength(6);
    expect(html.match(/class="rel-card filled[^"]*"/g) ?? []).toHaveLength(5);
    expect(card).toContain(`data-relationship-type="${expected.type}"`);
    expect(card).toMatch(/class="rel-card filled rel-card-compact(?: rel-card-fellow)?"/);
    if (fellow) expect(card).toContain("rel-card-fellow");
    expect(card).toMatch(/<div class="rel-card-identity">\s*<div class="rel-card-head rel-card-header paper-card-header">/);
    expect(card).toContain(`data-rel-type-pill="${expected.type}">${expected.role}</span>`);
    expect(card).toContain(`<strong class="rel-name">${expected.name}</strong>`);
    expect(card).not.toContain("rel-card-alert");
    if (expected.type !== "advisor") {
      expect(meta).toContain('class="rel-known-time"');
      expect(meta).toContain(`认识<strong class="rel-detail-value">${expected.months}</strong>月</span>`);
      expect(headerMain).toContain(`<strong class="rel-name">${expected.name}</strong>`);
      expect(headerMain).toContain(`data-rel-type-pill="${expected.type}">${expected.role}</span>`);
      expect(meta).toContain('data-action="end-relationship"');
      expect(attributes).not.toContain("rel-known-time");
      expect(attributes).not.toContain('data-action="end-relationship"');
      expect(card.indexOf(headerMain)).toBeLessThan(card.indexOf(meta));
      expect(meta).toMatch(new RegExp(`月</span>\\s*<button class="rel-end-compact"[^>]*><span aria-hidden="true">${fellow ? "✂️" : "💔"}</span></button>\\s*$`));
      expect(meta).toContain(`title="${fellow ? "停止合作" : "分手"}" aria-label="${fellow ? "停止合作" : "分手"}"`);
    } else {
      expect(card).not.toContain('class="rel-card-meta"');
    }
    expect(card.match(/class="rel-known-time"/g) ?? []).toHaveLength(expected.type === "advisor" ? 0 : 1);
    expect(attributes).not.toContain("认识时间");
    expect(attributePairs).toHaveLength(expected.type === "advisor" ? 0 : 2);
    if (expected.type !== "advisor") {
      expect(attributePairs[0]).toMatch(new RegExp(`^<span class="rel-detail-item">\\s*<span class="rel-detail-label">${resourceLabel}</span>\\s*<strong class="rel-detail-value">7/20</strong>\\s*</span>$`));
      expect(attributePairs[1]).toMatch(new RegExp(`^<span class="rel-detail-item">\\s*<span class="rel-detail-label">${affinityLabel}</span>\\s*<strong class="rel-detail-value">4/20</strong>\\s*</span>$`));
      expect(attributes.match(/class="rel-detail-label"/g) ?? []).toHaveLength(2);
      expect(attributes.match(/class="rel-detail-value"/g) ?? []).toHaveLength(2);
    }

    expect(notes).toEqual([]);
    expect(card).not.toMatch(/关系积累|rel-progress-label|rel-progress-fill relation|免费推进|rel-collaboration-picker|class="rel-actions"|rel-help-status|relationship-chat|relationship-collaborate|<select/);
    expect(headers).toHaveLength(expected.type === "advisor" ? 0 : 1);
    expect(buttons).toHaveLength(expected.type === "advisor" ? 2 : 1);
    if (expected.type === "advisor") {
      expect(card).not.toMatch(/>做项目<|科研资源|信任度/);
      expect(buttons[0]).toContain('data-action="advisor-horizontal"');
      expect(buttons[0]).toContain('class="rel-action-label">做横向</span>');
      expect(buttons[0]).toContain('class="rel-action-cost">SAN-5</span>');
      expect(card).toContain('aria-label="科研经费"');
      expect(card).toContain('class="rel-progress-val" aria-label="科研经费">4</strong>');
      expect(buttons[0]).not.toContain("disabled");
    } else {
      if (fellow) {
        expect(headers[0]).toMatch(/^<div class="rel-progress-header">\s*<span class="rel-detail-label"[^>]*>.*协作进度<\/span>/);
        expect(headers[0]).toContain(`<span class="rel-progress-val">${expected.fraction}</span>`);
      } else {
        expect(headers[0]).toMatch(/^<div class="rel-progress-header">\s*<button/);
        expect(headers[0]).toMatch(new RegExp(`</button>\\s*<span class="rel-progress-val">${expected.fraction}</span>\\s*</div>$`));
      }
      if (fellow) expect(card).toContain('role="progressbar" aria-label="协作进度"');
      expect(card).toContain(`class="rel-progress-fill task cooperation" style="width:${fellow ? 15 : 25}%"`);
      expect(card.match(/class="rel-progress-bar"/g)).toHaveLength(1);
      expect(buttons[0]).toMatch(new RegExp(`<span class="rel-action-label">${expected.action}</span>\\s*<span class="rel-action-cost">${cost}</span>`));
      expect(buttons[0]?.replace(/<[^>]*>/g, "")).not.toMatch(/[（）]|本月已用/);
      if (!fellow) expect(headers[0]).toContain(buttons[0]);
    }

    if (fellow) {
      expect(buttons[0]).toContain('data-action="relationship-task"');
      expect(buttons[0]).not.toMatch(/disabled|deferred/);
      expect(card).not.toContain('满100自动互助');
    }
    if (expected.type !== "advisor") {
      const endButton = card.match(/<button[^>]*data-action="end-relationship"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
      expect(endButton).toContain('data-relationship-id=');
      expect(endButton).toContain('class="rel-end-compact"');
    }
    expect(state).toEqual(stateBeforeRender);
  });

  it.each(["beautiful", "smart"] as const)("renders three live %s lover routes with separate actions and reward previews", (type) => {
    const state = createRelationshipCardTestState();
    state.loverState.type = type;
    state.eventQueue = [];
    state.player.money = 20;
    state.player.san = 20;
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "lover");
    const labels = ["玩耍", "学习", "购物"];
    const progressValues = [25, 60, 95];
    expect(card).toContain("rel-card-lover");
    expect(card).toContain('data-rel-type-pill="lover"');
    expect(card).toContain('<strong class="rel-name">林知远</strong>');
    expect(card).toMatch(/科研<\/span>\s*<strong class="rel-detail-value">7\/20<\/strong>/);
    expect(card).toMatch(/亲密<\/span>\s*<strong class="rel-detail-value">4\/20<\/strong>/);
    expect(card).toContain('data-action="end-relationship" data-relationship-id="lover"');
    expect(card.match(/role="progressbar"/g)).toHaveLength(3);
    for (const [index, route] of LOVER_ROUTES.entries()) {
      const row = card.split(`data-lover-route="${route}"`)[1]?.split('</button>')[0] ?? "";
      const button = row.match(/<button[^>]*>[\s\S]*$/)?.[0] ?? "";
      const cost = getLoverRouteCost(state, route);
      expect(row).toContain(`>${labels[index]}</span>`);
      expect(row).toContain(`aria-valuenow="${progressValues[index]}"`);
      expect(row).toContain(`style="width:${progressValues[index]}%"`);
      expect(row).toContain(`${progressValues[index]}/100`);
      expect(row).toContain('data-relationship-tooltip data-tooltip=');
      expect(row).toContain("下次满100");
      expect(row).toContain("下次满100");
      expect(row).toContain(getLoverNextReward(state, route).replace("永久idea、实验、写作各+1分", "论文三项分数永久+1"));
      expect(row).toContain('data-relationship-tooltip data-tooltip=');
      expect(button).toContain(`data-action="lover-${route}"`);
      expect(button).toContain(`class="rel-action-label">${labels[index]}</span>`);
      expect(button).not.toContain("约会·");
      if (cost.money > 0) expect(button).toContain(`金币-${cost.money}`);
      if (cost.san > 0) expect(button).toContain(`SAN-${cost.san}`);
      expect(button).not.toMatch(/disabled|data-relationship-id|data-route|data-payload/);
    }
    expect(card).not.toMatch(/待定|待开放|本月已用|关系积累|rel-paper-section/);
    expect(state).toEqual(before);
  });

  it.each([0, 1, 2, 3])("shows the next lover reward after %s completed cycles without changing progress", (completed) => {
    const state = createRelationshipCardTestState();
    for (const route of LOVER_ROUTES) state.loverProgressState.routes![route].completed = completed;
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "lover");
    for (const route of LOVER_ROUTES) {
      const row = card.split(`data-lover-route="${route}"`)[1]?.split('</button>')[0] ?? "";
      expect(row).toContain("下次满100");
      expect(row).toContain(getLoverNextReward(state, route).replace("永久idea、实验、写作各+1分", "论文三项分数永久+1"));
      expect(card).not.toContain('rel-lover-reward-ticker');
    }
    expect(state).toEqual(before);
  });

  it.each(["taskUsedThisMonth", "lastDateTotalMonths"] as const)("disables every lover date and hides every cost after the shared limit via %s", (field) => {
    const state = createRelationshipCardTestState();
    if (field === "taskUsedThisMonth") state.loverProgressState.taskUsedThisMonth = true;
    else state.loverProgressState.lastDateTotalMonths = state.totalMonths;
    const card = getRelationshipCardHtml(renderApp(state), "lover");
    const buttons = card.match(/<button[^>]*data-action="lover-[^"]+"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => {
      expect(button).toContain('disabled aria-disabled="true"');
      expect(button).not.toMatch(/rel-action-cost|金币-|SAN-|本月已用/);
      expect(button).toContain("下月可再次约会");
    });
  });

  it.each([
    { money: 0, san: 20, blocked: [true, false, true] },
    { money: 20, san: 0, blocked: [false, true, false] },
  ])("disables only unaffordable lover dates with money $money and SAN $san", ({ money, san, blocked }) => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.player.money = money;
    state.player.san = san;
    const card = getRelationshipCardHtml(renderApp(state), "lover");
    LOVER_ROUTES.forEach((route, index) => {
      const button = card.match(new RegExp(`<button[^>]*data-action="lover-${route}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? "";
      expect(button).not.toBe("");
      expect(button.includes('disabled aria-disabled="true"')).toBe(blocked[index]);
      expect(button).toContain('class="rel-action-cost"');
    });
  });

  it("renders absent lover route fields without mutating state and restores dates in a later month", () => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.player.money = 20;
    state.player.san = 20;
    delete state.loverProgressState.routes;
    delete state.loverProgressState.giftCoupons;
    state.loverProgressState.lastDateTotalMonths = state.totalMonths - 1;
    const before = structuredClone(state);
    const html = renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "relation" });
    const card = getRelationshipCardHtml(html, "lover");
    const buttons = card.match(/<button[^>]*data-action="lover-[^"]+"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => expect(button).not.toContain("disabled"));
    expect(card).not.toMatch(/NaN|undefined/);
    expect(getTalentCardHtml(html, "lover")).toContain("恋人");
    expect(getTalentCardHtml(html, "lover")).not.toMatch(/NaN|undefined/);
    expect(state).toEqual(before);
  });

  it("shows the relationship talent lover rewards with advisor-style pagination", () => {
    const state = createRelationshipCardTestState();
    const card = getTalentCardHtml(renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "relation" }), "lover");
    expect(card).toContain("恋人");
    expect(card).toContain('<strong class="talent-item-title">恋人</strong>');
    expect(card).toContain('<th scope="row">玩耍奖励Ⅰ</th><td>SAN+6</td>');
    expect(card).toContain('data-ui-lover-reward-page="1"');
    state.loverProgressState.routes = { play: { progress: 12, completed: 4 }, study: { progress: 60, completed: 5 }, shopping: { progress: 20, completed: 7 } };
    for (const [page, reward] of [[0, "玩耍奖励Ⅱ"], [1, "学习奖励Ⅲ"], [2, "购物奖励"]] as const) {
      const updated = getTalentCardHtml(renderApp(state, undefined, { activeTalentTab: "relation", loverRewardPage: page }), "lover");
      expect(updated).toContain(`<tr class="is-current" aria-current="true"><th scope="row">${reward}</th>`);
      expect(updated.match(/aria-current="true"/g)).toHaveLength(1);
    }
  });

  it("shows the mentor's monthly activity in the card footer", () => {
    const state = createRelationshipCardTestState();
    state.advisorProgressState.monthlyActivity = "推进纵向项目 +10";
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "advisor");
    expect(card).toContain('<div class="rel-monthly-activity"><strong>本月</strong><span>导师：推进纵向项目 +10</span></div>');
    expect(card).not.toContain('rel-card-footnote');
    expect(card).toContain('满100：经费+20、你的劳务费+5');
    expect(card).toContain('科研积累+10%（下取整）');
    expect(card.indexOf('class="rel-monthly-activity"')).toBeGreaterThan(card.indexOf('data-action="advisor-project"'));
    expect(state).toEqual(before);
  });

  it.each(["senior", "junior", "peer"] as const)("keeps $type cooperation controls separate from the activity footer", (type) => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState.find((profile) => profile.type === type)!;
    fellow.monthlyActivity = "推进论文实验，导师指导论文";
    const card = getRelationshipCardHtml(renderAppWithAnimations(state), type);
    const target = type === "senior" ? "最高项" : type === "peer" ? "随机项" : "最低项";
    expect(card).toContain(`帮你论文${target}+7分，你帮对方论文最低项+1分`);
    const bar = card.match(/<div class="rel-progress-bar"[^>]*>/)?.[0] ?? "";
    expect(bar).toContain('role="progressbar" aria-label="协作进度"');
    expect(bar).toContain('aria-valuemin="0" aria-valuemax="100" aria-valuenow="15"');
    expect(card).toContain('data-relationship-tooltip data-tooltip="科研协作：');
    expect(card).not.toContain('自动：');
    expect(bar).not.toContain('title=');
    const known = card.match(/<span class="rel-known-time"[^>]*>/)?.[0] ?? "";
    expect(known).toContain('实验室传承：每12个月，同学科研+⌊n/2⌋，上限20');
    expect(known).toContain('导师计1人');
    expect(known).toContain('当前预计+0');
    expect(card).toContain('与你共同署名的论文中稿，默契+1（上限20）');
    expect(card).toContain('data-action="relationship-task"');
    expect(card).not.toContain('rel-card-footnote');
    expect(card).toContain('<div class="rel-monthly-activity"><strong>本月</strong><span>同学：推进论文实验，导师指导论文</span></div>');
    expect(card.indexOf('class="rel-monthly-activity"')).toBeGreaterThan(card.indexOf('data-action="relationship-task"'));
  });

  it("keeps each project bar and its action bound to the same project", () => {
    const state = createRelationshipCardTestState();
    state.advisorProgressState.horizontalProgress = 37;
    state.advisorProgressState.verticalProgress = 82;
    const card = getRelationshipCardHtml(renderAppWithAnimations(state), "advisor");
    for (const [type, progress, action] of [["horizontal", 37, "advisor-horizontal"], ["vertical", 82, "advisor-project"]] as const) {
      const row = card.split(`data-advisor-project="${type}"`)[1]?.split('</button>')[0] ?? "";
      expect(row).toContain(`aria-valuenow="${progress}"`);
      expect(row).toContain(`data-animate-bar="person:advisor:${type}:progress" style="width:${progress}%"`);
      expect(row).toContain(`data-action="${action}" data-project-type="${type}"`);
      expect(row).toContain('data-relationship-tooltip data-tooltip=');
      expect(row).toContain(`${type === "horizontal" ? "横向项目" : "纵向项目"}：⌊你的科研⌋+随机0～5`);
      expect(row).toContain(type === "horizontal" ? '满100：经费+20、你的劳务费+5' : '满100：科研积累+10%（下取整）');
    }
  });

  it("shows the lover's settled monthly activity separately from the next rewards", () => {
    const state = advanceLoverMonth(createRelationshipCardTestState());
    const card = getRelationshipCardHtml(renderApp(state), "lover");
    expect(card).not.toContain('rel-lover-reward-ticker');
    expect(card).toContain('<div class="rel-monthly-activity"><strong>本月</strong><span>恋人：玩耍进度+2，学习进度+4</span></div>');
    expect(card.indexOf('class="rel-monthly-activity"')).toBeGreaterThan(card.indexOf('data-action="lover-shopping"'));
  });

  it.each([0, 1, 2])("shows all next lover rewards in focusable progress tooltips at cycle %s", (completed) => {
    const state = createRelationshipCardTestState();
    for (const route of LOVER_ROUTES) state.loverProgressState.routes![route].completed = completed;
    const card = getRelationshipCardHtml(renderAppWithAnimations(state), "lover");
    const labels = [...card.matchAll(/<span class="rel-detail-label"[^>]*data-relationship-tooltip[^>]*>/g)].map((match) => match[0]);
    expect(labels).toHaveLength(3);
    for (const [index, route] of LOVER_ROUTES.entries()) {
      expect(labels[index]).toContain(`下次满100：${getLoverNextReward(state, route).replace("永久idea、实验、写作各+1分", "论文三项分数永久+1")}`);
      expect(labels[index]).toContain('tabindex="0"');
      expect(labels[index]).toContain('aria-description=');
    }
    expect(card).not.toMatch(/rel-card-footnote|data-ui-lover-reward-step|rel-lover-reward-track/);
  });

  it.each([false, true])("shows concrete lover talent rules with active relationship %s", (active) => {
    const state = createRelationshipCardTestState();
    state.loverState.active = active;
    state.loverProgressState.active = active;
    state.loverProgressState.giftCoupons = 2;
    const card = getTalentCardHtml(renderApp(state, createDefaultAccountProfile(), { activeTalentTab: "relation" }), "lover");
    expect(card).toContain(`class="talent-item talent-item-row ${active ? "is-active" : "is-inactive"} talent-rule-card"`);
    expect(card).not.toMatch(/待定|待开放/);
    expect(card).toContain("恋人");
    expect(card).toContain('<strong class="talent-item-title">恋人</strong>');
    expect(card).toContain('<th scope="row">玩耍奖励Ⅰ</th><td>SAN+6</td>');
    expect(card).toContain('data-ui-lover-reward-page="1"');
    expect(card).toContain(active ? "已激活" : "未激活");
    expect(card.includes('aria-current="true"')).toBe(active);
  });

  it.each(["advisor", "senior", "junior", "peer", "lover"] as const)("keeps the %s action cost consistent with its monthly limit", (type) => {
    const state = createRelationshipCardTestState(true);
    const unusedHtml = renderApp(createRelationshipCardTestState(), createDefaultAccountProfile());
    const html = renderApp(state, createDefaultAccountProfile());
    const card = getRelationshipCardHtml(html, type);
    const unusedCard = getRelationshipCardHtml(unusedHtml, type);
    const taskButton = card.match(/<button class="btn-sm rel-action-btn(?: rel-cooperation-btn)?"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";

    if (type === "advisor") {
      expect(card).toEqual(unusedCard);
      expect(taskButton).toContain('data-action="advisor-horizontal"');
      expect(taskButton).toContain("SAN-5");
      expect(taskButton).not.toContain("disabled");
    } else if (type === "lover") {
      expect(taskButton).toMatch(/<span class="rel-action-label">玩耍<\/span>\s*<\/button>$/);
      expect(taskButton).toContain('disabled aria-disabled="true"');
      expect(taskButton).not.toMatch(/rel-action-cost|SAN-|金币-/);
      expect(taskButton).toContain('data-action="lover-play"');
      expect(card).not.toContain(">交流</button>");
    } else {
      expect(taskButton).toMatch(/<span class="rel-action-label">科研协作<\/span>\s*<\/button>$/);
      expect(taskButton).not.toMatch(/rel-action-cost|本月已用|SAN/);
      expect(taskButton).toContain('disabled aria-disabled="true"');
      expect(taskButton).not.toContain('data-gameplay-status="deferred"');
      expect(card).not.toMatch(/relationship-chat|relationship-collaborate/);
    }
    expect(card.match(/<div class="rel-progress-note">[^<]*<\/div>/g)).toEqual(unusedCard.match(/<div class="rel-progress-note">[^<]*<\/div>/g));
    expect(card.match(/<span class="rel-progress-val">[^<]*<\/span>/g)).toEqual(unusedCard.match(/<span class="rel-progress-val">[^<]*<\/span>/g));
  });

  it.each([
    { toPlayer: undefined, toFellow: undefined },
    { toPlayer: null, toFellow: null },
    { toPlayer: 0, toFellow: undefined },
    { toPlayer: undefined, toFellow: 0 },
    { toPlayer: 12, toFellow: null },
    { toPlayer: null, toFellow: 19 },
    { toPlayer: 0, toFellow: 0 },
    { toPlayer: 12, toFellow: 19 },
  ])("keeps pending help $toPlayer/$toFellow without a standalone status row or manual controls", ({ toPlayer, toFellow }) => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.player.research = 3;
    state.papers = [];
    state.fellowPapers = undefined;
    const fellow = state.fellowProgressState.find((profile) => profile.type === "junior")!;
    fellow.research = 7;
    fellow.pendingHelpToPlayer = toPlayer;
    fellow.pendingHelpToFellow = toFellow;
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "junior");
    expect(card).not.toMatch(/rel-help-status|满100自动互助|待自动帮助|class="rel-actions"/);
    expect(card).toContain('role="progressbar" aria-label="协作进度"');
    expect(card.match(/data-action="relationship-task"/g)).toHaveLength(1);
    expect(card.match(/class="rel-progress-bar"/g)).toHaveLength(1);
    expect(card).not.toMatch(/relationship-chat|relationship-collaborate|data-fellow-collaboration-paper|<select|免费推进|关系积累|undefined/);
    expect(card).toContain("暂无在研论文");
    expect(card.match(/<button[^>]*data-action="relationship-task"[^>]*>/)?.[0]).not.toContain("disabled");
    expect(card).not.toContain("生效时的科研");
    expect(state).toEqual(before);
  });

  it.each([
    { toPlayer: 12, toFellow: null },
    { toPlayer: null, toFellow: 19 },
    { toPlayer: 12, toFellow: 19 },
  ])("keeps cooperation available during review with pending help $toPlayer/$toFellow", ({ toPlayer, toFellow }) => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState.find((profile) => profile.type === "junior")!;
    fellow.pendingHelpToPlayer = toPlayer;
    fellow.pendingHelpToFellow = toFellow;
    state.fellowPapers = [{ ...createDraftPaper(1, 0), leadAuthorId: fellow.id, status: "reviewing", reviewMonthsLeft: 2 }];
    state.papers = [{ ...createDraftPaper(1, 1), status: "reviewing", reviewMonthsLeft: 1 }];
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "junior");
    const reviewStatus = card.match(/<div class="rel-paper-review-status is-reviewing">[\s\S]*?<\/div>/)?.[0] ?? "";

    expect(reviewStatus).toContain("审稿中");
    expect(reviewStatus).toContain("剩余 2 月");
    expect(card).toMatch(/<div class="rel-paper-section"[^>]*>\s*<div class="rel-paper-title-block">[\s\S]*?<\/div>\s*<div class="rel-paper-review-status is-reviewing">[\s\S]*?<\/div>\s*<\/div>\s*<div class="rel-progress-section rel-resource-row">[\s\S]*<\/article>$/);
    expect(card).not.toContain("paper-score-strip");
    expect(card).not.toMatch(/relationship-chat|relationship-collaborate|<select|rel-help-status|待自动帮助/);
    expect(card).toContain('role="progressbar" aria-label="协作进度"');
    expect(card.match(/<button[^>]*data-action="relationship-task"[^>]*>/)?.[0]).not.toContain("disabled");
    expect(state).toEqual(before);
  });

  it.each([
    { type: "senior", rule: "师兄／师姐提升最高项" },
    { type: "junior", rule: "师弟／师妹提升最低项" },
    { type: "peer", rule: "同门随机提升一项" },
  ] as const)("explains automatic targeting for $type in sidebar help and card tooltips", ({ type, rule }) => {
    const state = createRelationshipCardTestState();
    const html = renderApp(state);
    const card = getRelationshipCardHtml(html, type);
    const hint = getHelpText({ activePlayTab: "relationship" });

    expect(hint).toContain(rule);
    expect(hint).toContain("同学帮助方式");
    expect(hint).toContain("按帮助者科研能力加分");
    expect(hint).toContain("每次只帮一篇论文的一项");
    expect(hint).toContain("双方独立结算，条满时按帮助者科研能力加分");
    expect(hint).toContain("没有可修改论文时各保留一次");
    expect(hint).toContain("审稿期间也能推进");
    expect(hint).toContain("审稿3个月");
    expect(card).toContain('role="progressbar" aria-label="协作进度"');
    expect(html).not.toContain("先选你的受助论文");
  });

  it.each([[0, 0], [0, 7], [7, 0], [7, 12]] as const)("preserves help snapshots from player research %s and fellow research %s after research changes", (playerResearch, fellowResearch) => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState.find((profile) => profile.type === "junior")!;
    state.player.research = playerResearch;
    fellow.research = fellowResearch;
    fellow.pendingHelpToPlayer = fellowResearch;
    fellow.pendingHelpToFellow = playerResearch;
    state.papers = [createDraftPaper(1, 0)];
    state.fellowPapers = [{ ...createDraftPaper(1, 1), leadAuthorId: fellow.id }];
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "junior");

    expect(card).not.toMatch(/rel-help-status|待自动帮助|满100自动互助/);
    expect(card).toContain('role="progressbar" aria-label="协作进度"');
    expect(card.match(/<button[^>]*data-action="relationship-task"[^>]*>/)?.[0]).not.toContain("disabled");
    expect(state).toEqual(before);

    state.player.research = 12;
    fellow.research = 19;
    const updatedCard = getRelationshipCardHtml(renderApp(state), "junior");
    expect(updatedCard).not.toMatch(/rel-help-status|待自动帮助|满100自动互助/);
    expect(updatedCard).toContain('role="progressbar" aria-label="协作进度"');
    expect(updatedCard).toMatch(/<span class="rel-detail-label">科研<\/span>\s*<strong class="rel-detail-value">19\/20<\/strong>/);
    expect(updatedCard).not.toContain("生效时的科研");
    expect(fellow.pendingHelpToPlayer).toBe(fellowResearch);
    expect(fellow.pendingHelpToFellow).toBe(playerResearch);
  });

  it.each(["missing", "draft", "reviewing", "journal-reviewing"] as const)("allows every fellow to advance cooperation with %s manuscripts", (status) => {
    const state = createRelationshipCardTestState();
    state.player.san = 100;
    state.player.research = 7.9;
    state.papers = status === "missing" ? [] : [{ ...createDraftPaper(1, 0), status }];
    state.fellowPapers = status === "missing" ? [] : state.fellowProgressState.map((profile, index) => ({
      ...createDraftPaper(1, index + 1), leadAuthorId: profile.id, status,
    }));
    const before = structuredClone(state);
    const html = renderApp(state);

    for (const type of ["senior", "junior", "peer"] as const) {
      const card = getRelationshipCardHtml(html, type);
      const buttons = card.match(/<button[^>]*data-action="relationship-task"[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).not.toContain("disabled");
      expect(card).toMatch(/rel-progress-header[^>]*>[\s\S]*?<button[^>]*data-action="relationship-task"/);
      expect(buttons[0]).not.toContain("title=");
      expect(card).not.toMatch(/relationship-chat|relationship-collaborate|<select|关系积累/);
      if (status === "draft") {
        expect(card).toContain('class="paper-score-strip rel-paper-scores"');
        expect(card).not.toContain("rel-paper-review-status");
      }
    }
    expect(state).toEqual(before);
  });

  it("escapes names and paper titles without a manual paper selector", () => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState.find((profile) => profile.type === "senior")!;
    const unsafe = '<img src=x onerror="alert(1)"> & 学友';
    const escaped = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; 学友';
    fellow.name = unsafe;
    fellow.pendingHelpToPlayer = 12;
    state.fellowPapers = [{ ...createDraftPaper(1, 0), title: unsafe, leadAuthorId: fellow.id }];
    const before = structuredClone(state);
    const card = getRelationshipCardHtml(renderApp(state), "senior");

    expect(card).toContain(`<strong class="rel-name">${escaped}</strong>`);
    expect(card).toContain(`<strong class="paper-title">${escaped}</strong>`);
    expect(card).not.toContain(unsafe);
    expect(card).not.toMatch(/<select|<option|paper-collaborator-avatar/);
    expect(state).toEqual(before);
  });

  it.each([false, true])("shows player participation %s and rejection history after fellow paper heat", (participated) => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState.find((profile) => profile.type === "junior")!;
    state.fellowPapers = [{
      ...createDraftPaper(1, 0), leadAuthorId: fellow.id, rejectionCount: 3,
      collaborators: participated ? [{ id: "player", name: "张明" }] : [],
    }];
    const card = getRelationshipCardHtml(renderApp(state), "junior");
    if (participated) {
      expect(card).toContain('title="你已参与这篇论文"');
      expect(card).toMatch(/热度 ×[\d.]+<\/span>\s*<span[^>]*paper-participation-badge[^>]*>✅<\/span><span[^>]*paper-rejection-badge[^>]*>rej×3<\/span>/);
    } else {
      expect(card).not.toContain("paper-participation-badge");
      expect(card).toMatch(/热度 ×[\d.]+<\/span>\s*<span[^>]*paper-rejection-badge[^>]*>rej×3<\/span>/);
    }
  });

  it.each([undefined, 0, 2])("shows rejection count %s only when positive on player manuscripts and published details", (rejectionCount) => {
    const state = createAdmittedTestState();
    const paper = { ...createPublishedPaper(0, "拒稿记录", "A", 30, 0), rejectionCount };
    state.papers = [paper];
    const html = renderApp(state);
    if (rejectionCount) {
      expect(html).toContain('title="已被拒稿 2 次"');
      expect(html).toMatch(/热度 ×[\d.]+<\/span>\s*<span[^>]*paper-rejection-badge[^>]*>rej×2<\/span>/);
      expect(html).toMatch(/<span>热度<span[^>]*paper-rejection-badge[^>]*>rej×2<\/span><\/span>/);
    } else {
      expect(html).not.toContain("paper-rejection-badge");
    }
  });

  it("shows fixed fellow topic badges after the paper title and review status instead of scores without publication history", () => {
    const state = createRelationshipCardTestState();
    const fellow = state.fellowProgressState.find((profile) => profile.type === "junior")!;
    const paper = {
      ...createDraftPaper(1, 0), leadAuthorId: fellow.id, leadAuthorName: fellow.name,
      idea: 15, experiment: 21, writing: 32, collaborationScores: { idea: 5, experiment: 1, writing: 2 },
    };
    const published = {
      ...createPublishedPaper(1, '<已发表> & "论文"', "A", 100, 12),
      leadAuthorId: fellow.id, submittedMonth: 3, submittedYear: 1,
    };
    const coauthored = { ...published, id: "coauthored", title: "合作成果", nonFirstAuthor: true };
    state.fellowPapers = [{ ...paper, status: "reviewing", reviewMonthsLeft: 2, target: "A", submittedMonth: 3, submittedYear: 1 }, published];
    state.externalPublications = [coauthored, { ...published, id: "unrelated", title: "其他同学的论文", leadAuthorId: "another-fellow" }];
    const card = getRelationshipCardHtml(renderApp(state), "junior");
    const titleBlock = card.match(/<div class="rel-paper-title-block">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const paperSection = card.match(/<div class="rel-paper-section"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? "";
    const reviewStatus = paperSection.match(/<div class="rel-paper-review-status is-reviewing">([\s\S]*)$/)?.[1] ?? "";
    const researchTopic = getFellowResearchTopic(fellow);
    const conference = getConferenceInfo(3, "A", 1);

    expect(titleBlock).toContain(`<strong class="paper-title">${paper.title}</strong>`);
    expect(titleBlock).toContain('class="paper-topic-tag"');
    expect(titleBlock).toContain(researchTopic.topicLabel);
    expect(titleBlock).toMatch(/class="paper-heat-badge(?: [^"]*)?"/);
    expect(titleBlock).toContain(`热度 ×${researchTopic.heatMultiplier.toFixed(2)}`);
    expect(titleBlock).not.toMatch(/方向：|title="发表前衰减/);
    expect(titleBlock).not.toContain("paper-participation-badge");
    expect(titleBlock).toMatch(/<\/strong>\s*<span class="paper-topic-meta">/);
    expect(card).not.toContain("rel-topic-row");
    expect(paperSection).not.toMatch(/paper-score-strip|paper-own-score-strip|paper-collaboration-score-strip|<small>idea<\/small>|自身/);
    expect(conference).not.toBeNull();
    expect(reviewStatus).toContain(`<span class="paper-card-status is-reviewing">A类 · ${conference!.name}审稿中</span>`);
    expect(reviewStatus).toContain('<span class="rel-paper-review-total">总分 68</span>');
    expect(reviewStatus).toContain('<span class="paper-review-remaining">剩余 2 月</span>');
    expect(paperSection).toMatch(/<div class="rel-paper-title-block">[\s\S]*?<\/div>\s*<div class="rel-paper-review-status is-reviewing">/);
    expect(card).not.toMatch(/当前论文|paper-collaborator-avatar|审稿剩余|下月：|已发表|引用 24/);
    expect(card).not.toContain("合作成果");
    expect(card).not.toContain("你为共同作者");
    expect(card).not.toContain("其他同学的论文");
  });

  it("reflects seasonal and relationship buff costs and disables only unaffordable discussion", () => {
    const state = createRelationshipCardTestState();
    state.eventQueue = [];
    state.month = 9;
    state.player.san = 0;
    state.buffs = createDebugBuffs().filter((buff) => buff.relationshipOperationSanDelta);
    const fellow = state.fellowProgressState.find((profile) => profile.type === "senior")!;
    const cost = getFellowDiscussionSanCost(state, fellow);
    const card = getRelationshipCardHtml(renderApp(state), "senior");
    const paidButton = card.match(/<button[^>]*data-action="relationship-task"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(cost).toBeGreaterThan(0);
    expect(paidButton).toContain(`SAN不足，需要${cost}`);
    expect(paidButton).toContain(`class="rel-action-cost">SAN-${cost}</span>`);
    expect(paidButton).toContain('disabled aria-disabled="true"');
    expect(card).not.toMatch(/满100自动互助|rel-help-status/);
    expect(card).toContain('role="progressbar" aria-label="协作进度"');
  });

  it("allows paid task progress while a blocking event is due", () => {
    const state = createRelationshipCardTestState();
    const card = getRelationshipCardHtml(renderApp(state), "junior");
    const buttons = card.match(/<button[^>]*data-action="relationship-task"[^>]*>/g) ?? [];

    expect(buttons).toHaveLength(1);
    buttons.forEach((button) => {
      expect(button).not.toContain("请先处理本月事件");
      expect(button).not.toContain('disabled aria-disabled="true"');
    });
  });

  it("keeps zero-month relationships in their identity header without an unavailable-action alert", () => {
    const state = createRelationshipCardTestState();
    state.totalMonths = 0;
    state.fellowProgressState = state.fellowProgressState.map((profile) => ({ ...profile, startTotalMonths: 0 }));
    state.loverState.startTotalMonths = 0;
    state.loverProgressState.canInteract = false;
    const html = renderApp(state, createDefaultAccountProfile());

    (["advisor", "senior", "junior", "peer", "lover"] as const).forEach((type) => {
      const card = getRelationshipCardHtml(html, type);
      const meta = card.match(/<div class="rel-card-meta">([\s\S]*?)<\/div>/)?.[1] ?? "";
      const attributes = card.match(/<div class="rel-detail-row">([\s\S]*?)<\/div>/)?.[1] ?? "";
      if (type === "advisor") expect(card).not.toMatch(/rel-known-time|rel-card-meta/);
      else expect(meta).toContain('认识<strong class="rel-detail-value">0</strong>月</span>');
      expect(attributes).not.toContain("rel-known-time");
      expect(attributes).not.toContain("认识时间");
      expect(card).not.toContain("rel-card-alert");
    });
  });

  it("escapes custom advisor, fellow and lover names inside the redesigned identity header", () => {
    const state = createRelationshipCardTestState();
    const name = '<img src=x onerror="alert(1)"> & 学友';
    const escapedName = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; 学友';
    state.selectedAdvisorName = name;
    state.fellowProgressState = state.fellowProgressState.map((profile) => ({ ...profile, name }));
    state.loverState.name = name;
    const html = renderApp(state, createDefaultAccountProfile());

    (["advisor", "senior", "junior", "peer", "lover"] as const).forEach((type) => {
      const card = getRelationshipCardHtml(html, type);
      const suffix = type === "advisor" ? " 🎓 讲师" : "";
      expect(card).toContain(`<strong class="rel-name">${escapedName}${suffix}</strong>`);
      expect(card).not.toContain("<img");
      expect(card).not.toContain(name);
      expect(card.match(/class="rel-card-meta"/g) ?? []).toHaveLength(type === "advisor" ? 0 : 1);
    });
  });

  it.each(["beautiful", "smart"] as const)("shows the %s lover type in its badge and a persistent real name in the heading", (type) => {
    const state = createRelationshipCardTestState();
    state.loverState = activateLover(type, 4, "male");
    const expectedName = state.loverState.name;
    const badge = type === "beautiful" ? "活泼恋人" : "聪慧恋人";
    const before = structuredClone(state);
    const account = createDefaultAccountProfile();
    const random = vi.spyOn(Math, "random");

    try {
      for (let repaint = 0; repaint < 3; repaint += 1) {
        const card = getRelationshipCardHtml(renderApp(state, account, { activePlayTab: "relationship" }), "lover");
        expect(card).toContain(`data-rel-type-pill="lover">${badge}</span>`);
        expect(card).toContain(`<strong class="rel-name">${expectedName}</strong>`);
        expect(card).not.toContain(`<strong class="rel-name">${badge}</strong>`);
        expect(card).not.toContain('data-rel-type-pill="lover">恋人</span>');
      }
      expect(state).toEqual(before);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it.each([undefined, "   "])("renders stable full-name fallbacks for unnamed fellows and lovers with input %j", (name) => {
    const state = createRelationshipCardTestState();
    state.fellowProgressState = state.fellowProgressState.map((profile) => ({ ...profile, name }));
    state.loverState.name = name;
    const before = structuredClone(state);
    const account = createDefaultAccountProfile();
    const random = vi.spyOn(Math, "random");

    try {
      for (let repaint = 0; repaint < 3; repaint += 1) {
        const html = renderApp(state, account, { activePlayTab: "relationship" });
        for (const profile of state.fellowProgressState) {
          const expectedName = pickStableRandomName(`fellow:${profile.id}`);
          expect(getFellowName(profile)).toBe(expectedName);
          expect(getRelationshipCardHtml(html, profile.type)).toContain(`<strong class="rel-name">${expectedName}</strong>`);
        }
        const loverCard = getRelationshipCardHtml(html, "lover");
        expect(loverCard).toContain(`<strong class="rel-name">${getLoverName(state.loverState)}</strong>`);
        expect(loverCard).toContain('data-rel-type-pill="lover">聪慧恋人</span>');
      }
      expect(state).toEqual(before);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
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

  it.each([false, true])("omits relationship debug tools from the main HTML (pre-enrollment: %s)", (preEnrollment) => {
    const state = preEnrollment
      ? dispatchAction(createInitialState(), "start-game", { roleId: "normal" })
      : dispatchAction(createAdmittedTestState(), "next-month");
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "relationship" });
    expect(html).not.toContain('id="debug-bottom-bar"');
    expect(html).not.toContain('class="debug-tool-btn"');
    expect(html).not.toContain('data-action="debug-add-relationship"');
    expect(html).not.toContain("data-debug-relationship-type=");
    for (const label of ["新增师兄/师姐", "新增师弟/师妹", "新增同门", "新增恋人"]) {
      expect(html).not.toContain(label);
    }

    const relationshipSection = html.match(/id="relationship-section"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/)?.[1] ?? "";
    expect(relationshipSection).toContain('id="rel-card-grid"');
    expect(relationshipSection).not.toContain('data-action="debug-add-relationship"');
    expect(relationshipSection).not.toContain("data-debug-relationship-type=");
    expect(html).not.toContain("rel-add-actions");
    expect(html).not.toContain("data-relationship-add-type=");
  });

  it.each<{ ui: PlayRenderUiState; key: string }>([
    { ui: {}, key: "events" },
    { ui: { activePlayTab: "workstation" }, key: "workstation" },
    { ui: { activePlayTab: "research" }, key: "research" },
    { ui: { activePlayTab: "relationship" }, key: "relationship" },
    { ui: { activePlayTab: "shop" }, key: "shop:ai" },
    { ui: { activePlayTab: "shop", activeShopTab: "coffee" }, key: "shop:coffee" },
    { ui: { activePlayTab: "shop", activeShopTab: "gear" }, key: "shop:gear" },
    { ui: { activePlayTab: "shop", activeShopTab: "rest" }, key: "shop:rest" },
    { ui: { activePlayTab: "talent" }, key: "talent:character" },
    { ui: { activePlayTab: "talent", activeTalentTab: "relation" }, key: "talent:relation" },
    { ui: { activePlayTab: "talent", activeTalentTab: "equip" }, key: "talent:equip" },
    { ui: { activePlayTab: "talent", activeTalentTab: "growth" }, key: "talent:growth" },
    { ui: { activePlayTab: "talent", activeTalentTab: "publication" }, key: "talent:publication" },
    { ui: { activePlayTab: "settings" }, key: "settings" },
  ])("renders only the active $key help page in the right rail without center tips", ({ ui, key }) => {
    const state = dispatchAction(createAdmittedTestState(), "next-month");
    const context = getPlayHelpContext(ui);
    const html = renderApp(state, createDefaultAccountProfile(), ui);
    const rail = html.match(/<aside class="play-right-rail\b[\s\S]*?<\/aside>/)?.[0] ?? "";
    const center = html.slice(html.indexOf('class="play-center-column'), html.indexOf('<aside class="play-right-rail'));

    expect(context.key).toBe(key);
    if (ui.activePlayTab === "settings" || (ui.activePlayTab === "talent" && ui.activeTalentTab !== "publication")) {
      expect(context.pages).toHaveLength(0);
      expect(html).not.toMatch(/class="play-help-(?:area|panel|toggle)/);
      return;
    }
    expect(context.pages.length).toBeGreaterThan(0);
    expect(html.match(/class="play-help-panel\b/g) ?? []).toHaveLength(1);
    expect(rail).toContain(`data-help-context="${key}"`);
    expect(rail).toContain('data-help-page-index="0"');
    expect(rail).toContain(`data-help-page-count="${context.pages.length}"`);
    expect(rail.match(/class="play-help-body\b/g) ?? []).toHaveLength(1);
    expect(rail).toContain(`<strong class="play-help-topic">💡 ${context.pages[0]!.title}提示</strong>`);
    const header = rail.match(/<div class="play-help-header">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(header).toContain('<nav class="play-help-pagination"');
    expect(header).toContain('</nav>');
    expect(rail.indexOf('</nav>')).toBeLessThan(rail.indexOf('class="play-help-body'));
    if (context.pages[0]!.expandable) {
      expect(rail).toContain(`<div class="play-help-summary">${context.pages[0]!.summary}</div>`);
      expect(rail).toContain('<details class="play-help-details">');
      expect(rail).not.toMatch(/<details[^>]*\bopen\b/);
    } else {
      expect(rail).toContain('class="play-help-content"');
      expect(rail).not.toMatch(/<details[^>]*\bopen\b/);
      if (!context.pages[0]!.summary) expect(rail).not.toContain('class="play-help-summary"');
    }
    expect(rail).toContain(context.pages[0]!.body);
    context.pages.slice(1).forEach((page) => {
      expect(html).not.toContain(page.body);
    });
    expect(center).toContain('class="center-main-panel');
    expect(center).not.toContain(context.pages[0]!.body);
    expect(center).not.toMatch(/panel-tip-note|workstation-notes|research-mechanism-notes|rel-gameplay-note|publication-talent-tip|play-help-body/);
    expect(html).not.toContain("out-of-game-role-portrait");
    expect(rail).toMatch(/<button[^>]*data-ui-help-page="-1"[^>]*disabled/);
    if (context.pages.length === 1) {
      expect(rail).toMatch(/<button[^>]*data-ui-help-page="1"[^>]*disabled/);
    }
  });

  it.each(["workstation", "research", "relationship"] as const)("paginates every %s help page with absolute destinations and preserves other contexts", (activePlayTab) => {
    const state = createAdmittedTestState();
    const context = getPlayHelpContext({ activePlayTab });
    expect(context.pages.length).toBeGreaterThan(1);
    expect(context.pages.some((page) => page.expandable === true)).toBe(true);
    expect(context.pages.some((page) => !page.expandable)).toBe(true);

    context.pages.forEach((page, index) => {
      const ui: PlayRenderUiState = {
        activePlayTab,
        helpPageByContext: { workstation: 1, research: 2, relationship: 3, [context.key]: index },
      };
      const html = renderApp(state, createDefaultAccountProfile(), ui);
      const panel = html.match(/<section class="play-help-panel\b[\s\S]*?<\/section>/)?.[0] ?? "";
      expect(html).toContain(`data-help-context="${context.key}"`);
      expect(html).toContain(`data-help-page-index="${index}"`);
      expect(html).toContain(page.body);
      expect(html.match(/class="play-help-topic"/g) ?? []).toHaveLength(1);
      if (page.expandable) {
        expect(panel).toContain(`<div class="play-help-summary">${page.summary}</div>`);
        expect(panel).toContain('<details class="play-help-details">');
        expect(panel).not.toMatch(/<details[^>]*\bopen\b/);
      } else {
        expect(panel).toContain('class="play-help-content"');
        expect(panel).not.toMatch(/<details[^>]*\bopen\b/);
        if (!page.summary) expect(panel).not.toContain('class="play-help-summary"');
      }
      const previous = html.match(/<button[^>]*aria-label="上一条提示"[^>]*>/)?.[0] ?? "";
      const next = html.match(/<button[^>]*aria-label="下一条提示"[^>]*>/)?.[0] ?? "";
      expect(previous).toContain(`data-ui-help-page="${index - 1}"`);
      expect(next).toContain(`data-ui-help-page="${index + 1}"`);
      expect(previous.includes("disabled")).toBe(index === 0);
      expect(next.includes("disabled")).toBe(index === context.pages.length - 1);
      context.pages.filter((_, otherIndex) => otherIndex !== index).forEach((otherPage) => {
        expect(html).not.toContain(otherPage.body);
      });
    });
  });

  it.each([-3, 1.9, 999, Number.NaN, Number.POSITIVE_INFINITY])("clamps the saved help page %s before rendering", (requested) => {
    const context = getPlayHelpContext({ activePlayTab: "workstation" });
    const expectedIndex = requested === 1.9 ? 1 : requested === 999 ? context.pages.length - 1 : 0;
    const html = renderApp(createAdmittedTestState(), createDefaultAccountProfile(), {
      activePlayTab: "workstation",
      helpPageByContext: { workstation: requested, research: 2 },
    });
    expect(html).toContain(`data-help-page-index="${expectedIndex}"`);
    expect(html).toContain(context.pages[expectedIndex]!.body);
  });

  it.each([false, true])("reflects the mobile help disclosure state %s", (isHelpOpen) => {
    const html = renderApp(createAdmittedTestState(), createDefaultAccountProfile(), { isHelpOpen });
    expect(html).toContain(`class="play-help-panel${isHelpOpen ? " is-open" : ""}"`);
    expect(html).toMatch(new RegExp(`data-ui-help-toggle[^>]*aria-controls="play-help-panel"[^>]*aria-expanded="${isHelpOpen}"`));
    expect(html).toContain('data-ui-help-toggle aria-label="收起小提示"');
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

  it("hides old routine paper logs while retaining monthly SAN and money sources", () => {
    const base = createAdmittedTestState();
    const html = renderApp({ ...base, log: [
      { id: "new", month: base.totalMonths, text: "科研：在论文槽 1 开启旧题目" },
      { id: "discard", month: base.totalMonths, text: "丢弃论文：旧题目" },
      { id: "decay", month: base.totalMonths, text: "论文时效：旧题目：idea -1" },
      { id: "monthly", month: base.totalMonths, text: "月初结算：自动恢复 SAN +1｜导师工资 金币 +1｜冬季 SAN -1" },
    ] });
    const log = html.split('id="log-content"')[1]!.split('</section>')[0]!;
    expect(log).not.toContain("旧题目");
    for (const source of ["月初结算", "自动恢复", "导师工资", "冬季", "SAN +1", "金币 +1", "SAN -1"]) {
      expect(log).toContain(source);
    }
  });

  it("renders completed event logs as compact title and result summaries", () => {
    let state = createAdmittedTestState();
    state = {
      ...state,
      log: [
        { id: "teacher-idea", month: 1, text: "教师节：你发了教师节祝福，导师分享了一个想法，下次想 idea +3。" },
        { id: "teacher-errand", month: 1, text: "教师节：你被叫去财务处跑腿，SAN -3。" },
        { id: "advisor-growth", month: 1, text: "导师科研：科研积累 +2，科研经费 -1。" },
        { id: "advisor-horizontal", month: 1, text: "做横向：SAN -5，科研经费 +1。" },
        { id: "graduation-requirement", month: 1, text: "读研之始：毕业要求已经写进培养方案。" },
      ],
    };

    const html = renderApp(state, createDefaultAccountProfile());

    expect(html).toContain('<div class="event"><span class="log-entry-title">教师节</span></div>');
    expect(html).toContain('<div class="result">你发了教师节祝福，导师分享了一个想法，下次想 <span class="log-value-change is-positive">idea +3</span>。</div>');
    expect(html).toContain('<div class="result">你被叫去财务处跑腿，<span class="log-value-change is-negative">SAN -3</span>。</div>');
    expect(html).toContain('<span class="log-value-change is-positive">科研积累 +2</span>');
    expect(html).toContain('<span class="log-value-change is-negative">科研经费 -1</span>');
    expect(html).toContain('<span class="log-value-change is-positive">科研经费 +1</span>');
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

  it("appends a standalone ending timeline page and retains browsing with a frozen calendar", () => {
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
    expect(html).toContain('<h2 id="ending-title">硕士毕业</h2>');
    expect(html).toContain("科研分 1/1");
    expect(html).toContain('data-action="restart-game"');
    expect(html).toContain('data-action="reset-game"');
    expect(html).toContain("data-ui-ending-page");
    expect(html).toContain("data-ui-close-ending-content");
    expect(html).not.toContain('id="log-content"');
    expect(html).toContain("play-left-rail");
    expect(html).toContain("play-right-rail");
    expect(html).toContain('data-ui-play-tab="events"');
    expect(html).toContain('data-ui-play-tab="research"');
    expect(html).toContain('data-ui-play-tab="workstation"');
    const nextMonth = html.match(/<button\b[^>]*data-action="next-month"[^>]*>/)?.[0] ?? "";
    expect(nextMonth).toMatch(/\sdisabled(?:\s|>)/);
    expect(nextMonth).toContain('aria-disabled="true"');
    expect(html).not.toContain('data-action="force-next-month"');
    const monthly = renderApp(state, createDefaultAccountProfile(), { activeLogPage: state.totalMonths });
    expect(monthly).toContain('id="log-content"');
    expect(monthly).not.toContain('data-ending="master"');
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
