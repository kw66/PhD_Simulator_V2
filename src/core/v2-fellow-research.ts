import { getAcademicCalendarYear } from "./v2-calendar";
import { getConferenceInfo } from "./v2-conference-catalog";
import { pushLog } from "./v2-engine-helpers";
import { advanceFellowCooperation, settlePendingFellowHelp } from "./v2-fellow-cooperation";
import { getFellowName, getFellowResearchTopic } from "./v2-fellow-progression";
import { settleLabResearchGrowth } from "./v2-lab-talent";
import { getPaperScoreBreakdown, setPaperOwnScore } from "./v2-paper-collaboration";
import { createDraftPaper, decayUnpublishedPaper, prepareConferenceSubmission, resolvePaperReview } from "./v2-paper-rules";
import { attachPaperPublication, recordPaperAcceptances } from "./v2-publication-rules";
import { advancePaperReviewDeadline, applyRejectedPaperReview, CONFERENCE_PUBLICATION_DELAY_MONTHS, settlePaperCitationMonth } from "./v2-publication-system";
import { applyPublicationTalentRewards } from "./v2-publication-talent";
import { generateResearchScore } from "./v2-research-operation";
import { syncRelationshipState } from "./v2-relationship-rules";
import type { GameState, Paper, PaperActionType, PaperTarget } from "./v2-types";

export const FELLOW_PAPER_FIELDS = ["idea", "experiment", "writing"] as const;

export function getFellowCurrentPaper(state: GameState, fellowId: string): Paper | undefined {
  return state.fellowPapers?.find((paper) => paper.leadAuthorId === fellowId && paper.status !== "published");
}

export function ensureFellowPapers(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing") return state;
  if (state.fellowProgressState.some((profile) => !profile.researchTopic)) {
    state = { ...state, fellowProgressState: state.fellowProgressState.map((profile) => {
      if (profile.researchTopic) return profile;
      const existingPaper = getFellowCurrentPaper(state, profile.id);
      const researchTopic = existingPaper ? {
        topicId: existingPaper.topicId, topicLabel: existingPaper.topicLabel,
        heatMultiplier: existingPaper.heatMultiplier, prepublicationDecayRate: existingPaper.prepublicationDecayRate,
      } : getFellowResearchTopic(profile);
      return { ...profile, researchTopic };
    }) };
  }
  const missing = state.fellowProgressState.filter((profile) => !getFellowCurrentPaper(state, profile.id));
  if (missing.length === 0) return state;
  const existing = [...(state.fellowPapers ?? []), ...state.externalPublications];
  const added = missing.map((profile) => {
    let sequence = 1;
    while (existing.some((paper) => paper.id === `fellow-paper-${profile.id}-${sequence}`)) sequence += 1;
    return {
      ...createDraftPaper(state.totalMonths, sequence - 1, random, getAcademicCalendarYear(state.year, state.month), getFellowResearchTopic(profile)),
      id: `fellow-paper-${profile.id}-${sequence}`,
      leadAuthorId: profile.id,
      leadAuthorName: getFellowName(profile),
      createdTotalMonths: state.totalMonths,
    };
  });
  return { ...state, fellowPapers: [...(state.fellowPapers ?? []), ...added] };
}

export function getFellowResearchAction(paper: Paper): PaperActionType {
  return FELLOW_PAPER_FIELDS.find((field) => paper[field] <= 0)
    ?? FELLOW_PAPER_FIELDS.reduce((lowest, field) => paper[field] < paper[lowest] ? field : lowest);
}

export function getFellowSubmissionTarget(state: GameState, paper: Paper): PaperTarget | null {
  if (paper.status !== "draft" || FELLOW_PAPER_FIELDS.some((field) => paper[field] <= 0)) return null;
  const total = paper.idea + paper.experiment + paper.writing;
  return (["A", "B", "C"] as const).find((target) => {
    const conference = getConferenceInfo(state.month, target, state.year);
    return conference.name !== "-" && total >= conference.referenceScore;
  }) ?? null;
}

export function attendFellowConferences(state: GameState): GameState {
  const attend = (paper: Paper): Paper => paper.leadAuthorId && paper.status === "published"
    && paper.conferenceHandled === false && (paper.conferenceAvailableAtTotalMonths ?? Infinity) <= state.totalMonths
    ? { ...paper, conferenceHandled: true }
    : paper;
  return { ...state, fellowPapers: state.fellowPapers?.map(attend), externalPublications: state.externalPublications.map(attend) };
}

