import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import type { PlayTabId } from "../src/app/v2-render-types";
import type { EndingId, GameState, Paper } from "../src/core/v2-types";

function finishedState(ending: EndingId): GameState {
  const base = createStartedGameState("normal");
  return { ...base, phase: "finished", ending, degree: ending === "phd" ? "phd" : "master", playerName: "林青", totalMonths: 68, year: 6, month: 8,
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
  it.each([
    ["burnout", "不堪重负"], ["poor", "穷困潦倒"], ["expelled", "逐出师门"], ["isolated", "被孤立"],
    ["delay", "延毕"], ["quit", "主动退学"], ["master", "硕士毕业"], ["phd", "博士毕业"],
  ] as const)("shows %s on its own ending timeline page within the read-only shell", (ending, title) => {
    const html = renderApp(finishedState(ending));
    const card = endingCard(html);
    expect(card).toContain(`<h2 id="ending-title">${title}</h2>`);
    expect(card).not.toContain("<h1");
    expect(card).toContain(`data-ending="${ending}"`);
    expect(card).toContain("林青");
    expect(card).toContain("大多数");
    expect(card).toContain("68");
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
    expect(endingMarker[0]).toContain('data-ui-log-page-index="69"');
    expect(endingMarker[0]).toContain('aria-pressed="true"');
    expect(endingMarker[0]).toMatch(/>结局<\/span>/);
    expect(card).toMatch(/class="ending-story">\s*<p>[^<]+<\/p>/);
    expect(card).toContain('class="ending-reason"');
    expect(card).toMatch(/class="ending-closing">[^<]+<\/p>/);
    const actions = card.match(/<footer\b[^>]*class="ending-actions"[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? "";
    expect(actions.match(/<button\b/g)).toHaveLength(2);
    expect(actions).toContain('data-action="restart-game"');
    expect(actions).toContain('data-action="reset-game"');
    expect(card).not.toContain('data-action="quit-game"');
  });

  it("shows the actual failed value and safely escapes the final cause and player name", () => {
    const base = finishedState("poor");
    const html = renderApp({ ...base, playerName: "<script>name</script>", player: { ...base.player, money: -2 },
      endingCause: { text: '组内团建：AA聚餐，金币-3\n<script>alert(1)</script>', totalMonths: 68 } });
    const card = endingCard(html);
    expect(card).toContain("金币 -2，低于0");
    expect(card).toContain("最后发生的事");
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
  });

  it("includes final attribute caps and counts advisor, fellow and lover relationships", () => {
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
    for (const [stat, value] of Object.entries({ san: "-3/25", research: "24/27", social: 12, favor: 9, money: 18, relationships: 4 })) {
      expectEndingStat(card, stat, value);
    }
  });

  it.each([0, 10, 68])("appends exactly one ending page after unchanged monthly pages at month %s", (totalMonths) => {
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
    ["delay", "延毕"], ["quit", "主动退学"], ["master", "硕士毕业"], ["phd", "博士毕业"],
  ] as const)("collapses %s to a clickable ending log on the same timeline page and reopens its stats", (ending, title) => {
    const state = finishedState(ending);
    const snapshot = structuredClone(state);
    const opened = renderApp(state);
    expect(endingCard(opened)).toContain("data-ending-stat=");
    expect(opened).not.toContain('id="log-content"');
    for (const activePlayTab of ["events", "research", "events"] as const) {
      const closed = renderApp(state, undefined, { activePlayTab, isEndingContentOpen: false });
      expect(closed).toContain('data-log-page-index="69"');
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
    const reopened = renderApp(state, undefined, { activePlayTab: "events", activeLogPage: 69, isEndingContentOpen: true });
    expect(endingCard(reopened)).toContain(`<h2 id="ending-title">${title}</h2>`);
    expectEndingStat(endingCard(reopened), "research-score", state.totalResearchScore);
    expect(reopened).not.toContain('id="log-content"');
    expect(reopened).not.toContain("data-ui-open-ending-content");
    expect(reopened).toContain('data-log-page-index="69"');
    expect(state).toEqual(snapshot);
  });

  it.each([
    ["burnout", "SAN 已跌破 0，本轮提前结束。"],
    ["poor", "金币已跌破 0，本轮提前结束。"],
    ["expelled", "导师好感已跌破 0，本轮提前结束。"],
    ["isolated", "社交能力已跌破 0，本轮提前结束。"],
  ] as const)("hides the generic %s warning from monthly logs while preserving its cause", (ending, warning) => {
    const cause = "组内团建：AA聚餐，金币 -3。";
    const variants = [warning, warning.replace(/\s/g, "").replace(/。$/, ""), `  ${warning.replace("0", "  0")}  `];
    const state: GameState = { ...finishedState(ending), endingCause: { text: cause, totalMonths: 68 },
      log: [...variants.map((text, index) => ({ id: `warning-${index}`, month: 68, text })), { id: "cause", month: 68, text: cause }],
    };
    const snapshot = structuredClone(state);
    for (const isEndingContentOpen of [false, true]) {
      const monthly = renderApp(state, undefined, { activeLogPage: 68, isEndingContentOpen });
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
    const state: GameState = { ...finishedState(ending), log: [
      { id: "summary", month: 68, text: summary },
      { id: "ordinary", month: 68, text: "导师讨论：完成了最后一次组会汇报。" },
    ] };
    const snapshot = structuredClone(state);
    const monthly = renderApp(state, undefined, { activeLogPage: 68 });
    const text = monthly.replace(/<[^>]*>/g, "").replace(/\s/g, "");
    expect(text).not.toContain(summary.replace(/\s/g, ""));
    expect(monthly).toContain("完成了最后一次组会汇报");
    expect(state).toEqual(snapshot);
  });

  it("uses current degree requirements for graduation and delay without requiring thesis or job progress", () => {
    expect(endingCard(renderApp(finishedState("phd")))).toContain("博士毕业要求已达成：科研分 9/7");
    expect(endingCard(renderApp({ ...finishedState("delay"), totalResearchScore: 0 }))).toContain("培养期已满68个月，科研分0/1，尚未达标");
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
      completedAtTotalMonths: 68, completedAtYear: 6, completedAtMonth: 8,
      stages: descriptions.map((description, index) => ({
        title: `历史事件第${index + 1}幕`, description,
        choices: [{ id: "confirm", label: "已完成的选择", outcome: "已结算" }], selectedChoiceId: "confirm",
      })),
    }];
    state.log = [{ id: "ending-history-log", month: 68, text: "历史事件已完成", eventHistoryId: "ending-history" }];
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
    expect(choices).toContain("已完成的选择");
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
