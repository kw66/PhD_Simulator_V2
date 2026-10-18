import { createAchievementRunProgress, type AchievementRunProgress } from "./v2-achievement-runtime-types";
import { ADVISOR_GRANTS, getAdvisorRankLabel, PROJECT_PROGRESS_MAX } from "./v2-advisor-progress";
import { createAiShopState } from "./v2-ai-shop";
import { getFellowAcademicYear, getFellowResearchScore } from "./v2-fellow-academic";
import { getFellowName, getFellowRoleLabel } from "./v2-fellow-progression";
import { createInternshipState } from "./v2-internship-system";
import { getFellowPublicationTotals } from "./v2-lab-talent";
import { createLoverProgressState } from "./v2-lover-progression";
import { createLoverState, getLoverName } from "./v2-lover-system";
import { getPlayerAttributeCap } from "./v2-player-attributes";
import { getUnlockedPaperSlotCount } from "./v2-paper-rules";
import { getGraduationScoreTarget } from "./v2-progression";
import { formatMoney } from "./v2-money";
import { createRelationshipState, syncRelationshipState } from "./v2-relationship-rules";
import { createShopState } from "./v2-shop-items";
import { createInitialThesisState } from "./v2-thesis-rules";
import type { Buff, CoffeeState, FellowFinanceAccount, FellowProgressProfile, GameState, Paper, PlayerStats } from "./v2-types";

export interface AcademicSelection {
  paperSource: "current" | "previous";
  coffeeSource?: "current" | "previous";
  personKeys: string[];
}
export interface AcademicDisplayCounters { labResearchGrowth: number; playerLedPublications: number; fellowLedPublications: number }
export interface AcademicFellow { profile: FellowProgressProfile; finance?: FellowFinanceAccount }
export interface AcademicPeople {
  advisor: { name: string | null; progress: GameState["advisorProgressState"] };
  lover: { state: GameState["loverState"]; progress: GameState["loverProgressState"] } | null;
  fellows: AcademicFellow[];
}
export interface AcademicYearRecord {
  year: number;
  totalMonths: number;
  identity: Pick<GameState, "playerName" | "degree" | "phdStartYear" | "graduationScoreTarget" | "maxMonths">;
  attributes: PlayerStats & { sanCap: number; researchCap: number; socialCap: number; favorCap: number };
  growth: Pick<GameState, "readingState" | "partTimeWorkCount" | "internshipCount" | "eventCounters"
    | "personalSpending" | "totalRandomEventCount" | "careerProgress" | "careerInterviewExperience">
    & { relationshipMentorshipStacks: number; strongBody: boolean; paperMasteryState: NonNullable<GameState["paperMasteryState"]>;
      publicationTalentState: NonNullable<GameState["publicationTalentState"]>; scholarshipState: GameState["scholarshipState"];
      achievementProgress: AchievementRunProgress; displayCounters: AcademicDisplayCounters };
  equipment: { bike: Pick<GameState["shopState"], "bikeOwned" | "bikeLevel" | "ebikeOwned" | "bikeSanSpent" | "bikeSanCapGains"> & { investment: number; giftDiscount: number };
    coffee: CoffeeState };
  permanentBuffs: Buff[];
  conference: { encounters: GameState["conferenceEncounterState"]; career: GameState["conferenceCareerState"] };
  papers: Pick<GameState, "papers" | "externalPublications" | "totalResearchScore" | "totalCitations" | "citationHistoryByYear">;
  people: AcademicPeople;
}
export interface AcademicArchive { version: 1; years: Partial<Record<number, AcademicYearRecord>>; attempts?: Record<number, number> }
export interface AcademicCandidate { key: string; kind: "advisor" | "lover" | "fellow"; name: string; detail: string; selected?: boolean }

