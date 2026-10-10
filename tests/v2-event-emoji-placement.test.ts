import { afterEach, describe, expect, it, vi } from "vitest";
import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import type { GameState } from "../src/core/v2-types";

const emoji = String.raw`(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*`;
const danglingEmoji = new RegExp(`[。！？…][”’」』]?\\s*(?:${emoji}\\s*)+$`, "u");

afterEach(() => vi.restoreAllMocks());

function inspectScenes(state: GameState, eventId: string, depth = 0): void {
  const queued = state.eventQueue.find((event) => event.id === eventId);
  if (!queued || depth > 2 || state.phase !== "playing") return;
  const event = getResolvableQueuedEvent(state, queued);
  for (const paragraph of event.description.split(/\n+/)) {
    expect(paragraph, `${event.id}: ${paragraph}`).not.toMatch(danglingEmoji);
  }
  for (const choice of event.choices.filter((candidate) => !candidate.disabledReason && !candidate.cosmetic)) {
    const resolved = dispatchAction(state, "resolve-event", { eventId, eventChoiceId: choice.id });
    const next = resolved.eventQueue.find((candidate) => candidate.chainId === event.chainId && candidate.id !== eventId);
    if (next) inspectScenes(resolved, next.id, depth + 1);
  }
}

describe.each([0, 0.5, 0.999])("event emoji placement with roll %s", (roll) => {
  it.each(DEBUG_EVENT_GROUPS.flatMap((group) => group.buttons))("keeps $label emoji within the narrative", ({ id }) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    const base = createStartedGameState("normal");
    const state = dispatchAction({ ...base, year: 2, month: 6, totalMonths: 18,
      selectedAdvisorName: "测试导师", sanCap: 100, illnessProbability: 0,
      player: { ...base.player, san: 100, money: 1000, favor: 15, social: 15, research: 15 },
      advisorProgressState: { ...base.advisorProgressState, funding: 10000 },
      eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    }, "debug-trigger-event", { eventId: id });
    const root = state.eventQueue.find((event) => event.replayContext?.debugEventId === id);
    expect(root).toBeDefined();
    inspectScenes(state, root!.id);
  });
});
