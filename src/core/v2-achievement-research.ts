import { ADVISOR_REQUIREMENTS } from "./v2-content";
import { getConferenceInfo } from "./v2-conference-catalog";
import { getPaperScoreBreakdown } from "./v2-paper-collaboration";
import { createAchievementRunProgress, type AchievementRunProgress } from "./v2-achievement-runtime-types";
import type { GameState, Paper } from "./v2-types";

const SCORE_FIELDS = ["idea", "experiment", "writing"] as const;

function remember(run: AchievementRunProgress, key: string, value: string): void {
  const values = run.sets[key] ??= [];
  if (!values.includes(value)) values.push(value);
}

function satisfy(run: AchievementRunProgress, id: string): void {
  if (!run.satisfied.includes(id)) run.satisfied.push(id);
}

function allPapers(state: GameState): Paper[] {
  return [...new Map([...state.papers, ...state.externalPublications].map(paper => [paper.id, paper])).values()];
}

function isFirstAuthor(paper: Paper): boolean {
  return paper.nonFirstAuthor !== true && (!paper.leadAuthorId || paper.leadAuthorId === "player");
}

function reviewing(paper: Paper | undefined): boolean {
  return paper?.status === "reviewing" || paper?.status === "journal-reviewing";
}

function authorCount(state: GameState, paper: Paper): number {
  // Player and supervisor are always authors. Only recorded contributors count;
  // decorative fallback names from the renderer are not gameplay evidence.
  const names = new Set([state.playerName?.trim() || "player", state.selectedAdvisorName?.trim() || "advisor"]);
  for (const person of paper.collaborators ?? []) {
    if (person.id !== "player" && person.id !== "advisor" && person.name.trim() && person.name !== "你") names.add(person.name.trim());
  }
  if (paper.nonFirstAuthor && paper.leadAuthorName?.trim()) names.add(paper.leadAuthorName.trim());
  return names.size;
}

/** Called at the actual time-decay operation, before review improvements or events can change the paper. */
export function recordPaperDecayAchievements(state: GameState, papers: readonly Paper[]): GameState {
  const previous = new Map(state.papers.map(paper => [paper.id, paper]));
  const changes = papers.flatMap(paper => {
    const before = previous.get(paper.id);
    if (!before || before.status === "published" || before.status === "journal-reviewing") return [];
    const fields = SCORE_FIELDS.filter(field => before[field] > 1 && paper[field] === 1);
    return fields.length ? [{ paper, fields }] : [];
  });
  if (!changes.length) return { ...state, papers: [...papers] };
  const run = structuredClone(state.achievementProgress ?? createAchievementRunProgress());
  for (const { paper, fields } of changes) {
    const key = `research:decayed:${paper.id}`;
    fields.forEach(field => remember(run, key, field));
    if (SCORE_FIELDS.every(field => paper[field] === 1 && run.sets[key]?.includes(field))) satisfy(run, "global:air-dried");
  }
  return { ...state, papers: [...papers], achievementProgress: run };
}

