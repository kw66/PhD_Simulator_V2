import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../src/core/v2-progression";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import type { PlayTabId } from "../src/app/v2-render-types";
import type { EndingId, GameState, Paper } from "../src/core/v2-types";

function finishedState(ending: EndingId): GameState {
  const base = createStartedGameState("normal");
  const degree = ending === "phd" ? "phd" : "master";
  const totalMonths = getMonthLimitByDegree(degree);
  return { ...base, ...getCalendarForTotalMonths(totalMonths, degree), phase: "finished", ending, degree, playerName: "林青", totalMonths, maxMonths: totalMonths,
    graduationScoreTarget: ending === "phd" ? 7 : 1, totalResearchScore: ending === "phd" ? 9 : 2 };
}

function endingCard(html: string): string {
  const card = html.match(/<(?:article|section|div)\b[^>]*\bdata-ending="[^"]*"[^>]*>[\s\S]*?<\/footer>/)?.[0];
  expect(card).toBeDefined();
  return card!;
}

function expectFrozenCalendar(html: string): void {
  const nextMonth = html.match(/<button\b[^>]*\bdata-action="next-month"[^>]*>/)?.[0];
  expect(nextMonth).toBeDefined();
  expect(nextMonth).toMatch(/\sdisabled(?:\s|>)/);
  expect(nextMonth).toContain('aria-disabled="true"');
}

