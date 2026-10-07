import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConferenceDecisionEventsForAcceptedPapers, refreshConferenceDecision } from "../src/core/v2-conference-events";
import { getConferenceTripId, getPaperConferenceTripId } from "../src/core/v2-conference-identity";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function fixture() {
  const base = createStartedGameState("normal");
  const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 10, affinity: 2, startTotalMonths: 1 });
  const paper = {
    ...createGrantedPublishedPaper(1, 0, { target: "A", acceptedScore: 4 }),
    target: "A" as const, submittedMonth: 3, submittedYear: 1, leadAuthorId: fellow.id,
  };
  const state: GameState = {
    ...base, player: { ...base.player, favor: 12, social: 6 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    fellowProgressState: [fellow], fellowPapers: [paper], conferenceLocationSeed: 42,
  };
  let rollIndex = 0;
  const rolls = [0.1, 0.8, 0.3, 0.9, 0.2, 0.7, 0.4, 0.6];
  const root = buildConferenceDecisionEventsForAcceptedPapers([
    { id: "player-paper", target: "A", submittedMonth: 3, submittedYear: 1 },
  ], { ...state, favor: state.player.favor, research: state.player.research, social: state.player.social }, () => rolls[rollIndex++ % rolls.length]!)[0]!;
  return { state, paper, root };
}

function decision(root: PendingEvent) {
  return root.choices[0]!.effects.enqueueEvents![0]!;
}

function confirmation(event: PendingEvent, mode = "proxy") {
  return event.choices.find((choice) => choice.id === mode)!.effects.enqueueEvents![0]!;
}

afterEach(() => vi.restoreAllMocks());

