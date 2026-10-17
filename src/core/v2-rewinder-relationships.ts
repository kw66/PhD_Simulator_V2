import { getAcademicCalendarYear } from "./v2-calendar";
import { getFellowAcademicYear, getFellowResearchScore } from "./v2-fellow-academic";
import { getFellowName } from "./v2-fellow-progression";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import { getLoverName } from "./v2-lover-system";
import { syncRelationshipState, tryAddRelationship } from "./v2-relationship-rules";
import type { AdvisorGrantAward, FellowProgressProfile, GameState, LoverProgressState, LoverState } from "./v2-types";

interface CapturedTime { capturedTotalMonths: number; capturedYear: number }
export interface RewinderFellowRecord extends CapturedTime {
  key: string;
  profile: FellowProgressProfile;
}
export interface RewinderLoverRecord extends CapturedTime {
  key: string;
  lover: LoverState;
  progress: LoverProgressState;
}
export interface RewinderAdvisorRecord {
  researchAccumulation: number;
  funding: number;
  awards: AdvisorGrantAward[];
}
export interface RewinderRelationshipsSnapshot extends CapturedTime {
  advisor: RewinderAdvisorRecord;
  fellows: RewinderFellowRecord[];
  lovers: RewinderLoverRecord[];
}

type DataRecord = Record<string, unknown>;
function object(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length <= 2000; }
function onlyKeys(value: DataRecord, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function optional(value: DataRecord, keys: readonly string[], check: (item: unknown) => boolean): boolean {
  return keys.every((key) => value[key] === undefined || check(value[key]));
}
function history(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 1000 && value.every((entry) => object(entry)
    && onlyKeys(entry, ["totalMonths", "text"]) && number(entry.totalMonths) && text(entry.text));
}
const FELLOW_NUMBERS = ["research", "affinity", "taskProgress", "taskMax", "startTotalMonths", "academicYear",
  "academicStartTotalMonths", "initialResearchScore", "monthlySalaryPaid", "lastSalaryTotalMonths", "lastAdvancedTotalMonths",
  "lastAnnualGrowthTotalMonths", "lastProjectTotalMonths", "helpedPlayerCount", "lastSupportTotalMonths",
  "helpedFellowCount", "annualResearchGrowthTotal"];
const FELLOW_TEXTS = ["id", "name", "annualResearchActivity", "monthlyActivity", "monthlySupportActivity"];
function validFellow(value: unknown): boolean {
  if (!object(value) || !onlyKeys(value, [...FELLOW_NUMBERS, ...FELLOW_TEXTS, "type", "gender", "taskType", "taskUsedThisMonth",
    "researchTopic", "degree", "pendingHelpToPlayer", "pendingHelpToFellow", "nextMonthlyAction", "activityHistory",
    "pendingGuidanceFromAdvisor", "monthlyPublicationCosts", "affinityRewardedPaperIds", "longTermMentoring"])) return false;
  return text(value.id) && text(value.name) && ["senior", "peer", "junior"].includes(String(value.type))
    && ["male", "female"].includes(String(value.gender)) && ["idea", "experiment", "writing"].includes(String(value.taskType))
    && ["research", "affinity", "taskProgress", "taskMax", "startTotalMonths"].every((key) => number(value[key]))
    && Number(value.taskMax) > 0 && typeof value.taskUsedThisMonth === "boolean"
    && optional(value, FELLOW_NUMBERS, number) && optional(value, FELLOW_TEXTS, text)
    && optional(value, ["degree"], (item) => item === "master" || item === "phd")
    && optional(value, ["longTermMentoring"], (item) => typeof item === "boolean")
    && optional(value, ["nextMonthlyAction"], (item) => item === "research" || item === "project")
    && optional(value, ["activityHistory"], history)
    && optional(value, ["pendingHelpToPlayer", "pendingHelpToFellow", "pendingGuidanceFromAdvisor"], (item) => item === null)
    && value.monthlyPublicationCosts === undefined
    && optional(value, ["affinityRewardedPaperIds"], (item) => Array.isArray(item) && item.length === 0)
    && optional(value, ["researchTopic"], (item) => object(item)
      && onlyKeys(item, ["topicId", "topicLabel", "heatMultiplier", "prepublicationDecayRate"])
      && text(item.topicId) && text(item.topicLabel) && number(item.heatMultiplier) && number(item.prepublicationDecayRate));
}
function validLover(value: unknown): boolean {
  return object(value) && onlyKeys(value, ["contactId", "active", "name", "type", "gender", "startTotalMonths", "beautifulExtraRecoveryRate"])
    && value.active === true && text(value.name) && ["beautiful", "smart"].includes(String(value.type))
    && ["male", "female"].includes(String(value.gender)) && (value.startTotalMonths === null || number(value.startTotalMonths))
    && number(value.beautifulExtraRecoveryRate) && optional(value, ["contactId"], text);
}
function validLoverProgress(value: unknown): boolean {
  const numbers = ["research", "intimacy", "taskProgress", "taskMax", "relationProgress", "relationMax", "completedTaskCount",
    "giftCoupons", "lastDateTotalMonths", "lastAdvancedTotalMonths", "lastAnnualGrowthTotalMonths"];
  return object(value) && onlyKeys(value, [...numbers, "active", "canInteract", "taskUsedThisMonth", "routes",
    "pendingPaperHelp", "sanDiscountMonths", "annualResearchActivity", "monthlyActivity", "activityHistory"])
    && value.active === true && typeof value.canInteract === "boolean" && typeof value.taskUsedThisMonth === "boolean"
    && numbers.slice(0, 7).every((key) => number(value[key])) && optional(value, numbers, number)
    && Number(value.taskMax) > 0 && Number(value.relationMax) > 0
    && optional(value, ["annualResearchActivity", "monthlyActivity"], text)
    && optional(value, ["activityHistory"], history)
    && (value.pendingPaperHelp === null || value.pendingPaperHelp === undefined)
    && (value.giftCoupons === 0 || value.giftCoupons === undefined)
    && optional(value, ["sanDiscountMonths"], (item) => Array.isArray(item) && item.length === 0)
    && optional(value, ["routes"], (routes) => object(routes) && onlyKeys(routes, ["play", "study", "shopping"])
      && ["play", "study", "shopping"].every((key) => {
        const item = routes[key];
        return object(item) && onlyKeys(item, ["progress", "completed"]) && number(item.progress) && number(item.completed)
          && item.progress >= 0 && item.completed >= 0;
      }));
}
function validTime(value: DataRecord): boolean {
  return number(value.capturedTotalMonths) && Number.isInteger(value.capturedTotalMonths)
    && value.capturedTotalMonths >= 1 && value.capturedTotalMonths <= 1000
    && number(value.capturedYear) && Number.isInteger(value.capturedYear)
    && value.capturedYear >= 1 && value.capturedYear <= 100;
}
function validGrant(value: unknown): boolean {
  return object(value) && onlyKeys(value, ["id", "awardedYear", "startYear", "endYear"])
    && ["youth", "general", "excellent", "distinguished", "academician"].includes(String(value.id))
    && number(value.awardedYear) && (value.startYear === null || number(value.startYear))
    && (value.endYear === null || number(value.endYear));
}

/** Reject malformed account data instead of spreading unknown fields into live gameplay. */
export function isRewinderRelationshipsSnapshot(value: unknown): value is RewinderRelationshipsSnapshot {
  if (!object(value) || !validTime(value)
    || !onlyKeys(value, ["capturedTotalMonths", "capturedYear", "advisor", "fellows", "lovers"])) return false;
  const advisor = value.advisor;
  if (!object(advisor) || !onlyKeys(advisor, ["funding", "researchAccumulation", "awards"])
    || !number(advisor.funding) || !number(advisor.researchAccumulation)
    || !Array.isArray(advisor.awards) || advisor.awards.length > 5 || !advisor.awards.every(validGrant)) return false;
  const validRecords = (records: unknown, kind: "fellow" | "lover") => Array.isArray(records) && records.length <= 500
    && records.every((record) => object(record) && validTime(record) && text(record.key)
      && onlyKeys(record, ["key", "capturedTotalMonths", "capturedYear", ...(kind === "fellow" ? ["profile"] : ["lover", "progress"])])
      && (kind === "fellow" ? validFellow(record.profile) : validLover(record.lover) && validLoverProgress(record.progress)))
    && new Set(records.map((record) => record.key)).size === records.length;
  return validRecords(value.fellows, "fellow") && validRecords(value.lovers, "lover");
}

function clone<T>(value: T): T { return structuredClone(value); }
function fellowKey(profile: FellowProgressProfile): string {
  return `fellow:${profile.gender}:${getFellowName(profile)}`;
}
function loverKey(lover: LoverState): string {
  return `lover:${lover.gender}:${lover.type}:${getLoverName(lover)}`;
}

/** A card is an indivisible snapshot. Cash, papers and buffs never enter the archive. */
export function captureRewinderRelationships(state: GameState): RewinderRelationshipsSnapshot {
  const time = { capturedTotalMonths: state.totalMonths, capturedYear: state.year };
  return {
    ...time,
    advisor: {
      researchAccumulation: state.advisorProgressState.researchAccumulation,
      funding: state.advisorProgressState.funding,
      awards: clone(state.advisorProgressState.awards),
    },
    fellows: state.fellowProgressState.map((profile) => ({ ...time, key: fellowKey(profile),
      profile: { ...clone(profile), name: getFellowName(profile), academicYear: getFellowAcademicYear(state, profile),
        academicStartTotalMonths: state.totalMonths,
        // Keep the person's academic attainment without importing their papers or the player's coauthorships.
        initialResearchScore: getFellowResearchScore(state, profile),
        pendingHelpToPlayer: null, pendingHelpToFellow: null, pendingGuidanceFromAdvisor: null,
        monthlySalaryPaid: 0, monthlyPublicationCosts: undefined,
        affinityRewardedPaperIds: [],
      },
    })),
    lovers: state.loverState.active && state.loverProgressState.active ? [{ ...time,
      key: loverKey(state.loverState), lover: { ...clone(state.loverState), name: getLoverName(state.loverState) },
      progress: { ...clone(state.loverProgressState), pendingPaperHelp: null, sanDiscountMonths: [], giftCoupons: 0 },
    }] : [],
  };
}

/** Current cards replace old versions of the same person; absent people remain available. */
export function mergeRewinderRelationships(
  previous: RewinderRelationshipsSnapshot | undefined,
  current: RewinderRelationshipsSnapshot,
): RewinderRelationshipsSnapshot {
  if (!previous) return clone(current);
  return {
    ...clone(current),
    advisor: {
      funding: Math.max(previous.advisor.funding, current.advisor.funding),
      researchAccumulation: Math.max(previous.advisor.researchAccumulation, current.advisor.researchAccumulation),
      awards: [...new Map([...previous.advisor.awards, ...current.advisor.awards].map((award) => [award.id, clone(award)])).values()],
    },
    fellows: [...new Map([...previous.fellows, ...current.fellows].map((record) => [record.key, clone(record)])).values()],
    lovers: [...new Map([...previous.lovers, ...current.lovers].map((record) => [record.key, clone(record)])).values()],
  };
}

/** Existing grants keep their deadlines; historical titles do not pay their original grant again. */
export function applyRewinderAdvisor(state: GameState, record: RewinderRelationshipsSnapshot): GameState {
  const advisor = state.advisorProgressState;
  const historical = record.advisor;
  const calendarShift = getAcademicCalendarYear(state.year, state.month)
    - getAcademicCalendarYear(record.capturedYear, ((record.capturedTotalMonths - 1) % 12) + 1);
  const awards = advisor.awards.map((award) => ({ ...award }));
  for (const award of historical.awards) {
    if (awards.some((existing) => existing.id === award.id)) continue;
    awards.push({ ...award, awardedYear: award.awardedYear + calendarShift,
      startYear: award.startYear === null ? null : award.startYear + calendarShift,
      endYear: award.endYear === null ? null : award.endYear + calendarShift });
  }
  const funding = Math.max(advisor.funding, historical.funding);
  const next = { ...state, advisorProgressState: { ...advisor, funding, awards,
    researchAccumulation: Math.max(advisor.researchAccumulation, historical.researchAccumulation) } };
  return recordLabFinance(next, "other", funding - advisor.funding);
}

function shiftedHistory(history: FellowProgressProfile["activityHistory"], shift: number) {
  return history?.map((entry) => ({ ...entry, totalMonths: entry.totalMonths + shift }))
    .filter((entry) => entry.totalMonths > 0);
}

export interface RewinderRelationshipRestoreResult { state: GameState; restored: boolean; reason?: string }

/** Caller tracks consumed archive keys in the saved branch, preventing repeat restoration rewards. */
export function restoreRewinderRelationship(
  state: GameState,
  archive: RewinderRelationshipsSnapshot,
  key: string,
): RewinderRelationshipRestoreResult {
  const fail = (reason: string): RewinderRelationshipRestoreResult => ({ state, restored: false, reason });
  if (state.phase !== "playing") return fail("本局尚未开始或已经结束");
  const fellow = archive.fellows.find((record) => record.key === key);
  if (fellow) {
    if (state.fellowProgressState.some((profile) => fellowKey(profile) === key)) return fail("这位同学已在人际栏中");
    const relationship = syncRelationshipState(state.relationshipState, state.player.social);
    if (state.fellowProgressState.length >= Math.max(0, relationship.unlockedSlots - 1)) return fail("同学名额已满，请先停止一段合作");
    const addition = tryAddRelationship(relationship, fellow.profile.type);
    if (!addition.added) return fail("同学名额已满，请先停止一段合作");
    const shift = state.totalMonths - fellow.capturedTotalMonths;
    const id = `rewinder:${encodeURIComponent(key)}`;
    const profile: FellowProgressProfile = { ...clone(fellow.profile), id,
      startTotalMonths: fellow.profile.startTotalMonths + shift,
      academicStartTotalMonths: state.totalMonths,
      taskUsedThisMonth: true,
      pendingHelpToPlayer: null, pendingHelpToFellow: null, pendingGuidanceFromAdvisor: null,
      lastAdvancedTotalMonths: state.totalMonths, lastSalaryTotalMonths: state.totalMonths,
      lastProjectTotalMonths: state.totalMonths, lastSupportTotalMonths: state.totalMonths,
      lastAnnualGrowthTotalMonths: fellow.profile.lastAnnualGrowthTotalMonths === undefined ? undefined
        : fellow.profile.lastAnnualGrowthTotalMonths + shift,
      monthlySalaryPaid: 0, monthlyPublicationCosts: undefined, monthlyActivity: "从往世归来",
      monthlySupportActivity: undefined, activityHistory: shiftedHistory(fellow.profile.activityHistory, shift),
      affinityRewardedPaperIds: [],
    };
    return { restored: true, state: { ...state, relationshipState: addition.nextState,
      fellowProgressState: [...state.fellowProgressState, profile],
      fellowFinanceAccounts: { ...state.fellowFinanceAccounts, [id]: { name: getFellowName(profile), money: 0 } },
    } };
  }
  const lover = archive.lovers.find((record) => record.key === key);
  if (!lover) return fail("未找到这位历史人物");
  if (state.loverState.active || state.loverProgressState.active || state.relationshipState.loverCount > 0)
    return fail("已有恋人，请先结束当前关系");
  const shift = state.totalMonths - lover.capturedTotalMonths;
  const addition = tryAddRelationship(state.relationshipState, "lover");
  if (!addition.added) return fail("已有恋人，请先结束当前关系");
  return { restored: true, state: { ...state, relationshipState: addition.nextState,
    loverState: { ...clone(lover.lover), active: true,
      startTotalMonths: (lover.lover.startTotalMonths ?? lover.capturedTotalMonths) + shift },
    loverProgressState: { ...clone(lover.progress), active: true, canInteract: true,
      pendingPaperHelp: null, sanDiscountMonths: [], giftCoupons: 0,
      taskUsedThisMonth: true, lastDateTotalMonths: state.totalMonths, lastAdvancedTotalMonths: state.totalMonths,
      lastAnnualGrowthTotalMonths: lover.progress.lastAnnualGrowthTotalMonths === undefined ? undefined
        : lover.progress.lastAnnualGrowthTotalMonths + shift,
      monthlyActivity: "从往世归来", activityHistory: shiftedHistory(lover.progress.activityHistory, shift),
    },
  } };
}
