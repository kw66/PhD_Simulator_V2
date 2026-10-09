import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildConferenceDecisionEventsForAcceptedPapers,
  createConferenceDecisionAct1,
  refreshConferenceDecision,
  type ConferenceEventBuilderState,
  type ConferenceEventContext,
} from "../src/core/v2-conference-events";
import { getConferenceTripId } from "../src/core/v2-conference-identity";
import type { ConferenceDecisionMode } from "../src/core/v2-conference-system";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import type { GameState, PendingEvent } from "../src/core/v2-types";

const modes = ["self", "advisor", "proxy"] as const;
const context: ConferenceEventContext = {
  id: "conference-scheduling", conferenceName: "CVPR", conferenceYear: 2031,
  city: "测试城", country: "测试国", region: "asia", grade: "A",
  paperCount: 1, paperIds: ["paper-1"], availableAtTotalMonths: 14,
  paperPresentations: [{ id: "paper-1", title: "A confirmed paper", acceptType: "Oral", citationPromotionMultiplier: 1.5 }],
};

function builderState(state: GameState): ConferenceEventBuilderState {
  return { ...state, favor: state.player.favor, social: state.player.social, research: state.player.research };
}

function selection(root: PendingEvent): PendingEvent {
  return root.choices[0]!.effects.enqueueEvents![0]!;
}

function confirmation(root: PendingEvent, mode: ConferenceDecisionMode): PendingEvent {
  return selection(root).choices.find((choice) => choice.id === mode)!.effects.enqueueEvents![0]!;
}

function stages(root: PendingEvent): PendingEvent[] {
  return [root, selection(root), ...modes.map((mode) => confirmation(root, mode))];
}

afterEach(() => vi.restoreAllMocks());

