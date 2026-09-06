import { describe, expect, it } from "vitest";

import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { collectFixedEventsForState } from "../src/core/v2-fixed-events";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import { pushLog, pushNoOpLog } from "../src/core/v2-engine-helpers";

function startGame() {
  return dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
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

  it("delays the conference event by three months after a confirmed publication", () => {
    const base = startGame();
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0),
      status: "published" as const,
      target: "A" as const,
      idea: 24,
      experiment: 23,
      writing: 23,
      submittedIdea: 24,
      submittedExperiment: 23,
      submittedWriting: 23,
      submittedMonth: 1,
      submittedYear: 1,
      conferenceHandled: false,
      conferenceAvailableAtTotalMonths: 4,
    }, 1, "Poster", 1);
    let state: ReturnType<typeof startGame> = {
      ...base,
      year: 1,
      month: 1,
      totalMonths: 1,
      eventQueue: [],
      availableRandomEvents: [],
      usedRandomEvents: [],
      externalPublications: [paper],
    };

    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(2);
    expect(state.eventQueue.some((event) => event.title === "论文参会")).toBe(false);
    state = { ...state, eventQueue: [] };
    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(3);
    expect(state.eventQueue.some((event) => event.title === "论文参会")).toBe(false);
    state = { ...state, eventQueue: [] };
    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(4);
    expect(state.eventQueue.some((event) => event.title === "论文参会")).toBe(true);
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
    expect(forced.player.money).toBe(state.player.money + 3);
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
    const base = dispatchAction(startGame(), "create-paper", { paperSlotIndex: 0 });
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
    expect(forced.player.money).toBe(state.player.money + 1);
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

  it("keeps paper topic and discard actions available in the pre-enrollment preview", () => {
    const created = dispatchAction(startGame(), "create-paper", { paperSlotIndex: 0 });
    const paper = created.papers[0];
    if (!paper) throw new Error("preview paper is missing");

    const rerolled = dispatchAction(created, "reroll-paper-topic", { paperId: paper.id });
    expect(rerolled.papers[0]?.topicLabel).not.toBe(paper.topicLabel);

    const discarded = dispatchAction(rerolled, "discard-paper", { paperId: paper.id });
    expect(discarded.papers.some((entry) => entry.id === paper.id)).toBe(false);

    const rested = dispatchAction(startGame(), "rest");
    expect(rested.actionState.used).toBe(1);
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
    expect(advanced.player.money).toBe(state.player.money + 3);
    expect(advanced.player.san).toBe(14);
    expect(advanced.buffs).toEqual([]);
    expect(advanced.log[0]?.text).toBe([
      "进入第 1 年 2 月。",
      "月初结算：自动恢复 SAN +1｜导师工资 金币 +1｜秋季 SAN +1｜每月补贴 金币 +2",
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

    state = resolveCurrent(state);
    expect(state.eventQueue[0]?.stage).toBe("act2");
    expect(state.eventQueue[0]?.description).toContain("已经发表 1 篇论文（B 类 1 篇），科研分是 2");
    expect(state.eventQueue[0]?.description).toContain("今年转博需要达到 2 分");
    expect(state.eventQueue[0]?.description).toContain("同届同门");
    expect(state.eventQueue[0]?.description).toContain("读博压力");

    const decision = state.eventQueue[0];
    expect(decision?.choices.map((choice) => choice.id)).toContain("transfer-phd");
    expect(decision?.choices.find((choice) => choice.id === "transfer-phd")?.outcome).toContain("读博压力");
    state = dispatchAction(state, "resolve-event", {
      eventId: decision?.id,
      eventChoiceId: "transfer-phd",
    });
    expect(state.degree).toBe("master");
    expect(state.eventQueue[0]?.stage).toBe("result");
    expect(state.eventQueue[0]?.description).toContain("基础的每月 SAN +1 仍会生效");

    state = resolveCurrent(state);
    expect(state.degree).toBe("phd");
    expect(state.phdStartYear).toBe(3);
    expect(state.maxMonths).toBe(68);
    expect(state.graduationScoreTarget).toBe(7);
    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory.at(-1)?.stages).toHaveLength(3);
    expect(state.log[0]?.text).toContain("转博抉择");
    expect(state.log[0]?.text).toContain("读博压力");
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

  it("queues the PhD decision in months 22 and 34 for master's students", () => {
    const secondYear = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      year: 2,
      month: 10,
      totalMonths: 22,
      eventQueue: [],
    };
    const thirdYear = { ...secondYear, year: 3, totalMonths: 34 };

    expect(collectFixedEventsForState(secondYear, () => 0.5).map((event) => event.chainId)).toContain("phd-decision");
    expect(collectFixedEventsForState(thirdYear, () => 0.5).map((event) => event.chainId)).toContain("phd-decision");
    expect(collectFixedEventsForState({ ...thirdYear, degree: "phd" }, () => 0.5).map((event) => event.chainId)).not.toContain("phd-decision");
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

  it("makes every debug event button observable with one click", () => {
    const eventIds = DEBUG_EVENT_GROUPS.flatMap((group) => group.buttons.map((button) => button.id));

    for (const eventId of eventIds) {
      const state = { ...startGame(), eventQueue: [] };
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
      "打王者荣耀",
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
    expect(rest.outcome).toContain("休息（SAN+2｜行动点-1）");
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
    expect(state.log[0]?.text).toContain("看论文 2 次");
    expect(state.log[0]?.text).not.toContain("阅读累计");
    expect(state.buffs.some((buff) => buff.id.startsWith("read-paper-idea-"))).toBe(true);
    expect(state.log.filter((entry) => entry.text.startsWith("看论文："))).toHaveLength(0);
  });
});
