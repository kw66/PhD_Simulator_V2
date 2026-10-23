import type { AcademicArchive, AcademicYearRecord } from "./v2-rewinder-academic-record";

type Check = (value: unknown) => boolean;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite: Check = v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12;
const nonnegative: Check = v => finite(v) && (v as number) >= 0;
const integer: Check = v => nonnegative(v) && Number.isSafeInteger(v);
const text: Check = v => typeof v === "string" && v.length <= 10000;
const bool: Check = v => typeof v === "boolean";
const nullable = (check: Check): Check => v => v === null || check(v);
const optional = (check: Check): Check => v => v === undefined || check(v);
const array = (check: Check, max = 20000): Check => v => Array.isArray(v) && v.length <= max && v.every(check);
const strings = array(text);
const choice = (...values: unknown[]): Check => v => values.includes(v);
const dictionary = (check: Check): Check => v => object(v) && Object.keys(v).length <= 20000
  && Object.entries(v).every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && key.length <= 1000 && check(item));
const shape = (required: Record<string, Check>, extra: Record<string, Check> = {}): Check => v => object(v)
  && Object.entries(required).every(([key, check]) => check(v[key]))
  && Object.entries(v).every(([key, item]) => required[key] ? required[key]!(item) : extra[key] ? optional(extra[key]!)(item) : false);
