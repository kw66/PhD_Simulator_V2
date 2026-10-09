import { createAdvancedConferenceActivityOptions } from "./v2-conference-activity-advanced-options";
import { createBaseConferenceActivityOptions } from "./v2-conference-activity-base-options";
import { createConferenceActivityDecisionEvent, createConferenceActivityEvent, createConferenceActivityResult } from "./v2-conference-activity-events";
import type { GameState, PendingEvent } from "./v2-types";

export function refreshConferenceActivityEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.conferenceActivityPreview;
  if (!preview) return event;
  const current = { ...state, research: state.player.research, social: state.player.social };
  let rollIndex = 0;
  const getRoll = () => preview.rolls[rollIndex++] ?? 0;
  let fresh: PendingEvent;
  if (event.stage === "act1") {
    fresh = createConferenceActivityEvent(preview.context, current, [preview.attendanceSummary], getRoll);
  } else if (event.stage === "act2") {
    fresh = createConferenceActivityDecisionEvent(preview.context, current, preview.attendanceSummary, getRoll);
  } else if (event.stage === "result" && preview.selectedOptionId) {
    const options = [
      ...createBaseConferenceActivityOptions(preview.context, current, () => 0),
      ...(preview.context.grade === "C" ? [] : createAdvancedConferenceActivityOptions(current, () => 0)),
    ];
    const selected = options.find((option) => option.id === preview.selectedOptionId);
    fresh = selected ? createConferenceActivityResult(preview.context, selected, preview.attendanceSummary, preview) : {
      ...event,
      description: "你的近况已经发生变化，原先的活动安排不再适合。翻开议程，你决定重新选一项参加。",
      completionLog: undefined,
      choices: [{
        id: "change-activity",
        label: "重新选择",
        outcome: "返回会场活动选择。",
        effects: { enqueueEvents: [createConferenceActivityDecisionEvent(preview.context, current, preview.attendanceSummary, getRoll)] },
      }],
    };
  } else return event;
  return {
    ...event,
    title: fresh.title,
    description: fresh.description,
    completionLog: fresh.completionLog,
    choices: fresh.choices,
    conferenceActivityPreview: fresh.conferenceActivityPreview,
    deferredStatePatch: undefined,
  };
}
