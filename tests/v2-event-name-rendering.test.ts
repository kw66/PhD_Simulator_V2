import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function scene(description: string, narrativeNames?: string[]): PendingEvent {
  return {
    id: "named-scene", chainId: "named-scene", title: "会后交流", source: "fixed",
    description, narrativeNames, stage: "result", blocking: true, deadlineMonths: 0,
    choices: [{ id: "close", label: "确定", outcome: "", effects: {} }],
  };
}

describe("event character name rendering", () => {
  it("highlights complete names safely throughout prose and emphasis, without touching results or title attributes", () => {
    const event = scene('林青山与林青聊起课题。**林青山**又介绍了A<B&。\n\n小提示：出现条件：与林青山合作≥3次。\n\n机制结算\n\n结果：与林青山合作达1次', ["林青", "林青山", "A<B&"]);
    const state = { ...createStartedGameState("normal"), eventQueue: [createEventQueueItem(event, 1)] };
    const html = renderApp(state, undefined, { activePlayTab: "events", isEventContentOpen: true, activeEventId: event.id });
    expect(html).toContain('<mark class="event-name-highlight">林青山</mark>与<mark class="event-name-highlight">林青</mark>');
    expect(html).toContain('<strong><mark class="event-name-highlight">林青山</mark></strong>');
    expect(html).toContain('<mark class="event-name-highlight">A&lt;B&amp;</mark>');
    expect(html).not.toContain("A<B&");
    const tip = html.match(/<p class="event-description-note">([\s\S]*?)<\/p>/u)?.[1];
    expect(tip).toContain("出现条件：与林青山合作≥3次。");
    expect(tip).not.toContain("event-name-highlight");
    expect(html).toContain('<span class="event-settlement-item">与林青山合作达1次</span>');
    const tabs = [...html.matchAll(/<button\s+class="event-scene-tab[^>]*>/gu)].map(match => match[0]);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).not.toMatch(/\stitle=|data-tooltip=/u);
  });

  it("retains names in completed history after the named person is no longer in live state or preview metadata", () => {
    const root = scene("你向林遥请教，林遥在草稿上画出了关键一步。");
    const initial = createStartedGameState("normal");
    let state: GameState = { ...initial, selectedAdvisorName: "林遥", eventQueue: [createEventQueueItem(root, 1)] };
    state = dispatchAction(state, "resolve-event", { eventId: root.id, eventChoiceId: "close" });
    const record = state.eventHistory.find(event => event.chainId === root.chainId)!;
    expect(record.stages[0]?.narrativeNames).toEqual(["林遥"]);
    expect(record.stages[0]?.replayEvent).toBeUndefined();
    expect(record.stages[0]?.description).not.toContain("<mark");
    const saved = JSON.parse(JSON.stringify({ ...state, selectedAdvisorName: "另一位导师" }));
    const html = renderApp(saved, undefined, { activePlayTab: "events", isEventContentOpen: true, activeEventHistoryId: record.id });
    expect(html.match(/<mark class="event-name-highlight">林遥<\/mark>/gu)).toHaveLength(2);
  });
});