/** Observe committed state only: previews and review-result scenes do not count as publication. */
export function observeResearchAchievements(previous: GameState, next: GameState, run: AchievementRunProgress): void {
  const previousPapers = new Map(allPapers(previous).map(paper => [paper.id, paper]));
  const papers = allPapers(next);
  for (const paper of papers) {
    const before = previousPapers.get(paper.id);
    if (isFirstAuthor(paper) && reviewing(paper) && !reviewing(before)) {
      // The paper id is stable across revisions. Include its rejection count and
      // submission coordinates so a withdrawn/resubmitted manuscript is a new
      // attempt while repeated observation of one committed transition remains
      // idempotent.
      const key = `${paper.id}:${paper.rejectionCount ?? 0}:${paper.submittedYear ?? ""}:${paper.submittedMonth ?? ""}:${paper.journalTarget ?? paper.target ?? ""}`;
      remember(run, "research:submissions", key);
      run.sets[`research:active-submission:${paper.id}`] = [key];
    }
    if (before && reviewing(before) && !reviewing(paper) && isFirstAuthor(before)) {
      const key = run.sets[`research:active-submission:${paper.id}`]?.[0];
      if (key) remember(run, paper.status === "published" ? "research:accepted-submissions" : "research:unsuccessful-submissions", key);
    }
    if (isFirstAuthor(paper)) {
      const rejected = Math.max(0, paper.rejectionCount ?? 0);
      run.counters[`research:rejected:${paper.id}`] = Math.max(run.counters[`research:rejected:${paper.id}`] ?? 0, rejected);
    }
    if (next.degree === "master" && paper.status === "published") {
      if (paper.target === "A" && isFirstAuthor(paper)) remember(run, "research:master-a", paper.id);
      if (paper.target === "C") remember(run, "research:master-c", paper.id);
    }
  }
  if (previous.degree === "master" && next.degree === "phd" && previous.totalResearchScore >= ADVISOR_REQUIREMENTS.phdGrad) {
    satisfy(run, "global:young-genius");
  }
  const oldHistory = new Set(previous.eventHistory.map(event => event.id));
  for (const event of next.eventHistory) {
    if (oldHistory.has(event.id) || event.chainId !== "phd-decision") continue;
    const refused = event.stages.some(stage => stage.selectedChoiceId === "continue-master");
    const threshold = event.completedAtYear <= 2 ? ADVISOR_REQUIREMENTS.phdYear2 : ADVISOR_REQUIREMENTS.phdYear3;
    if (refused && previous.degree === "master" && previous.totalResearchScore >= threshold) remember(run, "research:qualified-phd-refusals", String(event.completedAtYear));
  }
  for (const id of evaluateResearchAchievements(next, run)) satisfy(run, id);
}

