import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { renderRewinderEvent } from "../src/app/v2-render-rewinder-event";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { captureRewinderGrowth } from "../src/core/v2-rewinder-growth";
import { captureRewinderRelationships } from "../src/core/v2-rewinder-relationships";
import { initializeRewinder, prepareRewinderYear, getRewinderPreview, toggleRewinderPerson } from "../src/core/v2-rewinder";
import type { GameState } from "../src/core/v2-types";

function fixture(): GameState {
  const base = createStartedGameState("rewinder");
  const past: GameState = { ...base, selectedAdvisorName: "陈老师", year: 1, month: 12, totalMonths: 12,
    player: { ...base.player, research: 19.4 },
    fellowProgressState: [createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 14.4,
      affinity: 16.2, startTotalMonths: 2, name: "林清", taskType: "writing" })] };
  const record = { growth: captureRewinderGrowth(past), relationships: captureRewinderRelationships(past) };
  return prepareRewinderYear(initializeRewinder({ ...base, totalMonths: 12, month: 12, year: 1, selectedAdvisorName: "本世导师" }, { years: { 1: record } }));
}

describe("rewinder annual event display", () => {
  it("shows live comparisons, keeps decisions accessible, and freezes historical displays", () => {
    const state = fixture();
    const preview = getRewinderPreview(state)!;
    const html = renderRewinderEvent(preview, state);
    expect(html).toContain("19.4 / 20");
    expect(html).toContain("林清");
    expect(html).toContain('data-action="toggle-rewinder-person"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("金币");
    const selected = toggleRewinderPerson(state, preview.candidates[0]!.key);
    expect(renderRewinderEvent(preview, selected)).toContain('aria-pressed="true"');
    expect(renderRewinderEvent(preview)).not.toContain('data-action="toggle-rewinder-person"');
    const full = renderApp(state, undefined, { activePlayTab: "events", isEventContentOpen: true,
      activeEventId: state.eventQueue.find(event => event.rewinderPresentation)?.id });
    expect(full).toContain("rewinder-event");
    expect(full).toContain('data-action="resolve-event"');
  });

  it("keeps the same four read-only abilities available inside a run", () => {
    const html = renderApp(fixture(), undefined, { activePlayTab: "talent", activeTalentTab: "character" });
    expect(html.match(/data-rewinder-rule=/g)).toHaveLength(4);
    expect(html).not.toContain("玩法待实装");
    expect(html).not.toContain("暂无角色天赋树");
  });
});
