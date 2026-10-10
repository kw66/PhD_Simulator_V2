import { getFellowName } from "./v2-fellow-progression";
import { getLoverName } from "./v2-lover-system";
import type { GameState, PendingEvent } from "./v2-types";

export function getEventNarrativeNames(
  event: Pick<PendingEvent, "description" | "narrativeNames">,
  state?: GameState,
): string[] {
  const names = [
    ...(event.narrativeNames ?? []),
    state?.playerName,
    state?.selectedAdvisorName,
    ...(state?.fellowProgressState.map(getFellowName) ?? []),
    state?.loverState.active ? getLoverName(state.loverState) : undefined,
    state?.conferenceEncounterState.bigBull?.name,
    state?.conferenceEncounterState.scholars?.beautiful?.name,
    state?.conferenceEncounterState.scholars?.smart?.name,
  ];
  return [...new Set(names.filter((name): name is string => Boolean(name?.trim() && event.description.includes(name))))];
}
