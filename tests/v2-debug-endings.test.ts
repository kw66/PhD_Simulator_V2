import { describe, expect, it } from "vitest";
import { DEBUG_ENDINGS, createDebugEnding } from "../src/core/v2-debug-endings";
import { dispatchAction } from "../src/core/v2-engine";
import { createInitialState, createStartedGameState } from "../src/core/v2-engine-state-factory";
import { evaluateCoreEndings, finishTrainingIfReady, quitGame } from "../src/core/v2-ending-system";
import { SCORE_BY_TARGET } from "../src/core/v2-content";
import { JOURNAL_DEFINITIONS } from "../src/core/v2-journal-system";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { createStore } from "../src/core/v2-store";
import { renderDebugPanel } from "../src/app/v2-render-debug-panel";
import { renderEndingScreen } from "../src/app/v2-render-ending";
import { isDebugWindowActionData } from "../src/app/v2-debug-window";
import type { EndingId } from "../src/core/v2-types";

describe("debug ending fixtures", () => {
  const endings = Object.keys(DEBUG_ENDINGS) as NonNullable<EndingId>[];
  for (const roll of [0, 0.5, 0.999999, 1, -1, NaN]) {
    it.each(endings)(`generates a genuine %s ending at roll ${roll}`, (ending) => {
      const original = createStartedGameState("normal");
      original.player.san = -20;
      original.advisorProgressState.funding = -20;
      const snapshot = structuredClone(original);
      const result = createDebugEnding(original, ending, () => roll);
      expect(original).toEqual(snapshot);
      expect(result.ending).toBe(ending);
      expect(result.phase).toBe("finished");
      expect(result.eventQueue).toEqual([]);
      expect({ year: result.year, month: result.month }).toEqual(getCalendarForTotalMonths(result.totalMonths, result.degree));
      expect(result.totalResearchScore).toBe(result.externalPublications.reduce((sum, paper) => sum + (paper.nonFirstAuthor ? 0 : paper.journalTarget ? JOURNAL_DEFINITIONS[paper.journalTarget].researchScore : SCORE_BY_TARGET[paper.target!]), 0));
      expect(result.totalCitations).toBe(result.externalPublications.reduce((sum, paper) => sum + paper.publication!.citations, 0));
      expect(new Set(result.externalPublications.map((paper) => paper.id)).size).toBe(result.externalPublications.length);
      for (const paper of result.externalPublications) {
        expect(paper.acceptedTotalMonths).toBeLessThanOrEqual(result.totalMonths - 3);
        expect(paper.conferenceHandledAtTotalMonths).toBeLessThanOrEqual(result.totalMonths);
      }
      const playing = { ...result, phase: "playing" as const, ending: null };
      const evaluated = ending === "quit" ? quitGame(playing)
        : ["master", "phd", "delay"].includes(ending) ? finishTrainingIfReady(evaluateCoreEndings(playing)) : evaluateCoreEndings(playing);
      expect(evaluated.ending).toBe(ending);
      if (["master", "phd", "delay"].includes(ending)) expect(result.month).toBe(10);
      expect(renderEndingScreen(result)).toContain(`data-ending="${ending}"`);
    });
  }

  it("varies sample data and keeps session identity and preferences", () => {
    const state = { ...createStartedGameState("normal"), playerName: "小王", debugEventReplayEnabled: true, blockLinearEvents: false };
    const low = createDebugEnding(state, "master", () => 0);
    const high = createDebugEnding(state, "master", () => 0.99);
    expect(low.player).not.toEqual(high.player);
    expect(low.totalResearchScore).not.toBe(high.totalResearchScore);
    expect(high).toMatchObject({ playerName: "小王", debugEventReplayEnabled: true, blockLinearEvents: false });
  });

  it("populates the ending archive fixture with relationships, offers, counts and spending", () => {
    const state = createDebugEnding(createStartedGameState("normal"), "phd", () => 0.5);
    const html = renderEndingScreen(state);
    for (const marker of [
      'data-ending-section="relationships-advisor"', 'data-ending-section="relationships-lover"',
      'data-ending-section="relationships-fellows"', 'data-ending-section="offers"',
      'data-ending-section="internships"', 'data-ending-section="scholarships"',
      'data-ending-section="joint-training"', 'data-ending-section="reading"',
      'data-ending-section="spending"', 'data-ending-section="meetings"',
    ]) expect(html).toContain(marker);
    expect(html).toContain("调试导师");
    expect(html).toContain("调试恋人");
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("林舟 师兄");
    expect(text).toContain("陈月 师妹");
    expect(text).toContain("周宁 同门");
    expect(html).toContain("累计经费 265");
    expect(html).toContain("86.5 金币");
    expect(Object.keys(state.careerOffers)).toHaveLength(1);
    expect(html).toContain("offer");
    const order = ["relationships-advisor", "offers", "relationships-fellows", "relationships-lover"];
    expect(order.map((id) => html.indexOf(`data-ending-section="${id}"`))).toEqual([...order.map((id) => html.indexOf(`data-ending-section="${id}"`))].sort((a, b) => a - b));
    expect(html).toContain("✓");
  });

  it("routes all endings repeatedly through the engine and rejects invalid/setup requests", () => {
    const setup = createInitialState();
    expect(dispatchAction(setup, "debug-trigger-ending", { eventId: "master" })).toEqual(setup);
    let state = createStartedGameState("normal");
    for (const ending of endings) {
      state = dispatchAction(state, "debug-trigger-ending", { eventId: ending });
      expect(state.ending).toBe(ending);
    }
    expect(dispatchAction(state, "debug-trigger-ending", { eventId: "toString" })).toEqual(state);
  });

  it("excludes direct debug dispatches and finished rerolls from progression", () => {
    const store = createStore({ storage: null });
    store.dispatch("start-game", { roleId: "normal" });
    const originalProgress = structuredClone(store.getLobbyState().roleProgress);
    for (const ending of endings) {
      store.dispatch("debug-trigger-ending", { eventId: ending });
      expect(store.getState().ending).toBe(ending);
      expect(store.getLobbyState().roleProgress).toEqual(originalProgress);
      expect(store.getLobbyState().lastRunExperience).toMatchObject({ gained: 0, disqualifiedByDebug: true });
    }
  });

  it("enables all ending buttons after finishing while other tools remain disabled", () => {
    const state = createDebugEnding(createStartedGameState("normal"), "phd");
    const html = renderDebugPanel(state, true);
    expect(html).toContain('class="debug-popup-tools" disabled');
    expect(html).not.toContain('class="debug-popup-tools debug-popup-endings" disabled');
    for (const ending of endings) expect(html).toContain(`data-action="debug-trigger-ending" data-event-id="${ending}"`);
    expect(renderDebugPanel(state, false)).toContain('class="debug-popup-tools debug-popup-endings" disabled');
    expect(isDebugWindowActionData({ action: "debug-trigger-ending", eventId: "phd" })).toBe(true);
  });
});
