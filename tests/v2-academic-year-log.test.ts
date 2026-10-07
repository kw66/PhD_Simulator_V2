import { afterEach, describe, expect, it, vi } from "vitest";

import { appendAcademicYearLog } from "../src/core/v2-academic-year-log";
import { getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { getAcademicCalendarMonth } from "../src/core/v2-calendar";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../src/core/v2-progression";
import type { GameState } from "../src/core/v2-types";
import { renderApp } from "../src/app/v2-render";

function playingState(totalMonths: number): GameState {
  const initial = createInitialState();
  const degree = totalMonths > getMonthLimitByDegree("master") ? "phd" : "master";
  return {
    ...initial,
    phase: "playing",
    ...getCalendarForTotalMonths(totalMonths),
    totalMonths,
    degree,
    maxMonths: getMonthLimitByDegree(degree),
    selectedAdvisorName: "测试导师",
    player: { san: 20, research: 5, social: 5, favor: 5, money: 100 },
    availableRandomEvents: [],
    log: [],
  };
}

function academicLogs(state: GameState) {
  return state.log.filter((entry) => entry.id.startsWith("academic-year-"));
}

afterEach(() => vi.restoreAllMocks());

describe("academic year logs", () => {
  it("renders the annual commentary as a neutral, nonexpandable narrative log", () => {
    const state = appendAcademicYearLog(playingState(1));
    const html = renderApp(state);
    const entry = html.match(/<div class="log-entry[^\"]*">\s*<div class="event"><span class="log-entry-title">第 1 学年[\s\S]*?<\/div>\s*<\/div>/)?.[0];
    expect(entry).toBeDefined();
    expect(entry).toContain("is-system");
    expect(entry).not.toMatch(/is-negative|data-ui-open-event|log-result-divider/);
    expect(entry).toContain("GPT-3.5");
  });

  it("only changes the log without consuming gameplay randomness", () => {
    const state = playingState(1);
    const original = structuredClone(state);
    const random = vi.spyOn(Math, "random");
    const next = appendAcademicYearLog(state);

    expect(next.log).toHaveLength(1);
    expect(next.log[0]?.eventHistoryId).toBeUndefined();
    expect({ ...next, log: state.log }).toEqual(state);
    expect(state).toEqual(original);
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps six distinct messages aligned with September and current AI versions", () => {
    const messages = [1, 13, 25, 37, 49, 61].map((totalMonths) => {
      const state = playingState(totalMonths);
      const next = appendAcademicYearLog(state);
      expect(getAcademicCalendarMonth(state.month)).toBe(9);
      expect(next.log[0]?.month).toBe(totalMonths);
      expect(next.log[0]?.text).toContain(getAiModelForTotalMonths(totalMonths, "gpt").name);
      return next.log[0]?.text;
    });

    expect(new Set(messages).size).toBe(6);
    expect(messages[0]).toContain("小同行");
    expect(messages[5]).toContain("AI 科研");
    expect(messages[5]).toContain("AI 审稿");
  });

  it("does not repeat within a year, including after saving and reloading", () => {
    const first = appendAcademicYearLog(playingState(1));
    const reloaded: GameState = JSON.parse(JSON.stringify(first));
    expect(appendAcademicYearLog(first)).toBe(first);
    expect(appendAcademicYearLog(reloaded)).toBe(reloaded);

    const second = appendAcademicYearLog({ ...reloaded, year: 2, totalMonths: 13 });
    expect(academicLogs(second)).toHaveLength(2);
    expect(appendAcademicYearLog(second)).toBe(second);
  });

  it.each([0, 2, 9, 12, 14, 24, 62, 68])("skips non-September month %i", (totalMonths) => {
    const state = playingState(totalMonths);
    expect(appendAcademicYearLog(state)).toBe(state);
  });

  it.each(["setup", "finished"] as const)("skips the %s phase", (phase) => {
    const state = { ...playingState(1), phase };
    expect(appendAcademicYearLog(state)).toBe(state);
  });

  it("skips pre-enrollment even if the displayed month is one", () => {
    const state = { ...playingState(0), month: 1 };
    expect(appendAcademicYearLog(state)).toBe(state);
  });

  it("waits for formal enrollment after resolving the pre-enrollment events", () => {
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    expect(academicLogs(state)).toHaveLength(0);
    expect(academicLogs(dispatchAction(state, "next-month"))).toHaveLength(0);
    for (let step = 0; state.eventQueue.length > 0 && step < 10; step += 1) {
      const event = state.eventQueue[0]!;
      const choice = event.choices.find((entry) => entry.id === "before-grad-school-confirm") ?? event.choices[0]!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
      expect(academicLogs(state)).toHaveLength(0);
    }
    expect(state.eventQueue).toHaveLength(0);
    expect(state.totalMonths).toBe(0);

    const enrolled = dispatchAction(state, "next-month");
    expect(enrolled.totalMonths).toBe(1);
    expect(academicLogs(enrolled)).toHaveLength(1);
    expect(academicLogs(enrolled)[0]?.month).toBe(1);
    const advanced = dispatchAction({ ...enrolled, eventQueue: [] }, "next-month");
    expect(advanced.totalMonths).toBe(2);
    expect(academicLogs(advanced)).toEqual(academicLogs(enrolled));
  });

  it.each([2, 3, 4, 5, 6])("logs the transition into year %i once", (year) => {
    const before = playingState((year - 1) * 12);
    const next = dispatchAction(before, "next-month");
    expect(next.year).toBe(year);
    expect(next.month).toBe(1);
    expect(academicLogs(next)).toHaveLength(1);
    expect(academicLogs(next)[0]?.month).toBe((year - 1) * 12 + 1);
    expect(academicLogs(dispatchAction(next, "rest"))).toEqual(academicLogs(next));
  });

  it("also logs formal enrollment when force advancing", () => {
    const started = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const enrolled = dispatchAction(started, "force-next-month");
    expect(enrolled.totalMonths).toBe(1);
    expect(academicLogs(enrolled)).toHaveLength(1);
  });
});
