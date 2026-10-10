import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildInternshipInviteContext, createInternshipInviteAct1, refreshInternshipInviteEvent } from "../src/core/v2-internship-events";
import {
  activateInternship,
  activateRemoteInternship,
  advanceInternshipMonth,
  canTriggerConferenceInternshipInvite,
  createInternshipOffer,
  createInternshipState,
  getInternshipExperimentEffect,
  getInternshipMonthlyIncome,
  getInternshipMonthlyStats,
  hasInternshipExperience,
  hasPublishedAConferencePaper,
} from "../src/core/v2-internship-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function publishedPaper() {
  return { ...createDraftPaper(1, 0, () => 0), status: "published" as const, target: "A" as const };
}

function decisionOf(root: PendingEvent): PendingEvent {
  return root.choices[0]!.effects.enqueueEvents![0]!;
}

function resultOf(root: PendingEvent, decision: "accept" | "decline"): PendingEvent {
  return decisionOf(root).choices.find((choice) => choice.id === decision)!.effects.enqueueEvents![0]!;
}

afterEach(() => vi.restoreAllMocks());

describe("enterprise internship offer contract", () => {
  it.each([0, 1, 2])("ties base salary %s to a company and position", (baseMonthlyIncome) => {
    const rolls = [baseMonthlyIncome / 3, 0, 0.999];
    const getRoll = vi.fn(() => rolls.shift()!);
    const offer = createInternshipOffer(getRoll);
    expect(getRoll).toHaveBeenCalledTimes(3);
    expect(offer).toMatchObject({ baseMonthlyIncome, monthlySanCost: 4, experimentBonus: 6 });
    const variant = createInternshipOffer(() => (baseMonthlyIncome + 0.5) / 3);
    expect(variant.company).toBe(offer.company);
    expect(variant.position).toBe(offer.position);
    expect(offer.company).not.toBe("");
    expect(offer.position).not.toBe("");
  });

  it.each([0, 1, 2])("calculates dynamic capped salary with base %s", (base) => {
    for (const count of [0, 1, 4, 6, 20]) {
      expect(getInternshipMonthlyIncome(count, base)).toBe(Math.min(base + count, 6));
    }
  });

  it.each([0, 0.5, 0.999])("keeps offer costs and experiment effects fixed for six months at roll %s", (roll) => {
    const offer = createInternshipOffer(() => roll);
    let state = { ...createInitialState(), internshipState: activateInternship(offer) };
    for (let month = 0; month < 6; month += 1) {
      state = { ...state, papers: Array.from({ length: month }, () => publishedPaper()) };
      expect(state.internshipState.offer).toBe(offer);
      expect(state.internshipState.remainingMonths).toBe(6 - month);
      expect(getInternshipMonthlyStats(state)).toEqual({
        san: -offer.monthlySanCost,
        money: Math.min(offer.baseMonthlyIncome + month, 6),
      });
      expect(getInternshipExperimentEffect(state)).toEqual({ bonus: offer.experimentBonus, multiplier: 1.25, moneyDiscount: 2 });
      state = { ...state, internshipState: advanceInternshipMonth(state) };
    }
    expect(state.internshipState).toEqual(createInternshipState());
    expect(getInternshipMonthlyStats(state)).toEqual({ san: 0, money: 0 });
    expect(getInternshipExperimentEffect(state)).toEqual({ bonus: 0, multiplier: 1, moneyDiscount: 0 });
  });

  it("requires the second exchange and an A conference publication or previous experience", () => {
    const initial = createInitialState();
    const published = { ...initial, papers: [{ ...publishedPaper(), nonFirstAuthor: true }] };
    expect(canTriggerConferenceInternshipInvite(initial, 2)).toBe(false);
    expect(canTriggerConferenceInternshipInvite(published, 1)).toBe(false);
    expect(canTriggerConferenceInternshipInvite(published, 2)).toBe(true);
    expect(canTriggerConferenceInternshipInvite({ ...initial, externalPublications: published.papers }, 2)).toBe(true);
    expect(canTriggerConferenceInternshipInvite({ ...initial, internshipCount: 1 }, 2)).toBe(true);
    const experienced = { ...initial, conferenceCareerState: { ...initial.conferenceCareerState,
      hasInternshipExperience: true, rejectedInternshipCount: 100, permanentlyBlockedInternship: true } };
    expect(canTriggerConferenceInternshipInvite(experienced, 100)).toBe(true);
  });

  it("does not treat reviewing papers, B conferences, or journals as A conference publications", () => {
    const initial = createInitialState();
    const paper = publishedPaper();
    expect(hasPublishedAConferencePaper({ ...initial, papers: [
      { ...paper, status: "reviewing" },
      { ...paper, target: "B" },
      { ...paper, journalTarget: "pami" },
      { ...paper, publication: { citations: 0, effectiveScore: 0, citationDebuffMultiplier: 1, journalTarget: "pami" } },
    ] })).toBe(false);
  });

  it.each(["pending", "remote", "enterprise"] as const)("recognizes %s experience while preventing overlapping invitations", (kind) => {
    const initial = createInitialState();
    const state = { ...initial, internshipState: kind === "enterprise" ? activateInternship()
      : activateRemoteInternship(initial.totalMonths - (kind === "remote" ? 1 : 0)) };
    expect(hasInternshipExperience(state)).toBe(true);
    expect(canTriggerConferenceInternshipInvite(state, 2)).toBe(false);
  });
});

