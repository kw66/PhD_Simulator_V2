import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile, getFellowName } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { submitJournalPaper } from "../src/core/v2-journal-system";
import { settleFellowPaperRejection } from "../src/core/v2-lab-talent";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { applyPaperReviewSettlement, applyRejectedPaperReview, projectPaperReviewSettlement, resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { applyJuniorDelegationTalent, createJuniorDelegationTalent } from "../src/core/v2-role-talent-relationships";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { FellowProgressProfile, GameState, Paper, PaperReviewSettlement, PendingEvent } from "../src/core/v2-types";

function fellow(index = 1, affinity = 1, type: FellowProgressProfile["type"] = "junior") {
  return createCustomFellowProgressProfile({ type, gender: "female", name: `Fellow ${index}`,
    startTotalMonths: 1, research: 4, affinity, academicYear: 1, academicStartTotalMonths: 1, identitySeed: String(index) });
}

function playing(rank = 2, fellows = [fellow()]): GameState {
  const base = createStartedGameState("social-reversed");
  return { ...base, totalMonths: 6, year: 1, month: 6, eventQueue: [],
    roleTalents: { levels: { "rejection-camaraderie": rank } }, selectedAdvisorName: "Advisor",
    player: { ...base.player, social: 3, research: 3, favor: 3, money: 30, san: 20 },
    fellowProgressState: fellows, relationshipState: { ...base.relationshipState, occupiedSlots: fellows.length,
      juniorCount: fellows.filter(entry => entry.type === "junior").length,
      peerCount: fellows.filter(entry => entry.type === "peer").length,
      seniorCount: fellows.filter(entry => entry.type === "senior").length } };
}

function submitted(state: GameState, patch: Partial<Paper> = {}): Paper {
  const draft = { ...createDraftPaper(1, 0, () => 0), idea: 6, experiment: 6, writing: 6,
    collaborators: state.fellowProgressState.map(entry => ({ id: entry.id, name: getFellowName(entry) })), ...patch };
  return { ...prepareConferenceSubmission(draft, "A", 1, 1), reviewMonthsLeft: 0 };
}

function participatedPaper(state: GameState, patch: Partial<Paper> = {}): Paper {
  return submitted(state, { leadAuthorId: state.fellowProgressState[0]!.id,
    collaborators: [{ id: "player", name: "Player" }], ...patch });
}

const rejection = { reports: [], totalReviewScore: 0, accepted: false, borderlineChance: null };
function settlement(paper: Paper): PaperReviewSettlement {
  return { paperId: paper.id, target: "A", accepted: false, acceptType: null, submittedScore: 18,
    totalReviewScore: 0, borderlineChance: null, venueInfluence: 1, reviewStrictnessMultiplier: 1,
    scoreGain: 0, reviewerSanChange: 0, reports: [] };
}
const reject = (state: GameState, paper: Paper) => settleFellowPaperRejection(state, paper, applyRejectedPaperReview(paper, rejection));
const rewardTriggers = (state: GameState) => state.eventHistory.flatMap(entry => entry.stages)
  .filter(stage => stage.talentTrigger?.name === "同病相怜");

function delegationPreview(state: GameState, root: PendingEvent, branch: string): GameState {
  let next = { ...state, eventQueue: [createEventQueueItem(root, 1)] };
  next = dispatchAction(next, "resolve-event", { eventId: root.id, eventChoiceId: root.choices[0]!.id });
  const decision = next.eventQueue.find(event => event.chainId === root.chainId)!;
  const choice = decision.choices.find(entry => entry.id.includes(branch))!;
  expect(choice).toBeDefined();
  return dispatchAction(next, "resolve-event", { eventId: decision.id, eventChoiceId: choice.id });
}

describe("r49 envy relationship talents", () => {
  it.each([[1, "-delegate-"], [2, "-delegate-"], [4, "-share-"], [12, "-transfer-"]] as const)(
    "rewards one junior only after final confirmation of random-%i while retaining social costs", (id, branch) => {
      const initial = playing(0, [fellow(1, 6), fellow(2, 6), fellow(3, 6, "peer")]);
      initial.roleTalents = { levels: { "junior-bond": 2 } };
      initial.papers = [{ ...createDraftPaper(6, 0, () => 0), idea: 3 }];
      const root = createRandomEventById(id, initial, () => 0.9).event!;
      const preview = delegationPreview(initial, root, branch);
      expect(preview.player.social).toBe(initial.player.social);
      expect(preview.fellowProgressState.map(entry => entry.affinity)).toEqual([6, 6, 6]);
      const event = preview.eventQueue.find(entry => entry.chainId === root.chainId)!;
      const final = dispatchAction(preview, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
      expect(final.fellowProgressState.map(entry => entry.affinity)).toEqual([6, 7.6, 6]);
      expect(final.player.social).toBeLessThan(initial.player.social);
      expect(dispatchAction(final, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id })
        .fellowProgressState).toEqual(final.fellowProgressState);
    });

  it("does not reward a peer-only roster or an unallocated junior bond", () => {
    for (const initial of [playing(0, [fellow(1, 2, "peer")]), playing(0)]) {
      if (initial.fellowProgressState[0]!.type === "peer") initial.roleTalents = { levels: { "junior-bond": 2 } };
      expect(createJuniorDelegationTalent(initial, () => 0)).toEqual({ effects: {}, outcome: "" });
      expect(applyJuniorDelegationTalent(initial, 0)).toBe(initial);
    }
  });

  it("preserves r48 envy behavior and retains the upright junior bond", () => {
    const initial = playing();
    initial.roleTalents = { levels: { "junior-bond": 2 } };
    withGameplayRuleset("20261024-r48", () => {
      expect(createJuniorDelegationTalent(initial, () => 0)).toEqual({ effects: {}, outcome: "" });
      expect(applyJuniorDelegationTalent(initial, 0)).toBe(initial);
      const upright = { ...initial, selectedRoleId: "social" as const };
      expect(applyJuniorDelegationTalent(upright, 0).fellowProgressState[0]!.affinity).toBe(3);
    });
  });

  it.each([1, 2])("grants rank %i only to the lead fellow on the participated paper's first rejection", rank => {
    const initial = playing(rank, [fellow(1), fellow(2), fellow(3)]);
    const paper = participatedPaper(initial, { collaborators: [{ id: "player", name: "Player" },
      { id: initial.fellowProgressState[1]!.id, name: "Fellow 2" }, { id: "stranger", name: "Fellow 3" }] });
    const next = reject(initial, paper);
    expect(next.fellowProgressState.map(entry => entry.affinity)).toEqual([1 + rank, 1, 1]);
    expect(rewardTriggers(next)).toHaveLength(1);
    expect(next.roleTalents?.settledRejectionCamaraderiePaperIds).toEqual([paper.id]);
    expect(initial.fellowProgressState.map(entry => entry.affinity)).toEqual([1, 1, 1]);
  });

  it.each([1, 3])("never rewards a player's own first-author paper with %i fellow coauthors", count => {
    const initial = playing(2, Array.from({ length: count }, (_, index) => fellow(index + 1)));
    const paper = submitted(initial);
    const next = reject(initial, paper);
    expect(next.fellowProgressState).toEqual(initial.fellowProgressState);
    expect(rewardTriggers(next)).toHaveLength(0);
  });

  it("rewards only the lead fellow when the player helped their rejected paper", () => {
    const initial = playing(2, [fellow(1), fellow(2)]);
    const paper = submitted(initial, { leadAuthorId: initial.fellowProgressState[0]!.id, nonFirstAuthor: true,
      collaborators: [{ id: "player", name: "Player" }, { id: initial.fellowProgressState[1]!.id, name: "Fellow 2" }] });
    expect(reject(initial, paper).fellowProgressState.map(entry => entry.affinity)).toEqual([3, 1]);
  });

  it.each(["independent-fellow", "unidentified-lead", "non-first-author"])("does not reward %s authorship", kind => {
    const initial = playing();
    const paper = submitted(initial, kind === "independent-fellow"
      ? { leadAuthorId: initial.fellowProgressState[0]!.id, collaborators: [] }
      : kind === "unidentified-lead" ? { leadAuthorId: "stranger", collaborators: [{ id: "player", name: "Player" }] }
        : { nonFirstAuthor: true });
    expect(reject(initial, paper).fellowProgressState).toEqual(initial.fellowProgressState);
    expect(rewardTriggers(reject(initial, paper))).toHaveLength(0);
  });

  it("previews rewards without changing the original state or creating logs", () => {
    const initial = playing();
    const paper = participatedPaper(initial);
    const snapshot = structuredClone(initial);
    const preview = settleFellowPaperRejection(initial, paper, applyRejectedPaperReview(paper, rejection), false);
    expect(preview.fellowProgressState[0]!.affinity).toBe(3);
    expect(preview.log).toEqual(initial.log);
    expect(preview.eventHistory).toEqual(initial.eventHistory);
    expect(initial).toEqual(snapshot);
    expect(reject(initial, paper).fellowProgressState[0]!.affinity).toBe(3);
  });

  it("does not reward a player-led paper in previews, review scenes or final confirmation", () => {
    const base = playing();
    const paper = submitted(base);
    expect(projectPaperReviewSettlement({ ...base, papers: [paper] }, settlement(paper))
      .fellowProgressState[0]!.affinity).toBe(1);
    let next = resolveDuePaperReviews({ ...base, papers: [paper] }, () => 0).state;
    for (let scene = 0; scene < 2; scene++) {
      expect(next.fellowProgressState[0]!.affinity).toBe(1);
      expect(rewardTriggers(next)).toHaveLength(0);
      const event = next.eventQueue.find(entry => entry.source === "review")!;
      next = dispatchAction(next, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    expect(next.fellowProgressState[0]!.affinity).toBe(1);
    const finalEvent = next.eventQueue.find(entry => entry.source === "review")!;
    next = dispatchAction(next, "resolve-event", { eventId: finalEvent.id, eventChoiceId: "confirm-review-result" });
    expect(next.papers[0]!.rejectionCount).toBe(1);
    expect(next.fellowProgressState[0]!.affinity).toBe(1);
    expect(rewardTriggers(next)).toHaveLength(0);
    const repeated = dispatchAction(next, "resolve-event", { eventId: finalEvent.id, eventChoiceId: "confirm-review-result" });
    expect(repeated.fellowProgressState).toEqual(next.fellowProgressState);
    expect(rewardTriggers(repeated)).toHaveLength(0);
  });

  it.each(["no-talent", "no-coauthor"])("consumes a first rejection with %s and never grants retroactively", kind => {
    const initial = playing(kind === "no-talent" ? 0 : 2);
    const paper = participatedPaper(initial, kind === "no-coauthor" ? { collaborators: [] } : {});
    const first = reject(initial, paper);
    expect(first.fellowProgressState[0]!.affinity).toBe(1);
    expect(first.roleTalents?.settledRejectionCamaraderiePaperIds).toEqual([paper.id]);
    const upgraded = { ...first, roleTalents: { ...first.roleTalents!, levels: { "rejection-camaraderie": 2 } } };
    const resubmitted = { ...participatedPaper(upgraded), id: paper.id, rejectionCount: 1 };
    expect(reject(upgraded, resubmitted).fellowProgressState[0]!.affinity).toBe(1);
  });

  it("deduplicates the same result after save restoration even with a stale submission", () => {
    const initial = playing();
    const paper = participatedPaper(initial);
    const first = reject(initial, paper);
    const restored: GameState = JSON.parse(JSON.stringify(first));
    const repeated = reject(restored, paper);
    expect(repeated).toBe(restored);
    expect(repeated.fellowProgressState[0]!.affinity).toBe(3);
    expect(rewardTriggers(repeated)).toHaveLength(1);
  });

  it("applies tier resistance and consumes the reward even at the affinity cap", () => {
    for (const affinity of [6, 20]) {
      const initial = playing(2, [fellow(1, affinity)]);
      const paper = participatedPaper(initial);
      const first = reject(initial, paper);
      expect(first.fellowProgressState[0]!.affinity).toBe(affinity === 6 ? 7.6 : 20);
      const lowered = { ...first, fellowProgressState: first.fellowProgressState.map(entry => ({ ...entry, affinity: 1 })) };
      expect(reject(lowered, paper).fellowProgressState[0]!.affinity).toBe(1);
    }
  });

  it("does not reward second rejections, withdrawn drafts, accepted results or mismatched papers", () => {
    const initial = playing();
    const paper = participatedPaper(initial);
    const rejected = applyRejectedPaperReview(paper, rejection);
    expect(reject(initial, { ...paper, rejectionCount: 1 })).toBe(initial);
    expect(settleFellowPaperRejection(initial, { ...paper, status: "draft" }, rejected)).toBe(initial);
    expect(settleFellowPaperRejection(initial, paper, { ...rejected, status: "published", lastReview: { ...rejection, accepted: true } })).toBe(initial);
    expect(settleFellowPaperRejection(initial, paper, { ...rejected, id: "different" })).toBe(initial);
    const withdrawn = dispatchAction({ ...initial, papers: [paper] }, "withdraw-paper", { paperId: paper.id });
    expect(withdrawn.fellowProgressState).toEqual(initial.fellowProgressState);
    expect(withdrawn.roleTalents?.settledRejectionCamaraderiePaperIds).toBeUndefined();
  });

  it.each([false, true])("settles the actual fellow review path with player collaboration %s", collaborated => {
    const initial = ensureFellowPapers(playing(2), () => 0);
    const draft = { ...initial.fellowPapers![0]!, createdTotalMonths: 1, idea: 6, experiment: 6, writing: 6,
      collaborators: collaborated ? [{ id: "player", name: "Player" }] : [] };
    const paper = { ...prepareConferenceSubmission(draft, "A", 1, 1), reviewMonthsLeft: 1 };
    const next = advanceFellowResearch({ ...initial, fellowPapers: [paper], month: 7, totalMonths: 7 }, () => 0);
    expect(next.fellowPapers!.find(entry => entry.id === paper.id)!.rejectionCount).toBe(1);
    expect(next.fellowProgressState[0]!.affinity).toBe(collaborated ? 3 : 1);
    expect(rewardTriggers(next)).toHaveLength(collaborated ? 1 : 0);
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
  });

  it("does not treat journal threshold failures or revisions as rejection rewards", () => {
    const initial = playing();
    const low = { ...createDraftPaper(1, 0, () => 0), idea: 6, experiment: 6, writing: 6,
      collaborators: [{ id: initial.fellowProgressState[0]!.id, name: "Fellow 1" }] };
    const failed = submitJournalPaper({ ...initial, papers: [low] }, low.id, "pami");
    expect(failed.papers[0]!.status).toBe("draft");
    const submittedState = submitJournalPaper({ ...initial, papers: [{ ...low, idea: 30, experiment: 30, writing: 30 }] }, low.id, "pami");
    const revised = submitJournalPaper(submittedState, low.id, "pami");
    expect(revised.papers[0]!.status).toBe("journal-reviewing");
    for (const next of [failed, submittedState, revised]) {
      expect(next.fellowProgressState[0]!.affinity).toBe(1);
      expect(next.roleTalents?.settledRejectionCamaraderiePaperIds).toBeUndefined();
      expect(rewardTriggers(next)).toHaveLength(0);
    }
    const published = dispatchAction({ ...revised, papers: [{ ...revised.papers[0]!, writing: 70 }] },
      "submit-journal-paper", { paperId: low.id, journalTarget: "pami" });
    expect(published.externalPublications).toHaveLength(1);
    expect(published.fellowProgressState[0]!.affinity).toBe(2);
    expect(rewardTriggers(published)).toHaveLength(0);
  });

  it("preserves r48 review rewards and leaves other roles unchanged", () => {
    const initial = playing();
    const paper = participatedPaper(initial);
    withGameplayRuleset("20261024-r48", () => {
      expect(reject(initial, paper)).toBe(initial);
      const next = applyPaperReviewSettlement({ ...initial, papers: [paper] }, settlement(paper));
      expect(next.fellowProgressState).toEqual(initial.fellowProgressState);
      expect(next.roleTalents?.settledRejectionCamaraderiePaperIds).toBeUndefined();
      expect(rewardTriggers(next)).toHaveLength(0);
    });
    const upright = { ...initial, selectedRoleId: "social" as const };
    expect(reject(upright, paper)).toBe(upright);
  });
});