export function advanceFellowResearch(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing" || state.fellowResearchLastTotalMonths === state.totalMonths) return state;
  if (state.fellowProgressState.length === 0 && !state.fellowPapers?.length) return state;
  state = settleLabResearchGrowth(state);
  let nextState = ensureFellowPapers(state, random);
  const logs: string[] = [];
  const profiles = new Map(state.fellowProgressState.map((profile) => [profile.id, profile]));
  const canAdvancePaper = (paper: Paper): boolean => {
    const profile = profiles.get(paper.leadAuthorId ?? "");
    return profile ? state.totalMonths > profile.startTotalMonths
      && state.totalMonths > (profile.lastAdvancedTotalMonths ?? profile.startTotalMonths)
      && state.totalMonths > (paper.createdTotalMonths ?? profile.startTotalMonths) : paper.status === "reviewing";
  };
  nextState = { ...nextState, fellowPapers: nextState.fellowPapers?.map((paper) => canAdvancePaper(paper)
    ? decayUnpublishedPaper(paper) : paper) };
  nextState = settlePendingFellowHelp(nextState, random);
  for (const profile of state.fellowProgressState) {
    if (state.totalMonths <= profile.startTotalMonths
      || state.totalMonths <= (profile.lastAdvancedTotalMonths ?? profile.startTotalMonths)) continue;
    nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id
      ? { ...advanceFellowCooperation(fellow, profile.affinity, state.player.research), taskUsedThisMonth: false, lastAdvancedTotalMonths: state.totalMonths } : fellow) };
  }
  nextState = settlePendingFellowHelp(nextState, random);
  const publications: Paper[] = [];
  const acceptedPapers: Paper[] = [];
  const advancedDraftIds = new Set<string>();
  const fellowPapers = (nextState.fellowPapers ?? []).flatMap((original): Paper[] => {
    if (original.status === "published") return [settlePaperCitationMonth({ ...nextState, buffs: [] }, original).paper];
    const profile = profiles.get(original.leadAuthorId ?? "");
    if (!canAdvancePaper(original)) return [original];
    let paper = original;
    if (paper.status === "reviewing") {
      paper = advancePaperReviewDeadline(paper);
      if (paper.reviewMonthsLeft > 0) return [paper];
      const result = resolvePaperReview(paper, random);
      logs.push(`${profile ? getFellowName(profile) : paper.leadAuthorName}：${result.text}`);
      if (result.nextPaper.status !== "published") {
        return [applyRejectedPaperReview(paper, result.nextPaper.lastReview!)];
      }
      const conference = getConferenceInfo(paper.submittedMonth!, paper.target!, paper.submittedYear!);
      const accepted = attachPaperPublication({
        ...result.nextPaper,
        conferenceHandled: false,
        conferenceAvailableAtTotalMonths: state.totalMonths + CONFERENCE_PUBLICATION_DELAY_MONTHS,
      }, paper.citationDebuffMultiplierOnPublish ?? 1, result.acceptType ?? "Poster", conference.influence);
      acceptedPapers.push(accepted);
      if (accepted.collaborators?.some((person) => person.id === "player")) {
        publications.push({ ...accepted, nonFirstAuthor: true });
        return [];
      }
      return [accepted];
    }
    if (paper.status !== "draft" || !profile) return [paper];
    const monthsSinceJoining = state.totalMonths - profile.startTotalMonths;
    if (monthsSinceJoining < 2 || monthsSinceJoining % 2 !== 0
      || state.totalMonths - (paper.createdTotalMonths ?? profile.startTotalMonths) < 2) return [paper];
    const field = getFellowResearchAction(paper);
    paper = setPaperOwnScore(paper, field, generateResearchScore(
      profile.research, getPaperScoreBreakdown(paper, field).own, 1, 0, random,
    ));
    advancedDraftIds.add(paper.id);
    return [paper];
  });
  const recordedPapers = new Map(recordPaperAcceptances(acceptedPapers, state.totalMonths,
    [...nextState.papers, ...nextState.externalPublications, ...(nextState.fellowPapers ?? [])],
  ).map((paper) => [paper.id, paper]));
  nextState = ensureFellowPapers({
    ...nextState,
    fellowPapers: fellowPapers.map((paper) => recordedPapers.get(paper.id) ?? paper),
    fellowResearchLastTotalMonths: state.totalMonths,
    externalPublications: [...nextState.externalPublications, ...publications.map((paper) => ({ ...paper, ...recordedPapers.get(paper.id), nonFirstAuthor: true }))],
  }, random);
  nextState = settlePendingFellowHelp(nextState, random);
  nextState = { ...nextState, fellowPapers: nextState.fellowPapers?.map((paper) => {
    if (!advancedDraftIds.has(paper.id)) return paper;
    const target = getFellowSubmissionTarget(nextState, paper);
    if (!target) return paper;
    const conference = getConferenceInfo(state.month, target, state.year);
    logs.push(`${paper.leadAuthorName}：《${paper.title}》已投${conference.name}${conference.year}，总分${paper.idea + paper.experiment + paper.writing}`);
    return prepareConferenceSubmission(paper, target, state.month, state.year);
  }) };
  for (const log of logs) nextState = pushLog(nextState, log);
  if (publications.length === 0) return nextState;
  const rewardedState = applyPublicationTalentRewards(nextState);
  return { ...rewardedState, relationshipState: syncRelationshipState(rewardedState.relationshipState, rewardedState.player.social) };
}