const clone = <T>(value: T): T => structuredClone(value);
const number = (value: number | undefined): number => Number.isFinite(value) ? value! : 0;
const union = (a: readonly string[] = [], b: readonly string[] = []): string[] => [...new Set([...a, ...b])];
function maxima<T extends object>(current: T, previous?: Partial<T>): T {
  return Object.fromEntries(Object.keys(current).map(key => [key, Math.max(number(current[key as keyof T] as number), number(previous?.[key as keyof T] as number))])) as T;
}
function mergeNumericMaps(current: Record<string, number>, previous: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries(union(Object.keys(current), Object.keys(previous)).map(key => [key, Math.max(current[key] ?? 0, previous[key] ?? 0)]));
}
const DISPLAY_PREFIX = "rewinder-display:";
/** Offsets retain historical maxima while subsequent real contributions still increase the counter. */
export function getAcademicDisplayCounters(state: GameState): AcademicDisplayCounters {
  const publications = getFellowPublicationTotals(state);
  const counters = state.achievementProgress?.counters ?? {};
  return {
    labResearchGrowth: state.fellowProgressState.reduce((sum, person) => sum + (person.annualResearchGrowthTotal ?? 0), 0) + (counters[`${DISPLAY_PREFIX}labResearchGrowth`] ?? 0),
    playerLedPublications: publications.playerLed + (counters[`${DISPLAY_PREFIX}playerLedPublications`] ?? 0),
    fellowLedPublications: publications.fellowLed + (counters[`${DISPLAY_PREFIX}fellowLedPublications`] ?? 0),
  };
}
function published(papers: Paper[], totalMonths: number): Paper[] {
  return clone(papers.filter(paper => paper.status === "published")).map(paper => {
    if (paper.target !== null && paper.conferenceHandled !== true) {
      paper.conferenceHandled = true;
      paper.conferenceHandledAtTotalMonths = totalMonths;
    }
    delete paper.conferenceAvailableAtTotalMonths;
    return paper;
  });
}
/** Event ids contain timestamps and history lengths. Those are occurrence ids, not independent permanent rewards. */
function canonicalPermanentBuffs(items: readonly Buff[]): Buff[] {
  const groups = new Map<string, Buff>();
  for (const item of items) {
    if (item.timing !== "permanent" || item.remainingMonths !== null) continue;
    const match = /^event-(.+)-\d+-\d+-(permanent-(?:ideaBonus|experimentBonus|writingBonus)|extra-(?:idea|experiment|writing)|citation-penalty)$/.exec(item.id);
    // Random event choice serials are also occurrence ids (for example random-9-tech-4).
    const choice = match?.[1]?.replace(/-\d+$/, "");
    const id = match ? `academic-permanent:${choice}:${match[2]}:${item.relationshipId ?? ""}` : item.id;
    const buff = { ...clone(item), id };
    const previous = groups.get(id);
    if (!previous || !id.startsWith("academic-permanent:")) { groups.set(id, buff); continue; }
    for (const action of ["idea", "experiment", "writing"] as const) {
      const effect = buff.actionEffects?.[action];
      if (!effect) continue;
      previous.actionEffects ??= {};
      previous.actionEffects[action] ??= {};
      for (const field of ["bonus", "extraActions", "sanDelta"] as const) if (effect[field] !== undefined) {
        previous.actionEffects[action]![field] = (previous.actionEffects[action]![field] ?? 0) + effect[field]!;
      }
      if (effect.multiplier !== undefined) previous.actionEffects[action]!.multiplier = Math.max(0,
        (previous.actionEffects[action]!.multiplier ?? 1) + effect.multiplier - 1);
    }
    const penalty = buff.publicationEffects?.citationDebuffMultiplier;
    if (penalty !== undefined) previous.publicationEffects = { ...previous.publicationEffects,
      citationDebuffMultiplier: Math.max(0, (previous.publicationEffects?.citationDebuffMultiplier ?? 1) + penalty - 1) };
  }
  for (const buff of groups.values()) {
    if (!buff.id.startsWith("academic-permanent:")) continue;
    const parts = ([['idea', '想 idea'], ['experiment', '做实验'], ['writing', '写论文']] as const).flatMap(([action, label]) => {
      const effect = buff.actionEffects?.[action];
      return effect ? [effect.bonus !== undefined ? `${label} ${effect.bonus >= 0 ? "+" : ""}${formatMoney(effect.bonus)}分` : "",
        effect.extraActions !== undefined ? `${label} ${effect.extraActions >= 0 ? "+" : ""}${formatMoney(effect.extraActions)}次` : ""].filter(Boolean) : [];
    });
    if (parts.length) buff.name = `永久${parts.join(" · ")}`;
  }
  return [...groups.values()];
}
/** Explicit allow-list: transient events, scientific work in progress and ordinary equipment never enter an archive. */
export function captureAcademicYear(state: GameState): AcademicYearRecord {
  const achievements = clone(state.achievementProgress ?? createAchievementRunProgress());
  const rejections = Object.entries(achievements.counters).filter(([key]) => key.startsWith("research:rejected:")).map(([, value]) => value);
  achievements.counters["rewinder-rejections:total"] = rejections.reduce((sum, value) => sum + value, 0) + (achievements.counters["rewinder-rejections:offset"] ?? 0);
  achievements.counters["rewinder-rejections:single-max"] = Math.max(achievements.counters["rewinder-rejections:single-max"] ?? 0, 0, ...rejections);
  const fellows: AcademicFellow[] = state.fellowProgressState.map(profile => ({ profile: {
    ...clone(profile), name: getFellowName(profile), academicYear: getFellowAcademicYear(state, profile), academicStartTotalMonths: state.totalMonths,
    // Retained player publications will contribute again when this card is restored, so subtract those there.
    initialResearchScore: getFellowResearchScore(state, profile), pendingHelpToPlayer: null, pendingHelpToFellow: null,
    pendingGuidanceFromAdvisor: null, monthlyPublicationCosts: undefined, monthlySalaryPaid: 0,
  }, ...(state.fellowFinanceAccounts?.[profile.id] ? { finance: clone(state.fellowFinanceAccounts[profile.id]!) } : {}) }));
  const coffee = clone(state.coffeeState);
  coffee.coffeePurchaseCountThisMonth = 0;
  coffee.coffeeProducedCountThisMonth = 0;
  const advisor = clone(state.advisorProgressState);
  advisor.pendingGuidanceToPlayer = null;
  const lover = state.loverState.active && state.loverProgressState.active ? {
    state: clone(state.loverState), progress: { ...clone(state.loverProgressState), pendingPaperHelp: null, sanDiscountMonths: [] },
  } : null;
  return {
    year: state.year, totalMonths: state.totalMonths,
    identity: { playerName: state.playerName, degree: state.degree, phdStartYear: state.phdStartYear,
      graduationScoreTarget: state.graduationScoreTarget, maxMonths: state.maxMonths },
    attributes: { ...clone(state.player), sanCap: state.sanCap, researchCap: getPlayerAttributeCap(state, "research"),
      socialCap: getPlayerAttributeCap(state, "social"), favorCap: getPlayerAttributeCap(state, "favor") },
    growth: { readingState: clone(state.readingState), partTimeWorkCount: state.partTimeWorkCount, internshipCount: state.internshipCount,
      eventCounters: clone(state.eventCounters), personalSpending: state.personalSpending, totalRandomEventCount: state.totalRandomEventCount,
      careerProgress: clone(state.careerProgress), careerInterviewExperience: clone(state.careerInterviewExperience),
      relationshipMentorshipStacks: state.relationshipState.mentorshipStacks, strongBody: state.eventSupport.hasStrongBodyTalent,
      paperMasteryState: clone(state.paperMasteryState ?? { count: 0, rewardedPaperIds: [] }),
      publicationTalentState: clone(state.publicationTalentState ?? { claimedIds: [] }), scholarshipState: clone(state.scholarshipState),
      achievementProgress: achievements, displayCounters: getAcademicDisplayCounters(state) },
    equipment: { bike: { bikeOwned: state.shopState.bikeOwned, bikeLevel: state.shopState.bikeLevel, ebikeOwned: state.shopState.ebikeOwned,
      bikeSanSpent: state.shopState.bikeSanSpent, bikeSanCapGains: state.shopState.bikeSanCapGains, investment: state.shopState.investments.bike,
      giftDiscount: (state.shopState.investments as GameState["shopState"]["investments"] & { bikeGiftDiscount?: number }).bikeGiftDiscount ?? 0 }, coffee },
    permanentBuffs: canonicalPermanentBuffs(state.buffs),
    conference: { encounters: clone(state.conferenceEncounterState), career: clone(state.conferenceCareerState) },
    papers: { papers: published(state.papers, state.totalMonths), externalPublications: published(state.externalPublications, state.totalMonths),
      totalResearchScore: state.totalResearchScore, totalCitations: state.totalCitations, citationHistoryByYear: clone(state.citationHistoryByYear) },
    people: { advisor: { name: state.selectedAdvisorName, progress: advisor }, lover, fellows },
  };
}

