import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getAcademicArchivePreview } from "../src/core/v2-rewinder-academic";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getRewinderPreview } from "../src/core/v2-rewinder";
import { renderDebugPanel } from "../src/app/v2-render-debug-panel";
import { createStore } from "../src/core/v2-store";

describe("rewinder annual debug preview", () => {
  it("limits the shortcut to rewinder runs and explains the replacement scene", () => {
    const normal = createStartedGameState("normal");
    const button = (state: typeof normal) => renderDebugPanel(state, true).match(/<button[^>]*data-event-id="rewinder-year"[^>]*>/)![0];
    expect(button(normal)).toContain("disabled");
    expect(button(normal)).toContain("预览8月结束后的属性定格、成长成果和人际定稿");
    expect(button(createStartedGameState("rewinder"))).not.toContain("disabled");
    const refused = dispatchAction(normal, "debug-trigger-event", { eventId: "rewinder-year" });
    expect(refused.selectedRoleId).toBe("normal");
    expect(refused.player).toEqual(normal.player);
    expect(refused.rewinderState).toBeUndefined();
    expect(refused.eventQueue).toEqual(normal.eventQueue);
  });

  it("keeps an already-running legacy life's annual preview functional", () => {
    const original = createStartedGameState("rewinder");
    const before = structuredClone(original);
    let pending = dispatchAction(original, "debug-trigger-event", { eventId: "rewinder-year" });
    expect(original).toEqual(before);
    expect(pending.totalMonths).toBe(12);
    expect(pending.player.research).toBe(5);
    const preview = getRewinderPreview(pending)!;
    expect(preview.after.growth.attributes.research).toBe(18);
    expect(preview.candidates).toHaveLength(3);
    expect(preview.candidates.every(candidate => !candidate.disabledReason && !candidate.selected)).toBe(true);
    for (const candidate of preview.candidates) pending = dispatchAction(pending, "toggle-rewinder-person", { rewinderPersonKey: candidate.key });
    const event = pending.eventQueue.find(item => item.rewinderPresentation)!;
    const confirmed = dispatchAction(pending, "resolve-event", { eventId: event.id, eventChoiceId: "confirm-rewinder-year" });
    expect(confirmed.totalMonths).toBe(13);
    expect(confirmed.player.research).toBe(18);
    expect(confirmed.fellowProgressState.map(person => person.name)).toEqual(["林清", "周明"]);
    expect(confirmed.loverState.name).toBe("沈知远");
    expect(confirmed.rewinderState?.completedYears).toEqual([1]);
    expect(confirmed.eventHistory.filter(item => item.chainId === event.chainId)).toHaveLength(1);
    expect(dispatchAction(confirmed, "resolve-event", { eventId: event.id, eventChoiceId: "confirm-rewinder-year" })).toEqual(confirmed);
    const repeated = dispatchAction(confirmed, "debug-trigger-event", { eventId: "rewinder-year" });
    expect(repeated.totalMonths).toBe(12);
    expect(getRewinderPreview(repeated)?.candidates.every(candidate => !candidate.selected)).toBe(true);
  });

  it("previews the three-act archive for new academic runs without modifying the source run", () => {
    const original = dispatchAction(createInitialState(), "start-game", { roleId: "rewinder" });
    const before = structuredClone(original);
    const pending = dispatchAction(original, "debug-trigger-event", { eventId: "rewinder-year" });
    expect(original).toEqual(before);
    expect(pending).toMatchObject({ year: 1, month: 12, totalMonths: 12 });
    expect(pending.eventQueue).toEqual([]);
    const preview = getAcademicArchivePreview(pending)!;
    expect(preview.best.attributes.research).toBe(18);
    expect(preview.candidates.filter(person => person.kind === "fellow")).toHaveLength(2);
    expect(preview.canConfirm).toBe(true);
    expect(pending.rewinderState?.academic?.completed).toBeUndefined();
  });

  it("never saves demonstration history into the player's cross-run archive", () => {
    const store = createStore({ storage: null });
    store.getLobbyState().roleProgress.rewinder.unlocked = true;
    const archive = structuredClone(store.getLobbyState().rewinderArchive);
    const academicArchive = structuredClone(store.getLobbyState().rewinderAcademicArchive);
    store.dispatch("start-game", { roleId: "rewinder" });
    store.dispatch("debug-trigger-event", { eventId: "rewinder-year" });
    expect(store.isCurrentRunDisqualified()).toBe(true);
    expect(getAcademicArchivePreview(store.getState())).not.toBeNull();
    store.dispatch("confirm-rewinder-archive");
    expect(store.getState().phase).toBe("setup");
    expect(store.getLobbyState().rewinderArchive).toEqual(archive);
    expect(store.getLobbyState().rewinderAcademicArchive).toEqual(academicArchive);
    expect(store.getFinalizedOutbox()).toEqual([]);
  });
});
