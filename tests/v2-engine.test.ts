import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { BASE_RANDOM_EVENT_IDS } from "../src/core/v2-random-event-rules";
import type { GameState } from "../src/core/v2-types";

function startPreEnrollmentWith(
  roleId: "normal" | "genius" | "social" | "rich" | "teacher-child",
  advisorId: "level1" | "level2" | "level3" | "level4" | "level5" = "level5",
) {
  let state = createInitialState();
  state = dispatchAction(state, "select-role", { roleId });
  state = dispatchAction(state, "select-advisor", { advisorId });
  return dispatchAction(state, "start-game", { roleId, advisorId });
}

function startWith(
  roleId: "normal" | "genius" | "social" | "rich" | "teacher-child",
  advisorId: "level1" | "level2" | "level3" | "level4" | "level5" = "level5",
): GameState {
  const enrolledState = dispatchAction(startPreEnrollmentWith(roleId, advisorId), "next-month");
  return {
    ...enrolledState,
    eventQueue: [] as GameState["eventQueue"],
  };
}

function resolveFirstQueuedEvent(state: GameState): GameState {
  const firstChoiceId = state.eventQueue[0]?.choices[0]?.id;
  if (!firstChoiceId) {
    throw new Error("missing queued choice");
  }
  return dispatchAction(state, "resolve-event", { eventChoiceId: firstChoiceId });
}

