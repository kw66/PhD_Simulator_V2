import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { renderApp } from "../src/app/v2-render";
import { createScholarshipEvent } from "../src/core/v2-fixed-events-scholarship";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { resolveSummerVacationFixedEvent } from "../src/core/v2-fixed-events-summer";
import { resolveTeachersDayFixedEvent } from "../src/core/v2-fixed-events-teachers-day";
import { resolveCcigFixedEvent } from "../src/core/v2-fixed-events-ccig-resolution";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { createAdvancedConferenceActivityOptions } from "../src/core/v2-conference-activity-advanced-options";
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
    const root = createScholarshipEvent({ ...initial, year: 3, month: 2, totalResearchScore: score }, roll);
    const decision = decisionOf(root);
    const result = decisionOf(decision);
    expect(root.description + decision.description).not.toMatch(/条件：|分数线\s*2/u);
    expect(decision.choices[0]!.outcome).not.toMatch(/条件：|≥|</u);
    expect(settlementOf(result)).toContain(`条件：本次可用科研积分 ${score} ${score >= 2 ? "≥" : "<"} 分数线 2`);
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
    expect(root.description + decision.description).not.toContain("条件：");
    for (const choice of decision.choices) {
      expect(choice.outcome).not.toContain("条件：");
      const result = choice.effects.enqueueEvents![0]!;
      expect(settlementOf(result)).toContain(`条件：合作人数 ${occupiedSlots} ${occupiedSlots < 4 ? "<" : "≥"} 4`);
      expect(choice.effects.fellowAdditions?.length ?? 0).toBe(occupiedSlots < 4 ? 1 : 0);
    }
  });

  it.each([0, 1, 7])("reports rounded summer recovery for SAN gap %i", (gap) => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, san: initial.sanCap - gap } };
    for (const [kind, ratio] of [["summer-vacation-home", 0.25], ["summer-vacation-travel", 0.5]] as const) {
      const roll = vi.fn(() => 0);
      const resolution = resolveSummerVacationFixedEvent(state, { kind }, roll)!;
      const result = resolution.enqueueEvents![0]!;
      expect(settlementOf(result)).not.toContain("条件：");
      expect(settlementOf(result)).toContain(`SAN +${Math.ceil(gap * ratio)}`);
      expect(result.choices[0]!.effects.san ?? 0).toBe(Math.ceil(gap * ratio));
      expect(resolution.nextState).toBe(state);
      expect(roll).not.toHaveBeenCalled();
    }
  });

  it.each([5, 6])("reports the selected teachers-day probability at favor %i", (favor) => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, favor } };
    for (const rollValue of [0, 0.5]) {
      const roll = vi.fn(() => rollValue);
      const resolution = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, roll);
      const result = resolution.enqueueEvents![0]!;
      expect(settlementOf(result)).toContain("条件：");
      const branch = rollValue >= 0.5 ? "普通回复" : favor < 6 ? "报销跑腿" : "分享想法";
      expect(settlementOf(result)).toContain(`；${branch}（50%）`);
      expect(result.id).toContain(favor < 6
        ? rollValue < 0.5 ? "message-errand" : "message-plain"
        : rollValue < 0.5 ? "message-idea" : "message-reply");
      expect(roll).toHaveBeenCalledTimes(favor >= 6 && rollValue < 0.5 ? 2 : 1);
    }
  });

  it.each([0, 5, 6, 20])("renders a teachers-day reply as no effect at favor %i", (favor) => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, favor } };
    for (const rollValue of [0.5, 0.999999]) {
      const resolution = resolveTeachersDayFixedEvent(state, { kind: "teachers-day-message" }, () => rollValue);
      const result = resolution.enqueueEvents![0]!;
      expect(resolution.nextState).toBe(state);
      expect(settlementOf(result).trim()).toBe(`条件：导师好感 ${favor < 6 ? "<" : "≥"} 6；普通回复（50%）\n结果：无事发生`);
      expect(result.completionLog).toContain("无事发生");
      const html = renderApp({
        ...state,
        phase: "playing",
        month: 1,
        totalMonths: 1,
        eventQueue: [{ ...result, queueOrder: 1 }],
      }, undefined, { activePlayTab: "events", activeEventId: result.id, isEventContentOpen: true });
      expect(html).toContain('<span class="event-settlement-item">无事发生</span>');
      expect(html).toContain('<span class="event-settlement-item">普通回复（50%）</span>');
      expect(html).not.toContain("数值变化 0");
      expect(html).not.toContain("仅回复祝福概率");
    }
  });

  it.each([0, 0.34, 0.67])("reports CCIG's selected draw without rerolling at %f", (rollValue) => {
    const state = createInitialState();
    const roll = vi.fn(() => rollValue);
    const resolution = resolveCcigFixedEvent(state, { kind: "ccig-activity-listen" }, roll);
    const result = resolution.enqueueEvents![0]!;
    expect(settlementOf(result)).not.toContain("条件：");
    expect(result.choices[0]!.effects.temporaryActionEffectUpdates?.idea?.bonus).toBe(4 + Math.floor(rollValue * 3));
    expect(resolution.nextState).toBe(state);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it("marks CCIG poster percentage as an effect, with the paper requirement separate", () => {
    const initial = createInitialState();
    const paper = createGrantedPublishedPaper(17, 0, { target: "A", acceptedScore: 30 });
    const state = { ...initial, externalPublications: [paper] };
    const result = resolveCcigFixedEvent(state, { kind: "ccig-activity-poster", ccigPaperId: paper.id }, () => 0).enqueueEvents![0]!;
    const settlement = settlementOf(result);
    expect(settlement).toContain("条件：展示论文为已发表的一作 A 类论文");
    expect(settlement).toMatch(/结果：[^\n]*宣传倍率 \+50%/u);
    expect(result.choices[0]!.effects.paperUpdates?.[0]?.id).toBe(paper.id);
  });

  it.each([0, 1])("keeps conference follow-up counters factual before count %i", (count) => {
    const initial = createInitialState();
    const options = createAdvancedConferenceActivityOptions({
      research: 12,
      social: 12,
      relationshipState: initial.relationshipState,
      conferenceEncounterState: {
        ...initial.conferenceEncounterState,
        metBigBullCoop: true, metBeautiful: true, metSmart: true,
        bigBullDeepCount: count, beautifulCount: count, smartCount: count,
      },
      conferenceCareerState: initial.conferenceCareerState,
      internshipState: initial.internshipState,
      loverState: initial.loverState,
    });
    const context = { id: "test", conferenceName: "CVPR", conferenceYear: 2026, city: "杭州", country: "中国", paperCount: 1, grade: "A" as const };
    expect(options.map((option) => option.id)).toEqual(["big-bull-joint-training", "beautiful-lover-development", "smart-lover-development"]);
    for (const option of options) {
      const result = createConferenceActivityResult(context, option, "自费参会");
      expect(settlementOf(result)).toContain("条件：");
      expect(settlementOf(result)).toMatch(count === 0 ? /<\s*2/u : /≥\s*2/u);
      expect(Boolean(option.effects.triggerJointTrainingInvite || option.effects.triggerLoverDevelopment)).toBe(count >= 1);
      expect(result.choices[0]!.effects.conferenceEncounterUpdates).toEqual(option.effects.conferenceEncounterUpdates);
    }
  });

  it.each([0, 1])("shows internship and lover rejection thresholds for prior count %i", (rejectCount) => {
    const initial = createInitialState();
    const roots = [
      createInternshipInviteAct1({ ...buildInternshipInviteContext(initial), rejectedInternshipCount: rejectCount }),
      createLoverDevelopmentAct1({ ...buildLoverDevelopmentContext({
        conferenceEncounterState: initial.conferenceEncounterState,
        totalMonths: 1,
        type: "beautiful",
        playerGender: "female",
      }), rejectCount }),
    ];
    for (const root of roots) {
      const decision = decisionOf(root);
      expect(root.description + decision.description).not.toContain("条件：");
      const decline = decision.choices.find((choice) => choice.id === "decline")!;
      const result = decline.effects.enqueueEvents![0]!;
      expect(settlementOf(result)).toContain("条件：");
      expect(settlementOf(result).replace(/\s/gu, "")).toContain(`${rejectCount + 1}${rejectCount >= 1 ? "≥" : "<"}2`);
      expect(settlementOf(result)).toContain("结果：");
      expect(decline.effects.conferenceCareerUpdates?.permanentlyBlockedInternship
        ?? decline.effects.conferenceEncounterUpdates?.permanentlyBlockedBeautifulLover).toBe(rejectCount >= 1);
    }
  });
});