export function buildAcademicCandidates(current: AcademicYearRecord, previous?: AcademicYearRecord): AcademicCandidate[] {
  const candidates: AcademicCandidate[] = [];
  for (const [source, record] of [["current", current], ["previous", previous]] as const) {
    if (!record) continue;
    const advisor = record.people.advisor;
    const grants = advisor.progress.awards.map(award => ADVISOR_GRANTS.find(grant => grant.id === award.id)?.name ?? award.id);
    candidates.push({ key: `${source}:advisor`, kind: "advisor", name: advisor.name ?? "导师",
      detail: `${getAdvisorRankLabel(advisor.progress)} · 科研积累 ${formatMoney(advisor.progress.researchAccumulation)} · 经费 ${formatMoney(advisor.progress.funding)}\n`
        + `横向 ${formatMoney(advisor.progress.horizontalProgress ?? 0)}/${PROJECT_PROGRESS_MAX} · 纵向 ${formatMoney(advisor.progress.verticalProgress ?? 0)}/${PROJECT_PROGRESS_MAX}`
        + (grants.length ? ` · 已获${grants.join("、")}` : " · 尚未获基金") });
    const lover = record.people.lover;
    if (lover) candidates.push({ key: `${source}:lover`, kind: "lover", name: getLoverName(lover.state),
      detail: `${lover.state.type === "smart" ? "聪慧" : "活泼"} · 科研 ${formatMoney(lover.progress.research)} · 亲密 ${formatMoney(lover.progress.intimacy)}\n`
        + ([["play", "玩耍"], ["study", "学习"], ["shopping", "购物"]] as const).map(([key, label]) => `${label} ${formatMoney(lover.progress.routes?.[key].progress ?? 0)}/100（${lover.progress.routes?.[key].completed ?? 0}次）`).join(" · ") });
    for (const fellow of record.people.fellows) candidates.push({ key: `${source}:fellow:${fellow.profile.id}`, kind: "fellow", name: getFellowName(fellow.profile),
      detail: `${getFellowRoleLabel(fellow.profile.type, fellow.profile.gender)} · ${fellow.profile.degree === "phd" ? "博士" : "硕士"}第${fellow.profile.academicYear ?? 1}年 · 科研分 ${formatMoney(fellow.profile.initialResearchScore ?? 0)}\n`
        + `科研 ${formatMoney(fellow.profile.research)} · 默契 ${formatMoney(fellow.profile.affinity)} · 协作 ${formatMoney(fellow.profile.taskProgress)}/${formatMoney(fellow.profile.taskMax)}` });
  }
  return candidates;
}