describe("v2 engine", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setup 空态下不能直接 start-game", () => {
    const initialState = createInitialState();
    const state = dispatchAction(initialState, "start-game");

    expect(state.phase).toBe("setup");
    expect(state.setupSelectedRoleId).toBeNull();
    expect(state.log[0]?.text).toContain("请先选择角色");
  });

  it("可以从 setup 进入第 0 月 playing，并带上角色和导师", () => {
    const state = startPreEnrollmentWith("genius", "level3");
    expect(state.phase).toBe("playing");
    expect(state.selectedRoleId).toBe("genius");
    expect(state.selectedAdvisorId).toBe("level3");
    expect(state.month).toBe(0);
    expect(state.totalMonths).toBe(0);
    expect(state.player).toEqual({ san: 20, research: 1, social: 1, favor: 1, money: 1 });
    expect(state.paperSlotsUnlocked).toBe(1);
    expect(state.graduationScoreTarget).toBe(2);
    expect(state.availableRandomEvents).toEqual([...BASE_RANDOM_EVENT_IDS]);
    expect(state.coldWeight).toBe(1);
  });

  it("第 0 月点击下一月会作为正式入学进入第 1 月，不跑正常月结算", () => {
    const state = dispatchAction(startPreEnrollmentWith("normal", "level5"), "next-month");

    expect(state.phase).toBe("playing");
    expect(state.year).toBe(1);
    expect(state.month).toBe(1);
    expect(state.totalMonths).toBe(1);
    expect(state.actionsRemaining).toBe(state.maxActionsPerMonth);
    expect(state.eventQueue).toHaveLength(1);
    expect(state.eventQueue[0]?.chainId).toBe("teachers-day");
    expect(state.log.some((entry) => entry.text.includes("正式入学"))).toBe(true);
  });

  it("社交达人开局会同步旧版关系槽解锁口径", () => {
    const state = startPreEnrollmentWith("social", "level5");
    expect(state.player.social).toBe(1);
    expect(state.relationshipState.unlockedSlots).toBe(2);
  });

  it("idea 行动会消耗 SAN 并提升选中论文", () => {
    let state = startWith("normal");
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    const beforeSan = state.player.san;
    state = dispatchAction(state, "idea", { paperId: paperId ?? undefined });
    expect(state.actionsRemaining).toBe(state.maxActionsPerMonth - 2);
    expect(state.player.san).toBe(beforeSan - 1);
    expect(state.papers[0]?.idea).toBe(2);
  });

  it("院士转世开局会直接带着第二个基础论文槽", () => {
    let state = startWith("genius");
    expect(state.paperSlotsUnlocked).toBe(1);

    state = {
      ...state,
      readingState: { ...state.readingState, readCount: 10 },
    };
    state = dispatchAction(state, "read");

    expect(state.player.research).toBe(2);
    expect(state.temporaryActionEffects.idea.bonus).toBe(2);
    expect(state.paperSlotsUnlocked).toBe(1);
  });

  it("普通会议审稿满 4 个月后才会结算科研分", () => {
    let state = startWith("genius");
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    state = {
      ...state,
      papers: state.papers.map((paper) => (paper.id === paperId ? { ...paper, idea: 4, experiment: 4, writing: 4 } : paper)),
    };
    state = dispatchAction(state, "submit-c", { paperId });

    for (let step = 0; step < 12; step += 1) {
      if (state.eventQueue.length > 0) {
        state = resolveFirstQueuedEvent(state);
      } else {
        state = dispatchAction(state, "next-month");
      }

      if (state.papers[0]?.status === "published") break;
    }

    expect(state.totalResearchScore).toBe(1);
    expect(state.papers[0]?.status).toBe("published");
  });

  it("论文被接收后会同月入队 conference-decision act1", () => {
    let state = startWith("genius");
    state = {
      ...state,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    state = {
      ...state,
      papers: state.papers.map((paper) => (paper.id === paperId ? { ...paper, idea: 4, experiment: 4, writing: 4 } : paper)),
    };
    state = dispatchAction(state, "submit-c", { paperId });

    for (let step = 0; step < 12; step += 1) {
      const conferenceEvent = state.eventQueue.find((event) => event.chainId === "conference-decision" && event.stage === "act1");
      if (conferenceEvent) break;

      if (state.eventQueue.length > 0) {
        state = resolveFirstQueuedEvent(state);
      } else {
        state = dispatchAction(state, "next-month");
      }
    }

    const conferenceEvent = state.eventQueue.find((event) => event.chainId === "conference-decision" && event.stage === "act1");
    expect(state.papers[0]?.status).toBe("published");
    expect(state.papers[0]?.submittedMonth).toBe(1);
    expect(state.papers[0]?.submittedYear).toBe(1);
    expect(state.papers[0]?.conferenceHandled).toBe(false);
    expect(conferenceEvent?.title).toBe("论文参会");
  });

  it("第 2 年 10 月达到门槛会触发转博抉择", () => {
    let state = startWith("normal", "level5");
    state = { ...state, totalMonths: 21, year: 2, month: 9, totalResearchScore: 2 };
    state = dispatchAction(state, "next-month");

    if (state.eventQueue.length > 0) {
      state = resolveFirstQueuedEvent(state);
    }

    expect(state.pendingDecision).not.toBeNull();
    expect(state.pendingDecision?.requiredScore).toBe(2);
  });

  it("选择读博会切到博士线并清空转博抉择", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 22,
      year: 2,
      month: 10,
      pendingDecision: { kind: "phd-transfer", year: 2, requiredScore: 2 },
    };

    state = dispatchAction(state, "resolve-phd-yes");

    expect(state.degree).toBe("phd");
    expect(state.maxMonths).toBe(58);
    expect(state.graduationScoreTarget).toBe(7);
    expect(state.pendingDecision).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("放弃读博只清空转博抉择并保留硕士线", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 22,
      year: 2,
      month: 10,
      totalResearchScore: 2,
      pendingDecision: { kind: "phd-transfer", year: 2, requiredScore: 2 },
    };

    state = dispatchAction(state, "resolve-phd-no");

    expect(state.degree).toBe("master");
    expect(state.maxMonths).toBe(34);
    expect(state.graduationScoreTarget).toBe(1);
    expect(state.pendingDecision).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("毕业月放弃读博后会继续按硕士线结算毕业", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 34,
      year: 3,
      month: 10,
      totalResearchScore: 3,
      pendingDecision: { kind: "phd-transfer", year: 3, requiredScore: 3 },
    };

    state = dispatchAction(state, "resolve-phd-no");

    expect(state.pendingDecision).toBeNull();
    expect(state.phase).toBe("finished");
    expect(state.ending).toBe("master");
  });

  it("到达毕业月并满足毕业线时会结算硕士毕业", () => {
    let state = startWith("normal", "level5");
    state = { ...state, totalMonths: 33, year: 3, month: 9, totalResearchScore: 1 };
    state = dispatchAction(state, "next-month");

    while (state.eventQueue.length > 0) {
      state = resolveFirstQueuedEvent(state);
    }

    expect(state.phase).toBe("finished");
    expect(state.ending).toBe("master");
  });

  it("5 月寒假事件会按 act1→act2→结果页推进后出队", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 4,
      year: 1,
      month: 4,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };
    state = dispatchAction(state, "next-month");
    expect(state.eventQueue.map((event) => event.chainId)).toEqual(["winter-vacation"]);
    expect(state.eventQueue[0]?.stage).toBe("act1");

    state = resolveFirstQueuedEvent(state);
    expect(state.eventQueue[0]?.title).toBe("寒假 ➜ 假期计划");
    expect(state.eventQueue[0]?.stage).toBe("act2");

    state = resolveFirstQueuedEvent(state);
    expect(state.eventQueue[0]?.title).toBe("寒假 ➜ 假期结束");
    expect(state.eventQueue[0]?.stage).toBe("result");

    state = resolveFirstQueuedEvent(state);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("寒假老同学分支会结算红包、恢复 SAN 并增加社交", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 4,
      year: 1,
      month: 4,
      player: { ...state.player, san: 10, social: 0 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    const beforeSan = state.player.san;
    const beforeMoney = state.player.money;
    const beforeSocial = state.player.social;

    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);

    expect(state.player.money).toBe(beforeMoney + 1);
    expect(state.player.san).toBe(beforeSan + Math.ceil((state.sanCap - beforeSan) * 0.1));
    expect(state.player.social).toBe(beforeSocial + 1);
  });

  it("寒假带恋人见家长会让红包翻倍，但 SAN 仍只按基础恢复", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 4,
      year: 1,
      month: 4,
      player: { ...state.player, san: 10, money: 10 },
      loverState: {
        ...state.loverState,
        active: true,
        type: "smart",
        startTotalMonths: 1,
      },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    const beforeSan = state.player.san;
    const beforeMoney = state.player.money;

    state = resolveFirstQueuedEvent(state);
    vi.spyOn(Math, "random")
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 0.5)
      .mockImplementation(() => 0);
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);

    expect(state.player.money).toBe(beforeMoney + 2);
    expect(state.player.san).toBe(beforeSan + Math.ceil((state.sanCap - beforeSan) * 0.1));
  });

  it("暑假回家休息会恢复 25% 已损 SAN", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 10,
      year: 1,
      month: 10,
      player: { ...state.player, san: 8 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "summer-vacation") };
    const beforeSan = state.player.san;

    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);
    expect(state.player.san).toBe(beforeSan + Math.ceil((state.sanCap - beforeSan) * 0.25));
    expect(state.eventQueue).toHaveLength(0);
  });

  it("暑假留校科研会给下次 idea 额外 1 次并永久 idea +1", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 10,
      year: 1,
      month: 10,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "summer-vacation") };
    state = resolveFirstQueuedEvent(state);
    const researchChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("summer-vacation-research"))?.id;
    state = dispatchAction(state, "resolve-event", { eventChoiceId: researchChoiceId });
    expect(state.eventQueue[0]?.title).toBe("暑假 ➜ 学术进步");

    state = resolveFirstQueuedEvent(state);

    expect(state.temporaryActionEffects.idea.extraActions).toBe(1);
    expect(state.actionBonuses.idea).toBe(1);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("暑假外出旅行会花 4 金钱并恢复 50% 已损 SAN", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 10,
      year: 1,
      month: 10,
      player: { ...state.player, san: 8, money: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "summer-vacation") };
    const beforeSan = state.player.san;
    const beforeMoney = state.player.money;

    state = resolveFirstQueuedEvent(state);
    const travelChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("summer-vacation-travel"))?.id;
    state = dispatchAction(state, "resolve-event", { eventChoiceId: travelChoiceId });
    expect(state.eventQueue[0]?.title).toBe("暑假 ➜ 难忘旅程");

    state = resolveFirstQueuedEvent(state);

    expect(state.player.money).toBe(beforeMoney - 4);
    expect(state.player.san).toBe(beforeSan + Math.ceil((state.sanCap - beforeSan) * 0.5));
    expect(state.eventQueue).toHaveLength(0);
  });


  it("学年总结休息调整会给 5 点 SAN", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 10,
      year: 1,
      month: 10,
      player: { ...state.player, san: 12 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "year-summary") };
    const beforeSan = state.player.san;

    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);

    expect(state.player.san).toBe(beforeSan + 5);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("学年总结经营社交在 20 点口径下不会继续增加", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 10,
      year: 1,
      month: 10,
      player: { ...state.player, social: 20 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "year-summary") };
    const beforeSocial = state.player.social;

    state = resolveFirstQueuedEvent(state);
    const socialChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("year-summary-social"))?.id;
    if (!socialChoiceId) throw new Error("year summary social choice missing");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: socialChoiceId });
    state = resolveFirstQueuedEvent(state);

    expect(state.player.social).toBe(beforeSocial);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("学年总结外出实习会按旧版口径给 2~3 金钱", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 10,
      year: 1,
      month: 10,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "year-summary") };
    const beforeMoney = state.player.money;

    state = resolveFirstQueuedEvent(state);
    const internChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("year-summary-intern"))?.id;
    if (!internChoiceId) throw new Error("year summary intern choice missing");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: internChoiceId });
    state = resolveFirstQueuedEvent(state);

    expect(state.player.money).toBe(beforeMoney + 2);
    expect(state.eventQueue).toHaveLength(0);
  });

  it("第 2 年 7 月后会触发大论文事件并结算进度", () => {
    let state = startWith("normal", "level5");
    state = { ...state, totalMonths: 18, year: 2, month: 6 };
    state = dispatchAction(state, "next-month");

    expect(state.thesis.started).toBe(true);
    expect(state.eventQueue.some((event) => event.source === "thesis")).toBe(true);

    const beforeProgress = state.thesis.progress;
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "normal" });
    expect(state.thesis.progress).toBeGreaterThan(beforeProgress);
  });

  it("硕士第 3 年会按活跃月份触发求职事件并累计最佳 offer", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      year: 2,
      month: 12,
      totalMonths: 24,
      thesis: { ...state.thesis, abandoned: true },
      player: { ...state.player, research: 10, social: 8 },
    };
    state = dispatchAction(state, "next-month");

    expect(state.eventQueue.some((event) => event.source === "career")).toBe(true);

    const careerEvent = state.eventQueue.find((event) => event.source === "career");
    if (!careerEvent) throw new Error("career event missing");

    while (state.eventQueue[0]?.source !== "career") {
      state = resolveFirstQueuedEvent(state);
    }

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "normal" });
    const progressTotal = state.careerProgress.stateOwned + state.careerProgress.civilService + state.careerProgress.internet + state.careerProgress.academic;
    expect(progressTotal).toBeGreaterThan(0);
    expect(state.bestCareerOffer).not.toBeNull();
  });

  it("2 月奖学金事件会触发并增加金钱", () => {
    let state = startWith("normal", "level5");
    state = { ...state, totalMonths: 13, year: 2, month: 1, totalResearchScore: 1 };
    state = dispatchAction(state, "next-month");
    expect(state.eventQueue[0]?.chainId).toBe("scholarship");
    const beforeMoney = state.player.money;
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);
    expect(state.player.money).toBe(beforeMoney + 5);
  });

  it("9 月固定事件会触发领域年会", () => {
    let state = startWith("normal", "level5");
    state = { ...state, totalMonths: 8, year: 1, month: 8 };
    state = dispatchAction(state, "next-month");
    expect(state.eventQueue[0]?.chainId).toBe("ccig-decision");
  });

  it("第 4 年 3 月会触发指导新生，并把选中的新生加入关系网", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      degree: "phd",
      totalMonths: 38,
      maxMonths: 60,
      year: 4,
      month: 2,
      thesis: { ...state.thesis, abandoned: true },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "mentor-assign") };
    expect(state.eventQueue[0]?.chainId).toBe("mentor-assign");

    state = resolveFirstQueuedEvent(state);
    const candidateChoiceId = state.eventQueue[0]?.choices[0]?.id;
    if (!candidateChoiceId) throw new Error("mentor assign candidate choice missing");

    state = dispatchAction(state, "resolve-event", { eventChoiceId: candidateChoiceId });

    expect(state.relationshipState.juniorCount).toBe(1);
    expect(state.relationshipState.occupiedSlots).toBe(2);
    expect(state.fellowProgressState).toHaveLength(1);
    expect(state.fellowProgressState[0]).toMatchObject({
      name: "小明",
      type: "junior",
      research: 1,
      affinity: 1,
      taskType: "idea",
    });
    expect(state.eventQueue[0]?.title).toBe("指导新生 ➜ 如何抉择 ➜ 指派完成");
  });

  it("指导新生在关系槽位已满时不会强行加入关系网", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      degree: "phd",
      totalMonths: 38,
      maxMonths: 60,
      year: 4,
      month: 2,
      thesis: { ...state.thesis, abandoned: true },
      relationshipState: {
        ...state.relationshipState,
        unlockedSlots: 2,
        occupiedSlots: 2,
      },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = { ...state, eventQueue: state.eventQueue.filter((event) => event.chainId === "mentor-assign") };
    state = resolveFirstQueuedEvent(state);
    const candidateChoiceId = state.eventQueue[0]?.choices[0]?.id;
    if (!candidateChoiceId) throw new Error("mentor assign candidate choice missing");

    state = dispatchAction(state, "resolve-event", { eventChoiceId: candidateChoiceId });

    expect(state.relationshipState.juniorCount).toBe(0);
    expect(state.relationshipState.occupiedSlots).toBe(2);
    expect(state.fellowProgressState).toHaveLength(0);
    expect(state.eventQueue[0]?.preview).toContain("本次未加入关系网");
  });

  it("CCIG 导师报销分支会扣 1 点好感并进入会场活动", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 8,
      year: 1,
      month: 8,
      player: { ...state.player, favor: 3 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = resolveFirstQueuedEvent(state);
    const advisorChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("ccig-advisor"))?.id;
    if (!advisorChoiceId) throw new Error("ccig advisor choice missing");

    const beforeFavor = state.player.favor;
    state = dispatchAction(state, "resolve-event", { eventChoiceId: advisorChoiceId });
    expect(state.player.favor).toBe(beforeFavor - 1);
    expect(state.eventQueue[0]?.title).toBe("领域年会 ➜ 参会决定 ➜ 参会确认");

    state = resolveFirstQueuedEvent(state);
    expect(state.eventQueue[0]?.chainId).toBe("ccig-activity");
    expect(state.eventQueue[0]?.stage).toBe("act1");
  });

  it("CCIG 整装待发下自费参会可免费进入会场", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 8,
      year: 1,
      month: 8,
      player: { ...state.player, money: 0 },
      shopState: { ...state.shopState, bikeOwned: true, bikeUpgrade: "ebike" },
      eventSupport: { ...state.eventSupport, hasParasol: true, hasDownJacket: true },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = resolveFirstQueuedEvent(state);
    const selfChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("ccig-self"))?.id;
    if (!selfChoiceId) throw new Error("ccig self choice missing");

    const beforeMoney = state.player.money;
    state = dispatchAction(state, "resolve-event", { eventChoiceId: selfChoiceId });
    expect(state.player.money).toBe(beforeMoney);
    expect(state.eventQueue[0]?.title).toBe("领域年会 ➜ 参会决定 ➜ 参会确认");

    state = resolveFirstQueuedEvent(state);
    expect(state.eventQueue[0]?.chainId).toBe("ccig-activity");
  });

  it("CCIG 认真听报告会给下次 idea +4 且永久 idea +1", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 8,
      year: 1,
      month: 8,
      player: { ...state.player, favor: 3 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = resolveFirstQueuedEvent(state);
    const advisorChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("ccig-advisor"))?.id;
    if (!advisorChoiceId) throw new Error("ccig advisor choice missing");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: advisorChoiceId });
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);

    const listenChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("ccig-activity-listen"))?.id;
    if (!listenChoiceId) throw new Error("ccig listen choice missing");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: listenChoiceId });
    state = resolveFirstQueuedEvent(state);

    expect(state.temporaryActionEffects.idea.bonus).toBe(4);
    expect(state.actionBonuses.idea).toBe(1);
  });

  it("CCIG 请同学吃饭若现金不足会直接触发穷困结局且不进入结果页", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      totalMonths: 8,
      year: 1,
      month: 8,
      player: { ...state.player, favor: 3, money: 0 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = resolveFirstQueuedEvent(state);
    const advisorChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("ccig-advisor"))?.id;
    if (!advisorChoiceId) throw new Error("ccig advisor choice missing");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: advisorChoiceId });
    state = resolveFirstQueuedEvent(state);
    state = resolveFirstQueuedEvent(state);

    const foodChoiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("ccig-activity-food"))?.id;
    if (!foodChoiceId) throw new Error("ccig food choice missing");
    state = dispatchAction(state, "resolve-event", { eventChoiceId: foodChoiceId });

    expect(state.phase).toBe("finished");
    expect(state.ending).toBe("poor");
    expect(state.eventQueue).toHaveLength(0);
  });

  it("未来待办会随跨月递减 DDL，并在到期后阻塞流程", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "future-event",
        title: "未来事件",
        description: "这是一个延后触发的待办。",
        preview: "稍后会到期。",
        source: "system",
        blocking: true,
        deadlineMonths: 1,
        chainId: "future-event",
        stage: "act1",
        choices: [{ id: "ok", label: "处理", outcome: "已处理。", effects: {} }],
      }, 1)],
    };

    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(2);
    expect(state.eventQueue[0]?.deadlineMonths).toBe(0);

    const blockedLogLength = state.log.length;
    const stillBlocked = dispatchAction(state, "next-month");
    expect(stillBlocked.totalMonths).toBe(2);
    expect(stillBlocked.log).toHaveLength(blockedLogLength);
    expect(stillBlocked.log.some((entry) => entry.text.includes("必须先处理待办事件。"))).toBe(false);
  });

  it("11 月会同时触发暑假与学年总结", () => {
    let state = startWith("normal", "level5");
    state = { ...state, totalMonths: 10, year: 1, month: 10 };
    state = dispatchAction(state, "next-month");
    expect(state.eventQueue.map((event) => event.chainId)).toEqual(["summer-vacation", "year-summary"]);
  });

  it("教师节高好感祝福分支会给下一次 idea 奖励", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      year: 1,
      month: 12,
      totalMonths: 12,
      player: { ...state.player, favor: 6 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    expect(state.eventQueue[0]?.chainId).toBe("teachers-day");

    state = resolveFirstQueuedEvent(state);
    const choiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("teachers-day-message"))?.id;
    if (!choiceId) throw new Error("teachers-day message choice missing");

    state = dispatchAction(state, "resolve-event", { eventChoiceId: choiceId });

    expect(state.temporaryActionEffects.idea.bonus).toBe(3);
    expect(state.eventCounters.consecutiveStampGiftCount).toBe(0);
    expect(state.log.some((entry) => entry.text.includes("你发去节日祝福，导师顺势分享了一个想法，下次想 idea +3。"))).toBe(true);
  });

  it("教师节低好感祝福分支可能触发跑腿扣 SAN", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      year: 1,
      month: 12,
      totalMonths: 12,
      player: { ...state.player, favor: 5, san: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = resolveFirstQueuedEvent(state);
    const choiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("teachers-day-message"))?.id;
    if (!choiceId) throw new Error("teachers-day message choice missing");

    state = dispatchAction(state, "resolve-event", { eventChoiceId: choiceId });

    expect(state.player.san).toBe(9);
    expect(state.eventCounters.consecutiveStampGiftCount).toBe(0);
  });

  it("教师节连续三年送邮票会解锁吾爱吾师", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      year: 1,
      month: 12,
      totalMonths: 12,
      eventCounters: { ...state.eventCounters, consecutiveStampGiftCount: 2 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
    };

    state = dispatchAction(state, "next-month");
    state = resolveFirstQueuedEvent(state);
    const choiceId = state.eventQueue[0]?.choices.find((choice) => choice.id.includes("teachers-day-stamp"))?.id;
    if (!choiceId) throw new Error("teachers-day stamp choice missing");

    const beforeMoney = state.player.money;
    state = dispatchAction(state, "resolve-event", { eventChoiceId: choiceId });

    expect(state.player.money).toBe(beforeMoney - 3);
    expect(state.eventCounters.consecutiveStampGiftCount).toBe(3);
    expect(state.achievementFlags.loveMyTeacher).toBe(true);
  });

  it("发表 A 类论文后会标记当前槽位具备升级资格", () => {
    let state = startWith("normal", "level1");
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    state = {
      ...state,
      papers: state.papers.map((paper) =>
        paper.id === paperId ? { ...paper, idea: 8, experiment: 8, writing: 8 } : paper,
      ),
    };
    state = dispatchAction(state, "submit-a", { paperId });

    for (let step = 0; step < 12; step += 1) {
      if (state.eventQueue.length > 0) {
        state = resolveFirstQueuedEvent(state);
      } else {
        state = dispatchAction(state, "next-month");
      }
      if (state.slotPublishedA[0]) break;
    }

    expect(state.paperSlotsUnlocked).toBe(1);
    expect(state.slotPublishedA[0]).toBe(true);
  });
  it("year rollover resets random event pool and advances coldWeight", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      year: 1,
      month: 12,
      totalMonths: 12,
      availableRandomEvents: [2, 5],
      usedRandomEvents: [1, 3],
      coldWeight: 1,
    };

    state = dispatchAction(state, "next-month");

    expect(state.year).toBe(2);
    expect(state.month).toBe(1);
    expect(state.availableRandomEvents).toEqual([...BASE_RANDOM_EVENT_IDS]);
    expect(state.usedRandomEvents).toEqual([]);
    expect(state.coldWeight).toBeCloseTo(1.2);
  });

  it("first published paper unlocks random event 14 immediately", () => {
    let state = startWith("genius");
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    state = {
      ...state,
      papers: state.papers.map((paper) => (paper.id === paperId ? { ...paper, idea: 4, experiment: 4, writing: 4 } : paper)),
    };
    state = dispatchAction(state, "submit-c", { paperId });

    for (let step = 0; step < 12; step += 1) {
      if (state.eventQueue.length > 0) {
        state = resolveFirstQueuedEvent(state);
      } else {
        state = dispatchAction(state, "next-month");
      }

      if (state.papers[0]?.status === "published") break;
    }

    expect(state.papers[0]?.status).toBe("published");
    expect(state.availableRandomEvents).toContain(14);
  });

  it("action bonuses from queued events affect paper actions", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "bonus-event",
        title: "Bonus Event",
        description: "Grants an idea bonus.",
        preview: "Idea bonus",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "bonus-event",
        stage: "act1",
        choices: [{ id: "take", label: "Take", outcome: "Idea bonus +1.", effects: { ideaBonus: 1 } }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "take" });
    expect(state.actionBonuses.idea).toBe(1);

    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");

    state = dispatchAction(state, "idea", { paperId });
    expect(state.papers[0]?.idea).toBe(3);
  });

  it("blocked paper action keeps temporary effects intact", () => {
    let state = startWith("normal", "level5");
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");

    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "blocking-event",
        title: "Blocking Event",
        description: "Must be resolved first.",
        preview: "blocking",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "blocking-event",
        stage: "act1",
        choices: [{ id: "ok", label: "OK", outcome: "Done.", effects: {} }],
      }, 1)],
      temporaryActionEffects: {
        ...state.temporaryActionEffects,
        idea: { bonus: 10, multiplier: 1, extraActions: 0 },
      },
    };

    const nextState = dispatchAction(state, "idea", { paperId });
    expect(nextState.temporaryActionEffects.idea).toEqual({ bonus: 10, multiplier: 1, extraActions: 0 });
    expect(nextState.papers[0]?.idea).toBe(0);
  });

  it("temporary action effects apply once and only to the matching paper action", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "temp-bonus-event",
        title: "Temp Bonus Event",
        description: "Grants a one-shot idea effect.",
        preview: "temp idea",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "temp-bonus-event",
        stage: "act1",
        choices: [{
          id: "take",
          label: "Take",
          outcome: "Next idea gains +10 and one extra action.",
          effects: {
            temporaryActionEffectUpdates: {
              idea: { bonus: 10, extraActions: 1 },
            },
          },
        }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "take" });
    expect(state.temporaryActionEffects.idea).toEqual({ bonus: 10, multiplier: 1, extraActions: 1 });

    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");

    state = dispatchAction(state, "idea", { paperId });
    expect(state.papers[0]?.idea).toBe(14);
    expect(state.temporaryActionEffects.idea).toEqual({ bonus: 0, multiplier: 1, extraActions: 0 });

    state = { ...state, actionsRemaining: 1 };
    state = dispatchAction(state, "idea", { paperId });
    expect(state.papers[0]?.idea).toBe(16);
  });

  it("rest action respects sanCap after the cap is reduced", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, san: 16 },
      sanCap: 16,
    };

    state = dispatchAction(state, "rest");
    expect(state.player.san).toBe(16);
  });

  it("next publication citation multiplier is consumed on acceptance and grows citations next month", () => {
    let state = startWith("genius", "level5");
    state = {
      ...state,
      year: 1,
      month: 4,
      totalMonths: 4,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      publicationEffects: { nextCitationMultipliers: [2], citationPenaltyMultiplier: 1 },
    };

    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");

    state = {
      ...state,
      papers: state.papers.map((paper) => paper.id === paperId ? {
        ...paper,
        status: "reviewing",
        target: "C",
        reviewMonthsLeft: 1,
        idea: 4,
        experiment: 4,
        writing: 4,
        submittedIdea: 4,
        submittedExperiment: 4,
        submittedWriting: 4,
      } : paper),
    };

    state = dispatchAction(state, "next-month");
    expect(state.papers[0]?.status).toBe("published");
    expect(state.papers[0]?.publication?.citationMultiplier).toBe(2);
    expect(state.publicationEffects.nextCitationMultipliers).toEqual([]);
    expect(state.totalCitations).toBe(0);

    while (state.eventQueue.length > 0) {
      state = resolveFirstQueuedEvent(state);
    }

    state = dispatchAction(state, "next-month");
    expect(state.papers[0]?.publication?.citations).toBeGreaterThan(0);
    expect(state.totalCitations).toBeGreaterThan(0);
  });

  it("relationship additions respect slot limits and mentorship ticks monthly", () => {
    let state = startWith("social", "level5");
    state = {
      ...state,
      year: 1,
      month: 4,
      totalMonths: 4,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      relationshipState: {
        ...state.relationshipState,
        unlockedSlots: 3,
      },
      eventQueue: [createEventQueueItem({
        id: "mentorship-event",
        title: "Mentorship Event",
        description: "Adds one junior and one mentorship stack.",
        preview: "mentorship",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "mentorship-event",
        stage: "act1",
        choices: [{
          id: "take",
          label: "Take",
          outcome: "Applied.",
          effects: {
            relationshipAdditions: ["junior"],
            mentorshipStacks: 1,
          },
        }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "take" });
    expect(state.relationshipState.juniorCount).toBe(1);
    expect(state.relationshipState.occupiedSlots).toBe(2);
    expect(state.relationshipState.mentorshipStacks).toBe(1);

    state = dispatchAction(state, "next-month");
    expect(state.totalCitations).toBe(3);
    expect(state.relationshipState.juniorCount).toBe(1);
  });

  it("event effects can clear draft progress and apply a global citation penalty", () => {
    let state = startWith("genius", "level5");
    state = {
      ...state,
      year: 1,
      month: 4,
      totalMonths: 4,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      papers: [
        {
          id: "draft-paper",
          title: "Draft Paper",
          idea: 5,
          experiment: 6,
          writing: 7,
          status: "draft",
          target: null,
          reviewMonthsLeft: 0,
          submittedIdea: null,
          submittedExperiment: null,
          submittedWriting: null,
          publication: null,
        },
        {
          id: "published-paper",
          title: "Published Paper",
          idea: 10,
          experiment: 15,
          writing: 15,
          status: "published",
          target: "C",
          reviewMonthsLeft: 0,
          submittedIdea: 10,
          submittedExperiment: 15,
          submittedWriting: 15,
          publication: {
            citations: 0,
            monthsSincePublication: 0,
            pendingCitationFraction: 0,
            effectiveScore: 40,
            citationMultiplier: 1,
          },
        },
      ],
      eventQueue: [createEventQueueItem({
        id: "data-loss-event",
        title: "数据丢失",
        description: "Applies the restart / fake-data effects.",
        preview: "data-loss",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "data-loss-event",
        stage: "act1",
        choices: [{
          id: "fake",
          label: "Fake",
          outcome: "Applied.",
          effects: {
            clearDraftProgress: true,
            publicationPenaltyMultiplier: 0.5,
          },
        }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "fake" });
    expect(state.papers[0]).toMatchObject({ idea: 0, experiment: 0, writing: 0, status: "draft" });
    expect(state.publicationEffects.citationPenaltyMultiplier).toBe(0.5);

    state = dispatchAction(state, "next-month");
    expect(state.papers[1]?.publication?.citations).toBe(1);
    expect(state.totalCitations).toBe(1);
  });

  it("granted publications do not occupy paper slots and unlock event 14 on yearly reset", () => {
    let state = startWith("teacher-child", "level5");
    state = {
      ...state,
      year: 1,
      month: 12,
      totalMonths: 12,
      player: { ...state.player, social: 3 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [createEventQueueItem({
        id: "authorship-event",
        title: "署名风波",
        description: "Grants one external publication.",
        preview: "authorship",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "authorship-event",
        stage: "act1",
        choices: [{
          id: "transfer",
          label: "Transfer",
          outcome: "Applied.",
          effects: {
            social: -2,
            score: 1,
            grantedPublication: {
              target: "C",
              acceptedScore: 15,
            },
          },
        }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "transfer" });
    expect(state.externalPublications).toHaveLength(1);
    expect(state.papers).toHaveLength(0);
    expect(state.totalResearchScore).toBe(1);
    expect(state.availableRandomEvents).not.toContain(14);

    state = dispatchAction(state, "create-paper");
    expect(state.papers).toHaveLength(1);

    state = dispatchAction(state, "next-month");
    expect(state.year).toBe(2);
    expect(state.month).toBe(1);
    expect(state.availableRandomEvents).toContain(14);
  });

  it("event support updates and persistent extra actions affect month ticks and experiment actions", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 10, san: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [createEventQueueItem({
        id: "support-event",
        title: "Support Event",
        description: "Unlocks talents and permanent experiment times.",
        preview: "support",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "support-event",
        stage: "act1",
        choices: [{
          id: "take",
          label: "Take",
          outcome: "Applied.",
          effects: {
            eventSupportUpdates: { hasFinanceTalent: true, hasStrongBodyTalent: true },
            persistentExtraActionDeltas: { experiment: 2 },
          },
        }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "take" });
    expect(state.eventSupport.hasFinanceTalent).toBe(true);
    expect(state.eventSupport.hasStrongBodyTalent).toBe(true);
    expect(state.persistentExtraActions.experiment).toBe(2);

    const monthlyBaseWithTalents = {
      ...state,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
      actionsRemaining: state.maxActionsPerMonth,
    };
    const monthlyBaseWithoutTalents = {
      ...monthlyBaseWithTalents,
      eventSupport: { ...monthlyBaseWithTalents.eventSupport, hasFinanceTalent: false, hasStrongBodyTalent: false },
    };

    const nextWithTalents = dispatchAction(monthlyBaseWithTalents, "next-month");
    const nextWithoutTalents = dispatchAction(monthlyBaseWithoutTalents, "next-month");

    expect(nextWithTalents.player.money - nextWithoutTalents.player.money).toBe(1);
    expect(nextWithTalents.player.san - nextWithoutTalents.player.san).toBe(1);

    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    state = dispatchAction(state, "experiment", { paperId });
    expect(state.papers[0]?.experiment).toBe(6);
  });

  it("regular monthly upkeep keeps default advisor salary and base living cost in balance", () => {
    const state = {
      ...startWith("normal", "level5"),
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };

    const nextMonth = dispatchAction(state, "next-month");

    expect(nextMonth.player.money).toBe(state.player.money);
  });

  it("support items can be bought and sold without consuming actions", () => {
    let state = startWith("normal", "level5");
    state = { ...state, player: { ...state.player, money: 10 } };
    const beforeActions = state.actionsRemaining;

    state = dispatchAction(state, "buy-support-item", { supportItemId: "badminton_racket" });
    expect(state.eventSupport.hasBadmintonRacket).toBe(true);
    expect(state.player.money).toBe(6);
    expect(state.actionsRemaining).toBe(beforeActions);

    state = dispatchAction(state, "sell-support-item", { supportItemId: "badminton_racket" });
    expect(state.eventSupport.hasBadmintonRacket).toBe(false);
    expect(state.player.money).toBe(8);
    expect(state.actionsRemaining).toBe(beforeActions);
  });

  it("economy actions are blocked by pending blocking events", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 10 },
      eventQueue: [createEventQueueItem({
        id: "economy-blocker",
        title: "Economy Blocker",
        description: "Blocks economy actions.",
        preview: "blocker",
        source: "system",
        blocking: true,
        deadlineMonths: 0,
        chainId: "economy-blocker",
        stage: "act1",
        choices: [{
          id: "ok",
          label: "OK",
          outcome: "ok",
          effects: {},
        }],
      }, 1)],
    };

    const beforeActions = state.actionsRemaining;
    const beforeLogLength = state.log.length;
    state = dispatchAction(state, "buy-support-item", { supportItemId: "badminton_racket" });

    expect(state.eventSupport.hasBadmintonRacket).toBe(false);
    expect(state.player.money).toBe(10);
    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.log).toHaveLength(beforeLogLength);
    expect(state.log.some((entry) => entry.text.includes("当前必须先处理待办事件或关键抉择。"))).toBe(false);
  });

  it("shop items can be bought and sold, and gpu/chair effects feed the main loop", () => {
    let state = startWith("normal", "level5");
    state = { ...state, player: { ...state.player, money: 30, san: 10 } };

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(state.shopState.gpuServersBought).toBe(1);
    expect(state.shopState.chairOwned).toBe(true);
    expect(state.player.money).toBe(10);

    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    state = dispatchAction(state, "experiment", { paperId });
    expect(state.papers[0]?.experiment).toBe(5);

    const nextMonth = dispatchAction({
      ...state,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    }, "next-month");
    expect(nextMonth.player.san).toBeGreaterThan(state.player.san);

    const sold = dispatchAction(
      {
        ...nextMonth,
        eventQueue: [],
        pendingDecision: null,
      },
      "sell-shop-item",
      { shopItemId: "gpu_buy" },
    );
    expect(sold.shopState.gpuServersBought).toBe(0);
    expect(sold.player.money).toBe(nextMonth.player.money + 6);
  });

  it("keyboard, monitor and down jacket feed read/write and winter month ticks", () => {
    let state = startWith("normal", "level5");
    state = { ...state, player: { ...state.player, money: 30, san: 10, research: 0 } };

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "monitor" });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "down_jacket" });
    expect(state.shopState.keyboardOwned).toBe(true);
    expect(state.shopState.monitorOwned).toBe(true);
    expect(state.eventSupport.hasDownJacket).toBe(true);

    const afterRead = dispatchAction(state, "read");
    expect(afterRead.player.research).toBe(state.player.research);
    expect(afterRead.player.san).toBe(state.player.san - 1);
    expect(afterRead.temporaryActionEffects.idea.bonus).toBe(1);

    let paperState = dispatchAction({
      ...afterRead,
      actionsRemaining: afterRead.maxActionsPerMonth,
    }, "create-paper");
    const paperId = paperState.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");
    const sanBeforeWrite = paperState.player.san;
    paperState = dispatchAction(paperState, "write", { paperId });
    expect(paperState.papers[0]?.writing).toBe(3);
    expect(paperState.player.san).toBe(sanBeforeWrite);

    const winterBase = {
      ...paperState,
      year: 1,
      month: 3,
      totalMonths: 3,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    const nextWithJacket = dispatchAction(winterBase, "next-month");
    const nextWithoutJacket = dispatchAction(
      {
        ...winterBase,
        eventSupport: { ...winterBase.eventSupport, hasDownJacket: false },
      },
      "next-month",
    );

    expect(nextWithJacket.player.san - nextWithoutJacket.player.san).toBe(1);
  });

  it("base bike applies monthly SAN loss and grows sanCap on the confirmed threshold", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 20, san: 10 },
      year: 1,
      month: 9,
      totalMonths: 9,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };

    const bought = dispatchAction(state, "buy-shop-item", { shopItemId: "bike" });
    expect(bought.shopState.bikeOwned).toBe(true);
    expect(bought.player.money).toBe(10);

    const nextWithBike = dispatchAction(bought, "next-month");
    const nextWithoutBike = dispatchAction({
      ...bought,
      shopState: { ...bought.shopState, bikeOwned: false },
    }, "next-month");

    expect(nextWithBike.player.san - nextWithoutBike.player.san).toBe(-1);
    expect(nextWithBike.shopState.bikeSanSpent).toBe(1);

    const thresholdReady = {
      ...bought,
      shopState: { ...bought.shopState, bikeOwned: true, bikeSanSpent: 5, bikeSanCapGains: 0 },
      sanCap: 20,
    };
    const crossedThreshold = dispatchAction(thresholdReady, "next-month");
    expect(crossedThreshold.sanCap).toBe(21);
    expect(crossedThreshold.shopState.bikeSanSpent).toBe(6);
    expect(crossedThreshold.shopState.bikeSanCapGains).toBe(1);
  });

  it("bike upgrades feed sell price and monthly core effects", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 50, san: 10 },
      year: 1,
      month: 9,
      totalMonths: 9,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "bike" });
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "bike-road" });
    expect(state.shopState.bikeUpgrade).toBe("road");

    const roadNext = dispatchAction({
      ...state,
      shopState: { ...state.shopState, bikeUpgrade: "road", bikeOwned: true, bikeSanSpent: 4, bikeSanCapGains: 0 },
      sanCap: 20,
    }, "next-month");
    expect(roadNext.shopState.bikeSanSpent).toBe(6);
    expect(roadNext.shopState.bikeSanCapGains).toBe(1);
    expect(roadNext.sanCap).toBe(21);

    const soldRoad = dispatchAction({
      ...roadNext,
      eventQueue: [],
      pendingDecision: null,
    }, "sell-shop-item", { shopItemId: "bike" });
    expect(soldRoad.player.money).toBe(roadNext.player.money + 15);
    expect(soldRoad.shopState.bikeOwned).toBe(false);
    expect(soldRoad.shopState.bikeUpgrade).toBeNull();

    let ebikeState = startWith("normal", "level5");
    ebikeState = {
      ...ebikeState,
      player: { ...ebikeState.player, money: 50, san: 10 },
      year: 1,
      month: 7,
      totalMonths: 7,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    ebikeState = dispatchAction(ebikeState, "buy-shop-item", { shopItemId: "bike" });
    ebikeState = dispatchAction(ebikeState, "upgrade-shop-item", { shopUpgradeId: "bike-ebike" });
    const ebikeNext = dispatchAction(ebikeState, "next-month");
    expect(ebikeNext.player.san - ebikeState.player.san).toBe(2);
  });

  it("bike-related achievements unlock from upgrades, mileage and full gear combo", () => {
    let roadState = startWith("normal", "level5");
    roadState = {
      ...roadState,
      player: { ...roadState.player, money: 80, san: 10 },
      year: 1,
      month: 9,
      totalMonths: 9,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    roadState = dispatchAction(roadState, "buy-shop-item", { shopItemId: "bike" });
    roadState = dispatchAction(roadState, "upgrade-shop-item", { shopUpgradeId: "bike-road" });
    expect(roadState.achievementFlags.advancedEquipment).toBe(true);

    const cyclingMaster = dispatchAction({
      ...roadState,
      shopState: { ...roadState.shopState, bikeOwned: true, bikeUpgrade: "road", bikeSanSpent: 29, bikeSanCapGains: 0 },
      sanCap: 20,
    }, "next-month");
    expect(cyclingMaster.shopState.bikeSanSpent).toBe(31);
    expect(cyclingMaster.achievementFlags.cyclingMaster).toBe(true);

    let fullGearState = startWith("normal", "level5");
    fullGearState = {
      ...fullGearState,
      player: { ...fullGearState.player, money: 80, san: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    fullGearState = dispatchAction(fullGearState, "buy-shop-item", { shopItemId: "bike" });
    fullGearState = dispatchAction(fullGearState, "buy-support-item", { supportItemId: "parasol" });
    fullGearState = dispatchAction(fullGearState, "buy-shop-item", { shopItemId: "down_jacket" });
    fullGearState = dispatchAction(fullGearState, "upgrade-shop-item", { shopUpgradeId: "bike-ebike" });
    expect(fullGearState.achievementFlags.fullGear).toBe(true);
  });

  it("coffee system supports manual coffee and automatic coffee machine month ticks", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 30, san: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };

    state = dispatchAction(state, "buy-coffee-machine");
    expect(state.coffeeState.machineOwned).toBe(true);
    expect(state.player.money).toBe(25);

    state = dispatchAction(state, "buy-coffee");
    expect(state.player.money).toBe(23);
    expect(state.player.san).toBe(13);
    expect(state.coffeeState.manualCoffeeBoughtThisMonth).toBe(1);
    expect(state.coffeeState.machineTrackedCoffeeCount).toBe(1);

    state = dispatchAction(state, "upgrade-coffee-machine", { eventId: "automatic" });
    expect(state.coffeeState.machineUpgrade).toBe("automatic");

    const nextMonth = dispatchAction({
      ...state,
      year: 1,
      month: 9,
      totalMonths: 9,
    }, "next-month");
    expect(nextMonth.player.money).toBe(state.player.money - 2);
    expect(nextMonth.player.san).toBeGreaterThan(state.player.san);
    expect(nextMonth.coffeeState.manualCoffeeBoughtThisMonth).toBe(0);
    expect(nextMonth.coffeeState.totalCoffeeBought).toBe(state.coffeeState.totalCoffeeBought + 1);
  });

  it("chair upgrades feed rest, monthly SAN and spike recovery", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 40, san: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "chair" });
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-hammock" });
    const afterRest = dispatchAction(state, "rest");
    expect(afterRest.player.san - state.player.san).toBe(5);

    const massageBase = dispatchAction(
      {
        ...startWith("normal", "level5"),
        player: { ...startWith("normal", "level5").player, money: 50, san: 10 },
        availableRandomEvents: [],
        usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
        eventQueue: [],
        pendingDecision: null,
      },
      "buy-shop-item",
      { shopItemId: "chair" },
    );
    const massageState = dispatchAction(massageBase, "upgrade-shop-item", { shopUpgradeId: "chair-massage" });
    const afterMonth = dispatchAction({
      ...massageState,
      year: 1,
      month: 9,
      totalMonths: 9,
      sanCap: 20,
    }, "next-month");
    expect(afterMonth.player.san).toBeGreaterThan(massageState.player.san);

    let spikeState = startWith("normal", "level5");
    spikeState = {
      ...spikeState,
      player: { ...spikeState.player, money: 40, san: 1 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    spikeState = dispatchAction(spikeState, "buy-shop-item", { shopItemId: "chair" });
    spikeState = dispatchAction(spikeState, "upgrade-shop-item", { shopUpgradeId: "chair-spike" });
    const recovered = dispatchAction(spikeState, "work");
    expect(recovered.player.san).toBe(2);
    expect(recovered.phase).toBe("playing");
  });

  it("monitor upgrades feed read SAN, idea bonus and dual monthly auto reading", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, money: 50, san: 20 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };

    const plainRead = dispatchAction(state, "read");
    expect(plainRead.player.research).toBe(state.player.research);
    expect(plainRead.player.san).toBe(state.player.san - 2);
    expect(plainRead.temporaryActionEffects.idea.bonus).toBe(1);

    state = dispatchAction(state, "buy-shop-item", { shopItemId: "monitor" });
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "monitor-smart" });
    state = {
      ...state,
      readingState: { ...state.readingState, readCount: 9, smartMonitorReadCount: 9 },
      player: { ...state.player, san: 20 },
    };
    const smartRead = dispatchAction(state, "read");
    expect(smartRead.player.research).toBe(state.player.research);
    expect(smartRead.player.san).toBe(18);
    expect(smartRead.temporaryActionEffects.idea.bonus).toBe(2);
    expect(smartRead.readingState.smartMonitorReadCount).toBe(10);

    let fourKState = startWith("normal", "level5");
    fourKState = {
      ...fourKState,
      player: { ...fourKState.player, money: 50 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    fourKState = dispatchAction(fourKState, "buy-shop-item", { shopItemId: "monitor" });
    fourKState = dispatchAction(fourKState, "upgrade-shop-item", { shopUpgradeId: "monitor-4k" });
    fourKState = dispatchAction(fourKState, "create-paper");
    const fourKPaperId = fourKState.selectedPaperId;
    if (!fourKPaperId) throw new Error("paper id missing");
    const ideaWith4K = dispatchAction({
      ...fourKState,
      actionsRemaining: fourKState.maxActionsPerMonth,
      readingState: { ...fourKState.readingState, readCount: 10 },
      temporaryActionEffects: { ...fourKState.temporaryActionEffects, idea: { bonus: 0, multiplier: 1, extraActions: 0 } },
    }, "idea", { paperId: fourKPaperId });
    expect(ideaWith4K.papers[0]?.idea).toBe(3);

    let dualState = startWith("normal", "level5");
    dualState = {
      ...dualState,
      player: { ...dualState.player, money: 50, san: 10 },
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
    };
    dualState = dispatchAction(dualState, "buy-shop-item", { shopItemId: "monitor" });
    dualState = dispatchAction(dualState, "upgrade-shop-item", { shopUpgradeId: "monitor-dual" });
    const dualNext = dispatchAction({
      ...dualState,
      year: 1,
      month: 9,
      totalMonths: 9,
    }, "next-month");
    expect(dualNext.player.san - dualState.player.san).toBe(-1);
    expect(dualNext.readingState.readCount).toBe(1);
    expect(dualNext.readingState.dualMonitorIdeaBonus).toBe(1);

    const dualMilestoneNext = dispatchAction({
      ...dualState,
      readingState: { ...dualState.readingState, readCount: 10 },
      year: 1,
      month: 9,
      totalMonths: 9,
    }, "next-month");
    expect(dualMilestoneNext.player.research).toBe(dualState.player.research + 1);
    expect(dualMilestoneNext.readingState.readCount).toBe(11);
    expect(dualMilestoneNext.readingState.dualMonitorIdeaBonus).toBe(2);
  });

  it("queued event counter deltas and achievement flags are persisted in state", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "meta-event",
        title: "Meta Event",
        description: "Updates counters and achievements.",
        preview: "meta",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "meta-event",
        stage: "act1",
        choices: [{
          id: "take",
          label: "Take",
          outcome: "Applied.",
          effects: {
            counterDeltas: { gamePlayCount: 1, terrariaCount: 1 },
            achievementFlags: ["terraria300"],
          },
        }],
      }, 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "take" });
    expect(state.eventCounters.gamePlayCount).toBe(1);
    expect(state.eventCounters.terrariaCount).toBe(1);
    expect(state.achievementFlags.terraria300).toBe(true);
  });

  it("resolve-event uses the opened event id instead of always consuming the queue head", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      eventQueue: [
        createEventQueueItem({
          id: "head-event",
          title: "Head Event",
          description: "Should stay queued.",
          preview: "head",
          source: "random",
          blocking: true,
          deadlineMonths: 0,
          chainId: "head-event",
          stage: "act1",
          choices: [{
            id: "head-choice",
            label: "Head",
            outcome: "Head resolved.",
            effects: {
              social: 1,
            },
          }],
        }, 1),
        createEventQueueItem({
          id: "opened-event",
          title: "Opened Event",
          description: "Should resolve by explicit event id.",
          preview: "opened",
          source: "fixed",
          blocking: true,
          deadlineMonths: 0,
          chainId: "opened-event",
          stage: "act1",
          choices: [{
            id: "opened-choice",
            label: "Opened",
            outcome: "Opened resolved.",
            effects: {
              research: 2,
            },
          }],
        }, 2),
      ],
    };

    const resolved = dispatchAction(state, "resolve-event", {
      eventId: "opened-event",
      eventChoiceId: "opened-choice",
    });

    expect(resolved.player.research).toBe(state.player.research + 2);
    expect(resolved.player.social).toBe(state.player.social);
    expect(resolved.eventQueue.map((event) => event.id)).toEqual(["head-event"]);
  });

  it("resolve-event can enqueue follow-up queued events for multi-act chains", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      eventQueue: [createEventQueueItem({
        id: "act1-event",
        title: "Act 1",
        description: "First stage.",
        preview: "act1",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "multi-act",
        stage: "act1",
        choices: [{
          id: "next",
          label: "Next",
          outcome: "Go act2.",
          effects: {
            enqueueEvents: [{
              id: "act2-event",
              title: "Act 2",
              description: "Second stage.",
              preview: "act2",
              source: "fixed",
              blocking: true,
              deadlineMonths: 0,
              chainId: "multi-act",
              stage: "act2",
              choices: [{ id: "done", label: "Done", outcome: "Done.", effects: {} }],
            }],
          },
        }],
      }, 1)],
    };

    const next = dispatchAction(state, "resolve-event", { eventChoiceId: "next" });
    expect(next.eventQueue).toHaveLength(1);
    expect(next.eventQueue[0]?.id).toBe("act2-event");
    expect(next.eventQueue[0]?.stage).toBe("act2");
  });

  it("stayOnEvent keeps the queued event and sanCap clamps current SAN", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      player: { ...state.player, san: 18 },
      eventQueue: [createEventQueueItem({
        id: "cold-event",
        title: "Cold Event",
        description: "Tests san cap and retry behavior.",
        preview: "cold",
        source: "random",
        blocking: true,
        deadlineMonths: 0,
        chainId: "cold-event",
        stage: "act1",
        choices: [
          { id: "retry", label: "Retry", outcome: "Need more money.", effects: { stayOnEvent: true } },
          { id: "hurt", label: "Hurt", outcome: "Cap down.", effects: { sanCapDelta: -4, achievementFlags: ["nearDeath"] } },
        ],
      }, 1)],
    };

    const stillQueued = dispatchAction(state, "resolve-event", { eventChoiceId: "retry" });
    expect(stillQueued.eventQueue).toHaveLength(1);

    const resolved = dispatchAction(state, "resolve-event", { eventChoiceId: "hurt" });
    expect(resolved.eventQueue).toHaveLength(0);
    expect(resolved.sanCap).toBe(16);
    expect(resolved.player.san).toBe(16);
    expect(resolved.achievementFlags.nearDeath).toBe(true);
  });

  it("joint training reconciles citation-tier cap after publication citations cross a threshold", () => {
    let state = startWith("normal", "level5");
    state = {
      ...state,
      year: 1,
      month: 9,
      totalMonths: 9,
      totalCitations: 499,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
      conferenceEncounterState: {
        ...state.conferenceEncounterState,
        bigBullCooperation: true,
      },
      jointTrainingState: {
        citationBonusApplied: 0,
      },
      papers: [{
        id: "published-paper",
        title: "Published Paper",
        idea: 7,
        experiment: 7,
        writing: 7,
        status: "published",
        target: "A",
        reviewMonthsLeft: 0,
        submittedIdea: 7,
        submittedExperiment: 7,
        submittedWriting: 7,
        publication: {
          citations: 499,
          monthsSincePublication: 0,
          pendingCitationFraction: 0,
          effectiveScore: 21,
          citationMultiplier: 1,
        },
      }],
    };

    state = dispatchAction(state, "next-month");

    expect(state.totalCitations).toBe(500);
    expect(state.jointTrainingState.citationBonusApplied).toBe(2);
    expect(state.researchCapacityState.jointTrainingCitationCapBonus).toBe(2);
    expect(state.log.some((entry) => entry.text.includes("联培加成：引用达到 500，科研上限 +2（联培累计 +2）。"))).toBe(true);
  });

  it("relationship task actions stay outside monthly action count and can enqueue advisor reward events", () => {
    let state = startWith("genius", "level5");
    state = {
      ...state,
      actionsRemaining: 0,
      player: { ...state.player, research: 6 },
      papers: [{
        id: "draft-paper",
        title: "Draft Paper",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "draft",
        target: null,
        reviewMonthsLeft: 0,
        submittedIdea: null,
        submittedExperiment: null,
        submittedWriting: null,
      }],
      advisorProgressState: {
        ...state.advisorProgressState,
        researchResource: 3,
        affinity: 4,
        taskMultiplier: 6,
        taskMax: 38,
        taskProgress: 36,
        taskUsedThisMonth: false,
        completedProjectCount: 0,
      },
    };

    state = dispatchAction(state, "advance-advisor-task");

    expect(state.actionsRemaining).toBe(0);
    expect(state.advisorProgressState.completedProjectCount).toBe(1);
    expect(state.eventQueue.some((event) => event.chainId === "advisor-task-reward")).toBe(true);
  });

  it("lover task actions stay outside monthly action count and can enqueue lover reward events", () => {
    let state = startWith("genius", "level5");
    state = {
      ...state,
      actionsRemaining: 0,
      player: { ...state.player, money: 10, san: 20, research: 8 },
      papers: [{
        id: "draft-paper",
        title: "Draft Paper",
        idea: 0,
        experiment: 0,
        writing: 0,
        status: "draft",
        target: null,
        reviewMonthsLeft: 0,
        submittedIdea: null,
        submittedExperiment: null,
        submittedWriting: null,
      }],
      loverState: {
        ...state.loverState,
        active: true,
        type: "smart",
        startTotalMonths: 1,
      },
      loverProgressState: {
        ...state.loverProgressState,
        active: true,
        research: 9,
        intimacy: 10,
        taskProgress: 55,
        taskMax: 60,
        relationProgress: 0,
        relationMax: 40,
        canInteract: false,
        taskUsedThisMonth: false,
        completedTaskCount: 0,
        interactCount: 0,
      },
    };

    state = dispatchAction(state, "advance-lover-task");

    expect(state.actionsRemaining).toBe(0);
    expect(state.player.money).toBe(8);
    expect(state.loverProgressState).toMatchObject({
      completedTaskCount: 1,
      intimacy: 11,
      taskProgress: 0,
    });
    expect(state.eventQueue.some((event) => event.chainId === "lover-task-reward")).toBe(true);
  });


  it("relationship additions create fellow progress profiles for long-term fellow tasks", () => {
  let state = startWith("social", "level5");
  state = {
    ...state,
    relationshipState: {
      ...state.relationshipState,
      unlockedSlots: 4,
    },
    eventQueue: [createEventQueueItem({
      id: "fellow-additions",
      title: "Fellow Additions",
      description: "Adds three fellow relationships.",
      preview: "fellow additions",
      source: "system",
      blocking: true,
      deadlineMonths: 0,
      chainId: "fellow-additions",
      stage: "act1",
      choices: [{
        id: "take",
        label: "Take",
        outcome: "Applied.",
        effects: {
          relationshipAdditions: ["senior", "peer", "junior"],
        },
      }],
    }, 1)],
  };

  state = dispatchAction(state, "resolve-event", { eventChoiceId: "take" });

  expect(state.relationshipState.seniorCount).toBe(1);
  expect(state.relationshipState.peerCount).toBe(1);
  expect(state.relationshipState.juniorCount).toBe(1);
  expect(state.relationshipState.occupiedSlots).toBe(4);
  expect(state.fellowProgressState).toHaveLength(3);
  expect(state.fellowProgressState.map((profile) => profile.type)).toEqual(["senior", "peer", "junior"]);
  expect(state.fellowProgressState.map((profile) => profile.taskType)).toEqual(["writing", "experiment", "idea"]);
  });

  it("fellow task actions stay outside monthly action count and can enqueue fellow reward events", () => {
  let state = startWith("genius", "level5");
  state = {
    ...state,
    actionsRemaining: 0,
    player: { ...state.player, research: 6 },
    papers: [{
      id: "draft-paper",
      title: "Draft Paper",
      idea: 0,
      experiment: 0,
      writing: 0,
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
    }],
    fellowProgressState: [{
      id: "junior-1",
      type: "junior",
      research: 6,
      affinity: 4,
      taskType: "idea",
      taskProgress: 58,
      taskMax: 60,
      relationProgress: 0,
      relationMax: 40,
      canInteract: false,
      taskUsedThisMonth: false,
      completedTaskCount: 0,
      interactCount: 0,
      startTotalMonths: 1,
    }],
  };

  state = dispatchAction(state, "advance-fellow-task", { relationshipId: "junior-1" });

  expect(state.actionsRemaining).toBe(0);
  expect(state.player.san).toBe(18);
  expect(state.fellowProgressState[0]).toMatchObject({
    completedTaskCount: 1,
    affinity: 5,
    taskProgress: 1,
  });
  expect(state.eventQueue.some((event) => event.chainId === "fellow-task-reward")).toBe(true);
});
  it("lab talent adds team-size bonus to paper actions when active", () => {
    let state = startWith("normal", "level5");
    state = dispatchAction(state, "create-paper");
    const paperId = state.selectedPaperId;
    if (!paperId) throw new Error("paper id missing");

    state = {
      ...state,
      relationshipState: {
        ...state.relationshipState,
        occupiedSlots: 4,
        advisorCount: 1,
        seniorCount: 1,
        juniorCount: 1,
        peerCount: 1,
      },
    };

    state = dispatchAction(state, "idea", { paperId });
    expect(state.papers[0]?.idea).toBe(6);
  });

  it("next-month applies lab talent yearly growth to due fellow relationships", () => {
    let state = startWith("genius", "level5");
    state = {
      ...state,
      year: 1,
      month: 12,
      totalMonths: 12,
      availableRandomEvents: [],
      usedRandomEvents: [...BASE_RANDOM_EVENT_IDS],
      eventQueue: [],
      pendingDecision: null,
      player: { ...state.player, research: 8, social: 0 },
      relationshipState: {
        ...state.relationshipState,
        unlockedSlots: 4,
        occupiedSlots: 4,
        advisorCount: 1,
        seniorCount: 1,
        juniorCount: 1,
        peerCount: 1,
      },
      advisorProgressState: {
        ...state.advisorProgressState,
        researchResource: 7,
      },
      fellowProgressState: [
        {
          id: "senior-1",
          type: "senior",
          research: 2,
          affinity: 2,
          taskType: "writing",
          taskProgress: 0,
          taskMax: 60,
          relationProgress: 0,
          relationMax: 40,
          canInteract: false,
          taskUsedThisMonth: false,
          completedTaskCount: 0,
          interactCount: 0,
          startTotalMonths: 1,
        },
        {
          id: "peer-1",
          type: "peer",
          research: 4,
          affinity: 3,
          taskType: "experiment",
          taskProgress: 0,
          taskMax: 60,
          relationProgress: 0,
          relationMax: 40,
          canInteract: false,
          taskUsedThisMonth: false,
          completedTaskCount: 0,
          interactCount: 0,
          startTotalMonths: 1,
        },
        {
          id: "junior-1",
          type: "junior",
          research: 5,
          affinity: 3,
          taskType: "idea",
          taskProgress: 0,
          taskMax: 60,
          relationProgress: 0,
          relationMax: 40,
          canInteract: false,
          taskUsedThisMonth: false,
          completedTaskCount: 0,
          interactCount: 0,
          startTotalMonths: 2,
        },
      ],
    };

    state = dispatchAction(state, "next-month");

    expect(state.fellowProgressState[0]?.research).toBe(4);
    expect(state.fellowProgressState[1]?.research).toBe(5);
    expect(state.fellowProgressState[2]?.research).toBe(5);
    expect(state.log.some((entry) => entry.text.includes("实验室互帮互助：师兄师姐 1 科研 +2（组内 4 人高于 TA）。"))).toBe(true);
  });

});
