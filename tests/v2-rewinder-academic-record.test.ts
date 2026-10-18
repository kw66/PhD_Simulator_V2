import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getFellowResearchScore } from "../src/core/v2-fellow-academic";
import { activateLover } from "../src/core/v2-lover-system";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { applyPaperMastery } from "../src/core/v2-paper-mastery";
import { observeResearchAchievements } from "../src/core/v2-achievement-research";
import { getGiftAwareShopSellPrice } from "../src/core/v2-lover-gift";
import { captureAcademicYear, mergeAcademicYear, restoreAcademicYear, normalizeAcademicArchive,
  buildAcademicCandidates, getAcademicDisplayCounters } from "../src/core/v2-rewinder-academic-record";
import type { GameState, Paper } from "../src/core/v2-types";

function state(): GameState {
  const result = createStartedGameState("rewinder");
  return { ...result, year: 1, month: 12, totalMonths: 12, selectedAdvisorName: "青年导师", playerName: "林同学",
    eventQueue: [], player: { san: 25, research: 12, social: 18, favor: 10, money: 50 }, sanCap: 30 };
}
function paper(id: string, overrides: Partial<Paper> = {}): Paper {
  return { id, title: `Paper ${id}`, topicId: "topic", topicLabel: "方向", heatMultiplier: 1, prepublicationDecayRate: 0,
    idea: 20, experiment: 20, writing: 20, status: "published", target: "A", reviewMonthsLeft: 0,
    submittedIdea: 20, submittedExperiment: 20, submittedWriting: 20, conferenceHandled: false,
    publication: { citations: 10, effectiveScore: 60, citationDebuffMultiplier: 1, monthsSincePublish: 2 }, ...overrides };
}
function fellow(id: string, name = id) {
  return { ...createCustomFellowProgressProfile({ type: "peer", gender: "female", startTotalMonths: 2, research: 10, affinity: 10, name }), id };
}
function archive(s: GameState) { return captureAcademicYear(s); }

