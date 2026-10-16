import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createStore } from "../src/core/v2-store";
import { dispatchAction } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { saveAccountProfile } from "../src/core/v2-account-storage";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { getRoleOptions } from "../src/core/v2-progression";
import { getDesignedTalentNodes, isRoleTalentImplemented } from "../src/core/v2-role-talent-definitions";
import { getAvailablePaperSlotCount } from "../src/core/v2-paper-rules";
import { getThesisAdvanceSanCost } from "../src/core/v2-thesis-rules";
import type { GameState, RoleId } from "../src/core/v2-types";

afterEach(() => vi.restoreAllMocks());
const roles = getRoleOptions().filter(role => isRoleTalentImplemented(role.id)).map(role => role.id);

function utility(state: GameState, phd: boolean): number {
  if (state.phase === "finished" && !["phd", "master", "delay"].includes(state.ending!)) return -1e8;
  const { research, social, favor, money, san } = state.player;
  return (state.degree === "phd" ? (phd ? 1e5 : -1e5) : 0)
    + state.totalResearchScore * 35 + research * 15 + social * 7 + favor * 7
    + Math.min(money, 50) * 1.5 + Math.min(san, 15) * 4 + state.sanCap * 2
    + Math.min(state.advisorProgressState.funding, 100) * .2
    + (state.thesis.review?.passed ? 1000 : 0)
    - Math.max(0, 4 - money) * 50 - Math.max(0, 6 - san) * 30
    + (research < 1 || social < 1 || favor < 1 ? -1000 : 0);
}

// Look through the current event's own scenes, without consuming the real RNG stream.
// Every committed choice still goes through store.dispatch and the real replay checker.
function choiceValue(state: GameState, chainId: string, phd: boolean, depth = 0): number {
  const event = state.eventQueue.find(event => event.chainId === chainId);
  if (!event || depth >= 4 || state.phase !== "playing") return utility(state, phd);
  const choices = event.choices.filter(choice => !choice.disabledReason && !choice.cosmetic && !choice.effects.stayOnEvent);
  return Math.max(...choices.map(choice => choiceValue(dispatchAction(state, "resolve-event", {
    eventId: event.id, eventChoiceId: choice.id,
  }), chainId, phd, depth + 1)), utility(state, phd) - 10000);
}

