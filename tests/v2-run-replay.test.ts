import { describe, expect, it } from "vitest";
import { createStore } from "../src/core/v2-store";
import { createMemoryRunSaveAdapter, createRunSaveRepository, RUN_SAVE_JOURNAL_PREFIX } from "../src/core/v2-run-saves";
import { saveAccountProfile } from "../src/core/v2-account-storage";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getRoleOptions } from "../src/core/v2-progression";
import { isRoleTalentImplemented } from "../src/core/v2-role-talent-definitions";
import { DATA_EPOCH_STARTED_AT } from "../src/core/v2-data-epoch";
import { saveRoleTalentAllocation } from "../src/core/v2-role-talent-storage";
import { captureReplayRecording, verifyReplayRecording } from "../src/core/v2-local-replay";
import type { RoleId } from "../src/core/v2-types";
import { executeReplayCommand } from "../src/core/v2-run-replay";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";

it("retains old help achievements in old replays but not new help commands on resumed runs", () => {
  const state = createStartedGameState("normal");
  const legacy = executeReplayCommand(state, { kind: "help", id: "a", requiredIds: ["a"] }, "20261027-r58");
  expect(legacy.achievementProgress?.satisfied).toContain("global:help-collector");
  const current = executeReplayCommand(state, { kind: "help", id: "a", requiredIds: ["a"], ruleset: "20261028-r59" }, "20261027-r58");
  expect(current.achievementProgress?.sets["help-pages"]).toEqual(["a"]);
  expect(current.achievementProgress?.satisfied).not.toContain("global:help-collector");
});

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
async function fixture(roleId: RoleId = "normal", seed?: number, allocation?: Record<string, number>) {
  const disk = createMemoryRunSaveAdapter();
  const local = storage();
  const account = createDefaultAccountProfile();
  account.roleProgress[roleId].unlocked = true;
  if (allocation) account.talentAllocation = { [roleId]: allocation };
  saveAccountProfile(account, local);
  if (allocation) saveRoleTalentAllocation(account, local);
  const saves = createRunSaveRepository({ storage: local, adapter: disk });
  const store = createStore({ storage: local, saves });
  await store.ready();
  if (seed !== undefined) store.getState().randomState = { seed, cursor: 0 };
  store.dispatch("start-game", { roleId });
  return { store, saves, disk, local };
}
function enroll(store: ReturnType<typeof createStore>) {
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = store.getState().eventQueue.find(event => event.chainId === "before-grad-school")!;
    store.dispatch("resolve-event", { eventId: event.id, eventChoiceId });
  }
  store.dispatch("next-month");
}