describe("academic-year record", () => {
  it("clears transient work, ordinary equipment and active internships while retaining permanent earned state", () => {
    const s = state();
    s.papers = [paper("accepted"), paper("draft", { status: "draft" }), paper("reviewing", { status: "reviewing" })];
    s.totalCitations = 10; s.totalResearchScore = 6;
    s.shopState = { ...s.shopState, gpuLevel: 5, chairOwned: true, keyboardOwned: true, ebikeOwned: true,
      bikeOwned: true, bikeLevel: 3, bikeSanSpent: 27.5, bikeSanCapGains: 2 };
    s.coffeeState = { ...s.coffeeState, machineOwned: true, machineUpgrade: "advanced", machineTrackedCoffeeCount: 36, coffeePurchaseCountThisMonth: 1 };
    s.internshipCount = 3; s.internshipState = { active: true, remainingMonths: 4, experimentMultiplier: 2 };
    s.buffs = [{ id: "permanent", name: "积累", source: "天赋", timing: "permanent", remainingMonths: null, actionEffects: { idea: { bonus: 3 } } },
      { id: "temporary", name: "临时", source: "事件", timing: "monthly", remainingMonths: 3 }];
    s.conferenceEncounterState.bigBullCooperation = true;
    const record = archive(s);
    const restored = restoreAcademicYear(state(), record);
    expect(restored.papers.map(p => p.id)).toEqual(["accepted"]);
    expect(restored.papers[0]).toMatchObject({ conferenceHandled: true, conferenceHandledAtTotalMonths: 12 });
    expect(restored.papers[0]!.publication!.citations).toBe(10);
    expect(restored.shopState).toMatchObject({ gpuLevel: 0, chairOwned: false, keyboardOwned: false, ebikeOwned: false,
      bikeOwned: true, bikeLevel: 3, bikeSanSpent: 27.5, bikeSanCapGains: 2 });
    expect(restored.coffeeState).toMatchObject({ machineOwned: true, machineUpgrade: "advanced", machineTrackedCoffeeCount: 36, coffeePurchaseCountThisMonth: 0 });
    expect(restored.internshipState.active).toBe(false); expect(restored.internshipCount).toBe(3);
    expect(restored.buffs.map(buff => buff.id)).toEqual(["permanent"]);
    expect(restored.conferenceEncounterState.bigBullCooperation).toBe(true);
    expect(restored).toMatchObject({ year: 1, month: 12, totalMonths: 12, eventQueue: [], conferenceAttendancePlans: [], fellowPapers: [] });
    expect(normalizeAcademicArchive({ version: 1, years: { 1: record } }).years[1]).toEqual(record);
  });

  it("merges independent end values but chooses one full publication set and whole person versions", () => {
    const old = state(), current = state();
    old.player.research = 18; old.player.money = 80; old.readingState.readCount = 27; old.internshipCount = 2;
    current.player.social = 20; current.internshipCount = 4;
    old.papers = [paper("old")]; old.totalCitations = 100; old.totalResearchScore = 6;
    current.papers = [paper("new1"), paper("new2")]; current.totalCitations = 20; current.totalResearchScore = 12;
    old.fellowProgressState = [fellow("old-fellow", "旧同学")]; current.fellowProgressState = [fellow("new-fellow", "新同学")];
    old.advisorProgressState.funding = 80; current.advisorProgressState.researchAccumulation = 100;
    const merged = mergeAcademicYear(archive(current), archive(old), { paperSource: "previous", personKeys: ["previous:advisor", "current:fellow:new-fellow"] });
    expect(merged.attributes).toMatchObject({ research: 18, social: 20, money: 80 });
    expect(merged.growth).toMatchObject({ readingState: { readCount: 27 }, internshipCount: 4 });
    expect(merged.papers).toMatchObject({ totalCitations: 100, totalResearchScore: 6 });
    expect(merged.papers.papers.map(p => p.id)).toEqual(["old"]);
    expect(merged.people.advisor.progress).toMatchObject({ funding: 80, researchAccumulation: 20 });
    expect(merged.people.fellows.map(p => p.profile.id)).toEqual(["new-fellow"]);
  });

  it("honors card deselection even on the first archive, while a later replay cannot mutate its source", () => {
    const s = state(); s.fellowProgressState = [fellow("one")];
    s.loverState = activateLover("smart", 4, "female");
    s.loverProgressState = { ...createLoverProgressState(), active: true, giftCoupons: 3, sanDiscountMonths: [13] };
    const record = archive(s);
    expect(buildAcademicCandidates(record).map(p => p.kind)).toEqual(["advisor", "lover", "fellow"]);
    const merged = mergeAcademicYear(record, undefined, { paperSource: "current", personKeys: ["current:advisor"] });
    expect(merged.people.fellows).toEqual([]); expect(merged.people.lover).toBe(null);
    const a = restoreAcademicYear(state(), record); a.player.research = 99;
    expect(restoreAcademicYear(state(), record).player.research).toBe(12);
    expect(record.attributes.research).toBe(12);
    expect(restoreAcademicYear(state(), record).loverProgressState).toMatchObject({ giftCoupons: 3, sanDiscountMonths: [] });
  });

  it("preserves coffee ownership and route choice, bike fractions and a permanently reached doctorate", () => {
    const old = state(), current = state();
    old.degree = "phd"; old.maxMonths = 70; old.phdStartYear = 1;
    old.coffeeState = { ...old.coffeeState, machineOwned: true, machineUpgrade: "advanced", machineTrackedCoffeeCount: 35 };
    old.conferenceCareerState.hasInternshipExperience = true;
    current.coffeeState.machineTrackedCoffeeCount = 42;
    old.shopState = { ...old.shopState, bikeOwned: true, bikeLevel: 2, bikeSanSpent: 29.5, bikeSanCapGains: 2 };
    const merged = mergeAcademicYear(archive(current), archive(old));
    expect(merged.identity).toMatchObject({ degree: "phd", maxMonths: 70, phdStartYear: 1 });
    expect(merged.conference.career.hasInternshipExperience).toBe(true);
    expect(merged.equipment.coffee).toMatchObject({ machineOwned: true, machineUpgrade: "advanced", machineTrackedCoffeeCount: 42 });
    expect(merged.equipment.bike).toMatchObject({ bikeOwned: true, bikeSanSpent: 29.5, bikeSanCapGains: 2 });
    current.coffeeState.machineOwned = true; current.coffeeState.machineUpgrade = "manual";
    expect(mergeAcademicYear(archive(current), archive(old), { paperSource: "current", personKeys: ["current:advisor"], coffeeSource: "previous" }).equipment.coffee.machineUpgrade).toBe("advanced");
  });

  it("preserves fellow attainment once and prevents old publications rewarding mastery or rapport again", () => {
    const s = state(); const f = fellow("partner"); f.initialResearchScore = 7;
    s.fellowProgressState = [f];
    s.externalPublications = [paper("coauthored", { leadAuthorId: f.id, nonFirstAuthor: true, collaborators: [{ id: "player", name: "我" }] })];
    s.fellowPapers = [paper("fellow-only", { leadAuthorId: f.id, nonFirstAuthor: true })];
    s.papers = [paper("mine")]; s.paperMasteryState = { count: 5, rewardedPaperIds: ["other"] };
    s.buffs = [{ id: "paper-mastery", name: "论文熟手", source: "论文熟手", timing: "permanent", remainingMonths: null, actionEffects: { idea: { bonus: 2 }, experiment: { bonus: 2 }, writing: { bonus: 1 } } }];
    const expected = getFellowResearchScore(s, f);
    const restored = restoreAcademicYear(state(), archive(s));
    expect(getFellowResearchScore(restored, restored.fellowProgressState[0]!)).toBe(expected);
    expect(restored.fellowProgressState[0]!.affinityRewardedPaperIds).toEqual(expect.arrayContaining(["coauthored", "mine"]));
    expect(applyPaperMastery(restored).paperMasteryState!.count).toBe(5);
    expect(archive(restored).people.fellows[0]!.profile.initialResearchScore).toBe(expected);
  });

  it("keeps maximum rejection totals without adding different attempts and preserves genuine later growth", () => {
    const old = state(), current = state();
    old.achievementProgress = { satisfied: [], counters: { "research:rejected:a": 4 }, sets: { "research:submissions": ["a"] }, peaks: {}, minima: {}, collections: { buffs: [], products: [], conferences: [], locations: [], directions: [] } };
    current.achievementProgress = { ...structuredClone(old.achievementProgress), counters: { "research:rejected:b": 3 }, sets: { "research:submissions": ["b"] } };
    const merged = mergeAcademicYear(archive(current), archive(old));
    expect(merged.growth.achievementProgress.counters["rewinder-rejections:total"]).toBe(4);
    expect(merged.growth.achievementProgress.sets["research:submissions"]).toEqual(["b"]);
    const restored = restoreAcademicYear(state(), merged);
    expect(restored.achievementProgress!.counters["rewinder-rejections:offset"]).toBe(4);
    restored.achievementProgress!.counters["research:rejected:new"] = 2;
    expect(archive(restored).growth.achievementProgress.counters["rewinder-rejections:total"]).toBe(6);
  });

  it("rebases rejection evidence to the selected publication bundle before observing the new chapter", () => {
    const old = state(), current = state();
    old.papers = [paper("A", { rejectionCount: 4 })]; current.papers = [paper("B", { rejectionCount: 3 })];
    observeResearchAchievements(old, old, old.achievementProgress ??= { satisfied: [], counters: {}, sets: {}, peaks: {}, minima: {}, collections: { buffs: [], products: [], conferences: [], locations: [], directions: [] } });
    observeResearchAchievements(current, current, current.achievementProgress ??= structuredClone(old.achievementProgress));
    current.achievementProgress.counters = { "research:rejected:B": 3 };
    const record = mergeAcademicYear(archive(current), archive(old), { paperSource: "previous", personKeys: ["current:advisor"] });
    const restored = restoreAcademicYear(state(), record);
    observeResearchAchievements(state(), restored, restored.achievementProgress!);
    expect(restored.achievementProgress!.counters["rewinder-rejections:offset"]).toBe(0);
    expect(restored.achievementProgress!.counters["research:rejected:A"]).toBe(4);
    expect(restored.achievementProgress!.counters["research:rejected:B"]).toBeUndefined();
    expect(archive(restored).growth.achievementProgress.counters["rewinder-rejections:total"]).toBe(4);
  });

  it("retains display maxima and adds only actual new publications after restore", () => {
    const s = state(); s.fellowProgressState = [fellow("f")];
    s.papers = [paper("one", { collaborators: [{ id: "f", name: "f" }] })];
    const record = archive(s); record.growth.displayCounters.playerLedPublications = 5;
    const restored = restoreAcademicYear(state(), record);
    expect(getAcademicDisplayCounters(restored).playerLedPublications).toBe(5);
    restored.papers.push(paper("two", { collaborators: [{ id: "f", name: "f" }] }));
    expect(getAcademicDisplayCounters(restored).playerLedPublications).toBe(6);
  });

  it("rejects malformed nested state and impossible degree/year records, without dropping valid independent years", () => {
    const good = archive(state());
    const broken = structuredClone(good); (broken.people.advisor.progress as unknown as { funding: string }).funding = "free";
    expect(normalizeAcademicArchive({ version: 1, years: { 1: broken } }).years).toEqual({});
    const wrongYear = { ...good, year: 4, totalMonths: 48 };
    expect(normalizeAcademicArchive({ version: 1, years: { 1: good, 4: wrongYear }, attempts: { 1: 3, 2: "bad" } })).toEqual({ version: 1, years: { 1: good }, attempts: { 1: 3 } });
    const duplicate = structuredClone(good); duplicate.papers.papers = [paper("same"), paper("same")];
    expect(normalizeAcademicArchive({ version: 1, years: { 1: duplicate } }).years).toEqual({});
    expect(normalizeAcademicArchive({ years: { 1: good } }).years).toEqual({});
  });

  it("accepts the real year-two PhD transfer whose degree begins in year three", () => {
    const s = state(); s.year = 2; s.totalMonths = 24; s.degree = "phd"; s.phdStartYear = 3; s.maxMonths = 70;
    const record = archive(s);
    const result = normalizeAcademicArchive({ version: 1, years: { 2: record } }).years[2]!;
    expect(result).toEqual(record);
    expect(restoreAcademicYear(state(), result)).toMatchObject({ degree: "phd", phdStartYear: 3, year: 2, month: 12, totalMonths: 24, maxMonths: 70 });
  });

  it("takes the maximum semantic permanent reward without stacking event occurrence ids across attempts", () => {
    const old = state(), current = state();
    const eventBuff = (id: string, bonus: number) => ({ id, name: "永久想idea", source: "联合培养", timing: "permanent" as const, remainingMonths: null,
      actionEffects: { idea: { bonus } } });
    old.buffs = [eventBuff("event-joint-training-accept-9-21-permanent-ideaBonus", 5)];
    current.buffs = [eventBuff("event-joint-training-accept-10-33-permanent-ideaBonus", 6)];
    const merged = mergeAcademicYear(archive(current), archive(old));
    expect(merged.permanentBuffs).toHaveLength(1);
    expect(merged.permanentBuffs[0]!.actionEffects!.idea!.bonus).toBe(6);
    expect(mergeAcademicYear(archive(current), merged).permanentBuffs[0]!.actionEffects!.idea!.bonus).toBe(6);
    const s = state(); s.buffs = [eventBuff("event-random-9-tech-1-3-4-permanent-ideaBonus", 1), eventBuff("event-random-9-tech-2-9-17-permanent-ideaBonus", 1)];
    const record = archive(s);
    expect(record.permanentBuffs).toHaveLength(1);
    expect(record.permanentBuffs[0]!.actionEffects!.idea!.bonus).toBe(2);
    const restored = restoreAcademicYear(state(), record);
    restored.buffs.push(eventBuff("event-random-9-tech-3-16-8-permanent-ideaBonus", 1));
    expect(archive(restored).permanentBuffs[0]!.actionEffects!.idea!.bonus).toBe(3);
  });

  it("keeps a gifted bicycle's resale discount with the selected asset", () => {
    const s = state(); s.shopState.bikeOwned = true; s.shopState.bikeLevel = 4;
    const investments = { ...s.shopState.investments, bike: 0, bikeGiftDiscount: 24 };
    s.shopState.investments = investments;
    const before = getGiftAwareShopSellPrice(s, "bike");
    const restored = restoreAcademicYear(state(), mergeAcademicYear(archive(state()), archive(s)));
    expect(restored.shopState.bikeLevel).toBe(4);
    expect(getGiftAwareShopSellPrice(restored, "bike")).toBe(before);
    expect(normalizeAcademicArchive({ version: 1, years: { 1: archive(restored) } }).years[1]).toBeDefined();
  });
});
