import type { AchievementRunProgress } from "./v2-achievement-runtime-types";
import { recordAchievementStats } from "./v2-achievement-runtime-types";
import type { DispatchPayload, GameActionId, GameState } from "./v2-types";
import { CAREER_JOBS, type CareerType } from "./v2-career-rules";
import { hasAiCollaboration } from "./v2-ai-shop";
import { getCoffeeSanGain } from "./v2-coffee-system";
import { getAdvisorRankIndex } from "./v2-advisor-progress";
import { getDesignedTalentNodes } from "./v2-role-talent-definitions";
import { getRoleEndingAchievements } from "./v2-achievement-catalog";
import { isCursedRole } from "./v2-curse-system";

function satisfy(run: AchievementRunProgress, id: string): void {
  if (!run.satisfied.includes(id)) run.satisfied.push(id);
}

/** Observe committed state only: merely opening a preview or attempting a disabled action never counts. */
export function observeStateAchievements(
  previous: GameState, next: GameState, run: AchievementRunProgress,
  _actionId?: GameActionId, _payload?: DispatchPayload,
): void {
  // Sample both ends; stat mutation hooks preserve any intermediate peaks as well.
  for (const state of [previous, next]) {
    const sampled = recordAchievementStats({ ...state, achievementProgress: run }).achievementProgress!;
    run.peaks = sampled.peaks;
    run.minima = sampled.minima;
  }
  if (previous.loverState.active && !next.loverState.active && previous.loverState.type) {
    const types = run.sets["former-lover-types"] ?? [];
    run.sets["former-lover-types"] = [...new Set([...types, previous.loverState.type])];
  }
  if (next.loverState.active && next.loverState.type
    && run.sets["former-lover-types"]?.some(type => type !== next.loverState.type)) satisfy(run, "global:new-love-type");

  // These conditions must coexist. Keep a fact once reached, even after sales or graduation.
  const fellows = next.fellowProgressState;
  if (fellows.length >= 4) satisfy(run, "global:expanded-cohort");
  if (fellows.filter(fellow => fellow.type === "junior" && fellow.gender === "female").length >= 4) satisfy(run, "global:junior-rescue");
  const types = new Set(fellows.map(fellow => `${fellow.type}:${fellow.gender}`));
  if (["senior:male", "senior:female", "junior:male", "junior:female"].every(type => types.has(type))) satisfy(run, "global:balanced-company");
  if (fellows.filter(fellow => fellow.research >= 12).length >= 3) satisfy(run, "global:top-lab");
  if (fellows.filter(fellow => fellow.affinity >= 12).length >= 3) satisfy(run, "global:perfect-rapport");
  if (next.loverState.active && next.degree === "master") satisfy(run, "global:early-romance");

  const shop = next.shopState;
  if (shop.ebikeOwned && next.eventSupport.hasDownJacket && next.eventSupport.hasParasol) {
    satisfy(run, "global:travel-kit"); satisfy(run, "global:full-gear");
  }
  if (shop.chairOwned && next.coffeeState.machineOwned && shop.keyboardOwned && shop.monitorOwned) satisfy(run, "global:perfect-workstation");
  if (shop.chairOwned && shop.chairUpgrade === "massage") satisfy(run, "normal:chair-upgrade");
  if (shop.gpuLevel >= 5) satisfy(run, "global:ultimate-gpu-i");
  if (shop.gpuLevel >= 10) satisfy(run, "global:ultimate-gpu-ii");
  if (getCoffeeSanGain(next.coffeeState) >= 6) satisfy(run, "global:ultimate-coffee");
  if (hasAiCollaboration(next.aiShopState)) satisfy(run, "global:ai-collaboration");
  if (next.roleTalents?.researchCurseBroken) satisfy(run, "genius-reversed:break-research-curse");
  if (next.conferenceEncounterState.bigBullCooperation || next.conferenceEncounterState.jointTrainingReward) satisfy(run, "global:joint-training");
  if (getAdvisorRankIndex(next.advisorProgressState) >= 3) satisfy(run, "global:reverse-mentoring-i");
  if (next.advisorProgressState.awards.some(award => award.id === "academician")) satisfy(run, "global:reverse-mentoring-ii");

  for (const type of Object.keys(CAREER_JOBS) as CareerType[]) {
    const rank = CAREER_JOBS[type].reduce((highest, job, index) => next.careerOffers[type]?.jobId === job.id
      || (run.counters[`offer:${job.id}`] ?? 0) > 0 ? Math.max(highest, index) : highest, -1);
    if (rank < 0) continue;
    satisfy(run, "global:career-start");
    const suffix = { internet: "internet", stateOwned: "state", civilService: "civil", academic: "academic" }[type];
    const minimumRank = { internet: 1, stateOwned: 3, civilService: 3, academic: 1 }[type];
    if (rank >= minimumRank) satisfy(run, `global:career-${suffix}`);
    if (rank === CAREER_JOBS[type].length - 1) satisfy(run, `global:career-apex-${suffix}`);
  }
  for (const id of evaluateStateAchievements(next, run)) satisfy(run, id);
}