describe("monthly browser operation replay", () => {
  it("saves and replays the gold switch without changing its allocation or disqualifying the run", async () => {
    const allocation = { heiress: 1, "knowledge-is-wealth": 1, "work-pays-off": 1, "gold-power-alpha": 1 };
    const { store, disk, local } = await fixture("rich", 31022, allocation);
    enroll(store);
    store.dispatch("toggle-gold-power");
    expect(store.getState().roleTalents?.goldPowerEnabled).toBe(true);
    await store.flushSaves();
    const saves = createRunSaveRepository({ storage: local, adapter: disk });
    const restored = createStore({ storage: local, saves });
    await restored.ready();
    restored.dispatch("start-game", { roleId: "rich" });
    expect(restored.getState().roleTalents).toMatchObject({ levels: allocation, goldPowerEnabled: true });
    expect(restored.isCurrentRunDisqualified()).toBe(false);
    restored.dispatch("toggle-gold-power");
    expect(restored.getState().roleTalents?.goldPowerEnabled).toBe(false);
    restored.dispatch("quit-game");
    expect(restored.getReplayStatus().failed).toBeUndefined();
    const replay = saves.get("rich")!.replay!;
    const recording = captureReplayRecording(replay, restored.getState());
    const played = await verifyReplayRecording(recording);
    expect(played.roleTalents?.goldPowerEnabled).toBe(false);
    expect(played.player).toEqual(restored.getState().player);
  });
  it("replays a full academic year of ordinary events, shopping, research and reloads", async () => {
    // A reproducible route tests replay fidelity without randomly selecting an
    // event that requires a different strategy from this scripted playthrough.
    const fixtureState = await fixture("normal", 1700000000);
    let { store } = fixtureState;
    const { disk, local } = fixtureState;
    enroll(store);
    let boughtCoffee = false;
    for (let month = 1; month <= 12 && store.getState().phase === "playing"; month++) {
      for (let turn = 0; turn < 50 && store.getState().eventQueue.length; turn++) {
        const event = store.getState().eventQueue[0]!;
        let advanced = false;
        for (const choice of event.choices) {
          store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: choice.id });
          if (!store.getState().eventQueue.some(item => item.id === event.id)) { advanced = true; break; }
        }
        expect(advanced, JSON.stringify({ month, id: event.id, stage: event.stage, title: event.title,
          choices: event.choices.map(choice => choice.id), log: store.getState().log.slice(-3) })).toBe(true);
      }
      if (store.getState().phase !== "playing") break;
      if (month === 1) {
        store.dispatch("create-paper", { paperSlotIndex: 0 });
      }
      // Only one ordinary action is available. Spending it on reading first
      // used to make both research and rest no-ops, eventually exhausting SAN.
      if (month === 1 || month === 7) {
        store.dispatch("research-paper", { paperId: store.getState().papers.find(paper => paper.status === "draft")?.id, paperActionType: "idea" });
      } else if ((month === 3 || month === 9) && store.getState().player.san >= 12) {
        store.dispatch("read-paper");
      } else store.dispatch("rest");
      if (!boughtCoffee && store.getState().player.money >= 1 && store.getState().player.san < store.getState().sanCap) {
        const before = store.getState().coffeeState.coffeePurchaseCountThisMonth;
        store.dispatch("buy-coffee");
        boughtCoffee = store.getState().coffeeState.coffeePurchaseCountThisMonth > before;
      }
      store.dispatch("next-month");
      expect(store.getReplayStatus().failed).toBeUndefined();
      await store.flushSaves();
      store = createStore({ storage: local, saves: createRunSaveRepository({ storage: local, adapter: disk }) });
      await store.ready(); store.dispatch("start-game", { roleId: "normal" });
      expect(store.getReplayStatus().failed).toBeUndefined();
    }
    expect(store.getState().totalMonths).toBeGreaterThanOrEqual(12);
    expect(store.getState().readingState.readCount).toBeGreaterThan(0);
    expect(store.getState().papers[0]?.idea).toBeGreaterThan(0);
    expect(boughtCoffee).toBe(true);
    store.dispatch("quit-game");
    expect(store.isCurrentRunDisqualified()).toBe(false);
  });

  it.each(getRoleOptions().filter(role => isRoleTalentImplemented(role.id)).map(role => role.id))(
    "reproduces %s opening and first month without altering RNG or gameplay", async roleId => {
      const { store, saves } = await fixture(roleId);
      expect(store.getReplayStatus()).toMatchObject({ actionCount: 1, verifiedThrough: 1, failed: undefined });
      enroll(store);
      expect(store.getState().totalMonths).toBe(1);
      expect(store.getReplayStatus()).toMatchObject({ actionCount: 5, verifiedThrough: 5, failed: undefined });
      const point = saves.get(roleId)!.replay!.checkpoints.at(-1)!;
      expect(point.totalMonths).toBe(1);
      expect(store.isCurrentRunDisqualified()).toBe(false);
    });

  it("checks the final partial month and excludes a live state edit from all rewards and final uploads", async () => {
    const { store } = await fixture();
    enroll(store);
    const account = structuredClone(store.getLobbyState());
    store.getState().totalResearchScore = 413;
    store.dispatch("quit-game");
    expect(store.getReplayStatus().failed?.reason).toContain("不一致");
    expect(store.getEndingExperienceAward()).toMatchObject({ gained: 0, disqualifiedByIntegrity: true });
    expect(store.getState().runAchievementIds).toEqual([]);
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal.exp).toBe(account.roleProgress.normal.exp);
    expect(store.getLobbyState().achievementRewardedIds).toEqual(account.achievementRewardedIds);
    expect(store.getFinalizedOutbox()).toEqual([]);
    expect(store.isCurrentRunDisqualified()).toBe(false);
  });

  it("checks pending same-month actions after reload, then allows further actions and a second reload", async () => {
    const { store, saves, disk, local } = await fixture();
    enroll(store);
    store.recordHelpPageRead("research:0", ["research:0", "shop:0"]);
    await store.flushSaves();
    let restored = createStore({ storage: local, saves: createRunSaveRepository({ storage: local, adapter: disk }) });
    await restored.ready(); restored.dispatch("start-game", { roleId: "normal" });
    expect(restored.isCurrentRunDisqualified()).toBe(false);
    expect(restored.getState().achievementProgress?.sets["help-pages"]).toContain("research:0");
    restored.recordHelpPageRead("shop:0", ["research:0", "shop:0"]);
    await restored.flushSaves();
    restored = createStore({ storage: local, saves: createRunSaveRepository({ storage: local, adapter: disk }) });
    await restored.ready(); restored.dispatch("start-game", { roleId: "normal" });
    expect(restored.isCurrentRunDisqualified()).toBe(false);
    expect(restored.getState().achievementProgress?.satisfied).not.toContain("global:help-collector");
    expect(saves.get("normal")!.replay!.checkpoints.at(-1)!.index).toBe(5);
    restored.dispatch("quit-game");
    expect(restored.getEndingExperienceAward()?.disqualifiedByIntegrity).toBeUndefined();
  });

  it("rewinds the command sequence and achievement evidence, retaining a single branch", async () => {
    const { store, saves } = await fixture();
    enroll(store);
    const month = store.getRunSaves().find(save => save.kind === "month" && save.totalMonths === 1)!;
    const before = structuredClone(store.getState());
    store.recordHelpPageRead("a", ["a"]);
    store.dispatch("quit-game");
    const abandonedCount = store.getReplayStatus().actionCount;
    expect(store.loadRunSave(month.id)).toBe(true);
    expect(store.getReplayStatus().actionCount).toBeLessThan(abandonedCount);
    expect(store.getState()).toEqual(before);
    expect(saves.get("normal")!.replay!.commands).toHaveLength(5);
    store.dispatch("quit-game");
    expect(store.getState().runAchievementIds).not.toContain("global:help-collector");
    expect(store.isCurrentRunDisqualified()).toBe(false);
  });

  it("detects a changed saved latest checkpoint and retains the failure after rewinding", async () => {
    const { store, saves } = await fixture();
    enroll(store);
    const month = store.getRunSaves().find(save => save.kind === "month" && save.totalMonths === 1)!;
    const changed = structuredClone(store.getState()); changed.player.money = 999;
    saves.commit(changed, { runId: store.getCurrentRunId()! });
    expect(store.loadRunSave("latest")).toBe(true);
    expect(store.isCurrentRunDisqualified()).toBe(true);
    store.dispatch("select-paper", { paperId: "missing" });
    expect(store.loadRunSave(month.id)).toBe(true);
    expect(store.isCurrentRunDisqualified()).toBe(true);
  });

  it("ignores pre-epoch monthly saves and close-recovery journals", async () => {
    const { store, saves, disk, local } = await fixture();
    const old = structuredClone(saves.get("normal")!);
    old.savedAt = new Date(Date.parse(DATA_EPOCH_STARTED_AT) - 1).toISOString();
    await store.flushSaves();
    await disk.write("normal", old);
    local.setItem(`${RUN_SAVE_JOURNAL_PREFIX}normal`, JSON.stringify({ version: 1, epoch: old.epoch,
      savedAt: old.savedAt, revision: 1, runId: old.runId, debugUsed: false, latest: old.latest, pendingMonths: [], truncateAfter: null }));
    const restored = createStore({ storage: local, saves: createRunSaveRepository({ storage: local, adapter: disk }) });
    await restored.ready();
    expect(restored.hasRoleSave("normal")).toBe(false);
    restored.dispatch("start-game", { roleId: "normal" });
    expect(restored.getCurrentRunId()).not.toBe(old.runId);
    expect(restored.isCurrentRunDisqualified()).toBe(false);
  });
});
