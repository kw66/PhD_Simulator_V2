import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { renderApp } from "../src/app/v2-render";
import { createScholarshipEvent, resolveScholarshipApplication } from "../src/core/v2-fixed-events-scholarship";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { refreshSummerVacationEvent, resolveSummerVacationFixedEvent } from "../src/core/v2-fixed-events-summer";
import { resolveTeachersDayFixedEvent } from "../src/core/v2-fixed-events-teachers-day";
import { resolveWinterVacationFixedEvent } from "../src/core/v2-fixed-events-winter";
import { resolveCcigFixedEvent } from "../src/core/v2-fixed-events-ccig-resolution";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { createAdvancedConferenceActivityOptions } from "../src/core/v2-conference-activity-advanced-options";
import { createConferenceMentorContact, createConferenceScholarContact } from "../src/core/v2-conference-contacts";
import { createConferenceActivityResult } from "../src/core/v2-conference-activity-events";
import { createInternshipInviteAct1, buildInternshipInviteContext } from "../src/core/v2-internship-events";
import { createLoverDevelopmentAct1, buildLoverDevelopmentContext } from "../src/core/v2-lover-events";
import type { PendingEvent } from "../src/core/v2-types";

function decisionOf(event: PendingEvent): PendingEvent {
  return event.choices[0]!.effects.enqueueEvents![0]!;
}

function settlementOf(event: PendingEvent): string {
  expect(event.description).toContain("机制结算");
  return event.description.split("机制结算")[1]!;
}

