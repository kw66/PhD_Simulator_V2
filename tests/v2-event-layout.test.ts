import { describe, expect, it, vi } from "vitest";
import { renderEventLayoutSamples } from "../src/app/v2-render-play";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { createAdvisorProjectRandomEvent } from "../src/core/v2-random-events-lab-advisor-project";
import type { EventQueueItem, PendingEvent, ResolvedEventRecord } from "../src/core/v2-types";

function scene(id: string, description: string, next: PendingEvent[] = [], chainId = "layout-test"): PendingEvent {
  return { id, title: id, description, chainId, source: "random", stage: "act1", blocking: true, deadlineMonths: 0,
    choices: [{ id: "continue", label: "继续", outcome: "", effects: { enqueueEvents: next } }] };
}

describe("event layout samples", () => {
  it("reserves the selected advisor choice checkmark before entering the result scene", () => {
    const state = createStartedGameState("normal");
    const current: EventQueueItem = { ...createAdvisorProjectRandomEvent(state, () => 0), queueOrder: 1 };
    const before = structuredClone(current);
    const samples = renderEventLayoutSamples(current, null, state);
    const selected = samples.filter((sample) => sample.key.includes(":selected:"));
    expect(selected).toHaveLength(4);
    for (const sample of selected) {
      expect(sample.html).toContain('is-selected');
      expect(sample.html).toContain('data-lucide="check"');
      expect(sample.html).toContain('disabled aria-disabled="true"');
    }
    expect(new Set(samples.map((sample) => sample.key)).size).toBe(samples.length);
    expect(current).toEqual(before);
  });

  it.each([0, 6])("includes teacher-day result variants at favor %i without changing state or consuming randomness", (favor) => {
    const state = createStartedGameState("normal");
    state.player.favor = favor;
    const current: EventQueueItem = { ...createTeachersDayEvent(state, () => 0), queueOrder: 1 };
    const before = structuredClone(state);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Layout must not roll"); });
    try {
      const samples = renderEventLayoutSamples(current, null, state);
      const html = samples.map((sample) => sample.html).join("");
      expect(html).toContain(favor >= 6 ? "导师来电" : "导师请求");
      expect(html).toContain("简单祝福");
      expect(html).toContain("礼物送达");
      expect(html).toContain("邮票送达");
      expect(samples[1]?.html.match(/class="event-description-story"/g)).toHaveLength(2);
      expect(new Set(samples.map((sample) => sample.key)).size).toBe(samples.length);
      expect(state).toEqual(before);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it("measures all prepared branches of this chain without resolving choices or drawing randomness", () => {
    const result = scene("result", "结算正文");
    const decision = scene("decision", "决策正文", [result]);
    const other = scene("unrelated", "下一事件内容", [], "other-chain");
    const current: EventQueueItem = { ...scene("intro", "开场正文", [decision, other]), queueOrder: 1 };
    const before = structuredClone(current);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Layout must not roll"); });
    try {
      const samples = renderEventLayoutSamples(current, null);
      expect(samples).toHaveLength(3);
      expect(samples[2]?.html).toContain('data-ui-event-scene-index="2"');
      expect(samples.map((sample) => sample.html).join("")).not.toContain("下一事件内容");
      expect(current).toEqual(before);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it("keeps distinct branches with shared IDs and stops object cycles", () => {
    const first = scene("same-id", "较短结果");
    const second = scene("same-id", "另一条更长的结果文案");
    const current: EventQueueItem = { ...scene("intro", "开场", [first, second]), queueOrder: 1 };
    first.choices[0]!.effects.enqueueEvents = [current];
    const samples = renderEventLayoutSamples(current, null);
    expect(samples).toHaveLength(3);
    expect(samples[1]?.html).toContain("较短结果");
    expect(samples[2]?.html).toContain("另一条更长的结果文案");
    expect(new Set(samples.map((sample) => sample.key)).size).toBe(3);
  });

  it("includes all completed stages and keeps history buttons non-interactive", () => {
    const history: ResolvedEventRecord = { id: "record", chainId: "layout-test", source: "random", completedAtTotalMonths: 1,
      completedAtYear: 1, completedAtMonth: 1, stages: ["开场", "结果"].map((description) => ({
        title: description, description, selectedChoiceId: "continue", choices: [{ id: "continue", label: "继续", outcome: "" }],
      })) };
    const samples = renderEventLayoutSamples(null, history);
    expect(samples).toHaveLength(2);
    for (const sample of samples) {
      expect(sample.html).toContain('disabled aria-disabled="true"');
      expect(sample.html).not.toContain('data-action="resolve-event"');
    }
    expect(renderEventLayoutSamples(null, null)).toEqual([]);
  });
});
