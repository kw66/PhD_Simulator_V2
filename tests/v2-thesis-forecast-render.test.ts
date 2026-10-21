import { describe, expect, it } from "vitest";
import { renderGraduationCards } from "../src/app/v2-render-graduation";
import { renderApp } from "../src/app/v2-render";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { syncThesisState } from "../src/core/v2-thesis-rules";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { Degree, GameState } from "../src/core/v2-types";

function fixture(degree: Degree = "phd", year = 6, month = 1): GameState {
  const base = createInitialState();
  return syncThesisState({ ...base, phase: "playing", degree, year, month, totalMonths: (year - 1) * 12 + month,
    player: { ...base.player, research: 12.9 }, selectedAdvisorName: "严格导师", graduationScoreTarget: 7,
  }, () => 0.5);
}
const visible = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("thesis early forecast in the workstation", () => {
  it("shows the same-topic support plan from PhD year five, before writing unlocks", () => {
    const state = fixture("phd", 5, 4);
    const paper = createGrantedPublishedPaper(state.totalMonths - 2, 0, { target: "A", title: "Learning Reliable Representations", acceptedScore: 90 });
    state.externalPublications = [paper];
    const html = renderApp(state, undefined, { activePlayTab: "workstation" });
    expect(html).toContain('data-thesis-forecast-stage="planning"');
    expect(visible(html)).toContain("提前规划");
    expect(visible(html)).toContain("同题支撑 1/3");
    expect(html).toContain("Learning Reliable Representations");
    expect(visible(html)).toContain("开题时再确定方向与支撑论文");
    expect(html.match(/data-thesis-forecast-point="\d"/g)).toHaveLength(3);
    expect(html.match(/data-action="advance-thesis-point"[^>]*disabled/g)).toHaveLength(3);
    expect(renderGraduationCards(fixture("phd", 4))).not.toContain("data-thesis-forecast-stage");
    expect(renderGraduationCards(fixture("master", 2))).not.toContain("data-thesis-forecast-stage");
  });

  it("uses decimal research, remaining advances per point, and the 330 PhD B threshold", () => {
    const state = fixture("phd", 6, 6);
    state.thesis.researchPoints[0]!.lastAdvancedTotalMonths = state.totalMonths;
    const text = visible(renderGraduationCards(state));
    expect(text).toContain("还可推进 1 次");
    expect(text).toContain("还可推进 2 次");
    expect(text).toContain("预计 12.9");
    expect(text).toContain("预计 25.8");
    expect(text).toContain("B线 330");
    expect(text).toContain("当前科研每次 +12.9");
    expect(text).toContain("不保证 SAN 足够");
    expect(renderGraduationCards(state)).toContain("推进+12.9");
  });

  it("keeps a safe B estimate separate from research-score eligibility", () => {
    const state = fixture();
    state.thesis.researchPoints = state.thesis.researchPoints.map(point => ({ ...point, initialScore: 120, score: 120 }));
    state.totalResearchScore = 3;
    const html = renderGraduationCards(state);
    expect(visible(html)).toContain("预计保底达到 B");
    expect(visible(html)).toContain("科研分未达标");
    expect(html).toContain('class="thesis-forecast-check is-ready"');
    expect(html).toContain('class="thesis-forecast-check is-short"');
    expect(visible(html)).toContain("3 / 7");
    state.totalResearchScore = 7;
    expect(visible(renderGraduationCards(state))).toContain("科研分已达标");
  });

  it("stops projecting after sealing and retains the actual-review qualification", () => {
    const state = fixture("phd", 6, 8);
    const html = renderGraduationCards(state);
    const forecast = html.slice(html.indexOf('<details class="thesis-forecast"'));
    expect(html).toContain('data-thesis-forecast-stage="frozen"');
    expect(forecast).not.toContain("还可推进");
    expect(forecast).not.toContain("预计保底达到");
    expect(forecast).toContain("实际结论以盲审结果为准");
    expect(forecast).toContain("尚未保底达到 B");
  });

  it("uses two real master's points and preserves previous replay thresholds and gains", () => {
    const master = renderGraduationCards(fixture("master", 3));
    expect(master.match(/data-thesis-forecast-point="\d"/g)).toHaveLength(2);
    expect(visible(master)).toContain("B线 200");
    const previous = withGameplayRuleset("20261021-r14", () => renderGraduationCards(fixture()));
    expect(visible(previous)).toContain("B线 360");
    expect(previous).toContain("推进+12 ·");
  });
});
