import * as gameRandomSource from "../src/core/v2-game-random";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildInternshipInviteContext, createInternshipInviteAct1, refreshInternshipInviteEvent, revealInternshipInviteLead, revealInternshipInviteResult } from "../src/core/v2-internship-events";
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
  const act2 = root.stage === "act2" ? root : decisionOf(root);
  return act2.choices.find((choice) => choice.id === decision)!.effects.enqueueEvents![0]!;
}

it("uses the concise internship acceptance label", () => {
  const context = buildInternshipInviteContext(createInitialState(), () => 0.5);
  const accept = decisionOf(createInternshipInviteAct1(context)).choices.find((choice) => choice.id === "accept");
  expect(accept?.label).toBe("接受实习");
});

afterEach(() => vi.restoreAllMocks());

describe("enterprise internship offer contract", () => {
  it.each([0, 1, 2])("draws base salary %s independently of company and position", (baseMonthlyIncome) => {
    const rolls = [0, 0, 0, baseMonthlyIncome / 3, 0, 0.999];
    const getRoll = vi.fn(() => rolls.shift()!);
    const offer = createInternshipOffer(getRoll);
    expect(getRoll).toHaveBeenCalledTimes(6);
    expect(offer).toMatchObject({ baseMonthlyIncome, monthlySanCost: 4, experimentBonus: 6 });
    const alternateRolls = [0.999, 0.999, 0.999, baseMonthlyIncome / 3, 0, 0.999];
    const variant = createInternshipOffer(() => alternateRolls.shift()!);
    expect(variant.company).not.toBe(offer.company);
    expect(variant.position).not.toBe(offer.position);
    expect(variant.baseMonthlyIncome).toBe(offer.baseMonthlyIncome);
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
  it("reveals company and direction in act two, then details in act three", () => {
    const state = createInitialState();
    const context = buildInternshipInviteContext(state, () => 0.999);
    const root = createInternshipInviteAct1(context);
    const leadRolls = [0.5, 0.5];
    const decision = revealInternshipInviteLead(decisionOf(root), () => leadRolls.shift()!);
    const lead = decision.internshipInvitePreview!.context.lead!;
    expect(root.description).toContain("小提示：出现条件：企业交流≥2次（含本次），有A会论文或实习经历（含远程），且暂无实习安排。");
    expect(root.description).toContain("有A会论文或实习经历（含远程），且暂无实习安排");
    expect(context.offer.id).toBe("pending");
    expect(root.description).not.toContain(lead.company);
    expect(decision.description).toContain(lead.company);
    expect(decision.description).toContain(lead.direction);
    expect(decision.description).not.toContain("岗位定为");
    expect(resultOf(decision, "accept").internshipInvitePreview!.context.lead).toEqual(lead);
    expect(revealInternshipInviteLead(decision, () => { throw new Error("company rerolled"); })).toBe(decision);
    for (const event of [root, decision]) {
      for (const choice of event.choices) expect(Object.keys(choice.effects)).toEqual(["enqueueEvents"]);
    }
    const acceptance = revealInternshipInviteResult(resultOf(decision, "accept"), () => 0.5);
    const revealedOffer = acceptance.internshipInvitePreview!.context.offer;
    expect(revealedOffer.id).not.toBe("pending");
    expect(revealedOffer.company).toBe(lead.company);
    expect(acceptance.description).toContain(revealedOffer.company);
    expect(acceptance.description).toContain(revealedOffer.position);
    expect(acceptance.choices[0]!.label).toBe("确定");
    expect(acceptance.choices[0]!.effects.internshipStateUpdates).toEqual(activateInternship(revealedOffer));
    expect(acceptance.choices[0]!.effects.conferenceCareerUpdates).toEqual({ hasInternshipExperience: true, lastInternshipOffer: revealedOffer });
    expect(revealInternshipInviteResult(acceptance, () => { throw new Error("offer rerolled"); })).toBe(acceptance);
    expect(resultOf(decision, "decline").choices[0]!.label).toBe("确定");
  });

  it("refreshes every stage and nested salary without randomness or changing queue identity", () => {
    const initial = createInitialState();
    const getRoll = vi.fn(() => 0.999);
    const context = { ...buildInternshipInviteContext(initial, getRoll), origin: "会场交流" };
    const root = createInternshipInviteAct1(context);
    const state = { ...initial, totalMonths: initial.totalMonths + 2, papers: [publishedPaper()] };
    const random = vi.spyOn(gameRandomSource, "gameRandom").mockImplementation(() => { throw new Error("refresh must not draw randomness"); });
    for (const event of [root, decisionOf(root), resultOf(root, "accept"), resultOf(root, "decline")]) {
      const queued = { ...createEventQueueItem(event, 17), deferredStatePatch: [] };
      const snapshot = structuredClone(queued);
      const fresh = refreshInternshipInviteEvent(state, queued);
      expect(fresh.id).toBe(queued.id);
      expect(fresh.queueOrder).toBe(17);
      expect(fresh.history).toEqual(queued.history);
      expect(fresh.deferredStatePatch).toBeUndefined();
      expect(fresh.internshipInvitePreview?.context).toMatchObject({ offer: context.offer, currentMonthlyIncome: 2, origin: "会场交流" });
      expect(fresh.internshipInvitePreview?.context.offer).toBe(context.offer);
      expect(refreshInternshipInviteEvent(state, fresh)).toEqual(fresh);
      expect(queued).toEqual(snapshot);
      const inspect = (current: PendingEvent): void => {
        expect(current.internshipInvitePreview?.context.currentMonthlyIncome).toBe(2);
        for (const choice of current.choices) for (const next of choice.effects.enqueueEvents ?? []) inspect(next);
      };
      inspect(fresh);
      if (event.internshipInvitePreview?.decision === "accept") {
        expect(fresh.description).toContain("每月SAN -5｜每月金币 +2");
        expect(fresh.description.split("机制结算")[1]).toContain("结果：企业实习（6个月）");
        expect(fresh.completionLog).toContain("金币 +2");
      }
    }
    expect(getRoll).not.toHaveBeenCalled();
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
    expect(fresh.description.split("机制结算")[1]?.trim()).toBe("结果：原实习保持不变");
    expect(fresh.choices[0]!.outcome).toBe("原实习保持不变");
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
    expect(fresh.description.split("机制结算")[1]?.trim()).toBe("结果：婉拒实习");
    expect(fresh.description).not.toMatch(/暂不实习|重置|清零|拒绝次数|101/u);
    expect(fresh.completionLog).toContain("婉拒");
    expect(refreshInternshipInviteEvent(state, decisionOf(root)).choices.find((choice) => choice.id === "accept")?.disabledReason).toBeUndefined();
  });

  it("leaves unrelated events unchanged", () => {
    const state = createInitialState();
    const event: PendingEvent = { id: "other", title: "other", description: "other", source: "fixed", blocking: true,
      deadlineMonths: 0, choices: [], chainId: "other", stage: "act1" };
    expect(refreshInternshipInviteEvent(state, event)).toBe(event);
  });
});