/** Returns candidates; the shared settlement applies the catalogue's eligible-role scope. */
export function evaluateStateAchievements(state: GameState, run: AchievementRunProgress): string[] {
  const peak = (key: string) => run.peaks[key] ?? 0;
  const counter = (key: string) => run.counters[key] ?? 0;
  const ids = new Set<string>();
  const check = (condition: boolean, id: string) => { if (condition) ids.add(id); };
  for (const [stat, suffix] of [["research", "wisdom-god"], ["social", "social-butterfly"], ["favor", "steadfast-bond"]] as const) {
    check(peak(stat) >= 15, `upright:${suffix}-i`);
    check(peak(stat) >= 20, `global:${suffix}-ii`);
  }
  check(Math.max(peak("research"), peak("social"), peak("favor")) >= 25, "upright:breakthrough-i");
  check(Math.max(peak("research"), peak("social"), peak("favor")) >= 30, "global:breakthrough-ii");
  check(["research", "social", "favor", "money"].every(stat => peak(stat) >= 12), "global:hexagon-warrior-i");
  check(["research", "social", "favor", "money"].every(stat => peak(stat) >= 20), "global:hexagon-warrior-ii");
  check(peak("research-cap") >= 30, "global:strongest-brain");
  check(peak("attribute-spread") > 12, "global:unbalanced");
  check((run.minima["san-cap"] ?? Infinity) <= 6, "global:overdrawn-life");
  check(counter("san-cap-gain") >= 40, "global:medical-miracle");
  check(peak("san-cap") >= 36, "upright:thick-health-i");
  check(peak("san-cap") >= 60, "global:thick-health-ii");
  check(peak("money") >= 60, "upright:great-fortune-i");
  check(peak("money") >= 200, "global:great-fortune-ii");
  check(state.selectedRoleId === "normal" && peak("money") >= 30, "normal:first-pot");
  check(state.selectedRoleId === "normal" && peak("research") >= 12, "normal:research-start");
  check(state.selectedRoleId === "normal" && peak("favor") >= 12, "normal:favorite");
  check(state.selectedRoleId === "normal" && peak("social") >= 12, "normal:socialite");
  check(state.selectedRoleId === "normal" && ["research", "social", "favor", "money"].every(stat => peak(stat) >= 6), "normal:all-rounder");
  for (const [stat, suffix] of [["research", "i"], ["social", "ii"], ["favor", "iii"]] as const) {
    check(peak(`master:${stat}`) >= 6, `normal:self-reliance-${suffix}`);
  }
  check(["research", "social", "favor"].every(stat => peak(`master:${stat}`) >= 6), "normal:self-reliance");
  check(state.readingState.readCount >= 20, "global:paper-lover");
  check(state.partTimeWorkCount >= 15, "global:workaholic");
  check(state.shopState.bikeSanCapGains >= 12, "global:cycling-prodigy");
  check((state.loverProgressState.routes?.shopping.completed ?? 0) >= 3, "global:shopping-spree");
  check(state.advisorProgressState.playerProjectCompletions.horizontal >= 10, "global:horizontal-king");
  check(state.advisorProgressState.playerProjectCompletions.vertical >= 10, "global:vertical-king");
  // Count completed internships, not an invitation or a merely accepted offer.
  check(state.internshipCount >= 3, "global:three-internships");
  check(peak("monthly-actions") >= 3, "global:hyperactive-i");
  check(peak("monthly-actions") >= 4, "global:hyperactive-ii");

  if (state.phase === "finished" && state.ending) {
    if (state.ending === "master" || state.ending === "phd") {
      const graduation = getRoleEndingAchievements(state.selectedRoleId).find(item => item.id.endsWith(`:ending-${state.ending}`));
      if (graduation) ids.add(graduation.id);
      const nodes = getDesignedTalentNodes(state.selectedRoleId) ?? [];
      const paid = nodes.some(node => !node.fixed && node.cost > 0 && (state.roleTalents?.levels[node.id] ?? 0) > 0);
      if (!paid && state.ending === "phd") check(state.selectedRoleId === "normal", "normal:truly-ordinary");
      if (!paid && state.ending === "master" && state.selectedRoleId.endsWith("-reversed")) ids.add(`${state.selectedRoleId}:zero-talent-master`);
      if (state.ending === "phd") {
        check(isCursedRole(state.selectedRoleId) && state.curseState?.difficulty === 4,
          `${state.selectedRoleId}:curse-hell-phd`);
        check(peak("research") < 6, "unlock:genius-reversed");
        check(peak("favor") < 6, "unlock:teacher-child-reversed");
        check(peak("social") < 6, "unlock:social-reversed");
        check(state.personalSpending < 10, "unlock:rich-reversed");
        check((run.minima.san ?? state.player.san) > 12, "unlock:chosen-reversed");
      }
    } else ids.add(`global:ending-${state.ending}`);
  }
  return [...ids];
}
