import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { createAdvisorProgressState } from "../src/core/v2-advisor-progress";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { ensureFellowPapers } from "../src/core/v2-fellow-research";
import * as labProjects from "../src/core/v2-lab-projects";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { createAdvisorProjectRandomEvent } from "../src/core/v2-random-events-lab-advisor-project";
import type { Buff, EventChoice, GameState, Paper, PendingEvent } from "../src/core/v2-types";

type ProjectType = "horizontal" | "vertical";
type ProjectBranch = ProjectType | "reject" | "share";

function makePaper(id: string, overrides: Partial<Paper> = {}): Paper {
  return {
    ...createDraftPaper(17, 0, () => 0),
    id,
    idea: 10,
    experiment: 10,
    writing: 10,
    prepublicationDecayRate: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const initial = createStartedGameState("normal");
  const fellows = (["senior", "peer", "junior"] as const).map((type) => ({
    ...createCustomFellowProgressProfile({
      type, gender: "female", research: 10, affinity: 2, startTotalMonths: 1, name: type,
    }),
    id: `fellow-${type}`,
  }));
  const state = ensureFellowPapers({
    ...initial,
    year: 2,
    month: 5,
    totalMonths: 17,
    totalRandomEventCount: 1,
    playerName: "Player",
    selectedAdvisorName: "Advisor",
    sanCap: 100,
    player: { ...initial.player, san: 100, research: 0, favor: 3, social: 3, money: 7 },
    advisorProgressState: {
      ...createAdvisorProgressState(), funding: 13, researchAccumulation: 29,
      horizontalProgress: 37, verticalProgress: 64,
    },
    papers: [makePaper("player-paper")],
    fellowProgressState: fellows,
    fellowPapers: fellows.map((profile) => makePaper(`paper-${profile.id}`, {
      leadAuthorId: profile.id, leadAuthorName: profile.name,
    })),
    eventQueue: [],
    eventHistory: [],
    buffs: [],
  }, () => 0);
  return { ...state, ...overrides };
}

function makeEvent(state: GameState, random: () => number = () => 0): PendingEvent {
  const rolls: number[] = [];
  const event = createAdvisorProjectRandomEvent(state, () => {
    const roll = random();
    rolls.push(roll);
    return roll;
  });
  return { ...event, randomReplay: { eventId: 4, serial: state.totalRandomEventCount, rolls } };
}

function decisionChoice(event: PendingEvent, branch: ProjectBranch): EventChoice {
  const decision = event.stage === "act1" ? event.choices[0]?.effects.enqueueEvents?.[0] : event;
  expect(decision?.stage).toBe("act2");
  const choice = decision?.choices.find((entry) => entry.id.startsWith(`random-4-${branch}-`));
  if (!choice) throw new Error(`Missing advisor project branch: ${branch}`);
  return choice;
}

function currentEvent(state: GameState) {
  const event = state.eventQueue.find((entry) => entry.chainId === "random-4");
  if (!event) throw new Error("Missing queued advisor project event");
  return event;
}

function resolve(state: GameState, choiceId?: string): GameState {
  const event = currentEvent(state);
  return dispatchAction(state, "resolve-event", {
    eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id,
  });
}

function queueEvent(state: GameState, event = makeEvent(state)): GameState {
  return { ...state, eventQueue: [createEventQueueItem(event, 1)] };
}

function settlementState(state: GameState) {
  return {
    player: state.player,
    advisor: state.advisorProgressState,
    papers: state.papers,
    fellowPapers: state.fellowPapers,
    fellows: state.fellowProgressState,
    actionState: state.actionState,
    lover: state.loverProgressState,
    publications: state.externalPublications,
    score: state.totalResearchScore,
  };
}

function collaborationTotal(paper: Paper): number {
  return Object.values(paper.collaborationScores ?? {}).reduce((sum, score) => sum + score, 0);
}

afterEach(() => vi.restoreAllMocks());

describe("advisor project random event effects", () => {
  it("expresses completion through shared project progress rather than direct rewards", () => {
    const state = makeState();
    const before = structuredClone(state);
    const event = makeEvent(state, () => 0.5);
    const horizontal = decisionChoice(event, "horizontal");
    const vertical = decisionChoice(event, "vertical");

    expect(horizontal.effects.labProjectProgress).toEqual({ type: "horizontal", amount: 100 });
    expect(vertical.effects.labProjectProgress).toEqual({
      type: "vertical", amount: 100, guidanceRolls: expect.any(Array),
    });
    const rolls = vertical.effects.labProjectProgress!.guidanceRolls!;
    expect(rolls.length).toBeGreaterThan(0);
    expect(rolls.every((roll) => typeof roll === "number" && roll >= 0 && roll < 1)).toBe(true);
    for (const choice of [horizontal, vertical]) {
      expect(choice.effects.money).toBeUndefined();
      expect(choice.effects.advisorProgressStateDeltas?.funding).toBeUndefined();
      expect(choice.effects.advisorProgressStateDeltas?.researchAccumulation).toBeUndefined();
    }
    expect(state).toEqual(before);
  });

  it.each(["horizontal", "vertical"] as const)("routes %s effects through the shared settlement helper", (type) => {
    const state = makeState();
    const sharedSettlement = vi.spyOn(labProjects, "advanceSharedLabProject");
    applyChoiceEffectsToState(state, decisionChoice(makeEvent(state), type));
    expect(sharedSettlement).toHaveBeenCalledOnce();
    expect(sharedSettlement.mock.calls[0]?.slice(1, 3)).toEqual([type, 100]);
  });

  it.each([0, 1, 37, 99])("completes horizontal work once and preserves its previous %i progress", (progress) => {
    const state = makeState();
    state.advisorProgressState.horizontalProgress = progress;
    const before = structuredClone(state);
    const after = applyChoiceEffectsToState(state, decisionChoice(makeEvent(state), "horizontal")).nextState;

    expect(after.advisorProgressState).toEqual({ ...state.advisorProgressState, funding: 33 });
    expect(after.player).toEqual({ ...state.player, money: 12, san: 92, favor: 4 });
    expect(after.papers).toEqual(state.papers);
    expect(after.fellowPapers).toEqual(state.fellowPapers);
    expect(after.fellowProgressState).toEqual(state.fellowProgressState);
    expect(state).toEqual(before);
  });

  it.each([0, 9, 20, 29, 109])("uses floor of ten percent of current accumulation %i for vertical work", (accumulation) => {
    const state = makeState();
    state.advisorProgressState.researchAccumulation = accumulation;
    const before = structuredClone(state);
    const after = applyChoiceEffectsToState(state, decisionChoice(makeEvent(state), "vertical")).nextState;

    expect(after.advisorProgressState).toMatchObject({
      horizontalProgress: 37, verticalProgress: 64, funding: 13,
      researchAccumulation: accumulation + Math.floor(accumulation * 0.1),
      pendingGuidanceToPlayer: null,
    });
    expect(after.player).toEqual({ ...state.player, san: 94, favor: 4, research: 1 });
    for (const paper of [...after.papers, ...after.fellowPapers!]) {
      expect(paper).toMatchObject({
        idea: 20, experiment: 10, writing: 10,
        collaborationScores: { idea: 10, experiment: 0, writing: 0 },
        collaborators: [{ id: "advisor", name: "Advisor" }],
      });
    }
    expect(after.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([null, null, null]);
    expect(state).toEqual(before);
  });

  it.each(["horizontal", "vertical"] as const)("preserves overflow through multiple %s completions in one effect", (type) => {
    const state = makeState();
    state.advisorProgressState.verticalProgress = 37;
    const choice = decisionChoice(makeEvent(state), type);
    const after = applyChoiceEffectsToState(state, {
      ...choice,
      effects: { labProjectProgress: {
        type, amount: 250, ...(type === "vertical" ? { guidanceRolls: Array<number>(16).fill(0) } : {}),
      } },
    }).nextState;

    expect(after.advisorProgressState[type === "horizontal" ? "horizontalProgress" : "verticalProgress"]).toBe(87);
    expect(after.advisorProgressState.funding).toBe(type === "horizontal" ? 53 : 13);
    expect(after.player.money).toBe(type === "horizontal" ? 17 : 7);
    expect(after.advisorProgressState.researchAccumulation).toBe(type === "vertical" ? 34 : 29);
    for (const paper of [...after.papers, ...after.fellowPapers!]) {
      expect(collaborationTotal(paper)).toBe(type === "vertical" ? 20 : 0);
    }
  });

  it("stores guidance without papers and consumes each opportunity only once when papers become available", () => {
    const state = makeState({ papers: [], fellowPapers: [] });
    const after = applyChoiceEffectsToState(state, decisionChoice(makeEvent(state), "vertical")).nextState;
    expect(after.papers).toEqual([]);
    expect(after.fellowPapers).toEqual([]);
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(after.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([10, 10, 10]);

    const repeated = applyChoiceEffectsToState(after, decisionChoice(makeEvent(after), "vertical")).nextState;
    expect(repeated.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(repeated.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([10, 10, 10]);
    const ready = settleAdvisorGuidance({
      ...repeated,
      papers: [makePaper("new-player-paper")],
      fellowPapers: repeated.fellowProgressState.map((profile) => makePaper(`new-${profile.id}`, { leadAuthorId: profile.id })),
    }, () => 0);
    expect([...ready.papers, ...ready.fellowPapers!].map(collaborationTotal)).toEqual([10, 10, 10, 10]);
    expect(ready.advisorProgressState.pendingGuidanceToPlayer).toBeNull();
    expect(ready.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([null, null, null]);
    expect(settleAdvisorGuidance(ready, () => 0.99)).toBe(ready);
  });

  it("keeps conference review papers and submission snapshots frozen while storing guidance", () => {
    const state = makeState();
    state.papers = state.papers.map((paper) => prepareConferenceSubmission(paper, "A", 5, 2));
    state.fellowPapers = state.fellowPapers!.map((paper) => prepareConferenceSubmission(paper, "A", 5, 2));
    const after = applyChoiceEffectsToState(state, decisionChoice(makeEvent(state), "vertical")).nextState;
    expect(after.papers).toEqual(state.papers);
    expect(after.fellowPapers).toEqual(state.fellowPapers);
    expect(after.advisorProgressState.pendingGuidanceToPlayer).toBe(10);
    expect(after.fellowProgressState.map((profile) => profile.pendingGuidanceFromAdvisor)).toEqual([10, 10, 10]);
  });

  it.each([0, 0.999])("uses saved guidance rolls rather than ambient randomness: %s", (roll) => {
    const state = makeState();
    const choice = decisionChoice(makeEvent(state, () => roll), "vertical");
    vi.spyOn(Math, "random").mockReturnValue(roll === 0 ? 0.999 : 0);
    const after = applyChoiceEffectsToState(state, choice).nextState;
    for (const paper of [...after.papers, ...after.fellowPapers!]) {
      expect(paper.collaborationScores).toEqual(roll === 0
        ? { idea: 10, experiment: 0, writing: 0 }
        : { idea: 0, experiment: 0, writing: 10 });
    }
  });
});

describe("advisor project SAN and attribute rules", () => {
  it.each([
    { month: 5, research: 0, multiplier: 1, addition: 0, parasol: false, expired: false, horizontal: -8, vertical: -6 },
    { month: 8, research: 12, multiplier: 1, addition: 0, parasol: false, expired: false, horizontal: -5, vertical: -3 },
    { month: 11, research: 18, multiplier: 1, addition: 0, parasol: false, expired: false, horizontal: -6, vertical: -4 },
    { month: 11, research: 18, multiplier: 1, addition: 0, parasol: true, expired: false, horizontal: -5, vertical: -3 },
    { month: 8, research: 12, multiplier: 1.5, addition: -1, parasol: false, expired: false, horizontal: -8, vertical: -5 },
    { month: 5, research: 0, multiplier: 1.5, addition: 0, parasol: false, expired: false, horizontal: -12, vertical: -9 },
    { month: 5, research: 0, multiplier: 2, addition: -1, parasol: false, expired: true, horizontal: -8, vertical: -6 },
  ])("uses event research/season/illness modifiers in month $month: $horizontal / $vertical", (entry) => {
    const state = makeState();
    state.month = entry.month;
    state.player.research = entry.research;
    state.eventSupport.hasParasol = entry.parasol;
    const illness: Buff = {
      id: "illness-work-penalty-test", name: "Illness", source: "Test", timing: "monthly",
      remainingMonths: entry.expired ? 0 : 1,
      activeOperationSanMultiplier: entry.multiplier,
      activeOperationSanDelta: entry.addition,
    };
    state.buffs = [illness];
    for (const type of ["horizontal", "vertical"] as const) {
      const choice = decisionChoice(makeEvent(state), type);
      expect(choice.effects.san).toBe(entry[type]);
      const after = applyChoiceEffectsToState(state, choice).nextState;
      expect(after.player.san).toBe(100 + entry[type]);
      expect(after.actionState).toEqual(state.actionState);
    }
  });

  it.each([-100, 100])("ignores relationship-only SAN adjustments of %i", (relationshipDelta) => {
    const state = makeState();
    state.buffs = [{
      id: "relationship-cost", name: "Relationship", source: "Test", timing: "monthly", remainingMonths: 1,
      relationshipOperationSanDelta: relationshipDelta,
    }];
    for (const [type, san] of [["horizontal", 92], ["vertical", 94]] as const) {
      const after = applyChoiceEffectsToState(state, decisionChoice(makeEvent(state), type)).nextState;
      expect(after.player.san).toBe(san);
    }
  });

  it.each([
    { value: 3, roll: 0, gain: 1 },
    { value: 12, roll: 0, gain: 0 },
    { value: 12, roll: 0.999, gain: 1 },
    { value: 20, roll: 0.999, gain: 0 },
  ])("retains tier resistance and caps at attribute $value with roll $roll", ({ value, roll, gain }) => {
    const state = makeState();
    state.player.favor = value;
    state.player.research = value;
    const event = makeEvent(state, () => roll);
    const horizontal = decisionChoice(event, "horizontal");
    const vertical = decisionChoice(event, "vertical");
    expect(horizontal.effects.favor ?? 0).toBe(gain);
    expect(horizontal.effects.research).toBeUndefined();
    expect(vertical.effects.favor ?? 0).toBe(gain);
    expect(vertical.effects.research ?? 0).toBe(gain);
    const after = applyChoiceEffectsToState(state, vertical).nextState;
    expect(after.player.favor).toBe(value + gain);
    expect(after.player.research).toBe(value + gain);
    expect(after.advisorProgressState.researchAccumulation).toBe(31);
  });

  it.each([false, true])("keeps rejection and sharing penalties without project progress, familiar junior=%s", (hasJunior) => {
    const state = makeState();
    if (!hasJunior) state.fellowProgressState = state.fellowProgressState.filter((profile) => profile.type !== "junior");
    const event = makeEvent(state);
    const rejection = decisionChoice(event, "reject");
    expect(rejection.label).toBe("拒绝承担");
    for (const branch of ["reject", "share"] as const) {
      const choice = decisionChoice(event, branch);
      expect(choice.effects.labProjectProgress).toBeUndefined();
      const after = applyChoiceEffectsToState(state, choice).nextState;
      expect(after.advisorProgressState).toEqual(state.advisorProgressState);
      expect(after.papers).toEqual(state.papers);
      expect(after.fellowPapers).toEqual(state.fellowPapers);
      expect(after.fellowProgressState).toEqual(state.fellowProgressState);
      expect(after.player).toEqual({
        ...state.player,
        ...(branch === "reject" ? { favor: 1 } : { san: 98, social: hasJunior ? 2 : 1 }),
      });
      expect(after.actionState).toEqual(state.actionState);
    }
  });
});

describe("advisor project three-stage settlement", () => {
  it.each([
    { type: "horizontal" as const, effects: [/横向进度\s*\+\s*100/u, /科研经费\s*\+\s*20/u, /金币\s*\+\s*5/u] },
    { type: "vertical" as const, effects: [/纵向进度\s*\+\s*100/u, /导师科研积累\s*\+\s*2/u, /论文随机一项协作分\s*\+\s*10/u] },
  ])("renders $type progress and rewards as settlement effect chips without applying them", ({ type, effects }) => {
    const state = makeState();
    const afterIntro = resolve(queueEvent(state));
    const afterDecision = resolve(afterIntro, decisionChoice(currentEvent(afterIntro), type).id);
    const snapshot = structuredClone(afterDecision);
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const renderSummary = (): string => {
      const html = renderApp(afterDecision, undefined, {
        isEventContentOpen: true, activeEventId: currentEvent(afterDecision).id,
      });
      const summary = html.match(/<div class="event-settlement-summary">([\s\S]*?)<\/div>/u)?.[1];
      expect(summary).toBeDefined();
      return summary!;
    };
    const summary = renderSummary();
    const chips = [...summary.matchAll(/<span class="event-settlement-effect(?: [^"]*)?">([^<]*)<\/span>/gu)]
      .map((match) => match[1]!);
    for (const effect of effects) {
      expect(chips.some((chip) => effect.test(chip)), `Missing settlement effect chip: ${effect}`).toBe(true);
    }
    random.mockReturnValue(0.999);
    expect(renderSummary()).toBe(summary);
    expect(afterDecision).toEqual(snapshot);
    expect(settlementState(afterDecision)).toEqual(settlementState(state));
  });

  it.each(["horizontal", "vertical"] as const)("previews %s without rewards and settles only on the final confirmation", (type) => {
    const state = makeState();
    const event = makeEvent(state);
    const expected = applyChoiceEffectsToState(state, decisionChoice(event, type)).nextState;
    const queued = queueEvent(state, event);
    const afterIntro = resolve(queued);
    expect(currentEvent(afterIntro).stage).toBe("act2");
    expect(settlementState(afterIntro)).toEqual(settlementState(state));
    const selected = decisionChoice(currentEvent(afterIntro), type);
    const afterDecision = resolve(afterIntro, selected.id);
    const result = currentEvent(afterDecision);
    expect(result.stage).toBe("result");
    expect(result.deferredStatePatch).toBeDefined();
    expect(settlementState(afterDecision)).toEqual(settlementState(state));
    expect(afterDecision.eventHistory).toEqual(state.eventHistory);

    const snapshot = structuredClone(afterDecision);
    const firstPreview = getResolvableQueuedEvent(afterDecision, result);
    const refreshed = refreshPendingEventDecisions(refreshPendingEventDecisions(afterDecision));
    expect(currentEvent(refreshed).deferredStatePatch).toEqual(firstPreview.deferredStatePatch);
    expect(settlementState(refreshed)).toEqual(settlementState(state));
    expect(afterDecision).toEqual(snapshot);

    const completed = resolve(refreshed);
    expect(settlementState(completed)).toEqual(settlementState(expected));
    expect(completed.eventQueue.some((entry) => entry.chainId === "random-4")).toBe(false);
    expect(completed.eventHistory).toHaveLength(1);
    const repeated = dispatchAction(completed, "resolve-event", {
      eventId: result.id, eventChoiceId: result.choices[0]!.id,
    });
    expect(settlementState(repeated)).toEqual(settlementState(completed));
    expect(repeated.eventHistory).toEqual(completed.eventHistory);
  });

  it("keeps repeated vertical previews and final guidance stable when ambient randomness changes", () => {
    const state = makeState();
    let rollIndex = 0;
    const event = makeEvent(state, () => [0.1, 0.5, 0.9][rollIndex++ % 3]!);
    const choice = decisionChoice(event, "vertical");
    const expected = applyChoiceEffectsToState(state, choice).nextState;
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const afterIntro = resolve(queueEvent(state, event));
    const afterDecision = resolve(afterIntro, choice.id);
    const firstPreview = getResolvableQueuedEvent(afterDecision, currentEvent(afterDecision));
    random.mockReturnValue(0.999);
    const secondPreview = getResolvableQueuedEvent(afterDecision, currentEvent(afterDecision));
    expect(secondPreview.deferredStatePatch).toEqual(firstPreview.deferredStatePatch);
    expect(settlementState(afterDecision)).toEqual(settlementState(state));
    const completed = resolve(refreshPendingEventDecisions(afterDecision));
    expect(completed.papers).toEqual(expected.papers);
    expect(completed.fellowPapers).toEqual(expected.fellowPapers);
    expect(completed.advisorProgressState).toEqual(expected.advisorProgressState);
    expect([...completed.papers, ...completed.fellowPapers!].map(collaborationTotal)).toEqual([10, 10, 10, 10]);
  });

  it.each([
    { type: "horizontal" as const, used: false },
    { type: "horizontal" as const, used: true },
    { type: "vertical" as const, used: false },
    { type: "vertical" as const, used: true },
  ])("neither blocks nor consumes monthly buttons for $type with used=$used", ({ type, used }) => {
    const state = makeState();
    const marker = used ? state.totalMonths : state.totalMonths - 1;
    Object.assign(state.advisorProgressState, {
      lastPlayerProjectTotalMonths: marker, lastAdvisorProjectTotalMonths: marker,
      lastProjectTotalMonths: marker, lastHorizontalTotalMonths: marker,
    });
    state.actionState.used = used ? state.actionState.limit : 0;
    state.fellowProgressState = state.fellowProgressState.map((profile) => ({ ...profile, taskUsedThisMonth: used }));
    state.loverProgressState.taskUsedThisMonth = used;
    const afterIntro = resolve(queueEvent(state));
    const choice = decisionChoice(currentEvent(afterIntro), type);
    expect(choice.disabledReason).toBeUndefined();
    const completed = resolve(resolve(afterIntro, choice.id));
    expect(completed.advisorProgressState).toMatchObject({
      lastPlayerProjectTotalMonths: marker, lastAdvisorProjectTotalMonths: marker,
      lastProjectTotalMonths: marker, lastHorizontalTotalMonths: marker,
      funding: type === "horizontal" ? 33 : 13,
      researchAccumulation: type === "vertical" ? 31 : 29,
    });
    expect(completed.player.san).toBe(type === "horizontal" ? 92 : 94);
    expect(completed.actionState).toEqual(state.actionState);
    expect(completed.fellowProgressState.map((profile) => profile.taskUsedThisMonth)).toEqual([used, used, used]);
    expect(completed.loverProgressState).toEqual(state.loverProgressState);
  });

  it("allows vertical guidance to accept a journal only after final confirmation and awards it once", () => {
    const state = makeState({
      papers: [makePaper("journal-paper", {
        status: "journal-reviewing", journalTarget: "pami", idea: 40, experiment: 40, writing: 40,
        submittedIdea: 40, submittedExperiment: 40, submittedWriting: 40,
      })],
    });
    const afterIntro = resolve(queueEvent(state));
    const afterDecision = resolve(afterIntro, decisionChoice(currentEvent(afterIntro), "vertical").id);
    const result = currentEvent(afterDecision);
    const refreshed = refreshPendingEventDecisions(afterDecision);
    expect(refreshed.papers).toEqual(state.papers);
    expect(refreshed.externalPublications).toEqual([]);
    expect(refreshed.totalResearchScore).toBe(0);

    const completed = resolve(refreshed);
    expect(completed.papers).toEqual([]);
    expect(completed.externalPublications).toHaveLength(1);
    expect(completed.externalPublications[0]).toMatchObject({
      id: "journal-paper", status: "published", journalTarget: "pami",
      publication: { effectiveScore: 130 }, collaborators: [{ id: "advisor", name: "Advisor" }],
    });
    expect(collaborationTotal(completed.externalPublications[0]!)).toBe(10);
    expect(completed.totalResearchScore).toBe(5);
    expect(completed.advisorProgressState).toMatchObject({
      researchAccumulation: 36, funding: 13, verticalProgress: 64, countedPaperIds: ["journal-paper"],
    });
    const repeated = dispatchAction(completed, "resolve-event", {
      eventId: result.id, eventChoiceId: result.choices[0]!.id,
    });
    expect(settlementState(repeated)).toEqual(settlementState(completed));
  });
});