export function evaluateResearchAchievements(state: GameState, run: AchievementRunProgress): string[] {
  const result: string[] = [];
  const add = (id: string, condition: boolean): void => { if (condition) result.push(id); };
  const papers = allPapers(state);
  const publications = papers.filter(paper => paper.status === "published").sort((left, right) =>
    (left.acceptedTotalMonths ?? 0) - (right.acceptedTotalMonths ?? 0) || (left.acceptedOrder ?? 0) - (right.acceptedOrder ?? 0));
  const firstAuthors = publications.filter(isFirstAuthor);
  const first = firstAuthors[0];
  const firstCoauthor = publications.findIndex(paper => !isFirstAuthor(paper));
  const firstLead = publications.findIndex(isFirstAuthor);
  add("global:clear-minded", (run.sets["research:qualified-phd-refusals"]?.length ?? 0) >= 2);
  add("global:three-a-master", (run.sets["research:master-a"]?.length ?? 0) >= 3);
  add("global:c-paper-king", (run.sets["research:master-c"]?.length ?? 0) >= 5);
  add("global:collaboration-ten", publications.filter(paper => !isFirstAuthor(paper)).length >= 10);
  add("global:collaboration-before-first", firstCoauthor >= 0 && firstLead > firstCoauthor);
  add("global:academic-star", (state.ending === "master" || state.ending === "phd") && publications.filter(paper => paper.target === "A").length >= 5);
  add("global:paper-lover", state.readingState.readCount >= 20);
  add("global:paper-machine", publications.length >= 10);
  add("global:highbrow", first?.target === "A");
  add("global:best-paper", firstAuthors.some(paper => paper.target === "A" && paper.publication?.acceptType === "Best Paper"));
  const journal = (paper: Paper) => paper.journalTarget ?? paper.publication?.journalTarget;
  add("global:nature-child", firstAuthors.some(paper => journal(paper) === "nmi"));
  add("global:nature-summit", firstAuthors.some(paper => journal(paper) === "nature"));
  add("global:future-academician", publications.filter(paper => journal(paper) === "nature").length >= 2);
  const ownPapers = papers.filter(isFirstAuthor);
  add("global:high-score-paper-i", ownPapers.some(paper => SCORE_FIELDS.reduce((sum, field) => sum + getPaperScoreBreakdown(paper, field).own, 0) >= 100));
  add("global:high-score-paper-ii", ownPapers.some(paper => SCORE_FIELDS.reduce((sum, field) => sum + getPaperScoreBreakdown(paper, field).own, 0) >= 150));
  add("global:nobel-beginning", papers.some(paper => SCORE_FIELDS.reduce((sum, field) => sum + paper[field], 0) >= 1000));
  add("global:all-publicity", firstAuthors.some(paper => ["arxiv", "github", "xiaohongshu", "quantum"].every(key => paper.publication?.promotions?.[key as keyof NonNullable<NonNullable<Paper["publication"]>["promotions"]>])));
  add("global:author-six", papers.some(paper => authorCount(state, paper) >= 6));
  add("global:thousand-citations", state.totalCitations >= 1000);
  add("global:ten-thousand-citations", state.totalCitations >= 10000);
  add("global:cannot-be-buried", publications.some(paper => paper.target === "C" && (paper.publication?.citations ?? 0) > 100));
  const rejected = Object.entries(run.counters).filter(([key]) => key.startsWith("research:rejected:")).map(([, count]) => count);
  add("global:tasteless", rejected.some(count => count >= 3));
  add("global:never-give-up", rejected.reduce((sum, count) => sum + count, 0) >= 10);
  const firstSubmissions = (run.sets["research:submissions"] ?? []).slice(0, 5);
  add("global:perfect-start", firstSubmissions.length === 5 && firstSubmissions.every(key => run.sets["research:accepted-submissions"]?.includes(key) && !run.sets["research:unsuccessful-submissions"]?.includes(key)));
  for (const paper of papers) {
    const review = paper.lastReview;
    if (!review || review.reports.length !== 3) continue;
    add("global:lucky-review", review.reports.every(report => report.reviewerType === "kind"));
    add("global:back-from-the-brink", review.reports.every(report => report.reviewerType === "expert" && (report.improvementAmount ?? 0) + Object.values(report.improvements ?? {}).reduce((sum, amount) => sum + amount, 0) > 0));
    add("global:turn-the-tide", review.accepted && review.totalReviewScore === -1);
  }
  const review = state.thesis.review;
  if (state.thesis.reviewResolved && review?.submitted && review.reports.length > 0 && review.reports.every(report => report.grade === "A")) {
    result.push(review.degree === "master" ? "global:excellent-master-thesis" : "global:excellent-phd-thesis");
  }
  const conferenceYears = new Map<string, Set<number>>();
  const conferenceCounts = new Map<string, number>();
  for (const paper of publications) {
    if (!paper.target || journal(paper) || paper.submittedMonth == null || paper.submittedYear == null) continue;
    const conference = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    if (conference.name === "-") continue;
    const years = conferenceYears.get(conference.name) ?? new Set<number>();
    years.add(conference.year);
    conferenceYears.set(conference.name, years);
    const key = `${conference.name}:${conference.year}`;
    conferenceCounts.set(key, (conferenceCounts.get(key) ?? 0) + 1);
  }
  add("global:double-hit", [...conferenceCounts.values()].some(count => count >= 2));
  add("global:conference-three-years", [...conferenceYears.values()].some(years => [...years].some(year => years.has(year + 1) && years.has(year + 2))));
  return [...new Set(result)];
}

/** Final-state challenges are evaluated only by ending preview/settlement.
 * Keep them out of observed evidence so old saved runs retain the same replay digest. */
export function evaluateEndingResearchAchievements(state: GameState): string[] {
  if (state.phase !== "finished" || (state.ending !== "master" && state.ending !== "phd")) return [];
  const firstAuthors = allPapers(state).filter(paper => paper.status === "published" && isFirstAuthor(paper));
  const result: string[] = [];
  if (state.ending === "phd" && firstAuthors.length === 2) result.push("global:slow-research");
  if (!firstAuthors.some(paper => !paper.journalTarget && !paper.publication?.journalTarget)) {
    result.push("global:no-first-conference-graduation");
  }
  return result;
}