async function run(roleId: RoleId, withTalents: boolean, phd: boolean) {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  const adapter = createMemoryRunSaveAdapter();
  const account = createDefaultAccountProfile();
  account.roleProgress[roleId] = { ...account.roleProgress[roleId], unlocked: true, level: withTalents ? 10 : 0 };
  saveAccountProfile(account, storage);
  let saves = createRunSaveRepository({ storage, adapter });
  let store = createStore({ storage, saves });
  await store.ready();
  if (withTalents) {
    // A legal 20 point allocation: unlock available branches first, then deepen them.
    if (roleId === "genius") {
      for (const id of ["innate-insight", "idea-insight", "experiment-practice", "writing-mastery", "tireless-scholar", "lasting-work"])
        while (store.upgradeRoleTalent(roleId, id)) { /* Only accepted lobby purchases consume points. */ }
    }
    for (let pass = 0; pass < 12; pass++) for (const node of getDesignedTalentNodes(roleId) ?? []) {
      store.upgradeRoleTalent(roleId, node.id);
    }
  }
  store.dispatch("start-game", { roleId });
  let reloads = 0;
  let rewinds = 0;
  const reloadedMonths = new Set<number>();
  for (let month = 0; month <= 200 && store.getState().phase === "playing"; month++) {
    for (let step = 0; step < 120 && store.getState().eventQueue.length && store.getState().phase === "playing"; step++) {
      const state = store.getState();
      const event = state.eventQueue[0]!;
      const choices = event.choices.filter(choice => !choice.disabledReason && !choice.cosmetic && !choice.effects.stayOnEvent);
      const choice = choices.map(choice => ({ choice, score: choiceValue(dispatchAction(state, "resolve-event", {
        eventId: event.id, eventChoiceId: choice.id,
      }), event.chainId, phd) })).sort((a, b) => b.score - a.score)[0]?.choice;
      expect(choice, `${roleId}: no available choice for ${event.id}`).toBeDefined();
      store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: choice!.id });
    }
    if (store.getState().phase !== "playing") break;
    const state = store.getState();
    expect(state.eventQueue).toHaveLength(0);
    if (state.totalMonths > 0) {
      // Buy recovery before spending on equipment; never grant resources directly.
      if (state.player.money >= 10) store.dispatch("buy-shop-item", { shopItemId: "chair" });
      if (store.getState().player.money >= 18) store.dispatch("upgrade-shop-item", { shopUpgradeId: "chair-advanced" });
      if (store.getState().player.money >= 30) store.dispatch("buy-shop-item", { shopItemId: "gpu_buy" });
      if (store.getState().player.money >= 20) store.dispatch("buy-shop-item", { shopItemId: "down_jacket" });
      const thesisSeason = state.year === (state.degree === "phd" ? 6 : 3) && state.month <= 7;
      if (!thesisSeason && store.getState().player.san >= 8 && store.getState().advisorProgressState.funding < 25)
        store.dispatch("advisor-project", { projectType: "horizontal" });
      if (thesisSeason) {
        if (store.getState().player.money >= 10) store.dispatch("buy-coffee-machine");
        if (store.getState().player.san < 15 && store.getState().player.money >= 4) store.dispatch("buy-coffee");
        store.dispatch("rest");
      }
      // Thesis advancement has its own SAN costs, including illness modifiers.
      for (const [index, point] of [...store.getState().thesis.researchPoints.entries()].sort((a, b) => a[1].score - b[1].score)) {
        if (point.score < (state.degree === "phd" ? 130 : 75)
          && store.getState().player.san >= getThesisAdvanceSanCost(store.getState()) + 1) {
          store.dispatch("advance-thesis-point", { thesisPointIndex: index });
        }
      }
      if (!thesisSeason && store.getState().player.money >= 8)
        store.dispatch("buy-ai-month", { aiSlotId: "gpt" });
      for (let action = 0; action < 5; action++) {
        if (thesisSeason) break;
        const current = store.getState();
        if (current.player.money < 4 && current.player.san >= 8) { store.dispatch("part-time-work"); break; }
        if (current.player.san < 10) { store.dispatch("rest"); break; }
        const draft = current.papers.find(paper => paper.status === "draft");
        if (!draft) {
          for (let paperSlotIndex = 0; paperSlotIndex < getAvailablePaperSlotCount(current); paperSlotIndex++) {
            store.dispatch("create-paper", { paperSlotIndex });
            if (store.getState().papers.some(paper => paper.status === "draft")) break;
          }
        }
        const paper = store.getState().papers.find(paper => paper.status === "draft");
        if (!paper) { store.dispatch("read-paper"); break; }
        const direction = store.getState().externalPublications.find(item => item.status === "published" && !item.nonFirstAuthor)?.topicId;
        for (let reroll = 0; reroll < 30 && direction && store.getState().papers.find(item => item.id === paper.id)?.topicId !== direction
          && paper.idea + paper.experiment + paper.writing === 0; reroll++) {
          store.dispatch("reroll-paper-topic", { paperId: paper.id });
        }
        store.dispatch("select-paper", { paperId: paper.id });
        const paperActionType = [...(["idea", "experiment", "writing"] as const)]
          .sort((a, b) => paper[a] - paper[b])[0]!;
        store.dispatch("research-paper", { paperId: paper.id, paperActionType });
        const after = store.getState().papers.find(item => item.id === paper.id)!;
        if (after.idea + after.experiment + after.writing >= 25) {
          store.dispatch("submit-paper", { paperId: paper.id, paperTarget: "C" });
        }
        if (store.getState().actionState.used >= store.getState().actionState.limit
          && store.getState().actionState.aiResearchBonusUsed) break;
      }
    }
    if (store.getState().player.san < 5 && store.getState().player.money >= 4) store.dispatch("buy-coffee");
    store.dispatch("next-month");
    expect(store.getReplayStatus().failed, `${roleId}: replay failed at month ${month}`).toBeUndefined();
    if (store.getState().totalMonths > 0 && store.getState().totalMonths % 12 === 0
      && !reloadedMonths.has(store.getState().totalMonths) && store.getState().phase === "playing") {
      reloadedMonths.add(store.getState().totalMonths);
      const point = saves.get(roleId)!.months.find(save => save.totalMonths === store.getState().totalMonths)!;
      const before = structuredClone(point.state);
      const beforeCount = point.replayIndex!;
      store.recordHelpPageRead("release-check", ["release-check"]);
      expect(store.loadRunSave(point.id)).toBe(true);
      expect(store.getState()).toEqual(before);
      expect(store.getReplayStatus().actionCount).toBe(beforeCount);
      rewinds++;
      await store.flushSaves();
      saves = createRunSaveRepository({ storage, adapter });
      store = createStore({ storage, saves });
      await store.ready(); store.dispatch("start-game", { roleId });
      expect(store.getState()).toEqual(before);
      expect(store.isCurrentRunDisqualified()).toBe(false);
      reloads++;
    }
  }
  expect(store.getState().phase).toBe("finished");
  expect(store.isCurrentRunDisqualified()).toBe(false);
  const ended = store.getState();
  if (roleId === "genius" && withTalents) {
    mkdirSync("artifacts/release-lifecycle", { recursive: true });
    writeFileSync("artifacts/release-lifecycle/representative-save.json", JSON.stringify(saves.get(roleId)));
  }
  const achievements = [...ended.runAchievementIds ?? []];
  const runId = store.getCurrentRunId();
  expect(store.getLobbyState().lastRunExperience).toBeUndefined();
  const summary = { roleId, withTalents, requestedDegree: phd ? "phd" : "master", months: ended.totalMonths,
    ending: ended.ending, degree: ended.degree, researchScore: ended.totalResearchScore,
    attributes: ended.player, citations: ended.totalCitations, actions: store.getReplayStatus().actionCount,
    papers: ended.papers.map(paper => ({ status: paper.status, idea: paper.idea, experiment: paper.experiment, writing: paper.writing })),
    achievements: achievements.length, reloads, rewinds, award: store.getEndingExperienceAward() };
  store.dispatch("restart-game");
  expect(store.getCurrentRunId()).not.toBe(runId);
  expect(store.getFinalizedOutbox()).toHaveLength(1);
  expect(store.getLobbyState().lastRunExperience).toBeDefined();
  const credited = structuredClone(store.getLobbyState());
  store.dispatch("reset-game");
  store.dispatch("start-game", { roleId });
  expect(store.getFinalizedOutbox()).toHaveLength(1);
  expect(store.getLobbyState().roleProgress[roleId].exp).toBe(credited.roleProgress[roleId].exp);
  await store.flushSaves();
  return summary;
}

describe("release acceptance with legal complete careers", () => {
  it.each(roles.flatMap(roleId => [false, true].map(withTalents => ({ roleId, withTalents }))))(
    "$roleId talent allocation=$withTalents survives natural lifecycle checks", async ({ roleId, withTalents }) => {
      // Stub the entropy source, since withGameRandom calls its module-local factory.
      vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        if (array) new DataView(array.buffer, array.byteOffset, array.byteLength).setUint32(0, 713832, true);
        return array;
      });
      const summary = await run(roleId, withTalents, withTalents);
      mkdirSync("artifacts/release-lifecycle", { recursive: true });
      writeFileSync(`artifacts/release-lifecycle/${roleId}-${withTalents ? "talents" : "zero"}.json`, JSON.stringify(summary, null, 2));
    }, 180_000,
  );
});
