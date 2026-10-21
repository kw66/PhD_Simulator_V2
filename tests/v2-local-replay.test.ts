import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { captureReplayRecording, createReplaySession, parseReplayRecording, serializeReplayRecording, verifyReplayRecording } from "../src/core/v2-local-replay";
import { createRunReplay, executeReplayCommand, replayStateDigest, verifyRunReplay, type ReplayCommand } from "../src/core/v2-run-replay";
import { createMemoryReplayAdapter, createReplayLibrary } from "../src/app/v2-replay-library";
import { getRoleOptions } from "../src/core/v2-progression";
import { captureAcademicYear } from "../src/core/v2-rewinder-academic-record";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { AI_SLOT_IDS } from "../src/core/v2-ai-shop";
import { createGameRandomState } from "../src/core/v2-game-random";
import { createStore } from "../src/core/v2-store";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import type { DispatchPayload, GameActionId, PaperPromotionId } from "../src/core/v2-types";

// Mirrors executeButtonAction's optional fields: real UI commands retain undefined keys.
function browserPayload(values: DispatchPayload = {}): DispatchPayload {
  return { curseDifficulty: undefined, debtRepayment: undefined, roleId: undefined, paperId: undefined,
    paperSlotIndex: undefined, thesisPointIndex: undefined, careerType: undefined, paperActionType: undefined,
    paperTarget: undefined, journalTarget: undefined, promotionId: undefined, eventId: undefined,
    eventChoiceId: undefined, eventHistoryIndex: undefined, relationshipId: undefined, rewinderPersonKey: undefined,
    rewinderStartYear: undefined, rewinderPaperSource: undefined, rewinderCoffeeSource: undefined, projectType: undefined,
    debugStatId: undefined, debugPaperTarget: undefined, debugJournalTarget: undefined, debugPaperAuthorship: undefined,
    debugRelationshipType: undefined, debugEventReplayEnabled: undefined, delta: undefined, dateDisplayMode: undefined,
    blockLinearEvents: undefined, skipBranchEventIntro: undefined, shopItemId: undefined, shopUpgradeId: undefined,
    aiSlotId: undefined, supportItemId: undefined, ...values };
}

