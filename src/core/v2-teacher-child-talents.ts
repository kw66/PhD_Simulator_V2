import { getAcademicCalendarYear } from "./v2-calendar";
import { SCORE_BY_TARGET } from "./v2-content";
import { gameRandom } from "./v2-game-random";
import { applyPaperMastery } from "./v2-paper-mastery";
import { createDraftPaper, REVIEW_STABLE_SCORE_BY_TARGET } from "./v2-paper-rules";
import { getPreferredPaperTopicId } from "./v2-player-paper-topic";
import { attachPaperPublication, recordPaperAcceptances } from "./v2-publication-rules";
import { applyPublicationTalentRewards } from "./v2-publication-talent";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import { recordTalentTrigger } from "./v2-talent-history";
import { applyPaperReviewSettlement } from "./v2-publication-system";
import { getReviewStrictnessMultiplier, resolvePaperReview } from "./v2-paper-rules";
import { getConferenceInfo } from "./v2-conference-catalog";
import type { FellowProgressProfile } from "./v2-types";
import type { GameState, Paper, PaperTarget } from "./v2-types";

const PATRONAGE_MILESTONES: readonly { id: string; name: string; favor: number; target: PaperTarget }[] = [
  { id: "family-patronage", name: "长辈提携α", favor: 12, target: "C" },
  { id: "family-patronage-beta", name: "长辈提携β", favor: 15, target: "B" },
  { id: "family-patronage-gamma", name: "长辈提携γ", favor: 18, target: "A" },
];

export function isFellowProjectApprentice(state: GameState, fellow: FellowProgressProfile): boolean {
  const elapsed = state.totalMonths - fellow.startTotalMonths;
  return usesGameplayRulesFrom("20261023-r38") && state.selectedRoleId === "teacher-child"
    && getRoleTalentLevel(state, "project-apprenticeship") > 0 && elapsed >= 1 && elapsed <= 6;
}

/** The second successful paper is settled once through the ordinary player acceptance pipeline. */
export function settleAppropriatedFellowPaper(state: GameState, fellow: FellowProgressProfile, paper: Paper,
  result: ReturnType<typeof resolvePaperReview>): GameState {
  const { leadAuthorId: _lead, leadAuthorName: _name, ...original } = paper;
  const owned: Paper = { ...original, nonFirstAuthor: false,
    collaborators: paper.collaborators?.filter(person => person.id !== "player") };
  const previousSelection = state.selectedPaperId;
  const review = result.nextPaper.lastReview!;
  const venue = getConferenceInfo(paper.submittedMonth!, paper.target!, paper.submittedYear!);
  const next = applyPaperReviewSettlement({ ...state,
    fellowPapers: state.fellowPapers?.filter(entry => entry.id !== paper.id),
    papers: [...state.papers, owned],
  }, {
    paperId: paper.id, target: paper.target!, accepted: true, acceptType: result.acceptType,
    submittedScore: (paper.submittedIdea ?? paper.idea) + (paper.submittedExperiment ?? paper.experiment) + (paper.submittedWriting ?? paper.writing),
    totalReviewScore: review.totalReviewScore, borderlineChance: review.borderlineChance,
    venueInfluence: venue.influence, reviewStrictnessMultiplier: getReviewStrictnessMultiplier(paper.target!, venue.influence),
    scoreGain: result.scoreGain, reviewerSanChange: 0, reports: review.reports,
  });
  return recordTalentTrigger({ ...next,
    selectedPaperId: next.papers.some(entry => entry.id === previousSelection) ? previousSelection : next.selectedPaperId,
  }, `role-publication-appropriation:${paper.id}`, {
    name: "成果归我", recipient: state.playerName ? `你·${state.playerName}` : "你",
    reason: `${fellow.name ?? "同学"}的第2篇论文成功发表`,
    effects: [`《${paper.title}》转为你的一作成果`, `科研分+${result.scoreGain}`],
  });
}

/** These are real first-author publications; claiming a milestone never consumes a draft slot. */
export function settleTeacherChildFavorMilestones(state: GameState, random: () => number = gameRandom): GameState {
  if (!usesGameplayRulesFrom("20261023-r28") || state.selectedRoleId !== "teacher-child"
    || state.phase !== "playing" || !state.roleTalents) return state;

  const claimed = new Set(state.roleTalents.familyPatronageGrantedIds ?? []);
  for (const milestone of PATRONAGE_MILESTONES) {
    if (claimed.has(milestone.id) || !getRoleTalentLevel(state, milestone.id)
      || state.player.favor < milestone.favor) continue;

    const preferredTopicId = getPreferredPaperTopicId(state);
    const draft = createDraftPaper(state.totalMonths, state.papers.length + state.externalPublications.length,
      random, getAcademicCalendarYear(state.year, state.month), preferredTopicId ? { topicId: preferredTopicId } : undefined);
    const score = REVIEW_STABLE_SCORE_BY_TARGET[milestone.target];
    const base = Math.floor(score / 3);
    const idea = base + (score % 3 > 0 ? 1 : 0);
    const experiment = base + (score % 3 > 1 ? 1 : 0);
    const publication: Paper = attachPaperPublication({
      ...draft,
      id: `teacher-child-${milestone.id}`,
      idea, experiment, writing: base,
      submittedIdea: idea, submittedExperiment: experiment, submittedWriting: base,
      status: "published", target: milestone.target, nonFirstAuthor: false,
      conferenceHandled: true,
    });
    const recorded = recordPaperAcceptances([publication], state.totalMonths,
      [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])])[0]!;

    // Claim before applying ordinary publication rewards: those can themselves raise favor.
    claimed.add(milestone.id);
    state = {
      ...state,
      roleTalents: { ...state.roleTalents!, familyPatronageGrantedIds: [...claimed] },
      externalPublications: [...state.externalPublications, recorded],
      totalResearchScore: state.totalResearchScore + SCORE_BY_TARGET[milestone.target],
    };
    state = recordTalentTrigger(state, `role-${milestone.id}`, {
      name: milestone.name, recipient: state.playerName ? `你·${state.playerName}` : "你",
      reason: `导师好感达到${milestone.favor}`,
      effects: [`获赠一作${milestone.target}类论文《${recorded.title}》`, `科研分+${SCORE_BY_TARGET[milestone.target]}`],
    });
    state = applyPaperMastery(applyPublicationTalentRewards(state));
  }
  return state;
}
