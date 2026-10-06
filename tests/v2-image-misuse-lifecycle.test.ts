import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { createImageMisuseBuff, hasScholarshipDisqualification, settlePublishedImageMisuse } from "../src/core/v2-academic-integrity";
import { advanceBuffDurations } from "../src/core/v2-buffs";
import { createDebugBuffs } from "../src/core/v2-debug-tools";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createScholarshipEvent } from "../src/core/v2-fixed-events-scholarship";
import { resolveReadyJournalPapers, submitJournalPaper } from "../src/core/v2-journal-system";
import { createDraftPaper, prepareConferenceSubmission, withdrawPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { applyPublicationTalentRewards } from "../src/core/v2-publication-talent";
import { createDataLossRandomEvent } from "../src/core/v2-random-events-core-progress";
import { createPaperCompetitionRandomEvent } from "../src/core/v2-random-events-paper-competition";
import type { GameState, Paper } from "../src/core/v2-types";

function makePaper(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id, idea: 40, experiment: 40, writing: 40, ...patch };
}

function makeState(papers = [makePaper("affected")]): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base, month: 6, totalMonths: 6, selectedAdvisorName: "测试导师",
    eventQueue: [], eventHistory: [], log: [], buffs: [], papers,
    selectedPaperId: papers[0]?.id ?? null,
    player: { ...base.player, san: 20, research: 0, money: 10 },
  };
}

function resolve(state: GameState, choiceIndex = 0): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[choiceIndex]!.id });
}

function falsify(state: GameState): GameState {
  const event = createDataLossRandomEvent(state).event!;
  return resolve(resolve(resolve({ ...state, eventQueue: [createEventQueueItem(event, 1)] }), 3));
}

function publishConference(state: GameState, paperId = "affected"): GameState {
  const submitted = {
    ...state, papers: state.papers.map((paper) => paper.id === paperId
      ? { ...prepareConferenceSubmission(paper, "C", 6, 1), reviewMonthsLeft: 0 } : paper),
  };
  let reviewed = resolveDuePaperReviews(submitted, () => 0).state;
  for (let step = 0; step < 3; step += 1) reviewed = resolve(reviewed);
  expect(reviewed.externalPublications.some((paper) => paper.id === paperId)).toBe(true);
  return reviewed;
}

afterEach(() => vi.restoreAllMocks());

