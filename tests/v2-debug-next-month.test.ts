import { afterEach, describe, expect, it, vi } from "vitest";
import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";

afterEach(() => vi.restoreAllMocks());

describe("debug next month across event stages", () => {
  it.each(DEBUG_EVENT_GROUPS.flatMap((group) => group.buttons))("advances past $label without applying its choices", ({ id }) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const base = createStartedGameState("normal");
    let pending = dispatchAction({ ...base, year: 1, month: 6, totalMonths: 6,
      selectedAdvisorName: "测试导师", sanCap: 100, illnessProbability: 0,
      player: { ...base.player, san: 100, money: 1000, favor: 10, social: 15, research: 15 },
      advisorProgressState: { ...base.advisorProgressState, funding: 10000 },
      eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    }, "debug-trigger-event", { eventId: id });
    const root = pending.eventQueue.find((event) => event.replayContext?.debugEventId === id);
    expect(root).toBeDefined();
    for (let stage = 0; stage < 3; stage += 1) {
      const current = pending.eventQueue.find((event) => event.chainId === root!.chainId);
      if (!current) break;
      const snapshot = structuredClone(pending);
      const advanced = dispatchAction(pending, "force-next-month");
      expect(advanced.totalMonths, `${id}:${current.stage}`).toBe(pending.totalMonths + 1);
      expect(advanced.phase).toBe("playing");
      expect(pending).toEqual(snapshot);
      const choice = current.choices.find((candidate) => !candidate.disabledReason && !candidate.cosmetic);
      if (!choice) break;
      pending = dispatchAction(pending, "resolve-event", { eventId: current.id, eventChoiceId: choice.id });
    }
  });
});
