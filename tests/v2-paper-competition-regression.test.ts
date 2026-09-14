import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createPaperCompetitionRandomEvent } from "../src/core/v2-random-events-paper-competition";
import { renderApp } from "../src/app/v2-render";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import type { GameState } from "../src/core/v2-types";

function startCompetition(eventId: 17 | 18 = 17): GameState {
  vi.spyOn(Math, "random").mockReturnValue(0);
  let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  state = { ...state, eventQueue: [], player: { ...state.player, san: 20 }, totalMonths: 6, month: 6 };
  state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
  state = { ...state, papers: state.papers.map((paper) => ({ ...paper, idea: 40, experiment: 40, writing: 20 })) };
  const event = createPaperCompetitionRandomEvent(eventId, state, () => 0)!;
  return { ...state, eventQueue: [createEventQueueItem({ ...event, randomReplay: { eventId, serial: 1, rolls: [0] } }, 1)] };
}

function advanceEvent(state: GameState, index = 0): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[index]!.id });
}

afterEach(() => vi.restoreAllMocks());

describe("paper competition regression", () => {
  it.each([0, 1, 2])("does not reuse a discarded target ID while act %s remains queued", (stage) => {
    let state = startCompetition();
    for (let index = 0; index < stage; index += 1) state = advanceEvent(state, index === 0 ? 0 : 3);
    const originalId = state.papers[0]!.id;
    state = dispatchAction(state, "discard-paper", { paperId: originalId });
    state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
    expect(state.papers[0]!.id).not.toBe(originalId);
    state = dispatchAction(state, "research-paper", { paperId: state.papers[0]!.id, paperActionType: "idea" });
    const before = state;
    while (state.eventQueue.length) state = advanceEvent(state, state.eventQueue[0]!.stage === "act2" ? 3 : 0);
    expect(state.papers).toEqual(before.papers);
    expect(state.player.san).toBe(before.player.san);
  });

  it.each([17, 18] as const)("refreshes event %s preview before choosing and before confirming", (eventId) => {
    const field = eventId === 17 ? "idea" : "experiment";
    let state = advanceEvent(startCompetition(eventId));
    const paperId = state.papers[0]!.id;
    state = dispatchAction(state, "research-paper", { paperId, paperActionType: field });
    expect(state.papers[0]![field]).toBe(41);
    expect(state.eventQueue[0]!.choices[1]!.outcome).toContain("41→21");
    state = advanceEvent(state, 1);
    state = { ...state, actionState: { ...state.actionState, used: 0 } };
    state = dispatchAction(state, "research-paper", { paperId, paperActionType: field });
    expect(state.papers[0]![field]).toBe(42);
    expect(state.eventQueue[0]!.description).toContain("42→21");
    expect(state.eventQueue[0]!.choices[0]!.outcome).toContain("42→21");
    state = advanceEvent(state);
    expect(state.papers[0]![field]).toBe(21);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toContain("42→21");
    expect(state.log[0]!.text).toContain("42→21");
  });

  it("shows a skipped result before confirmation when the target was discarded", () => {
    let state = advanceEvent(advanceEvent(startCompetition()), 3);
    state = dispatchAction(state, "discard-paper", { paperId: state.papers[0]!.id });
    expect(state.eventQueue[0]!.description).not.toContain("40→50");
    expect(state.eventQueue[0]!.choices[0]!.outcome).not.toContain("SAN-6");
    const beforeSan = state.player.san;
    state = advanceEvent(state);
    expect(state.player.san).toBe(beforeSan);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).not.toContain("几轮推翻重来");
  });

  it("updates review notes and preserves the new submission snapshot while an event is open", () => {
    let state = advanceEvent(advanceEvent(startCompetition()), 1);
    const paperId = state.papers[0]!.id;
    state = dispatchAction(state, "submit-paper", { paperId, paperTarget: "A" });
    expect(state.eventQueue[0]!.description).toContain("小提示：本轮审稿仍按投稿分数");
    state = advanceEvent(state);
    expect(state.papers[0]).toMatchObject({ idea: 20, submittedIdea: 40, submittedExperiment: 40, submittedWriting: 20 });
    expect(state.eventHistory[0]!.stages.at(-1)!.choices[0]!.outcome).toBe("SAN-1｜idea×0.5（40→20）");
  });

  it("recognizes a target moved to published results before the competition is confirmed", () => {
    let state = startCompetition();
    const paperId = state.papers[0]!.id;
    state = dispatchAction(state, "submit-paper", { paperId, paperTarget: "C" });
    state = advanceEvent(advanceEvent(state), 3);
    state = resolveDuePaperReviews({ ...state, papers: state.papers.map((paper) => ({ ...paper, reviewMonthsLeft: 0 })) }, () => 0).state;
    for (let stage = 0; stage < 3; stage += 1) {
      const event = state.eventQueue.find((item) => item.chainId === `paper-review-result-${paperId}`)!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    expect(state.papers).toHaveLength(0);
    expect(state.externalPublications.some((paper) => paper.id === paperId)).toBe(true);
    expect(state.eventQueue[0]!.description).toContain("目标论文已录用，本次不受影响");
    expect(state.eventQueue[0]!.description).not.toContain("已丢弃");
    expect(state.eventQueue[0]!.description).not.toContain("小提示：本轮审稿");
    const beforeSan = state.player.san;
    const publications = state.externalPublications;
    state = advanceEvent(state);
    expect(state.player.san).toBe(beforeSan);
    expect(state.externalPublications).toEqual(publications);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toContain("已录用");
    expect(state.log[0]!.text).toContain("已录用");
  });

  it("restores the valid preview if a journal target is withdrawn before confirmation", () => {
    let state = startCompetition();
    state = { ...state, papers: state.papers.map((paper) => ({ ...paper, idea: 100, experiment: 100, writing: 100 })) };
    state = advanceEvent(advanceEvent(state), 3);
    const paperId = state.papers[0]!.id;
    state = dispatchAction(state, "submit-journal-paper", { paperId, journalTarget: "nature" });
    expect(state.eventQueue[0]!.description).toContain("目标论文已进入期刊修改");
    expect(state.eventQueue[0]!.description).not.toContain("SAN-6");
    state = dispatchAction(state, "withdraw-paper", { paperId });
    expect(state.eventQueue[0]!.description).toContain("SAN-6｜idea×1.25（100→125）");
    expect(state.eventQueue[0]!.description).toContain("新方案比原先更进一步");
    expect(state.eventQueue[0]!.description).not.toContain("已不再受这次竞争影响");
    expect(state.eventQueue[0]!.description.match(/涉及论文：/g)).toHaveLength(1);
    expect(state.eventQueue[0]!.description.match(/机制结算/g)).toHaveLength(1);
    expect(dispatchAction(state, "select-paper", { paperId })).toBe(state);
  });

  it.each([17, 18] as const)("renders event %s with distinct narrative, target, review tip and compact effects", (eventId) => {
    let state = startCompetition(eventId);
    state = dispatchAction(state, "submit-paper", { paperId: state.papers[0]!.id, paperTarget: "A" });
    state = advanceEvent(advanceEvent(state), 1);
    const event = state.eventQueue[0]!;
    const effect = eventId === 17 ? "idea×0.5（40→20）" : "实验×0.5（40→20）";
    const description = event.description;
    expect(description.split("\n\n机制结算\n")[1]).toBe(`SAN-1｜${effect}`);
    expect(description).toContain(`涉及论文：**《${state.papers[0]!.title}》**`);
    expect(description).not.toContain("至于审稿人会不会注意到");
    const html = renderApp(state, undefined, { activePlayTab: "events", activeEventId: event.id, isEventContentOpen: true });
    const results = html.match(/<div class="event-settlement-summary">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(results).toContain('class="event-settlement-item">SAN-1</span>');
    expect(results).toContain(effect);
    expect(results).not.toContain(state.papers[0]!.title);
    expect(results).not.toContain("本轮审稿");
    expect(html).toContain('class="event-description-note"');
    const completed = advanceEvent(state);
    expect(completed.log[0]!.text).toContain(state.papers[0]!.title);
    expect(completed.log[0]!.text).toContain(eventId === 17 ? "狡辩二者不同" : "选择性对比");
    expect(completed.eventHistory[0]!.stages.at(-1)!.description).toBe(description);
  });
});