function mergeAchievement(current: AchievementRunProgress, previous: AchievementRunProgress): AchievementRunProgress {
  const counters = mergeNumericMaps(current.counters, previous.counters);
  // Continuity and temporal coordinates must come from one real attempt, never an independently maximized pair.
  for (const key of Object.keys(counters)) {
    if (/streak|last-year|^(?:research-)?actions:|^research:rejected:|^rewinder-rejections:offset$/.test(key)) {
      if (current.counters[key] === undefined) delete counters[key]; else counters[key] = current.counters[key]!;
    }
    if (key.startsWith(DISPLAY_PREFIX)) delete counters[key];
  }
  return { ...clone(current), counters, satisfied: union(current.satisfied, previous.satisfied),
    peaks: mergeNumericMaps(current.peaks, previous.peaks),
    minima: Object.fromEntries(union(Object.keys(current.minima), Object.keys(previous.minima)).map(key => [key, Math.min(current.minima[key] ?? Infinity, previous.minima[key] ?? Infinity)])),
    collections: {
      buffs: union(current.collections.buffs, previous.collections.buffs), products: union(current.collections.products, previous.collections.products),
      conferences: union(current.collections.conferences, previous.collections.conferences), locations: union(current.collections.locations, previous.collections.locations),
      directions: union(current.collections.directions, previous.collections.directions),
    },
  };
}
function mergeBuff(previous: Buff, current: Buff): Buff {
  const merge = (a: unknown, b: unknown, key = ""): unknown => {
    if (typeof a === "number" && typeof b === "number") return /(?:SanDelta|MoneyDelta|SanMultiplier|sanDelta|citationDebuffMultiplier)$/i.test(key) ? Math.min(a, b) : Math.max(a, b);
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      return Object.fromEntries(union(Object.keys(a), Object.keys(b)).map(k => [k, merge((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], k)]));
    }
    return b === undefined ? clone(a) : clone(b);
  };
  return merge(previous, current) as Buff;
}
function mergeConference(current: AcademicYearRecord["conference"], previous: AcademicYearRecord["conference"]): AcademicYearRecord["conference"] {
  const merge = <T extends object>(a: T, b: T): T => Object.fromEntries(union(Object.keys(a), Object.keys(b)).map(key => {
    const value = a[key as keyof T] ?? b[key as keyof T];
    return [key, typeof value === "number" ? Math.max(value, number(b[key as keyof T] as number))
      : typeof value === "boolean" ? value || b[key as keyof T] === true : clone(value)];
  })) as T;
  const encounters = merge(current.encounters, previous.encounters);
  encounters.jointTrainingReward = clone(current.encounters.jointTrainingReward ?? previous.encounters.jointTrainingReward);
  if (current.encounters.jointTrainingReward && previous.encounters.jointTrainingReward) encounters.jointTrainingReward = {
    ...clone(current.encounters.jointTrainingReward), ...maxima({ ideaBonus: current.encounters.jointTrainingReward.ideaBonus,
      writingBonus: current.encounters.jointTrainingReward.writingBonus, capBonus: current.encounters.jointTrainingReward.capBonus }, previous.encounters.jointTrainingReward),
  };
  encounters.bigBull = clone(current.encounters.bigBull ?? previous.encounters.bigBull);
  if (encounters.bigBull && previous.encounters.bigBull?.id === encounters.bigBull.id) {
    encounters.bigBull.cooperationCount = Math.max(encounters.bigBull.cooperationCount, previous.encounters.bigBull.cooperationCount);
    encounters.bigBull.level = Math.max(encounters.bigBull.level, previous.encounters.bigBull.level) as 0 | 1 | 2;
  }
  return { encounters, career: merge(current.career, previous.career) };
}
/** Maxima contain final absolute values; this function never adds the same year's rewards together. */
export function mergeAcademicYear(current: AcademicYearRecord, previous?: AcademicYearRecord, selection?: AcademicSelection): AcademicYearRecord {
  if (!previous || previous.year !== current.year) previous = clone(current);
  const choices = selection ?? { paperSource: "current", personKeys: buildAcademicCandidates(current).map(person => person.key) };
  const selected = choices.personKeys.map(key => ({ key, source: key.startsWith("previous:") ? previous : current }));
  const advisorSource = selected.find(({ key }) => key.endsWith(":advisor"))?.source ?? current;
  const loverSource = selected.find(({ key }) => key.endsWith(":lover"))?.source;
  const fellows: AcademicFellow[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  for (const { key, source } of selected) {
    const fellow = source.people.fellows.find(person => key === `${source === previous ? "previous" : "current"}:fellow:${person.profile.id}`);
    if (!fellow || fellows.length >= 4) continue;
    const identity = `${fellow.profile.gender}:${getFellowName(fellow.profile)}`;
    if (seen.has(identity) || seenIds.has(fellow.profile.id)) continue;
    seen.add(identity); seenIds.add(fellow.profile.id); fellows.push(clone(fellow));
  }
  const people = { advisor: clone(advisorSource.people.advisor), lover: clone(loverSource?.people.lover ?? null), fellows };
  const growth = current.growth, old = previous.growth;
  const coffeeSource = choices.coffeeSource === "previous" ? previous : current;
  const fallbackCoffee = coffeeSource === current ? previous : current;
  const coffee = clone(coffeeSource.equipment.coffee.machineOwned ? coffeeSource.equipment.coffee : fallbackCoffee.equipment.coffee);
  coffee.machineTrackedCoffeeCount = Math.max(current.equipment.coffee.machineTrackedCoffeeCount, previous.equipment.coffee.machineTrackedCoffeeCount);
  const buffs = new Map<string, Buff>();
  for (const [record, source] of [[previous, "previous"], [current, "current"]] as const) for (const buff of canonicalPermanentBuffs(record.permanentBuffs)) {
    if (buff.relationshipId && !choices.personKeys.includes(`${source}:${buff.relationshipId === "advisor" || buff.relationshipId === "lover" ? buff.relationshipId : `fellow:${buff.relationshipId}`}`)) continue;
    buffs.set(buff.id, buffs.has(buff.id) ? mergeBuff(buffs.get(buff.id)!, buff) : clone(buff));
  }
  const identity = clone(current.identity.degree === "phd" ? current.identity : previous.identity.degree === "phd" ? previous.identity : current.identity);
  const currentBike = current.equipment.bike, previousBike = previous.equipment.bike;
  const bikeAsset = !currentBike.bikeOwned && previousBike.bikeOwned || previousBike.bikeOwned && (previousBike.bikeLevel > currentBike.bikeLevel
    || previousBike.bikeLevel === currentBike.bikeLevel && previousBike.investment > currentBike.investment) ? previousBike : currentBike;
  return { ...clone(current), identity, attributes: maxima(current.attributes, previous.attributes), people,
    permanentBuffs: canonicalPermanentBuffs([...buffs.values()]), conference: mergeConference(current.conference, previous.conference),
    papers: clone(choices.paperSource === "previous" ? previous.papers : current.papers),
    equipment: { coffee, bike: { ...clone(bikeAsset), ...maxima({ bikeSanSpent: current.equipment.bike.bikeSanSpent,
      bikeSanCapGains: current.equipment.bike.bikeSanCapGains }, previous.equipment.bike),
      ebikeOwned: false } },
    growth: { ...clone(growth), ...maxima({ partTimeWorkCount: growth.partTimeWorkCount, internshipCount: growth.internshipCount,
      personalSpending: growth.personalSpending, totalRandomEventCount: growth.totalRandomEventCount, relationshipMentorshipStacks: growth.relationshipMentorshipStacks }, old),
      readingState: maxima(growth.readingState, old.readingState), eventCounters: maxima(growth.eventCounters, old.eventCounters),
      careerProgress: maxima(growth.careerProgress, old.careerProgress), careerInterviewExperience: maxima(growth.careerInterviewExperience, old.careerInterviewExperience),
      strongBody: growth.strongBody || old.strongBody, displayCounters: maxima(growth.displayCounters, old.displayCounters),
      paperMasteryState: { count: Math.max(growth.paperMasteryState.count, old.paperMasteryState.count), rewardedPaperIds: union(growth.paperMasteryState.rewardedPaperIds, old.paperMasteryState.rewardedPaperIds) },
      publicationTalentState: { claimedIds: union(growth.publicationTalentState.claimedIds, old.publicationTalentState.claimedIds) },
      scholarshipState: { ...clone(growth.scholarshipState), awardCount: Math.max(growth.scholarshipState.awardCount ?? 0, old.scholarshipState.awardCount ?? 0),
        claimedPaperIds: union(growth.scholarshipState.claimedPaperIds, old.scholarshipState.claimedPaperIds),
        scoreBaseline: Math.max(growth.scholarshipState.scoreBaseline, old.scholarshipState.scoreBaseline),
        lastAwardYear: Math.max(growth.scholarshipState.lastAwardYear ?? 0, old.scholarshipState.lastAwardYear ?? 0) || null },
      achievementProgress: mergeAchievement(growth.achievementProgress, old.achievementProgress) },
  };
}

/** Restore the settled August checkpoint. The caller advances to September exactly once. */
export function restoreAcademicYear(base: GameState, record: AcademicYearRecord): GameState {
  const r = clone(record), a = r.attributes, g = r.growth;
  const shop = createShopState();
  Object.assign(shop, { bikeOwned: r.equipment.bike.bikeOwned, bikeLevel: r.equipment.bike.bikeLevel, ebikeOwned: false,
    bikeSanSpent: r.equipment.bike.bikeSanSpent, bikeSanCapGains: r.equipment.bike.bikeSanCapGains });
  const investments = { ...shop.investments, bike: r.equipment.bike.investment, bikeGiftDiscount: r.equipment.bike.giftDiscount };
  shop.investments = investments;
  const papers = r.papers;
  const publishedIds = union(papers.papers.map(paper => paper.id), papers.externalPublications.map(paper => paper.id));
  const fellows = r.people.fellows.map(({ profile }) => {
    const retainedScore = getFellowResearchScore({ papers: papers.papers, externalPublications: papers.externalPublications, fellowPapers: [] }, { ...profile, initialResearchScore: 0 });
    return { ...profile, initialResearchScore: Math.max(0, (profile.initialResearchScore ?? 0) - retainedScore),
      affinityRewardedPaperIds: union(profile.affinityRewardedPaperIds, publishedIds),
      pendingHelpToPlayer: null, pendingHelpToFellow: null, pendingGuidanceFromAdvisor: null };
  });
  const relationship = syncRelationshipState({ ...createRelationshipState(), mentorshipStacks: g.relationshipMentorshipStacks,
    advisorCount: 1, loverCount: r.people.lover ? 1 : 0, occupiedSlots: fellows.length,
    seniorCount: fellows.filter(p => p.type === "senior").length, peerCount: fellows.filter(p => p.type === "peer").length,
    juniorCount: fellows.filter(p => p.type === "junior").length }, a.social);
  const advisor = r.people.advisor.progress;
  advisor.countedPaperIds = union(advisor.countedPaperIds, publishedIds);
  const next: GameState = { ...base, ...r.identity, ...papers, phase: "playing", year: r.year, month: 12, totalMonths: r.totalMonths,
    selectedRoleId: "rewinder", setupSelectedRoleId: "rewinder", selectedAdvisorName: r.people.advisor.name,
    graduationScoreTarget: getGraduationScoreTarget(r.identity.degree, r.people.advisor.name),
    player: { san: a.san, research: a.research, social: a.social, favor: a.favor, money: a.money }, sanCap: a.sanCap,
    researchCapacityState: { baseCap: 20, jointTrainingCitationCapBonus: 0, otherCapBonus: a.researchCap - 20 },
    roleTalents: { ...base.roleTalents, levels: { ...base.roleTalents?.levels }, initialized: true,
      capBonuses: { ...base.roleTalents?.capBonuses, social: a.socialCap - 20, favor: a.favorCap - 20 } },
    readingState: g.readingState, partTimeWorkCount: g.partTimeWorkCount, internshipCount: g.internshipCount, eventCounters: g.eventCounters,
    personalSpending: g.personalSpending, totalRandomEventCount: g.totalRandomEventCount, careerProgress: g.careerProgress, careerInterviewExperience: g.careerInterviewExperience,
    scholarshipState: g.scholarshipState, publicationTalentState: g.publicationTalentState,
    paperMasteryState: { ...g.paperMasteryState, rewardedPaperIds: union(g.paperMasteryState.rewardedPaperIds, publishedIds) },
    achievementProgress: g.achievementProgress, shopState: shop, aiShopState: createAiShopState(), coffeeState: r.equipment.coffee,
    buffs: r.permanentBuffs, conferenceEncounterState: r.conference.encounters, conferenceCareerState: r.conference.career,
    internshipState: createInternshipState(), conferenceAttendancePlans: [], relationshipState: relationship, advisorProgressState: advisor,
    loverState: r.people.lover?.state ?? createLoverState(), loverProgressState: r.people.lover?.progress ?? createLoverProgressState(),
    fellowProgressState: fellows, fellowFinanceAccounts: Object.fromEntries(r.people.fellows.filter(person => person.finance).map(person => [person.profile.id, { ...person.finance!, aiSlot: undefined, aiSubscribedTotalMonths: undefined }])),
    fellowPapers: [], fellowResearchLastTotalMonths: r.totalMonths, paperSlotsUnlocked: getUnlockedPaperSlotCount(a.research), selectedPaperId: null,
    eventQueue: [], eventHistory: [], log: [], ending: null, endingCause: undefined, pendingRandomEvents: [], pendingRunStatistics: [],
    actionState: { used: 0, limit: 1, aiResearchBonusUsed: false }, thesis: createInitialThesisState(),
    eventSupport: { hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: g.strongBody, aiCostsCoveredUntilTotalMonths: null },
    careerOffers: {}, careerPreparedMonths: {}, careerLastRecruitmentTotalMonths: null, labFinanceLedger: undefined, sanHistory: [],
  };
  const totals = getFellowPublicationTotals(next);
  const actual: AcademicDisplayCounters = { playerLedPublications: totals.playerLed, fellowLedPublications: totals.fellowLed,
    labResearchGrowth: fellows.reduce((sum, person) => sum + (person.annualResearchGrowthTotal ?? 0), 0) };
  for (const key of Object.keys(actual) as (keyof AcademicDisplayCounters)[]) {
    next.achievementProgress!.counters[`${DISPLAY_PREFIX}${key}`] = Math.max(0, g.displayCounters[key] - actual[key]);
  }
  // A selected publication bundle may come from another attempt. Rebase its per-paper counters before observation sees it.
  for (const key of Object.keys(next.achievementProgress!.counters)) if (key.startsWith("research:rejected:")) delete next.achievementProgress!.counters[key];
  let rejectionSum = 0;
  for (const paper of [...next.papers, ...next.externalPublications]) {
    if (paper.nonFirstAuthor === true || paper.leadAuthorId && paper.leadAuthorId !== "player") continue;
    const count = Math.max(0, paper.rejectionCount ?? 0);
    next.achievementProgress!.counters[`research:rejected:${paper.id}`] = count;
    rejectionSum += count;
  }
  next.achievementProgress!.counters["rewinder-rejections:offset"] = Math.max(0, (g.achievementProgress.counters["rewinder-rejections:total"] ?? 0) - rejectionSum);
  return next;
}

export { normalizeAcademicArchive } from "./v2-rewinder-academic-validation";
