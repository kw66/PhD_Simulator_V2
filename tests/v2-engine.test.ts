import { describe, expect, it } from "vitest";

import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { getConferenceInfo } from "../src/core/v2-conference-catalog";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { collectFixedEventsForState } from "../src/core/v2-fixed-events";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import { pushLog, pushNoOpLog } from "../src/core/v2-engine-helpers";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { isPreEnrollmentState } from "../src/core/v2-progression";

function startGame() {
  return dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
}

function admitGame(state = startGame()) {
  let next = state;
  for (const choiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = next.eventQueue.find((entry) => entry.chainId === "before-grad-school");
    if (!event) break;
    next = dispatchAction(next, "resolve-event", { eventId: event.id, eventChoiceId: choiceId });
  }
  return dispatchAction(next, "next-month");
}

function resolveCurrent(state: ReturnType<typeof startGame>) {
  const event = state.eventQueue[0];
  const choice = event?.choices[0];
  if (!event || !choice) throw new Error("current event is missing");
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

describe("minimal game engine", () => {
  it("keeps no-op and empty messages out of the timeline", () => {
    const initial = startGame();
    const withMessage = pushNoOpLog(initial, "重复操作：当前状态没有变化");
    const duplicate = pushNoOpLog(withMessage, "重复操作：当前状态没有变化");

    expect(withMessage.log).toHaveLength(initial.log.length + 1);
    expect(duplicate.log).toEqual(withMessage.log);
    expect(pushNoOpLog(duplicate, "   ").log).toEqual(duplicate.log);
    expect(pushLog(duplicate, "重复操作：当前状态没有变化").log).toHaveLength(duplicate.log.length + 1);
  });

  it("starts with the pre-enrollment event and preserves its multi-scene chain", () => {
    let state = startGame();
    expect(state.phase).toBe("playing");
    expect(state.month).toBe(0);
    expect(state.eventQueue[0]?.chainId).toBe("before-grad-school");

    state = resolveCurrent(state);
    expect(state.eventQueue[0]?.stage).toBe("act2");
    expect(state.eventQueue[0]?.history).toHaveLength(1);
  });

  it("blocks calendar advancement until blocking events are resolved", () => {
    const state = startGame();
    const next = dispatchAction(state, "next-month");
    expect(next.totalMonths).toBe(0);
    expect(next.log).toEqual(state.log);
  });

  it("enters month one directly without a player pre-enrollment living-cost or family-support cycle", () => {
    const initial = startGame();
    initial.player.money = 0;
    expect(isPreEnrollmentState(initial)).toBe(true);
    expect(previewNextMonthEffects(initial).items).toEqual([]);
    const enrolled = admitGame(initial);
    expect(enrolled).toMatchObject({ phase: "playing", month: 1, totalMonths: 1, player: { money: 0 } });
    expect(isPreEnrollmentState(enrolled)).toBe(false);
    expect(enrolled.advisorProgressState.funding).toBe(initial.advisorProgressState.funding);
    const preview = previewNextMonthEffects(enrolled);
    expect(preview.items.find((item) => item.id === "advisor-salary")?.stats.money).toBe(1);
    expect(preview.items.find((item) => item.id === "living-cost")?.stats.money).toBe(-1);
    expect(preview.totals.money).toBe(0);
    const advanced = dispatchAction({ ...enrolled, eventQueue: [], availableRandomEvents: [] }, "next-month");
    expect(advanced).toMatchObject({ phase: "playing", month: 2, totalMonths: 2, player: { money: 0 } });
  });

  it("preserves existing relationship cards when mentoring is delegated", () => {
    const initial = createInitialState();
    const fellow = createCustomFellowProgressProfile({
      type: "junior",
      gender: "female",
      startTotalMonths: 17,
      research: 3,
      affinity: 3,
      name: "现有同学",
    });
    const base = {
      ...initial,
      phase: "playing" as const,
      year: 2,
      month: 5,
      totalMonths: 17,
      eventQueue: [],
      availableRandomEvents: [1],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
      selectedAdvisorName: "导师",
      player: { ...initial.player, social: 0 },
      relationshipState: { ...initial.relationshipState, advisorCount: 1, juniorCount: 1, occupiedSlots: 1, unlockedSlots: 3 },
      fellowProgressState: [fellow],
    };
    const rolls = [0.7, 0, 0];
    const collected = collectRandomEventsForMonth(base, () => rolls.shift() ?? 0);
    let state = {
      ...collected.nextState,
      eventQueue: [createEventQueueItem(collected.events[0]!, 1)],
    };
    const intro = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: intro.id, eventChoiceId: intro.choices[0]?.id });
    const decision = state.eventQueue.find((event) => event.chainId === "random-1")!;
    const delegate = decision.choices.find((choice) => choice.id.includes("delegate"))!;
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: delegate.id });

    expect(state.fellowProgressState).toEqual([fellow]);
    expect(state.relationshipState).toMatchObject({ advisorCount: 1, juniorCount: 1, occupiedSlots: 1 });
  });

  it("saves early attendance confirmation without early citations and activates once three months after acceptance", () => {
    const base = admitGame();
    const paper = {
      ...createDraftPaper(1, 0, () => 0),
      status: "reviewing" as const,
      target: "A" as const,
      idea: 100,
      experiment: 100,
      writing: 100,
      submittedIdea: 100,
      submittedExperiment: 100,
      submittedWriting: 100,
      submittedMonth: 1,
      submittedYear: 1,
      reviewMonthsLeft: 0,
    };
    let state: ReturnType<typeof startGame> = {
      ...base,
      year: 1,
      month: 4,
      totalMonths: 4,
      eventQueue: [],
      availableRandomEvents: [],
      usedRandomEvents: [],
      illnessProbability: 0,
      player: { ...base.player, money: 30 },
      advisorProgressState: { ...base.advisorProgressState, funding: 30 },
      papers: [paper],
    };
    const venue = getConferenceInfo(1, "A", 1).name;
    state = resolveDuePaperReviews(state, () => 0).state;
    expect(state.eventQueue[0]?.title).toBe(`${venue}结果`);
    state = resolveCurrent(resolveCurrent(state));
    expect(state.eventQueue[0]?.stage).toBe("result");
    expect(state.advisorProgressState.funding).toBe(30);
    const moneyBeforeConfirmation = state.player.money;
    state = resolveCurrent(state);
    expect(state.advisorProgressState.funding).toBe(29);
    expect(state.player.money).toBe(moneyBeforeConfirmation);
    expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual([paper.id]);
    expect(state.externalPublications.find((entry) => entry.id === paper.id)).toMatchObject({
      acceptedTotalMonths: 4, conferenceAvailableAtTotalMonths: 7, conferenceHandled: false,
    });
    const attendance = state.eventQueue.find((event) => event.conferencePreview)!;
    expect(attendance).toMatchObject({ title: `${venue}参会`, deadlineMonths: 3 });
    const travel = { domestic: 2, asia: 4, west: 6 }[attendance.conferencePreview!.context.region];
    const initialMeetingCount = state.eventCounters.meetingCount;
    for (const choiceId of ["continue", "self", "enter-venue"]) {
      const event = state.eventQueue.find((entry) => entry.chainId === attendance.chainId)!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId });
    }
    expect(state.player.money).toBe(moneyBeforeConfirmation - travel);
    expect(state.advisorProgressState.funding).toBe(29);
    expect(state.advisorProgressState.paidPlayerConferenceTrips).toHaveLength(1);
    expect(state.eventCounters.meetingCount).toBe(initialMeetingCount);
    expect(state.externalPublications.find((entry) => entry.id === paper.id)).toMatchObject({
      conferenceHandled: false, publication: { citations: 0 },
    });
    expect(state.eventQueue.some((event) => event.chainId.endsWith("-activity"))).toBe(false);
    expect(state.conferenceAttendancePlans).toHaveLength(1);
    expect(state.conferenceAttendancePlans?.[0]).toMatchObject({
      mode: "self", context: { paperIds: [paper.id], availableAtTotalMonths: 7 },
    });
    const savedPlan = structuredClone(state.conferenceAttendancePlans![0]);
    state = JSON.parse(JSON.stringify(state)) as typeof state;
    for (const totalMonths of [5, 6, 7]) {
      const fundingBeforeMonth = state.advisorProgressState.funding;
      state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
      expect(state.totalMonths).toBe(totalMonths);
      expect(state.advisorProgressState.funding).toBe(fundingBeforeMonth - 1);
      expect(state.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual([paper.id]);
      const trips = state.eventQueue.filter((event) => event.conferencePreview);
      expect(trips).toHaveLength(0);
      expect(state.externalPublications.find((entry) => entry.id === paper.id)).toMatchObject({
        conferenceHandled: totalMonths === 7, publication: { citations: 0 },
      });
      expect(state.eventCounters.meetingCount).toBe(initialMeetingCount + (totalMonths === 7 ? 1 : 0));
      expect(state.conferenceAttendancePlans).toEqual(totalMonths === 7 ? [] : [savedPlan]);
      const activities = state.eventQueue.filter((event) => event.chainId === `${attendance.chainId}-activity`);
      expect(activities).toHaveLength(totalMonths === 7 ? 1 : 0);
      if (totalMonths === 7) expect(activities[0]?.title).toBe(`${venue}活动`);
    }
    expect(state.externalPublications.find((entry) => entry.id === paper.id)?.conferenceHandledAtTotalMonths).toBe(7);
    const activity = state.eventQueue.find((event) => event.chainId === `${attendance.chainId}-activity`)!;
    state = dispatchAction(JSON.parse(JSON.stringify(state)), "resolve-event", { eventId: "already-resolved", eventChoiceId: "continue" });
    expect(state.eventQueue.filter((event) => event.chainId === activity.chainId)).toEqual([activity]);
    expect(state.eventCounters.meetingCount).toBe(initialMeetingCount + 1);
    state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
    expect(state.totalMonths).toBe(8);
    expect(state.eventCounters.meetingCount).toBe(initialMeetingCount + 1);
    expect(state.conferenceAttendancePlans).toEqual([]);
    expect(state.eventQueue.some((event) => event.chainId === activity.chainId || event.conferencePreview)).toBe(false);
    expect(state.externalPublications.find((entry) => entry.id === paper.id)?.publication?.citations).toBeGreaterThan(0);
  });

  it("force advances through real month settlement after deleting only current blockers", () => {
    const makeEvent = (id: string, blocking: boolean, deadlineMonths: number, queueOrder: number) => createEventQueueItem({
      id,
      title: id,
      description: "测试事件",
      source: "random" as const,
      blocking,
      deadlineMonths,
      chainId: id,
      stage: "act1" as const,
      choices: [{
        id: "confirm",
        label: "确认",
        outcome: "测试",
        effects: {},
      }],
    }, queueOrder);
    const state = {
      ...startGame(),
      year: 1,
      month: 1,
      totalMonths: 1,
      selectedAdvisorName: "测试导师",
      illnessProbability: 0,
      availableRandomEvents: [],
      usedRandomEvents: [],
      eventQueue: [
        makeEvent("due-blocker-a", true, 0, 1),
        makeEvent("due-blocker-b", true, 0, 2),
        makeEvent("future-blocker", true, 2, 3),
        makeEvent("deferrable", false, 1, 4),
      ],
      buffs: [{
        id: "force-next-month-settlement",
        name: "月度测试",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        monthlyStats: { money: 2 },
      }],
    };

    const ordinaryBlocked = dispatchAction(state, "next-month");
    expect(ordinaryBlocked.totalMonths).toBe(1);
    expect(ordinaryBlocked.eventQueue).toHaveLength(4);

    const manuallyCleared = {
      ...state,
      eventQueue: state.eventQueue.filter((event) => event.id !== "due-blocker-a" && event.id !== "due-blocker-b"),
    };
    const expected = dispatchAction(manuallyCleared, "next-month");
    const forced = dispatchAction(state, "force-next-month");
    const withoutLogIds = (value: typeof forced) => ({
      ...value,
      log: value.log.map(({ id: _id, ...entry }) => entry),
    });

    expect(withoutLogIds(forced)).toEqual(withoutLogIds(expected));
    expect(forced.totalMonths).toBe(2);
    expect(forced.player.money).toBe(state.player.money + 1 + 2 - 1);
    expect(forced.eventQueue.some((event) => event.id === "due-blocker-a" || event.id === "due-blocker-b")).toBe(false);
    expect(forced.eventQueue.find((event) => event.id === "future-blocker")?.deadlineMonths).toBe(1);
    expect(forced.eventQueue.find((event) => event.id === "deferrable")?.deadlineMonths).toBe(0);

    const debugShifted = dispatchAction(state, "debug-shift-month", { delta: 1 });
    expect(debugShifted.totalMonths).toBe(2);
    expect(debugShifted.player.money).toBe(state.player.money);
    expect(debugShifted.buffs).toEqual(state.buffs);
    expect(debugShifted.eventQueue).toEqual(state.eventQueue);
  });

  it("cleans event-only state without applying discarded event outcomes", () => {
    const base = dispatchAction(admitGame(), "create-paper", { paperSlotIndex: 0 });
    const paperId = base.papers[0].id;
    const state = {
      ...base,
      year: 1,
      month: 1,
      totalMonths: 1,
      selectedAdvisorName: "测试导师",
      illnessProbability: 0,
      availableRandomEvents: [],
      usedRandomEvents: [],
      player: { ...base.player, san: 10 },
      papers: base.papers.map((paper) => paper.id === paperId
        ? { ...paper, conferenceHandled: false }
        : paper),
      buffs: [{
        id: "pending-event-penalty",
        name: "待处理事件惩罚",
        source: "测试事件",
        timing: "monthly" as const,
        remainingMonths: null,
        activeOperationSanMultiplier: 2,
      }],
      eventQueue: [createEventQueueItem({
        id: "discard-cleanup",
        title: "待删除事件",
        description: "测试事件",
        source: "random" as const,
        blocking: true,
        deadlineMonths: 0,
        chainId: "discard-cleanup",
        stage: "act1" as const,
        removeBuffIdsOnCompletion: ["pending-event-penalty"],
        discardPaperUpdates: [{ id: paperId, conferenceHandled: true }],
        choices: [{
          id: "costly-choice",
          label: "付出代价",
          outcome: "SAN -5｜金币 -5",
          effects: { san: -5, money: -5 },
        }],
      }, 1)],
    };

    const forced = dispatchAction(state, "force-next-month");

    expect(forced.buffs.some((buff) => buff.id === "pending-event-penalty")).toBe(false);
    expect(forced.papers.find((paper) => paper.id === paperId)?.conferenceHandled).toBe(true);
    expect(forced.player.san).toBe(state.player.san + 2);
    expect(forced.player.money).toBe(state.player.money + 1 - 1);
  });

  it("runs the workstation reading action once per monthly action point", () => {
    const state = { ...startGame(), eventQueue: [], month: 1, totalMonths: 1 };
    const firstRead = dispatchAction(state, "read-paper");
    expect(firstRead.readingState.readCount).toBe(1);
    expect(firstRead.actionState).toEqual({ used: 1, limit: 1, aiResearchBonusUsed: false });
    expect(firstRead.log[0]?.text).toContain("看论文 1 次");

    const secondRead = dispatchAction(firstRead, "read-paper");
    expect(secondRead).toEqual(firstRead);
  });

  it("keeps paper topic and discard actions locked before enrollment", () => {
    const initial = startGame();
    expect(dispatchAction(initial, "create-paper", { paperSlotIndex: 0 })).toEqual(initial);
    const paper = createDraftPaper(0, 0, () => 0);
    const created = { ...initial, papers: [paper] };

    const rerolled = dispatchAction(created, "reroll-paper-topic", { paperId: paper.id });
    expect(rerolled).toEqual(created);

    const discarded = dispatchAction(rerolled, "discard-paper", { paperId: paper.id });
    expect(discarded).toEqual(created);

    const rested = dispatchAction(created, "rest");
    expect(rested).toEqual(created);
  });

  it("runs tiered part-time work through the shared action and SAN settlement", () => {
    const state = { ...startGame(), eventQueue: [], month: 1, totalMonths: 1 };
    const firstWork = dispatchAction(state, "part-time-work");

    expect(firstWork.partTimeWorkCount).toBe(1);
    expect(firstWork.player.san).toBe(15);
    expect(firstWork.player.money).toBe(3);
    expect(firstWork.actionState).toEqual({ used: 1, limit: 1, aiResearchBonusUsed: false });
    expect(firstWork.log[0]?.text).toContain("第 1 次兼职，SAN -5｜金币 +2");
    expect(dispatchAction(firstWork, "part-time-work")).toEqual(firstWork);

    const ninthWork = dispatchAction({
      ...state,
      partTimeWorkCount: 8,
    }, "part-time-work");
    expect(ninthWork.partTimeWorkCount).toBe(9);
    expect(ninthWork.player.san).toBe(14);
    expect(ninthWork.player.money).toBe(4);

    const modifiedWork = dispatchAction({
      ...state,
      month: 8,
      buffs: [{
        id: "work-cost-multiplier",
        name: "主动操作 SAN ×2",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        activeOperationSanMultiplier: 2,
      }],
    }, "part-time-work");
    expect(modifiedWork.player.san).toBe(11);
  });

  it("advances only the calendar, buffs, event deadlines, events and logs", () => {
    const state = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      eventQueue: [],
      illnessProbability: 0,
      availableRandomEvents: [],
      usedRandomEvents: [],
      buffs: [{
        id: "monthly-money",
        name: "每月补贴",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        monthlyStats: { money: 2 },
      }],
    };

    const enrolled = dispatchAction(state, "next-month");
    expect(enrolled.totalMonths).toBe(1);
    expect(enrolled.player.money).toBe(state.player.money);

    const unblocked = {
      ...enrolled,
      player: { ...enrolled.player, san: 12 },
      eventQueue: [],
    };
    const advanced = dispatchAction(unblocked, "next-month");
    expect(advanced.totalMonths).toBe(2);
    expect(advanced.player.money).toBe(state.player.money + 1 + 2 - 1);
    expect(advanced.player.san).toBe(14);
    expect(advanced.buffs).toEqual([]);
    expect(advanced.log[0]?.text).toBe([
      "进入第 1 年 2 月。",
      "月初结算：自动恢复 SAN +1｜学生工资 金币 +1｜生活费 金币 -1｜秋季 SAN +1｜每月补贴 金币 +2",
    ].join("\n"));
  });

  it("applies state changes directly and converts only future modifiers to Buffs", () => {
    const state = {
      ...startGame(),
      eventQueue: [createEventQueueItem({
        id: "core-effect",
        title: "核心效果",
        description: "测试当前事件边界。",
        source: "random" as const,
        blocking: true,
        deadlineMonths: 0,
        chainId: "core-effect",
        stage: "act1" as const,
        choices: [{
          id: "apply",
          label: "确认",
          outcome: "科研 +2，下次灵感 +3。",
          effects: {
            research: 2,
            score: 3,
            temporaryActionEffectUpdates: { idea: { bonus: 3 } },
            thesisProgress: 50,
            relationshipAdditions: ["junior"],
          },
        }],
      }, 1)],
    };

    const resolved = dispatchAction(state, "resolve-event", { eventId: "core-effect", eventChoiceId: "apply" });
    expect(resolved.player.research).toBe(state.player.research + 2);
    expect(resolved.totalResearchScore).toBe(state.totalResearchScore + 3);
    expect(resolved.thesis).toMatchObject({ progress: 50, started: true, completed: false });
    expect(resolved.relationshipState.juniorCount).toBe(state.relationshipState.juniorCount + 1);
    expect(resolved.buffs.map((buff) => buff.name)).toEqual(["下次想 idea +3分"]);
    expect(resolved.eventHistory).toHaveLength(1);
    expect(resolved.log[0]?.text).toBe("核心效果：科研 +2，下次灵感 +3。");
  });

  it("completes the three-stage PhD decision and applies the degree change", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      year: 2,
      month: 1,
      totalMonths: 13,
      totalResearchScore: 2,
      papers: [],
      externalPublications: [{
        id: "published-b",
        title: "测试论文",
        topicId: "test",
        topicLabel: "测试方向",
        heatMultiplier: 1,
        prepublicationDecayRate: 0.1,
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "published",
        target: "B",
        reviewMonthsLeft: 0,
        submittedIdea: 0,
        submittedExperiment: 0,
        submittedWriting: 0,
        publication: null,
      }],
      eventQueue: [],
    };
    state = {
      ...state,
      eventQueue: [createEventQueueItem(createPhdDecisionEvent(state, 2), 1)],
    };

    expect(state.eventQueue[0]?.description).toContain("已发表一作1篇，科研分2");
    expect(state.eventQueue[0]?.description).toContain("今年转博需要达到 2 分");
    state = resolveCurrent(state);
    expect(state.eventQueue[0]?.stage).toBe("act2");
    expect(state.eventQueue[0]?.description).toContain("同门投出去的简历迟迟没有回应");
    expect(state.eventQueue[0]?.description).toContain("别觉得多一张文凭就稳了");

    const decision = state.eventQueue[0];
    const moneyBeforeTransfer = state.player.money;
    const fundingBeforeTransfer = state.advisorProgressState.funding;
    expect(decision?.choices.map((choice) => choice.id)).toContain("transfer-phd");
    expect(decision?.choices.map((choice) => choice.label)).toEqual(["继续硕士", "申请转博"]);
    expect(decision?.choices.find((choice) => choice.id === "transfer-phd")?.outcome).toContain("每月SAN -1");
    expect(decision?.choices.find((choice) => choice.id === "transfer-phd")?.outcome).toContain("毕业要求 1→7分");
    state = dispatchAction(state, "resolve-event", {
      eventId: decision?.id,
      eventChoiceId: "transfer-phd",
    });
    expect(state.degree).toBe("master");
    expect(state.eventQueue[0]?.stage).toBe("result");
    expect(state.eventQueue[0]?.description).toContain("条件：科研分 2 ≥ 2｜结果：毕业要求 1→7分");
    expect(state.eventQueue[0]?.description).toContain("工资 1→2.5金");
    expect(state.eventQueue[0]?.description).toContain("学院确认了你的转博资格");
    expect(state.eventQueue[0]?.description).not.toMatch(/月末判断|基础的每月 SAN \+1|毕业要求调整/);
    expect(state.player.money).toBe(moneyBeforeTransfer);
    expect(state.advisorProgressState.funding).toBe(fundingBeforeTransfer);

    state = resolveCurrent(state);
    expect(state.degree).toBe("phd");
    expect(state.phdStartYear).toBe(3);
    expect(state.maxMonths).toBe(70);
    expect(state.graduationScoreTarget).toBe(7);
    expect(state.player.money).toBe(moneyBeforeTransfer);
    expect(state.advisorProgressState.funding).toBe(fundingBeforeTransfer);
    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory.at(-1)?.stages).toHaveLength(3);
    expect(state.log[0]?.text).toContain("转博抉择");
    expect(state.log[0]?.text).toContain("每月SAN -1");
    expect(state.buffs.find((buff) => buff.id === "phd-pressure")).toMatchObject({
      name: "读博压力",
      source: "转博",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { san: -1 },
      description: "博士阶段的长期压力使每月 SAN -1",
    });

    const nextMonth = dispatchAction({
      ...state,
      player: { ...state.player, san: 10 },
      eventQueue: [],
    }, "next-month");
    expect(nextMonth.player.san).toBe(11);
    expect(nextMonth.log[0]?.text).toContain("自动恢复 SAN +1");
    expect(nextMonth.log[0]?.text).toContain("读博压力 SAN -1");
    expect(nextMonth.log[0]?.text).toContain("秋季 SAN +1");
  });

  it("defers settlement effects and ending checks until the result is confirmed", () => {
    const resultEvent = {
      id: "deferred-ending-result",
      title: "礼物送达",
      description: "礼物已经送到。\n\n机制结算\n金币 -2",
      source: "fixed" as const,
      blocking: true,
      deadlineMonths: 0,
      chainId: "deferred-ending",
      stage: "result" as const,
      choices: [{ id: "confirm", label: "确定", outcome: "结算完成。", effects: {} }],
    };
    const decisionEvent = createEventQueueItem({
      id: "deferred-ending-decision",
      title: "选择礼物",
      description: "你决定买下礼物。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "deferred-ending",
      stage: "act2",
      choices: [{
        id: "buy",
        label: "购买",
        outcome: "买下礼物。",
        effects: { money: -2, enqueueEvents: [resultEvent] },
      }],
    }, 1);
    let state = {
      ...startGame(),
      player: { ...startGame().player, money: 1 },
      eventQueue: [decisionEvent],
    };

    state = dispatchAction(state, "resolve-event", {
      eventId: decisionEvent.id,
      eventChoiceId: "buy",
    });
    expect(state.player.money).toBe(1);
    expect(state.phase).toBe("playing");
    expect(state.eventQueue[0]).toMatchObject({ id: resultEvent.id, stage: "result" });

    state = dispatchAction(state, "debug-adjust-stat", { debugStatId: "research", delta: 5 });
    const debuggedResearch = state.player.research;

    state = dispatchAction(state, "resolve-event", {
      eventId: resultEvent.id,
      eventChoiceId: "confirm",
    });
    expect(state.player.money).toBe(-1);
    expect(state.player.research).toBe(debuggedResearch);
    expect(state.phase).toBe("finished");
    expect(state.ending).toBe("poor");
  });

  it("adds tier changes to the completed event log after confirmation", () => {
    const resultEvent = {
      id: "tier-change-result",
      title: "学习结果",
      description: "你摸到了新的门槛。\n\n机制结算\n科研 +1",
      source: "fixed" as const,
      blocking: true,
      deadlineMonths: 0,
      chainId: "tier-change",
      stage: "result" as const,
      completionLog: "科研 +1。",
      choices: [{ id: "confirm", label: "确定", outcome: "结算完成。", effects: {} }],
    };
    const decisionEvent = createEventQueueItem({
      id: "tier-change-decision",
      title: "学习选择",
      description: "你决定继续钻研。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "tier-change",
      stage: "act2",
      choices: [{
        id: "learn",
        label: "学习",
        outcome: "科研 +1。",
        effects: { research: 1, enqueueEvents: [resultEvent] },
      }],
    }, 1);
    let state = {
      ...startGame(),
      player: { ...startGame().player, research: 5 },
      eventQueue: [decisionEvent],
    };

    state = dispatchAction(state, "resolve-event", {
      eventId: decisionEvent.id,
      eventChoiceId: "learn",
    });
    expect(state.player.research).toBe(5);
    expect(state.log).toHaveLength(0);

    state = dispatchAction(state, "resolve-event", {
      eventId: resultEvent.id,
      eventChoiceId: "confirm",
    });
    expect(state.player.research).toBe(6);
    expect(state.log[0]?.text).toContain("学习选择：科研 +1。");
    expect(state.log[0]?.text).not.toContain("档位变化");
  });

  it("queues the PhD decision with VALSE in May months 21 and 33, never June", () => {
    const secondYear = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      year: 2,
      month: 9,
      totalMonths: 21,
      eventQueue: [],
    };
    const thirdYear = { ...secondYear, year: 3, totalMonths: 33 };

    expect(collectFixedEventsForState(secondYear, () => 0.5).map((event) => event.chainId)).toContain("phd-decision");
    expect(collectFixedEventsForState(thirdYear, () => 0.5).map((event) => event.chainId)).toContain("phd-decision");
    expect(collectFixedEventsForState({ ...thirdYear, degree: "phd" }, () => 0.5).map((event) => event.chainId)).not.toContain("phd-decision");
    expect(collectFixedEventsForState({ ...secondYear, year: 1, totalMonths: 9 }, () => 0.5)
      .some((event) => event.chainId === "phd-decision")).toBe(false);
    for (const state of [secondYear, thirdYear]) {
      expect(collectFixedEventsForState(state, () => 0.5).map((event) => event.chainId))
        .toEqual([`ccig-y${state.year}-m9`, "phd-decision"]);
      expect(collectFixedEventsForState({ ...state, month: 10, totalMonths: state.totalMonths + 1 }, () => 0.5)
        .some((event) => event.chainId === "phd-decision")).toBe(false);
    }
  });

  it("finishes at the training limit with graduation or delay", () => {
    const readyState = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      graduationScoreTarget: 1,
      year: 3,
      month: 10,
      totalMonths: 34,
      maxMonths: 34,
      eventQueue: [],
    };

    const graduated = dispatchAction({ ...readyState, totalResearchScore: 1 }, "next-month");
    expect(graduated.phase).toBe("finished");
    expect(graduated.ending).toBe("master");
    expect(graduated.log[0]?.text).toBe("硕士毕业：科研分 1/1。");

    const delayed = dispatchAction({ ...readyState, totalResearchScore: 0 }, "next-month");
    expect(delayed.phase).toBe("finished");
    expect(delayed.ending).toBe("delay");
    expect(delayed.log[0]?.text).toBe("延期毕业：科研分 0/1。");
  });

  it("allows core attributes to cross zero and trigger endings", () => {
    const event = createEventQueueItem({
      id: "san-ending",
      title: "压力测试",
      description: "测试负值结局。",
      source: "system",
      blocking: true,
      deadlineMonths: 0,
      chainId: "san-ending",
      stage: "act1",
      choices: [{ id: "apply", label: "确认", outcome: "SAN -1。", effects: { san: -1 } }],
    }, 1);
    const state = { ...startGame(), player: { ...startGame().player, san: 0 }, eventQueue: [event] };
    const resolved = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: "apply" });

    expect(resolved.player.san).toBe(-1);
    expect(resolved.phase).toBe("finished");
    expect(resolved.ending).toBe("burnout");
  });

  it("makes every debug event button observable when paper prerequisites are met", () => {
    const eventIds = DEBUG_EVENT_GROUPS.flatMap((group) => group.buttons.map((button) => button.id));

    for (const eventId of eventIds) {
      const paper = { ...createDraftPaper(0, 0, () => 0), idea: 4, experiment: 4, writing: 4 };
      const state = { ...startGame(), eventQueue: [], papers: [paper] };
      const next = dispatchAction(state, "debug-trigger-event", { eventId });
      expect(next, eventId).not.toEqual(state);
      expect(next.log[0]?.text ?? "", eventId).not.toMatch(/失败|无法生成/u);
      expect(next.eventQueue.length, eventId).toBeGreaterThan(0);
    }
  });

  it("routes the three disease debug buttons to three independent illness events", () => {
    const cases = [
      ["illness-stomach", "肚子虚弱", "illness-stomach"],
      ["illness-flu", "流感来袭", "illness-flu"],
      ["illness-fever", "高烧不退", "illness-fever"],
    ] as const;

    for (const [eventId, title, chainId] of cases) {
      const state = { ...startGame(), eventQueue: [] };
      const next = dispatchAction(state, "debug-trigger-event", { eventId });
      expect(next.eventQueue).toHaveLength(1);
      expect(next.eventQueue[0]?.title).toBe(title);
      expect(next.eventQueue[0]?.chainId).toBe(chainId);
      expect(next.eventQueue[0]?.description).not.toContain("一件计划外的事突然打断");
      expect(next.eventQueue[0]?.title).not.toBe("临时事务");
      expect(next.buffs).toContainEqual(expect.objectContaining({
        source: title,
        activeOperationSanMultiplier: eventId === "illness-stomach" ? 1.5 : eventId === "illness-flu" ? 2 : 2.5,
      }));
    }
  });

  it("gives only the selected non-urgent events one month before they become blocking", () => {
    const base = {
      ...startGame(),
      eventQueue: [],
      month: 6,
      totalMonths: 6,
      player: { ...startGame().player, research: 6, social: 6 },
    };
    const deferableEventIds = [
      "random-1",
      "random-2",
      "random-4",
      "random-8",
      "random-9",
      "random-10",
      "random-11",
      "random-12",
      "random-14",
      "random-15",
    ];
    const urgentEventIds = [
      "random-5",
      "random-6",
      "random-7",
      "random-13",
      "random-16",
      "illness-stomach",
      "illness-flu",
      "illness-fever",
      "mentor-assign",
    ];

    for (const eventId of deferableEventIds) {
      const next = dispatchAction(base, "debug-trigger-event", { eventId });
      expect(next.eventQueue[0]?.deadlineMonths, eventId).toBe(1);
    }
    for (const eventId of urgentEventIds) {
      const next = dispatchAction(base, "debug-trigger-event", { eventId });
      expect(next.eventQueue[0]?.deadlineMonths, eventId).toBe(0);
    }
  });

  it("makes a deferred event due after one month while still scheduling the new month's events", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      eventQueue: [],
      year: 2,
      month: 1,
      totalMonths: 13,
      illnessProbability: 0,
    };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "random-2" });
    expect(state.eventQueue[0]?.deadlineMonths).toBe(1);

    const nextMonth = dispatchAction(state, "next-month");
    expect(nextMonth.totalMonths).toBe(14);
    expect(nextMonth.eventQueue.find((event) => event.chainId === "random-2")?.deadlineMonths).toBe(0);
    expect(nextMonth.eventQueue.some((event) => event.chainId === "scholarship")).toBe(true);

    const blocked = dispatchAction(nextMonth, "next-month");
    expect(blocked.totalMonths).toBe(14);
  });

  it("turns a deferred event into a current-month task once the player starts it", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      eventQueue: [],
      month: 6,
      totalMonths: 6,
    };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "random-2" });
    expect(state.eventQueue[0]?.deadlineMonths).toBe(1);

    state = resolveCurrent(state);
    expect(state.eventQueue[0]?.stage).toBe("act2");
    expect(state.eventQueue[0]?.deadlineMonths).toBe(0);
  });

  it("opens and resolves the game-relaxation choice scene", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      eventQueue: [],
      month: 6,
      totalMonths: 6,
    };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "random-15" });
    const intro = state.eventQueue[0];
    const continueChoice = intro?.choices[0];
    if (!intro || !continueChoice) throw new Error("game-relaxation intro is missing");

    state = dispatchAction(state, "resolve-event", {
      eventId: intro.id,
      eventChoiceId: continueChoice.id,
    });
    const decision = state.eventQueue[0];
    expect(decision?.stage).toBe("act2");
    expect(decision?.choices.map((choice) => choice.label)).toEqual([
      "玩泰拉瑞亚",
      "玩魔塔50层",
      "玩研究生模拟器",
      "玩洛克王国世界",
    ]);

    const gradSimChoice = decision?.choices.find((choice) => choice.label === "玩研究生模拟器");
    if (!decision || !gradSimChoice) throw new Error("game-relaxation choice is missing");
    state = dispatchAction(state, "resolve-event", {
      eventId: decision.id,
      eventChoiceId: gradSimChoice.id,
    });
    expect(state.eventQueue[0]?.stage).toBe("result");
    state = resolveCurrent(state);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("resolves a naturally scheduled game-relaxation event after it is deferred", () => {
    const base: ReturnType<typeof startGame> = {
      ...startGame(),
      eventQueue: [],
      player: { ...startGame().player, san: 10 },
      month: 6,
      totalMonths: 6,
      availableRandomEvents: [15],
      usedRandomEvents: [],
      totalRandomEventCount: 0,
    };
    const rolls = [0.7, 0];
    const collection = collectRandomEventsForMonth(base, () => rolls.shift() ?? 0);
    const scheduled = collection.events[0];
    if (!scheduled) throw new Error("scheduled game-relaxation event is missing");
    let state = {
      ...collection.nextState,
      month: 7,
      totalMonths: 7,
      eventQueue: [{ ...createEventQueueItem(scheduled, 1), deadlineMonths: 0 }],
    };

    state = dispatchAction(state, "resolve-event", {
      eventId: scheduled.id,
      eventChoiceId: scheduled.choices[0]?.id,
    });
    expect(state.eventQueue[0]?.stage).toBe("act2");
    expect(state.log[0]?.text ?? "").not.toContain("当前事件选择无效");

    const decision = state.eventQueue[0];
    const gradSimChoice = decision?.choices.find((choice) => choice.label === "玩研究生模拟器");
    if (!decision || !gradSimChoice) throw new Error("deferred game-relaxation choice is missing");
    state = dispatchAction(state, "resolve-event", {
      eventId: decision.id,
      eventChoiceId: gradSimChoice.id,
    });
    expect(state.eventQueue[0]?.stage).toBe("result");
    expect(state.player.san).toBe(10);

    state = resolveCurrent(state);
    expect(state.player.san).toBe(12);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("keeps the illness Buff through all scenes and removes it only after final confirmation", () => {
    let state: ReturnType<typeof startGame> = { ...startGame(), eventQueue: [], month: 1, totalMonths: 1 };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "illness-flu" });
    const illnessBuffId = state.buffs.find((buff) => buff.source === "流感来袭")?.id;
    expect(illnessBuffId).toBeTruthy();

    state = resolveCurrent(state);
    expect(state.buffs.some((buff) => buff.id === illnessBuffId)).toBe(true);
    const decision = state.eventQueue[0];
    const hospital = decision?.choices.find((choice) => choice.label === "去医院");
    if (!decision || !hospital) throw new Error("illness decision is missing");
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: hospital.id });
    expect(state.buffs.some((buff) => buff.id === illnessBuffId)).toBe(true);

    state = resolveCurrent(state);
    expect(state.buffs.some((buff) => buff.id === illnessBuffId)).toBe(false);
  });

  it("combines illness rest SAN loss with one ordinary rest action", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      eventQueue: [],
      month: 1,
      totalMonths: 1,
      player: { ...startGame().player, san: 10 },
      actionState: { used: 0, limit: 1, aiResearchBonusUsed: false },
      illnessProbability: 0,
    };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "illness-flu" });
    state = resolveCurrent(state);
    const decision = state.eventQueue[0];
    const rest = decision?.choices.find((choice) => choice.label === "休息");
    if (!decision || !rest) throw new Error("illness rest choice is missing");
    expect(rest.outcome).toContain("SAN +2｜行动点 -1");
    expect(rest.outcome).not.toContain("普通休息");
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: rest.id });
    expect(state.player.san).toBe(10);
    expect(state.actionState.used).toBe(0);

    state = resolveCurrent(state);
    expect(state.player.san).toBe(6);
    expect(state.actionState.used).toBe(1);
    expect(state.buffs).toHaveLength(0);
  });

  it("keeps the hard-work illness penalty until the next month", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      eventQueue: [],
      month: 1,
      totalMonths: 1,
      illnessProbability: 0,
    };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "illness-stomach" });
    state = resolveCurrent(state);
    const decision = state.eventQueue[0];
    const hard = decision?.choices.find((choice) => choice.label === "硬撑工作");
    if (!decision || !hard) throw new Error("illness hard-work choice is missing");
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: hard.id });
    state = resolveCurrent(state);
    expect(state.buffs.some((buff) => buff.source === "肚子虚弱")).toBe(true);

    state = dispatchAction(state, "next-month");
    expect(state.buffs.some((buff) => buff.source === "肚子虚弱")).toBe(false);
  });

  it("applies the independent review cost and reading count only on final confirmation", () => {
    let state: ReturnType<typeof startGame> = {
      ...startGame(),
      eventQueue: [],
      month: 1,
      totalMonths: 1,
      actionState: { used: 1, limit: 1, aiResearchBonusUsed: false },
      readingState: { ...startGame().readingState, readCount: 9 },
    };
    state = dispatchAction(state, "debug-trigger-event", { eventId: "random-2" });
    state = resolveCurrent(state);
    const decision = state.eventQueue[0];
    const selfReview = decision?.choices.find((choice) => choice.label === "认真审稿");
    if (!decision || !selfReview) throw new Error("review decision is missing");
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: selfReview.id });
    expect(state.readingState.readCount).toBe(9);

    state = resolveCurrent(state);
    expect(state.readingState.readCount).toBe(11);
    expect(state.player.research).toBe(2);
    expect(state.player.san).toBe(16);
    expect(state.actionState).toEqual({ used: 1, limit: 1, aiResearchBonusUsed: false });
    expect(state.log.some((entry) => entry.text.includes("看论文 2 次"))).toBe(true);
    expect(state.eventHistory.some((entry) => entry.stages.some((stage) => stage.talentTrigger?.name === "阅读积累"))).toBe(true);
    expect(state.buffs.some((buff) => buff.id.startsWith("read-paper-idea-"))).toBe(true);
    expect(state.log.filter((entry) => entry.text.startsWith("看论文："))).toHaveLength(0);
  });
});
