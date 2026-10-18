import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { renderRewinderEvent } from "../src/app/v2-render-rewinder-event";
import { renderRewinderPreview } from "../src/app/v2-render-rewinder";
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
    expect(html).toContain('data-rewinder-act="attributes"');
    expect(html).not.toContain('data-action="toggle-rewinder-person"');
    expect(html).not.toContain("金币");
    const people = renderRewinderEvent(preview, state, "relationships");
    expect(people).toContain("林清");
    expect(people).toContain('data-action="toggle-rewinder-person"');
    expect(people).toContain('aria-pressed="false"');
    const selected = toggleRewinderPerson(state, preview.candidates[0]!.key);
    expect(renderRewinderEvent(preview, selected, "relationships")).toContain('class="rewinder-person is-selected"');
    expect(renderRewinderEvent(preview, undefined, "relationships")).not.toContain('data-action="toggle-rewinder-person"');
    const full = renderApp(state, undefined, { activePlayTab: "events", isEventContentOpen: true,
      activeEventId: state.eventQueue.find(event => event.rewinderPresentation)?.id });
    expect(full).toContain("rewinder-event");
    expect(full).toContain("继续 · 成长");
    expect(full).not.toContain('data-event-choice-id="confirm-rewinder-year"');
    const lastAct = renderApp(state, undefined, { activePlayTab: "events", isEventContentOpen: true,
      activeRewinderAct: "relationships", activeEventId: state.eventQueue.find(event => event.rewinderPresentation)?.id });
    expect(lastAct).toContain('data-event-choice-id="confirm-rewinder-year"');
  });

  it("shows one scene at a time and omits removed growth and career inheritance", () => {
    const state = fixture();
    const preview = getRewinderPreview(state)!;
    const attributes = renderRewinderEvent(preview, state);
    expect(attributes.match(/data-ui-rewinder-act=/g)).toHaveLength(3);
    expect(attributes).toContain("当前值 +");
    expect(attributes).toContain("保持");
    expect(attributes).not.toContain("rewinder-comparison-grid is-growth");
    const growth = renderRewinderEvent(preview, state, "growth");
    expect(growth).toContain('data-rewinder-act="growth"');
    expect(growth).toContain("读论文");
    expect(growth).toContain("洛克王国");
    expect(growth).not.toContain("rewinder-stat-grid");
    expect(growth).not.toMatch(/参会|实习|联培|undefined/);
  });

  it("keeps the four compact read-only abilities available inside a run", () => {
    const html = renderApp(fixture(), undefined, { activePlayTab: "talent", activeTalentTab: "character" });
    expect(html.match(/data-rewinder-rule=/g)).toHaveLength(4);
    expect(html).not.toContain("玩法待实装");
    expect(html).not.toContain("暂无角色天赋树");
  });

  it("keeps the special rule in the first row without the universal event ability", () => {
    const html = renderRewinderPreview(3, 12);
    const nodes = html.match(/<button[^>]*data-rewinder-rule="\d+"[^>]*>/g)!;
    expect(nodes).toHaveLength(4);
    expect(nodes[3]).toContain('data-ui-talent-tree-node="0-3"');
    expect(nodes[3]).toContain('grid-column:4;grid-row:1');
    expect(nodes[3]).toContain('aria-pressed="true"');
    expect(html).toContain("第12次轮回");
    expect(html).not.toContain("局内轮回");
    expect(html).not.toContain("事件可回退");
    expect(html).not.toContain("结果固定");
    expect(renderRewinderPreview(4, NaN)).toContain('data-rewinder-cycle="1"');
  });

  it("shows the frozen cycle number across all three annual scenes and historical records", () => {
    const preview = { ...getRewinderPreview(fixture())!, cycleNumber: 7 };
    for (const act of ["attributes", "growth", "relationships"] as const) {
      const html = renderRewinderEvent(preview, undefined, act);
      expect(html).toContain('data-rewinder-cycle="7"');
      expect(html).toContain("第7次轮回");
      expect(html).toContain("第1学年 · 往世回响");
    }
  });
});
