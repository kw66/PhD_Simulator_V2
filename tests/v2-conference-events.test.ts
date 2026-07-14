import { describe, expect, it } from "vitest";

import { buildConferenceDecisionEventsForAcceptedPapers, createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { createConferenceCareerState } from "../src/core/v2-conference-career";
import { createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventCounters } from "../src/core/v2-event-counters";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createInternshipState } from "../src/core/v2-internship-system";
import { createRelationshipState } from "../src/core/v2-relationship-rules";
import { createShopState } from "../src/core/v2-shop-items";

describe("v2 conference events", () => {
  it("builds a three-act decision chain from audited meeting rules", () => {
    const event = createConferenceDecisionAct1(
      {
        id: "conf-west-1",
        conferenceName: "ICML",
        conferenceYear: 2026,
        city: "温哥华",
        country: "加拿大",
        region: "west",
        grade: "A",
        paperCount: 2,
        paperIds: ["paper-a", "paper-b"],
      },
      {
        favor: 12,
        research: 12,
        social: 12,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: createConferenceEncounterState(),
        conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
        shopState: { ...createShopState(), bikeUpgrade: "ebike" },
        eventSupport: {
          hasGameController: false,
          hasParasol: true,
          hasDownJacket: true,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: { ...createEventCounters(), meetingCount: 4 },
      },
      () => 0.99,
    );

    expect(event.stage).toBe("act1");
    const act2 = event.choices[0]?.effects.enqueueEvents?.[0];
    expect(act2?.choices.map((choice) => choice.id)).toEqual(["self", "advisor", "proxy"]);

    const selfChoice = act2?.choices.find((choice) => choice.id === "self");
    expect(selfChoice?.effects.money).toBe(-3);

    const act3 = selfChoice?.effects.enqueueEvents?.[0];
    expect(act3?.stage).toBe("act3");
    expect(act3?.choices[0]?.effects.counterDeltas).toEqual({ meetingCount: 1 });
    expect(act3?.choices[0]?.effects.paperUpdates).toEqual([
      { id: "paper-a", conferenceHandled: true },
      { id: "paper-b", conferenceHandled: true },
    ]);
    expect(act3?.choices[0]?.effects.enqueueEvents?.[0]?.chainId).toBe("conference-activity");
    expect(act3?.choices[0]?.effects.enqueueEvents?.[0]?.stage).toBe("act1");
  });

  it("groups accepted papers from the same conference into one root event", () => {
    const events = buildConferenceDecisionEventsForAcceptedPapers([
      { id: "paper-1", target: "C", submittedMonth: 10, submittedYear: 1 },
      { id: "paper-2", target: "C", submittedMonth: 10, submittedYear: 1 },
    ], {
      favor: 0,
      research: 0,
      social: 0,
      relationshipState: createRelationshipState(),
      conferenceEncounterState: createConferenceEncounterState(),
      conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
      shopState: createShopState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      eventCounters: createEventCounters(),
    }, () => 0.99);

    expect(events).toHaveLength(1);
    expect(events[0]?.description).toContain("2 篇论文");
  });

  it("proxy path ends the chain without increasing meetingCount", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-domestic-1",
        conferenceName: "PRCV",
        conferenceYear: 2026,
        city: "北京",
        country: "中国",
        region: "domestic",
        grade: "C",
        paperCount: 1,
        paperIds: ["paper-1"],
      },
      {
        favor: 0,
        research: 0,
        social: 0,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: createConferenceEncounterState(),
        conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0.99,
    );

    state = {
      ...state,
      phase: "playing",
      papers: [{
        id: "paper-1",
        title: "论文 1",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "C",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      eventQueue: [createEventQueueItem(root, 1)],
    };
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "proxy" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "proxy-finish" });

    expect(state.eventCounters.meetingCount).toBe(0);
    expect(state.papers[0]?.conferenceHandled).toBe(true);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("self attendance enters the real activity chain and applies audited base effects", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-domestic-2",
        conferenceName: "PRCV",
        conferenceYear: 2026,
        city: "北京",
        country: "中国",
        region: "domestic",
        grade: "C",
        paperCount: 1,
        paperIds: ["paper-2"],
      },
      {
        favor: 0,
        research: 0,
        social: 0,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: createConferenceEncounterState(),
        conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0,
    );

    state = {
      ...state,
      phase: "playing",
      player: { ...state.player, san: 10, money: 10 },
      papers: [{
        id: "paper-2",
        title: "论文 2",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "C",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      eventQueue: [createEventQueueItem(root, 1)],
    };
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "self" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enter-venue" });

    expect(state.eventCounters.meetingCount).toBe(1);
    expect(state.papers[0]?.conferenceHandled).toBe(true);
    expect(state.eventQueue[0]?.chainId).toBe("conference-activity");
    expect(state.eventQueue[0]?.stage).toBe("act1");

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "tour-local" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });

    expect(state.player.money).toBe(8);
    expect(state.player.san).toBe(16);
    expect(state.eventCounters.tourCount).toBe(1);
    expect(state.eventCounters.teaBreakCount).toBe(0);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("enterprise networking enqueues internship invite after the activity result page", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-west-internship",
        conferenceName: "ICML",
        conferenceYear: 2026,
        city: "温哥华",
        country: "加拿大",
        region: "west",
        grade: "B",
        paperCount: 1,
        paperIds: ["paper-internship"],
      },
      {
        favor: 0,
        research: 0,
        social: 6,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: createConferenceEncounterState(),
        conferenceCareerState: { ...createConferenceCareerState(), enterpriseCount: 2 },
        internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0.99,
    );

    state = {
      ...state,
      phase: "playing",
      player: { ...state.player, money: 20, san: 10 },
      papers: [{
        id: "paper-internship",
        title: "论文 4",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "B",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      conferenceCareerState: { ...state.conferenceCareerState, enterpriseCount: 2 },
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "self" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enter-venue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enterprise-networking" });

    expect(state.conferenceCareerState.enterpriseCount).toBe(3);
    expect(state.eventQueue).toHaveLength(2);
    expect(state.eventQueue.map((event) => event.chainId)).toEqual(["conference-activity", "internship-invite"]);

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });

    expect(state.eventQueue[0]?.chainId).toBe("internship-invite");
    expect(state.eventQueue[0]?.stage).toBe("act1");
  });

  it("deep big-bull follow-up enqueues joint-training invite after the activity result page", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-west-joint-training",
        conferenceName: "ICML",
        conferenceYear: 2026,
        city: "温哥华",
        country: "加拿大",
        region: "west",
        grade: "B",
        paperCount: 1,
        paperIds: ["paper-joint-training"],
      },
      {
        favor: 0,
        research: 12,
        social: 6,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: {
          ...createConferenceEncounterState(),
          metBigBullCoop: true,
          bigBullDeepCount: 1,
        },
        conferenceCareerState: createConferenceCareerState(),
        internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0.99,
    );

    state = {
      ...state,
      phase: "playing",
      player: { ...state.player, money: 20, san: 10, social: 6, research: 12 },
      conferenceEncounterState: {
        ...state.conferenceEncounterState,
        metBigBullCoop: true,
        bigBullDeepCount: 1,
      },
      papers: [{
        id: "paper-joint-training",
        title: "?? 5",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "B",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "self" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enter-venue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "big-bull-joint-training" });

    expect(state.conferenceEncounterState.bigBullDeepCount).toBe(2);
    expect(state.eventQueue.map((event) => event.chainId)).toEqual(["conference-activity", "joint-training"]);

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });

    expect(state.eventQueue[0]?.chainId).toBe("joint-training");
    expect(state.eventQueue[0]?.stage).toBe("act1");
  });

  it("beautiful follow-up enqueues lover-development after the activity result page", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-west-lover",
        conferenceName: "ICML",
        conferenceYear: 2026,
        city: "测试城",
        country: "测试国",
        region: "west",
        grade: "B",
        paperCount: 1,
        paperIds: ["paper-lover"],
      },
      {
        favor: 0,
        research: 0,
        social: 12,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: {
          ...createConferenceEncounterState(),
          metBeautiful: true,
          beautifulCount: 1,
        },
        conferenceCareerState: createConferenceCareerState(),
        internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0.99,
    );

    state = {
      ...state,
      phase: "playing",
      player: { ...state.player, money: 20, san: 10, social: 12 },
      conferenceEncounterState: {
        ...state.conferenceEncounterState,
        metBeautiful: true,
        beautifulCount: 1,
      },
      papers: [{
        id: "paper-lover",
        title: "?? 6",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "B",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "self" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enter-venue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "beautiful-lover-development" });

    expect(state.conferenceEncounterState.beautifulCount).toBe(2);
    expect(state.eventQueue.map((event) => event.chainId)).toEqual(["conference-activity", "lover-development"]);

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });

    expect(state.eventQueue[0]?.chainId).toBe("lover-development");
    expect(state.eventQueue[0]?.stage).toBe("act1");
  });

  it("advanced first encounter updates conference encounter state through the event pipeline", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-west-2",
        conferenceName: "ICML",
        conferenceYear: 2026,
        city: "温哥华",
        country: "加拿大",
        region: "west",
        grade: "B",
        paperCount: 1,
        paperIds: ["paper-3"],
      },
      {
        favor: 0,
        research: 0,
        social: 6,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: createConferenceEncounterState(),
        conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0.99,
    );

    state = {
      ...state,
      phase: "playing",
      player: { ...state.player, san: 19, social: 6 },
      papers: [{
        id: "paper-3",
        title: "论文 3",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "B",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "self" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enter-venue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "smart-scholar" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });

    expect(state.player.social).toBe(7);
    expect(state.player.san).toBe(20);
    expect(state.temporaryActionEffects.idea.extraActions).toBe(2);
    expect(state.conferenceEncounterState.metSmart).toBe(true);
    expect(state.conferenceEncounterState.smartCount).toBe(1);
  });

  it("enterprise networking updates the conference career counter through the event pipeline", () => {
    let state = createInitialState();
    const root = createConferenceDecisionAct1(
      {
        id: "conf-domestic-3",
        conferenceName: "PRCV",
        conferenceYear: 2026,
        city: "上海",
        country: "中国",
        region: "domestic",
        grade: "C",
        paperCount: 1,
        paperIds: ["paper-4"],
      },
      {
        favor: 0,
        research: 0,
        social: 0,
        relationshipState: createRelationshipState(),
        conferenceEncounterState: createConferenceEncounterState(),
        conferenceCareerState: createConferenceCareerState(),
      internshipState: createInternshipState(),
        shopState: createShopState(),
        eventSupport: {
          hasGameController: false,
          hasParasol: false,
          hasDownJacket: false,
          hasBadmintonRacket: false,
          hasStrongBodyTalent: false,
          hasFinanceTalent: false,
        },
        eventCounters: createEventCounters(),
      },
      () => 0.99,
    );

    state = {
      ...state,
      phase: "playing",
      papers: [{
        id: "paper-4",
        title: "论文 4",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "C",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        submittedMonth: 10,
        submittedYear: 1,
        conferenceHandled: false,
        publication: null,
      }],
      eventQueue: [createEventQueueItem(root, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "self" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enter-venue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "enterprise-networking" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });

    expect(state.temporaryActionEffects.experiment.multiplier).toBe(1.25);
    expect(state.conferenceCareerState.enterpriseCount).toBe(1);
  });
});
