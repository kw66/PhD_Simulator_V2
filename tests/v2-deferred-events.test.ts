import { describe, expect, it } from "vitest";

import { buildConferenceDecisionEventsForAcceptedPapers, createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { createConferenceCareerState } from "../src/core/v2-conference-career";
import { createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventCounters } from "../src/core/v2-event-counters";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "../src/core/v2-internship-events";
import { createInternshipState } from "../src/core/v2-internship-system";
import { buildJointTrainingContext, createJointTrainingAct1 } from "../src/core/v2-joint-training-events";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "../src/core/v2-lover-events";
import { createRelationshipState } from "../src/core/v2-relationship-rules";
import { createShopState } from "../src/core/v2-shop-items";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function resolve(state: ReturnType<typeof createInitialState>, choiceId: string) {
  return dispatchAction(state, "resolve-event", { eventChoiceId: choiceId });
}

describe("deferred-system event content", () => {
  it("rebases a deferred result onto changes made while the result is pending", () => {
    const initial = { ...createInitialState(), phase: "playing" as const, player: { ...createInitialState().player, money: 1 } };
    const resultEvent: PendingEvent = {
      id: "deferred-delta-result",
      title: "延迟结果",
      description: "结果确认。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "deferred-delta",
      stage: "result",
      choices: [{ id: "close", label: "确定", outcome: "完成。", effects: {} }],
    };
    const rootEvent: PendingEvent = {
      id: "deferred-delta-root",
      title: "延迟事件",
      description: "选择一个结果。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "deferred-delta",
      stage: "act2",
      choices: [{
        id: "gain",
        label: "获得金币",
        outcome: "金币 +2。",
        effects: { money: 2, enqueueEvents: [resultEvent] },
      }],
    };
    let state: GameState = {
      ...initial,
      eventQueue: [createEventQueueItem(rootEvent, 1)],
    };

    state = resolve(state, "gain");
    expect(state.player.money).toBe(1);
    expect(state.eventQueue[0]?.deferredStatePatch).toBeDefined();

    state = {
      ...state,
      player: { ...state.player, money: state.player.money + 5 },
    };
    state = resolve(state, "close");

    expect(state.player.money).toBe(8);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("merges deferred changes into an object that changed while pending", () => {
    const initial = { ...createInitialState(), phase: "playing" as const };
    const originalPaper = {
      ...initial.papers[0],
      id: "deferred-paper",
      title: "原始标题",
      idea: 1,
      experiment: 1,
      writing: 1,
    };
    const resultEvent: PendingEvent = {
      id: "deferred-object-result",
      title: "延迟结果",
      description: "结果确认。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "deferred-object",
      stage: "result",
      choices: [{ id: "close", label: "确定", outcome: "完成。", effects: {} }],
    };
    const rootEvent: PendingEvent = {
      id: "deferred-object-root",
      title: "延迟事件",
      description: "选择一个结果。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "deferred-object",
      stage: "act2",
      choices: [{
        id: "update-paper",
        label: "更新论文",
        outcome: "更新论文。",
        effects: {
          paperUpdates: [{ id: originalPaper.id, conferenceHandled: true }],
          enqueueEvents: [resultEvent],
        },
      }],
    };
    let state: GameState = {
      ...initial,
      papers: [originalPaper],
      eventQueue: [createEventQueueItem(rootEvent, 1)],
    };

    state = resolve(state, "update-paper");
    state = {
      ...state,
      papers: state.papers.map((paper) => paper.id === originalPaper.id
        ? { ...paper, title: "中间修改后的标题" }
        : paper),
    };
    state = resolve(state, "close");

    expect(state.papers[0]).toMatchObject({
      id: originalPaper.id,
      title: "中间修改后的标题",
      conferenceHandled: true,
    });
  });

  it("applies conference paper updates to archived publications", () => {
    const initial = { ...createInitialState(), phase: "playing" as const };
    const paper = createGrantedPublishedPaper(1, 0, { target: "C", acceptedScore: 24 });
    const event: PendingEvent = {
      id: "archive-paper-update",
      title: "论文参会",
      description: "参会结束。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "archive-paper-update",
      stage: "result",
      choices: [{
        id: "close",
        label: "确定",
        outcome: "论文参会已处理。",
        effects: { paperUpdates: [{ id: paper.id, conferenceHandled: true }] },
      }],
    };
    const state: GameState = {
      ...initial,
      externalPublications: [paper],
      eventQueue: [createEventQueueItem(event, 1)],
    };
    const resolved = resolve(state, "close");

    expect(resolved.externalPublications[0]?.conferenceHandled).toBe(true);
  });

  it("keeps internship, joint-training and relationship event chains reviewable", () => {
    const initial = { ...createInitialState(), phase: "playing" as const };
    const roots = [
      createInternshipInviteAct1(buildInternshipInviteContext(initial)),
      createJointTrainingAct1(buildJointTrainingContext(initial)),
      createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: initial.conferenceEncounterState,
        totalMonths: initial.totalMonths,
        type: "beautiful",
        playerGender: "male",
      })),
    ];

    for (const root of roots) {
      let state: GameState = { ...initial, eventQueue: [createEventQueueItem(root, 1)] };
      state = resolve(state, "continue");
      expect(state.eventQueue[0]?.stage).toBe("act2");
      expect(state.eventQueue[0]?.history).toHaveLength(1);
    }
  });

  it("keeps the relationship-event candidate opposite to the selected role", () => {
    const initial = createInitialState();
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: initial.conferenceEncounterState,
      totalMonths: initial.totalMonths,
      type: "beautiful",
      playerGender: "female",
    });
    const act2 = createLoverDevelopmentAct1(context).choices[0]?.effects.enqueueEvents?.[0];
    const acceptChoice = act2?.choices.find((choice) => choice.id === "accept");

    expect(context.loverGender).toBe("male");
    expect(acceptChoice?.effects.loverStateUpdates?.gender).toBe("male");
  });

  it("keeps lasting modifiers as Buffs and commits relationship state directly", () => {
    let state: GameState = { ...createInitialState(), phase: "playing", totalCitations: 1200 };
    state = { ...state, eventQueue: [createEventQueueItem(createJointTrainingAct1(buildJointTrainingContext(state)), 1)] };
    state = resolve(resolve(state, "continue"), "accept");
    expect(state.buffs).toHaveLength(0);
    state = resolve(state, "close");
    expect(state.buffs.map((buff) => buff.name)).toEqual(expect.arrayContaining(["每次想 idea +5分", "每次做实验 +5分"]));
    expect(state.researchCapacityState.jointTrainingCitationCapBonus).toBe(4);

    let loverState: GameState = { ...createInitialState(), phase: "playing" };
    loverState = {
      ...loverState,
      eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: loverState.conferenceEncounterState,
        totalMonths: loverState.totalMonths,
        type: "smart",
        playerGender: "female",
      })), 1)],
    };
    const researchBeforeRelationship = loverState.player.research;
    loverState = resolve(resolve(loverState, "continue"), "accept");
    expect(loverState.player.research).toBe(researchBeforeRelationship);
    loverState = resolve(loverState, "close");
    expect(loverState.player.research).toBe(2);
    expect(loverState.buffs.some((buff) => buff.name === "新增人际关系")).toBe(false);
    expect(loverState.loverState.active).toBe(true);
    expect(loverState.loverProgressState.active).toBe(true);
  });

  it("keeps conference construction and grouping intact", () => {
    const context = {
      favor: 12,
      research: 12,
      social: 12,
      relationshipState: createRelationshipState(),
      conferenceEncounterState: createConferenceEncounterState(),
      conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
      shopState: createShopState(),
      eventSupport: {
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
      },
      eventCounters: createEventCounters(),
    };
    const event = createConferenceDecisionAct1({
      id: "conference-test",
      conferenceName: "ICML",
      conferenceYear: 2026,
      city: "温哥华",
      country: "加拿大",
      region: "west",
      grade: "A",
      paperCount: 2,
      paperIds: ["paper-a", "paper-b"],
      paperPresentations: [
        { id: "paper-a", title: "Poster 论文", acceptType: "Poster", citationPromotionMultiplier: 1 },
        { id: "paper-b", title: "Oral 论文", acceptType: "Oral", citationPromotionMultiplier: 1.5 },
        { id: "paper-c", title: "Best Paper 论文", acceptType: "Best Paper", citationPromotionMultiplier: 5 },
      ],
    }, context, () => 0.99);
    expect(event.description).toContain("《Poster 论文》：Poster 展示，会后引用倍率 ×1.00");
    expect(event.description).toContain("《Oral 论文》：Oral 展示，会后引用倍率 ×1.50（+50%）");
    expect(event.description).toContain("《Best Paper 论文》：Best Paper 展示，会后引用倍率 ×5.00（+400%）");
    const act2 = event.choices[0]?.effects.enqueueEvents?.[0];
    expect(act2?.stage).toBe("act2");
    expect(act2?.title).toBe("论文参会 ➜ 参会方式");
    expect(act2?.choices.map((choice) => choice.id)).toEqual(["self", "advisor", "proxy"]);
    const selfConfirmation = act2?.choices.find((choice) => choice.id === "self")?.effects.enqueueEvents?.[0];
    const selfActivity = selfConfirmation?.choices[0]?.effects.enqueueEvents?.[0];
    expect(selfActivity?.title).toBe("会场活动");
    expect(selfActivity?.description).toContain("自费参会");
    expect(selfActivity?.description).toContain("金币 -6");
    expect(selfActivity?.chainId).toBe(`${event.chainId}-activity`);

    const grouped = buildConferenceDecisionEventsForAcceptedPapers([
      { id: "paper-1", target: "C", submittedMonth: 10, submittedYear: 1 },
      { id: "paper-2", target: "C", submittedMonth: 10, submittedYear: 1 },
    ], context, () => 0.99);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.description).toContain("2 篇论文");
  });

  it("finishes an in-person conference as one history item with delayed combined settlement", () => {
    const initial = createInitialState();
    const conferencePaper = {
      ...createGrantedPublishedPaper(1, 0, { target: "C", acceptedScore: 24 }),
      id: "paper-a",
      conferenceHandled: false,
    };
    const context = {
      favor: 12,
      research: 0,
      social: 0,
      relationshipState: createRelationshipState(),
      conferenceEncounterState: createConferenceEncounterState(),
      conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
      shopState: createShopState(),
      eventSupport: initial.eventSupport,
      eventCounters: createEventCounters(),
    };
    const root = createConferenceDecisionAct1({
      id: "conference-integration",
      conferenceName: "WACV",
      conferenceYear: 2026,
      city: "巴黎",
      country: "法国",
      region: "west",
      grade: "C",
      paperCount: 1,
      paperIds: ["paper-a"],
    }, context, () => 0);
    let state: GameState = {
      ...initial,
      phase: "playing",
      player: { ...initial.player, san: 10, money: 10 },
      papers: [conferencePaper],
      publicationTalentState: { claimedIds: ["first-paper"] },
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = resolve(state, "continue");
    state = resolve(state, "self");
    expect(state.eventQueue[0]?.description).toContain("金币 -6");
    expect(state.player.money).toBe(10);

    state = resolve(state, "enter-venue");
    expect(state.eventQueue[0]?.title).toBe("会场活动");
    expect(state.eventQueue[0]?.description).toContain("金币 -6");
    expect(state.player.money).toBe(4);
    expect(state.papers[0]?.conferenceHandled).toBe(false);

    state = resolve(state, "continue");
    state = resolve(state, "tour-local");
    expect(state.eventQueue[0]?.stage).toBe("result");
    expect(state.player.san).toBe(10);
    expect(state.papers[0]?.conferenceHandled).toBe(false);
    state = resolve(state, "close");

    expect(state.player.money).toBe(4);
    expect(state.player.san).toBe(16);
    expect(state.papers[0]?.conferenceHandled).toBe(true);
    expect(state.eventHistory).toHaveLength(2);
    expect(state.eventHistory[0]?.stages).toHaveLength(3);
    expect(state.eventHistory[1]?.stages).toHaveLength(3);
    expect(state.log.some((entry) => entry.text.includes("自费参会") && entry.text.includes("SAN +6"))).toBe(true);
  });

  it("ends a proxy conference branch without creating a venue activity", () => {
    const initial = createInitialState();
    const context = {
      favor: 0,
      research: 0,
      social: 0,
      relationshipState: createRelationshipState(),
      conferenceEncounterState: createConferenceEncounterState(),
      conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
      shopState: createShopState(),
      eventSupport: initial.eventSupport,
      eventCounters: createEventCounters(),
    };
    const root = createConferenceDecisionAct1({
      id: "conference-proxy",
      conferenceName: "CCF",
      conferenceYear: 2026,
      city: "杭州",
      country: "中国",
      region: "domestic",
      grade: "C",
      paperCount: 1,
      paperIds: ["paper-proxy"],
    }, context, () => 0);
    let state: GameState = {
      ...initial,
      phase: "playing",
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = resolve(state, "continue");
    state = resolve(state, "proxy");
    expect(state.eventQueue[0]?.title).toContain("参会确认");
    expect(state.eventQueue[0]?.description).toContain("代参会费用 0");
    state = resolve(state, "proxy-finish");

    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory).toHaveLength(1);
    expect(state.eventHistory[0]?.stages).toHaveLength(3);
    expect(state.eventHistory[0]?.stages.some((stage) => stage.title.includes("会场安排"))).toBe(false);
    expect(state.eventCounters.meetingCount).toBe(0);
    expect(state.log.some((entry) => entry.text.includes("同学代参会") && entry.text.includes("论文参会已处理"))).toBe(true);
  });
});
