import { gameRandom } from "./v2-game-random";
import { SCORE_BY_TARGET } from "./v2-content";
import { getAcademicCalendarYear } from "./v2-calendar";
import { createInitialState } from "./v2-engine-state-factory";
import { evaluateCoreEndings, finishTrainingIfReady, quitGame } from "./v2-ending-system";
import { prepareThesisBlindReview, syncThesisState, THESIS_REVIEW_THRESHOLDS } from "./v2-thesis-rules";
import { createDraftPaper, getUnlockedPaperSlotCount } from "./v2-paper-rules";
import { createGrantedPublishedPaper } from "./v2-publication-rules";
import { getCalendarForTotalMonths, getGraduationScoreTarget, getMonthLimitByDegree } from "./v2-progression";
import { syncRelationshipState } from "./v2-relationship-rules";
import { JOURNAL_DEFINITIONS } from "./v2-journal-system";
import { CAREER_JOBS, type CareerType } from "./v2-career-rules";
import { AI_SLOT_IDS, getAiModelForTotalMonths } from "./v2-ai-shop";
import { createCustomFellowProgressProfile } from "./v2-fellow-progression";
import { activateLover } from "./v2-lover-system";
import type { EndingId, GameState, JournalTarget, Paper, PaperTarget } from "./v2-types";

export const DEBUG_ENDINGS = {
  master: "硕士毕业",
  phd: "博士毕业",
  delay: "延毕",
  burnout: "不堪重负",
  poor: "穷困潦倒",
  expelled: "逐出师门",
  isolated: "被孤立",
  overthinking: "用脑过度",
  "lab-bankrupt": "实验室破产",
  quit: "主动退学",
} satisfies Record<NonNullable<EndingId>, string>;

export function isDebugEndingId(value: string | undefined): value is NonNullable<EndingId> {
  return value !== undefined && Object.hasOwn(DEBUG_ENDINGS, value);
}

