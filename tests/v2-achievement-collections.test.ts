import { describe, expect, it } from "vitest";
import { COLLECTION_REQUIREMENTS, getCollectorAchievementKey, getCurrentAchievementBuffIds, getMissingAchievementCollectionItems, observeAchievementCollections } from "../src/core/v2-achievement-collections";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { createInitialState } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createAiShopState, getAiModelTimeline } from "../src/core/v2-ai-shop";
import type { Buff, ConferenceAttendancePlan, GameState, Paper } from "../src/core/v2-types";

const publishedPaper = (overrides: Partial<Paper> = {}): Paper => ({ ...createDraftPaper(1, 0, () => 0), status: "published", target: "A", submittedYear: 1, submittedMonth: 3, ...overrides });
const observed = (next: GameState, prev = createInitialState()) => {
  const run = createAchievementRunProgress(); observeAchievementCollections(prev, next, run); return run;
};

describe("achievement collections", () => {
  it("uses a complete static unique catalog including alternated venues and named VALSE cities", () => {
    for (const list of Object.values(COLLECTION_REQUIREMENTS)) expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
    expect(COLLECTION_REQUIREMENTS.conferences).toHaveLength(37);
    expect(COLLECTION_REQUIREMENTS.conferences.map((item) => item.id)).toEqual(expect.arrayContaining(["ICCV", "ECCV", "CVPR", "3DV"]));
    expect(COLLECTION_REQUIREMENTS.locations.map((item) => item.id)).toEqual(expect.arrayContaining(["重庆", "珠海", "武汉"]));
    expect(COLLECTION_REQUIREMENTS.locations.map((item) => item.id)).not.toContain("外地");
    expect(COLLECTION_REQUIREMENTS.products.filter((item) => item.id.startsWith("ai:"))).toHaveLength(6);
    expect(COLLECTION_REQUIREMENTS.directions.length).toBeGreaterThan(20);
  });

  it("collects published coauthored conferences and directions without requiring attendance", () => {
    const next = createInitialState();
    next.externalPublications = [publishedPaper({ nonFirstAuthor: true })];
    next.papers = [publishedPaper({ id: "pending", status: "reviewing", submittedMonth: 1 }), publishedPaper({ id: "nature", journalTarget: "nature", submittedMonth: 2, topicId: "object-detection" })];
    const run = observed(next);
    expect(run.collections.conferences).toEqual(["CVPR"]);
    expect(run.collections.directions).toEqual(expect.arrayContaining([next.externalPublications[0]!.topicId, "object-detection"]));
    expect(run.collections.locations).toEqual([]);
  });

  it("retains sold products and upgrades, merging AI versions into one provider", () => {
    const prev = createInitialState(); const next = structuredClone(prev);
    prev.shopState.gpuLevel = 4; next.shopState.gpuLevel = 5;
    prev.shopState.chairOwned = true; prev.shopState.chairUpgrade = "massage";
    prev.aiShopState.subscriptions.gpt = { ...prev.aiShopState.subscriptions.gpt, active: true, modelId: "gpt-4o" };
    next.aiShopState.subscriptions.gpt = { ...next.aiShopState.subscriptions.gpt, active: true, modelId: "gpt-5" };
    next.coffeeState.coffeePurchaseCountThisMonth = 1;
    const run = observed(next, prev);
    expect(run.collections.products).toEqual(expect.arrayContaining(["gpu:4", "gpu:5", "chair", "chair-massage", "coffee", "ai:gpt"]));
    expect(run.collections.products.filter((id) => id.startsWith("ai:"))).toEqual(["ai:gpt"]);
    expect(run.collections.products).not.toContain("gpu:1");
  });

  it("normalizes repeated effects and ignores expired, neutral and debug-only buffs", () => {
    const next = createInitialState();
    const buff: Buff = { id: "read-paper-idea-1", name: "阅读收获", source: "看论文", timing: "next-action", remainingMonths: null, actionEffects: { idea: { bonus: 3 } } };
    next.buffs = [buff, { ...buff, id: "read-paper-idea-2", actionEffects: { idea: { bonus: 9 } } },
      { ...buff, id: "expired", remainingMonths: 0, actionEffects: { writing: { bonus: 3 } } },
      { ...buff, id: "debug-test", actionEffects: { experiment: { bonus: 3 } } },
      { ...buff, id: "neutral", actionEffects: { writing: { multiplier: 1 } } }];
    expect(observed(next).collections.buffs).toEqual(["action:idea:bonus"]);
    const run = createAchievementRunProgress();
    observeAchievementCollections(createInitialState(), next, run, "debug-add-all-buffs");
    expect(run.collections.buffs).toEqual([]);
  });

  it("obtains all action, reading and automatic-score effect kinds from real released AI models", () => {
    const run = createAchievementRunProgress();
    for (const model of getAiModelTimeline()) {
      const state = createInitialState();
      state.aiShopState = createAiShopState();
      state.aiShopState.subscriptions[model.slot] = { ...state.aiShopState.subscriptions[model.slot], active: true, modelId: model.id };
      observeAchievementCollections(createInitialState(), state, run);
    }
    const aiEffectRequirements = COLLECTION_REQUIREMENTS.buffs.filter((item) => /^(action:|reading:|paper-polish|relationship:san)/.test(item.id));
    expect(aiEffectRequirements).toHaveLength(17);
    for (const item of aiEffectRequirements) expect(run.collections.buffs).toContain(item.id);
    // These legacy effect interfaces have no normal-play producer, so cannot be prerequisites.
    expect(COLLECTION_REQUIREMENTS.buffs.some((item) => item.id.startsWith("publication:"))).toBe(false);
  });

  it("unlocks Buff之神 from ten simultaneous semantic effects", () => {
    const next = createInitialState();
    next.buffs = [
      { id: "b1", name: "", source: "", timing: "monthly", remainingMonths: 1, actionEffects: { idea: { bonus: 1, multiplier: 1.2, extraActions: 1, sanDelta: -1 } } },
      { id: "b2", name: "", source: "", timing: "monthly", remainingMonths: 1, actionEffects: { experiment: { bonus: 1, multiplier: 1.2, extraActions: 1, sanDelta: -1 } } },
      { id: "b3", name: "", source: "", timing: "monthly", remainingMonths: 1, actionEffects: { writing: { bonus: 1, multiplier: 1.2 } }, readingEffect: { sanDelta: -1 } },
      { id: "b4", name: "", source: "", timing: "monthly", remainingMonths: 1, readingEffect: { manualExtraReads: 1, automaticReads: 1 }, activeOperationSanMultiplier: 1.2 },
    ];
    expect(getCurrentAchievementBuffIds(next).length).toBe(14);
    const run = observed(next);
    expect(run.satisfied).toContain("global:buff-god");
  });

  it("does not combine disjoint Buff snapshots from different months", () => {
    const previous = createInitialState();
    previous.buffs = [{ id: "previous", name: "", source: "", timing: "monthly", remainingMonths: 1,
      actionEffects: { idea: { bonus: 1, multiplier: 1.25, extraActions: 1, sanDelta: -1 }, experiment: { bonus: 1, multiplier: 1.25 } } }];
    const next = createInitialState();
    next.buffs = [
      { id: "next", name: "", source: "", timing: "monthly", remainingMonths: 1,
        actionEffects: { writing: { bonus: 1, multiplier: 1.25, extraActions: 1, sanDelta: -1 }, experiment: { extraActions: 1, sanDelta: -1 } } },
    ];
    const run = createAchievementRunProgress();
    observeAchievementCollections(previous, next, run);
    expect(run.collections.buffs).toHaveLength(12);
    expect(getCurrentAchievementBuffIds(previous)).toHaveLength(6);
    expect(getCurrentAchievementBuffIds(next)).toHaveLength(6);
    expect(run.satisfied).not.toContain("global:buff-god");
  });

  it("counts actual attendance and excludes proxy trips and not-yet-due bookings", () => {
    const prev = createInitialState(); const next = structuredClone(prev);
    const context: ConferenceAttendancePlan["context"] = { id: "trip", conferenceName: "CVPR", conferenceYear: 2024, city: "北京", country: "中国", region: "domestic", paperIds: [], paperCount: 1, grade: "A", availableAtTotalMonths: 3 };
    prev.totalMonths = 2; next.totalMonths = 3;
    prev.conferenceAttendancePlans = [{ context, mode: "advisor", rolls: [0.5] }];
    next.eventCounters.meetingCount += 1;
    expect(observed(next, prev).collections.locations).toEqual(["北京"]);
    prev.conferenceAttendancePlans[0]!.mode = "proxy";
    expect(observed(next, prev).collections.locations).toEqual([]);
    prev.conferenceAttendancePlans[0]!.mode = "advisor";
    prev.conferenceAttendancePlans[0]!.context.availableAtTotalMonths = 4;
    expect(observed(next, prev).collections.locations).toEqual([]);
  });

  it("collects VALSE destination on actual venue confirmation", () => {
    const prev = createInitialState(); prev.year = 2;
    const next = structuredClone(prev); next.eventCounters.meetingCount += 1;
    const run = createAchievementRunProgress();
    observeAchievementCollections(prev, next, run, "resolve-event", { eventChoiceId: "ccig-enter-venue-y2-m9-self" });
    expect(run.collections.locations).toEqual(["珠海"]);
    const pending = createAchievementRunProgress();
    observeAchievementCollections(prev, prev, pending, "resolve-event", { eventChoiceId: "ccig-enter-venue-y2-m9-self" });
    expect(pending.collections.locations).toEqual([]);
  });

  it("reports account-wide missing items without changing catalogs or previously collected sets", () => {
    const account = createDefaultAccountProfile();
    account.achievementCollectionProgress!.products = ["ai:gpt", "chair", "unknown-placeholder"];
    const missing = getMissingAchievementCollectionItems(account, "products");
    expect(missing).toHaveLength(COLLECTION_REQUIREMENTS.products.length - 2);
    expect(missing.some((item) => item.id === "ai:gpt")).toBe(false);
    expect(missing.some((item) => item.id === "chair-massage")).toBe(true);
    expect(getCollectorAchievementKey("global:travel-collector")).toBe("locations");
    expect(getCollectorAchievementKey("global:help-collector")).toBeUndefined();
  });
});