function fixture(extraCommands = 0) {
  const initial = createInitialState();
  initial.randomState = { seed: 1700000000, cursor: 0 };
  const payload = { roleId: "normal" as const };
  let state = executeReplayCommand(initial, { kind: "action", actionId: "start-game", payload });
  const replay = createRunReplay(initial, state, payload);
  const states = [initial, state];
  function dispatch(command: ReplayCommand) {
    state = executeReplayCommand(state, command, replay.ruleset);
    replay.commands.push(command); states.push(state);
  }
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    dispatch({ kind: "action", actionId: "resolve-event", payload: { eventId: state.eventQueue.find(event => event.chainId === "before-grad-school")!.id, eventChoiceId } });
  }
  dispatch({ kind: "action", actionId: "next-month", payload: {} });
  for (let index = 0; index < extraCommands; index++) dispatch({ kind: "action", actionId: "rest", payload: {} });
  expect(verifyRunReplay(replay, { state: initial, index: 0 }, state)).not.toBeNull();
  return { replay, state, states, recording: captureReplayRecording(replay, state, { id: "test-replay", now: "2026-10-21T00:00:00Z" }) };
}
describe("local replay simulation", () => {
  it("accepts browser dispatcher optional fields but rejects actual debug payloads", async () => {
    const initial = createInitialState(); initial.randomState = createGameRandomState();
    expect(Number.isInteger(initial.randomState.seed) && initial.randomState.seed >= 0 && initial.randomState.seed <= 0xffffffff).toBe(true);
    initial.log.push({ ...initial.log[0]!, text: "开局前曾尝试选择未解锁角色。" });
    const payload = browserPayload({ roleId: "normal" });
    const state = executeReplayCommand(initial, { kind: "action", actionId: "start-game", payload });
    const replay = createRunReplay(initial, state, payload);
    const recording = captureReplayRecording(replay, state);
    expect(replayStateDigest(await verifyReplayRecording(recording))).toBe(replayStateDigest(state));
    replay.commands[0] = { kind: "action", actionId: "start-game", payload: browserPayload({ roleId: "normal", debugPaperTarget: "A" }) };
    expect(() => captureReplayRecording(replay, state)).toThrow("debugPaperTarget");
  });
  it("accepts every defined AI slot and all promotion types", async () => {
    const { replay, state: initial } = fixture();
    let state = initial;
    const promotions = { arxiv: true, github: true, xiaohongshu: true, quantum: true } satisfies Record<PaperPromotionId, true>;
    const commands: ReplayCommand[] = [
      ...AI_SLOT_IDS.map(aiSlotId => ({ kind: "action" as const, actionId: "toggle-ai-subscription" as const, payload: browserPayload({ aiSlotId }) })),
      ...(Object.keys(promotions) as PaperPromotionId[]).map(promotionId => ({ kind: "action" as const,
        actionId: "promote-paper" as const, payload: browserPayload({ promotionId, paperId: "absent" }) })),
    ];
    for (const command of commands) { state = executeReplayCommand(state, command, replay.ruleset); replay.commands.push(command); }
    const recording = captureReplayRecording(replay, state);
    expect(replayStateDigest(await verifyReplayRecording(recording))).toBe(replayStateDigest(state));
  });
  it.each(getRoleOptions().map(role => role.id))("reproduces %s opening from a canonical initial state", async roleId => {
    const initial = createInitialState(); initial.randomState = { seed: 107, cursor: 0 };
    const payload = { roleId };
    const state = executeReplayCommand(initial, { kind: "action", actionId: "start-game", payload });
    const replay = createRunReplay(initial, state, payload);
    expect(replayStateDigest(await verifyReplayRecording(captureReplayRecording(replay, state)))).toBe(replayStateDigest(state));
  });
  it("preserves a later-year academic opening with its stored permanent progress", async () => {
    const initial = createInitialState(); initial.randomState = { seed: 108, cursor: 0 };
    const source = executeReplayCommand(initial, { kind: "action", actionId: "start-game", payload: { roleId: "rewinder" } });
    source.totalMonths = 12; source.month = 12; source.player.money = 55;
    const record = captureAcademicYear(source);
    const payload = { roleId: "rewinder" as const, rewinderStartYear: 2,
      rewinderAcademicArchive: { version: 1 as const, years: { 1: record } } };
    const state = executeReplayCommand(initial, { kind: "action", actionId: "start-game", payload });
    const replay = createRunReplay(initial, state, payload);
    const result = await verifyReplayRecording(captureReplayRecording(replay, state));
    expect(result.totalMonths).toBe(13);
    expect(result.player.money).toBe(state.player.money);
    expect(result.player.money).toBeGreaterThan(50);
    const session = createReplaySession(captureReplayRecording(replay, state));
    await session.seek(session.getLength());
    expect(session.getMonths()).toEqual([{ index: 1, totalMonths: 13 }]);
  });
  it("retains historical rules when validating legacy rewinder archives", async () => {
    const initial = createInitialState(); initial.randomState = { seed: 109, cursor: 0 };
    const command = { kind: "action" as const, actionId: "start-game" as const,
      ruleset: "20261016-r1" as const, payload: { roleId: "rewinder" as const, rewinderArchive: { years: {} } } };
    const state = executeReplayCommand(initial, command);
    const replay = createRunReplay(initial, state, command.payload);
    replay.ruleset = command.ruleset; replay.commands = [command];
    const recording = withGameplayRuleset(command.ruleset, () => captureReplayRecording(replay, state));
    expect(replayStateDigest(await verifyReplayRecording(recording))).toBe(recording.finalDigest);
  });
  it("round-trips deterministic commands and seeks backward independently of the live run", async () => {
    const { recording, state, states } = fixture();
    const encoded = serializeReplayRecording(recording);
    const imported = parseReplayRecording(encoded);
    const session = createReplaySession(imported);
    expect(replayStateDigest(await session.seek(session.getLength()))).toBe(replayStateDigest(state));
    expect(replayStateDigest(await session.seek(2))).toBe(replayStateDigest(states[2]!));
    const detached = session.getState(); detached.player.san = -999;
    expect(session.getState().player.san).not.toBe(-999);
    expect(replayStateDigest(await session.seek(session.getLength()))).toBe(recording.finalDigest);
    expect(serializeReplayRecording(recording)).toBe(encoded);
  });
  it("rejects changed checkpoints and final results without changing current player position", async () => {
    const { recording } = fixture();
    recording.replay.checkpoints[0]!.digest = "a:b:12";
    const session = createReplaySession(recording);
    await expect(session.seek(session.getLength())).rejects.toThrow("校验失败");
    expect(session.getIndex()).toBe(0);
    const other = fixture().recording; other.finalDigest = "a:b:12";
    await expect(verifyReplayRecording(other)).rejects.toThrow("最终结果");
  });
  it("rebuilds imported initial state and rejects forged gameplay data in it", async () => {
    const { recording } = fixture();
    recording.replay.initial.player.money = 999999;
    const result = await verifyReplayRecording(recording);
    expect(result.player.money).not.toBe(999999);
    expect(replayStateDigest(result)).toBe(recording.finalDigest);
  });
  it("rejects dangerous actions, malformed parameters, huge imports and unsupported versions", () => {
    const { recording } = fixture();
    const bad = structuredClone(recording);
    bad.replay.commands.push({ kind: "action", actionId: "debug-adjust-stat", payload: { delta: 1 } });
    expect(() => parseReplayRecording(JSON.stringify(bad))).toThrow("非游戏操作");
    const params = structuredClone(recording);
    params.replay.commands[0] = { kind: "action", actionId: "start-game", payload: { roleId: "invalid" as "normal" } };
    expect(() => parseReplayRecording(JSON.stringify(params))).toThrow("角色错误");
    expect(() => parseReplayRecording(" ".repeat(20 * 1024 * 1024 + 1))).toThrow("20 MiB");
    expect(() => parseReplayRecording(JSON.stringify({ ...recording, version: 2 }))).toThrow("文件格式");
    expect(() => parseReplayRecording('{"__proto__":{"polluted":true}}')).toThrow("字段错误");
  });
  it("yields long work and cancels superseded seeks without committing stale state", async () => {
    const { recording } = fixture(100);
    let release!: () => void;
    let yielded = 0;
    const session = createReplaySession(recording, { yieldControl: () => { yielded++; return new Promise<void>(resolve => { release = resolve; }); } });
    const first = session.seek(session.getLength());
    expect(yielded).toBeGreaterThan(0);
    await session.seek(1);
    release();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(session.getIndex()).toBe(1);
    session.dispose();
    await expect(session.seek(1)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("supports external cancellation and validates target positions", async () => {
    const session = createReplaySession(fixture().recording);
    const abort = new AbortController(); abort.abort();
    await expect(session.seek(1, { signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
    await expect(session.seek(1.5)).rejects.toThrow(RangeError);
    expect(session.getMonths()).toEqual([]);
  });
  it("discovers actual month starts even when imported records omit checkpoints", async () => {
    const { recording } = fixture(3);
    recording.replay.checkpoints = [];
    const session = createReplaySession(recording);
    await session.seek(session.getLength());
    expect(session.getMonths()).toEqual([{ index: 1, totalMonths: 0 }, { index: 5, totalMonths: 1 }]);
    await session.seek(1);
    expect(session.getMonths()).toHaveLength(2);
  });
});
describe("standalone local replay library", () => {
  it("saves a real store year with browser payloads, then another selected-role run", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const saves = createRunSaveRepository({ storage, adapter: createMemoryRunSaveAdapter() });
    const store = createStore({ storage, saves });
    await store.ready();
    const library = createReplayLibrary({ adapter: createMemoryReplayAdapter() });
    store.setReplayArchiver(async capture => { await library.save(captureReplayRecording(capture.replay, capture.state, { id: capture.id })); });
    const dispatch = (action: GameActionId, payload?: DispatchPayload) => store.dispatch(action, browserPayload(payload));
    store.getState().randomState = { seed: 1700000000, cursor: 0 };
    dispatch("select-role", { roleId: "normal" }); dispatch("start-game", { roleId: "normal" });
    for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
      dispatch("resolve-event", { eventId: store.getState().eventQueue.find(event => event.chainId === "before-grad-school")!.id, eventChoiceId });
    }
    dispatch("next-month");
    for (let month = 1; month <= 12 && store.getState().phase === "playing"; month++) {
      for (let turn = 0; turn < 50 && store.getState().eventQueue.length; turn++) {
        const event = store.getState().eventQueue[0]!;
        for (const choice of event.choices) {
          dispatch("resolve-event", { eventId: event.id, eventChoiceId: choice.id });
          if (!store.getState().eventQueue.some(item => item.id === event.id)) break;
        }
      }
      if (store.getState().phase !== "playing") break;
      if (month === 1) dispatch("create-paper", { paperSlotIndex: 0 });
      if (month === 1 || month === 7) dispatch("research-paper", { paperId: store.getState().papers.find(paper => paper.status === "draft")?.id, paperActionType: "idea" });
      else if ((month === 3 || month === 9) && store.getState().player.san >= 12) dispatch("read-paper");
      else dispatch("rest");
      dispatch("next-month");
    }
    expect(store.getState().totalMonths).toBeGreaterThanOrEqual(12);
    expect(store.getReplayStatus().failed).toBeUndefined();
    await store.saveLocalReplay();
    const first = (await library.list())[0]!;
    expect(first.totalMonths).toBeGreaterThanOrEqual(12);
    expect(replayStateDigest(await verifyReplayRecording((await library.get(first.id))!))).toBe(replayStateDigest(store.getState()));
    dispatch("quit-game"); await store.whenIdle();
    await store.settleAndReturn(true);
    expect(store.getState().phase).toBe("setup");
    dispatch("select-role", { roleId: "normal" }); dispatch("start-game", { roleId: "normal" });
    await store.saveLocalReplay();
    expect(await library.list()).toHaveLength(2);
  });
  it("persists, lists, exports, imports and removes verified recordings", async () => {
    const adapter = createMemoryReplayAdapter();
    const library = createReplayLibrary({ adapter });
    const { recording } = fixture();
    const summary = await library.save(recording);
    expect(summary).toMatchObject({ id: recording.id, roleId: "normal", totalMonths: 1, commandCount: 5 });
    const reloaded = createReplayLibrary({ adapter });
    expect(await reloaded.list()).toEqual([summary]);
    const text = await reloaded.export(recording.id);
    const imported = createReplayLibrary({ adapter: createMemoryReplayAdapter() });
    await imported.import(text);
    expect(await imported.get(recording.id)).toEqual(recording);
    await reloaded.remove(recording.id);
    expect(await library.list()).toEqual([]);
  });
  it("preserves creation date, rejects altered imports and reports storage failures", async () => {
    const adapter = createMemoryReplayAdapter(), library = createReplayLibrary({ adapter });
    const { recording } = fixture();
    await library.save(recording);
    recording.createdAt = "2026-10-22T00:00:00Z"; recording.updatedAt = recording.createdAt;
    const summary = await library.save(recording);
    expect(summary.createdAt).toBe("2026-10-21T00:00:00Z");
    recording.finalDigest = "a:b:12";
    await expect(library.import(JSON.stringify(recording))).rejects.toThrow("最终结果");
    expect((await library.list())).toHaveLength(1);
    const broken = createReplayLibrary({ adapter: { ...adapter, put: async () => { throw new Error("disk full"); } } });
    await expect(broken.save(fixture().recording)).rejects.toThrow("disk full");
  });
});
