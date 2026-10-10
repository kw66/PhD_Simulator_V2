import { describe, expect, it } from "vitest";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { createConferenceActivityEvent } from "../src/core/v2-conference-activity-events";
import { createCcigActivityEvent } from "../src/core/v2-fixed-events-ccig-activity-events";
import { applyQueuedEventEffects } from "../src/core/v2-engine-event-resolution";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState } from "../src/core/v2-types";

function choose(state: GameState, choiceId: string): GameState {
  return applyQueuedEventEffects(state, state.eventQueue[0]!, choiceId, {
    evaluateImmediateEndings: next => next,
    runPostQueuePipeline: next => next,
  });
}

describe("conference activity buff provenance", () => {
  it.each([
    ["enterprise-networking", "企业交流", "experiment"],
    ["big-bull-coop", "大牛合作", "writing"],
  ] as const)("remembers %s after confirmation and a save roundtrip", (choiceId, label, action) => {
    const initial = createStartedGameState("normal");
    initial.player.social = 12;
    const root = createConferenceActivityEvent({ id: "source-meeting", conferenceName: "ICLR", conferenceYear: 2026,
      grade: "A", city: "杭州", country: "中国", region: "domestic", paperCount: 1 },
    { ...initial, research: initial.player.research, social: initial.player.social }, [], () => 0.99);
    let state = { ...initial, eventQueue: [createEventQueueItem(root, 1)] };
    state = choose(choose(state, "continue"), choiceId);
    expect(state.buffs).toEqual(initial.buffs);
    state = JSON.parse(JSON.stringify(state));
    state = choose(state, "close");
    const buffs = state.buffs.filter(buff => buff.actionEffects?.[action]);
    expect(buffs).toHaveLength(1);
    expect(buffs[0]!.source).toBe(`ICLR活动 · ${label}`);
    const saved: GameState = JSON.parse(JSON.stringify(state));
    expect(buildBuffDisplayBuckets(saved.buffs).nextAction.flatMap(item => item.sources))
      .toContain(`ICLR活动 · ${label} · 生效后消耗`);
  });

  it("also records the selected VALSE activity for both next-action and permanent effects", () => {
    const initial = createStartedGameState("normal");
    const root = createCcigActivityEvent(initial, "self", []);
    let state = choose({ ...initial, eventQueue: [createEventQueueItem(root, 1)] }, root.choices[0]!.id);
    const listen = state.eventQueue[0]!.choices.find(choice => choice.label === "认真听报告")!;
    state = choose(state, listen.id);
    state = choose(state, state.eventQueue[0]!.choices[0]!.id);
    const buffs = state.buffs.filter(buff => buff.actionEffects?.idea);
    expect(buffs).toHaveLength(2);
    expect(buffs.map(buff => buff.source)).toEqual(["VALSE活动 · 认真听报告", "VALSE活动 · 认真听报告"]);
    expect(buildBuffDisplayBuckets(buffs).permanent[0]!.sources).toContain("VALSE活动 · 认真听报告 · 永久");
  });
});
