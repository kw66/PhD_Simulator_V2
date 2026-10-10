import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createConferenceActivityDecisionEvent, createConferenceActivityResult } from "../src/core/v2-conference-activity-events";
import { createBaseConferenceActivityOptions } from "../src/core/v2-conference-activity-base-options";
import { createAdvancedConferenceActivityOptions } from "../src/core/v2-conference-activity-advanced-options";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { renderApp } from "../src/app/v2-render";

const context = {
  id: "context-display", conferenceName: "CVPR", conferenceYear: 2026,
  city: "测试城", country: "测试国", grade: "A" as const, paperCount: 1, paperIds: [],
};

function fixture() {
  const state = createStartedGameState("normal");
  state.player.social = 12;
  state.player.research = 12;
  return { ...state, research: 12, social: 12, favor: 12 };
}

describe("conference display conditions", () => {
  it.each(["A", "B", "C"] as const)("keeps %s option gates out of the decision scene and names them only in selected advanced results", (grade) => {
    const state = fixture();
    const scoped = { ...context, grade };
    const decision = createConferenceActivityDecisionEvent(scoped, state, "", () => 0);
    expect(decision.description).not.toContain("选项出现条件");
    for (const option of createBaseConferenceActivityOptions(scoped, state, () => 0)) {
      expect(createConferenceActivityResult(scoped, option, "").description).not.toContain("选项出现条件");
    }
    if (grade === "C") return;
    for (const option of createAdvancedConferenceActivityOptions(state, () => 0)) {
      const result = createConferenceActivityResult(scoped, option, "");
      expect(result.description).toContain(`选项出现条件：${option.label}需A/B类会议、社交 ≥ 6，随机抽取。`);
    }
  });

  it.each([["domestic", "国内", 4, 2], ["asia", "亚太", 5, 4], ["west", "欧美", 6, 6]] as const)(
    "pairs %s travel rewards and expenses with the actual region",
    (region, label, san, cost) => {
      const state = fixture();
      const scoped = { ...context, region };
      const travel = createBaseConferenceActivityOptions(scoped, state, () => 0).find((option) => option.id === "tour-local")!;
      const result = createConferenceActivityResult(scoped, travel, "");
      expect(result.description).toContain(`条件：${label}参会`);
      expect(result.description).toContain(`结果：SAN +${san}`);
      expect(result.choices[0]!.effects.san).toBe(san);
      const menu = createConferenceDecisionAct1(scoped, state, () => 0).choices[0]!.effects.enqueueEvents![0]!;
      for (const mode of ["self", "advisor", "proxy"]) {
        const decision = menu.choices.find((choice) => choice.id === mode)!.effects.enqueueEvents![0]!;
        expect(decision.description.includes(`条件：${label}参会`)).toBe(mode !== "proxy");
        const effects = decision.choices[0]!.effects;
        expect(effects.money ?? 0).toBe(mode === "self" ? -cost : 0);
        expect(effects.advisorProgressStateDeltas?.funding ?? 0).toBe(mode === "advisor" ? -cost : 0);
      }
    },
  );

  it("separates option availability from the conditions attached to repeat cooperation rewards", () => {
    const state = fixture();
    state.conferenceEncounterState.bigBull = { id: "mentor", name: "林青", level: 1, cooperationCount: 2 };
    const option = createAdvancedConferenceActivityOptions(state, () => 0)[0]!;
    const event = createConferenceActivityResult(context, option, "");
    const [story, settlement] = event.description.split("机制结算");
    expect(story).toContain("小提示：选项出现条件：大牛合作需A/B类会议、社交 ≥ 6");
    expect(settlement).not.toContain("选项出现条件");
    expect(settlement).toContain("结果：下次写论文 +8");
    expect(settlement).toContain("额外：条件：与林青合作 ≥ 2次｜结果：社交 +0.6（抵抗0.4）");
    expect(settlement).toContain("条件：科研 ≥ 12｜与林青合作 ≥ 3次｜尚未联培｜结果：联培邀约");
    const html = renderApp({ ...state, eventQueue: [createEventQueueItem(event, 1)] }, undefined,
      { activePlayTab: "events", isEventContentOpen: true, activeEventId: event.id });
    expect(html).toContain('class="event-description-note"');
    expect(html).toContain("选项出现条件：大牛合作需A/B类会议、社交 ≥ 6");
    expect(html).not.toContain("小提示：选项出现条件");
    expect(html).not.toContain("额外：");
  });

  it("keeps a smart encounter's score and execution rewards distinct", () => {
    const state = fixture();
    const option = createAdvancedConferenceActivityOptions(state, () => 0.9)[1]!;
    const result = createConferenceActivityResult(context, option, "");
    expect(result.description).toContain("条件：聪慧学者（50%）");
    expect(result.description).toContain("结果：下次想idea +2分｜下次想idea +2 次");
    expect(result.description).not.toContain("会后有约");
    expect(option.effects.temporaryActionEffectUpdates?.idea).toEqual({ bonus: 2, extraActions: 2 });
  });

  it("uses meeting-grade labels for all three debug entries", () => {
    const buttons = DEBUG_EVENT_GROUPS.flatMap((group) => group.buttons);
    for (const grade of ["A", "B", "C"]) {
      expect(buttons.find((button) => button.id === `conference-activity-${grade.toLowerCase()}`)?.label).toBe(`${grade}会活动`);
    }
  });
});
