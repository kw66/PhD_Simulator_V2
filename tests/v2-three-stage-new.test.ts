import { describe, expect, it } from "vitest";
import { createConferenceActivityEvent, createConferenceActivityResult } from "../src/core/v2-conference-activity-events";
import { createConferenceCareerState } from "../src/core/v2-conference-career";
import { createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { createInternshipState } from "../src/core/v2-internship-system";
import { createLoverState } from "../src/core/v2-lover-system";
import { createRelationshipState } from "../src/core/v2-relationship-rules";
import { createPaperReviewResultEvent } from "../src/core/v2-publication-system";
import type { PaperReviewerFocus } from "../src/core/v2-types";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { dispatchAction } from "../src/core/v2-engine";
import { renderApp } from "../src/app/v2-render";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

describe("new multi-stage event shape", () => {
  it("keeps conference activity effects in its result stage", () => {
    const context = { id: "conference-test", conferenceName: "CVPR", conferenceYear: 2026, city: "杭州", country: "中国", paperCount: 1, grade: "B" as const, paperIds: ["p1"] };
    const state = { research: 0, social: 6, relationshipState: createRelationshipState(), conferenceEncounterState: createConferenceEncounterState(), conferenceCareerState: createConferenceCareerState(), internshipState: createInternshipState(), loverState: createLoverState() };
    const first = createConferenceActivityEvent(context, state, ["自费参会", "金币 -2"], () => 0.99);
    const second = first.choices[0]?.effects.enqueueEvents?.[0];
    expect(first.stage).toBe("act1");
    expect(second?.stage).toBe("act2");
    const enterprise = second?.choices.find((choice) => choice.id === "enterprise-networking");
    const result = enterprise?.effects.enqueueEvents?.[0];
    expect(enterprise?.effects.temporaryActionEffectUpdates).toBeUndefined();
    expect(result?.stage).toBe("result");
    expect(result?.choices[0]?.effects.triggerInternshipInvite).toBe(true);
    expect(result?.chainId).not.toBe(context.id);
  });

  it("exposes review, reviewers, and PC as one chain", () => {
    const paper = { id: "p1", title: "Test", topicId: "t", topicLabel: "T", heatMultiplier: 1, prepublicationDecayRate: 0.1, idea: 1, experiment: 1, writing: 1, status: "reviewing" as const, target: "C" as const, reviewMonthsLeft: 0, submittedIdea: 1, submittedExperiment: 1, submittedWriting: 1 };
    const settlement = { paperId: "p1", target: "C" as const, accepted: false, acceptType: null, submittedScore: 3, totalReviewScore: -2, borderlineChance: null, venueInfluence: 0.3, reviewStrictnessMultiplier: 1, scoreGain: 0, baseSanReward: 0, baseFavorReward: 0, rewardReductionCount: 0, sanReward: 0, favorReward: 0, reviewerSanChange: 0, reports: ["普通审稿人", "严格审稿人", "LLM审稿人"].map((reviewer) => ({ reviewer, focus: "balanced" as PaperReviewerFocus, reviewScore: -1 as const, decision: "Reject" as const, effectiveScore: 1 })) };
    const first = createPaperReviewResultEvent(paper, settlement);
    const second = first.choices[0]?.effects.enqueueEvents?.[0];
    const third = second?.choices[0]?.effects.enqueueEvents?.[0];
    expect(first.stage).toBe("act1");
    expect(second?.stage).toBe("act2");
    expect(third?.stage).toBe("result");
    expect(first.chainId).toBe(second?.chainId);
    expect(second?.chainId).toBe(third?.chainId);
    expect(third?.description).toContain("机制结算");
    expect(third?.description).toContain("论文退回草稿");
    expect(third?.choices[0]?.effects.paperReviewSettlement).toBe(settlement);
  });

  it("queues a sourced internship event only after activity confirmation", () => {
    const context = { id: "conference-test", conferenceName: "CVPR", conferenceYear: 2026, city: "杭州", country: "中国", paperCount: 1, grade: "A" as const, paperIds: [] };
    const result = createConferenceActivityResult(context, {
      id: "enterprise-networking",
      label: "企业交流",
      outcome: "下次做实验 ×1.25。",
      resultDescription: "你在企业展台完成了一次深入交流。",
      effects: { triggerInternshipInvite: true, followUpContext: "CVPR 2026 会场交流" },
    }, "自费参会，金币 -2");
    const initial = createStartedGameState("normal");
    const state = { ...initial, eventQueue: [createEventQueueItem(result, 1)] };
    const resolved = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: "close" });
    expect(resolved.eventHistory[0]?.chainId).toBe("conference-test-activity");
    expect(resolved.eventQueue[0]?.chainId).toBe("internship-invite");
    expect(resolved.eventQueue[0]?.description).toContain("CVPR 2026 会场交流");
  });

  it("renders activity outcomes in the shared settlement summary", () => {
    const context = { id: "conference-render", conferenceName: "CVPR", conferenceYear: 2026, city: "杭州", country: "中国", paperCount: 1, grade: "B" as const, paperIds: [] };
    const event = createConferenceActivityResult(context, {
      id: "tour-local",
      label: "随便在当地走走",
      outcome: "SAN +6。",
      resultDescription: "你沿着会场附近走了一圈。",
      effects: { san: 6 },
    }, "自费参会，金币 -2");
    const state = { ...createStartedGameState("normal"), eventQueue: [createEventQueueItem(event, 1)] };
    const html = renderApp(state, createDefaultAccountProfile(), { isEventContentOpen: true, activeEventId: event.id });
    expect(html).toContain("event-settlement-summary");
    expect(html).not.toContain("本次活动结果");
    expect(html).toContain("SAN +6");
  });
});
