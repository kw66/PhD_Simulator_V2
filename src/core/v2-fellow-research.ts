import { gameRandom } from "./v2-game-random";
import { getEffectiveSocial } from "./v2-effective-attributes";
import { getAcademicCalendarYear } from "./v2-calendar";
import { formatMoney } from "./v2-money";
import { getConferenceInfo } from "./v2-conference-catalog";
import { advanceFellowCooperationWithLog, settlePendingFellowHelp } from "./v2-fellow-cooperation";
import { getFellowName, getFellowResearchTopic, getFellowsInCardOrder } from "./v2-fellow-progression";
import { createDraftPaper, decayUnpublishedPaper, prepareConferenceSubmission, resolvePaperReview } from "./v2-paper-rules";
import { getRoleKindReviewerBonus, getRoleTalentLevel } from "./v2-role-talent-state";
import { isFellowProjectApprentice, settleAppropriatedFellowPaper } from "./v2-teacher-child-talents";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import { attachPaperPublication, recordPaperAcceptances } from "./v2-publication-rules";
import { advancePaperReviewDeadline, applyRejectedPaperReview, CONFERENCE_PUBLICATION_DELAY_MONTHS, settlePaperCitationMonth } from "./v2-publication-system";
import { applyPublicationTalentRewards } from "./v2-publication-talent";
import { applyFellowAiResearch, subscribeFellowAi } from "./v2-fellow-ai";
import { getLabExperimentMoneyCost } from "./v2-lab-compute";
import { payFellowResearchCost } from "./v2-fellow-finance";
import { syncRelationshipState } from "./v2-relationship-rules";
import { advanceSharedLabProject, LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "./v2-lab-projects";
import { settleAdvisorGuidance } from "./v2-advisor-guidance";
import { settleConferenceRegistrationFees, settleFellowConferenceFees } from "./v2-lab-publication-costs";
import { getCaptainLevel, isCaptain } from "./v2-captain-state";
import { settleFellowPaperRejection } from "./v2-lab-talent";
import { addPaperCollaboration } from "./v2-paper-collaboration";
import type { GameState, Paper, PaperActionType, PaperTarget } from "./v2-types";

export const FELLOW_PAPER_FIELDS = ["idea", "experiment", "writing"] as const;

/** Extra ordinary actions and passive cooperation have independent fractional balances. */
function takeCaptainFellowCount(state: GameState, fellowId: string, cooperation: boolean): { state: GameState; count: number } {
  const fellow = state.fellowProgressState.find((profile) => profile.id === fellowId);
  const base = cooperation && fellow?.longTermMentoring ? 2 : 1;
  if (!isCaptain(state)) return { state, count: base };
  const key = cooperation ? "cooperationRemainders" : "actionRemainders";
  const captain = state.captainState!;
  const total = Number(((captain[key][fellowId] ?? 0)
    + 0.1 * getCaptainLevel(state, fellowId, cooperation ? "chosen" : "normal")).toFixed(10));
  const extra = Math.floor(total);
  return { state: { ...state, captainState: { ...captain,
    [key]: { ...captain[key], [fellowId]: Number((total - extra).toFixed(10)) },
  } }, count: base + extra };
}

export function getFellowCurrentPaper(state: GameState, fellowId: string): Paper | undefined {
  return state.fellowPapers?.find((paper) => paper.leadAuthorId === fellowId && paper.status !== "published");
}

export function ensureFellowPapers(state: GameState, random: () => number = gameRandom): GameState {
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
    const prefix = state.rewinderState?.academic
      ? `fellow-paper-${profile.id}-year${state.year}` : `fellow-paper-${profile.id}`;
    let sequence = 1;
    while (existing.some((paper) => paper.id === `${prefix}-${sequence}`)) sequence += 1;
    return {
      ...createDraftPaper(state.totalMonths, sequence - 1, random, getAcademicCalendarYear(state.year, state.month), getFellowResearchTopic(profile)),
      id: `${prefix}-${sequence}`,
      leadAuthorId: profile.id,
      leadAuthorName: getFellowName(profile),
      createdTotalMonths: state.totalMonths,
    };
  });
  return {
    ...state,
    fellowPapers: [...(state.fellowPapers ?? []), ...added],
    fellowProgressState: state.fellowProgressState.map((profile) => missing.some((entry) => entry.id === profile.id)
      ? { ...profile, nextMonthlyAction: usesGameplayRulesFrom("20261024-r50") ? profile.nextMonthlyAction ?? "research" : "research" } : profile),
  };
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
  return settleFellowConferenceFees(state);
}