const fields = (names: string, check: Check): Record<string, Check> => Object.fromEntries(names.split(" ").map(name => [name, check]));
const counts = dictionary(finite);
const history = array(shape({ totalMonths: integer, text }), 1000);
const scoreParts = shape({}, fields("idea experiment writing", finite));
const actionEffect = shape({}, fields("bonus multiplier extraActions sanDelta", finite));
const actionEffects = shape({}, fields("idea experiment writing", actionEffect));
const buff = shape({ id: text, name: text, source: text, timing: choice("permanent"), remainingMonths: choice(null) }, {
  relationshipId: text, description: text, monthlyStats: shape({}, fields("san research social favor money", finite)),
  ...fields("monthlyActionLimitDelta actionLimitAtTotalMonths appliedActionLimitDelta activeOperationSanMultiplier activeOperationSanDelta relationshipOperationSanDelta labExperimentMoneyDelta", finite),
  scholarshipDisqualified: bool, actionEffects, paperPolishEffects: scoreParts,
  readingEffect: dictionary(finite), shopEffects: shape({}, { aiCostsCovered: bool, ...fields("aiCostsCoveredAtTotalMonths aiCostsCoveredUses", finite) }),
  publicationEffects: shape({}, fields("nextPromotionMultiplier citationDebuffMultiplier", finite)),
});
const grant = shape({ id: choice("youth", "general", "excellent", "distinguished", "academician"), awardedYear: integer, startYear: nullable(integer), endYear: nullable(integer) });
const advisor = shape({ researchAccumulation: finite, funding: finite, cumulativeFunding: finite,
  playerProjectCompletions: shape(fields("horizontal vertical", integer)), playerProjectParticipation: shape(fields("horizontal vertical", bool)),
  awards: array(grant, 10), pendingApplication: nullable(shape({ id: choice("youth", "general", "excellent", "distinguished", "academician"), calendarYear: integer, researchSnapshot: finite, resultRoll: finite })),
  countedPaperIds: strings, lastSettledTotalMonths: nullable(integer),
}, { ...fields("horizontalProgress verticalProgress", finite), nextProject: choice("horizontal", "vertical"),
  ...fields("lastHorizontalTotalMonths lastProjectTotalMonths lastAdvisorProjectTotalMonths lastPlayerProjectTotalMonths pendingGuidanceToPlayer", nullable(finite)),
  monthlyActivity: text, activityHistory: history,
  ...fields("paidJournalPaperIds paidConferenceRegistrationPaperIds paidFellowConferencePaperIds paidFellowConferenceTrips paidPlayerConferenceTrips", strings),
});
const fellow = shape({ id: text, type: choice("senior", "peer", "junior"), gender: choice("male", "female"),
  ...fields("research affinity taskProgress taskMax startTotalMonths", finite), taskType: choice("idea", "experiment", "writing"), taskUsedThisMonth: bool,
}, { ...fields("name annualResearchActivity monthlyActivity monthlySupportActivity", text), degree: choice("master", "phd"),
  ...fields("academicYear academicStartTotalMonths initialResearchScore monthlySalaryPaid lastSalaryTotalMonths lastAdvancedTotalMonths lastAnnualGrowthTotalMonths lastProjectTotalMonths helpedPlayerCount lastSupportTotalMonths helpedFellowCount annualResearchGrowthTotal", finite),
  ...fields("pendingHelpToPlayer pendingHelpToFellow pendingGuidanceFromAdvisor", nullable(finite)),
  nextMonthlyAction: choice("research", "project"), activityHistory: history, affinityRewardedPaperIds: strings, longTermMentoring: bool,
  researchTopic: shape({ topicId: text, topicLabel: text, heatMultiplier: finite, prepublicationDecayRate: finite }),
  monthlyPublicationCosts: shape(fields("totalMonths registration journal sharedTravel", finite)),
  successfulPublicationCount: integer,
});
const loverState = shape({ active: choice(true), type: choice("beautiful", "smart"), gender: choice("male", "female"), startTotalMonths: nullable(integer), beautifulExtraRecoveryRate: finite }, { contactId: text, name: text });
const loverProgress = shape({ active: choice(true), ...fields("research intimacy taskProgress taskMax relationProgress relationMax completedTaskCount", finite), canInteract: bool, taskUsedThisMonth: bool }, {
  routes: shape(fields("play study shopping", shape({ progress: finite, completed: integer }))),
  ...fields("giftCoupons lastDateTotalMonths lastAdvancedTotalMonths lastAnnualGrowthTotalMonths", finite),
  pendingPaperHelp: nullable(shape({ amount: finite, collaboratorId: text, name: text })), sanDiscountMonths: array(integer),
  annualResearchActivity: text, monthlyActivity: text, activityHistory: history,
});
const finance = shape({ name: text, money: finite }, { aiSlot: choice("gpt", "deepseek", "doubao", "claude"), aiSubscribedTotalMonths: integer });
// Papers retain descriptive review evidence too. All nested values must be bounded JSON, while functional publication fields receive structural checks.
function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 24) return false;
  if (value === null || value === undefined || typeof value === "boolean") return true;
  if (typeof value === "number") return finite(value);
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) return value.length <= 20000 && value.every(item => boundedJson(item, depth + 1));
  return object(value) && Object.entries(value).length <= 20000 && Object.entries(value).every(([key, item]) =>
    !["__proto__", "constructor", "prototype"].includes(key) && boundedJson(item, depth + 1));
}
const publication = shape({ citations: nonnegative, effectiveScore: nonnegative, citationDebuffMultiplier: nonnegative }, {
  ...fields("promotionMultiplier influence monthsSincePublish highlyCitedThreshold pendingCitationFraction", nonnegative),
  journalTarget: choice("nature", "nmi", "pami"), acceptType: choice("Poster", "Spotlight", "Oral", "Best Paper Candidate", "Best Paper"),
  ...fields("highlyCited preprintExposed posterExposed", bool), promotions: boundedJson,
});
const reviewer = shape({ reviewer: text, focus: choice("balanced", "idea", "experiment", "weakness"), effectiveScore: finite,
  decision: choice("Accept", "Borderline", "Reject"), reviewScore: choice(-1, 0, 1) }, {
  ...fields("reviewCode weightInfo comment", text), reviewerType: choice("novelty", "experiment", "normal", "gpt", "expert", "kind", "strict", "hostile"),
  improvementAction: choice("idea", "experiment", "writing"), improvements: scoreParts,
  ...fields("improvementAmount sanChange baseSanChange illnessSanIncrease", finite),
});
const review = shape({ reports: array(reviewer, 10), totalReviewScore: finite, accepted: bool, borderlineChance: nullable(finite) });
const paper: Check = value => object(value) && boundedJson(value)
  && ["id", "title", "topicId", "topicLabel"].every(key => text(value[key]))
  && ["heatMultiplier", "prepublicationDecayRate", "idea", "experiment", "writing", "reviewMonthsLeft"].every(key => finite(value[key]))
  && value.status === "published" && choice(null, "A", "B", "C")(value.target)
  && optional(choice("nature", "nmi", "pami", null))(value.journalTarget)
  && optional(nullable(publication))(value.publication)
  && optional(nullable(review))(value.lastReview)
  && optional(array(shape({ totalMonths: integer, score: finite })))(value.journalScoreHistory)
  && optional(scoreParts)(value.collaborationScores)
  && optional(nullable(scoreParts))(value.submittedCollaborationScores)
  && ["conferenceHandled", "nonFirstAuthor"].every(key => optional(bool)(value[key]))
  && ["acceptedTotalMonths", "acceptedOrder", "conferenceHandledAtTotalMonths", "rejectionCount"].every(key => optional(nonnegative)(value[key]))
  && ["leadAuthorName", "leadAuthorId"].every(key => optional(text)(value[key]))
  && optional(array(shape({ id: text, name: text }, { contributionScores: scoreParts })))(value.collaborators);
const coffee = shape({ ...fields("machineOwned subscriptionEnabled subscriptionPaused", bool), machineUpgrade: choice(null, "manual", "automatic", "advanced", "unlimited"),
  ...fields("machineInvestment coffeePurchaseCountThisMonth coffeeProducedCountThisMonth machineTrackedCoffeeCount", nonnegative) });
