import type { GameState, ResolvedEventRecord } from "./v2-types";
import type { AchievementRunProgress } from "./v2-achievement-runtime-types";

/**
 * Event evidence is collected from committed state transitions.  In particular,
 * this intentionally reads the resolved event history rather than pending event
 * previews, so opening an event cannot unlock an achievement.
 */
function inc(run: AchievementRunProgress, key: string, amount = 1): number {
  const value = (run.counters[key] ?? 0) + amount;
  run.counters[key] = value;
  return value;
}

function satisfy(run: AchievementRunProgress, id: string): void {
  if (!run.satisfied.includes(id)) run.satisfied.push(id);
}

function hasChoice(record: ResolvedEventRecord, matcher: RegExp): boolean {
  return record.stages.some((stage) => matcher.test(stage.selectedChoiceId));
}

function newRecords(previous: GameState, next: GameState): ResolvedEventRecord[] {
  const oldIds = new Set(previous.eventHistory.map((record) => record.id));
  return next.eventHistory.filter((record) => !oldIds.has(record.id));
}

function updateEventFacts(previous: GameState, next: GameState, run: AchievementRunProgress): void {
  for (const record of newRecords(previous, next)) {
    if (run.sets["observed-event-records"]?.includes(record.id)) continue;
    run.sets["observed-event-records"] = [...(run.sets["observed-event-records"] ?? []), record.id];
    const id = record.chainId;
    if (id === "random-4" && hasChoice(record, /reject/iu)) inc(run, "refuse-project");
    if (id === "random-2" && hasChoice(record, /refuse/iu)) inc(run, "refuse-review");
    if (id === "random-1" && hasChoice(record, /refuse/iu)) inc(run, "refuse-undergrad");
    if (id === "teachers-day" && hasChoice(record, /stamp/iu)) {
      const year = record.completedAtYear;
      const previousYear = run.counters["teacher-stamp-last-year"];
      run.counters["teacher-stamp-streak"] = previousYear === year - 1
        ? (run.counters["teacher-stamp-streak"] ?? 0) + 1 : 1;
      run.counters["teacher-stamp-last-year"] = year;
      if ((run.counters["teacher-stamp-streak"] ?? 0) >= 3) satisfy(run, "global:beloved-mentor");
    }
    if (id.startsWith("ccig-") && hasChoice(record, /poster/iu)) satisfy(run, "global:valse-poster");
    if (id.startsWith("conference-") || id.startsWith("ccig-")) {
      if (hasChoice(record, /tea-break/iu)) inc(run, "tea-break");
      if (hasChoice(record, /tour-local|travel/iu)) inc(run, "funded-travel");
    }
    if (id === "random-15") {
      if (hasChoice(record, /terraria/iu)) inc(run, "terraria");
      if (hasChoice(record, /magic-tower/iu)) inc(run, "magic-tower");
    }
    if (id.startsWith("illness-") && hasChoice(record, /hospital/iu)) inc(run, "hospital");
    if (id === "internship-invite" && hasChoice(record, /decline|reject/iu)) satisfy(run, "global:stay-put");
  }
  if (run.counters["refuse-project"] && run.counters["refuse-review"] && run.counters["refuse-undergrad"]) satisfy(run, "global:learn-to-refuse");
  if ((run.counters["tea-break"] ?? 0) >= 3) satisfy(run, "global:tea-break");
  if ((run.counters["funded-travel"] ?? 0) >= 3) satisfy(run, "global:funded-travel");
  if ((run.counters["poker-profit"] ?? 0) >= 10) satisfy(run, "global:card-god");
  if ((run.counters["roco-shiny"] ?? 0) >= 3) satisfy(run, "global:shiny-bond");
  if ([0, 1, 2].every((song) => (run.counters[`karaoke:${song}`] ?? 0) > 0)) satisfy(run, "global:karaoke-king");
  if ((run.counters["terraria"] ?? 0) >= 3) satisfy(run, "global:terraria");
  if ((run.counters["magic-tower"] ?? 0) >= 3) satisfy(run, "global:magic-tower");
  if ((run.counters["hospital"] ?? 0) >= 3) satisfy(run, "global:cherish-life");
  if ((next.internshipCount ?? 0) >= 3) satisfy(run, "global:three-internships");
  if ((next.conferenceCareerState.rejectedInternshipCount ?? 0) > 0) satisfy(run, "global:stay-put");
  if (next.conferenceEncounterState.jointTrainingReward || next.conferenceEncounterState.bigBullCooperation) satisfy(run, "global:joint-training");
  if ((run.counters["reported-scholarship"] ?? 0) > 0) satisfy(run, "global:reported-scholarship");
  if ((run.counters["first-badminton-win"] ?? 0) > 0) satisfy(run, "global:badminton-expert");
  if (next.eventCounters.teachersDayErrandCount >= 3) satisfy(run, "global:errand-runner");
  if (next.shopState.bikeSanCapGains >= 12) satisfy(run, "global:cycling-prodigy");
}

/** Call after every committed engine transition. */
export function observeEventAchievements(previous: GameState, next: GameState, run: AchievementRunProgress): void {
  updateEventFacts(previous, next, run);
  if ((run.counters["master-advisor-funding"] ?? 0) >= 100) satisfy(run, "global:advisor-funding-user");
  if ((run.counters["rest-san"] ?? 0) >= 50) satisfy(run, "global:deep-sleep");
  const awardedYear = next.scholarshipState.lastAwardYear;
  if (awardedYear !== null && awardedYear !== previous.scholarshipState.lastAwardYear
    && run.counters["scholarship-last-year"] !== awardedYear) {
    const last = run.counters["scholarship-last-year"];
    run.counters["scholarship-streak"] = last === awardedYear - 1 ? (run.counters["scholarship-streak"] ?? 0) + 1 : 1;
    run.counters["scholarship-last-year"] = awardedYear;
    if ((run.counters["scholarship-streak"] ?? 0) >= 3) satisfy(run, "global:model-student");
  }
  const queued = new Set(next.eventQueue.map((event) => event.chainId));
  if (queued.size >= 6) satisfy(run, "global:event-burst");
  if (queued.has("random-17") && queued.has("random-18")) satisfy(run, "global:double-trouble");
}

export function evaluateEventAchievements(_state: GameState, run: AchievementRunProgress): string[] {
  return [...run.satisfied];
}
