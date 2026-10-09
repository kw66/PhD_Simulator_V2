import { createCcigActivityDecisionEvent, createCcigActivityEvent } from "./v2-fixed-events-ccig-activity-events";
import type { GameState, PendingEvent } from "./v2-types";

export function refreshCcigActivityEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.ccigActivityPreview;
  if (!preview || (event.stage !== "act1" && event.stage !== "act2")) return event;

  const eventState = { ...state, year: preview.year, month: preview.month };
  const createEvent = event.stage === "act1" ? createCcigActivityEvent : createCcigActivityDecisionEvent;
  const refreshed = createEvent(eventState, preview.participationMode, preview.attendanceSettlementItems);
  return { ...event, title: refreshed.title, description: refreshed.description, choices: refreshed.choices };
}
