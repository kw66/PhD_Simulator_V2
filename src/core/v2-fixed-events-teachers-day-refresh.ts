import { createTeachersDayEvent } from "./v2-fixed-events-teachers-day";
import type { GameState, PendingEvent } from "./v2-types";

export function refreshTeachersDayEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.teachersDayPreview;
  if (!preview || event.chainId !== "teachers-day" || (event.stage !== "act1" && event.stage !== "act2")) return event;
  const fresh = createTeachersDayEvent(state, () => 0, preview.giftId);
  let rebuilt = fresh;
  if (event.stage === "act2") rebuilt = fresh.choices[0]?.effects.enqueueEvents?.[0] ?? event;
  const next = {
    ...event,
    title: rebuilt.title,
    description: rebuilt.description,
    completionLog: rebuilt.completionLog,
    choices: rebuilt.choices.map((choice, index) => ({ ...choice, id: event.choices[index]?.id ?? choice.id })),
    teachersDayPreview: preview,
  };
  return next.title === event.title && next.description === event.description
    && JSON.stringify(next.choices) === JSON.stringify(event.choices) ? event : next;
}