describe("conference decision scheduling contract", () => {
  it.each([5, 14, 17])("sets the remaining deadline on all stages at month %i", (totalMonths) => {
    const state = { ...createStartedGameState("normal"), totalMonths };
    const root = createConferenceDecisionAct1(context, builderState(state), () => 0.5);
    for (const event of stages(root)) expect(event.deadlineMonths).toBe(Math.max(0, 14 - totalMonths));
    expect(root.title).toBe("CVPR参会");
    expect(root.description).toContain("论文1：《A confirmed paper》（Oral）");
    expect(root.description).not.toContain("会议临近");
    expect(selection(root).title).toBe("CVPR参会 ➜ 参会方式");
  });

  it("uses a zero deadline when either optional timing field is unavailable", () => {
    const state = builderState(createStartedGameState("normal"));
    for (const root of [
      createConferenceDecisionAct1(context, { ...state, totalMonths: undefined }, () => 0.5),
      createConferenceDecisionAct1({ ...context, availableAtTotalMonths: undefined }, state, () => 0.5),
    ]) {
      for (const event of stages(root)) expect(event.deadlineMonths).toBe(0);
    }
  });

  it.each(modes)("schedules %s without completing attendance during confirmation", (mode) => {
    const state = builderState(createStartedGameState("normal"));
    const root = createConferenceDecisionAct1(context, { ...state, favor: 0 }, () => 0.5);
    const final = confirmation(root, mode);
    const effects = final.choices[0]!.effects;
    expect(final.title).toBe("CVPR参会 ➜ 参会方式 ➜ 参会确认");
    const attendanceResult = mode === "proxy" ? "不去参会" : "亲自参会";
    expect(final.description).toContain(attendanceResult);
    expect(final.completionLog).toContain(attendanceResult);
    expect(`${final.description}\n${final.completionLog}`).not.toMatch(/展示完成|展示已完成|引用倍率|参会已处理/u);
    expect(effects.enqueueEvents).toBeUndefined();
    expect(effects.paperUpdates).toBeUndefined();
    expect(effects.counterDeltas).toBeUndefined();
    expect(effects.scheduleConferenceAttendance).toEqual({ context, mode, rolls: Array(16).fill(0.5) });
    expect(effects.money).toBe(mode === "self" ? -4 : undefined);
    expect(effects.favor).toBe(mode === "advisor" ? -2 : undefined);
    expect(effects.advisorProgressStateDeltas).toEqual(mode === "advisor" ? { funding: -4 } : undefined);
    expect(effects.recordPlayerConferenceTrip).toBe(mode === "proxy" ? undefined : getConferenceTripId(context));
    for (const event of [root, selection(root)]) {
      for (const choice of event.choices) expect(choice.effects.scheduleConferenceAttendance).toBeUndefined();
    }
  });

  it("refreshes every stage deadline while preserving mode-specific rolls and event identity", () => {
    const state = { ...createStartedGameState("normal"), totalMonths: 5 };
    let rollIndex = 0;
    const getRoll = vi.fn(() => ++rollIndex / 100);
    const root = createConferenceDecisionAct1(context, builderState(state), getRoll);
    expect(getRoll).toHaveBeenCalledTimes(51);
    const plans = modes.map((mode) => confirmation(root, mode).choices[0]!.effects.scheduleConferenceAttendance!);
    expect(plans.map((plan) => plan.rolls)).toEqual(modes.map((_, index) =>
      Array.from({ length: 16 }, (_, offset) => (4 + index * 16 + offset) / 100)));
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("preview rerolled"); });
    for (const original of stages(root)) {
      let event = { ...original, id: `queued-${original.id}` };
      for (const totalMonths of [8, 14, 17]) {
        const current = { ...state, totalMonths, player: { ...state.player, favor: totalMonths, social: totalMonths } };
        event = refreshConferenceDecision(current, event);
        expect(event.id).toBe(`queued-${original.id}`);
        expect(event.deadlineMonths).toBe(Math.max(0, 14 - totalMonths));
        expect(event.conferencePreview!.rolls).toEqual(root.conferencePreview!.rolls);
        const finals = event.stage === "act3" ? [event]
          : (event.stage === "act1" ? selection(event) : event).choices.map((choice) => choice.effects.enqueueEvents![0]!);
        for (const final of finals) {
          const plan = final.choices[0]!.effects.scheduleConferenceAttendance!;
          expect(final.deadlineMonths).toBe(Math.max(0, 14 - totalMonths));
          expect(plan).toEqual(plans.find((candidate) => candidate.mode === plan.mode));
        }
      }
    }
    expect(random).not.toHaveBeenCalled();
    expect(getRoll).toHaveBeenCalledTimes(51);
  });

  it.each([[14, 14], [14, 12], [12, 14], [undefined, 14], [14, undefined]] as const)(
    "carries the earliest supplied due month when grouping %s and %s", (firstDue, secondDue) => {
      const state = { ...builderState(createStartedGameState("normal")), totalMonths: 5 };
      const roots = buildConferenceDecisionEventsForAcceptedPapers([
        { id: "paper-1", target: "A", submittedMonth: 3, submittedYear: 1, availableAtTotalMonths: firstDue },
        { id: "paper-2", target: "A", submittedMonth: 3, submittedYear: 1, availableAtTotalMonths: secondDue },
      ], state, () => 0.5);
      expect(roots).toHaveLength(1);
      const due = Math.min(firstDue ?? Infinity, secondDue ?? Infinity);
      expect(roots[0]!.conferencePreview!.context.availableAtTotalMonths).toBe(due);
      expect(roots[0]!.conferencePreview!.context.paperIds).toEqual(["paper-1", "paper-2"]);
      for (const event of stages(roots[0]!)) expect(event.deadlineMonths).toBe(due - 5);
      for (const mode of modes) {
        expect(confirmation(roots[0]!, mode).choices[0]!.effects.scheduleConferenceAttendance!.context.availableAtTotalMonths).toBe(due);
      }
    },
  );
});