describe("conference live proxy and stable previews", () => {
  it.each(["act1", "act2", "act3"] as const)("refreshes paid registration at %s without rerolling or changing charges", (stage) => {
    const { state, root } = fixture();
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("preview rerolled"); });
    for (const mode of ["self", "advisor", "proxy"]) {
      const previous = stage === "act1" ? root : stage === "act2" ? decision(root) : confirmation(decision(root), mode);
      const originalPreview = previous.conferencePreview!;
      let pending: PendingEvent = {
        ...previous,
        conferencePreview: {
          ...originalPreview,
          context: { ...originalPreview.context, paperCount: 2, paperIds: ["player-paper", "new-paper"] },
        },
      };
      const originalConfirmation = confirmation(decision(root), mode);
      for (const paidIds of [[], ["player-paper", "unrelated"], ["player-paper", "new-paper", "player-paper"], []]) {
        const current = { ...state, advisorProgressState: { ...state.advisorProgressState, paidConferenceRegistrationPaperIds: paidIds } };
        pending = refreshConferenceDecision(current, pending);
        const final = stage === "act3" ? pending : confirmation(stage === "act1" ? decision(pending) : pending, mode);
        const narrative = stage === "act1" ? pending.description : final.description;
        const paidCount = paidIds.includes("new-paper") ? 2 : paidIds.includes("player-paper") ? 1 : 0;
        if (paidCount > 0) {
          const label = `科研经费 -${paidCount}（注册费，已支付）`;
          expect(final.description).toContain(label);
          expect(final.completionLog).toContain(label);
          expect(narrative).toContain(paidCount === 2
            ? "本场 2 篇共 2 金币已支付。"
            : "本场 2 篇中已支付 1 篇，共 1 金币，其余尚无支付记录。");
        } else {
          expect(narrative).toContain("本场 2 篇尚无注册费支付记录。");
          expect(final.description).not.toContain("已支付");
          expect(final.completionLog).not.toContain("注册费");
        }
        expect(final.choices[0]!.effects.money).toBe(originalConfirmation.choices[0]!.effects.money);
        expect(final.choices[0]!.effects.advisorProgressStateDeltas).toEqual(originalConfirmation.choices[0]!.effects.advisorProgressStateDeltas);
        expect(final.choices[0]!.effects.favor).toBe(originalConfirmation.choices[0]!.effects.favor);
        expect(pending.conferencePreview!.rolls).toEqual(originalPreview.rolls);
        expect(final.conferencePreview!.rolls).toEqual(originalPreview.rolls);
        expect(current.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
      }
    }
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["act1", "act2", "act3"] as const)("keeps merged papers in every later refresh after merging at %s", (stage) => {
    const { state, root } = fixture();
    const previous = stage === "act1" ? root : stage === "act2" ? decision(root) : confirmation(decision(root));
    const originalPreview = previous.conferencePreview!;
    const merged = refreshConferenceDecision(state, {
      ...previous,
      conferencePreview: {
        ...originalPreview,
        context: {
          ...originalPreview.context, paperCount: 2, paperIds: ["player-paper", "new-paper"],
          paperPresentations: [...originalPreview.context.paperPresentations!, {
            id: "new-paper", title: "Newly accepted paper", acceptType: "Oral", citationPromotionMultiplier: 1.5,
          }],
        },
      },
    });
    const selected = stage === "act1" ? decision(merged) : merged;
    const final = stage === "act3" ? selected : confirmation(selected);
    const refreshed = refreshConferenceDecision(state, final);
    expect(refreshed.conferencePreview!.context.paperIds).toEqual(["player-paper", "new-paper"]);
    expect(refreshed.choices[0]!.effects.paperUpdates?.map((paper) => paper.id)).toEqual(["player-paper", "new-paper"]);
    expect(refreshed.description).toContain("论文2：Oral");
    expect(refreshed.conferencePreview!.rolls).toEqual(originalPreview.rolls);
  });

  it.each(["fellowPapers", "externalPublications", "papers"] as const)("finds a current fellow's accepted paper in %s", (collection) => {
    const { state, paper, root } = fixture();
    const current = { ...state, fellowPapers: [], externalPublications: [], papers: [], [collection]: [paper] };
    const refreshed = refreshConferenceDecision(current, decision(root));
    expect(confirmation(refreshed).choices[0]!.effects.money).toBe(-0);
    expect(refreshed.description).toContain("免费代贴");
    expect(getPaperConferenceTripId(paper, state.conferenceLocationSeed)).toBe(getConferenceTripId(root.conferencePreview!.context));
  });

  it("rechecks departed fellows at both selection and final confirmation without rerolling", () => {
    const { state, root } = fixture();
    const initialDecision = decision(root);
    const initialConfirmation = confirmation(initialDecision);
    const departed = { ...state, fellowProgressState: [] };
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("preview rerolled"); });
    const selected = refreshConferenceDecision(departed, initialDecision);
    const final = refreshConferenceDecision(departed, initialConfirmation);
    expect(confirmation(selected).choices[0]!.effects.money).toBe(-1);
    expect(final.choices[0]!.effects.money).toBe(-1);
    expect(final.description).toContain("陌生人帮忙代贴");
    expect(refreshConferenceDecision(state, final).choices[0]!.effects.money).toBe(-0);
    expect(initialConfirmation.choices[0]!.effects.money).toBe(-0);
    expect(random).not.toHaveBeenCalled();
  });

  it("requires acceptance at the same conference and ignores journals and previous years", () => {
    const { state, paper, root } = fixture();
    const pending = confirmation(decision(root));
    for (const patch of [{ status: "reviewing" as const }, { submittedYear: 2 }, { submittedMonth: 7 }, { journalTarget: "pami" as const }]) {
      expect(refreshConferenceDecision({ ...state, fellowPapers: [{ ...paper, ...patch }] }, pending).choices[0]!.effects.money).toBe(-1);
    }
    expect(getPaperConferenceTripId({ ...paper, journalTarget: "pami" }, 42)).toBeNull();
    expect(getPaperConferenceTripId({ ...paper, submittedMonth: null }, 42)).toBeNull();
  });

  it("refreshes a new acceptance and preserves advisor and activity rolls across favor tiers", () => {
    const { state, paper, root } = fixture();
    const selected = decision(root);
    const withoutAcceptance = refreshConferenceDecision({ ...state, fellowPapers: [{ ...paper, status: "reviewing" }] }, selected);
    expect(confirmation(withoutAcceptance).choices[0]!.effects.money).toBe(-1);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("preview rerolled"); });
    const refreshed = refreshConferenceDecision(state, withoutAcceptance);
    expect(confirmation(refreshed).choices[0]!.effects.money).toBe(-0);
    const lowerFavor = refreshConferenceDecision({ ...state, player: { ...state.player, favor: 0 } }, refreshed);
    const restored = refreshConferenceDecision(state, lowerFavor);
    expect(confirmation(restored, "advisor")).toEqual(confirmation(selected, "advisor"));
    for (const mode of ["self", "advisor"]) {
      expect(confirmation(lowerFavor, mode).choices[0]!.effects.enqueueEvents)
        .toEqual(confirmation(selected, mode).choices[0]!.effects.enqueueEvents);
    }
    expect(random).not.toHaveBeenCalled();
  });
});