describe("fixed result conditions", () => {
  it.each([1, 2, 3])("shows the sampled scholarship cutoff only in the result for score %i", (score) => {
    const initial = createInitialState();
    const roll = vi.fn(() => 0);
    const state = { ...initial, year: 3, month: 2, totalResearchScore: score };
    const root = createScholarshipEvent(state, roll);
    const decision = decisionOf(root);
    expect(roll).not.toHaveBeenCalled();
    expect(decision.description).toContain("往年同年级的分数线在2～4分");
    const result = resolveScholarshipApplication(state, decision.choices[0]!.effects.fixedEventResolution!, roll).enqueueEvents![0]!;
    expect(root.description).toContain("小提示：出现条件：第2学年起，每年10月");
    expect(root.description.replace(/小提示：出现条件：[^\n]+/u, "") + decision.description).not.toMatch(/条件：|分数线为/u);
    expect(decision.choices[0]!.outcome).not.toMatch(/条件：|≥|</u);
    expect(settlementOf(result)).toContain(`条件：评奖科研分 ${score} ${score >= 2 ? "≥" : "<"} 分数线 2`);
    expect(result.choices[0]!.effects.money ?? 0).toBe(score >= 2 ? 6 : 0);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it.each([0, 4])("keeps mentor capacity predicates out of navigation with %i fellows", (occupiedSlots) => {
    const initial = createInitialState();
    const root = createMentorAssignEvent({
      ...initial,
      relationshipState: { ...initial.relationshipState, unlockedSlots: 5, occupiedSlots },
    }, () => 0);
    const decision = decisionOf(root);
    expect(root.description).toContain("小提示：出现条件：转博后的首个9月");
    expect(root.description.replace(/小提示：出现条件：[^\n]+/u, "") + decision.description).not.toContain("条件：");
    for (const choice of decision.choices) {
      expect(choice.outcome).not.toContain("条件：");
      const result = choice.effects.enqueueEvents![0]!;
      expect(settlementOf(result)).toContain(`条件：${occupiedSlots < 4 ? "人际栏有空位" : "人际栏已满"}`);
      expect(settlementOf(result)).not.toContain("合作人数");
      expect(choice.effects.fellowAdditions?.length ?? 0).toBe(occupiedSlots < 4 ? 1 : 0);
    }
  });

  it.each([0, 1, 3, 4, 5, 7, 15, 20])("reports rounded summer recovery for SAN gap %i", (gap) => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, san: initial.sanCap - gap } };
    for (const [kind, ratio] of [["summer-vacation-home", 0.3], ["summer-vacation-travel", 0.3]] as const) {
      const roll = vi.fn(() => 0);
      const resolution = resolveSummerVacationFixedEvent(state, { kind }, roll)!;
      const result = resolution.enqueueEvents![0]!;
      if (kind === "summer-vacation-home") expect(settlementOf(result)).not.toContain("条件：");
      expect(settlementOf(result)).toContain(`SAN +${Math.floor(gap * ratio)}（已损SAN${ratio * 100}%）`);
      expect(result.choices[0]!.effects.san ?? 0).toBe(Math.floor(gap * ratio));
      expect(resolution.nextState).toBe(state);
      expect(roll).not.toHaveBeenCalled();
    }
  });

  it.each([0, 1, 4, 5, 7, 10, 15, 20])("floors winter recovery at twenty percent for SAN gap %i in every branch", (gap) => {
    const initial = createInitialState();
    for (const branch of [0, 0.4, 0.8]) {
      for (const active of [false, true]) {
        const state = { ...initial, player: { ...initial.player, san: initial.sanCap - gap }, loverState: { ...initial.loverState, active } };
        const rolls = [branch, 0.99];
        const resolution = resolveWinterVacationFixedEvent(state, { kind: "winter-vacation-rest" }, () => rolls.shift() ?? 0.99)!;
        const result = resolution.enqueueEvents![0]!;
        expect(result.choices[0]!.effects.san ?? 0).toBe(Math.floor(gap * 0.2));
        expect(settlementOf(result)).toContain(`SAN +${Math.floor(gap * 0.2)}（已损SAN20%）`);
        expect(resolution.nextState).toBe(state);
      }
    }
  });

  it("refreshes summer travel recovery and effect text after SAN changes", () => {
    const initial = createInitialState();
    const beforeTravel = { ...initial, player: { ...initial.player, san: initial.sanCap - 7 } };
    const result = resolveSummerVacationFixedEvent(beforeTravel, { kind: "summer-vacation-travel" }, () => 0)!.enqueueEvents![0]!;
    expect(result.description).toContain("SAN +2（已损SAN30%）");
    const refreshed = refreshSummerVacationEvent(
      { ...initial, player: { ...initial.player, san: initial.sanCap } },
      { ...result, queueOrder: 1 },
    );
    expect(refreshed.description).toContain("结果：金币 -3\n结果：SAN +0（已损SAN30%）");
    expect(refreshed.description).not.toContain("旅行放松");
    expect(refreshed.choices[0]!.effects.san).toBeUndefined();
  });

  it("adds travel social growth and the full-SAN-cap reward", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      player: { ...initial.player, san: 18, social: 0 },
    };
    const result = resolveSummerVacationFixedEvent(state, { kind: "summer-vacation-travel" }, () => 0.99)!.enqueueEvents![0]!;
    const choice = result.choices[0]!;
    expect(choice.effects.social).toBe(1);
    expect(choice.effects.sanCapDelta).toBe(1);
    expect(choice.effects.san).toBeUndefined();
    expect(result.description).toContain("结果：社交 +1");
    expect(result.description).toContain("额外：条件：SAN ≥ 18｜结果：SAN上限 +1");
    expect(result.description).toContain("结果：SAN上限 +1");
    const html = renderApp({
      ...state,
      phase: "playing",
      month: 11,
      totalMonths: 11,
      eventQueue: [{ ...result, queueOrder: 1 }],
    }, undefined, { activePlayTab: "events", activeEventId: result.id, isEventContentOpen: true });
    const rows = html.match(/<div class="event-settlement-row[^>]*>[\s\S]*?<\/div>/g)!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("金币 -3");
    expect(rows[0]).toContain("已损SAN30%");
    expect(rows[0]).toContain("社交 +1");
    expect(rows[0]).not.toContain("SAN上限");
    expect(rows[0]).not.toContain("≥");
    expect(rows[1]).not.toContain("额外");
    expect(rows[1]).toContain("条件</span>");
    expect(rows[1]).toContain("SAN ≥ 18");
    expect(rows[1]).toContain("结果</span>");
    expect(rows[1]).toContain("SAN上限 +1");
    const belowThreshold = refreshSummerVacationEvent({ ...state, player: { ...state.player, san: 17 } }, result);
    expect(belowThreshold.description).not.toContain("额外：");
    expect(belowThreshold.choices[0]!.effects.sanCapDelta).toBeUndefined();
  });

  it.each([5, 6])("reports the selected teachers-day probability at favor %i", (favor) => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, favor } };
    for (const rollValue of [0, 0.5]) {
      const roll = vi.fn(() => rollValue);
      const resolution = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, roll);
      const result = resolution.enqueueEvents![0]!;
      expect(settlementOf(result)).toContain("条件：");
      const branch = rollValue >= 0.5 ? "普通回复" : favor >= 6 ? "分享想法" : "报销跑腿";
      const percent = favor >= 6 ? 50 : rollValue >= 0.5 ? 60 : 40;
      expect(settlementOf(result)).toContain(`条件：导师好感 ${favor >= 6 ? "≥" : "<"} 6；${branch}（${percent}%）`);
      expect(result.id).toContain(rollValue < 0.5 ? favor >= 6 ? "message-idea" : "message-errand" : "message-plain");
      expect(roll).toHaveBeenCalledTimes(1);
    }
  });

  it.each([0, 5, 6, 20])("renders a teachers-day reply as no effect at favor %i", (favor) => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, favor } };
    for (const rollValue of [0.5, 0.999999]) {
      const resolution = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, () => rollValue);
      const result = resolution.enqueueEvents![0]!;
      expect(resolution.nextState).toBe(state);
      expect(settlementOf(result).trim()).toBe(`条件：导师好感 ${favor >= 6 ? "≥" : "<"} 6；普通回复（${favor >= 6 ? 50 : 60}%）\n结果：无事发生`);
      expect(result.completionLog).toContain("无事发生");
      const html = renderApp({
        ...state,
        phase: "playing",
        month: 1,
        totalMonths: 1,
        eventQueue: [{ ...result, queueOrder: 1 }],
      }, undefined, { activePlayTab: "events", activeEventId: result.id, isEventContentOpen: true });
      expect(html).toContain('<span class="event-settlement-item">无事发生</span>');
      expect(html).toContain(`<span class="event-settlement-item">普通回复（${favor >= 6 ? 50 : 60}%）</span>`);
      expect(html).not.toContain("数值变化 0");
      expect(html).not.toContain("仅回复祝福概率");
    }
  });

  it.each([0, 0.34, 0.67])("uses a fixed CCIG idea reward regardless of roll %f", (rollValue) => {
    const state = createInitialState();
    const roll = vi.fn(() => rollValue);
    const resolution = resolveCcigFixedEvent(state, { kind: "ccig-activity-listen" }, roll);
    const result = resolution.enqueueEvents![0]!;
    expect(settlementOf(result)).not.toContain("条件：");
    expect(result.choices[0]!.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(5);
    expect(resolution.nextState).toBe(state);
    expect(roll).not.toHaveBeenCalled();
  });

  it("shows the CCIG poster effect without repeating option eligibility as a result condition", () => {
    const initial = createInitialState();
    const paper = createGrantedPublishedPaper(17, 0, { target: "A", acceptedScore: 30 });
    const state = { ...initial, externalPublications: [paper] };
    const result = resolveCcigFixedEvent(state, { kind: "ccig-activity-poster", ccigPaperId: paper.id }, () => 0).enqueueEvents![0]!;
    const settlement = settlementOf(result);
    expect(settlement).not.toContain("条件：");
    expect(settlement).toMatch(/结果：[^\n]*论文宣传倍率 \+25%/u);
    expect(result.choices[0]!.effects.paperUpdates?.[0]?.id).toBe(paper.id);
  });

  it.each([0, 1, 2])("keeps merged conference follow-up counters factual before count %i", (count) => {
    const initial = createInitialState();
    const mentor = { ...createConferenceMentorContact(), cooperationCount: count };
    const scholar = { ...createConferenceScholarContact("beautiful"), encounterCount: count };
    const options = createAdvancedConferenceActivityOptions({
      research: 12,
      social: 12,
      relationshipState: initial.relationshipState,
      conferenceEncounterState: {
        ...initial.conferenceEncounterState,
        bigBull: mentor, scholars: { beautiful: scholar },
      },
      conferenceCareerState: { ...initial.conferenceCareerState, enterpriseCount: count },
      externalPublications: [createGrantedPublishedPaper(17, 0, { target: "A", acceptedScore: 30 })],
      internshipState: initial.internshipState,
      loverState: initial.loverState,
    }, () => 0);
    const context = { id: "test", conferenceName: "CVPR", conferenceYear: 2026, city: "杭州", country: "中国", paperCount: 1, grade: "A" as const };
    expect(options.map((option) => option.id)).toEqual(["big-bull-coop", "opposite-scholar", "enterprise-networking"]);
    expect(options[0]!.effects.triggerJointTrainingInvite).toBe(count >= 2);
    expect(options[0]!.effects.conferenceEncounterUpdates?.bigBull).toEqual({ ...mentor, cooperationCount: count + 1 });
    expect(options[1]!.effects.triggerLoverDevelopment).toBe("beautiful");
    expect(options[1]!.effects.conferenceEncounterUpdates?.scholars?.beautiful).toEqual({ ...scholar, encounterCount: count + 1 });
    expect(options[2]!.effects.triggerInternshipInvite).toBe(count >= 1);
    for (const option of options) {
      const result = createConferenceActivityResult(context, option, "自费参会");
      const settlement = settlementOf(result);
      if (option.id === "big-bull-coop") expect(settlement).toContain(`条件：与${mentor.name}合作次数 ${count + 1}`);
      if (option.id === "enterprise-networking") expect(settlement).toContain(`条件：企业交流次数 ${count + 1}`);
      if (option.id === "opposite-scholar") expect(settlement).not.toContain("条件：");
      expect(settlement).not.toMatch(/<\s*2|≥\s*2/u);
      expect(result.choices[0]!.effects.conferenceEncounterUpdates).toEqual(option.effects.conferenceEncounterUpdates);
    }
  });

  it.each([0, 1, 100])("keeps internship and new lover opportunities open after rejection count %i", (rejectCount) => {
    const initial = createInitialState();
    const roots = [
      createInternshipInviteAct1({ ...buildInternshipInviteContext(initial, () => 0.5), rejectedInternshipCount: rejectCount }),
      createLoverDevelopmentAct1({ ...buildLoverDevelopmentContext({
        conferenceEncounterState: initial.conferenceEncounterState,
        totalMonths: 1,
        type: "beautiful",
        playerGender: "female",
      }, () => 0.5), rejectCount }),
    ];
    for (const root of roots) {
      const decision = decisionOf(root);
      expect(root.description + decision.description).not.toContain("条件：");
      const decline = decision.choices.find((choice) => choice.id === "decline")!;
      const result = decline.effects.enqueueEvents![0]!;
      expect(decline.effects.conferenceCareerUpdates).toBeUndefined();
      expect(decline.effects.conferenceEncounterUpdates).toBeUndefined();
      expect(result.choices[0]!.label).toBe("确定");
      expect(result.description).not.toMatch(/永久关闭|剩余1次/u);
      if (root.chainId === "internship-invite") {
        expect(settlementOf(result).trim()).toBe("结果：暂不实习");
        expect(result.choices[0]!.effects.conferenceCareerUpdates).toMatchObject({
          rejectedInternshipCount: rejectCount + 1, permanentlyBlockedInternship: false,
        });
      } else {
        expect(settlementOf(result).trim()).toBe("结果：无事发生");
        const updates = result.choices[0]!.effects.conferenceEncounterUpdates!;
        expect(updates.permanentlyBlockedBeautifulLover).toBe(false);
        expect(updates.scholars?.beautiful?.encounterCount).toBe(0);
        expect(updates.scholars?.beautiful?.id).not.toBe(root.loverDevelopmentPreview!.context.contact!.id);
      }
    }
  });
});