export function createDebugEnding(state: GameState, ending: NonNullable<EndingId>, random: () => number = gameRandom): GameState {
  const integer = (minimum: number, maximum: number): number => {
    const roll = random();
    return minimum + Math.floor((Number.isFinite(roll) ? Math.max(0, Math.min(0.999999, roll)) : 0) * (maximum - minimum + 1));
  };
  const base = createInitialState();
  const degree = ending === "master" ? "master" : ending === "phd" ? "phd" : integer(0, 1) === 0 ? "master" : "phd";
  const maxMonths = getMonthLimitByDegree(degree);
  const atGraduation = ending === "master" || ending === "phd" || ending === "delay";
  const totalMonths = atGraduation ? maxMonths : integer(degree === "phd" ? 25 : 8, maxMonths - 1);
  const calendar = getCalendarForTotalMonths(totalMonths, degree);
  const advisorName = "调试导师";
  const target = getGraduationScoreTarget(degree, advisorName)!;
  const score = ending === "delay" ? integer(degree === "phd" ? 2 : 0, target - 1)
    : integer(atGraduation ? target : degree === "phd" ? 2 : 0, atGraduation ? target + 24 : 8);
  const publications: Paper[] = [];
  const venueScores = { ...SCORE_BY_TARGET, ...Object.fromEntries(Object.values(JOURNAL_DEFINITIONS).map((journal) => [journal.id, journal.researchScore])) } as Record<PaperTarget | JournalTarget, number>;
  const venues = Object.keys(venueScores) as (PaperTarget | JournalTarget)[];
  const addPublication = (venue: PaperTarget | JournalTarget, nonFirstAuthor: boolean): void => {
    const journal = Object.hasOwn(JOURNAL_DEFINITIONS, venue) ? JOURNAL_DEFINITIONS[venue as JournalTarget] : null;
    const acceptedMonth = integer(4, totalMonths - 3);
    const publicationCalendar = getCalendarForTotalMonths(acceptedMonth, degree);
    const submissionCalendar = getCalendarForTotalMonths(acceptedMonth - 3, degree);
    const title = createDraftPaper(acceptedMonth - 3, publications.length, random,
      getAcademicCalendarYear(publicationCalendar.year, publicationCalendar.month)).title;
    const paper = createGrantedPublishedPaper(acceptedMonth, publications.length, {
      target: journal ? "A" : venue as PaperTarget, acceptedScore: integer(journal?.acceptanceScore ?? 80, (journal?.acceptanceScore ?? 80) + 70), title, nonFirstAuthor,
      ...(nonFirstAuthor ? { leadAuthorName: "合作同学" } : {}),
    });
    publications.push({
      ...paper,
      journalTarget: journal?.id ?? null,
      submittedMonth: submissionCalendar.month,
      submittedYear: submissionCalendar.year,
      conferenceHandled: true,
      conferenceHandledAtTotalMonths: acceptedMonth + 3,
      publication: { ...paper.publication!, ...(journal ? { journalTarget: journal.id } : { acceptType: "Poster" as const }), citations: integer(0, (totalMonths - acceptedMonth - 2) * 20) },
    });
  };
  let remainingScore = score;
  while (remainingScore > 0) {
    const targets = venues.filter((venue) => venueScores[venue] <= remainingScore);
    const venue = targets[integer(0, targets.length - 1)]!;
    addPublication(venue, false);
    remainingScore -= venueScores[venue];
  }
  const coauthorCount = integer(0, 3);
  for (let index = 0; index < coauthorCount; index += 1) addPublication(venues[integer(0, venues.length - 1)]!, true);
  const player = { san: integer(3, 20), research: integer(3, 20), social: integer(1, 20), favor: integer(1, 20), money: integer(1, 200) / 2 };
  const failedAttribute = { burnout: "san", poor: "money", expelled: "favor", isolated: "social", overthinking: "research" } as const;
  if (ending in failedAttribute) player[failedAttribute[ending as keyof typeof failedAttribute]] = -integer(1, 12) / 4;
  const cause = {
    burnout: "调试情境：连续赶稿后，SAN 降至负数。",
    poor: "调试情境：支付个人费用后，金币降至负数。",
    expelled: "调试情境：与导师发生争执后，导师好感降至负数。",
    isolated: "调试情境：合作关系破裂后，社交降至负数。",
    overthinking: "调试情境：长期过度用脑后，科研降至负数。",
    "lab-bankrupt": "调试情境：支付学生工资后，科研经费降至负数。",
    quit: "调试情境：认真考虑后，你提交了退学申请。",
    master: "调试情境：硕士培养期结束，科研成果已达到毕业要求。",
    phd: "调试情境：博士培养期结束，科研成果已达到毕业要求。",
    delay: "调试情境：培养期结束，科研成果仍未达到毕业要求。",
  }[ending];
  const debugFellows = ([
    ["senior", "林舟", 9, 7],
    ["junior", "陈月", 7, 5],
    ["peer", "周宁", 8, 6],
  ] as const).map(([type, name, research, affinity], index) => createCustomFellowProgressProfile({
    type, gender: index === 1 ? "female" : "male", name, research, affinity, startTotalMonths: Math.max(1, totalMonths - 12),
  }));
  const debugAiSubscriptions = Object.fromEntries(AI_SLOT_IDS.map((slot) => {
    const model = getAiModelForTotalMonths(totalMonths, slot);
    return [slot, { enabled: true, active: true, paused: false, modelId: model.id, lastRenewalTotalMonths: totalMonths }];
  })) as GameState["aiShopState"]["subscriptions"];
  const offerType = (Object.keys(CAREER_JOBS) as CareerType[])[integer(0, 3)]!;
  const debugJob = CAREER_JOBS[offerType][Math.min(1, CAREER_JOBS[offerType].length - 1)]!;
  const debugOffers: GameState["careerOffers"] = { [offerType]: {
    type: offerType, jobId: debugJob.id, name: debugJob.name, threshold: debugJob.threshold, score: debugJob.threshold + 25,
    ...(debugJob.detail ? { detail: debugJob.detail } : {}), ...(debugJob.compensation ? { compensation: debugJob.compensation } : {}),
  } };
  const preview: GameState = {
    ...base,
    phase: "playing",
    selectedRoleId: state.selectedRoleId,
    setupSelectedRoleId: state.selectedRoleId,
    playerName: state.playerName ?? "调试同学",
    selectedAdvisorName: advisorName,
    blockLinearEvents: state.blockLinearEvents,
    debugEventReplayEnabled: state.debugEventReplayEnabled,
    degree, phdStartYear: degree === "phd" ? 3 : null,
    ...calendar, totalMonths, maxMonths,
    graduationScoreTarget: target,
    totalResearchScore: score,
    totalCitations: publications.reduce((sum, paper) => sum + paper.publication!.citations, 0),
    externalPublications: publications,
    player,
    paperSlotsUnlocked: getUnlockedPaperSlotCount(player.research),
    relationshipState: { ...syncRelationshipState(base.relationshipState, player.social), unlockedSlots: 6, occupiedSlots: 5,
      advisorCount: 1, seniorCount: 1, juniorCount: 1, peerCount: 1, loverCount: 1 },
    fellowProgressState: debugFellows,
    loverState: { ...activateLover("smart", totalMonths, "female"), name: "调试恋人" },
    loverProgressState: { ...base.loverProgressState, active: true, research: 8, intimacy: 9, relationProgress: 12, relationMax: 20 },
    advisorProgressState: { ...base.advisorProgressState, funding: ending === "lab-bankrupt" ? -integer(1, 20) / 2 : integer(1, 180),
      cumulativeFunding: 265, researchAccumulation: 12, playerProjectCompletions: { horizontal: 2, vertical: 1 },
      awards: [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }] },
    eventCounters: { ...base.eventCounters, badmintonCount: 3, pokerCount: 2, terrariaCount: 4, magicTowerCount: 2,
      rocoCount: 1, meetingCount: 3, domesticMeetingCount: 2, asiaMeetingCount: 1, westMeetingCount: 0, teachersDayErrandCount: 2 },
    scholarshipState: { ...base.scholarshipState, awardCount: 2 },
    internshipCount: 2,
    readingState: { ...base.readingState, readCount: 8 },
    careerOffers: debugOffers,
    personalSpending: 86.5,
    conferenceEncounterState: { ...base.conferenceEncounterState, bigBullCooperation: true,
      jointTrainingReward: { mentorId: "debug-mentor", mentorName: "调试联培导师", ideaBonus: 5, writingBonus: 5, capBonus: 2 } },
    shopState: { ...base.shopState, investments: { ...base.shopState.investments, gpu: 18, chair: 12, keyboard: 8, monitor: 10, bike: 6 },
      gpuLevel: 2, chairOwned: true, keyboardOwned: true, monitorOwned: true, bikeOwned: true },
    coffeeState: { ...base.coffeeState, machineOwned: true, machineInvestment: 10, machineTrackedCoffeeCount: 8 },
    aiShopState: { subscriptions: debugAiSubscriptions },
    log: [
      { id: `debug-ending-${ending}`, month: totalMonths, text: cause },
      { id: `debug-ending-ai-${ending}`, month: totalMonths - 1, text: "商店：续费 GPT-5，金币 -3。" },
      { id: `debug-ending-coffee-${ending}`, month: totalMonths - 2, text: "商店：购买冰美式，金币 -2。" },
    ],
  };
  if (atGraduation) {
    let prepared = syncThesisState({ ...preview, month: 7 }, random);
    if (ending === "master" || ending === "phd") {
      prepared = { ...prepared, thesis: { ...prepared.thesis,
        researchPoints: prepared.thesis.researchPoints.map((point) => ({ ...point,
          score: Math.ceil(THESIS_REVIEW_THRESHOLDS[degree].B / 3) + integer(1, 60),
        })),
      } };
    }
    const reviewed = prepareThesisBlindReview({ ...prepared, month: 8 }, random);
    return finishTrainingIfReady({ ...reviewed, ...calendar,
      thesis: { ...reviewed.thesis, reviewResolved: true },
    });
  }
  return ending === "quit" ? quitGame(preview) : evaluateCoreEndings(preview);
}