describe("enterprise internship refresh", () => {
  it("stores the same offer in every stage and defers all settlement until final confirmation", () => {
    const state = createInitialState();
    const context = buildInternshipInviteContext(state, () => 0.999);
    const root = createInternshipInviteAct1(context);
    const decision = decisionOf(root);
    for (const event of [root, decision, resultOf(root, "accept"), resultOf(root, "decline")]) {
      expect(event.internshipInvitePreview?.context.offer).toBe(context.offer);
    }
    for (const event of [root, decision]) {
      for (const choice of event.choices) expect(Object.keys(choice.effects)).toEqual(["enqueueEvents"]);
    }
    const acceptance = resultOf(root, "accept");
    expect(acceptance.choices[0]!.label).toBe("确定");
    expect(acceptance.choices[0]!.effects.internshipStateUpdates).toEqual(activateInternship(context.offer));
    expect(acceptance.choices[0]!.effects.conferenceCareerUpdates).toEqual({ hasInternshipExperience: true, lastInternshipOffer: context.offer });
    expect(resultOf(root, "decline").choices[0]!.label).toBe("确定");
  });

  it("refreshes every stage and nested salary without randomness or changing queue identity", () => {
    const initial = createInitialState();
    const getRoll = vi.fn(() => 0.999);
    const context = { ...buildInternshipInviteContext(initial, getRoll), origin: "会场交流" };
    const root = createInternshipInviteAct1(context);
    const state = { ...initial, totalMonths: initial.totalMonths + 2, papers: [publishedPaper()] };
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("refresh must not draw randomness"); });
    for (const event of [root, decisionOf(root), resultOf(root, "accept"), resultOf(root, "decline")]) {
      const queued = { ...createEventQueueItem(event, 17), deferredStatePatch: [] };
      const snapshot = structuredClone(queued);
      const fresh = refreshInternshipInviteEvent(state, queued);
      expect(fresh.id).toBe(queued.id);
      expect(fresh.queueOrder).toBe(17);
      expect(fresh.history).toEqual(queued.history);
      expect(fresh.deferredStatePatch).toBeUndefined();
      expect(fresh.internshipInvitePreview?.context).toMatchObject({ offer: context.offer, currentMonthlyIncome: 3, origin: "会场交流" });
      expect(fresh.internshipInvitePreview?.context.offer).toBe(context.offer);
      expect(refreshInternshipInviteEvent(state, fresh)).toEqual(fresh);
      expect(queued).toEqual(snapshot);
      const inspect = (current: PendingEvent): void => {
        expect(current.internshipInvitePreview?.context.currentMonthlyIncome).toBe(3);
        for (const choice of current.choices) for (const next of choice.effects.enqueueEvents ?? []) inspect(next);
      };
      inspect(fresh);
      if (event.internshipInvitePreview?.decision === "accept") {
        expect(fresh.description).toContain("金币 +3（每月）");
        expect(fresh.completionLog).toContain("金币 +3");
      }
    }
    expect(getRoll).toHaveBeenCalledTimes(3);
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["pending", "remote", "enterprise"] as const)("removes stale acceptance effects when a %s internship exists", (kind) => {
    const initial = createInitialState();
    const root = createInternshipInviteAct1(buildInternshipInviteContext(initial, () => 0));
    const state: GameState = { ...initial, internshipState: kind === "enterprise" ? activateInternship()
      : activateRemoteInternship(initial.totalMonths - (kind === "remote" ? 1 : 0)) };
    const decision = refreshInternshipInviteEvent(state, decisionOf(root));
    expect(decision.choices.find((choice) => choice.id === "accept")?.disabledReason).toBeDefined();
    const fresh = refreshInternshipInviteEvent(state, resultOf(root, "accept"));
    expect(fresh.choices[0]!.effects).toEqual({});
    expect(fresh.completionLog).toBe("已有实习安排，本次不新增、不延期，原实习保持不变。");
    expect(fresh.choices[0]!.label).toBe("确定");
  });

  it("refreshes rejection counts without ever closing future invitations", () => {
    const initial = createInitialState();
    const root = createInternshipInviteAct1(buildInternshipInviteContext(initial, () => 0));
    const state = { ...initial, conferenceCareerState: { ...initial.conferenceCareerState, rejectedInternshipCount: 100,
      permanentlyBlockedInternship: true } };
    const fresh = refreshInternshipInviteEvent(state, resultOf(root, "decline"));
    expect(fresh.choices[0]!.effects.conferenceCareerUpdates).toMatchObject({
      rejectedInternshipCount: 101, permanentlyBlockedInternship: false,
    });
    expect(refreshInternshipInviteEvent(state, decisionOf(root)).choices.find((choice) => choice.id === "accept")?.disabledReason).toBeUndefined();
  });

  it("leaves unrelated events unchanged", () => {
    const state = createInitialState();
    const event: PendingEvent = { id: "other", title: "other", description: "other", source: "fixed", blocking: true,
      deadlineMonths: 0, choices: [], chainId: "other", stage: "act1" };
    expect(refreshInternshipInviteEvent(state, event)).toBe(event);
  });
});
