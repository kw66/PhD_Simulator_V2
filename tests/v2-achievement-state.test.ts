import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress, recordAchievementStats } from "../src/core/v2-achievement-runtime-types";
import { evaluateStateAchievements, observeStateAchievements } from "../src/core/v2-achievement-state";
import { applyEventPlayerEffects } from "../src/core/v2-event-player-effects";
import { applyPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { consumeActiveOperation } from "../src/core/v2-ai-shop";
import { CAREER_JOBS } from "../src/core/v2-career-rules";
import type { GameState } from "../src/core/v2-types";

function state(): GameState {
  return { ...createInitialState(), phase: "playing", totalMonths: 1, month: 1 };
}
function observe(next: GameState, before = state()) {
  const run = next.achievementProgress ?? createAchievementRunProgress();
  observeStateAchievements(before, next, run);
  return run;
}
function fellow(id: string, research = 12, affinity = 12): GameState["fellowProgressState"][number] {
  return { id, type: "junior", gender: "female", research, affinity, taskType: "idea", taskProgress: 0,
    taskMax: 3, taskUsedThisMonth: false, startTotalMonths: 1 };
}

describe("state achievement evidence", () => {
  it("retains reached peaks after losses, but master's milestones exclude transfer rewards", () => {
    const first = state(); first.player.research = 6;
    const run = observe(first);
    const phd = structuredClone(first); phd.degree = "phd"; phd.player.social = 20;
    observeStateAchievements(first, phd, run);
    const fallen = structuredClone(phd); fallen.player.social = 1;
    observeStateAchievements(phd, fallen, run);
    expect(run.satisfied).toContain("normal:self-reliance-i");
    expect(run.satisfied).not.toContain("normal:self-reliance-ii");
    expect(run.satisfied).toContain("global:social-butterfly-ii");
  });

  it("requires actual graduation for zero-talent challenges and excludes free curses", () => {
    const next = state(); next.selectedRoleId = "genius-reversed";
    next.roleTalents = { levels: { "research-curse": 1 } };
    let run = observe(next);
    expect(run.satisfied).not.toContain("genius-reversed:zero-talent-master");
    next.phase = "finished"; next.ending = "master";
    run = observe(next);
    expect(run.satisfied).toContain("genius-reversed:zero-talent-master");
    next.roleTalents.levels["break-research-curse"] = 1;
    expect(observe(next).satisfied).not.toContain("genius-reversed:zero-talent-master");
    next.selectedRoleId = "normal"; next.roleTalents.levels = {}; next.degree = "phd"; next.phase = "playing"; next.ending = null;
    expect(observe(next).satisfied).not.toContain("normal:truly-ordinary");
    next.phase = "finished"; next.ending = "phd";
    expect(observe(next).satisfied).toContain("normal:truly-ordinary");
  });

  it("observes real curse breaking instead of simply allocating the node", () => {
    const next = state(); next.selectedRoleId = "genius-reversed";
    next.roleTalents = { levels: { "break-research-curse": 1 } };
    expect(observe(next).satisfied).not.toContain("genius-reversed:break-research-curse");
    next.roleTalents.researchCurseBroken = true;
    expect(observe(next).satisfied).toContain("genius-reversed:break-research-curse");
  });

  it("records positive cap gains individually and excludes initial capacity and reductions", () => {
    let next = state(); next.sanCap = 50;
    expect(observe(next).satisfied).not.toContain("global:medical-miracle");
    next = applyEventPlayerEffects(next, { sanCapDelta: 20 });
    next = applyEventPlayerEffects(next, { sanCapDelta: -30 });
    next = applyEventPlayerEffects(next, { sanCapDelta: 20 });
    expect(next.achievementProgress!.counters["san-cap-gain"]).toBe(40);
    expect(observe(next).satisfied).toContain("global:medical-miracle");
  });

  it("counts actual actions per month, including alpha, and ignores denied actions", () => {
    let next = state(); next.degree = "phd"; next.actionState.limit = 2;
    next.roleTalents = { levels: { "burning-life-alpha": 1 } };
    next = consumeActiveOperation(next, "read");
    next = consumeActiveOperation(next, "read");
    next = consumeActiveOperation(next, "read");
    expect(next.achievementProgress!.peaks["monthly-actions"]).toBe(3);
    next = consumeActiveOperation(next, "read");
    expect(next.achievementProgress!.peaks["monthly-actions"]).toBe(3);
    expect(observe(next).satisfied).toContain("global:hyperactive-i");
    expect(observe(next).satisfied).not.toContain("global:hyperactive-ii");
  });

  it("requires simultaneous fellow strength and ownership, retaining facts after departure or sale", () => {
    const next = state(); next.fellowProgressState = [fellow("one"), fellow("two")];
    const run = observe(next);
    const replacement = structuredClone(next); replacement.fellowProgressState = [fellow("three")];
    observeStateAchievements(next, replacement, run);
    expect(run.satisfied).not.toContain("global:top-lab");
    expect(run.satisfied).not.toContain("global:perfect-rapport");
    replacement.fellowProgressState = [fellow("one"), fellow("two"), fellow("three")];
    observeStateAchievements(next, replacement, run);
    expect(run.satisfied).toContain("global:top-lab");
    replacement.shopState.ebikeOwned = true; replacement.eventSupport.hasDownJacket = true;
    observeStateAchievements(next, replacement, run);
    expect(run.satisfied).not.toContain("global:travel-kit");
    replacement.eventSupport.hasParasol = true;
    observeStateAchievements(next, replacement, run);
    expect(run.satisfied).toContain("global:travel-kit");
  });

  it("requires breakup then a different lover type, not a breakup alone", () => {
    const first = state(); first.loverState = { ...first.loverState, active: true, type: "smart" };
    const alone = structuredClone(first); alone.loverState.active = false;
    const run = createAchievementRunProgress(); observeStateAchievements(first, alone, run);
    expect(run.satisfied).not.toContain("global:new-love-type");
    const same = structuredClone(first); observeStateAchievements(alone, same, run);
    expect(run.satisfied).not.toContain("global:new-love-type");
    const other = structuredClone(first); other.loverState.type = "beautiful";
    observeStateAchievements(alone, other, run);
    expect(run.satisfied).toContain("global:new-love-type");
  });

  it("requires completed shopping bars rather than individual shopping actions", () => {
    const next = state(); next.loverProgressState.routes = { shopping: { progress: 2, completed: 2 }, play: { progress: 0, completed: 0 }, study: { progress: 0, completed: 0 } };
    expect(observe(next).satisfied).not.toContain("global:shopping-spree");
    next.loverProgressState.routes.shopping.completed = 3;
    expect(observe(next).satisfied).toContain("global:shopping-spree");
  });

  it.each([
    ["internet", "internet", 1], ["stateOwned", "state", 3], ["civilService", "civil", 3], ["academic", "academic", 1],
  ] as const)("raises the %s offer condition by one tier", (type, suffix, index) => {
    const next = state(); const low = CAREER_JOBS[type][index - 1]!;
    next.careerOffers[type] = { ...low, jobId: low.id, score: 999 };
    expect(observe(next).satisfied).not.toContain(`global:career-${suffix}`);
    const target = CAREER_JOBS[type][index]!;
    next.careerOffers[type] = { ...target, jobId: target.id, score: 1 };
    expect(observe(next).satisfied).toContain(`global:career-${suffix}`);
  });

  it("preserves intra-action stat peaks and strict challenge limits", () => {
    let next = state(); next.player.research = 5;
    next = applyPlayerAttributeChange(next, "research", 1).state;
    next = applyPlayerAttributeChange(next, "research", -5, "reset").state;
    next.phase = "finished"; next.ending = "phd"; next.degree = "phd";
    const run = observe(next);
    expect(run.peaks.research).toBe(6);
    expect(evaluateStateAchievements(next, run)).not.toContain("unlock:genius-reversed");
    next.player.san = 12; next = recordAchievementStats(next);
    expect(evaluateStateAchievements(next, next.achievementProgress!)).not.toContain("unlock:chosen-reversed");
    next.personalSpending = 10;
    expect(evaluateStateAchievements(next, run)).not.toContain("unlock:rich-reversed");
  });

  it("measures attribute spread simultaneously instead of combining unrelated peaks", () => {
    const next = state(); next.player.research = next.player.social = next.player.favor = 20;
    const run = observe(next, next);
    next.player.research = next.player.social = next.player.favor = 1;
    observeStateAchievements(next, next, run);
    expect(run.satisfied).not.toContain("global:unbalanced");
  });

  it("counts a received offer even when the player chose to keep another offer", () => {
    const next = state();
    next.achievementProgress = createAchievementRunProgress();
    next.achievementProgress.counters["offer:internet-chief-scientist"] = 1;
    expect(next.careerOffers).toEqual({});
    const run = observe(next);
    expect(run.satisfied).toContain("global:career-apex-internet");
    expect(run.satisfied).toContain("global:career-internet");
  });
});
