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
      expect(button).toContain('data-event-risk-tooltip');
      expect(button).toContain('金币不足，结算后为-1，将进入失败结局：穷困潦倒。');
      expect(button).not.toContain('title=');
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
    expect(button).toContain('金币可能不足（结算后-2～0），可能进入失败结局：穷困潦倒。');
    expect(button).toContain('data-event-risk-tooltip');
    expect(button).toContain('is-possible');
  });
});

describe("publication agenda previews", () => {
  function attendancePlan(mode: "self" | "advisor" | "proxy", due: number | undefined = 18): NonNullable<GameState["conferenceAttendancePlans"]>[number] {
    return {
      context: {
        id: "conference-trip", conferenceName: getConferenceInfo(1, "A", 2).name,
        conferenceYear: 2027, city: "北京", country: "中国", region: "domestic",
        grade: "A", paperCount: 2, paperIds: ["accepted1", "accepted2"],
        availableAtTotalMonths: due,
      },
      mode, rolls: [0.25, 0.75],
    };
  }

  it("keeps separate review results without previewing unarranged accepted papers", () => {
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
    expect(items.some(item => [`${venue}安排`, `${venue}参会`, `${venue}活动`].includes(item.title))).toBe(false);
    expect(current).toEqual(before);
  });

  it.each(["self", "advisor"] as const)("previews one activity for a confirmed %s plan with multiple papers", (mode) => {
    const current = state();
    const plan = attendancePlan(mode);
    current.conferenceAttendancePlans = [plan];
    const before = structuredClone(current);
    const random = vi.spyOn(Math, "random");
    try {
      for (const monthsLater of [1, 2, 3]) {
        const items = buildFutureTodoPreviewItems({ ...current, totalMonths: 18 - monthsLater });
        expect(items.filter(item => item.title === `${plan.context.conferenceName}活动`))
          .toMatchObject([{ monthsLater }]);
        expect(items.some(item => item.title === `${plan.context.conferenceName}参会`)).toBe(false);
      }
      expect(current).toEqual(before);
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it("excludes proxy, undated, current and past plans and respects the training endpoint", () => {
    const current = state();
    const title = `${attendancePlan("self").context.conferenceName}活动`;
    current.conferenceAttendancePlans = [
      attendancePlan("proxy"),
      { ...attendancePlan("self"), context: { ...attendancePlan("self").context, availableAtTotalMonths: undefined } },
      attendancePlan("self", 15),
      attendancePlan("advisor", 14),
    ];
    expect(buildFutureTodoPreviewItems(current).some(item => item.title === title)).toBe(false);
    current.conferenceAttendancePlans = [attendancePlan("self")];
    expect(buildFutureTodoPreviewItems({ ...current, maxMonths: 17 }).some(item => item.title === title)).toBe(false);
    expect(buildFutureTodoPreviewItems({ ...current, maxMonths: 18 }).filter(item => item.title === title))
      .toMatchObject([{ monthsLater: 3 }]);
  });
});