describe("image misuse follows the affected paper", () => {
  it("marks the paper only after confirming PS misuse, without adding a permanent Buff yet", () => {
    const initial = makeState();
    const event = createDataLossRandomEvent(initial).event!;
    let state = resolve({ ...initial, eventQueue: [createEventQueueItem(event, 1)] });
    state = resolve(state, 3);
    expect(state.eventQueue[0]!.description).toContain("PS");
    expect(state.eventQueue[0]!.description).toContain("涉事论文引用 ×0.5");
    expect(state.eventQueue[0]!.description).not.toContain("复现");
    expect(state.papers[0]!.imageMisusePending).toBeUndefined();
    expect(state.buffs).toEqual([]);
    state = resolve(state);
    expect(state.papers[0]).toMatchObject({ imageMisusePending: true, citationDebuffMultiplierOnPublish: 0.5 });
    expect(state.buffs).toEqual([]);
    expect(hasScholarshipDisqualification(state)).toBe(false);
    expect(settlePublishedImageMisuse(state)).toBe(state);
    expect(renderApp(state)).toContain("举报风险（待生效）");
    expect(renderApp(state)).toContain("发表前丢弃或撤稿可避免生效");
  });

  it("activates the permanent penalty only when conference publication is confirmed", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = falsify(makeState());
    const submitted = { ...state, papers: [{ ...prepareConferenceSubmission(state.papers[0]!, "C", 6, 1), reviewMonthsLeft: 0 }] };
    let reviewed = resolveDuePaperReviews(submitted, () => 0).state;
    for (let step = 0; step < 2; step += 1) {
      expect(hasScholarshipDisqualification(reviewed)).toBe(false);
      reviewed = resolve(reviewed);
    }
    expect(hasScholarshipDisqualification(reviewed)).toBe(false);
    const result = reviewed.eventQueue[0]!;
    const published = resolve(reviewed);
    expect(published.buffs).toContainEqual(createImageMisuseBuff());
    expect(renderApp(published)).not.toContain("举报风险（待生效）");
    expect(published.externalPublications[0]!.publication!.citationDebuffMultiplier).toBe(0.5);
    expect(advanceBuffDurations(published.buffs)).toContainEqual(createImageMisuseBuff());
    const repeated = dispatchAction(published, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.buffs.filter((buff) => buff.id === "image-misuse")).toHaveLength(1);
    expect(applyPublicationTalentRewards(repeated).buffs).toEqual(repeated.buffs);
  });

  it("activates on journal acceptance, not submission", () => {
    const state = falsify(makeState());
    const submitted = submitJournalPaper(state, "affected", "pami");
    expect(submitted.papers[0]!.status).toBe("journal-reviewing");
    expect(hasScholarshipDisqualification(submitted)).toBe(false);
    const ready = { ...submitted, papers: [{ ...submitted.papers[0]!, idea: 50 }] };
    const published = resolveReadyJournalPapers(ready).state;
    expect(hasScholarshipDisqualification(published)).toBe(true);
    expect(published.externalPublications[0]!.publication!.citationDebuffMultiplier).toBe(0.5);
  });

  it("cancels a previously qualifying scholarship preview when the affected paper is then published", () => {
    const initial = falsify({ ...makeState(), year: 2, totalMonths: 18, totalResearchScore: 3 });
    const grant = createScholarshipEvent(initial, () => 0);
    const preview = resolve(resolve({ ...initial, eventQueue: [createEventQueueItem(grant, 1)] }));
    expect(preview.eventQueue[0]!.title).toContain("获得奖学金");
    expect(hasScholarshipDisqualification(preview)).toBe(false);
    const submitted = submitJournalPaper(preview, "affected", "pami");
    const published = resolveReadyJournalPapers({ ...submitted, papers: [{ ...submitted.papers[0]!, idea: 50 }] }).state;
    expect(hasScholarshipDisqualification(published)).toBe(true);
    const finished = resolve(published);
    expect(finished.player.money).toBe(initial.player.money);
    expect(finished.scholarshipState).toEqual(initial.scholarshipState);
    expect(finished.eventHistory.at(-1)!.stages.at(-1)!.title).toContain("资格取消");
  });

  it.each(["reviewing", "journal-reviewing"] as const)("withdraws %s risk but retains the paper citation penalty", (status) => {
    const state = falsify(makeState());
    const submitted = status === "reviewing"
      ? { ...state, papers: [prepareConferenceSubmission(state.papers[0]!, "C", 6, 1)] }
      : submitJournalPaper(state, "affected", "pami");
    const withdrawn = withdrawPaper(submitted, "affected");
    expect(withdrawn.papers[0]).toMatchObject({ status: "draft", imageMisusePending: false, citationDebuffMultiplierOnPublish: 0.5 });
    expect(renderApp(withdrawn)).not.toContain("举报风险（待生效）");
    const published = publishConference(withdrawn);
    expect(hasScholarshipDisqualification(published)).toBe(false);
    expect(published.externalPublications[0]!.publication!.citationDebuffMultiplier).toBe(0.5);
  });

  it("can discard a falsified draft without transferring its risk to a new paper", () => {
    const falsified = falsify(makeState());
    const discarded = dispatchAction(falsified, "discard-paper", { paperId: "affected" });
    expect(discarded.papers).toHaveLength(0);
    expect(hasScholarshipDisqualification(discarded)).toBe(false);
    const state = { ...discarded, papers: [makePaper("replacement")] };
    const published = publishConference(state, "replacement");
    expect(hasScholarshipDisqualification(published)).toBe(false);
    expect(published.externalPublications[0]!.publication!.citationDebuffMultiplier).toBe(1);
  });

  it("keeps another affected draft at risk when only one is withdrawn or discarded", () => {
    const state = falsify(makeState([makePaper("affected"), makePaper("second")]));
    const discarded = dispatchAction(state, "discard-paper", { paperId: "affected" });
    expect(discarded.papers[0]).toMatchObject({ id: "second", imageMisusePending: true });
    expect(hasScholarshipDisqualification(discarded)).toBe(false);
    const published = publishConference(discarded, "second");
    expect(hasScholarshipDisqualification(published)).toBe(true);
  });

  it("does not erase an already activated penalty by withdrawing another paper", () => {
    const state = falsify(makeState([makePaper("affected"), makePaper("second")]));
    const published = publishConference(state);
    const submitted = { ...published, papers: published.papers.map((paper) => prepareConferenceSubmission(paper, "C", 6, 1)) };
    const withdrawn = withdrawPaper(submitted, "second");
    expect(withdrawn.papers[0]!.imageMisusePending).toBe(false);
    expect(hasScholarshipDisqualification(withdrawn)).toBe(true);
  });

  it("tracks only non-empty affected drafts, not a prior publication or future paper", () => {
    const blank = makePaper("blank", { idea: 0, experiment: 0, writing: 0 });
    const reviewed = prepareConferenceSubmission(makePaper("reviewed"), "C", 6, 1);
    const state = falsify(makeState([makePaper("affected"), blank, reviewed, makePaper("non-first", { nonFirstAuthor: true })]));
    expect(state.papers.map((paper) => paper.imageMisusePending === true)).toEqual([true, false, false, false]);
    const prior = attachPaperPublication(makePaper("prior", { status: "published", target: "C" }));
    expect(hasScholarshipDisqualification(applyPublicationTalentRewards({ ...state, externalPublications: [prior] }))).toBe(false);
  });

  it("shows the named permanent Buff and includes it in debug effects", () => {
    const buff = createImageMisuseBuff();
    expect(createDebugBuffs()).toContainEqual(buff);
    const item = buildBuffDisplayBuckets([buff]).permanent.find((entry) => entry.label === "举报风险");
    expect(item).toMatchObject({ isDebuff: true, category: "publication" });
    expect(item!.sources.join("")).toContain("国奖入选后会被举报取消");
    const html = renderApp({ ...makeState(), buffs: [buff] });
    expect(html).toContain("举报风险");
    expect(buildBuffDisplayBuckets([{ ...buff, remainingMonths: 0 }]).permanent).toEqual([]);
  });

  it("removes the unexpected bold treatment from the computer narrative", () => {
    const initial = makeState();
    const event = createDataLossRandomEvent(initial).event!;
    const state = { ...initial, eventQueue: [createEventQueueItem(event, 1)] };
    const html = renderApp(state, undefined, { activePlayTab: "events", isEventContentOpen: true, activeEventId: event.id });
    expect(event.description).not.toContain("**");
    expect(html).not.toContain("<strong>自己的电脑</strong>");
  });

  it("keeps minor idea revisions unchanged and expresses inspiration for major revisions", () => {
    const event = createPaperCompetitionRandomEvent(17, makeState(), () => 0)!;
    const choices = event.choices[0]!.effects.enqueueEvents![0]!.choices;
    expect(choices[2]!.outcome).toBe("SAN -2｜idea保留");
    expect(choices[2]!.outcome).not.toContain("×");
    expect(choices[3]!.outcome).toBe("SAN -4｜idea×1.25（40→50）");
    expect(choices[3]!.effects.enqueueEvents![0]!.description).toContain("启发");
    expect(createPaperCompetitionRandomEvent(18, makeState(), () => 0)!.title).toBe("新sota");
  });
});
