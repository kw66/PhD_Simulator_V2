import type { PendingEvent } from "./v2-types";

export function attachFixedTreePreview(event: PendingEvent, context: NonNullable<PendingEvent["fixedTreePreview"]>): PendingEvent {
  return {
    ...event,
    fixedTreePreview: context,
    choices: event.choices.map((choice) => ({
      ...choice,
      effects: {
        ...choice.effects,
        ...(choice.effects.enqueueEvents ? {
          enqueueEvents: choice.effects.enqueueEvents.map((next) => attachFixedTreePreview(next, context)),
        } : {}),
      },
    })),
  };
}