export function advanceFellowResearch(state: GameState, random: () => number = gameRandom): GameState {
  if (state.phase !== "playing" || state.fellowResearchLastTotalMonths === state.totalMonths) return state;
  if (state.fellowProgressState.length === 0 && !state.fellowPapers?.length) return state;
  let nextState = ensureFellowPapers(state, random);
  const monthlyProjectType = state.advisorProgressState.funding >= LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD ? "vertical" : "horizontal";
  const profiles = new Map(state.fellowProgressState.map((profile) => [profile.id, profile]));
  const canAdvancePaper = (paper: Paper): boolean => {
    const profile = profiles.get(paper.leadAuthorId ?? "");
    return profile ? state.totalMonths > profile.startTotalMonths
      && state.totalMonths > (profile.lastAdvancedTotalMonths ?? profile.startTotalMonths)
      && state.totalMonths > (paper.createdTotalMonths ?? profile.startTotalMonths) : paper.status === "reviewing";
  };
  nextState = { ...nextState, fellowPapers: nextState.fellowPapers?.map((paper) => canAdvancePaper(paper)
    ? decayUnpublishedPaper(paper) : paper) };
  const publications: Paper[] = [];
  const acceptedPapers: Paper[] = [];
  const advancedDraftIds = new Set<string>();
  const monthlyActivities = new Map<string, string>();
  const addActivity = (fellowId: string, text: string): void => {
    const previous = monthlyActivities.get(fellowId);
    monthlyActivities.set(fellowId, previous ? `${previous}，${text}` : text);
  };
  const settlePaper = (original: Paper): Paper[] => {
    if (original.status === "published") return [settlePaperCitationMonth({ ...nextState, buffs: [] }, original).paper];
    const profile = profiles.get(original.leadAuthorId ?? "");
    if (!canAdvancePaper(original)) {
      return [original];
    }
    let paper = original;
    if (paper.status === "reviewing") {
      paper = advancePaperReviewDeadline(paper);
      if (paper.reviewMonthsLeft > 0) {
        if (profile) addActivity(profile.id, "审稿中");
        return [paper];
      }
      const kindReviewerBonus = profile && usesGameplayRulesFrom("20261023-r36") ? getRoleKindReviewerBonus(nextState) : 0;
      const result = resolvePaperReview(paper, random, kindReviewerBonus);
      if (result.nextPaper.status !== "published") {
        if (profile) {
          addActivity(profile.id, "论文退稿");
          if (!usesGameplayRulesFrom("20261024-r50")) nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id
            ? { ...fellow, nextMonthlyAction: "research" } : fellow) };
        }
        const rejectedPaper = applyRejectedPaperReview(paper, result.nextPaper.lastReview!);
        nextState = settleFellowPaperRejection(nextState, paper, rejectedPaper);
        return [rejectedPaper];
      }
      if (profile && usesGameplayRulesFrom("20261023-r38")) {
        const current = nextState.fellowProgressState.find(entry => entry.id === profile.id)!;
        const historicalIds = new Set([...(nextState.fellowPapers ?? []), ...nextState.externalPublications]
          .filter(entry => entry.status === "published" && entry.leadAuthorId === profile.id).map(entry => entry.id));
        const count = (current.successfulPublicationCount ?? historicalIds.size) + 1;
        nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map(entry => entry.id === profile.id
          ? { ...entry, successfulPublicationCount: count } : entry) };
        if (count === 2 && nextState.selectedRoleId === "teacher-child" && getRoleTalentLevel(nextState, "publication-appropriation") > 0) {
          nextState = settleAppropriatedFellowPaper(nextState, profile, paper, result);
          addActivity(profile.id, "第2篇论文中稿，成果转为你的一作");
          return [];
        }
      }
      if (profile) addActivity(profile.id, `论文中稿${result.nextPaper.collaborators?.some((person) => person.id === "player") ? "（与你合作）" : ""}`);
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
    return [paper];
  };
  for (const original of nextState.fellowPapers ?? []) {
    const current = nextState.fellowPapers?.find((paper) => paper.id === original.id) ?? original;
    const updated = settlePaper(current);
    nextState = { ...nextState, fellowPapers: nextState.fellowPapers?.flatMap((paper) => paper.id === current.id ? updated : [paper]) };
  }
  const recordedPapers = new Map(recordPaperAcceptances(acceptedPapers, state.totalMonths,
    [...nextState.papers, ...nextState.externalPublications, ...(nextState.fellowPapers ?? [])],
  ).map((paper) => [paper.id, paper]));
  nextState = ensureFellowPapers({
    ...nextState,
    fellowPapers: nextState.fellowPapers?.map((paper) => recordedPapers.get(paper.id) ?? paper),
    fellowResearchLastTotalMonths: state.totalMonths,
    externalPublications: [...nextState.externalPublications, ...publications.map((paper) => ({ ...paper, ...recordedPapers.get(paper.id), nonFirstAuthor: true }))],
  }, random);
  nextState = settleConferenceRegistrationFees(nextState, acceptedPapers.map((paper) => paper.id));
  nextState = settleAdvisorGuidance(settlePendingFellowHelp(nextState, random), random);
  const activeProfiles = getFellowsInCardOrder(nextState.fellowProgressState).filter((profile) => (
    state.totalMonths > profile.startTotalMonths
    && state.totalMonths > (profile.lastAdvancedTotalMonths ?? profile.startTotalMonths)
  ));
  for (const profile of activeProfiles) {
    const cooperation = takeCaptainFellowCount(nextState, profile.id, true);
    nextState = cooperation.state;
    const cooperationCount = cooperation.count;
    const cooperationGain = profile.affinity * cooperationCount;
    if (nextState.selectedRoleId === "research-captain") {
      // Settle each advance against current papers; absent targets keep a FIFO
      // reward queue, including multiple completions inside one advance.
      for (let index = 0; index < cooperationCount; index += 1) {
        nextState = advanceFellowCooperationWithLog(nextState, profile.id, profile.affinity);
        nextState = settlePendingFellowHelp(nextState, random);
      }
    } else {
      nextState = advanceFellowCooperationWithLog(nextState, profile.id, cooperationGain);
    }
    const cooperationLabel = cooperationCount > (profile.longTermMentoring ? 2 : 1)
      ? `（推进${cooperationCount}次）` : profile.longTermMentoring ? "（长期合作，推进2次）" : "";
    addActivity(profile.id, `协作进度 +${formatMoney(cooperationGain)}${cooperationLabel}`);
    nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id
      ? { ...fellow, taskUsedThisMonth: false, lastAdvancedTotalMonths: state.totalMonths } : fellow) };
  }
  nextState = settlePendingFellowHelp(nextState, random);
  const advanceProject = (profile: typeof state.fellowProgressState[number], forceHorizontal = false): void => {
    const type = forceHorizontal ? "horizontal" : monthlyProjectType;
    const amount = profile.research + Math.floor(random() * 6);
    const result = advanceSharedLabProject(nextState, type, amount, random);
    nextState = {
      ...result.state,
      fellowProgressState: result.state.fellowProgressState.map((fellow) => fellow.id === profile.id
        ? { ...fellow, lastProjectTotalMonths: state.totalMonths, nextMonthlyAction: "research" } : fellow),
    };
    addActivity(profile.id, `${forceHorizontal ? "经费不足，" : ""}${type === "horizontal" ? "横向" : "纵向"}进度 +${result.gain}${result.completed > 0 ? type === "vertical" ? "（完成并指导论文）" : "（项目完成）" : ""}`);
  };
  for (const active of activeProfiles) {
    const actions = takeCaptainFellowCount(nextState, active.id, false);
    nextState = actions.state;
    for (let actionIndex = 0; actionIndex < actions.count; actionIndex += 1) {
      if (nextState.selectedAdvisorName && nextState.advisorProgressState.funding < 0) break;
      const profile = nextState.fellowProgressState.find((fellow) => fellow.id === active.id)!;
      let paper = getFellowCurrentPaper(nextState, profile.id);
      const peerHelpMonth = usesGameplayRulesFrom("20261024-r50") && paper?.status === "reviewing";
      if (isFellowProjectApprentice(nextState, profile) || !paper || (!peerHelpMonth && paper.status !== "draft") || profile.nextMonthlyAction === "project") {
        advanceProject(profile);
        continue;
      }
      let helpedFellow: typeof profile | undefined;
      if (peerHelpMonth) {
        const candidates = getFellowsInCardOrder(nextState.fellowProgressState).filter((fellow) => fellow.id !== profile.id)
          .map((fellow) => ({ fellow, paper: getFellowCurrentPaper(nextState, fellow.id) }))
          .filter((entry): entry is { fellow: typeof profile; paper: Paper } => entry.paper?.status === "draft" && entry.paper.nonFirstAuthor !== true);
        if (!candidates.length) {
          nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id
            ? { ...fellow, nextMonthlyAction: "project" } : fellow) };
          addActivity(profile.id, "论文月暂无可帮助的同学论文");
          continue;
        }
        const selected = candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))]!;
        helpedFellow = selected.fellow;
        paper = selected.paper;
      }
      const field = getFellowResearchAction(paper);
      const beforeSubscription = paper;
      const subscription = subscribeFellowAi(nextState, profile.id, paper.id, field, !!helpedFellow);
      nextState = subscription.state;
      paper = nextState.fellowPapers!.find((entry) => entry.id === beforeSubscription.id)!;
      if (subscription.subscribed && subscription.model) {
        const priceLabel = subscription.model.price === 0 ? "免费" : `自费 -${subscription.model.price}`;
        addActivity(profile.id, `订阅${subscription.model.name}（${priceLabel}）${subscription.model.slot === "claude" ? "，论文打磨" : ""}`);
      }
      if (helpedFellow && subscription.subscribed && subscription.model?.slot === "claude") {
        const polish = FELLOW_PAPER_FIELDS.filter((key) => paper![key] > beforeSubscription[key])
          .map((key) => `${key === "idea" ? "idea" : key === "experiment" ? "实验" : "写作"} +${paper![key] - beforeSubscription[key]}`).join("、");
        if (polish) {
          addActivity(profile.id, `帮助${getFellowName(helpedFellow)}打磨《${paper.title}》：${polish}`);
          addActivity(helpedFellow.id, `${getFellowName(profile)}帮助打磨《${paper.title}》：${polish}`);
        }
      }
      const experimentCost = getLabExperimentMoneyCost(nextState);
      let experimentPayment = "";
      if (field === "experiment") {
        const payment = payFellowResearchCost(nextState, profile.id, experimentCost);
        if (!payment.paid) {
          if (helpedFellow) {
            nextState = { ...nextState, fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id
              ? { ...fellow, nextMonthlyAction: "project" } : fellow) };
            addActivity(profile.id, `帮助${getFellowName(helpedFellow)}的论文实验经费不足，未推进`);
          } else advanceProject(profile, true);
          continue;
        }
        nextState = payment.state;
        experimentPayment = `（经费 -${payment.labCost}${payment.personalCost > 0 ? `，自费 -${payment.personalCost}` : ""}）`;
      }
      const researched = applyFellowAiResearch(paper, field, profile.research, subscription.model, random);
      const gain = researched[field] - paper[field];
      const updated = helpedFellow ? addPaperCollaboration(paper, { paperId: paper.id,
        collaborator: { id: profile.id, name: getFellowName(profile) }, scores: { [field]: gain } }) : researched;
      const label = field === "idea" ? "idea" : field === "experiment" ? "实验" : "写作";
      if (helpedFellow) {
        addActivity(profile.id, `帮助${getFellowName(helpedFellow)}完善《${paper.title}》：${label} +${gain}${experimentPayment}`);
        addActivity(helpedFellow.id, `${getFellowName(profile)}帮助完善《${paper.title}》：${label} +${gain}`);
      } else addActivity(profile.id, `${paper.createdTotalMonths === state.totalMonths ? "新稿" : "论文"}${label} +${gain}${experimentPayment}`);
      nextState = {
        ...nextState,
        fellowPapers: nextState.fellowPapers?.map((entry) => entry.id === paper.id ? updated : entry),
        fellowProgressState: nextState.fellowProgressState.map((fellow) => fellow.id === profile.id
          ? { ...fellow, nextMonthlyAction: "project" } : fellow),
      };
      advancedDraftIds.add(paper.id);
    }
  }
  nextState = settleAdvisorGuidance(settlePendingFellowHelp(nextState, random), random);
  nextState = { ...nextState, fellowPapers: nextState.fellowPapers?.map((paper) => {
    if (!advancedDraftIds.has(paper.id)) return paper;
    const target = getFellowSubmissionTarget(nextState, paper);
    if (!target) return paper;
    const conference = getConferenceInfo(state.month, target, state.year);
    if (paper.leadAuthorId) addActivity(paper.leadAuthorId, `投稿${conference.name}${conference.year}`);
    return prepareConferenceSubmission(paper, target, state.month, state.year);
  }) };
  nextState = {
    ...nextState,
    fellowProgressState: nextState.fellowProgressState.map((profile) => (
      monthlyActivities.has(profile.id)
        ? { ...profile, monthlyActivity: monthlyActivities.get(profile.id) }
        : profile
    )),
  };
  if (publications.length === 0) return nextState;
  const rewardedState = applyPublicationTalentRewards(nextState, random);
  return { ...rewardedState, relationshipState: syncRelationshipState(rewardedState.relationshipState, getEffectiveSocial(rewardedState)) };
}
