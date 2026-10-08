import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getConferenceInfo } from "../src/core/v2-conference-catalog";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function state(): GameState {
  const initial = createStartedGameState("normal");
  return { ...initial, year: 2, month: 3, totalMonths: 15, maxMonths: 70,
    selectedAdvisorName: "测试导师", eventQueue: [] };
}

function renderEvent(current: GameState, event: PendingEvent) {
  return renderApp({ ...current, eventQueue: [createEventQueueItem(event, 0)] }, undefined, {
    isEventContentOpen: true, activeEventId: event.id,
  });
}

describe("event navigation and risk display", () => {
  it("uses Continue on an introduction and Confirm on its final result", () => {
    const event: PendingEvent = { id: "one", chainId: "one", title: "事件", description: "正文",
      stage: "act1", source: "fixed", blocking: true, deadlineMonths: 0,
      choices: [{ id: "go", label: "查看通知", outcome: "", effects: {} }] };
    expect(renderEvent(state(), event)).toContain('<span>继续</span>');
    expect(renderEvent(state(), { ...event, stage: "act3" })).toContain('<span>确定</span>');
  });

  it("keeps lethal confirmation enabled, warns on hover, and does not mutate or consume RNG", () => {
    const current = state();
    current.player.money = 1;
    const event: PendingEvent = { id: "cost", chainId: "cost", title: "确认支付", description: "正文",
      stage: "act3", source: "fixed", blocking: true, deadlineMonths: 0,
      choices: [{ id: "confirm", label: "确定", outcome: "金币 -2", effects: { money: -2 } }] };
    const before = structuredClone(current);
    const random = vi.spyOn(Math, "random");
    try {
      const html = renderEvent(current, event);
      const button = html.match(/<button\s+class="event-choice-btn[\s\S]*?<\/button>/u)![0];
      expect(button).toContain('title="会暴毙"');
      expect(button).toContain('is-certain');
      expect(button).not.toContain('disabled');
      expect(button).toContain('data-action="resolve-event"');
      expect(current).toEqual(before);
      expect(random).not.toHaveBeenCalled();
      const exact = renderEvent({ ...current, player: { ...current.player, money: 2 } }, event);
      expect(exact).not.toContain('event-choice-risk');
    } finally { random.mockRestore(); }
  });

  it.each([0, 0.999])("warns about possible dinner bankruptcy independently of hidden roll %s", (roll) => {
    const current = state();
    current.player.money = 0;
    const root = createRandomEventById(7, current, () => roll).event!;
    const decision = root.choices[0]!.effects.enqueueEvents![0]!;
    const html = renderEvent(current, decision);
    const button = [...html.matchAll(/<button\s+class="event-choice-btn[\s\S]*?<\/button>/gu)]
      .map(match => match[0]).find(value => value.includes('聚餐'))!;
    expect(button).toContain('可能会暴毙');
    expect(button).toContain('is-possible');
  });
});

describe("publication agenda previews", () => {
  it("shows separate review results and one future arrangement per conference", () => {
    const current = state();
    const draft = { ...createDraftPaper(1, 0, () => 0), target: "A" as const, submittedMonth: 1, submittedYear: 2 };
    const venue = getConferenceInfo(1, "A", 2).name;
    current.papers = [
      { ...draft, id: "review1", status: "reviewing", reviewMonthsLeft: 1 },
      { ...draft, id: "review2", status: "reviewing", reviewMonthsLeft: 1 },
      { ...draft, id: "accepted1", status: "published", conferenceAvailableAtTotalMonths: 18 },
    ];
    current.externalPublications = [
      { ...draft, id: "accepted2", status: "published", conferenceAvailableAtTotalMonths: 18 },
      { ...draft, id: "handled", status: "published", conferenceHandled: true, conferenceAvailableAtTotalMonths: 17 },
      { ...draft, id: "coauthor", status: "published", nonFirstAuthor: true, conferenceAvailableAtTotalMonths: 16 },
    ];
    const before = structuredClone(current);
    const items = buildFutureTodoPreviewItems(current);
    expect(items.filter(item => item.title === `${venue}结果`)).toHaveLength(2);
    expect(items.filter(item => item.title === `${venue}安排`)).toMatchObject([{ monthsLater: 3 }]);
    expect(buildFutureTodoPreviewItems({ ...current, maxMonths: 17 }).some(item => item.title === `${venue}安排`)).toBe(false);
    expect(current).toEqual(before);
  });
});
