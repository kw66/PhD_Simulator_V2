import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import type { GameState } from "../src/core/v2-types";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

describe("special role relationship hints", () => {
  it("shows the teacher child's selected guidance fields without the old writing multiplier", () => {
    const base = createStartedGameState("teacher-child");
    const state: GameState = { ...base, month: 2, totalMonths: 2, selectedAdvisorName: "导师",
      roleTalents: { levels: { "mentor-insight": 1, "mentor-insight-beta": 1 } } };
    const html = renderApp(state, undefined, { activePlayTab: "relationship" });
    expect(html).toContain("科研积累+10%，你的论文协作：想idea+10、做实验+10、写作+10；同学论文写作协作+10");
    expect(html).not.toContain("你的论文写作协作+15");
    const legacy = withGameplayRuleset("20261022-r27", () => renderApp(state, undefined, { activePlayTab: "relationship" }));
    expect(legacy).toContain("你的论文写作协作+15；同学论文写作协作+10");
    expect(legacy).not.toContain("你的论文协作：想idea+10");
  });

  it("shows the actual reduced project threshold and different player/fellow guidance amounts", () => {
    const base = createStartedGameState("research-captain", {}, 0, 1, { "teacher-child": 10 });
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 5,
      affinity: 6, startTotalMonths: 1, name: "林清", taskType: "writing" });
    const state: GameState = { ...base, totalMonths: 2, month: 2, selectedAdvisorName: "导师",
      fellowProgressState: [fellow], captainState: { ...base.captainState!, tags: { advisor: "teacher-child", [fellow.id]: "teacher-child" } } };
    const html = renderApp(state, undefined, { activePlayTab: "relationship" });
    expect(html).toContain("纵向项目满50，科研积累+10%");
    expect(html).toContain("你的论文写作协作+20；林清+60");
    expect(html).not.toContain("全组论文写作协作+10");
  });

  it("identifies fractional extra advances as monthly averages instead of guaranteed gains", () => {
    const base = createStartedGameState("research-captain", {}, 0, 1, { chosen: 3 });
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 5,
      affinity: 6, startTotalMonths: 1, name: "林清", taskType: "writing" });
    const state: GameState = { ...base, totalMonths: 2, month: 2, selectedAdvisorName: "导师",
      fellowProgressState: [fellow], captainState: { ...base.captainState!, tags: { [fellow.id]: "chosen" } } };
    const html = renderApp(state, undefined, { activePlayTab: "relationship" });
    expect(html).toContain("月均自动推进+7.8");
    expect(html).not.toContain("每月自动推进+7.8");
  });
});