function timelineMarkers(html: string): string[] {
  return html.match(/<button\b[^>]*data-ui-log-page-index="\d+"[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

function expectEndingStat(card: string, stat: string, value: string | number): void {
  const pattern = new RegExp(`<([a-z][\\w-]*)\\b[^>]*data-ending-stat="${stat}"[^>]*>([\\s\\S]*?)<\\/\\1>`);
  const match = card.match(pattern);
  expect(match, stat).not.toBeNull();
  const valueHtml = match![2]!.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/)?.[1];
  expect(valueHtml, stat).toBeDefined();
  const text = valueHtml!.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const normalized = String(value).replace(/\s+/g, "");
  expect(text.replace(/\s+/g, ""), stat).toBe(normalized);
}

function publishedPaper(id: string, patch: Partial<Paper> = {}): Paper {
  return attachPaperPublication({ ...createDraftPaper(1, 0, () => 0), id, status: "published", target: "A", ...patch });
}

describe("basic ending presentation", () => {
  it("lists retained offers without choosing a job for the player", () => {
    const state = finishedState("master");
    state.careerOffers = {
      internet: { type: "internet", jobId: "internet-small", name: "小型科技公司", threshold: 45,
        score: 60, compensation: "年总包 20～35 万" },
    };
    const card = endingCard(renderApp(state));
    expect(card).toContain("持有 offer");
    expect(card).toContain("大厂：小型科技公司（年总包 20～35 万）");
    expect(card).not.toContain("已入职");
  });

  it("formats fractional final attributes and the failure reason without mutating them", () => {
    const state = finishedState("overthinking");
    state.player = { ...state.player, san: 8.8000000004, research: -0.8000000004,
      social: 12.3000000004, favor: 6.7500000004, money: 2.5500000004 };
    const before = structuredClone(state);
    const card = endingCard(renderApp(state));
    expectEndingStat(card, "san", "8.8/20");
    expectEndingStat(card, "research", "-0.8/20");
    expectEndingStat(card, "social", "12.3/20");
    expectEndingStat(card, "favor", "6.75/20");
    expectEndingStat(card, "money", "2.55");
    expect(card).toContain("科研能力 -0.8，低于0");
    expect(card).not.toMatch(/\d+\.\d{5,}/);
    expect(state).toEqual(before);
  });

  it.each([
    ["burnout", "不堪重负"], ["poor", "穷困潦倒"], ["expelled", "逐出师门"], ["isolated", "被孤立"],
    ["overthinking", "用脑过度"],
    ["delay", "延毕"], ["quit", "主动退学"], ["master", "硕士毕业"], ["phd", "博士毕业"],
  ] as const)("shows %s on its own ending timeline page within the read-only shell", (ending, title) => {
    const state = finishedState(ending);
    const html = renderApp(state);
    const card = endingCard(html);
    expect(card).toContain(`<h2 id="ending-title">${title}</h2>`);
    expect(card).not.toContain("<h1");
    expect(card).toContain(`data-ending="${ending}"`);
    expect(card).toContain("林青");
    expect(card).toContain("大多数");
    expect(card).toContain(`${state.totalMonths}个月`);
    expect(html).toContain("play-left-rail");
    expect(html).toContain("play-right-rail");
    expect(html).toContain('data-ui-play-tab="events"');
    expect(html).toContain('data-phase="finished"');
    expectFrozenCalendar(html);
    const eventsPanel = html.indexOf('data-tab-panel="events"');
    const eventLog = html.indexOf('id="event-panel"');
    expect(eventsPanel).toBeGreaterThan(-1);
    expect(eventLog).toBeGreaterThan(-1);
    expect(html.indexOf(card)).toBeGreaterThan(eventsPanel);
    expect(html.indexOf(card)).toBeGreaterThan(eventLog);
    expect(html.indexOf(card)).toBeLessThan(html.indexOf('data-tab-panel="workstation"'));
    for (const excluded of ["生涯回顾", "优秀博士"]) {
      expect(card, excluded).not.toContain(excluded);
    }
    expect(html).not.toContain('id="log-content"');
    expect(html).not.toContain('data-ui-event-scene-index=');
    expect(card).toContain("data-ui-close-ending-content");
    const endingMarker = timelineMarkers(html).filter((marker) => marker.includes("data-ui-ending-page"));
    expect(endingMarker).toHaveLength(1);
    expect(endingMarker[0]).toContain(`data-ui-log-page-index="${state.totalMonths + 1}"`);
    expect(endingMarker[0]).toContain('aria-pressed="true"');
    expect(endingMarker[0]).toMatch(/>结局<\/span>/);
    expect(card).not.toContain('class="ending-story"');
    expect(card).not.toContain('class="ending-reason"');
    expect(card).not.toContain("学业完成");
    expect(card).not.toContain("毕业条件");
    const actions = card.match(/<footer\b[^>]*class="ending-actions"[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? "";
    expect(actions.match(/<button\b/g)).toHaveLength(2);
    expect(actions).toContain('data-action="restart-game"');
    expect(actions).toContain('data-action="reset-game"');
    expect(actions).toContain("返回开始页面");
    expect(card).not.toContain('data-action="quit-game"');
  });

  it("highlights negative research in the overthinking ending", () => {
    const state = finishedState("overthinking");
    state.player.research = -1;
    const card = endingCard(renderApp(state));
    expect(card).toContain("科研能力 -1，低于0");
    expect(card).toContain('data-ending-stat="research" class="is-failed"');
    expectEndingStat(card, "research", "-1/20");
  });

  it("shows the actual failed value and safely escapes the final cause and player name", () => {
    const base = finishedState("poor");
    const html = renderApp({ ...base, playerName: "<script>name</script>", player: { ...base.player, money: -2 },
      endingCause: { text: '组内团建：AA聚餐，金币-3\n<script>alert(1)</script>', totalMonths: base.totalMonths } });
    const card = endingCard(html);
    expect(card).toContain("金币 -2，低于0");
    expect(card).toContain("触发事件");
    expect(card).toContain("AA聚餐，金币-3");
    expect(html).not.toContain("<script>");
    expect(card).toContain("&lt;script&gt;name&lt;/script&gt;");
    expect(card).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expectEndingStat(card, "money", -2);
  });

  it("deduplicates player publications and includes external coauthorship in venue counts", () => {
    const first = publishedPaper("first-A");
    const coauthor = publishedPaper("coauthor-A", { nonFirstAuthor: true, leadAuthorId: "fellow" });
    const state: GameState = {
      ...finishedState("phd"), totalResearchScore: 17, totalCitations: 123,
      papers: [first, { ...createDraftPaper(1, 1, () => 0), id: "draft" }, { ...createDraftPaper(1, 2, () => 0), id: "reviewing", status: "reviewing", target: "A" }],
      externalPublications: [
        { ...first }, publishedPaper("player-A", { leadAuthorId: "player" }),
        publishedPaper("first-B", { target: "B" }), publishedPaper("first-C", { target: "C" }),
        publishedPaper("first-nature", { target: null, journalTarget: "nature" }),
        publishedPaper("first-nmi", { target: null, journalTarget: "nmi" }),
        publishedPaper("first-pami", { target: null, journalTarget: "pami" }),
        coauthor, { ...coauthor }, publishedPaper("coauthor-nature", { target: null, journalTarget: "nature", nonFirstAuthor: true, leadAuthorId: "external-author" }),
        publishedPaper("unrelated-NPC", { leadAuthorId: "unrelated-fellow" }),
      ],
      fellowPapers: [publishedPaper("npc-only", { leadAuthorId: "unrelated-fellow", target: "B" })],
    };
    const snapshot = structuredClone(state);
    const card = endingCard(renderApp(state));
    for (const [stat, value] of Object.entries({ "research-score": 17, "first-papers": 7, "coauthor-papers": 2, citations: 123, A: 3, B: 1, C: 1, nature: 2, nmi: 1, pami: 1 })) {
      expectEndingStat(card, stat, value);
    }
    expect(state).toEqual(snapshot);
  });

  it("uses journal metadata fallback and precedence without counting journals as conferences", () => {
    const fallback = publishedPaper("fallback-journal", { target: "B" });
    fallback.publication = { ...fallback.publication!, journalTarget: "nmi" };
    const primary = publishedPaper("primary-journal", { target: "A", journalTarget: "nature" });
    primary.publication = { ...primary.publication!, journalTarget: "pami" };
    const card = endingCard(renderApp({ ...finishedState("master"), externalPublications: [fallback, primary] }));
    for (const [stat, value] of Object.entries({ "first-papers": 2, A: 0, B: 0, C: 0, nature: 1, nmi: 1, pami: 0 })) {
      expectEndingStat(card, stat, value);
    }
  });

  it("shows zero publication counts when only drafts and unrelated NPC publications exist", () => {
    const card = endingCard(renderApp({
      ...finishedState("quit"), totalResearchScore: 0, totalCitations: 0,
      papers: [createDraftPaper(1, 0, () => 0)],
      externalPublications: [publishedPaper("npc", { leadAuthorId: "npc" })],
    }));
    for (const stat of ["research-score", "first-papers", "coauthor-papers", "citations", "A", "B", "C", "nature", "nmi", "pami"]) expectEndingStat(card, stat, 0);
    expect(card).not.toContain('class="ending-showcase"');
    expect(card).not.toContain('class="ending-life"');
  });

  it("features the strongest first-author paper and earned milestones", () => {
    const first = publishedPaper("featured", { title: "跨模态表征的长期研究", target: "A",
      idea: 100, experiment: 80, writing: 60, submittedIdea: 100, submittedExperiment: 80, submittedWriting: 60 });
    first.publication = { ...first.publication!, citations: 42, highlyCited: true };
    const coauthor = publishedPaper("coauthor", { title: "合作高分论文", nonFirstAuthor: true, leadAuthorId: "fellow",
      idea: 400, experiment: 400, writing: 400 });
    const state = finishedState("phd");
    state.papers = [first];
    state.externalPublications = [coauthor];
    state.totalCitations = 42;
    state.scholarshipState.awardCount = 2;
    state.internshipCount = 1;
    state.advisorProgressState.playerProjectCompletions = { horizontal: 1, vertical: 2 };
    state.thesis.title = "视觉表征与跨模态检索";
    state.thesis.review = { degree: "phd", title: state.thesis.title, researchPoints: [], submitted: true,
      reason: null, reports: [], passed: true, excellent: true };
    const card = endingCard(renderApp(state));
    expect(card).toContain("《视觉表征与跨模态检索》");
    expect(card).toContain("优秀博士论文");
    expect(card).toContain("《跨模态表征的长期研究》");
    expect(card).not.toContain("《合作高分论文》");
    expect(card).toContain("录用分 240 · 引用 42");
    expectEndingStat(card, "A", 2);
    for (const label of ["ESI高被引 1 篇", "国家奖学金 2 次", "参与项目 3 项", "完成实习 1 次"]) {
      expect(card).toContain(label);
    }
    expect(card).toContain("ending-cover-portrait");
  });

  it("summarizes current relationships, allocated talents, owned goods and nonzero activities", () => {
    const state = finishedState("phd");
    state.selectedAdvisorName = "<导师>";
    state.relationshipState.advisorCount = 1;
    state.fellowProgressState = [createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: "小林", research: 8, affinity: 6, startTotalMonths: 1,
    })];
    state.loverState = { ...activateLover("smart", 1, "male"), name: "小周" };
    state.loverProgressState.intimacy = 9;
    state.shopState.monitorOwned = true;
    state.shopState.keyboardOwned = false;
    state.eventCounters.badmintonCount = 3;
    state.readingState.readCount = 12;
    const card = endingCard(renderApp(state, undefined, {
      talentAllocation: { normal: { "first-month-drive": 2, diligence: 1 } },
    }));
    expect(card).toContain("导师 &lt;导师&gt;");
    expect(card).toContain("小林 · 科研8/默契6");
    expect(card).toContain("小周 · 亲密9");
    expect(card).toContain("满怀干劲 2级");
    expect(card).toContain("勤能补拙 1级");
    expect(card).toContain("2K显示器");
    expect(card).not.toContain("机械键盘");
    expect(card).toContain("羽毛球 3 次");
    expect(card).toContain("读论文 12 次");
    expect(card).not.toContain("打牌 0 次");
  });

  it("includes final attribute caps and current relationship names", () => {
    const base = finishedState("burnout");
    const state: GameState = {
      ...base, sanCap: 25, selectedAdvisorName: "测试导师",
      player: { san: -3, research: 24, social: 12, favor: 9, money: 18 },
      researchCapacityState: { baseCap: 20, jointTrainingCitationCapBonus: 5, otherCapBonus: 2 },
      relationshipState: { ...base.relationshipState, advisorCount: 1, seniorCount: 1, juniorCount: 1, peerCount: 0, loverCount: 1, occupiedSlots: 3, unlockedSlots: 5 },
      fellowProgressState: (["senior", "junior"] as const).map((type) => createCustomFellowProgressProfile({ type, gender: "female", name: type, research: 5, affinity: 1, startTotalMonths: 1 })),
      loverState: activateLover("smart", 1, "male"),
    };
    const card = endingCard(renderApp(state));
    for (const [stat, value] of Object.entries({ san: "-3/25", research: "24/27", social: "12/20", favor: "9/20", money: 18 })) {
      expectEndingStat(card, stat, value);
    }
    expect(card).toContain('data-ending-section="relationships"');
    expect(card).toContain("测试导师");
    expect(card).toContain("senior");
    expect(card).toContain("junior");
    expect(card).not.toContain('data-ending-stat="relationships"');
  });

  it.each([0, 10, 34, 70])("appends exactly one ending page after unchanged monthly pages at month %s", (totalMonths) => {
    const state = { ...finishedState("quit"), totalMonths, log: [{ id: "last-month", month: totalMonths, text: "最后一个真实月份的日志" }] };
    const playing = renderApp({ ...state, phase: "playing", ending: null }, undefined, { activeLogPage: totalMonths });
    const finished = renderApp(state);
    const monthly = timelineMarkers(playing);
    const markers = timelineMarkers(finished);
    const normalize = (marker: string) => marker.replace(/ is-current/g, "").replace(/aria-pressed="(?:true|false)"/g, 'aria-pressed="false"');
    expect(markers).toHaveLength(monthly.length + 1);
    expect(markers.slice(0, -1).map(normalize)).toEqual(monthly.map(normalize));
    expect(markers.at(-1)).toContain(`data-ui-log-page-index="${totalMonths + 1}"`);
    expect(markers.at(-1)).toContain("data-ui-ending-page");
    expect(finished).toContain(`data-log-page-index="${totalMonths + 1}"`);
    expect(finished).not.toContain('id="log-content"');
    const month = renderApp(state, undefined, { activeLogPage: totalMonths });
    expect(month).not.toContain('data-ending="quit"');
    expect(month).toContain('id="log-content"');
    expect(month).toContain("最后一个真实月份的日志");
    const reopened = renderApp(state, undefined, { activeLogPage: totalMonths + 1 });
    expect(endingCard(reopened)).toContain("data-ui-close-ending-content");
    expect(reopened).not.toContain('id="log-content"');
  });

  it("places the ending after the highest logged month even when it is ahead of the current month", () => {
    const state = { ...finishedState("quit"), totalMonths: 10, log: [{ id: "future-log", month: 12, text: "保留的较晚月份日志" }] };
    const html = renderApp(state);
    expect(timelineMarkers(html)).toHaveLength(14);
    expect(timelineMarkers(html).at(-1)).toContain('data-ui-log-page-index="13"');
    expect(html).toContain('data-log-page-index="13"');
    const month = renderApp(state, undefined, { activeLogPage: 12 });
    expect(month).toContain("保留的较晚月份日志");
    expect(month).not.toContain('data-ending="quit"');
  });

  it.each([
    ["burnout", "不堪重负"], ["poor", "穷困潦倒"], ["expelled", "逐出师门"], ["isolated", "被孤立"],
    ["overthinking", "用脑过度"],
    ["delay", "延毕"], ["quit", "主动退学"], ["master", "硕士毕业"], ["phd", "博士毕业"],
  ] as const)("collapses %s to a clickable ending log on the same timeline page and reopens its stats", (ending, title) => {
    const state = finishedState(ending);
    const snapshot = structuredClone(state);
    const opened = renderApp(state);
    expect(endingCard(opened)).toContain("data-ending-stat=");
    expect(opened).not.toContain('id="log-content"');
    for (const activePlayTab of ["events", "research", "events"] as const) {
      const closed = renderApp(state, undefined, { activePlayTab, isEndingContentOpen: false });
      expect(closed).toContain(`data-log-page-index="${state.totalMonths + 1}"`);
      const marker = timelineMarkers(closed).find((entry) => entry.includes("data-ui-ending-page"));
      expect(marker).toContain('aria-pressed="true"');
      expect(closed.match(/id="log-content"/g)).toHaveLength(1);
      expect(closed).not.toContain('class="ending-panel"');
      expect(closed).not.toContain("data-ending-stat=");
      expect(closed).not.toContain("data-ui-close-ending-content");
      const buttons = closed.match(/<button\b[^>]*data-ui-open-ending-content[^>]*>[\s\S]*?<\/button>/g) ?? [];
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toContain(`结局：${title}`);
      expect(buttons[0]).not.toMatch(/\sdisabled(?:\s|>)/);
      expect(buttons[0]).not.toContain("data-action=");
      expect(closed.indexOf(buttons[0]!)).toBeGreaterThan(closed.indexOf('id="log-content"'));
      expectFrozenCalendar(closed);
    }
    const reopened = renderApp(state, undefined, { activePlayTab: "events", activeLogPage: state.totalMonths + 1, isEndingContentOpen: true });
    expect(endingCard(reopened)).toContain(`<h2 id="ending-title">${title}</h2>`);
    expectEndingStat(endingCard(reopened), "research-score", state.totalResearchScore);
    expect(reopened).not.toContain('id="log-content"');
    expect(reopened).not.toContain("data-ui-open-ending-content");
    expect(reopened).toContain(`data-log-page-index="${state.totalMonths + 1}"`);
    expect(state).toEqual(snapshot);
  });

  it.each([
    ["burnout", "SAN 已跌破 0，本轮提前结束。"],
    ["poor", "金币已跌破 0，本轮提前结束。"],
    ["expelled", "导师好感已跌破 0，本轮提前结束。"],
    ["isolated", "社交能力已跌破 0，本轮提前结束。"],
    ["overthinking", "科研能力已跌破 0，本轮提前结束。"],
  ] as const)("hides the generic %s warning from monthly logs while preserving its cause", (ending, warning) => {
    const cause = "组内团建：AA聚餐，金币 -3。";
    const variants = [warning, warning.replace(/\s/g, "").replace(/。$/, ""), `  ${warning.replace("0", "  0")}  `];
    const base = finishedState(ending);
    const state: GameState = { ...base, endingCause: { text: cause, totalMonths: base.totalMonths },
      log: [...variants.map((text, index) => ({ id: `warning-${index}`, month: base.totalMonths, text })), { id: "cause", month: base.totalMonths, text: cause }],
    };
    const snapshot = structuredClone(state);
    for (const isEndingContentOpen of [false, true]) {
      const monthly = renderApp(state, undefined, { activeLogPage: state.totalMonths, isEndingContentOpen });
      const text = monthly.replace(/<[^>]*>/g, "").replace(/\s/g, "");
      expect(text).not.toContain(warning.replace(/\s/g, "").replace(/。$/, ""));
      expect(monthly).toContain('id="log-content"');
      expect(monthly).toContain("AA聚餐");
      expect(monthly).not.toContain("data-ui-open-ending-content");
      expect(monthly).not.toContain('class="ending-panel"');
    }
    expect(endingCard(renderApp(state))).toContain("AA聚餐");
    expect(state).toEqual(snapshot);
  });

  it.each([
    ["quit", "你选择了退学，本轮结束。"],
    ["master", "硕士毕业：科研分 2/1。"],
    ["phd", "博士毕业：科研分 9/7。"],
    ["delay", "延期毕业：科研分 0/1。"],
    ["delay", "延期毕业：科研分 0，毕业要求尚未确定。"],
  ] as const)("filters the synthetic %s summary without deleting ordinary monthly logs: %s", (ending, summary) => {
    const base = finishedState(ending);
    const state: GameState = { ...base, log: [
      { id: "summary", month: base.totalMonths, text: summary },
      { id: "ordinary", month: base.totalMonths, text: "导师讨论：完成了最后一次组会汇报。" },
    ] };
    const snapshot = structuredClone(state);
    const monthly = renderApp(state, undefined, { activeLogPage: state.totalMonths });
    const text = monthly.replace(/<[^>]*>/g, "").replace(/\s/g, "");
    expect(text).not.toContain(summary.replace(/\s/g, ""));
    expect(monthly).toContain("完成了最后一次组会汇报");
    expect(state).toEqual(snapshot);
  });

  it("explains graduation and differentiates score failure from missing blind review", () => {
    expect(endingCard(renderApp(finishedState("phd")))).toContain("毕业线 7 · 盲审通过");
    expect(endingCard(renderApp({ ...finishedState("delay"), totalResearchScore: 0 }))).toContain("科研分 0/1，未达标");
    expect(endingCard(renderApp(finishedState("delay")))).toContain("未完成盲审送审");
  });

  it.each<PlayTabId>(["events", "research", "workstation", "relationship", "shop", "talent", "settings"])("honors explicit %s browsing after finishing", (activePlayTab) => {
    const state = finishedState("master");
    const snapshot = structuredClone(state);
    const html = renderApp(state, undefined, { activePlayTab });
    const tab = html.match(new RegExp(`<button\\b[^>]*data-ui-play-tab="${activePlayTab}"[^>]*>`))?.[0] ?? "";
    const panel = html.match(new RegExp(`<section\\b[^>]*data-tab-panel="${activePlayTab}"[^>]*>`))?.[0] ?? "";
    expect(tab).toContain('aria-pressed="true"');
    expect(tab).not.toMatch(/\sdisabled(?:\s|>)/);
    expect(panel).toContain(`data-tab-panel="${activePlayTab}"`);
    expect(panel).not.toMatch(/\shidden(?:\s|>)/);
    const events = html.match(/<section\b[^>]*data-tab-panel="events"[^>]*>/)?.[0] ?? "";
    if (activePlayTab === "events") expect(events).not.toMatch(/\shidden(?:\s|>)/);
    else expect(events).toMatch(/\shidden(?:\s|>)/);
    expectFrozenCalendar(html);
    expect(state).toEqual(snapshot);
  });

  it.each([0, 1])("temporarily replaces the ending card with completed event scene %s", (activeEventHistoryIndex) => {
    const state = finishedState("poor");
    const descriptions = ["历史事件第一幕内容", "历史事件第二幕内容"];
    state.eventHistory = [{
      id: "ending-history", chainId: "ending-history-chain", source: "fixed",
      completedAtTotalMonths: state.totalMonths, completedAtYear: state.year, completedAtMonth: state.month,
      stages: descriptions.map((description, index) => ({
        title: `历史事件第${index + 1}幕`, description,
        choices: [{ id: "confirm", label: "已完成的选择", outcome: "已结算" }], selectedChoiceId: "confirm",
      })),
    }];
    state.log = [{ id: "ending-history-log", month: state.totalMonths, text: "历史事件已完成", eventHistoryId: "ending-history" }];
    const snapshot = structuredClone(state);
    const html = renderApp(state, undefined, {
      activePlayTab: "events", isEventContentOpen: true, activeEventHistoryId: "ending-history", activeEventHistoryIndex,
    });
    expect(html).not.toContain('data-ending="poor"');
    expect(html).toContain(descriptions[activeEventHistoryIndex]);
    expect(html).toContain('id="event-content-box"');
    expect(html).toContain('data-ui-event-scene-index="0"');
    expect(html).toContain('data-ui-event-scene-index="1"');
    const choices = html.match(/<div class="event-content-buttons" id="event-content-buttons">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(choices).toContain(activeEventHistoryIndex === 0 ? ">继续</span>" : ">已完成的选择</span>");
    expect(choices).toContain('aria-disabled="true"');
    expect(choices).toContain("is-selected");
    expect(choices).not.toContain('data-action="resolve-event"');
    expectFrozenCalendar(html);
    const closed = renderApp(state, undefined, {
      activePlayTab: "events", activeLogPage: state.totalMonths, isEventContentOpen: false, activeEventHistoryId: "ending-history", activeEventHistoryIndex,
    });
    expect(closed).not.toContain('data-ending="poor"');
    expect(closed).toContain('id="log-content"');
    expect(closed).not.toContain('id="event-content-box"');
    expect(state).toEqual(snapshot);
  });

  it("can inspect a remaining pending event and return to its real month", () => {
    const state = finishedState("burnout");
    state.eventQueue = [createEventQueueItem({
      id: "remaining-event", title: "未处理事件", description: "结束时保留的事件内容", source: "fixed",
      blocking: true, deadlineMonths: 0, chainId: "remaining-event", stage: "result",
      choices: [{ id: "confirm", label: "确认", outcome: "金币增加", effects: { money: 10 } }],
    }, 1)];
    const snapshot = structuredClone(state);
    const html = renderApp(state, undefined, { activePlayTab: "events", isEventContentOpen: true, activeEventId: "remaining-event" });
    expect(html).not.toContain('data-ending="burnout"');
    expect(html).toContain("结束时保留的事件内容");
    expectFrozenCalendar(html);
    const closed = renderApp(state, undefined, { activePlayTab: "events", activeLogPage: state.totalMonths, isEventContentOpen: false, activeEventId: "remaining-event" });
    expect(closed).not.toContain('data-ending="burnout"');
    expect(closed).toContain('id="log-content"');
    expect(state).toEqual(snapshot);
  });
});
