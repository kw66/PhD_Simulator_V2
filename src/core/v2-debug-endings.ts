import { SCORE_BY_TARGET } from "./v2-content";
import { getAcademicCalendarYear } from "./v2-calendar";
import { createInitialState } from "./v2-engine-state-factory";
import { evaluateCoreEndings, finishTrainingIfReady, quitGame } from "./v2-ending-system";
import { createDraftPaper, getUnlockedPaperSlotCount } from "./v2-paper-rules";
import { createGrantedPublishedPaper } from "./v2-publication-rules";
import { getCalendarForTotalMonths, getGraduationScoreTarget, getMonthLimitByDegree } from "./v2-progression";
import { syncRelationshipState } from "./v2-relationship-rules";
import { JOURNAL_DEFINITIONS } from "./v2-journal-system";
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

export function createDebugEnding(state: GameState, ending: NonNullable<EndingId>, random: () => number = Math.random): GameState {
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
  const advisorName = state.selectedAdvisorName ?? ["张老师", "李老师", "王老师", "陈老师"][integer(0, 3)]!;
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
    relationshipState: { ...syncRelationshipState(base.relationshipState, player.social), advisorCount: 1 },
    advisorProgressState: { ...base.advisorProgressState, funding: ending === "lab-bankrupt" ? -integer(1, 20) / 2 : integer(1, 180) },
    log: [{ id: `debug-ending-${ending}`, month: totalMonths, text: cause }],
  };
  return atGraduation ? finishTrainingIfReady(preview) : ending === "quit" ? quitGame(preview) : evaluateCoreEndings(preview);
}