const offer = shape({ id: text, company: text, position: text, ...fields("baseMonthlyIncome monthlySanCost experimentBonus", finite) });
const encounters = shape({ ...fields("metBigBullCoop bigBullCooperation permanentlyBlockedBigBullCoop metBeautiful permanentlyBlockedBeautifulLover metSmart permanentlyBlockedSmartLover", bool),
  ...fields("bigBullCoopCount bigBullDeepCount rejectedBigBullCoopCount beautifulCount rejectedBeautifulLoverCount smartCount rejectedSmartLoverCount", integer),
}, { bigBull: shape({ id: text, name: text, level: choice(0, 1, 2), cooperationCount: integer }),
  scholars: shape({}, fields("beautiful smart", shape({ id: text, name: text, gender: choice("male", "female"), encounterCount: integer }))),
  jointTrainingReward: shape({ mentorId: text, mentorName: text, ideaBonus: finite, writingBonus: finite, capBonus: finite }) });
const achievement = shape({ satisfied: strings, counters: counts, sets: dictionary(strings), peaks: counts, minima: counts,
  collections: shape(fields("buffs products conferences locations directions", strings)) });
const careerValues = shape(fields("internet stateOwned civilService academic", nonnegative));
const record = shape({
  year: choice(1, 2, 3, 4, 5), totalMonths: integer,
  identity: shape({ playerName: nullable(text), degree: choice("master", "phd"), phdStartYear: nullable(integer), graduationScoreTarget: nullable(nonnegative), maxMonths: choice(34, 70) }),
  attributes: shape(fields("san research social favor money sanCap researchCap socialCap favorCap", finite)),
  growth: shape({ readingState: shape({ readCount: integer }), ...fields("partTimeWorkCount internshipCount totalRandomEventCount relationshipMentorshipStacks", integer),
    personalSpending: nonnegative, strongBody: bool, careerProgress: careerValues, careerInterviewExperience: careerValues,
    eventCounters: shape(fields("badmintonCount pokerCount pokerProfit meetingCount domesticMeetingCount asiaMeetingCount westMeetingCount teachersDayErrandCount terrariaCount magicTowerCount rocoCount", finite)),
    paperMasteryState: shape({ count: integer, rewardedPaperIds: strings }), publicationTalentState: shape({ claimedIds: strings }),
    scholarshipState: shape({ lastAwardYear: nullable(integer), scoreBaseline: nonnegative, claimedPaperIds: strings }, { awardCount: integer }),
    achievementProgress: achievement, displayCounters: shape(fields("labResearchGrowth playerLedPublications fellowLedPublications", nonnegative)),
  }),
  equipment: shape({ coffee, bike: shape({ ...fields("bikeOwned ebikeOwned", bool), ...fields("bikeLevel bikeSanSpent bikeSanCapGains investment giftDiscount", nonnegative) }) }),
  permanentBuffs: array(buff, 500), conference: shape({ encounters, career: shape({ enterpriseCount: integer, rejectedInternshipCount: integer, permanentlyBlockedInternship: bool }, { hasInternshipExperience: bool, lastInternshipOffer: offer }) }),
  papers: shape({ papers: array(paper), externalPublications: array(paper), totalResearchScore: nonnegative, totalCitations: nonnegative, citationHistoryByYear: counts }),
  people: shape({ advisor: shape({ name: nullable(text), progress: advisor }), lover: nullable(shape({ state: loverState, progress: loverProgress })),
    fellows: array(shape({ profile: fellow }, { finance }), 4) }),
});

/** New chapter archives deliberately do not migrate the former automatic-inheritance format. */
export function normalizeAcademicArchive(value: unknown): AcademicArchive {
  const normalized: AcademicArchive = { version: 1, years: {} };
  if (!object(value) || value.version !== 1 || !object(value.years)) return normalized;
  for (let year = 1; year <= 5; year++) {
    const candidate = value.years[year];
    if (!record(candidate) || !object(candidate) || candidate.year !== year || candidate.totalMonths !== year * 12) continue;
    const checked = candidate as unknown as AcademicYearRecord;
    if (checked.identity.maxMonths <= checked.totalMonths || (checked.identity.degree === "master") !== (checked.identity.maxMonths === 34)
      || checked.identity.degree === "phd" && (checked.identity.phdStartYear === null || checked.identity.phdStartYear > year + 1)) continue;
    const ids = [...checked.papers.papers, ...checked.papers.externalPublications].map(item => item.id);
    const fellowIds = checked.people.fellows.map(item => item.profile.id);
    if (new Set(ids).size !== ids.length || new Set(fellowIds).size !== fellowIds.length) continue;
    normalized.years[year] = structuredClone(checked);
  }
  if (object(value.attempts)) normalized.attempts = Object.fromEntries(Object.entries(value.attempts)
    .filter(([year, count]) => /^[1-5]$/.test(year) && integer(count)).map(([year, count]) => [year, count as number]));
  return normalized;
}
